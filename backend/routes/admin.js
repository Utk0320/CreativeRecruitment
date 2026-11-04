const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { isOfficialCollegeEmail } = require('../utils/emailValidation');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { createEmailAdapter } = require('../services/email/adapter');

const router = express.Router();
const inviteSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email(),
    department: z.string().trim().min(1).max(120),
    year: z.coerce.number().int().min(1).max(4),
    phone: z.string().max(40).optional()
});
const clubSchema = z.object({
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().max(80).optional(),
    description: z.string().trim().max(4000).optional(),
    logo_url: z.string().trim().max(2048).optional(),
    coordinator_id: z.union([z.coerce.number().int().positive(), z.null()]).optional()
});
const activityRateLimitFields = {
    name: 'name',
    email: 'email',
    role: 'role',
    created: 'created_at'
};

router.use(authenticateToken, requireRole('admin'));

router.get('/coordinators', (req, res) => {
    const options = parseListOptions(req.query, activityRateLimitFields, 'name');
    const conditions = ["role = 'coordinator'"];
    const params = [];
    if (options.search) {
        conditions.push('(name LIKE ? OR email LIKE ? OR department LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }
    if (['0', '1'].includes(req.query.active)) {
        conditions.push('is_active = ?');
        params.push(Number(req.query.active));
    }
    const where = conditions.join(' AND ');
    db.get(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load coordinators' });
        db.all(`SELECT id, name, email, department, year, phone, is_active, must_change_password, created_at
            FROM users WHERE ${where} ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load coordinators' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

router.get('/clubs', (req, res) => {
    const options = parseListOptions(req.query, { name: 'c.name', category: 'c.category' }, 'name');
    const conditions = ['c.deleted_at IS NULL'];
    const params = [];
    if (options.search) {
        conditions.push('(c.name LIKE ? OR c.description LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    const from = 'FROM clubs c LEFT JOIN users u ON u.id = c.coordinator_id';
    db.get(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load clubs' });
        db.all(`SELECT c.*, u.name AS coordinator_name, u.email AS coordinator_email ${from}
            WHERE ${where} ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load clubs' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

router.post('/clubs', withTransaction(db, 'club.admin.created', 'club'), (req, res) => {
    const parsed = clubSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid club details' });
    const details = parsed.data;
    const saveClub = (coordinatorId) => db.run(
        `INSERT INTO clubs (name, category, description, logo_url, coordinator_id) VALUES (?, ?, ?, ?, ?)`,
        [details.name, details.category || null, details.description || null, details.logo_url || null, coordinatorId || null],
        function(err) {
            if (err) return res.status(500).json({ error: 'Unable to create club' });
            const clubId = this.lastID;
            req.activityEntityId = clubId;
            req.activityClubId = clubId;
            if (!coordinatorId) return res.status(201).json({ id: clubId });
            // Make the assigned coordinator a lead in club_members
            db.run('INSERT OR IGNORE INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, "lead", ?)',
                [clubId, coordinatorId, req.user.id], memberErr => {
                    if (memberErr) return res.status(500).json({ error: 'Unable to set club lead' });
                    res.status(201).json({ id: clubId });
                });
        }
    );
    if (!details.coordinator_id) return saveClub(null);
    db.get("SELECT id FROM users WHERE id = ? AND role = 'coordinator' AND is_active = 1", [details.coordinator_id], (err, coordinator) => {
        if (err) return res.status(500).json({ error: 'Unable to validate coordinator' });
        if (!coordinator) return res.status(400).json({ error: 'Choose an active coordinator' });
        saveClub(details.coordinator_id);
    });
});

router.put('/clubs/:id', withTransaction(db, 'club.admin.updated', 'club'), (req, res) => {
    const parsed = clubSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid club details' });
    const details = parsed.data;
    const clubId = Number(req.params.id);
    const updateClub = (coordinatorId) => db.run(
        `UPDATE clubs SET name = ?, category = ?, description = ?, logo_url = ?, coordinator_id = ? WHERE id = ? AND deleted_at IS NULL`,
        [details.name, details.category || null, details.description || null, details.logo_url || null, coordinatorId || null, clubId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Unable to update club' });
            if (this.changes === 0) return res.status(404).json({ error: 'Club not found' });
            req.activityEntityId = clubId;
            req.activityClubId = clubId;
            if (!coordinatorId) return res.json({ message: 'Club updated' });
            // Upsert club lead in club_members (demote existing leads, promote new one)
            // Use ON CONFLICT DO UPDATE to preserve created_at and added_by
            db.run("UPDATE club_members SET role = 'member' WHERE club_id = ? AND role = 'lead'", [clubId], () => {
                db.run(`INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'lead', ?)
                    ON CONFLICT(club_id, user_id) DO UPDATE SET role = 'lead'`,
                    [clubId, coordinatorId, req.user.id], memberErr => {
                        if (memberErr) return res.status(500).json({ error: 'Unable to set club lead' });
                        res.json({ message: 'Club updated' });
                    });
            });
        }
    );
    if (!details.coordinator_id) return updateClub(null);
    db.get("SELECT id FROM users WHERE id = ? AND role = 'coordinator' AND is_active = 1", [details.coordinator_id], (err, coordinator) => {
        if (err) return res.status(500).json({ error: 'Unable to validate coordinator' });
        if (!coordinator) return res.status(400).json({ error: 'Choose an active coordinator' });
        updateClub(details.coordinator_id);
    });
});

router.delete('/clubs/:id', withTransaction(db, 'club.admin.archived', 'club'), (req, res) => {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirm club archive to continue' });
    db.run('UPDATE clubs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Unable to archive club' });
        if (this.changes === 0) return res.status(404).json({ error: 'Club not found' });
        const clubId = Number(req.params.id);
        req.activityEntityId = clubId;
        req.activityClubId = clubId;
        db.run('UPDATE recruitment_drives SET deleted_at = CURRENT_TIMESTAMP WHERE club_id = ? AND deleted_at IS NULL', [clubId], driveError => {
            if (driveError) return res.status(500).json({ error: 'Unable to archive club drives' });
            res.json({ message: 'Club archived' });
        });
    });
});

router.post('/coordinators/invites', withTransaction(db, 'coordinator.invite.created', 'coordinator_invite'), async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success || !isOfficialCollegeEmail(parsed.data?.email, 'coordinator')) {
        return res.status(400).json({ error: 'Provide valid coordinator details and an official college email.' });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    db.get('SELECT id FROM users WHERE email = ?', [email], (userErr, user) => {
        if (userErr) return res.status(500).json({ error: 'Unable to create invite' });
        if (user) return res.status(409).json({ error: 'An account already exists for this email' });
        db.run(`INSERT INTO coordinator_invites
            (email, name, department, year, phone, token_hash, expires_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, parsed.data.name, parsed.data.department, parsed.data.year, parsed.data.phone || null, tokenHash, expiresAt, req.user.id],
        async function(insertError) {
            if (insertError) return res.status(500).json({ error: 'Unable to create invite' });
            req.activityEntityId = this.lastID;
            req.activityActorId = req.user.id;
            try {
                await createEmailAdapter().sendCoordinatorInvite({ email, token });
            } catch {
                return res.status(503).json({ error: 'Unable to send coordinator invite' });
            }
            const inviteUrl = new URL('/accept-invite', process.env.FRONTEND_URL || 'http://localhost:5173');
            inviteUrl.searchParams.set('token', token);
            res.status(201).json({ id: this.lastID, expires_at: expiresAt, ...(process.env.NODE_ENV === 'production' ? {} : { invite_url: inviteUrl.href }) });
        });
    });
});

router.get('/users', (req, res) => {
    const options = parseListOptions(req.query, activityRateLimitFields, 'name');
    const conditions = ['1 = 1'];
    const params = [];
    if (['admin', 'coordinator', 'student'].includes(req.query.role)) {
        conditions.push('role = ?');
        params.push(req.query.role);
    }
    if (options.search) {
        conditions.push('(name LIKE ? OR email LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    db.get(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load users' });
        db.all(`SELECT id, name, email, role, department, year, is_active, must_change_password, created_at, prn, approval_status
            FROM users WHERE ${where} ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load users' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

router.patch('/users/:id/active', withTransaction(db, 'user.active.updated', 'user'), (req, res) => {
    const parsed = z.object({ is_active: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide an active boolean' });
    if (Number(req.params.id) === Number(req.user.id) && !parsed.data.is_active) {
        return res.status(400).json({ error: 'You cannot deactivate your own admin account' });
    }
    db.run('UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ?',
        [Number(parsed.data.is_active), req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Unable to update account state' });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
            req.activityEntityId = Number(req.params.id);
            req.activityActorId = req.user.id;
            res.json({ message: parsed.data.is_active ? 'User activated' : 'User deactivated' });
        });
});

router.post('/users/:id/force-logout', withTransaction(db, 'user.sessions.revoked', 'user'), (req, res) => {
    db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Unable to revoke sessions' });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        req.activityEntityId = Number(req.params.id);
        req.activityActorId = req.user.id;
        res.json({ message: 'User sessions revoked' });
    });
});

router.post('/users/:id/password-reset', withTransaction(db, 'user.password.reset.requested', 'user'), (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.get('SELECT id, email FROM users WHERE id = ?', [req.params.id], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Unable to create password reset' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        db.run(`UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?,
            token_version = token_version + 1 WHERE id = ?`, [tokenHash, expiresAt, user.id], async updateError => {
            if (updateError) return res.status(500).json({ error: 'Unable to create password reset' });
            req.activityEntityId = user.id;
            req.activityActorId = req.user.id;
            try {
                await createEmailAdapter().sendPasswordReset({ email: user.email, token });
            } catch {
                return res.status(503).json({ error: 'Unable to send password reset email' });
            }
            res.json({ message: 'Password reset link sent', expires_at: expiresAt });
        });
    });
});

/**
 * GET /api/admin/clubs/rollover-check
 * Returns clubs that have no active lead (for year-end handoff audit).
 */
router.get('/clubs/rollover-check', (req, res) => {
    db.all(`
        SELECT c.id, c.name, c.category, c.created_at,
               COUNT(DISTINCT cm.id) AS member_count,
               COUNT(DISTINCT CASE WHEN cm.role = 'lead' AND u.is_active = 1 THEN cm.id END) AS active_lead_count
        FROM clubs c
        LEFT JOIN club_members cm ON cm.club_id = c.id
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE c.deleted_at IS NULL
        GROUP BY c.id
        HAVING active_lead_count = 0
        ORDER BY c.name
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Unable to run rollover check' });
        res.json({ clubs_without_active_lead: rows, count: rows.length });
    });
});

/**
 * POST /api/admin/clubs/:clubId/reassign
 * Admin reassigns all open application reviews from one coordinator to another
 * (handoff / departure scenario). Body: { from_user_id, to_user_id }
 * The target must already be a club member.
 */
router.post('/clubs/:clubId/reassign', withTransaction(db, 'club.assignments.reassigned', 'club'), async (req, res) => {
    const parsed = require('zod').z.object({
        from_user_id: require('zod').z.coerce.number().int().positive(),
        to_user_id:   require('zod').z.coerce.number().int().positive(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide from_user_id and to_user_id' });

    const { from_user_id, to_user_id } = parsed.data;
    const clubId = Number(req.params.clubId);

    // Verify target is an active member of this club
    const target = await new Promise((resolve, reject) =>
        db.get('SELECT cm.id FROM club_members cm JOIN users u ON u.id = cm.user_id WHERE cm.club_id = ? AND cm.user_id = ? AND u.is_active = 1',
            [clubId, to_user_id], (err, row) => err ? reject(err) : resolve(row))
    );
    if (!target) return res.status(400).json({ error: 'Target must be an active member of this club' });

    // Reassign all reviewer_assignments in this club from from_user_id to to_user_id
    await new Promise((resolve, reject) => {
        db.run(`
            UPDATE reviewer_assignments
            SET reviewer_id = ?
            WHERE reviewer_id = ?
              AND application_id IN (
                  SELECT a.id FROM applications a
                  JOIN recruitment_drives d ON a.drive_id = d.id
                  WHERE d.club_id = ?
              )
              AND application_id NOT IN (
                  SELECT application_id FROM reviewer_assignments WHERE reviewer_id = ?
              )
        `, [to_user_id, from_user_id, clubId, to_user_id], (err) => err ? reject(err) : resolve());
    });

    // Delete any remaining duplicate assignments that couldn't be updated due to unique constraint
    await new Promise((resolve, reject) => {
        db.run(`
            DELETE FROM reviewer_assignments
            WHERE reviewer_id = ?
              AND application_id IN (
                  SELECT a.id FROM applications a
                  JOIN recruitment_drives d ON a.drive_id = d.id
                  WHERE d.club_id = ?
              )
        `, [from_user_id, clubId], (err) => err ? reject(err) : resolve());
    });

    req.activityEntityId = from_user_id;
    req.activityClubId = clubId;
    res.json({ message: 'Reassignment complete', from_user_id, to_user_id, club_id: clubId });
});

/**
 * GET /api/admin/audit — sitewide activity audit log with filtering
 */
router.get('/audit', (req, res) => {
    const options = parseListOptions(req.query, { created: 'a.created_at', action: 'a.action' }, 'created');
    const conditions = [];
    const params = [];

    if (req.query.club_id) {
        conditions.push('a.club_id = ?');
        params.push(Number(req.query.club_id));
    }
    if (req.query.actor_id) {
        conditions.push('a.actor_id = ?');
        params.push(Number(req.query.actor_id));
    }
    if (req.query.action) {
        conditions.push('a.action LIKE ?');
        params.push(`%${req.query.action}%`);
    }
    if (req.query.from_date) {
        conditions.push('a.created_at >= ?');
        params.push(req.query.from_date);
    }
    if (req.query.to_date) {
        conditions.push('a.created_at <= ?');
        params.push(req.query.to_date);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    db.get(`SELECT COUNT(*) AS total FROM activity_log a ${where}`, params, (countErr, countRes) => {
        if (countErr) return res.status(500).json({ error: 'Failed to count audit records' });

        db.all(`
            SELECT a.id, a.actor_id, a.actor_role, a.action, a.entity_type, a.entity_id,
                   a.club_id, a.season_id, a.ip, a.user_agent, a.created_at,
                   u.name AS actor_name, u.email AS actor_email,
                   c.name AS club_name
            FROM activity_log a
            LEFT JOIN users u ON a.actor_id = u.id
            LEFT JOIN clubs c ON a.club_id = c.id
            ${where}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?
        `, [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to load audit records' });
            setPaginationHeaders(res, options, countRes.total);
            res.json(rows || []);
        });
    });
});

/**
 * GET /api/admin/audit/export-csv — sitewide activity audit CSV export
 */
router.get('/audit/export-csv', (req, res) => {
    const conditions = [];
    const params = [];

    if (req.query.club_id) {
        conditions.push('a.club_id = ?');
        params.push(Number(req.query.club_id));
    }
    if (req.query.actor_id) {
        conditions.push('a.actor_id = ?');
        params.push(Number(req.query.actor_id));
    }
    if (req.query.action) {
        conditions.push('a.action LIKE ?');
        params.push(`%${req.query.action}%`);
    }
    if (req.query.from_date) {
        conditions.push('a.created_at >= ?');
        params.push(req.query.from_date);
    }
    if (req.query.to_date) {
        conditions.push('a.created_at <= ?');
        params.push(req.query.to_date);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    db.all(`
        SELECT a.id, a.created_at, u.name AS actor_name, u.email AS actor_email,
               a.actor_role, a.action, a.entity_type, a.entity_id,
               c.name AS club_name, a.ip
        FROM activity_log a
        LEFT JOIN users u ON a.actor_id = u.id
        LEFT JOIN clubs c ON a.club_id = c.id
        ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 5000
    `, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to export audit log' });

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headers = ['ID', 'Timestamp', 'Actor Name', 'Actor Email', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Club', 'IP'];
        const csvLines = [headers.join(',')];

        for (const r of rows) {
            csvLines.push([
                r.id,
                escapeCsv(r.created_at),
                escapeCsv(r.actor_name),
                escapeCsv(r.actor_email),
                escapeCsv(r.actor_role),
                escapeCsv(r.action),
                escapeCsv(r.entity_type),
                r.entity_id,
                escapeCsv(r.club_name),
                escapeCsv(r.ip)
            ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="admin_audit_log.csv"');
        res.status(200).send(csvLines.join('\n'));
    });
});

/**
 * Registration Approval Gate Endpoints
 */
router.get('/registration-requests', (req, res) => {
    db.all(`SELECT id, name, email, department, year, phone, prn, bio, approval_status, created_at
        FROM users
        WHERE approval_status = 'pending'
        ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Unable to load registration requests' });
        res.json(rows);
    });
});

router.post('/registration-requests/:id/approve', withTransaction(db, 'admin.user.approve', 'user'), (req, res) => {
    const userId = Number(req.params.id);
    db.get('SELECT id, name, email, approval_status FROM users WHERE id = ?', [userId], (findErr, user) => {
        if (findErr) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.approval_status === 'approved') {
            return res.status(400).json({ error: 'User is already approved' });
        }

        db.run(`UPDATE users
            SET approval_status = 'approved',
                is_active = 1,
                email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        [req.user.id, userId], function(updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Unable to approve registration' });
            req.activityEntityId = userId;
            req.activityActorId = req.user.id;

            try {
                const { dispatchNotification } = require('../services/notifications');
                dispatchNotification(db, {
                    userId: userId,
                    title: 'Registration Approved!',
                    message: 'Your registration request has been approved by the administrator. You can now log in to CreativeRecruit.',
                    eventType: 'registration.approved',
                    link: '/login'
                }).catch(() => {});
            } catch {
                // Notifications optional
            }

            res.json({ message: 'User registration approved successfully', user: { id: userId, approval_status: 'approved' } });
        });
    });
});

router.post('/registration-requests/:id/reject', withTransaction(db, 'admin.user.reject', 'user'), (req, res) => {
    const userId = Number(req.params.id);
    const reason = req.body?.reason?.trim() || 'Declined by administrator';
    db.get('SELECT id, name, email, approval_status FROM users WHERE id = ?', [userId], (findErr, user) => {
        if (findErr) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        db.run(`UPDATE users
            SET approval_status = 'rejected',
                is_active = 0,
                approval_notes = ?,
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        [reason, req.user.id, userId], function(updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Unable to reject registration' });
            req.activityEntityId = userId;
            req.activityActorId = req.user.id;

            try {
                const { dispatchNotification } = require('../services/notifications');
                dispatchNotification(db, {
                    userId: userId,
                    title: 'Registration Status Update',
                    message: `Your registration request was declined. Reason: ${reason}`,
                    eventType: 'registration.rejected',
                    link: '/login'
                }).catch(() => {});
            } catch {
                // Notifications optional
            }

            res.json({ message: 'User registration rejected', user: { id: userId, approval_status: 'rejected' } });
        });
    });
});

module.exports = router;