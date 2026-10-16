const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { parseDriveInput, getInitialDriveStatus, generateSlug, validateTransition, DRIVE_STATUSES } = require('../utils/driveValidation');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { withTransaction } = require('../utils/mutationBoundary');
const { z } = require('zod');
const { requirePermission } = require('../utils/can');
const { normalizeStages } = require('../utils/pipelineTransitions');

// JSON fields to serialize for storage
const JSON_FIELDS = ['required_skills','preferred_skills','allowed_years','allowed_departments','rubric','deal_breakers','custom_questions','stages'];
const safeJson = (v, fallback = '[]') => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
};

// Helper: build extra columns for INSERT/UPDATE from parsed data
const buildStructuredFields = (data, isUpdate = false) => {
    const cols = [];
    const vals = [];
    const fieldMap = {
        seats: data.seats !== undefined ? data.seats : (isUpdate ? undefined : null),
        required_skills: data.required_skills !== undefined ? safeJson(data.required_skills) : (isUpdate ? undefined : '[]'),
        preferred_skills: data.preferred_skills !== undefined ? safeJson(data.preferred_skills) : (isUpdate ? undefined : '[]'),
        allowed_years: data.allowed_years !== undefined ? safeJson(data.allowed_years) : (isUpdate ? undefined : '[]'),
        allowed_departments: data.allowed_departments !== undefined ? safeJson(data.allowed_departments) : (isUpdate ? undefined : '[]'),
        min_motivation_length: data.min_motivation_length !== undefined ? data.min_motivation_length : (isUpdate ? undefined : 0),
        rubric: data.rubric !== undefined ? safeJson(data.rubric) : (isUpdate ? undefined : '[]'),
        deal_breakers: data.deal_breakers !== undefined ? safeJson(data.deal_breakers) : (isUpdate ? undefined : '[]'),
        custom_questions: data.custom_questions !== undefined ? safeJson(data.custom_questions) : (isUpdate ? undefined : '[]'),
        stages: data.stages !== undefined ? safeJson(data.stages) : (isUpdate ? undefined : '[]'),
        expected_decision_date: data.expected_decision_date !== undefined ? (data.expected_decision_date || null) : (isUpdate ? undefined : null),
        is_template: data.is_template !== undefined ? (data.is_template ? 1 : 0) : (isUpdate ? undefined : 0),
        template_for_category: data.template_for_category !== undefined ? data.template_for_category : (isUpdate ? undefined : null),
        season_id: data.season_id !== undefined ? (data.season_id || null) : (isUpdate ? undefined : null)
    };
    for (const [k, v] of Object.entries(fieldMap)) {
        if (v !== undefined) { cols.push(k); vals.push(v); }
    }
    return { cols, vals };
};

// ── GET / — list drives ───────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
    const options = parseListOptions(req.query, {
        title: 'rd.title', deadline: 'rd.deadline', created: 'rd.created_at', club: 'c.name'
    }, 'created');
    const conditions = ['rd.deleted_at IS NULL', 'c.deleted_at IS NULL', 'rd.is_template = 0'];
    const params = [];
    if (options.search) {
        conditions.push('(rd.title LIKE ? OR c.name LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (DRIVE_STATUSES.includes(req.query.status)) {
        conditions.push('rd.status = ?'); params.push(req.query.status);
    } else if (req.user.role === 'student') {
        // Students only see published drives
        conditions.push("rd.status = 'published'");
    }
    const clubId = Number.parseInt(req.query.club_id, 10);
    if (Number.isInteger(clubId) && clubId > 0) { conditions.push('rd.club_id = ?'); params.push(clubId); }
    const seasonId = Number.parseInt(req.query.season_id, 10);
    if (Number.isInteger(seasonId) && seasonId > 0) { conditions.push('rd.season_id = ?'); params.push(seasonId); }
    const where = conditions.join(' AND ');

    db.get(`SELECT COUNT(*) AS total FROM recruitment_drives rd JOIN clubs c ON c.id = rd.club_id WHERE ${where}`,
        params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Request failed' });
        db.all(`SELECT rd.*, c.name AS club_name FROM recruitment_drives rd
            JOIN clubs c ON c.id = rd.club_id WHERE ${where}
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

// ── GET /templates — list drive templates ─────────────────────────────────────
router.get('/templates', authenticateToken, requireRole('coordinator'), (req, res) => {
    const params = [];
    const conditions = ['rd.is_template = 1', 'rd.deleted_at IS NULL'];
    if (req.query.category) { conditions.push('rd.template_for_category = ?'); params.push(req.query.category); }
    db.all(`SELECT rd.*, c.name AS club_name FROM recruitment_drives rd
        JOIN clubs c ON c.id = rd.club_id WHERE ${conditions.join(' AND ')}
        ORDER BY rd.created_at DESC`, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Request failed' });
        res.json(rows);
    });
});

// ── GET /slug/:slug — public published drive by slug ──────────────────────────
router.get('/slug/:slug', authenticateToken, (req, res) => {
    db.get(`SELECT rd.*, c.name AS club_name FROM recruitment_drives rd
        JOIN clubs c ON c.id = rd.club_id
        WHERE rd.shareable_slug = ? AND rd.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.params.slug], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Drive not found' });
        if (req.user.role === 'student' && row.status !== 'published') {
            return res.status(404).json({ error: 'Drive not found' });
        }
        res.json(row);
    });
});

// ── GET /:id — single drive ───────────────────────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
    db.get(`SELECT rd.*, c.name AS club_name FROM recruitment_drives rd
        JOIN clubs c ON rd.club_id = c.id
        WHERE rd.id = ? AND rd.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Drive not found' });
        if (req.user.role === 'student' && !['published', 'closed'].includes(row.status)) {
            return res.status(404).json({ error: 'Drive not found' });
        }
        res.json(row);
    });
});

// ── POST / — create drive (draft by default) ──────────────────────────────────
router.post('/', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.created', 'drive'), (req, res) => {
    const parsed = parseDriveInput({ ...req.body, status: req.body.status || 'draft' });
    if (!parsed.success) return res.status(400).json({ error: parsed.error || 'Invalid drive data' });

    const { club_id, title, description, eligibility, open_date, deadline } = parsed.data;
    const status = req.body.status || 'draft';
    const slug = generateSlug();
    const { cols, vals } = buildStructuredFields(parsed.data);

    db.get(`SELECT c.id FROM clubs c
        JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
        WHERE c.id = ? AND c.deleted_at IS NULL`, [req.user.id, club_id], (err, club) => {
        if (err || !club) return res.status(403).json({ error: 'Not authorized for this club' });

        const extraCols = cols.length ? ', ' + cols.join(', ') : '';
        const extraPlaceholders = vals.length ? ', ' + vals.map(() => '?').join(', ') : '';
        db.run(
            `INSERT INTO recruitment_drives (club_id, title, description, eligibility, open_date, deadline, status, shareable_slug${extraCols})
             VALUES (?, ?, ?, ?, ?, ?, ?, ?${extraPlaceholders})`,
            [club_id, title, description, eligibility, open_date, deadline, status, slug, ...vals],
            function(err) {
                if (err) return res.status(500).json({ error: 'Request failed' });
                req.activityEntityId = this.lastID;
                req.activityClubId = club_id;
                res.status(201).json({ id: this.lastID, slug });
            }
        );
    });
});

// ── PUT /:id — update drive fields (draft or published only) ──────────────────
router.put('/:id', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.updated', 'drive'), (req, res) => {
    const parsed = parseDriveInput({ ...req.body, club_id: 1 });
    if (!parsed.success) return res.status(400).json({ error: parsed.error || 'Invalid drive data' });
    const { title, description, eligibility, open_date, deadline } = parsed.data;
    const { cols, vals } = buildStructuredFields(parsed.data, true);

    db.get(`SELECT rd.*, c.id AS club_id FROM recruitment_drives rd
        JOIN clubs c ON rd.club_id = c.id
        JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
        WHERE rd.id = ? AND rd.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.user.id, req.params.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Not authorized' });
        if (!['draft', 'scheduled', 'published'].includes(row.status)) {
            return res.status(409).json({ error: `Cannot edit a ${row.status} drive` });
        }

        // Optimistic concurrency check
        if (req.body.version !== undefined && row.version !== undefined) {
            if (Number(req.body.version) !== Number(row.version)) {
                return res.status(409).json({
                    error: 'Conflict: This drive has been modified by someone else since you loaded it. Please reload to see the latest changes.',
                    current_version: row.version
                });
            }
        }

        const proceedUpdate = () => {
            req.activityEntityId = Number(req.params.id);
            req.activityClubId = row.club_id;
            req.activityBeforeJson = { title: row.title, version: row.version, status: row.status };

            const updateCols = [...cols];
            const updateVals = [...vals];

            if (req.body.blind_review !== undefined) {
                updateCols.push('blind_review');
                updateVals.push(req.body.blind_review ? 1 : 0);
            }
            if (req.body.hide_scores_until_submitted !== undefined) {
                updateCols.push('hide_scores_until_submitted');
                updateVals.push(req.body.hide_scores_until_submitted ? 1 : 0);
            }
            const nextVersion = (row.version || 1) + 1;
            updateCols.push('version');
            updateVals.push(nextVersion);

            req.activityAfterJson = { title, version: nextVersion };

            const extraSets = updateCols.map(c => `${c} = ?`).join(', ');
            const setSql = `title=?, description=?, eligibility=?, open_date=?, deadline=?${extraSets ? ', ' + extraSets : ''}`;
            db.run(`UPDATE recruitment_drives SET ${setSql} WHERE id = ?`,
                [title, description, eligibility, open_date, deadline, ...updateVals, req.params.id],
                function(updateErr) {
                    if (updateErr) return res.status(500).json({ error: 'Request failed' });
                    res.json({ message: 'Drive updated', version: nextVersion });
                });
        };

        if (parsed.data.stages !== undefined && row.status !== 'draft') {
            const newStages = normalizeStages(parsed.data.stages);
            const newStageIds = new Set(newStages.map(s => s.id));
            db.all(`SELECT DISTINCT current_stage_id FROM applications WHERE drive_id = ? AND is_withdrawn = 0`, [req.params.id], (err2, appRows) => {
                if (err2) return res.status(500).json({ error: 'Request failed' });
                const conflict = appRows?.find(a => a.current_stage_id && !newStageIds.has(a.current_stage_id));
                if (conflict) {
                    return res.status(409).json({ error: `Cannot remove stage '${conflict.current_stage_id}' because applicants are currently in this stage` });
                }
                proceedUpdate();
            });
        } else {
            proceedUpdate();
        }
    });
});

// ── PATCH /:id/status — enforce state transitions ─────────────────────────────
router.patch('/:id/status', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.status.changed', 'drive'), (req, res) => {
    const { status: toStatus } = req.body;
    if (!DRIVE_STATUSES.includes(toStatus)) return res.status(400).json({ error: 'Invalid status' });

    db.get(`SELECT rd.status, rd.club_id FROM recruitment_drives rd
        JOIN club_members cm ON cm.club_id = rd.club_id AND cm.user_id = ?
        WHERE rd.id = ? AND rd.deleted_at IS NULL`, [req.user.id, req.params.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Not authorized' });

        const transitionError = validateTransition(row.status, toStatus);
        if (transitionError) return res.status(409).json({ error: transitionError });

        req.activityEntityId = Number(req.params.id);
        req.activityClubId = row.club_id;
        db.run('UPDATE recruitment_drives SET status = ? WHERE id = ?', [toStatus, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            res.json({ status: toStatus });
        });
    });
});

// ── POST /:id/clone — duplicate drive as new draft ────────────────────────────
router.post('/:id/clone', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.cloned', 'drive'), (req, res) => {
    db.get(`SELECT rd.* FROM recruitment_drives rd
        JOIN club_members cm ON cm.club_id = rd.club_id AND cm.user_id = ?
        WHERE rd.id = ? AND rd.deleted_at IS NULL`, [req.user.id, req.params.id], (err, src) => {
        if (err || !src) return res.status(403).json({ error: 'Not authorized' });

        const slug = generateSlug();
        const cloneTitle = `${src.title} (copy)`;
        db.run(`INSERT INTO recruitment_drives
            (club_id, title, description, eligibility, open_date, deadline, status, shareable_slug,
             seats, required_skills, preferred_skills, allowed_years, allowed_departments,
             min_motivation_length, rubric, deal_breakers, custom_questions, stages, expected_decision_date,
             is_template, template_for_category)
            VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?, ?,?)`,
            [src.club_id, cloneTitle, src.description, src.eligibility, src.open_date, src.deadline,
             'draft', slug,
             src.seats, src.required_skills, src.preferred_skills, src.allowed_years, src.allowed_departments,
             src.min_motivation_length, src.rubric, src.deal_breakers, src.custom_questions, src.stages, src.expected_decision_date,
             0, null],
            function(err) {
                if (err) return res.status(500).json({ error: 'Request failed' });
                req.activityEntityId = this.lastID;
                req.activityClubId = src.club_id;
                res.status(201).json({ id: this.lastID, slug });
            });
    });
});

// ── DELETE /:id — soft-delete (archive) ───────────────────────────────────────
router.delete('/:id', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.archived', 'drive'), (req, res) => {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirm drive archive to continue' });
    db.get(`SELECT rd.club_id, rd.status FROM recruitment_drives rd
        JOIN clubs c ON rd.club_id = c.id
        JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
        WHERE rd.id = ? AND rd.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [req.user.id, req.params.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Not authorized' });
        req.activityEntityId = Number(req.params.id);
        req.activityClubId = row.club_id;
        db.run('UPDATE recruitment_drives SET deleted_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
            ['archived', req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            res.json({ message: 'Drive archived' });
        });
    });
});

// ── Drive Q&A ─────────────────────────────────────────────────────────────────
const qaQuestionSchema = z.object({ question: z.string().trim().min(1).max(2000) });
const qaAnswerSchema   = z.object({ answer: z.string().trim().min(1).max(5000) });

// GET /:driveId/qa — list Q&A (coordinators see all questions to answer; students see answered only)
router.get('/:driveId/qa', authenticateToken, (req, res) => {
    const isStaff = req.user.role === 'coordinator' || req.user.role === 'admin';
    const filter = isStaff ? 'q.drive_id = ?' : 'q.drive_id = ? AND q.answer IS NOT NULL';
    db.all(`SELECT q.id, q.question, q.answer, q.asked_at, q.answered_at,
            u.name AS asker_name, a.name AS answerer_name
        FROM drive_qa q
        JOIN users u ON u.id = q.student_id
        LEFT JOIN users a ON a.id = q.answered_by
        WHERE ${filter}
        ORDER BY q.asked_at ASC`, [req.params.driveId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Request failed' });
        res.json(rows);
    });
});

// POST /:driveId/qa — student asks a question
router.post('/:driveId/qa', authenticateToken, requireRole('student'), withTransaction(db, 'drive.qa.asked', 'drive'), (req, res) => {
    const parsed = qaQuestionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Question text required' });
    db.get('SELECT id, status FROM recruitment_drives WHERE id = ? AND deleted_at IS NULL',
        [req.params.driveId], (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        if (!['published', 'open'].includes(drive.status)) return res.status(409).json({ error: 'Drive is not open' });
        db.run(`INSERT INTO drive_qa (drive_id, student_id, question) VALUES (?, ?, ?)`,
            [req.params.driveId, req.user.id, parsed.data.question],
            function(err) {
                if (err) return res.status(500).json({ error: 'Request failed' });
                req.activityEntityId = req.params.driveId;
                res.status(201).json({ id: this.lastID });
            });
    });
});

// PUT /:driveId/qa/:qaId/answer — coordinator answers (once only)
router.put('/:driveId/qa/:qaId/answer', authenticateToken, requireRole('coordinator'), withTransaction(db, 'drive.qa.answered', 'drive'), (req, res) => {
    const parsed = qaAnswerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Answer text required' });

    // Verify coordinator is a club member for this drive
    db.get(`SELECT q.id, q.answer, rd.club_id FROM drive_qa q
        JOIN recruitment_drives rd ON rd.id = q.drive_id
        JOIN club_members cm ON cm.club_id = rd.club_id AND cm.user_id = ?
        WHERE q.id = ? AND q.drive_id = ?`,
        [req.user.id, req.params.qaId, req.params.driveId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Not authorized' });
        if (row.answer !== null) return res.status(409).json({ error: 'Already answered' });
        req.activityEntityId = Number(req.params.driveId);
        req.activityClubId = row.club_id;
        db.run(`UPDATE drive_qa SET answer = ?, answered_by = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [parsed.data.answer, req.user.id, row.id], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            res.json({ message: 'Answer posted' });
        });
    });
});

module.exports = router;
