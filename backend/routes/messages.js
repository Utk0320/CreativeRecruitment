const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');

// Helper to interpolate template variables
function interpolate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        result = result.replace(regex, value !== undefined && value !== null ? String(value) : '');
    }
    return result;
}

// ── GET /templates/club/:clubId — Fetch club message templates ───────────────
router.get('/templates/club/:clubId', authenticateToken, requireRole('coordinator'), (req, res) => {
    const clubId = Number(req.params.clubId);

    db.all('SELECT * FROM message_templates WHERE club_id = ? ORDER BY id DESC', [clubId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

// ── POST /templates/club/:clubId — Create a new message template ─────────────
router.post('/templates/club/:clubId', authenticateToken, requireRole('coordinator'), withTransaction(db, 'template.created', 'message_template'), async (req, res) => {
    const clubId = Number(req.params.clubId);
    const { name, subject, body_template, stage_id } = req.body;

    if (!name || !subject || !body_template) {
        return res.status(400).json({ error: 'Name, subject, and body template are required' });
    }

    const canEdit = await can(db, req.user, 'drive.edit', { clubId });
    if (!canEdit) return res.status(403).json({ error: 'Not authorized' });

    db.run(`
        INSERT INTO message_templates (club_id, name, subject, body_template, stage_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [clubId, name.trim(), subject.trim(), body_template, stage_id || null, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create template' });

        req.activityEntityId = this.lastID;
        req.activityClubId = clubId;
        req.activityAfterJson = { name, subject };

        res.status(201).json({
            id: this.lastID,
            club_id: clubId,
            name,
            subject,
            body_template,
            stage_id
        });
    });
});

// ── POST /broadcast/preview — Preview broadcast for a drive stage ────────────
router.post('/broadcast/preview', authenticateToken, requireRole('coordinator'), withTransaction(db, 'broadcast.previewed', 'stage_message'), async (req, res) => {
    const { drive_id, stage_id, subject_template, body_template } = req.body;

    if (!drive_id || !stage_id) {
        return res.status(400).json({ error: 'drive_id and stage_id are required' });
    }

    db.get(`
        SELECT rd.title AS drive_title, rd.club_id, c.name AS club_name
        FROM recruitment_drives rd
        JOIN clubs c ON rd.club_id = c.id
        WHERE rd.id = ?
    `, [drive_id], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: drive.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.all(`
            SELECT a.id AS application_id, u.id AS student_id, u.name AS student_name, u.email AS student_email, a.current_stage_id
            FROM applications a
            JOIN users u ON a.student_id = u.id
            WHERE a.drive_id = ? AND a.current_stage_id = ?
        `, [drive_id, stage_id], (aErr, recipients) => {
            if (aErr) return res.status(500).json({ error: 'Database error' });

            const sampleRecipient = recipients[0] || { student_name: 'Aditi Sharma', student_email: 'aditi.sharma@mmcoe.edu.in' };
            const previewVars = {
                student_name: sampleRecipient.student_name,
                student_email: sampleRecipient.student_email,
                drive_title: drive.drive_title,
                club_name: drive.club_name,
                stage_name: stage_id
            };

            const previewSubject = interpolate(subject_template || '', previewVars);
            const previewBody = interpolate(body_template || '', previewVars);

            res.json({
                recipient_count: recipients.length,
                recipients: recipients.map(r => ({ id: r.application_id, name: r.student_name, email: r.student_email })),
                sample_preview: {
                    subject: previewSubject,
                    body: previewBody
                }
            });
        });
    });
});

// ── POST /broadcast/send — Send bulk stage message and log audit trail ────────
router.post('/broadcast/send', authenticateToken, requireRole('coordinator'), withTransaction(db, 'broadcast.sent', 'stage_message_log'), async (req, res) => {
    const { drive_id, stage_id, subject, body } = req.body;

    if (!drive_id || !stage_id || !subject || !body) {
        return res.status(400).json({ error: 'drive_id, stage_id, subject, and body are required' });
    }

    db.get(`
        SELECT rd.title AS drive_title, rd.club_id, c.name AS club_name
        FROM recruitment_drives rd
        JOIN clubs c ON rd.club_id = c.id
        WHERE rd.id = ?
    `, [drive_id], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: drive.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.all(`
            SELECT a.id AS application_id, u.id AS student_id, u.name AS student_name, u.email AS student_email
            FROM applications a
            JOIN users u ON a.student_id = u.id
            WHERE a.drive_id = ? AND a.current_stage_id = ?
        `, [drive_id, stage_id], (aErr, recipients) => {
            if (aErr) return res.status(500).json({ error: 'Database error' });

            const recipientsSummary = recipients.map(r => ({ application_id: r.application_id, email: r.student_email, name: r.student_name }));

            db.run(`
                INSERT INTO stage_message_logs (drive_id, club_id, sender_id, stage_id, recipient_count, subject, body, recipients_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [drive_id, drive.club_id, req.user.id, stage_id, recipients.length, subject, body, JSON.stringify(recipientsSummary)], function(insErr) {
                if (insErr) return res.status(500).json({ error: 'Failed to record message log' });

                req.activityEntityId = this.lastID;
                req.activityClubId = drive.club_id;
                req.activityAfterJson = {
                    stage_id,
                    recipient_count: recipients.length,
                    subject
                };

                res.status(201).json({
                    message: `Broadcast message dispatched to ${recipients.length} applicants`,
                    recipient_count: recipients.length,
                    log_id: this.lastID
                });
            });
        });
    });
});

// ── GET /logs/drive/:driveId — Fetch broadcast logs for a drive ──────────────
router.get('/logs/drive/:driveId', authenticateToken, requireRole('coordinator'), (req, res) => {
    const driveId = Number(req.params.driveId);

    db.all(`
        SELECT sml.*, u.name AS sender_name, u.email AS sender_email
        FROM stage_message_logs sml
        JOIN users u ON sml.sender_id = u.id
        WHERE sml.drive_id = ?
        ORDER BY sml.id DESC
    `, [driveId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

module.exports = router;
