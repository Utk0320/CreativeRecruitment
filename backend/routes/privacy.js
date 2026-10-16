/**
 * routes/privacy.js — Phase 10: Data Privacy, Subject Access Requests (SAR) & Retention API
 *
 * Implements:
 * 1. Student full data export in JSON and CSV (Subject Access Request / Data Portability)
 *    - With coordinator internal review notes strictly redacted
 * 2. Student account anonymization & right-to-be-forgotten deletion requests
 * 3. Admin review & execution of data deletion requests
 * 4. Configurable data retention policies and retention execution cleaner
 */

const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { dispatchNotification } = require('../services/notifications/dispatcher');

const all = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
    );

const get = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
    );

const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this);
        })
    );

const parseJsonSafe = (str, fallback) => {
    if (!str) return fallback;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return fallback; }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUBJECT ACCESS REQUEST (SAR): STUDENT FULL DATA EXPORT (JSON)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-data', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // 1. User profile
        const user = await get(`
            SELECT id, name, email, role, department, year, phone, prn, bio,
                   skills, interests, projects, achievements,
                   github_url, linkedin_url, portfolio_url,
                   is_anonymized, created_at
            FROM users
            WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 2. Candidate applications
        // IMPORTANT: Private coordinator review scores, internal notes, and reviewer identities are REDACTED
        const applications = await all(`
            SELECT
                a.id, a.drive_id, rd.title AS drive_title, rd.season_id,
                c.name AS club_name, c.category AS club_category,
                a.status, a.current_stage_id AS stage, a.applied_at, a.updated_at,
                COALESCE(a.answers_snapshot, '{}') AS answers, a.portfolio_url
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            WHERE a.student_id = ?
            ORDER BY a.applied_at DESC
        `, [userId]);

        const sanitizedApps = applications.map(app => ({
            application_id: app.id,
            drive_title: app.drive_title,
            club_name: app.club_name,
            club_category: app.club_category,
            status: app.status,
            stage: app.stage,
            applied_at: app.applied_at,
            updated_at: app.updated_at,
            candidate_answers: parseJsonSafe(app.answers, {}),
            resume_url: app.resume_url
            // evaluator notes / private scorecards are explicitly redacted
        }));

        // 3. Interview records
        const interviews = await all(`
            SELECT
                ib.id, rd.title AS drive_title, c.name AS club_name,
                islots.start_time, islots.end_time, islots.location,
                ib.status, ib.created_at AS booked_at
            FROM interview_bookings ib
            JOIN interview_slots islots ON islots.id = ib.slot_id
            JOIN applications a ON a.id = ib.application_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            WHERE ib.student_id = ?
            ORDER BY islots.start_time DESC
        `, [userId]);

        // 4. Test attempts
        const testAttempts = await all(`
            SELECT
                ts.id, dt.title AS test_title, rd.title AS drive_title,
                ts.score, dt.total_points AS max_score, ts.started_at, ts.submitted_at AS completed_at, ts.status
            FROM test_submissions ts
            JOIN drive_tests dt ON dt.id = ts.test_id
            JOIN applications a ON a.id = ts.application_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            WHERE ts.student_id = ?
            ORDER BY ts.started_at DESC
        `, [userId]);

        // 5. Offers
        const offers = await all(`
            SELECT
                o.id, rd.title AS drive_title, c.name AS club_name,
                o.status, o.rank, o.expires_at, o.accepted_at, o.declined_at, o.created_at
            FROM offers o
            JOIN recruitment_drives rd ON rd.id = o.drive_id
            JOIN clubs c ON c.id = o.club_id
            WHERE o.student_id = ?
            ORDER BY o.created_at DESC
        `, [userId]);

        // 6. Verifiable certificates
        const certificates = await all(`
            SELECT
                mc.id, c.name AS club_name, mc.title, mc.certificate_type,
                mc.metadata_json, mc.issue_date, mc.unique_credential_hash
            FROM member_certificates mc
            JOIN clubs c ON c.id = mc.club_id
            WHERE mc.user_id = ?
            ORDER BY mc.issue_date DESC
        `, [userId]);

        // 7. Event attendance
        const attendance = await all(`
            SELECT
                ea.id, ce.title AS event_title, c.name AS club_name,
                ce.event_date, ea.check_in_method, ea.checked_in_at
            FROM event_attendance ea
            JOIN club_events ce ON ce.id = ea.event_id
            JOIN clubs c ON c.id = ce.club_id
            WHERE ea.user_id = ?
            ORDER BY ea.checked_in_at DESC
        `, [userId]);

        // Assemble full export
        const exportData = {
            export_version: '1.0',
            exported_at: new Date().toISOString(),
            compliance: 'DPDP & GDPR Subject Access Request (SAR)',
            data_subject: {
                ...user,
                skills: parseJsonSafe(user.skills, []),
                interests: parseJsonSafe(user.interests, []),
                projects: parseJsonSafe(user.projects, []),
                achievements: parseJsonSafe(user.achievements, [])
            },
            applications: sanitizedApps,
            interviews,
            test_attempts: testAttempts,
            offers,
            certificates: certificates.map(cert => ({
                ...cert,
                verification_url: `/verify/${cert.unique_credential_hash}`
            })),
            event_attendance: attendance
        };

        res.json(exportData);
    } catch (err) {
        console.error('SAR error:', err);
        res.status(500).json({ error: 'Failed to generate personal data export' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STUDENT DATA EXPORT (CSV)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-data/csv', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const apps = await all(`
            SELECT
                a.id, rd.title AS drive_title, c.name AS club_name,
                a.status, a.current_stage_id AS stage, a.applied_at, a.updated_at
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            WHERE a.student_id = ?
            ORDER BY a.applied_at DESC
        `, [userId]);

        const escapeCsv = (str) => {
            if (str == null) return '""';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        const headers = ['Application ID', 'Drive Title', 'Club Name', 'Status', 'Stage', 'Applied At', 'Last Updated'];
        const rows = apps.map(a => [
            a.id,
            escapeCsv(a.drive_title),
            escapeCsv(a.club_name),
            escapeCsv(a.status),
            escapeCsv(a.stage),
            escapeCsv(a.applied_at),
            escapeCsv(a.updated_at)
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="my_recruitment_data.csv"');
        res.send(csvContent);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate CSV export' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACCOUNT DELETION / ANONYMIZATION REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
router.post('/delete-request', authenticateToken, withTransaction(db, 'privacy.delete_request.created', 'data_deletion_requests'), async (req, res) => {
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        return res.status(400).json({ error: 'Please provide a reason of at least 10 characters' });
    }

    try {
        const existing = await get(`
            SELECT id FROM data_deletion_requests
            WHERE user_id = ? AND status = 'pending'
        `, [userId]);

        if (existing) {
            return res.status(400).json({ error: 'You already have a pending deletion request under review' });
        }

        const result = await run(`
            INSERT INTO data_deletion_requests (user_id, reason, status, requested_at)
            VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
        `, [userId, reason.trim()]);

        req.activityEntityId = result.lastID;

        // Notify admins about the deletion request
        const admins = await all(`SELECT id FROM users WHERE role = 'admin'`);
        for (const admin of admins) {
            await dispatchNotification(db, {
                userId: admin.id,
                title: 'Data Deletion Request',
                message: `${req.user.name || 'A user'} has requested account deletion / anonymization.`,
                link: '/admin/users',
                eventType: 'system'
            });
        }

        res.status(201).json({
            id: result.lastID,
            status: 'pending',
            message: 'Your deletion request has been submitted for administrative review'
        });
    } catch (err) {
        console.error('Delete request error:', err);
        res.status(500).json({ error: 'Failed to submit deletion request' });
    }
});

// GET /api/privacy/delete-requests — Admin lists deletion requests
router.get('/delete-requests', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const requests = await all(`
            SELECT
                dr.*, u.name AS user_name, u.email AS user_email,
                u.department, u.year, reviewer.name AS reviewer_name
            FROM data_deletion_requests dr
            JOIN users u ON u.id = dr.user_id
            LEFT JOIN users reviewer ON reviewer.id = dr.reviewed_by
            ORDER BY dr.requested_at DESC
        `);

        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load deletion requests' });
    }
});

// POST /api/privacy/delete-requests/:id/action — Admin approves or rejects
router.post('/delete-requests/:id/action', authenticateToken, withTransaction(db, 'privacy.delete_request.resolved', 'data_deletion_requests'), async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const requestId = Number(req.params.id);
    const { action, admin_notes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    try {
        const request = await get(`SELECT * FROM data_deletion_requests WHERE id = ?`, [requestId]);
        if (!request) {
            return res.status(404).json({ error: 'Deletion request not found' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ error: `Request has already been ${request.status}` });
        }

        const targetUserId = request.user_id;

        if (action === 'approve') {
            // Anonymize the user record while preserving relational integrity for historical logs
            await run(`
                UPDATE users SET
                    name = 'Anonymized Candidate #' || id,
                    email = 'anonymized_' || id || '@deleted.local',
                    phone = NULL,
                    bio = NULL,
                    prn = NULL,
                    resume_path = NULL,
                    profile_picture_url = NULL,
                    github_url = NULL,
                    linkedin_url = NULL,
                    portfolio_url = NULL,
                    skills = '[]',
                    interests = '[]',
                    projects = '[]',
                    achievements = '[]',
                    is_anonymized = 1,
                    is_active = 0
                WHERE id = ?
            `, [targetUserId]);

            await run(`
                UPDATE data_deletion_requests SET
                    status = 'completed',
                    admin_notes = ?,
                    reviewed_by = ?,
                    resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [admin_notes || 'Approved and candidate personal data anonymized.', req.user.id, requestId]);
        } else {
            await run(`
                UPDATE data_deletion_requests SET
                    status = 'rejected',
                    admin_notes = ?,
                    reviewed_by = ?,
                    resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [admin_notes || 'Request rejected by administrator.', req.user.id, requestId]);

            // Notify user of rejection
            await dispatchNotification(db, {
                userId: targetUserId,
                title: 'Data Deletion Request Update',
                message: `Your account deletion request was rejected. Notes: ${admin_notes || 'Contact administrator for details.'}`,
                link: '/student/profile',
                eventType: 'system'
            });
        }

        req.activityEntityId = requestId;
        res.json({
            id: requestId,
            status: action === 'approve' ? 'completed' : 'rejected',
            message: `Deletion request ${action === 'approve' ? 'approved and executed' : 'rejected'}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to process deletion request' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RETENTION POLICIES & AUTOMATED RETENTION CLEANER
// ─────────────────────────────────────────────────────────────────────────────
router.get('/retention/policies', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const policies = await all(`SELECT * FROM data_retention_policies ORDER BY id ASC`);
        const recentLogs = await all(`
            SELECT drl.*, u.name AS purged_by_name
            FROM data_retention_logs drl
            LEFT JOIN users u ON u.id = drl.purged_by
            ORDER BY drl.purged_at DESC
            LIMIT 20
        `);

        res.json({ policies, recent_purges: recentLogs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load retention policies' });
    }
});

router.put('/retention/policies/:id', authenticateToken, withTransaction(db, 'privacy.retention.updated', 'data_retention_policies'), async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const policyId = Number(req.params.id);
    const { retention_days, is_active } = req.body;

    if (retention_days != null && (typeof retention_days !== 'number' || retention_days < 7 || retention_days > 3650)) {
        return res.status(400).json({ error: 'Retention days must be between 7 and 3650' });
    }

    try {
        const policy = await get(`SELECT * FROM data_retention_policies WHERE id = ?`, [policyId]);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        const newDays = retention_days ?? policy.retention_days;
        const newActive = is_active != null ? (is_active ? 1 : 0) : policy.is_active;

        await run(`
            UPDATE data_retention_policies SET
                retention_days = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newDays, newActive, policyId]);

        req.activityEntityId = policyId;
        res.json({ id: policyId, retention_days: newDays, is_active: newActive, message: 'Retention policy updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update retention policy' });
    }
});

router.post('/retention/purge', authenticateToken, withTransaction(db, 'privacy.retention.purged', 'data_retention_logs'), async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { entity_type } = req.body; // e.g. 'notifications' or omitted for all active

    try {
        let policies = await all(`SELECT * FROM data_retention_policies WHERE is_active = 1`);
        if (entity_type) {
            policies = policies.filter(p => p.entity_type === entity_type);
        }

        let totalPurged = 0;
        const purgeSummary = [];

        for (const policy of policies) {
            let purgedCount = 0;

            if (policy.entity_type === 'notifications') {
                // Purge read notifications older than policy.retention_days
                const cutoffResult = await run(`
                    DELETE FROM notifications
                    WHERE is_read = 1
                      AND created_at < datetime('now', '-' || ? || ' days')
                `, [policy.retention_days]);

                purgedCount = cutoffResult.changes || 0;
            } else if (policy.entity_type === 'support_tickets') {
                // We do not delete tickets directly, but ensure closed tickets are marked as archived
                const cutoffResult = await run(`
                    UPDATE support_tickets
                    SET status = 'closed'
                    WHERE status = 'resolved'
                      AND updated_at < datetime('now', '-' || ? || ' days')
                `, [policy.retention_days]);

                purgedCount = cutoffResult.changes || 0;
            }

            if (purgedCount > 0 || entity_type) {
                await run(`
                    INSERT INTO data_retention_logs (entity_type, records_purged, purged_by, notes)
                    VALUES (?, ?, ?, ?)
                `, [
                    policy.entity_type,
                    purgedCount,
                    req.user.id,
                    `Routine purge using ${policy.retention_days}-day window`
                ]);

                await run(`
                    UPDATE data_retention_policies
                    SET last_purged_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [policy.id]);
            }

            totalPurged += purgedCount;
            purgeSummary.push({ entity_type: policy.entity_type, records_purged: purgedCount });
        }

        req.activityEntityId = req.user.id;
        res.json({
            message: `Retention purge executed successfully. Total records affected: ${totalPurged}`,
            summary: purgeSummary
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to execute retention purge' });
    }
});

module.exports = router;
