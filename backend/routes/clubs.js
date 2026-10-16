const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { z } = require('zod');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { withTransaction } = require('../utils/mutationBoundary');

const clubInputSchema = z.object({
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().max(80).optional(),
    description: z.string().trim().max(4000).optional(),
    logo_url: z.string().trim().max(2048).optional()
});

router.get('/', authenticateToken, (req, res) => {
    const options = parseListOptions(req.query, {
        name: 'name',
        category: 'category',
        created: 'created_at'
    }, 'name');
    const conditions = ['deleted_at IS NULL'];
    const params = [];
    if (options.search) {
        conditions.push('(name LIKE ? OR description LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (typeof req.query.category === 'string' && req.query.category.length <= 80) {
        conditions.push('category = ?');
        params.push(req.query.category);
    }
    const where = conditions.join(' AND ');

    db.get(`SELECT COUNT(*) AS total FROM clubs WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Request failed' });
        db.all(`SELECT * FROM clubs WHERE ${where}
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM clubs WHERE id = ? AND deleted_at IS NULL', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Club not found' });
        res.json(row);
    });
});

router.post('/', authenticateToken, requireRole('coordinator'), withTransaction(db, 'club.created', 'club'), (req, res) => {
    const parsed = clubInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid club details' });
    const { name, category, description, logo_url } = parsed.data;
    db.run(
        'INSERT INTO clubs (name, category, description, logo_url, coordinator_id) VALUES (?, ?, ?, ?, ?)',
        [name, category, description, logo_url, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            const clubId = this.lastID;
            // Phase 2: creator becomes lead
            db.run('INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, "lead", ?)',
                [clubId, req.user.id, req.user.id], memberErr => {
                    if (memberErr) return res.status(500).json({ error: 'Request failed' });
                    req.activityEntityId = clubId;
                    req.activityClubId = clubId;
                    res.status(201).json({ id: clubId });
                });
        }
    );
});

router.put('/:id', authenticateToken, requireRole('coordinator'), withTransaction(db, 'club.updated', 'club'), (req, res) => {
    const parsed = clubInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid club details' });
    const { name, category, description, logo_url } = parsed.data;
    // Only lead may update club details
    db.get(`SELECT c.* FROM clubs c
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ? AND cm.role = 'lead'
            WHERE c.id = ? AND c.deleted_at IS NULL`, [req.user.id, req.params.id], (err, club) => {
        if (err || !club) return res.status(403).json({ error: 'Not authorized or club not found' });

        if (req.body.version !== undefined && club.version !== undefined) {
            if (Number(req.body.version) !== Number(club.version)) {
                return res.status(409).json({
                    error: 'Conflict: This club has been modified by someone else since you loaded it. Please reload to see the latest changes.',
                    current_version: club.version
                });
            }
        }

        const nextVersion = (club.version || 1) + 1;
        req.activityEntityId = Number(req.params.id);
        req.activityClubId = Number(req.params.id);
        req.activityBeforeJson = { name: club.name, version: club.version };
        req.activityAfterJson = { name, version: nextVersion };

        db.run(
            'UPDATE clubs SET name = ?, category = ?, description = ?, logo_url = ?, version = ? WHERE id = ?',
            [name, category, description, logo_url, nextVersion, req.params.id],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: 'Request failed' });
                res.json({ message: 'Club updated', version: nextVersion });
            }
        );
    });
});

router.delete('/:id', authenticateToken, requireRole('coordinator'), withTransaction(db, 'club.archived', 'club'), (req, res) => {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirm club archive to continue' });
    db.get(`SELECT c.id FROM clubs c
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ? AND cm.role = 'lead'
            WHERE c.id = ? AND c.deleted_at IS NULL`, [req.user.id, req.params.id], (err, club) => {
        if (err) return res.status(500).json({ error: 'Request failed' });
        if (!club) return res.status(403).json({ error: 'Not authorized or club not found' });

        req.activityEntityId = club.id;
        req.activityClubId = club.id;
        db.run('UPDATE clubs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [club.id], function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            db.run('UPDATE recruitment_drives SET deleted_at = CURRENT_TIMESTAMP WHERE club_id = ? AND deleted_at IS NULL', [club.id]);
            res.json({ message: 'Club archived' });
        });
    });
});

module.exports = router;
