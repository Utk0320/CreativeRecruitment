const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, (req, res) => {
    if (req.user.role === 'student') {
        db.all(`SELECT a.*, rd.title as drive_title, c.name as club_name 
                FROM applications a 
                JOIN recruitment_drives rd ON a.drive_id = rd.id
                JOIN clubs c ON rd.club_id = c.id
                WHERE a.student_id = ?`, [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        // Coordinator getting all applications for their clubs
        db.all(`SELECT a.*, u.name as student_name, u.email, u.department, u.year, rd.title as drive_title
                FROM applications a
                JOIN users u ON a.student_id = u.id
                JOIN recruitment_drives rd ON a.drive_id = rd.id
                JOIN clubs c ON rd.club_id = c.id
                WHERE c.coordinator_id = ?`, [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
});

router.get('/drive/:driveId', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.all(`
        SELECT a.*, u.name AS student_name, u.email, u.department, u.year
        FROM applications a
        JOIN users u ON u.id = a.student_id
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        WHERE rd.id = ? AND c.coordinator_id = ?
        ORDER BY a.applied_at DESC
    `, [req.params.driveId, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/:id/profile', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.get(`SELECT u.id, u.name, u.email, u.department, u.year, u.phone, u.portfolio_url,
            u.bio, u.profile_picture_url, u.skills, u.interests, u.projects,
            u.achievements, u.github_url, u.linkedin_url,
            rd.title AS drive_title, c.name AS club_name
        FROM applications a
        JOIN users u ON u.id = a.student_id
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        WHERE a.id = ? AND c.coordinator_id = ?`,
        [req.params.id, req.user.id], (err, profile) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!profile) return res.status(404).json({ error: 'Application not found' });
            res.json(profile);
        });
});

router.put('/:id/notes', authenticateToken, requireRole('coordinator'), (req, res) => {
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    db.get(`SELECT a.id, c.coordinator_id
        FROM applications a
        JOIN recruitment_drives rd ON rd.id = a.drive_id
        JOIN clubs c ON c.id = rd.club_id
        WHERE a.id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.coordinator_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        db.run('UPDATE applications SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [notes, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Application notes saved' });
        });
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM applications WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    });
});

router.post('/', authenticateToken, requireRole('student'), (req, res) => {
    const { drive_id, portfolio_url, motivation, answers, skills, experience } = req.body;
    const finalMotivation = motivation || answers || '';

    if (!drive_id || !portfolio_url?.trim() || !finalMotivation.trim()) {
        return res.status(400).json({ error: 'Provide a portfolio URL and a motivation statement.' });
    }

    db.get('SELECT id, status, deadline FROM recruitment_drives WHERE id = ?', [drive_id], (err, drive) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!drive) return res.status(404).json({ error: 'Recruitment drive not found.' });
        if (drive.status !== 'open') return res.status(409).json({ error: 'This recruitment drive is no longer accepting applications.' });
        if (new Date(drive.deadline) < new Date()) return res.status(409).json({ error: 'This recruitment drive has closed.' });

        db.get('SELECT id FROM applications WHERE drive_id = ? AND student_id = ?', [drive_id, req.user.id], (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) return res.status(400).json({ error: 'You have already applied for this drive.' });

            db.run(
                'INSERT INTO applications (drive_id, student_id, portfolio_url, motivation, skills, experience, status) VALUES (?, ?, ?, ?, ?, ?, "Applied")',
                [drive_id, req.user.id, portfolio_url.trim(), finalMotivation.trim(), skills || '', experience || ''],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.status(201).json({ id: this.lastID });
                }
            );
        });
    });
});

router.put('/:id', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { status } = req.body;
    const appId = req.params.id;

    // Verify coordinator owns the club
    db.get(`SELECT c.coordinator_id, a.student_id, rd.title as drive_title, c.name as club_name 
            FROM applications a 
            JOIN recruitment_drives rd ON a.drive_id = rd.id
            JOIN clubs c ON rd.club_id = c.id
            WHERE a.id = ?`, [appId], (err, row) => {
        if (err || !row || row.coordinator_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        db.run('UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, appId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

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

module.exports = router;

