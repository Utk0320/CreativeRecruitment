const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, (req, res) => {
    db.all('SELECT rd.*, c.name as club_name FROM recruitment_drives rd JOIN clubs c ON rd.club_id = c.id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get('SELECT rd.*, c.name as club_name FROM recruitment_drives rd JOIN clubs c ON rd.club_id = c.id WHERE rd.id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Drive not found' });
        res.json(row);
    });
});

router.post('/', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { club_id, title, description, eligibility, open_date, deadline } = req.body;
    const normalizedTitle = title?.trim();
    const normalizedDescription = description?.trim();
    const normalizedEligibility = eligibility?.trim();

    if (!normalizedTitle || !normalizedDescription || !normalizedEligibility || !/^\d{4}-\d{2}-\d{2}$/.test(open_date) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || new Date(deadline) <= new Date(open_date)) {
        return res.status(400).json({ error: 'Provide a title, description, eligibility, valid open date, and a deadline after the open date.' });
    }

    db.get('SELECT id FROM clubs WHERE id = ? AND coordinator_id = ?', [club_id, req.user.id], (err, club) => {
        if (err || !club) return res.status(403).json({ error: 'Not authorized for this club' });

        db.run(
            'INSERT INTO recruitment_drives (club_id, title, description, eligibility, open_date, deadline, status) VALUES (?, ?, ?, ?, ?, ?, "open")',
            [club_id, normalizedTitle, normalizedDescription, normalizedEligibility, open_date, deadline],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const newDriveId = this.lastID;
                res.status(201).json({ id: newDriveId });

                db.get('SELECT name FROM clubs WHERE id = ?', [club_id], (err, clubRow) => {
                    if (!err && clubRow) {
                        const message = `A new recruitment drive "${normalizedTitle}" is now open for ${clubRow.name}!`;
                        db.all('SELECT id FROM users WHERE role = "student"', [], (err, students) => {
                            if (!err && students) {
                                students.forEach(student => {
                                    db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                                        [student.id, 'New Recruitment Drive', message, 'drive_announcement']);
                                });
                            }
                        });
                    }
                });
            }
        );
    });
});

router.put('/:id', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { title, description, eligibility, open_date, deadline, status } = req.body;
    const normalizedTitle = title?.trim();
    const normalizedDescription = description?.trim();
    const normalizedEligibility = eligibility?.trim();
    const allowedStatuses = new Set(['open', 'closed']);

    if (!normalizedTitle || !normalizedDescription || !normalizedEligibility || !/^\d{4}-\d{2}-\d{2}$/.test(open_date) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || new Date(deadline) <= new Date(open_date) || (status && !allowedStatuses.has(status))) {
        return res.status(400).json({ error: 'Provide valid drive details and a supported status.' });
    }

    db.get('SELECT c.coordinator_id FROM recruitment_drives rd JOIN clubs c ON rd.club_id = c.id WHERE rd.id = ?', [req.params.id], (err, row) => {
        if (err || !row || row.coordinator_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        db.run(
            'UPDATE recruitment_drives SET title = ?, description = ?, eligibility = ?, open_date = ?, deadline = ?, status = COALESCE(?, status) WHERE id = ?',
            [normalizedTitle, normalizedDescription, normalizedEligibility, open_date, deadline, status, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Drive updated' });
            }
        );
    });
});

router.delete('/:id', authenticateToken, requireRole('coordinator'), (req, res) => {
    // Check ownership
    db.get('SELECT c.coordinator_id FROM recruitment_drives rd JOIN clubs c ON rd.club_id = c.id WHERE rd.id = ?', [req.params.id], (err, row) => {
        if (err || !row || row.coordinator_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
        
        db.run('DELETE FROM recruitment_drives WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Drive deleted' });
        });
    });
});

module.exports = router;

