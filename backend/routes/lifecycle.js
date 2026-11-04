/**
 * routes/lifecycle.js — Phase 9: Member Lifecycle Management
 *
 * Implements:
 * 1. Onboarding checklists & member completion progress
 * 2. Club events, RSVPs, attendance tracking & anti-forgery QR check-in
 * 3. Verifiable member certificates with SHA-256 credentials
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { z } = require('zod');
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');

const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );

const all = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
    );

const get = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUBLIC CERTIFICATE VERIFICATION (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/certificates/verify/:hash', async (req, res) => {
    const hash = req.params.hash.trim().toLowerCase();
    try {
        const cert = await get(`
            SELECT mc.*, u.name AS recipient_name, u.email AS recipient_email,
                   u.department, u.year, c.name AS club_name, c.category AS club_category,
                   issuer.name AS issuer_name
            FROM member_certificates mc
            JOIN users u ON u.id = mc.user_id
            JOIN clubs c ON c.id = mc.club_id
            LEFT JOIN users issuer ON issuer.id = mc.issued_by
            WHERE LOWER(mc.unique_credential_hash) = ?
        `, [hash]);

        if (!cert) {
            return res.status(404).json({ error: 'Certificate credential not found or invalid' });
        }

        res.json({
            valid: true,
            id: cert.id,
            title: cert.title,
            certificate_type: cert.certificate_type,
            issue_date: cert.issue_date,
            unique_credential_hash: cert.unique_credential_hash,
            recipient: {
                name: cert.recipient_name,
                department: cert.department,
                year: cert.year
            },
            club: {
                id: cert.club_id,
                name: cert.club_name,
                category: cert.club_category
            },
            issued_by: cert.issuer_name || 'Club Lead',
            created_at: cert.created_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify certificate' });
    }
});

// All remaining routes require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ONBOARDING CHECKLISTS & MEMBER PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/lifecycle/clubs/:clubId/onboarding — get tasks with user completion
router.get('/clubs/:clubId/onboarding', async (req, res) => {
    const clubId = Number(req.params.clubId);
    try {
        const tasks = await all(`
            SELECT oc.*,
                   COALESCE(mop.is_completed, 0) AS is_completed,
                   mop.completed_at
            FROM onboarding_checklists oc
            LEFT JOIN member_onboarding_progress mop
                   ON mop.task_id = oc.id AND mop.user_id = ?
            WHERE oc.club_id = ?
            ORDER BY oc.order_index ASC, oc.id ASC
        `, [req.user.id, clubId]);

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load onboarding tasks' });
    }
});

// POST /api/lifecycle/clubs/:clubId/onboarding — add task (lead/admin)
router.post('/clubs/:clubId/onboarding', withTransaction(db, 'onboarding.task.created', 'onboarding_task'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to manage onboarding for this club' });

    const schema = z.object({
        title:               z.string().trim().min(2).max(200),
        description:         z.string().trim().max(1000).optional(),
        resource_url:        z.string().trim().url().optional().or(z.literal('')),
        due_days_after_join: z.coerce.number().int().min(1).max(90).default(7),
        order_index:         z.coerce.number().int().min(0).default(0),
        is_required:         z.coerce.number().int().min(0).max(1).default(1)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task details' });

    const { title, description = '', resource_url = '', due_days_after_join = 7, order_index = 0, is_required = 1 } = parsed.data;

    try {
        const result = await run(`
            INSERT INTO onboarding_checklists (club_id, title, description, resource_url, due_days_after_join, order_index, is_required)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [clubId, title, description, resource_url, due_days_after_join, order_index, is_required]);

        req.activityEntityId = result.lastID;
        req.activityClubId = clubId;
        res.status(201).json({ id: result.lastID, message: 'Onboarding task created' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create onboarding task' });
    }
});

// PUT /api/lifecycle/clubs/:clubId/onboarding/:taskId — update task (lead/admin)
router.put('/clubs/:clubId/onboarding/:taskId', withTransaction(db, 'onboarding.task.updated', 'onboarding_task'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const taskId = Number(req.params.taskId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to update onboarding task' });

    const schema = z.object({
        title:               z.string().trim().min(2).max(200),
        description:         z.string().trim().max(1000).optional(),
        resource_url:        z.string().trim().url().optional().or(z.literal('')),
        due_days_after_join: z.coerce.number().int().min(1).max(90).optional(),
        order_index:         z.coerce.number().int().min(0).optional(),
        is_required:         z.coerce.number().int().min(0).max(1).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid task details' });

    try {
        const result = await run(`
            UPDATE onboarding_checklists
            SET title = ?, description = ?, resource_url = ?,
                due_days_after_join = COALESCE(?, due_days_after_join),
                order_index = COALESCE(?, order_index),
                is_required = COALESCE(?, is_required)
            WHERE id = ? AND club_id = ?
        `, [parsed.data.title, parsed.data.description || '', parsed.data.resource_url || '',
            parsed.data.due_days_after_join, parsed.data.order_index, parsed.data.is_required, taskId, clubId]);

        if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
        req.activityEntityId = taskId;
        req.activityClubId = clubId;
        res.json({ message: 'Onboarding task updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE /api/lifecycle/clubs/:clubId/onboarding/:taskId — delete task (lead/admin)
router.delete('/clubs/:clubId/onboarding/:taskId', withTransaction(db, 'onboarding.task.deleted', 'onboarding_task'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const taskId = Number(req.params.taskId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    try {
        await run('DELETE FROM member_onboarding_progress WHERE task_id = ?', [taskId]);
        const result = await run('DELETE FROM onboarding_checklists WHERE id = ? AND club_id = ?', [taskId, clubId]);
        if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
        req.activityEntityId = taskId;
        req.activityClubId = clubId;
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// POST /api/lifecycle/clubs/:clubId/onboarding/:taskId/toggle — toggle completion
router.post('/clubs/:clubId/onboarding/:taskId/toggle', withTransaction(db, 'onboarding.task.toggled', 'onboarding_progress'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const taskId = Number(req.params.taskId);
    const targetUserId = req.body.user_id ? Number(req.body.user_id) : req.user.id;

    // Check authority: user toggling their own, or lead/admin
    const isSelf = targetUserId === req.user.id;
    const isLeadOrAdmin = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!isSelf && !isLeadOrAdmin) {
        return res.status(403).json({ error: 'Not authorized to toggle task for another user' });
    }

    try {
        const existing = await get(`
            SELECT is_completed FROM member_onboarding_progress
            WHERE club_id = ? AND user_id = ? AND task_id = ?
        `, [clubId, targetUserId, taskId]);

        let newStatus = 1;
        if (existing && existing.is_completed === 1) {
            newStatus = 0;
        }

        await run(`
            INSERT INTO member_onboarding_progress (club_id, user_id, task_id, is_completed, completed_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(club_id, user_id, task_id) DO UPDATE SET
                is_completed = excluded.is_completed,
                completed_at = CURRENT_TIMESTAMP
        `, [clubId, targetUserId, taskId, newStatus]);

        req.activityEntityId = taskId;
        req.activityClubId = clubId;
        res.json({ task_id: taskId, user_id: targetUserId, is_completed: newStatus });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle onboarding task' });
    }
});

// GET /api/lifecycle/clubs/:clubId/onboarding/members — coordinator overview
router.get('/clubs/:clubId/onboarding/members', async (req, res) => {
    const clubId = Number(req.params.clubId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.view', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    try {
        const totalTasksRow = await get('SELECT COUNT(*) AS total FROM onboarding_checklists WHERE club_id = ?', [clubId]);
        const totalTasks = totalTasksRow ? totalTasksRow.total : 0;

        const members = await all(`
            SELECT cm.user_id, cm.role, cm.title, cm.status, cm.created_at AS joined_at,
                   u.name, u.email, u.department, u.year,
                   COUNT(mop.id) FILTER (WHERE mop.is_completed = 1) AS completed_tasks_count
            FROM club_members cm
            JOIN users u ON u.id = cm.user_id
            LEFT JOIN member_onboarding_progress mop
                   ON mop.club_id = cm.club_id AND mop.user_id = cm.user_id
            WHERE cm.club_id = ? AND cm.status = 'active'
            GROUP BY cm.user_id
            ORDER BY u.name ASC
        `, [clubId]);

        res.json({
            total_tasks: totalTasks,
            members: members.map(m => ({
                ...m,
                total_tasks: totalTasks,
                progress_percentage: totalTasks > 0 ? Math.round((m.completed_tasks_count / totalTasks) * 100) : 100
            }))
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load member progress overview' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLUB EVENTS & ATTENDANCE WITH ANTI-FORGERY QR CHECK-IN
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/lifecycle/clubs/:clubId/events — list club events
router.get('/clubs/:clubId/events', async (req, res) => {
    const clubId = Number(req.params.clubId);
    try {
        const events = await all(`
            SELECT ce.*,
                   (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ce.id AND status = 'going') AS going_count,
                   (SELECT COUNT(*) FROM event_attendance WHERE event_id = ce.id) AS attendance_count,
                   my_rsvp.status AS my_rsvp_status,
                   CASE WHEN my_att.id IS NOT NULL THEN 1 ELSE 0 END AS my_attendance
            FROM club_events ce
            LEFT JOIN event_rsvps my_rsvp ON my_rsvp.event_id = ce.id AND my_rsvp.user_id = ?
            LEFT JOIN event_attendance my_att ON my_att.event_id = ce.id AND my_att.user_id = ?
            WHERE ce.club_id = ?
            ORDER BY ce.event_date DESC, ce.start_time DESC
        `, [req.user.id, req.user.id, clubId]);

        res.json(events);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load events' });
    }
});

// POST /api/lifecycle/clubs/:clubId/events — create event (lead/admin)
router.post('/clubs/:clubId/events', withTransaction(db, 'event.created', 'club_event'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to create events for this club' });

    const schema = z.object({
        title:       z.string().trim().min(2).max(200),
        description: z.string().trim().max(2000).optional(),
        location:    z.string().trim().min(1).max(200),
        event_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start_time:  z.string().regex(/^\d{2}:\d{2}$/),
        end_time:    z.string().regex(/^\d{2}:\d{2}$/),
        is_public:   z.coerce.number().int().min(0).max(1).default(1)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid event details' });

    const { title, description = '', location, event_date, start_time, end_time, is_public = 1 } = parsed.data;
    // Cryptographically secure QR secret token for anti-forgery
    const qr_secret_token = crypto.randomBytes(16).toString('hex');

    try {
        const result = await run(`
            INSERT INTO club_events (club_id, title, description, location, event_date, start_time, end_time, qr_secret_token, is_public, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [clubId, title, description, location, event_date, start_time, end_time, qr_secret_token, is_public, req.user.id]);

        req.activityEntityId = result.lastID;
        req.activityClubId = clubId;
        res.status(201).json({ id: result.lastID, qr_secret_token, message: 'Event created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// GET /api/lifecycle/events/:eventId — get event details (includes QR secret if privileged)
router.get('/events/:eventId', async (req, res) => {
    const eventId = Number(req.params.eventId);
    try {
        const event = await get(`
            SELECT ce.*, c.name AS club_name, c.category AS club_category
            FROM club_events ce
            JOIN clubs c ON c.id = ce.club_id
            WHERE ce.id = ?
        `, [eventId]);

        if (!event) return res.status(404).json({ error: 'Event not found' });

        const isPrivileged = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId: event.club_id });
        if (!isPrivileged) {
            delete event.qr_secret_token;
        }

        res.json(event);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load event details' });
    }
});

// PUT /api/lifecycle/events/:eventId — update event
router.put('/events/:eventId', withTransaction(db, 'event.updated', 'club_event'), async (req, res) => {
    const eventId = Number(req.params.eventId);
    const existing = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId: existing.club_id });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to edit event' });

    const schema = z.object({
        title:       z.string().trim().min(2).max(200),
        description: z.string().trim().max(2000).optional(),
        location:    z.string().trim().min(1).max(200),
        event_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start_time:  z.string().regex(/^\d{2}:\d{2}$/),
        end_time:    z.string().regex(/^\d{2}:\d{2}$/),
        is_public:   z.coerce.number().int().min(0).max(1).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid event payload' });

    try {
        await run(`
            UPDATE club_events
            SET title = ?, description = ?, location = ?, event_date = ?, start_time = ?, end_time = ?,
                is_public = COALESCE(?, is_public)
            WHERE id = ?
        `, [parsed.data.title, parsed.data.description || '', parsed.data.location,
            parsed.data.event_date, parsed.data.start_time, parsed.data.end_time, parsed.data.is_public, eventId]);

        req.activityEntityId = eventId;
        req.activityClubId = existing.club_id;
        res.json({ message: 'Event updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update event' });
    }
});

// DELETE /api/lifecycle/events/:eventId — delete event
router.delete('/events/:eventId', withTransaction(db, 'event.deleted', 'club_event'), async (req, res) => {
    const eventId = Number(req.params.eventId);
    const existing = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId: existing.club_id });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to delete event' });

    try {
        await run('DELETE FROM event_attendance WHERE event_id = ?', [eventId]);
        await run('DELETE FROM event_rsvps WHERE event_id = ?', [eventId]);
        await run('DELETE FROM club_events WHERE id = ?', [eventId]);

        req.activityEntityId = eventId;
        req.activityClubId = existing.club_id;
        res.json({ message: 'Event deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// POST /api/lifecycle/events/:eventId/rsvp — RSVP for event
router.post('/events/:eventId/rsvp', withTransaction(db, 'event.rsvp.updated', 'event_rsvp'), async (req, res) => {
    const eventId = Number(req.params.eventId);
    const parsed = z.object({ status: z.enum(['going', 'interested', 'declined']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid RSVP status (going, interested, or declined)' });

    const event = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    try {
        await run(`
            INSERT INTO event_rsvps (event_id, user_id, status)
            VALUES (?, ?, ?)
            ON CONFLICT(event_id, user_id) DO UPDATE SET
                status = excluded.status,
                created_at = CURRENT_TIMESTAMP
        `, [eventId, req.user.id, parsed.data.status]);

        req.activityEntityId = eventId;
        req.activityClubId = event.club_id;
        res.json({ message: 'RSVP updated', status: parsed.data.status });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record RSVP' });
    }
});

// POST /api/lifecycle/events/:eventId/check-in — QR Attendance Scan (Anti-forgery)
router.post('/events/:eventId/check-in', withTransaction(db, 'event.attendance.checked_in', 'event_attendance'), async (req, res) => {
    const eventId = Number(req.params.eventId);
    const { qr_token } = req.body;

    if (!qr_token || typeof qr_token !== 'string') {
        return res.status(400).json({ error: 'QR token is required' });
    }

    const event = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Anti-forgery check: token must match event's unique secret token
    if (event.qr_secret_token !== qr_token.trim()) {
        return res.status(403).json({ error: 'Invalid or forged QR attendance token' });
    }

    try {
        await run(`
            INSERT INTO event_attendance (event_id, club_id, user_id, check_in_method, checked_in_at)
            VALUES (?, ?, ?, 'qr', CURRENT_TIMESTAMP)
            ON CONFLICT(event_id, user_id) DO NOTHING
        `, [eventId, event.club_id, req.user.id]);

        req.activityEntityId = eventId;
        req.activityClubId = event.club_id;
        res.json({ message: 'Attendance verified successfully', event_id: eventId, user_id: req.user.id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

// POST /api/lifecycle/events/:eventId/attendance/manual — coordinator marks attendance
router.post('/events/:eventId/attendance/manual', withTransaction(db, 'event.attendance.manual', 'event_attendance'), async (req, res) => {
    const eventId = Number(req.params.eventId);
    const event = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId: event.club_id });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to record attendance' });

    const schema = z.object({ user_id: z.coerce.number().int().positive() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid user_id' });

    try {
        await run(`
            INSERT INTO event_attendance (event_id, club_id, user_id, check_in_method, verified_by, checked_in_at)
            VALUES (?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(event_id, user_id) DO NOTHING
        `, [eventId, event.club_id, parsed.data.user_id, req.user.id]);

        req.activityEntityId = eventId;
        req.activityClubId = event.club_id;
        res.json({ message: 'Attendance marked manually', event_id: eventId, user_id: parsed.data.user_id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record manual attendance' });
    }
});

// GET /api/lifecycle/events/:eventId/attendance — list attendees
router.get('/events/:eventId/attendance', async (req, res) => {
    const eventId = Number(req.params.eventId);
    const event = await get('SELECT * FROM club_events WHERE id = ?', [eventId]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.view', { clubId: event.club_id });
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    try {
        const attendees = await all(`
            SELECT ea.*, u.name, u.email, u.department, u.year, verifier.name AS verifier_name
            FROM event_attendance ea
            JOIN users u ON u.id = ea.user_id
            LEFT JOIN users verifier ON verifier.id = ea.verified_by
            WHERE ea.event_id = ?
            ORDER BY ea.checked_in_at DESC
        `, [eventId]);

        res.json(attendees);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load attendees' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. VERIFIABLE CERTIFICATES & CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/lifecycle/clubs/:clubId/certificates — issue certificate (lead/admin)
router.post('/clubs/:clubId/certificates', withTransaction(db, 'certificate.issued', 'member_certificate'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.manage_members', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized to issue certificates for this club' });

    const schema = z.object({
        user_id:          z.coerce.number().int().positive(),
        title:            z.string().trim().min(3).max(200),
        certificate_type: z.enum(['membership', 'completion', 'merit', 'lead']).default('membership'),
        issue_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        metadata:         z.record(z.any()).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid certificate details' });

    const { user_id, title, certificate_type, issue_date, metadata = {} } = parsed.data;

    // Verify recipient user exists
    const recipient = await get('SELECT id, name FROM users WHERE id = ?', [user_id]);
    if (!recipient) return res.status(404).json({ error: 'Recipient student not found' });

    // Generate cryptographic SHA-256 hash for public verification
    const entropy = `${clubId}-${user_id}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const unique_credential_hash = crypto.createHash('sha256').update(entropy).digest('hex');

    try {
        const result = await run(`
            INSERT INTO member_certificates (club_id, user_id, title, certificate_type, issue_date, unique_credential_hash, issued_by, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [clubId, user_id, title, certificate_type, issue_date, unique_credential_hash, req.user.id, JSON.stringify(metadata)]);

        req.activityEntityId = result.lastID;
        req.activityClubId = clubId;

        res.status(201).json({
            id: result.lastID,
            title,
            certificate_type,
            unique_credential_hash,
            verification_url: `/verify/${unique_credential_hash}`,
            message: `Certificate issued successfully to ${recipient.name}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to issue certificate' });
    }
});

// GET /api/lifecycle/clubs/:clubId/certificates — club certificate list
router.get('/clubs/:clubId/certificates', async (req, res) => {
    const clubId = Number(req.params.clubId);
    const allowed = req.user.role === 'admin' || await can(db, req.user, 'club.view', { clubId });
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    try {
        const certs = await all(`
            SELECT mc.*, u.name AS recipient_name, u.email AS recipient_email,
                   u.department, u.year, issuer.name AS issuer_name
            FROM member_certificates mc
            JOIN users u ON u.id = mc.user_id
            LEFT JOIN users issuer ON issuer.id = mc.issued_by
            WHERE mc.club_id = ?
            ORDER BY mc.issue_date DESC, mc.id DESC
        `, [clubId]);

        res.json(certs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load club certificates' });
    }
});

// GET /api/lifecycle/certificates/my — student's own certificates
router.get('/certificates/my', async (req, res) => {
    try {
        const certs = await all(`
            SELECT mc.*, c.name AS club_name, c.category AS club_category, c.logo_url,
                   issuer.name AS issuer_name
            FROM member_certificates mc
            JOIN clubs c ON c.id = mc.club_id
            LEFT JOIN users issuer ON issuer.id = mc.issued_by
            WHERE mc.user_id = ?
            ORDER BY mc.issue_date DESC, mc.id DESC
        `, [req.user.id]);

        res.json(certs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load user certificates' });
    }
});

module.exports = router;

