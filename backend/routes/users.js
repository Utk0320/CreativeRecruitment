const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/:id', authenticateToken, (req, res) => {
    // Included new profile fields
    db.get('SELECT id, name, email, role, department, year, phone, bio, profile_picture_url, skills, interests, projects, achievements FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

router.put('/:id', authenticateToken, (req, res) => {
    // Only the user themselves can update their profile
    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Extracting all valid fields
    const { name, department, year, phone, bio, skills, interests, projects, achievements } = req.body;
    
    // Convert arrays back to string if necessary, though they should come in as strings from frontend
    const safeSkills = typeof skills === 'object' ? JSON.stringify(skills) : skills;
    const safeInterests = typeof interests === 'object' ? JSON.stringify(interests) : interests;
    const safeProjects = typeof projects === 'object' ? JSON.stringify(projects) : projects;
    const safeAchievements = typeof achievements === 'object' ? JSON.stringify(achievements) : achievements;

    db.run(
        `UPDATE users SET 
            name = ?, 
            department = ?, 
            year = ?, 
            phone = ?, 
            bio = ?,
            skills = ?,
            interests = ?,
            projects = ?,
            achievements = ?
         WHERE id = ?`,
        [name, department, year, phone, bio, safeSkills, safeInterests, safeProjects, safeAchievements, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Profile updated' });
        }
    );
});

router.post('/:id/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = '/uploads/profiles/' + req.file.filename;
    
    db.run('UPDATE users SET profile_picture_url = ? WHERE id = ?', [imageUrl, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ url: imageUrl });
    });
});

module.exports = router;
