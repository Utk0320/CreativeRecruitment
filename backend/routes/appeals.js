const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { dispatchNotification } = require('../services/notifications/dispatcher');

function parseUtcTime(timestamp) {
    if (!timestamp) return Date.now();
    const str = String(timestamp).trim();
    if (str.endsWith('Z')) return new Date(str).getTime();
    return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

/**
 * POST /api/appeals/applications/:appId
 * Student files an appeal for a rejected or waitlisted application.
 * Rules:
 *  - Must be application owner
 *  - Outcome must be Rejected or Waitlisted
 *  - Single appeal per application
 *  - Within drive's appeal_window_days (default 7 days)
 */
router.post('/applications/:appId', authenticateToken, withTransaction(db, 'appeals.create', 'appeals'), async (req, res) => {
    const appId = Number(req.params.appId);
    const { reason, attachment_url } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        return res.status(400).json({ error: 'A detailed reason of at least 10 characters is required' });
    }

    db.get(
        `SELECT a.*, rd.title AS drive_title, rd.appeal_window_days, rd.club_id
         FROM applications a
         JOIN recruitment_drives rd ON rd.id = a.drive_id
         WHERE a.id = ?`,
        [appId],
        (err, app) => {
            if (err) return res.status(500).json({ error: 'Database query failed' });
            if (!app) return res.status(404).json({ error: 'Application not found' });

            if (app.student_id !== req.user.id) {
                return res.status(403).json({ error: 'You can only appeal your own applications' });
            }

            const outcome = app.outcome || app.status;
            if (!['Rejected', 'Waitlisted'].includes(outcome)) {
                return res.status(400).json({ error: 'Appeals can only be filed for rejected or waitlisted applications' });
            }

            // Check single appeal limit
            db.get('SELECT id FROM appeals WHERE application_id = ?', [appId], (err, existing) => {
                if (err) return res.status(500).json({ error: 'Database query failed' });
                if (existing) {
                    return res.status(409).json({ error: 'An appeal has already been filed for this application' });
                }

                // Check appeal window (default 7 days)
                const windowDays = Number(app.appeal_window_days) || 7;
                const decisionTime = parseUtcTime(app.decision_date || app.updated_at);
                const windowMs = windowDays * 24 * 60 * 60 * 1000;
                if (Date.now() - decisionTime > windowMs) {
                    return res.status(400).json({
                        error: `Appeal window of ${windowDays} days has expired. Decisions must be appealed within ${windowDays} days.`
                    });
                }

                db.run(
                    `INSERT INTO appeals (application_id, student_id, reason, attachment_url, status)
                     VALUES (?, ?, ?, ?, 'Pending')`,
                    [appId, req.user.id, reason.trim(), attachment_url || null],
                    function(err) {
                        if (err) return res.status(500).json({ error: 'Failed to submit appeal' });
                        const appealId = this.lastID;

                        // Notify club lead
                        db.all(
                            `SELECT user_id FROM club_members WHERE club_id = ? AND role IN ('lead', 'member')`,
                            [app.club_id],
                            (err, members) => {
                                if (!err && members) {
                                    for (const m of members) {
                                        dispatchNotification(db, {
                                            userId: m.user_id,
                                            eventType: 'appeal_update',
                                            title: 'New Appeal Filed',
                                            message: `An appeal has been filed for ${app.drive_title}.`,
                                            link: `/coordinator/inbox`
                                        }).catch(() => {});
                                    }
                                }
                            }
                        );

                        res.status(201).json({
                            id: appealId,
                            application_id: appId,
                            status: 'Pending',
                            reason: reason.trim(),
                            message: 'Appeal submitted successfully'
                        });
                    }
                );
            });
        }
    );
});

/**
 * GET /api/appeals/my
 * Student lists their submitted appeals.
 */
router.get('/my', authenticateToken, (req, res) => {
    db.all(
        `SELECT ap.*, rd.title AS drive_title, c.name AS club_name, a.outcome, a.decision_date
         FROM appeals ap
         JOIN applications a ON a.id = ap.application_id
         JOIN recruitment_drives rd ON rd.id = a.drive_id
         JOIN clubs c ON c.id = rd.club_id
         WHERE ap.student_id = ?
         ORDER BY ap.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch appeals' });
            res.json(rows || []);
        }
    );
});

/**
 * GET /api/appeals/club/:clubId
 * Coordinator / Lead / Admin lists appeals for a specific club.
 */
router.get('/club/:clubId', authenticateToken, (req, res) => {
    const clubId = Number(req.params.clubId);

    const proceed = () => {
        db.all(
            `SELECT ap.*, u.name AS student_name, u.email AS student_email,
                    rd.title AS drive_title, rd.stages AS drive_stages,
                    a.current_stage_id, a.outcome, a.decided_by, a.proposed_by
             FROM appeals ap
             JOIN applications a ON a.id = ap.application_id
             JOIN recruitment_drives rd ON rd.id = a.drive_id
             JOIN users u ON u.id = ap.student_id
             WHERE rd.club_id = ?
             ORDER BY ap.created_at DESC`,
            [clubId],
            (err, rows) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch club appeals' });
                res.json(rows || []);
            }
        );
    };

    if (req.user.role === 'admin') {
        return proceed();
    }

    db.get(
        'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
        [clubId, req.user.id],
        (err, member) => {
            if (err || !member) {
                return res.status(403).json({ error: 'You are not a member of this club' });
            }
            proceed();
        }
    );
});

/**
 * POST /api/appeals/:id/review
 * Review appeal: 'Under Review', 'Upheld', 'Overturned'.
 * Non-original reviewer rule: If club has >1 coordinator, reviewer cannot be original decider.
 * Overturned rule: moves application back into pipeline at restored_stage_id chosen by lead.
 */
router.post('/:id/review', authenticateToken, withTransaction(db, 'appeals.review', 'appeals'), async (req, res) => {
    const appealId = Number(req.params.id);
    const { status, notes, restored_stage_id } = req.body;

    if (!['Under Review', 'Upheld', 'Overturned'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'Under Review', 'Upheld', or 'Overturned'" });
    }

    db.get(
        `SELECT ap.*, a.drive_id, a.decided_by, a.proposed_by, a.current_stage_id,
                rd.club_id, rd.stages AS drive_stages, rd.title AS drive_title
         FROM appeals ap
         JOIN applications a ON a.id = ap.application_id
         JOIN recruitment_drives rd ON rd.id = a.drive_id
         WHERE ap.id = ?`,
        [appealId],
        (err, appeal) => {
            if (err) return res.status(500).json({ error: 'Database query failed' });
            if (!appeal) return res.status(404).json({ error: 'Appeal not found' });

            // Verify coordinator membership
            const checkPermissions = (cb) => {
                if (req.user.role === 'admin') return cb(null, true);
                db.get(
                    'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
                    [appeal.club_id, req.user.id],
                    (err, member) => {
                        if (err || !member) return cb(new Error('Forbidden: Not a club coordinator'));
                        cb(null, true);
                    }
                );
            };

            checkPermissions((err) => {
                if (err) return res.status(403).json({ error: err.message });

                // Check number of coordinators in the club
                db.get(
                    `SELECT COUNT(*) AS count FROM club_members WHERE club_id = ? AND role IN ('lead', 'member')`,
                    [appeal.club_id],
                    (err, countRow) => {
                        const coordCount = countRow ? countRow.count : 1;

                        // Non-original decider check:
                        // If club has > 1 coordinator, the reviewer must NOT be the original decider
                        const originalDecider = appeal.decided_by || appeal.proposed_by;
                        if (
                            req.user.role !== 'admin' &&
                            coordCount > 1 &&
                            originalDecider &&
                            originalDecider === req.user.id
                        ) {
                            return res.status(403).json({
                                error: 'Reviewer must not be the original decider when the club has multiple coordinators'
                            });
                        }

                        if (status === 'Overturned' && !restored_stage_id) {
                            return res.status(400).json({
                                error: 'A restored_stage_id must be selected when overturning an appeal'
                            });
                        }

                        const resolvedAt = ['Upheld', 'Overturned'].includes(status) ? new Date().toISOString() : null;

                        db.run(
                            `UPDATE appeals SET
                                status = ?,
                                reviewer_id = ?,
                                reviewer_notes = ?,
                                restored_stage_id = ?,
                                resolved_at = COALESCE(?, resolved_at),
                                updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [status, req.user.id, notes || null, restored_stage_id || null, resolvedAt, appealId],
                            function(err) {
                                if (err) return res.status(500).json({ error: 'Failed to update appeal' });

                                // If overturned, restore application to the selected pipeline stage
                                if (status === 'Overturned') {
                                    db.run(
                                        `UPDATE applications SET
                                            current_stage_id = ?,
                                            outcome = 'Advanced',
                                            status = 'Under Review',
                                            rejection_reason_code = NULL,
                                            rejection_feedback = NULL,
                                            updated_at = CURRENT_TIMESTAMP
                                         WHERE id = ?`,
                                        [restored_stage_id, appeal.application_id],
                                        (appErr) => {
                                            if (appErr) console.error('Failed to restore application stage:', appErr);
                                        }
                                    );
                                }

                                // Notify student of appeal decision
                                dispatchNotification(db, {
                                    userId: appeal.student_id,
                                    eventType: 'appeal_update',
                                    title: `Appeal ${status}`,
                                    message: `Your appeal for ${appeal.drive_title} has been ${status.toLowerCase()}.${notes ? ` Reviewer note: ${notes}` : ''}`,
                                    link: `/student/applications`
                                }).catch(() => {});

                                res.json({
                                    id: appealId,
                                    status,
                                    reviewer_id: req.user.id,
                                    reviewer_notes: notes || null,
                                    restored_stage_id: restored_stage_id || null,
                                    message: `Appeal marked as ${status}`
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

module.exports = router;

