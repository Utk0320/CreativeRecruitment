const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');
const aiService = require('../services/ai');

// Helper to reliably parse SQLite UTC timestamps across timezones
function parseUtcTime(timestamp) {
    if (!timestamp) return Date.now();
    const str = String(timestamp).trim();
    if (str.endsWith('Z')) return new Date(str).getTime();
    return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

// ── GET /drive/:driveId — Fetch test for a drive ─────────────────────────────
router.get('/drive/:driveId', authenticateToken, (req, res) => {
    const driveId = Number(req.params.driveId);
    db.get('SELECT * FROM drive_tests WHERE drive_id = ? ORDER BY id DESC LIMIT 1', [driveId], (err, test) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch test' });
        if (!test) return res.json(null);

        let questions = [];
        try {
            questions = typeof test.questions_json === 'string' ? JSON.parse(test.questions_json) : test.questions_json;
        } catch {}

        // For students, redact the correct_option from questions
        if (req.user.role === 'student') {
            questions = questions.map(q => {
                const { correct_option, ...safeQ } = q;
                return safeQ;
            });
        }

        res.json({
            ...test,
            questions
        });
    });
});

// ── POST /drive/:driveId — Create or update test definition ─────────────────
router.post('/drive/:driveId', authenticateToken, requireRole('coordinator'), withTransaction(db, 'test.created_or_updated', 'drive_test'), async (req, res) => {
    const driveId = Number(req.params.driveId);
    const { title, description, duration_minutes = 60, questions = [], stage_id, total_points = 100 } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Test title is required' });
    }

    db.get('SELECT club_id FROM recruitment_drives WHERE id = ?', [driveId], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canEdit = await can(db, req.user, 'drive.edit', { clubId: drive.club_id });
        if (!canEdit) return res.status(403).json({ error: 'Not authorized to configure tests' });

        const questionsJson = JSON.stringify(questions);

        db.get('SELECT id FROM drive_tests WHERE drive_id = ?', [driveId], (e, existing) => {
            if (existing) {
                db.run(`
                    UPDATE drive_tests
                    SET title = ?, description = ?, duration_minutes = ?, questions_json = ?, stage_id = ?, total_points = ?
                    WHERE id = ?
                `, [title.trim(), description || '', duration_minutes, questionsJson, stage_id || null, total_points, existing.id], function(uErr) {
                    if (uErr) return res.status(500).json({ error: 'Failed to update test' });
                    req.activityEntityId = existing.id;
                    req.activityClubId = drive.club_id;
                    req.activityAfterJson = { title, questions_count: questions.length };
                    res.json({ id: existing.id, drive_id: driveId, message: 'Test updated successfully' });
                });
            } else {
                db.run(`
                    INSERT INTO drive_tests (drive_id, stage_id, title, description, duration_minutes, questions_json, total_points)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [driveId, stage_id || null, title.trim(), description || '', duration_minutes, questionsJson, total_points], function(iErr) {
                    if (iErr) return res.status(500).json({ error: 'Failed to create test' });
                    req.activityEntityId = this.lastID;
                    req.activityClubId = drive.club_id;
                    req.activityAfterJson = { title, questions_count: questions.length };
                    res.status(201).json({ id: this.lastID, drive_id: driveId, message: 'Test created successfully' });
                });
            }
        });
    });
});

// ── POST /applications/:appId/start — Student begins a test attempt ─────────
router.post('/applications/:appId/start', authenticateToken, requireRole('student'), withTransaction(db, 'test.started', 'test_submission'), (req, res) => {
    const appId = Number(req.params.appId);

    db.get(`
        SELECT a.*, rd.club_id, dt.id AS test_id, dt.duration_minutes, dt.questions_json, dt.title AS test_title
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN drive_tests dt ON dt.drive_id = rd.id
        WHERE a.id = ? AND a.student_id = ?
    `, [appId, req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Application or assessment not found' });

        // Check if candidate already has submissions
        db.all('SELECT * FROM test_submissions WHERE application_id = ? ORDER BY attempt_number DESC', [appId], (sErr, submissions) => {
            if (sErr) return res.status(500).json({ error: 'Database error' });

            const lastSubmission = submissions[0];
            if (lastSubmission) {
                // If in progress, return current session
                if (lastSubmission.status === 'in_progress') {
                    return res.json({
                        submission_id: lastSubmission.id,
                        started_at: lastSubmission.started_at,
                        duration_minutes: row.duration_minutes,
                        attempt_number: lastSubmission.attempt_number,
                        already_active: true
                    });
                }
                // If completed, check if extra attempt was granted
                if (!lastSubmission.extra_attempt_granted_by) {
                    return res.status(400).json({ error: 'Assessment already completed. Contact a coordinator to request an extra attempt.' });
                }
            }

            const nextAttempt = (lastSubmission ? lastSubmission.attempt_number : 0) + 1;

            db.run(`
                INSERT INTO test_submissions (test_id, application_id, student_id, started_at, attempt_number, status)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'in_progress')
            `, [row.test_id, appId, req.user.id, nextAttempt], function(insErr) {
                if (insErr) return res.status(500).json({ error: 'Failed to start assessment' });

                req.activityEntityId = this.lastID;
                req.activityClubId = row.club_id;
                req.activityAfterJson = { test_id: row.test_id, attempt_number: nextAttempt };

                res.status(201).json({
                    submission_id: this.lastID,
                    test_id: row.test_id,
                    started_at: new Date().toISOString(),
                    duration_minutes: row.duration_minutes,
                    attempt_number: nextAttempt
                });
            });
        });
    });
});

// ── GET /applications/:appId/status — Check timer and submission status ──────
router.get('/applications/:appId/status', authenticateToken, (req, res) => {
    const appId = Number(req.params.appId);
    db.get(`
        SELECT ts.*, dt.duration_minutes, dt.title AS test_title, dt.total_points
        FROM test_submissions ts
        JOIN drive_tests dt ON ts.test_id = dt.id
        WHERE ts.application_id = ?
        ORDER BY ts.id DESC LIMIT 1
    `, [appId], (err, sub) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!sub) return res.json({ has_attempt: false });

        const startedTime = parseUtcTime(sub.started_at);
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startedTime) / 1000);
        const totalSeconds = sub.duration_minutes * 60;
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

        res.json({
            has_attempt: true,
            submission_id: sub.id,
            status: sub.status,
            started_at: sub.started_at,
            submitted_at: sub.submitted_at,
            duration_minutes: sub.duration_minutes,
            elapsed_seconds: elapsedSeconds,
            remaining_seconds: remainingSeconds,
            score: sub.score,
            auto_graded_score: sub.auto_graded_score,
            manual_score: sub.manual_score,
            attempt_number: sub.attempt_number
        });
    });
});

// ── POST /applications/:appId/submit — Student submits test answers ──────────
router.post('/applications/:appId/submit', authenticateToken, requireRole('student'), withTransaction(db, 'test.submitted', 'test_submission'), (req, res) => {
    const appId = Number(req.params.appId);
    const { answers = {} } = req.body;

    db.get(`
        SELECT ts.*, dt.duration_minutes, dt.questions_json, dt.total_points, rd.club_id
        FROM test_submissions ts
        JOIN drive_tests dt ON ts.test_id = dt.id
        JOIN applications a ON ts.application_id = a.id
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        WHERE ts.application_id = ? AND ts.student_id = ? AND ts.status = 'in_progress'
        ORDER BY ts.id DESC LIMIT 1
    `, [appId, req.user.id], (err, sub) => {
        if (err || !sub) {
            return res.status(404).json({ error: 'No active in-progress assessment found to submit' });
        }

        // Server-side timer verification (allow 2-minute latency grace period)
        const startedTime = parseUtcTime(sub.started_at);
        const elapsedSeconds = (Date.now() - startedTime) / 1000;
        const maxAllowedSeconds = (sub.duration_minutes * 60) + 120;
        const isTimedOut = elapsedSeconds > maxAllowedSeconds;

        let questions = [];
        try {
            questions = typeof sub.questions_json === 'string' ? JSON.parse(sub.questions_json) : sub.questions_json;
        } catch {}

        // Auto-grade MCQs
        let autoScore = 0;
        let autoGradableCount = 0;
        let requiresManualGrading = false;

        questions.forEach(q => {
            const points = q.points || 10;
            if (q.type === 'mcq') {
                autoGradableCount++;
                const studentAns = answers[q.id];
                if (studentAns !== undefined && String(studentAns).trim() === String(q.correct_option).trim()) {
                    autoScore += points;
                }
            } else {
                requiresManualGrading = true;
            }
        });

        const status = isTimedOut ? 'timed_out' : (requiresManualGrading ? 'submitted' : 'graded');
        const finalScore = requiresManualGrading ? null : autoScore;

        db.run(`
            UPDATE test_submissions
            SET answers_json = ?, submitted_at = CURRENT_TIMESTAMP, auto_graded_score = ?,
                score = ?, status = ?
            WHERE id = ?
        `, [JSON.stringify(answers), autoScore, finalScore, status, sub.id], function(uErr) {
            if (uErr) return res.status(500).json({ error: 'Failed to record test submission' });

            req.activityEntityId = sub.id;
            req.activityClubId = sub.club_id;
            req.activityAfterJson = {
                status,
                auto_score: autoScore,
                timed_out: isTimedOut
            };

            res.json({
                message: isTimedOut ? 'Assessment submitted automatically after time expired' : 'Assessment submitted successfully',
                status,
                auto_graded_score: autoScore,
                score: finalScore,
                requires_manual_grading: requiresManualGrading
            });
        });
    });
});

// ── POST /applications/:appId/grant-retry — Coordinator grants re-attempt ────
router.post('/applications/:appId/grant-retry', authenticateToken, requireRole('coordinator'), withTransaction(db, 'test.retry_granted', 'test_submission'), async (req, res) => {
    const appId = Number(req.params.appId);

    db.get(`
        SELECT a.*, rd.club_id
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        WHERE a.id = ?
    `, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.run(`
            UPDATE test_submissions
            SET extra_attempt_granted_by = ?
            WHERE application_id = ? AND id = (
                SELECT id FROM test_submissions WHERE application_id = ? ORDER BY id DESC LIMIT 1
            )
        `, [req.user.id, appId, appId], function(uErr) {
            if (uErr) return res.status(500).json({ error: 'Failed to grant re-attempt' });

            req.activityEntityId = appId;
            req.activityClubId = app.club_id;
            req.activityAfterJson = { extra_attempt_granted_by: req.user.id };

            res.json({ message: 'Additional assessment attempt granted to student' });
        });
    });
});

// ── POST /submissions/:id/grade — Coordinator submits manual score & feedback 
router.post('/submissions/:id/grade', authenticateToken, requireRole('coordinator'), withTransaction(db, 'test.graded', 'test_submission'), async (req, res) => {
    const subId = Number(req.params.id);
    const { manual_score = 0, feedback = '' } = req.body;

    db.get(`
        SELECT ts.*, rd.club_id
        FROM test_submissions ts
        JOIN applications a ON ts.application_id = a.id
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        WHERE ts.id = ?
    `, [subId], async (err, sub) => {
        if (err || !sub) return res.status(404).json({ error: 'Submission not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: sub.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        const totalScore = (sub.auto_graded_score || 0) + Number(manual_score);

        db.run(`
            UPDATE test_submissions
            SET manual_score = ?, score = ?, feedback = ?, status = 'graded'
            WHERE id = ?
        `, [Number(manual_score), totalScore, feedback, subId], function(uErr) {
            if (uErr) return res.status(500).json({ error: 'Failed to update grades' });

            req.activityEntityId = subId;
            req.activityClubId = sub.club_id;
            req.activityAfterJson = { totalScore, feedback };

            res.json({
                message: 'Submission graded successfully',
                total_score: totalScore,
                auto_graded_score: sub.auto_graded_score,
                manual_score: Number(manual_score)
            });
        });
    });
});

module.exports = router;
