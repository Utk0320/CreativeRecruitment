const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { APPLICATION_STATUSES } = require('../utils/applicationAccess');
const { z } = require('zod');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');
const {
    OUTCOMES,
    OFFER_STATES,
    REASON_CODES,
    normalizeStages,
    validateOutcomeTransition,
    validateStageTransition,
    mapOutcomeToLegacyStatus
} = require('../utils/pipelineTransitions');
const aiService = require('../services/ai');

const applicationInputSchema = z.object({
    drive_id: z.coerce.number().int().positive(),
    portfolio_url: z.string().trim().url().max(2048).optional(),
    motivation: z.string().trim().max(10000).optional(),
    answers_snapshot: z.string().trim().max(50000).optional(),  // JSON string
    skills: z.union([z.string().max(10000), z.array(z.unknown())]).optional(),
    experience: z.string().max(10000).optional(),
    ai_consent: z.boolean().optional()
}).refine(value => Boolean(value.motivation || value.answers_snapshot), { message: 'Motivation or answers required' });
const notesSchema = z.object({ notes: z.string().trim().max(4000) });

const stageUpdateSchema = z.object({
    stage_id: z.string().trim().optional(),
    outcome: z.enum(OUTCOMES).optional(),
    offer_state: z.enum(OFFER_STATES).optional(),
    rejection_reason_code: z.enum(REASON_CODES).optional(),
    rejection_feedback: z.string().trim().max(2000).optional()
}).refine(data => data.stage_id || data.outcome || data.offer_state, { message: 'At least one field to update is required' });

const bulkStageSchema = z.object({
    application_ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
    stage_id: z.string().trim().optional(),
    outcome: z.enum(OUTCOMES).optional(),
    offer_state: z.enum(OFFER_STATES).optional(),
    rejection_reason_code: z.enum(REASON_CODES).optional(),
    rejection_feedback: z.string().trim().max(2000).optional()
}).refine(data => data.stage_id || data.outcome || data.offer_state, { message: 'At least one field to update is required' });

router.get('/', authenticateToken, (req, res) => {
    const sortFields = {
        applied: 'a.applied_at',
        status: 'a.status',
        drive: 'rd.title'
    };
    if (req.user.role !== 'student') sortFields.student = 'u.name';
    const options = parseListOptions(req.query, sortFields, 'applied');
    const conditions = [];
    const params = [];
    if (req.user.role === 'student') {
        conditions.push('a.student_id = ?');
        params.push(req.user.id);
    } else {
        conditions.push('cm.user_id = ?');
        params.push(req.user.id);
    }
    if (APPLICATION_STATUSES.includes(req.query.status)) {
        conditions.push('a.status = ?');
        params.push(req.query.status);
    }
    if (req.query.stage) {
        conditions.push('a.current_stage_id = ?');
        params.push(req.query.stage);
    }
    if (req.query.outcome) {
        conditions.push('a.outcome = ?');
        params.push(req.query.outcome);
    }
    if (options.search) {
        conditions.push('(rd.title LIKE ? OR a.motivation LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    const joins = req.user.role === 'student'
        ? `FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id`
        : `FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        JOIN club_members cm ON cm.club_id = c.id`;

    const selectFields = req.user.role === 'student'
        ? 'SELECT a.*, rd.title AS drive_title, rd.stages AS drive_stages, rd.expected_decision_date, rd.deadline, c.name AS club_name'
        : 'SELECT a.*, u.name AS student_name, u.email, u.department, u.year, rd.title AS drive_title, rd.stages AS drive_stages, rd.expected_decision_date, rd.deadline';
    const userJoin = req.user.role === 'student' ? '' : ' JOIN users u ON a.student_id = u.id';

    db.get(`SELECT COUNT(*) AS total ${joins} WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Request failed' });
        db.all(`${selectFields} ${joins}${userJoin} WHERE ${where}
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

router.get('/drive/:driveId', authenticateToken, requireRole('coordinator'), (req, res) => {
    const options = parseListOptions(req.query, {
        applied: 'a.applied_at',
        status: 'a.status',
        student: 'u.name'
    }, 'applied');
    const conditions = ['rd.id = ?', 'cm.user_id = ?'];
    const params = [req.params.driveId, req.user.id];
    if (APPLICATION_STATUSES.includes(req.query.status)) {
        conditions.push('a.status = ?');
        params.push(req.query.status);
    }
    if (req.query.stage) {
        conditions.push('a.current_stage_id = ?');
        params.push(req.query.stage);
    }
    if (req.query.outcome) {
        conditions.push('a.outcome = ?');
        params.push(req.query.outcome);
    }
    if (req.query.department) {
        conditions.push('u.department = ?');
        params.push(req.query.department);
    }
    if (req.query.year) {
        conditions.push('u.year = ?');
        params.push(Number(req.query.year));
    }
    if (req.query.assigned === 'me') {
        conditions.push('a.id IN (SELECT application_id FROM reviewer_assignments WHERE reviewer_id = ?)');
        params.push(req.user.id);
    }
    if (options.search) {
        conditions.push('(u.name LIKE ? OR a.motivation LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    const from = `FROM applications a
        JOIN users u ON u.id = a.student_id
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        JOIN club_members cm ON cm.club_id = c.id`;
    db.get(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Request failed' });
        db.all(`SELECT a.*, u.name AS student_name, u.email, u.department, u.year, rd.stages AS drive_stages, rd.title AS drive_title, rd.expected_decision_date, rd.blind_review, rd.hide_scores_until_submitted ${from}
            WHERE ${where} ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            setPaginationHeaders(res, options, result.total);

            const processedRows = (rows || []).map(r => {
                if (r.blind_review && req.user.role !== 'admin') {
                    return {
                        ...r,
                        student_name: `Candidate #${r.id}`,
                        email: 'redacted@blind.review',
                        phone: null,
                        portfolio_url: null
                    };
                }
                return r;
            });

            res.json(processedRows);
        });
    });
});


router.get('/:id/profile', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.get(`SELECT u.id, u.name, u.email, u.department, u.year, u.phone, u.portfolio_url,
            u.bio, u.profile_picture_url, u.skills, u.interests, u.projects,
            u.achievements, u.github_url, u.linkedin_url,
            rd.title AS drive_title, rd.blind_review, c.name AS club_name
        FROM applications a
        JOIN users u ON u.id = a.student_id
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        JOIN club_members cm ON cm.club_id = c.id
        WHERE a.id = ? AND cm.user_id = ?`,
        [req.params.id, req.user.id], (err, profile) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            if (!profile) return res.status(404).json({ error: 'Application not found' });

            if (profile.blind_review && req.user.role !== 'admin') {
                profile.name = `Candidate #${profile.id}`;
                profile.email = 'redacted@blind.review';
                profile.phone = null;
                profile.portfolio_url = null;
                profile.profile_picture_url = null;
                profile.github_url = null;
                profile.linkedin_url = null;
            }

            res.json(profile);
        });
});


router.put('/:id/notes', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.notes.updated', 'application'), (req, res) => {
    const parsed = notesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid notes' });
    const { notes } = parsed.data;
    db.get(`SELECT a.id
        FROM applications a
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        JOIN club_members cm ON cm.club_id = c.id
        WHERE a.id = ? AND cm.user_id = ?`, [req.params.id, req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Request failed' });
        if (!row) return res.status(403).json({ error: 'Not authorized' });

        db.run('UPDATE applications SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [notes, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            res.json({ message: 'Application notes saved' });
        });
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get(`SELECT a.*,
            u.name AS student_name, u.email, u.department, u.year,
            rd.title AS drive_title, rd.stages AS drive_stages, rd.expected_decision_date, rd.deadline, rd.blind_review, rd.hide_scores_until_submitted,
            c.name AS club_name,
            CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
        FROM applications a
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        LEFT JOIN users u ON u.id = a.student_id
        LEFT JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
        WHERE a.id = ?`, [req.user.id, req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Unable to load application' });
        if (!row) return res.status(404).json({ error: 'Not found' });
        // Students can only see their own applications; coordinators must be club members; admin can see all
        const allowed =
            req.user.role === 'admin' ||
            (req.user.role === 'student' && Number(row.student_id) === Number(req.user.id)) ||
            (req.user.role === 'coordinator' && row.is_member === 1);
        if (!allowed) return res.status(404).json({ error: 'Not found' });
        delete row.is_member;

        if (row.blind_review && req.user.role === 'coordinator') {
            row.student_name = `Candidate #${row.id}`;
            row.email = 'redacted@blind.review';
            row.portfolio_url = null;
            if (row.profile_snapshot) {
                try {
                    const snap = JSON.parse(row.profile_snapshot);
                    snap.name = `Candidate #${row.id}`;
                    snap.email = 'redacted@blind.review';
                    snap.phone = null;
                    snap.github_url = null;
                    snap.linkedin_url = null;
                    snap.portfolio_url = null;
                    snap.profile_picture_url = null;
                    row.profile_snapshot = JSON.stringify(snap);
                } catch {}
            }
        }

        res.json(row);
    });
});


router.post('/', authenticateToken, requireRole('student'), withTransaction(db, 'application.created', 'application'), (req, res) => {
    const parsed = applicationInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    const { drive_id, portfolio_url, motivation, answers_snapshot, skills, experience, ai_consent } = parsed.data;

    db.get('SELECT email_verified_at FROM users WHERE id = ?', [req.user.id], (verificationErr, student) => {
        if (verificationErr) return res.status(500).json({ error: 'Unable to verify student account' });
        if (!student?.email_verified_at) return res.status(403).json({ error: 'Verify your college email before applying' });
        if (!ai_consent) return res.status(400).json({ error: 'AI processing consent is required to submit' });


        db.get('SELECT id, status, deadline, club_id, season_id, stages FROM recruitment_drives WHERE id = ?', [drive_id], (err, drive) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            if (!drive) return res.status(404).json({ error: 'Drive not found' });
            if (!['open', 'published'].includes(drive.status)) return res.status(409).json({ error: 'Drive is not accepting applications' });
            if (new Date(drive.deadline) < new Date()) return res.status(409).json({ error: 'Drive deadline has passed' });

            // Per-season simultaneous app limit
            const checkLimit = (next) => {
                if (!drive.season_id) return next();
                db.get('SELECT simultaneous_app_limit FROM recruitment_seasons WHERE id = ?', [drive.season_id], (e, season) => {
                    if (e || !season?.simultaneous_app_limit) return next();
                    db.get(`SELECT COUNT(*) AS cnt FROM applications
                        WHERE student_id = ? AND is_withdrawn = 0
                        AND drive_id IN (SELECT id FROM recruitment_drives WHERE season_id = ?)`,
                        [req.user.id, drive.season_id], (e2, row) => {
                            if (e2) return res.status(500).json({ error: 'Request failed' });
                            if (row.cnt >= season.simultaneous_app_limit) {
                                return res.status(409).json({ error: `Simultaneous application limit (${season.simultaneous_app_limit}) reached for this season` });
                            }
                            next();
                        });
                });
            };

            checkLimit(() => {
                // Freeze profile snapshot at submit time
                db.get(`SELECT name, email, department, year, bio, skills, interests, projects, achievements,
                        github_url, linkedin_url, portfolio_url, resume_path FROM users WHERE id = ?`,
                    [req.user.id], (e, profile) => {
                    if (e || !profile) return res.status(500).json({ error: 'Cannot load profile' });
                    const profileSnapshot = JSON.stringify(profile);
                    const finalPortfolio = portfolio_url || profile.portfolio_url || '';
                    const finalMotivation = motivation || '';

                    // Check for existing non-withdrawn application (re-submit path)
                    db.get('SELECT id, version FROM applications WHERE drive_id = ? AND student_id = ? AND is_withdrawn = 0',
                        [drive_id, req.user.id], (e2, existing) => {
                        if (e2) return res.status(500).json({ error: 'Request failed' });

                        if (existing) {
                            // Archive current version then update
                            const newVersion = (existing.version || 1) + 1;
                            db.run(`INSERT INTO application_versions
                                    (application_id, version, profile_snapshot, answers_snapshot, ai_consent_at)
                                    SELECT id, version, profile_snapshot, answers_snapshot, ai_consent_at
                                    FROM applications WHERE id = ?`, [existing.id], (e3) => {
                                if (e3) return res.status(500).json({ error: 'Request failed' });
                                db.run(`UPDATE applications SET
                                    profile_snapshot = ?, answers_snapshot = ?, motivation = ?,
                                    skills = ?, experience = ?, portfolio_url = ?,
                                    version = ?, ai_consent_at = CURRENT_TIMESTAMP,
                                    submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?`,
                                    [profileSnapshot, answers_snapshot || null, finalMotivation,
                                     skills || '', experience || '', finalPortfolio,
                                     newVersion, existing.id], function(e4) {
                                        if (e4) return res.status(500).json({ error: 'Request failed' });
                                        req.activityEntityId = existing.id;
                                        req.activityClubId = drive.club_id;
                                        res.json({ id: existing.id, version: newVersion, resubmitted: true });
                                    });
                            });
                            return;
                        }

                        // New application
                        const driveStages = normalizeStages(drive.stages);
                        const initialStageId = driveStages[0]?.id || 'screening';

                        db.run(`INSERT INTO applications
                            (drive_id, student_id, portfolio_url, motivation, answers_snapshot,
                             profile_snapshot, skills, experience, status, version,
                             ai_consent_at, submitted_at, current_stage_id, outcome, offer_state)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Applied', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'Pending', 'None')`,
                            [drive_id, req.user.id, finalPortfolio, finalMotivation,
                             answers_snapshot || null, profileSnapshot, skills || '', experience || '', initialStageId],
                            function(e5) {
                                if (e5) return res.status(500).json({ error: 'Request failed' });
                                req.activityEntityId = this.lastID;
                                req.activityClubId = drive.club_id;
                                res.status(201).json({ id: this.lastID, version: 1, current_stage_id: initialStageId, outcome: 'Pending' });
                            });
                    });
                });
            });
        });
    });
});

// PATCH /:id/withdraw — student withdraws own application before deadline
router.patch('/:id/withdraw', authenticateToken, requireRole('student'), withTransaction(db, 'application.withdrawn', 'application'), (req, res) => {
    db.get(`SELECT a.id, a.student_id, a.is_withdrawn, rd.deadline
            FROM applications a JOIN recruitment_drives rd ON rd.id = a.drive_id
            WHERE a.id = ?`, [req.params.id], (err, app) => {
        if (err) return res.status(500).json({ error: 'Request failed' });
        if (!app) return res.status(404).json({ error: 'Not found' });
        if (Number(app.student_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
        if (app.is_withdrawn) return res.status(409).json({ error: 'Already withdrawn' });
        if (new Date(app.deadline) < new Date()) return res.status(409).json({ error: 'Cannot withdraw after deadline' });

        db.run(`UPDATE applications SET is_withdrawn = 1, withdrawn_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [app.id], function(e) {
            if (e) return res.status(500).json({ error: 'Request failed' });
            req.activityEntityId = app.id;
            res.json({ message: 'Application withdrawn' });
        });
    });
});

router.put('/:id', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.status.updated', 'application'), (req, res) => {
    const { status } = req.body;
    const appId = req.params.id;

    if (!APPLICATION_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Unsupported application status' });
    }

    // Verify coordinator is a member of the club that owns this drive
    db.get(`SELECT c.id AS club_id, a.student_id, rd.title as drive_title, c.name as club_name,
                cm.user_id AS member_user_id
            FROM applications a
            JOIN recruitment_drives rd ON a.drive_id = rd.id
            JOIN clubs c ON rd.club_id = c.id
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
            WHERE a.id = ?`, [req.user.id, appId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Not authorized' });
        req.activityEntityId = Number(appId);
        req.activityClubId = row.club_id;

        // Derive aligned outcome
        let outcome = 'Pending';
        if (status === 'Selected') outcome = 'Selected';
        else if (status === 'Rejected') outcome = 'Rejected';
        else if (status === 'Shortlisted') outcome = 'Advanced';

        db.run(`UPDATE applications SET status = ?, outcome = ?,
                decision_date = CASE WHEN ? IN ('Selected', 'Rejected') THEN CURRENT_TIMESTAMP ELSE decision_date END,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [status, outcome, outcome, appId], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });

            // Create notification for student
            const title = `Application ${status}`;
            const message = `Your application for ${row.drive_title} at ${row.club_name} has been marked as ${status}.`;
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [row.student_id, title, message, 'status_update']
            );

            res.json({ message: 'Status updated' });
        });
    });
});

// ── PATCH /:id/stage — stage & outcome advancement with transition rules ──────
router.patch('/:id/stage', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.stage.updated', 'application'), async (req, res) => {
    const parsed = stageUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

    const appId = req.params.id;
    const { stage_id, outcome, offer_state, rejection_reason_code, rejection_feedback } = parsed.data;

    db.get(`SELECT a.*, rd.club_id, rd.stages AS drive_stages, rd.title AS drive_title, c.name AS club_name
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });

        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Forbidden: not authorized to review applications for this club' });

        if (outcome === 'Selected') {
            const canDecide = await can(db, req.user, 'application.decide', { clubId: app.club_id });
            if (!canDecide) return res.status(403).json({ error: 'Forbidden: lead permission required for selection decisions' });
        }

        // Optimistic concurrency check
        if (req.body.version !== undefined && app.version !== undefined) {
            if (Number(req.body.version) !== Number(app.version)) {
                return res.status(409).json({
                    error: 'Conflict: This application has been modified by someone else since you loaded it. Please reload to see the latest changes.',
                    current_version: app.version
                });
            }
        }

        const driveStages = normalizeStages(app.drive_stages);
        let targetStageId = app.current_stage_id;

        if (stage_id && stage_id !== app.current_stage_id) {
            const stageCheck = validateStageTransition(app.current_stage_id, stage_id, driveStages);
            if (!stageCheck.valid) return res.status(400).json({ error: stageCheck.error });
            targetStageId = stage_id;
        }

        let targetOutcome = outcome || app.outcome;
        if (stage_id && stage_id !== app.current_stage_id && !outcome) {
            targetOutcome = 'Pending';
        }

        const outcomeCheck = validateOutcomeTransition(app.outcome, targetOutcome, rejection_reason_code || app.rejection_reason_code);
        if (!outcomeCheck.valid) return res.status(400).json({ error: outcomeCheck.error });

        const targetOfferState = offer_state || app.offer_state || 'None';
        const finalReasonCode = ['Rejected', 'Waitlisted'].includes(targetOutcome) ? (rejection_reason_code || app.rejection_reason_code) : null;
        const finalFeedback = rejection_feedback !== undefined ? rejection_feedback : app.rejection_feedback;
        const legacyStatus = mapOutcomeToLegacyStatus(targetOutcome, targetStageId, driveStages);

        const nextVersion = (app.version || 1) + 1;
        req.activityEntityId = Number(appId);
        req.activityClubId = app.club_id;
        req.activityBeforeJson = { stage: app.current_stage_id, outcome: app.outcome, version: app.version };
        req.activityAfterJson = { stage: targetStageId, outcome: targetOutcome, version: nextVersion };

        db.run(`UPDATE applications SET
                current_stage_id = ?,
                outcome = ?,
                offer_state = ?,
                rejection_reason_code = ?,
                rejection_feedback = ?,
                decision_date = CASE WHEN ? IN ('Selected', 'Rejected', 'Waitlisted') THEN CURRENT_TIMESTAMP ELSE decision_date END,
                decided_by = CASE WHEN ? IN ('Selected', 'Rejected', 'Waitlisted') THEN ? ELSE decided_by END,
                status = ?,
                version = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [targetStageId, targetOutcome, targetOfferState, finalReasonCode, finalFeedback, targetOutcome, targetOutcome, req.user.id, legacyStatus, nextVersion, appId],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: 'Request failed' });

                const stageObj = driveStages.find(s => s.id === targetStageId);
                const stageLabel = stageObj ? stageObj.name : targetStageId;
                const notifTitle = `Application Status: ${targetOutcome}`;
                const notifMsg = `Your application for ${app.drive_title} at ${app.club_name} is now in stage '${stageLabel}' with outcome '${targetOutcome}'.`;
                db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                    [app.student_id, notifTitle, notifMsg, 'status_update']
                );

                res.json({
                    message: 'Stage updated successfully',
                    current_stage_id: targetStageId,
                    outcome: targetOutcome,
                    offer_state: targetOfferState,
                    rejection_reason_code: finalReasonCode,
                    rejection_feedback: finalFeedback,
                    version: nextVersion
                });
            }
        );
    });
});

// ── POST /bulk-stage — bulk stage move and outcome transition ─────────────────
router.post('/bulk-stage', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.bulk_stage.updated', 'application'), async (req, res) => {
    const parsed = bulkStageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

    const { application_ids, stage_id, outcome, offer_state, rejection_reason_code, rejection_feedback } = parsed.data;
    const placeholders = application_ids.map(() => '?').join(',');

    db.all(`SELECT a.*, rd.club_id, rd.stages AS drive_stages, rd.title AS drive_title, c.name AS club_name
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            WHERE a.id IN (${placeholders})`, application_ids, async (err, apps) => {
        if (err || !apps || apps.length === 0) return res.status(404).json({ error: 'No matching applications found' });
        if (apps.length !== application_ids.length) return res.status(400).json({ error: 'Some applications could not be found' });

        for (const app of apps) {
            const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
            if (!canReview) return res.status(403).json({ error: `Not authorized to review applications for club ${app.club_name}` });
            if (outcome === 'Selected') {
                const canDecide = await can(db, req.user, 'application.decide', { clubId: app.club_id });
                if (!canDecide) return res.status(403).json({ error: 'Lead permission required for selection decisions' });
            }

            const driveStages = normalizeStages(app.drive_stages);
            if (stage_id && stage_id !== app.current_stage_id) {
                const stageCheck = validateStageTransition(app.current_stage_id, stage_id, driveStages);
                if (!stageCheck.valid) return res.status(400).json({ error: stageCheck.error });
            }

            const targetOutcome = outcome || (stage_id && stage_id !== app.current_stage_id ? 'Pending' : app.outcome);
            const outcomeCheck = validateOutcomeTransition(app.outcome, targetOutcome, rejection_reason_code || app.rejection_reason_code);
            if (!outcomeCheck.valid) return res.status(400).json({ error: outcomeCheck.error });
        }

        req.activityEntityId = application_ids[0];
        req.activityClubId = apps[0].club_id;

        let updatedCount = 0;
        for (const app of apps) {
            const driveStages = normalizeStages(app.drive_stages);
            const targetStageId = stage_id || app.current_stage_id;
            let targetOutcome = outcome || app.outcome;
            if (stage_id && stage_id !== app.current_stage_id && !outcome) {
                targetOutcome = 'Pending';
            }
            const targetOfferState = offer_state || app.offer_state || 'None';
            const finalReason = ['Rejected', 'Waitlisted'].includes(targetOutcome) ? (rejection_reason_code || app.rejection_reason_code) : null;
            const finalFeedback = rejection_feedback !== undefined ? rejection_feedback : app.rejection_feedback;
            const legacyStatus = mapOutcomeToLegacyStatus(targetOutcome, targetStageId, driveStages);

            await new Promise((resolve, reject) => {
                db.run(`UPDATE applications SET
                        current_stage_id = ?,
                        outcome = ?,
                        offer_state = ?,
                        rejection_reason_code = ?,
                        rejection_feedback = ?,
                        decision_date = CASE WHEN ? IN ('Selected', 'Rejected', 'Waitlisted') THEN CURRENT_TIMESTAMP ELSE decision_date END,
                        status = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                    [targetStageId, targetOutcome, targetOfferState, finalReason, finalFeedback, targetOutcome, legacyStatus, app.id],
                    e => e ? reject(e) : resolve()
                );
            });
            updatedCount++;

            const stageObj = driveStages.find(s => s.id === targetStageId);
            const stageLabel = stageObj ? stageObj.name : targetStageId;
            const notifTitle = `Application Status: ${targetOutcome}`;
            const notifMsg = `Your application for ${app.drive_title} at ${app.club_name} is now in stage '${stageLabel}' with outcome '${targetOutcome}'.`;
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [app.student_id, notifTitle, notifMsg, 'status_update']
            );
        }

        res.json({ message: 'Bulk stage update successful', updated_count: updatedCount });
    });
});

// ── GET /drive/:driveId/export-csv — CSV export (requires export.data) ──────────
router.get('/drive/:driveId/export-csv', authenticateToken, requireRole('coordinator'), async (req, res) => {
    db.get(`SELECT rd.id, rd.club_id, rd.title, c.name AS club_name
            FROM recruitment_drives rd
            JOIN clubs c ON c.id = rd.club_id
            WHERE rd.id = ? AND rd.deleted_at IS NULL`, [req.params.driveId], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });

        const allowed = await can(db, req.user, 'export.data', { clubId: drive.club_id });
        if (!allowed) return res.status(403).json({ error: 'Forbidden: export.data permission required' });

        db.all(`SELECT a.id, u.name AS student_name, u.email, u.department, u.year,
                       a.current_stage_id, a.outcome, a.offer_state, a.rejection_reason_code,
                       a.rejection_feedback, a.applied_at, a.updated_at
                FROM applications a
                JOIN users u ON u.id = a.student_id
                WHERE a.drive_id = ?
                ORDER BY a.applied_at ASC`, [req.params.driveId], (err2, rows) => {
            if (err2) return res.status(500).json({ error: 'Request failed' });

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '""';
                const s = String(val).replace(/"/g, '""');
                return `"${s}"`;
            };

            const header = ['Application ID','Student Name','Email','Department','Year','Stage','Outcome','Offer State','Rejection Reason','Feedback','Applied At','Updated At'].map(escapeCsv).join(',');
            const lines = (rows || []).map(r => [
                r.id, r.student_name, r.email, r.department, r.year,
                r.current_stage_id, r.outcome, r.offer_state, r.rejection_reason_code,
                r.rejection_feedback, r.applied_at, r.updated_at
            ].map(escapeCsv).join(','));

            const csvContent = [header, ...lines].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="drive-${req.params.driveId}-applicants.csv"`);
            res.status(200).send(csvContent);
        });
    });
});

// ── Phase 5: Internal Comments ───────────────────────────────────────────────

router.get('/:id/comments', authenticateToken, (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ error: 'Internal comments are not accessible to students' });
    const appId = Number(req.params.id);

    db.get(`SELECT a.id, rd.club_id FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });

        const checkAuth = (cb) => {
            if (req.user.role === 'admin') return cb(true);
            db.get('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?', [app.club_id, req.user.id], (e, row) => cb(!e && Boolean(row)));
        };

        checkAuth((isMember) => {
            if (!isMember) return res.status(403).json({ error: 'Not authorized for this club' });

            db.all(`SELECT c.id, c.application_id, c.author_id, c.body, c.is_edited, c.created_at, c.updated_at,
                           u.name AS author_name, u.email AS author_email, u.role AS author_role
                    FROM application_comments c
                    JOIN users u ON u.id = c.author_id
                    WHERE c.application_id = ?
                    ORDER BY c.created_at ASC`, [appId], (err2, comments) => {
                if (err2) return res.status(500).json({ error: 'Failed to load comments' });
                res.json(comments || []);
            });
        });
    });
});

router.post('/:id/comments', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.comment.created', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Comment body is required' });
    }

    db.get(`SELECT a.id, rd.club_id, rd.title AS drive_title FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });

        db.get('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?', [app.club_id, req.user.id], (e, member) => {
            if (e || (!member && req.user.role !== 'admin')) return res.status(403).json({ error: 'Not authorized for this club' });

            db.run(`INSERT INTO application_comments (application_id, author_id, body) VALUES (?, ?, ?)`,
                [appId, req.user.id, body.trim()],
                function(insertErr) {
                    if (insertErr) return res.status(500).json({ error: 'Failed to save comment' });
                    const commentId = this.lastID;
                    req.activityEntityId = appId;
                    req.activityClubId = app.club_id;

                    const mentions = body.match(/@([a-zA-Z0-9._-]+)/g) || [];
                    for (const mention of mentions) {
                        const target = mention.slice(1);
                        db.all(`SELECT id FROM users WHERE (name LIKE ? OR email LIKE ?) AND role = 'coordinator'`,
                            [`%${target}%`, `%${target}%`], (mErr, users) => {
                                if (!mErr && users) {
                                    for (const u of users) {
                                        if (u.id !== req.user.id) {
                                            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                                                [u.id, 'Mentioned in comment', `${req.user.name || 'A team member'} mentioned you in a comment on application #${appId}`, 'mention']);
                                        }
                                    }
                                }
                            });
                    }

                    res.status(201).json({ id: commentId, application_id: appId, body: body.trim(), author_id: req.user.id, created_at: new Date().toISOString() });
                }
            );
        });
    });
});

router.put('/:id/comments/:commentId', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.comment.updated', 'application'), async (req, res) => {
    const commentId = Number(req.params.commentId);
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

    db.get('SELECT c.*, a.drive_id, rd.club_id FROM application_comments c JOIN applications a ON c.application_id = a.id JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE c.id = ?', [commentId], (err, comment) => {
        if (err || !comment) return res.status(404).json({ error: 'Comment not found' });
        if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only author may edit this comment' });
        }

        db.run('UPDATE application_comments SET body = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [body.trim(), commentId],
            function(upErr) {
                if (upErr) return res.status(500).json({ error: 'Failed to update comment' });
                req.activityEntityId = comment.application_id;
                req.activityClubId = comment.club_id;
                res.json({ id: commentId, body: body.trim(), is_edited: 1 });
            }
        );
    });
});

// ── Phase 5: Reviewer Assignments ─────────────────────────────────────────────

router.get('/drive/:driveId/assignments', authenticateToken, requireRole('coordinator'), (req, res) => {
    const driveId = Number(req.params.driveId);
    db.all(`SELECT ra.id, ra.application_id, ra.reviewer_id, ra.assigned_by, ra.created_at,
                   u.name AS reviewer_name, u.email AS reviewer_email
            FROM reviewer_assignments ra
            JOIN applications a ON ra.application_id = a.id
            JOIN users u ON ra.reviewer_id = u.id
            WHERE a.drive_id = ?`, [driveId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to load assignments' });
        res.json(rows || []);
    });
});

router.post('/:id/assign', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.reviewer.assigned', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    const reviewerIds = Array.isArray(req.body.reviewer_ids) ? req.body.reviewer_ids : (req.body.reviewer_id ? [req.body.reviewer_id] : []);
    if (!reviewerIds.length) return res.status(400).json({ error: 'reviewer_ids required' });

    db.get(`SELECT a.id, rd.club_id, rd.title AS drive_title FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        req.activityEntityId = appId;
        req.activityClubId = app.club_id;

        for (const rid of reviewerIds) {
            await new Promise((resolve) => {
                db.run(`INSERT OR IGNORE INTO reviewer_assignments (application_id, reviewer_id, assigned_by) VALUES (?, ?, ?)`,
                    [appId, rid, req.user.id], () => resolve());
            });
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [rid, 'New Application Assigned', `You have been assigned to review application #${appId} in ${app.drive_title}`, 'assignment']);
        }

        res.json({ message: 'Reviewers assigned successfully', application_id: appId, reviewer_ids: reviewerIds });
    });
});

router.delete('/:id/assign/:reviewerId', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.reviewer.unassigned', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    const reviewerId = Number(req.params.reviewerId);

    db.get(`SELECT a.id, rd.club_id FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        req.activityEntityId = appId;
        req.activityClubId = app.club_id;

        db.run(`DELETE FROM reviewer_assignments WHERE application_id = ? AND reviewer_id = ?`, [appId, reviewerId], function(delErr) {
            if (delErr) return res.status(500).json({ error: 'Failed to unassign reviewer' });
            res.json({ message: 'Reviewer unassigned' });
        });
    });
});

router.post('/drive/:driveId/auto-balance', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.reviewers.autobalanced', 'drive'), async (req, res) => {
    const driveId = Number(req.params.driveId);
    db.get(`SELECT rd.id, rd.club_id FROM recruitment_drives rd WHERE rd.id = ? AND rd.deleted_at IS NULL`, [driveId], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canAssign = await can(db, req.user, 'application.assign', { clubId: drive.club_id });
        if (!canAssign) return res.status(403).json({ error: 'Permission required to auto-balance' });

        db.all(`SELECT cm.user_id FROM club_members cm JOIN users u ON u.id = cm.user_id WHERE cm.club_id = ? AND u.is_active = 1`, [drive.club_id], (mErr, members) => {
            if (mErr || !members || !members.length) return res.status(400).json({ error: 'No active club members found to assign' });

            db.all(`SELECT a.id FROM applications a
                    WHERE a.drive_id = ? AND a.is_withdrawn = 0
                      AND a.id NOT IN (SELECT application_id FROM reviewer_assignments)`, [driveId], async (aErr, unassignedApps) => {
                if (aErr) return res.status(500).json({ error: 'Failed to find unassigned applications' });

                req.activityEntityId = driveId;
                req.activityClubId = drive.club_id;

                let assignedCount = 0;
                for (let i = 0; i < unassignedApps.length; i++) {
                    const reviewer = members[i % members.length];
                    await new Promise((resolve) => {
                        db.run(`INSERT OR IGNORE INTO reviewer_assignments (application_id, reviewer_id, assigned_by) VALUES (?, ?, ?)`,
                            [unassignedApps[i].id, reviewer.user_id, req.user.id], () => resolve());
                    });
                    assignedCount++;
                }

                res.json({ message: 'Auto-balance complete', assigned_count: assignedCount });
            });
        });
    });
});

// ── Phase 5: Panel Scorecards ─────────────────────────────────────────────────

router.get('/:id/scorecards', authenticateToken, requireRole('coordinator'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`SELECT a.id, rd.club_id, rd.hide_scores_until_submitted, rd.rubric
            FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });

        db.all(`SELECT s.*, u.name AS reviewer_name, u.email AS reviewer_email
                FROM scorecards s
                JOIN users u ON u.id = s.reviewer_id
                WHERE s.application_id = ?`, [appId], (sErr, cards) => {
            if (sErr) return res.status(500).json({ error: 'Failed to load scorecards' });

            const userSubmitted = (cards || []).some(c => c.reviewer_id === req.user.id);
            const isLeadOrAdmin = req.user.role === 'admin';

            let visibleCards = cards || [];
            if (app.hide_scores_until_submitted && !userSubmitted && !isLeadOrAdmin) {
                visibleCards = visibleCards.map(c => ({
                    id: c.id,
                    reviewer_id: c.reviewer_id,
                    reviewer_name: 'Reviewer',
                    scores_json: null,
                    total_score: null,
                    remarks: 'Hidden until your scorecard is submitted',
                    created_at: c.created_at
                }));
            }

            const numericScores = (cards || []).map(c => Number(c.total_score)).filter(s => !isNaN(s));
            const averageScore = numericScores.length ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length) : null;
            const disagreementFlag = numericScores.length >= 2 && (Math.max(...numericScores) - Math.min(...numericScores) >= 25);

            res.json({
                scorecards: visibleCards,
                average_score: averageScore !== null ? Number(averageScore.toFixed(2)) : null,
                disagreement_flag: disagreementFlag,
                user_submitted: userSubmitted
            });
        });
    });
});

router.post('/:id/scorecards', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.scorecard.submitted', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    const { scores, remarks } = req.body;
    if (!scores || typeof scores !== 'object') return res.status(400).json({ error: 'Scores object required' });

    db.get(`SELECT a.id, rd.club_id, rd.rubric FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        let total = 0;
        let rubricItems = [];
        try { if (app.rubric) rubricItems = JSON.parse(app.rubric); } catch {}

        if (rubricItems.length > 0) {
            for (const item of rubricItems) {
                const scoreVal = Number(scores[item.criterion] || scores[item.name] || 0);
                total += (scoreVal * (Number(item.weight) / 100));
            }
        } else {
            for (const val of Object.values(scores)) {
                total += Number(val) || 0;
            }
        }

        const scoresJson = JSON.stringify(scores);
        req.activityEntityId = appId;
        req.activityClubId = app.club_id;
        req.activityAfterJson = { total_score: total, reviewer_id: req.user.id };

        db.run(`INSERT INTO scorecards (application_id, reviewer_id, scores_json, total_score, remarks)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(application_id, reviewer_id) DO UPDATE SET
                    scores_json = excluded.scores_json,
                    total_score = excluded.total_score,
                    remarks = excluded.remarks,
                    updated_at = CURRENT_TIMESTAMP`,
            [appId, req.user.id, scoresJson, total, remarks || ''],
            function(scErr) {
                if (scErr) return res.status(500).json({ error: 'Failed to record scorecard' });
                res.json({ message: 'Scorecard recorded successfully', total_score: total, remarks: remarks || '' });
            }
        );
    });
});

// ── Phase 5: Maker-Checker & Undo ─────────────────────────────────────────────

router.post('/:id/propose', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.decision.proposed', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    const { proposed_outcome, proposed_stage_id } = req.body;
    if (!proposed_outcome && !proposed_stage_id) return res.status(400).json({ error: 'proposed_outcome or proposed_stage_id required' });

    db.get(`SELECT a.*, rd.club_id, rd.title AS drive_title FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        req.activityEntityId = appId;
        req.activityClubId = app.club_id;
        req.activityBeforeJson = { approval_status: app.approval_status };
        req.activityAfterJson = { proposed_outcome, proposed_stage_id, proposed_by: req.user.id };

        db.run(`UPDATE applications SET
                proposed_outcome = ?,
                proposed_stage_id = ?,
                proposed_by = ?,
                proposed_at = CURRENT_TIMESTAMP,
                approval_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [proposed_outcome || app.outcome, proposed_stage_id || app.current_stage_id, req.user.id, appId],
            function(pErr) {
                if (pErr) return res.status(500).json({ error: 'Failed to propose decision' });

                db.all("SELECT user_id FROM club_members WHERE club_id = ? AND role = 'lead'", [app.club_id], (errL, leads) => {
                    if (!errL && leads) {
                        for (const l of leads) {
                            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                                [l.user_id, 'Approval Needed', `${req.user.name || 'Coordinator'} proposed ${proposed_outcome || 'stage change'} for application #${appId} in ${app.drive_title}`, 'approval_needed']);
                        }
                    }
                });

                res.json({ message: 'Proposal submitted for lead approval', approval_status: 'pending' });
            }
        );
    });
});

router.post('/:id/approve', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.decision.approved', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`SELECT a.*, rd.club_id, rd.stages AS drive_stages, rd.title AS drive_title, c.name AS club_name
            FROM applications a
            JOIN recruitment_drives rd ON a.drive_id = rd.id
            JOIN clubs c ON rd.club_id = c.id
            WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canDecide = await can(db, req.user, 'application.decide', { clubId: app.club_id });
        if (!canDecide) return res.status(403).json({ error: 'Lead permission required to approve proposals' });

        if (app.approval_status !== 'pending') {
            return res.status(400).json({ error: 'No pending proposal to approve' });
        }

        const driveStages = normalizeStages(app.drive_stages);
        const targetStage = app.proposed_stage_id || app.current_stage_id;
        const targetOutcome = app.proposed_outcome || app.outcome;
        const legacyStatus = mapOutcomeToLegacyStatus(targetOutcome, targetStage, driveStages);
        const nextVersion = (app.version || 1) + 1;

        req.activityEntityId = appId;
        req.activityClubId = app.club_id;
        req.activityBeforeJson = { stage: app.current_stage_id, outcome: app.outcome, approval_status: app.approval_status };
        req.activityAfterJson = { stage: targetStage, outcome: targetOutcome, approval_status: 'approved' };

        db.run(`UPDATE applications SET
                current_stage_id = ?,
                outcome = ?,
                approval_status = 'approved',
                decision_date = CURRENT_TIMESTAMP,
                decided_by = ?,
                status = ?,
                version = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [targetStage, targetOutcome, req.user.id, legacyStatus, nextVersion, appId],
            function(apprErr) {
                if (apprErr) return res.status(500).json({ error: 'Failed to approve proposal' });

                const notifTitle = `Application Status: ${targetOutcome}`;
                const notifMsg = `Your application for ${app.drive_title} at ${app.club_name} is now ${targetOutcome}.`;
                db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                    [app.student_id, notifTitle, notifMsg, 'status_update']);

                res.json({ message: 'Proposal approved', current_stage_id: targetStage, outcome: targetOutcome, version: nextVersion });
            }
        );
    });
});

router.post('/:id/reject-proposal', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.decision.rejected_proposal', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`SELECT a.*, rd.club_id FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canDecide = await can(db, req.user, 'application.decide', { clubId: app.club_id });
        if (!canDecide) return res.status(403).json({ error: 'Lead permission required to reject proposals' });

        req.activityEntityId = appId;
        req.activityClubId = app.club_id;

        db.run(`UPDATE applications SET approval_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [appId], function(rejErr) {
            if (rejErr) return res.status(500).json({ error: 'Failed to reject proposal' });
            if (app.proposed_by) {
                db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                    [app.proposed_by, 'Proposal Rejected', `Your proposed decision for application #${appId} was rejected by a lead.`, 'proposal_rejected']);
            }
            res.json({ message: 'Proposal rejected' });
        });
    });
});

router.post('/:id/undo', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.stage.undone', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`SELECT a.*, rd.club_id FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.get(`SELECT * FROM activity_log
                WHERE entity_type = 'application' AND entity_id = ?
                  AND action IN ('application.stage.updated', 'application.status.updated')
                ORDER BY created_at DESC, id DESC LIMIT 1`, [appId], (lErr, lastLog) => {
            if (lErr || !lastLog || !lastLog.before_json) {
                return res.status(400).json({ error: 'No recent action found to undo' });
            }

            let beforeData;
            try { beforeData = JSON.parse(lastLog.before_json); } catch { return res.status(400).json({ error: 'Cannot parse prior state' }); }

            const restoredStage = beforeData.stage || 'screening';
            const restoredOutcome = beforeData.outcome || 'Pending';
            const nextVersion = (app.version || 1) + 1;

            req.activityEntityId = appId;
            req.activityClubId = app.club_id;
            req.activityBeforeJson = { stage: app.current_stage_id, outcome: app.outcome };
            req.activityAfterJson = { stage: restoredStage, outcome: restoredOutcome, undone_action: lastLog.action };

            db.run(`UPDATE applications SET
                    current_stage_id = ?,
                    outcome = ?,
                    version = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`, [restoredStage, restoredOutcome, nextVersion, appId], function(uErr) {
                if (uErr) return res.status(500).json({ error: 'Failed to undo stage change' });
                res.json({ message: 'Stage reverted successfully', current_stage_id: restoredStage, outcome: restoredOutcome, version: nextVersion });
            });
        });
    });
});

// ── GET /:id/ai-evaluation — Fetch stored AI evaluation ───────────────────────
router.get('/:id/ai-evaluation', authenticateToken, requireRole('coordinator'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`SELECT a.*, rd.club_id FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE a.id = ?`, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.get(`SELECT * FROM ai_evaluations WHERE application_id = ? ORDER BY id DESC LIMIT 1`, [appId], (eErr, row) => {
            if (eErr) return res.status(500).json({ error: 'Failed to fetch evaluation' });
            if (!row) return res.json(null);

            res.json({
                ...row,
                scores: JSON.parse(row.scores_json || '{}'),
                strengths: JSON.parse(row.strengths_json || '[]'),
                growth_areas: JSON.parse(row.growth_areas_json || '[]'),
                suggested_questions: JSON.parse(row.suggested_questions_json || '[]'),
                flags: JSON.parse(row.flags_json || '[]'),
                disclaimer: aiService.DISCLAIMER
            });
        });
    });
});

// ── POST /:id/ai-evaluate — Run rubric evaluation via AI ───────────────────────
router.post('/:id/ai-evaluate', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.ai_evaluated', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`
        SELECT a.*, rd.rubric, rd.title AS drive_title, rd.club_id,
               u.name AS student_name, u.email, u.department, u.year,
               u.skills, u.projects, u.achievements, u.bio
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        LEFT JOIN users u ON a.student_id = u.id
        WHERE a.id = ?
    `, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        // Consent check — applications without ai_consent cannot be sent to AI
        if (!app.ai_consent) {
            return res.status(400).json({ error: 'Candidate did not consent to AI-assisted evaluation' });
        }

        let rubric = [];
        try {
            if (app.rubric) {
                rubric = typeof app.rubric === 'string' ? JSON.parse(app.rubric) : app.rubric;
            }
        } catch {}

        try {
            const evaluation = await aiService.evaluateApplication({
                rubric,
                application: app,
                student: {
                    name: app.student_name,
                    department: app.department,
                    year: app.year,
                    skills: app.skills,
                    projects: app.projects,
                    achievements: app.achievements,
                    bio: app.bio
                }
            }, req.user.id, db);

            req.activityEntityId = appId;
            req.activityClubId = app.club_id;
            req.activityAfterJson = {
                total_score: evaluation.total_score,
                flags: evaluation.flags,
                model: evaluation.model
            };

            db.run(`
                INSERT INTO ai_evaluations
                    (application_id, scores_json, total_score, strengths_json, growth_areas_json,
                     suggested_questions_json, flags_json, summary, model, tokens_used)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                appId,
                JSON.stringify(evaluation.scores || {}),
                evaluation.total_score,
                JSON.stringify(evaluation.strengths || []),
                JSON.stringify(evaluation.growth_areas || []),
                JSON.stringify(evaluation.suggested_questions || []),
                JSON.stringify(evaluation.flags || []),
                evaluation.summary || '',
                evaluation.model || 'mock-claude-3-5-sonnet',
                evaluation.tokens_used || 0
            ], function(iErr) {
                if (iErr) return res.status(500).json({ error: 'Failed to save AI evaluation' });
                res.json({
                    id: this.lastID,
                    application_id: appId,
                    ...evaluation
                });
            });
        } catch (aiErr) {
            res.status(500).json({ error: aiErr.message || 'AI evaluation failed' });
        }
    });
});

// ── POST /:id/draft-email — Draft personalized decision / outreach email ─────
router.post('/:id/draft-email', authenticateToken, requireRole('coordinator'), withTransaction(db, 'application.email_drafted', 'application'), async (req, res) => {
    const appId = Number(req.params.id);
    db.get(`
        SELECT a.*, rd.title AS drive_title, rd.club_id, c.name AS club_name,
               u.name AS student_name, u.email
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        LEFT JOIN users u ON a.student_id = u.id
        WHERE a.id = ?
    `, [appId], async (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: app.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        const outcome = req.body?.outcome || app.outcome || 'Advanced';
        const feedback = req.body?.feedback || app.rejection_feedback || '';

        try {
            const emailDraft = await aiService.draftEmail({
                application: app,
                student: { name: app.student_name, email: app.email },
                drive: { title: app.drive_title },
                club: { name: app.club_name },
                outcome,
                feedback
            }, req.user.id, db);

            req.activityEntityId = appId;
            req.activityClubId = app.club_id;
            req.activityAfterJson = { outcome, subject: emailDraft.subject };

            res.json(emailDraft);
        } catch (aiErr) {
            res.status(500).json({ error: aiErr.message || 'Failed to draft email' });
        }
    });
});

module.exports = router;

