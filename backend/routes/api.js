const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

// ==========================================
// AUTH ROUTES
// ==========================================

router.post('/auth/register', async (req, res) => {
    const { name, email, password, role, department, year } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (name, email, password, role, department, year) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, email, hash, role || 'student', department, year],
            function(err) {
                if (err) return res.status(400).json({ error: 'Email already exists or invalid data' });
                res.status(201).json({ message: 'User registered successfully', id: this.lastID });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'supersecretjwtkey123', { expiresIn: '1d' });
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });
    });
});

router.get('/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, name, email, role, department, year, phone, portfolio_url FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});





// ==========================================
// CLUBS ROUTES
// ==========================================
router.get('/clubs', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM clubs`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/clubs/:id', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM clubs WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Club not found' });
        res.json(row);
    });
});

// ==========================================
// DRIVES ROUTES
// ==========================================
router.get('/drives', authenticateToken, (req, res) => {
    db.all(`SELECT rd.*, c.name as club_name FROM recruitment_drives rd JOIN clubs c ON rd.club_id = c.id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/drives', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { club_id, title, description, eligibility, open_date, deadline } = req.body;
    db.run(`INSERT INTO recruitment_drives (club_id, title, description, eligibility, open_date, deadline, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'open')`,
            [club_id, title, description, eligibility, open_date, deadline],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID, message: 'Drive created' });
            }
    );
});

// ==========================================
// APPLICATIONS ROUTES
// ==========================================
router.post('/applications', authenticateToken, requireRole('student'), (req, res) => {
    const { drive_id, portfolio_url, answers } = req.body;
    const applied_at = new Date().toISOString();
    db.run(`INSERT INTO applications (drive_id, student_id, portfolio_url, answers, applied_at)
            VALUES (?, ?, ?, ?, ?)`,
            [drive_id, req.user.id, portfolio_url, answers, applied_at],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID, message: 'Application submitted' });
            }
    );
});

router.get('/applications/student', authenticateToken, requireRole('student'), (req, res) => {
    db.all(`SELECT a.*, rd.title as drive_title, c.name as club_name 
            FROM applications a 
            JOIN recruitment_drives rd ON a.drive_id = rd.id
            JOIN clubs c ON rd.club_id = c.id
            WHERE a.student_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/applications/drive/:driveId', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.all(`SELECT a.*, u.name as student_name, u.email, u.department, u.year
            FROM applications a
            JOIN users u ON a.student_id = u.id
            WHERE a.drive_id = ?`, [req.params.driveId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.put('/applications/:id/status', authenticateToken, requireRole('coordinator'), (req, res) => {
    const { status } = req.body;
    const appId = req.params.id;

    db.run(`UPDATE applications SET status = ? WHERE id = ?`, [status, appId], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // Trigger Notification
        db.get(`SELECT student_id, rd.title as drive_title, c.name as club_name 
                FROM applications a 
                JOIN recruitment_drives rd ON a.drive_id = rd.id
                JOIN clubs c ON rd.club_id = c.id
                WHERE a.id = ?`, [appId], (err, row) => {
            if (row) {
                const title = `Application ${status}`;
                const message = `Your application for ${row.drive_title} at ${row.club_name} has been marked as ${status}.`;
                db.run(`INSERT INTO notifications (user_id, title, message, type, created_at) VALUES (?, ?, ?, ?, ?)`,
                    [row.student_id, title, message, 'status_update', new Date().toISOString()]
                );
            }
        });

        res.json({ message: 'Status updated' });
    });
});

// ==========================================
// NOTIFICATIONS ROUTES
// ==========================================
router.get('/notifications', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.put('/notifications/:id/read', authenticateToken, (req, res) => {
    db.run(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Notification read' });
    });
});

// ==========================================
// COORDINATOR ROUTES
// ==========================================
router.get('/coordinator/clubs', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.all(`
        SELECT c.*, 
               COUNT(DISTINCT rd.id) AS drives,
               COUNT(DISTINCT a.id) AS applications,
               COUNT(DISTINCT CASE WHEN a.status = 'Shortlisted' THEN a.id END) AS shortlisted
        FROM clubs c
        LEFT JOIN recruitment_drives rd ON rd.club_id = c.id
        LEFT JOIN applications a ON a.drive_id = rd.id
        WHERE c.coordinator_id = ?
        GROUP BY c.id
        ORDER BY c.name
    `, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/coordinator/dashboard', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.all('SELECT id, name, category, description, logo_url FROM clubs WHERE coordinator_id = ? ORDER BY name', [req.user.id], (err, clubs) => {
        if (err) return res.status(500).json({ error: err.message });
        if (clubs.length === 0) return res.json({ clubs: [], club: null, stats: { totalApplications: 0, activeDrives: 0, shortlisted: 0 } });

        const clubIds = clubs.map(club => club.id);
        const placeholders = clubIds.map(() => '?').join(',');
        const stats = { totalApplications: 0, activeDrives: 0, shortlisted: 0 };

        db.get(`SELECT COUNT(*) AS count FROM recruitment_drives WHERE club_id IN (${placeholders}) AND status = 'open'`, clubIds, (err, openDrives) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.activeDrives = openDrives?.count || 0;

            db.get(`SELECT COUNT(a.id) AS count FROM applications a JOIN recruitment_drives rd ON rd.id = a.drive_id WHERE rd.club_id IN (${placeholders})`, clubIds, (err, applications) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.totalApplications = applications?.count || 0;

                db.get(`SELECT COUNT(a.id) AS count FROM applications a JOIN recruitment_drives rd ON rd.id = a.drive_id WHERE rd.club_id IN (${placeholders}) AND a.status = 'Shortlisted'`, clubIds, (err, shortlisted) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.shortlisted = shortlisted?.count || 0;
                    res.json({ clubs, club: clubs[0], stats });
                });
            });
        });
    });
});

router.get('/coordinator/drives', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.all(`
        SELECT rd.*, c.name AS club_name
        FROM recruitment_drives rd
        JOIN clubs c ON c.id = rd.club_id
        WHERE c.coordinator_id = ?
        ORDER BY rd.created_at DESC
    `, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
