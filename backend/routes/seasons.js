/**
 * routes/seasons.js — Recruitment Season management (Phase 2)
 *
 * Admin: full CRUD + clone
 * Coordinator/Student: read only (list + get)
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');

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

const seasonSchema = z.object({
    name:                   z.string().trim().min(1).max(160),
    start_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status:                 z.enum(['upcoming', 'active', 'closed', 'archived']).optional(),
    simultaneous_app_limit: z.coerce.number().int().positive().nullable().optional(),
}).refine(d => d.end_date >= d.start_date, { message: 'end_date must be on or after start_date' });

const SORT_FIELDS = { name: 'name', start: 'start_date', end: 'end_date', created: 'created_at' };

// ── All authenticated users can read seasons ──────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
    const options = parseListOptions(req.query, SORT_FIELDS, 'start');
    const conditions = [];
    const params = [];
    if (req.query.status && ['upcoming', 'active', 'closed', 'archived'].includes(req.query.status)) {
        conditions.push('status = ?');
        params.push(req.query.status);
    }
    if (options.search) {
        conditions.push('name LIKE ?');
        params.push(`%${options.search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    db.get(`SELECT COUNT(*) AS total FROM recruitment_seasons ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load seasons' });
        db.all(
            `SELECT * FROM recruitment_seasons ${where}
             ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
            [...params, options.limit, options.offset],
            (err, rows) => {
                if (err) return res.status(500).json({ error: 'Unable to load seasons' });
                setPaginationHeaders(res, options, result.total);
                res.json(rows);
            }
        );
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM recruitment_seasons WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Unable to load season' });
        if (!row) return res.status(404).json({ error: 'Season not found' });
        res.json(row);
    });
});

// ── Admin-only mutations ──────────────────────────────────────────────────────
router.use(authenticateToken, requireRole('admin'));

router.post('/', withTransaction(db, 'season.created', 'season'), async (req, res) => {
    const parsed = seasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid season details' });
    const { name, start_date, end_date, status = 'upcoming', simultaneous_app_limit = null } = parsed.data;
    try {
        const result = await run(
            `INSERT INTO recruitment_seasons (name, start_date, end_date, status, simultaneous_app_limit, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, start_date, end_date, status, simultaneous_app_limit || null, req.user.id]
        );
        req.activityEntityId = result.lastID;
        res.status(201).json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: 'Unable to create season' });
    }
});

router.put('/:id', withTransaction(db, 'season.updated', 'season'), async (req, res) => {
    const parsed = seasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid season details' });
    const { name, start_date, end_date, status = 'upcoming', simultaneous_app_limit = null } = parsed.data;
    try {
        const result = await run(
            `UPDATE recruitment_seasons SET name = ?, start_date = ?, end_date = ?, status = ?,
             simultaneous_app_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, start_date, end_date, status, simultaneous_app_limit || null, req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Season not found' });
        req.activityEntityId = Number(req.params.id);
        res.json({ message: 'Season updated' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update season' });
    }
});

router.patch('/:id/status', withTransaction(db, 'season.status.updated', 'season'), async (req, res) => {
    const parsed = z.object({ status: z.enum(['upcoming', 'active', 'closed', 'archived']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid status' });
    try {
        const result = await run(
            `UPDATE recruitment_seasons SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [parsed.data.status, req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Season not found' });
        req.activityEntityId = Number(req.params.id);
        res.json({ message: 'Season status updated' });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update season' });
    }
});

/**
 * POST /api/seasons/:id/clone
 * Clones all drives in the source season (excluding archived ones) as drafts in the new season.
 * Body: { name, start_date, end_date }
 */
router.post('/:id/clone', withTransaction(db, 'season.cloned', 'season'), async (req, res) => {
    const parsed = seasonSchema.omit({ status: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid details for the new season' });
    try {
        const source = await get('SELECT * FROM recruitment_seasons WHERE id = ?', [req.params.id]);
        if (!source) return res.status(404).json({ error: 'Source season not found' });

        const newSeason = await run(
            `INSERT INTO recruitment_seasons (name, start_date, end_date, status, created_by)
             VALUES (?, ?, ?, 'upcoming', ?)`,
            [parsed.data.name, parsed.data.start_date, parsed.data.end_date, req.user.id]
        );
        const newSeasonId = newSeason.lastID;
        req.activityEntityId = newSeasonId;

        // Copy drives (non-archived) as drafts
        const drives = await all(
            `SELECT * FROM recruitment_drives WHERE season_id = ? AND deleted_at IS NULL
             AND status != 'archived'`,
            [source.id]
        );
        for (const drive of drives) {
            await run(
                `INSERT INTO recruitment_drives
                 (club_id, title, description, eligibility, status, season_id, created_at)
                 VALUES (?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)`,
                [drive.club_id, drive.title, drive.description, drive.eligibility, newSeasonId]
            );
        }

        res.status(201).json({ id: newSeasonId, drives_cloned: drives.length });
    } catch (err) {
        res.status(500).json({ error: 'Unable to clone season' });
    }
});

module.exports = router;

