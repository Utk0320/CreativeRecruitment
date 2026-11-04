/**
 * routes/clubMembers.js — Club Membership management (Phase 2)
 *
 * All endpoints are scoped to /api/clubs/:clubId/members
 *
 * Lead:  add/remove members, transfer lead, set permission overrides
 * Admin: same + can add/remove any coordinator
 * Member: read-only
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { z } = require('zod');
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can, hasConflict } = require('../utils/can');

const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );

const get = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );

router.use(authenticateToken);

// ── resolve & verify club exists ──────────────────────────────────────────────
const loadClub = async (req, res, next) => {
    const club = await get('SELECT * FROM clubs WHERE id = ? AND deleted_at IS NULL', [req.params.clubId]);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    req.club = club;
    next();
};

// ── GET /api/clubs/:clubId/members ────────────────────────────────────────────
router.get('/', loadClub, async (req, res) => {
    // Any authenticated user can list members of a club they belong to; admin can see all.
    const allowed = req.user.role === 'admin' ||
        await can(db, req.user, 'club.view', { clubId: Number(req.params.clubId) });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to view this club' });

    db.all(
        `SELECT cm.id, cm.user_id, cm.club_id, cm.role, cm.title, cm.status,
                cm.joined_season_id, cm.is_public, cm.created_at, cm.updated_at,
                u.name, u.email, u.department, u.year, u.is_active, u.role AS user_role,
                s.name AS joined_season_name
         FROM club_members cm
         JOIN users u ON u.id = cm.user_id
         LEFT JOIN recruitment_seasons s ON s.id = cm.joined_season_id
         WHERE cm.club_id = ?
         ORDER BY CASE cm.role WHEN 'lead' THEN 1 ELSE 2 END, u.name ASC`,
        [req.params.clubId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load members' });
            res.json(rows);
        }
    );
});

// ── GET /api/clubs/:clubId/roster (public/student accessible member directory) ──
router.get('/roster', loadClub, async (req, res) => {
    const isPrivileged = req.user.role === 'admin' ||
        await can(db, req.user, 'club.view', { clubId: Number(req.params.clubId) });

    const statusFilter = req.query.status && ['active', 'alumni'].includes(req.query.status)
        ? req.query.status
        : 'active';

    const conditions = ['cm.club_id = ?', 'cm.status = ?'];
    const params = [req.params.clubId, statusFilter];

    if (!isPrivileged) {
        conditions.push('cm.is_public = 1');
    }

    db.all(
        `SELECT cm.id, cm.user_id, cm.club_id, cm.role, cm.title, cm.status,
                cm.joined_season_id, cm.is_public, cm.created_at,
                u.name, u.department, u.year, u.bio, u.skills, u.linkedin_url, u.github_url,
                s.name AS joined_season_name
         FROM club_members cm
         JOIN users u ON u.id = cm.user_id
         LEFT JOIN recruitment_seasons s ON s.id = cm.joined_season_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY CASE cm.role WHEN 'lead' THEN 1 ELSE 2 END, u.name ASC`,
        params,
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load club roster' });
            res.json(rows);
        }
    );
});

// ── POST /api/clubs/:clubId/members  (add a member) ──────────────────────────
router.post('/', loadClub, withTransaction(db, 'club.member.added', 'club_member'), async (req, res) => {
    const allowed = await can(db, req.user, 'club.manage_members', { clubId: Number(req.params.clubId) });
    if (!allowed) return res.status(403).json({ error: 'You cannot manage members of this club' });

    const parsed = z.object({
        user_id:          z.coerce.number().int().positive(),
        role:             z.enum(['lead', 'member']).default('member'),
        title:            z.string().trim().max(100).optional(),
        joined_season_id: z.coerce.number().int().positive().nullable().optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid user_id and role' });

    const { user_id, role, title, joined_season_id } = parsed.data;

    // Only leads can set another lead; prevent demotion of self to member without a new lead
    if (role === 'lead' && req.user.role !== 'admin') {
        const self = await get(
            'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
            [req.params.clubId, req.user.id]
        );
        if (!self || self.role !== 'lead') {
            return res.status(403).json({ error: 'Only the current lead or admin can assign a lead role' });
        }
    }

    // Target must be an active user (lead requires coordinator)
    const target = await get("SELECT id, role FROM users WHERE id = ? AND is_active = 1", [user_id]);
    if (!target) return res.status(400).json({ error: 'User not found or inactive' });
    if (role === 'lead' && target.role !== 'coordinator' && target.role !== 'admin') {
        return res.status(400).json({ error: 'Only coordinators can be assigned as club lead' });
    }

    try {
        const memberTitle = title || (role === 'lead' ? 'Club Lead' : 'Member');
        const result = await run(
            `INSERT INTO club_members (club_id, user_id, role, title, joined_season_id, added_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(club_id, user_id) DO UPDATE SET
                role = excluded.role,
                title = COALESCE(excluded.title, club_members.title),
                joined_season_id = COALESCE(excluded.joined_season_id, club_members.joined_season_id),
                status = 'active',
                updated_at = CURRENT_TIMESTAMP`,
            [req.params.clubId, user_id, role, memberTitle, joined_season_id || null, req.user.id]
        );
        req.activityEntityId = result.lastID || null;
        req.activityClubId = Number(req.params.clubId);
        res.status(201).json({ message: 'Member added', club_id: Number(req.params.clubId), user_id, role });
    } catch (err) {
        res.status(500).json({ error: 'Unable to add member' });
    }
});

// ── DELETE /api/clubs/:clubId/members/:userId ──────────────────────────────────
router.delete('/:userId', loadClub, withTransaction(db, 'club.member.removed', 'club_member'), async (req, res) => {
    const allowed = await can(db, req.user, 'club.manage_members', { clubId: Number(req.params.clubId) });
    if (!allowed) return res.status(403).json({ error: 'You cannot manage members of this club' });

    const targetId = Number(req.params.userId);

    // Guard: a lead cannot remove themselves if they are the only lead and there are other members
    const membership = await get(
        'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
        [req.params.clubId, targetId]
    );
    if (!membership) return res.status(404).json({ error: 'Member not found in this club' });

    if (membership.role === 'lead') {
        const otherLeads = await get(
            'SELECT COUNT(*) AS cnt FROM club_members WHERE club_id = ? AND role = ? AND user_id != ?',
            [req.params.clubId, 'lead', targetId]
        );
        if (otherLeads.cnt === 0) {
            const memberCount = await get(
                'SELECT COUNT(*) AS cnt FROM club_members WHERE club_id = ?',
                [req.params.clubId]
            );
            if (memberCount.cnt > 1) {
                return res.status(409).json({ error: 'Transfer lead role before removing the only lead' });
            }
        }
    }

    try {
        await run('DELETE FROM club_members WHERE club_id = ? AND user_id = ?', [req.params.clubId, targetId]);
        req.activityEntityId = targetId;
        req.activityClubId = Number(req.params.clubId);
        res.json({ message: 'Member removed' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to remove member' });
    }
});

// ── POST /api/clubs/:clubId/members/transfer-lead ─────────────────────────────
router.post('/transfer-lead', loadClub, withTransaction(db, 'club.lead.transferred', 'club_member'), async (req, res) => {
    const parsed = z.object({ new_lead_user_id: z.coerce.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide new_lead_user_id' });

    const { new_lead_user_id } = parsed.data;
    const clubId = Number(req.params.clubId);

    // Only current lead or admin may transfer
    if (req.user.role !== 'admin') {
        const self = await get('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [clubId, req.user.id]);
        if (!self || self.role !== 'lead') {
            return res.status(403).json({ error: 'Only the current lead or admin can transfer the lead role' });
        }
    }

    // New lead must be an existing member
    const newLead = await get(
        'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
        [clubId, new_lead_user_id]
    );
    if (!newLead) return res.status(400).json({ error: 'New lead must already be a member of this club' });

    try {
        // Demote current leads to member, promote new lead
        await run("UPDATE club_members SET role = 'member' WHERE club_id = ? AND role = 'lead'", [clubId]);
        await run("UPDATE club_members SET role = 'lead' WHERE club_id = ? AND user_id = ?", [clubId, new_lead_user_id]);
        // Also update clubs.coordinator_id for display compat
        await run("UPDATE clubs SET coordinator_id = ? WHERE id = ?", [new_lead_user_id, clubId]);
        req.activityEntityId = new_lead_user_id;
        req.activityClubId = clubId;
        res.json({ message: 'Lead transferred' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to transfer lead' });
    }
});

// ── POST /api/clubs/:clubId/members/:userId/permissions ───────────────────────
// Admin-only: grant or revoke a specific permission for a member
router.post('/:userId/permissions', loadClub, withTransaction(db, 'club.member.permission.set', 'club_member'), async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can set permission overrides' });

    const parsed = z.object({
        permission: z.string().min(1).max(80),
        granted:    z.boolean(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide permission and granted' });

    const { permission, granted } = parsed.data;
    const targetId = Number(req.params.userId);
    const clubId = Number(req.params.clubId);

    try {
        await run(
            `INSERT INTO club_permission_overrides (club_id, user_id, permission, granted, set_by)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(club_id, user_id, permission) DO UPDATE SET granted = excluded.granted, set_by = excluded.set_by`,
            [clubId, targetId, permission, granted ? 1 : 0, req.user.id]
        );
        req.activityEntityId = targetId;
        req.activityClubId = clubId;
        res.json({ message: 'Permission updated' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update permission' });
    }
});

// ── POST /api/clubs/:clubId/conflicts ─────────────────────────────────────────
// Coordinator declares a conflict with an applicant
router.post('/:userId/conflicts', loadClub, withTransaction(db, 'conflict.declared', 'conflict_declaration'), async (req, res) => {
    if (req.user.role !== 'coordinator') return res.status(403).json({ error: 'Only coordinators can declare conflicts' });

    const applicantId = Number(req.params.userId);
    const parsed = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    try {
        await run(
            `INSERT INTO conflict_declarations (coordinator_id, applicant_id, reason)
             VALUES (?, ?, ?)
             ON CONFLICT(coordinator_id, applicant_id) DO UPDATE SET reason = excluded.reason`,
            [req.user.id, applicantId, parsed.data.reason || null]
        );
        req.activityEntityId = applicantId;
        req.activityClubId = Number(req.params.clubId);
        res.status(201).json({ message: 'Conflict declared' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to declare conflict' });
    }
});

// ── GET /api/clubs/:clubId/conflicts  (admin or lead) ─────────────────────────
router.get('/conflicts', loadClub, async (req, res) => {
    const allowed = req.user.role === 'admin' ||
        await can(db, req.user, 'club.manage_members', { clubId: Number(req.params.clubId) });
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    db.all(
        `SELECT cd.*, u.name AS coordinator_name, a.name AS applicant_name
         FROM conflict_declarations cd
         JOIN users u ON u.id = cd.coordinator_id
         JOIN users a ON a.id = cd.applicant_id
         JOIN club_members cm ON cm.club_id = ? AND cm.user_id = cd.coordinator_id
         ORDER BY cd.declared_at DESC`,
        [req.params.clubId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load conflicts' });
            res.json(rows);
        }
    );
});

// ── PATCH /api/clubs/:clubId/members/my/visibility ────────────────────────────
// Member toggles their own public roster visibility
router.patch('/my/visibility', loadClub, withTransaction(db, 'club.member.visibility.updated', 'club_member'), async (req, res) => {
    const parsed = z.object({ is_public: z.coerce.number().int().min(0).max(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid is_public (0 or 1)' });

    try {
        const result = await run(
            `UPDATE club_members SET is_public = ?, updated_at = CURRENT_TIMESTAMP
             WHERE club_id = ? AND user_id = ?`,
            [parsed.data.is_public, req.params.clubId, req.user.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'You are not a member of this club' });
        req.activityEntityId = req.user.id;
        req.activityClubId = Number(req.params.clubId);
        res.json({ message: 'Visibility preference updated', is_public: parsed.data.is_public });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update visibility' });
    }
});

// ── PATCH /api/clubs/:clubId/members/:userId ──────────────────────────────────
// Lead or Admin updates member role, title, status, or joined_season_id
router.patch('/:userId', loadClub, withTransaction(db, 'club.member.updated', 'club_member'), async (req, res) => {
    const allowed = await can(db, req.user, 'club.manage_members', { clubId: Number(req.params.clubId) });
    if (!allowed) return res.status(403).json({ error: 'You cannot manage members of this club' });

    const targetId = Number(req.params.userId);
    const parsed = z.object({
        role:             z.enum(['lead', 'member']).optional(),
        title:            z.string().trim().max(100).optional(),
        status:           z.enum(['active', 'alumni', 'resigned']).optional(),
        joined_season_id: z.coerce.number().int().positive().nullable().optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload' });

    const existing = await get('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [req.params.clubId, targetId]);
    if (!existing) return res.status(404).json({ error: 'Member not found in this club' });

    const updates = [];
    const params = [];

    if (parsed.data.role !== undefined) {
        if (parsed.data.role === 'lead' && req.user.role !== 'admin') {
            const self = await get('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [req.params.clubId, req.user.id]);
            if (!self || self.role !== 'lead') return res.status(403).json({ error: 'Only current lead or admin can assign lead role' });
        }
        updates.push('role = ?'); params.push(parsed.data.role);
    }
    if (parsed.data.title !== undefined) { updates.push('title = ?'); params.push(parsed.data.title); }
    if (parsed.data.status !== undefined) { updates.push('status = ?'); params.push(parsed.data.status); }
    if (parsed.data.joined_season_id !== undefined) { updates.push('joined_season_id = ?'); params.push(parsed.data.joined_season_id); }

    if (updates.length === 0) return res.json({ message: 'No changes provided' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.clubId, targetId);

    try {
        await run(`UPDATE club_members SET ${updates.join(', ')} WHERE club_id = ? AND user_id = ?`, params);
        req.activityEntityId = targetId;
        req.activityClubId = Number(req.params.clubId);
        res.json({ message: 'Member updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update member' });
    }
});

module.exports = router;

