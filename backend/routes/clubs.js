const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, (req, res) => {
    db.all('SELECT * FROM clubs', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM clubs WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Club not found' });
        res.json(row);
    });
});

router.post('/', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { name, category, description, logo_url } = req.body;
    db.run(
        'INSERT INTO clubs (name, category, description, logo_url, coordinator_id) VALUES (?, ?, ?, ?, ?)',
        [name, category, description, logo_url, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID });
        }
    );
});

router.put('/:id', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { name, category, description, logo_url } = req.body;
    db.run(
        'UPDATE clubs SET name = ?, category = ?, description = ?, logo_url = ? WHERE id = ? AND coordinator_id = ?',
        [name, category, description, logo_url, req.params.id, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(403).json({ error: 'Not authorized or club not found' });
            res.json({ message: 'Club updated' });
        }
    );
});

router.delete('/:id', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.get('SELECT id FROM clubs WHERE id = ? AND coordinator_id = ?', [req.params.id, req.user.id], (err, club) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!club) return res.status(403).json({ error: 'Not authorized or club not found' });

        db.run('DELETE FROM applications WHERE drive_id IN (SELECT id FROM recruitment_drives WHERE club_id = ?)', [club.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run('DELETE FROM recruitment_drives WHERE club_id = ?', [club.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                db.run('DELETE FROM clubs WHERE id = ?', [club.id], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Club deleted' });
                });
            });
        });
    });
});

module.exports = router;

