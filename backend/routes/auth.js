const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');

const SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';

router.post('/register', async (req, res) => {
    const { name, email, password, role, department, year, phone } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedRole = role === 'coordinator' ? 'coordinator' : 'student';

    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || password.length < 8) {
        return res.status(400).json({ error: 'Enter a valid name, email, and password of at least 8 characters.' });
    }
    if (normalizedRole === 'coordinator' && (!department?.trim() || !year)) {
        return res.status(400).json({ error: 'Coordinator accounts require a department and year.' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (name, email, password_hash, role, department, year, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name.trim(), normalizedEmail, hash, normalizedRole, department?.trim() || null, year || null, phone?.trim() || null],
            function(err) {
                if (err) return res.status(400).json({ error: 'Email already exists or invalid data' });
                res.status(201).json({ message: 'User registered successfully', id: this.lastID });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '1d' });
        
        const { password_hash: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });
    });
});

router.get('/me', authenticateToken, (req, res) => {
    db.get('SELECT id, name, email, role, department, year, phone, portfolio_url, bio, profile_picture_url, skills, interests, projects, achievements, github_url, linkedin_url FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

module.exports = router;

