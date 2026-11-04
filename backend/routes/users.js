const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const { withTransaction } = require('../utils/mutationBoundary');

// ── Avatar storage (profiles/) ────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) { cb(null, crypto.randomUUID()); }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// ── Resume storage (resumes/) ─────────────────────────────────────────────────
const resumeStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/resumes');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) { cb(null, crypto.randomUUID() + '.pdf'); }
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const profileFields = `id, name, email, role, department, year, phone, portfolio_url,
    bio, profile_picture_url, skills, interests, projects, achievements, github_url, linkedin_url,
    resume_path, resume_uploaded_at`;
const urlOpt = z.string().trim().url().max(2048).nullable().optional().or(z.literal(''));
const profileUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(120),
    year: z.coerce.number().int().min(1).max(4),
    phone: z.string().max(40).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    skills: z.union([z.string().max(10000), z.array(z.unknown())]).optional(),
    interests: z.union([z.string().max(10000), z.array(z.unknown())]).optional(),
    projects: z.union([z.string().max(20000), z.array(z.unknown())]).optional(),
    achievements: z.union([z.string().max(10000), z.array(z.unknown())]).optional(),
    github_url: urlOpt,
    linkedin_url: urlOpt,
    portfolio_url: urlOpt
});

/** Compute profile completeness (0-100). Used server-side and returned in GET /users/:id */
const computeCompleteness = (u) => {
    const checks = [
        u.bio?.trim(),
        u.phone?.trim(),
        u.github_url?.trim(),
        u.linkedin_url?.trim(),
        u.portfolio_url?.trim(),
        u.resume_path,
        (() => { try { return JSON.parse(u.skills || '[]').length > 0; } catch { return false; } })(),
        (() => { try { return JSON.parse(u.interests || '[]').length > 0; } catch { return false; } })(),
        (() => { try { return JSON.parse(u.projects || '[]').length > 0; } catch { return false; } })(),
        (() => { try { return JSON.parse(u.achievements || '[]').length > 0; } catch { return false; } })()
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
};

router.get('/:id', authenticateToken, (req, res) => {
    const requestedId = Number(req.params.id);
    if (Number(req.user.id) === requestedId) {
        db.get(`SELECT ${profileFields} FROM users WHERE id = ?`, [requestedId], (err, user) => {
            if (err) return res.status(500).json({ error: 'Unable to load user' });
            if (!user) return res.status(404).json({ error: 'User not found' });
            return res.json({ ...user, completeness: computeCompleteness(user) });
        });
        return;
    }

    db.get(`SELECT u.id, u.name, u.role, u.department, u.year, u.bio, u.profile_picture_url,
            u.skills, u.interests, u.projects, u.achievements
        FROM users u WHERE u.id = ?`, [requestedId], (err, publicUser) => {
        if (err) return res.status(500).json({ error: 'Unable to load user' });
        if (!publicUser) return res.status(404).json({ error: 'User not found' });
        if (req.user.role !== 'coordinator') return res.json(publicUser);

        db.get(`SELECT 1 AS authorized
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
            WHERE a.student_id = ? LIMIT 1`,
        [req.user.id, requestedId], (accessErr, access) => {
            if (accessErr) return res.status(500).json({ error: 'Unable to load user' });
            if (!access) return res.json(publicUser);
            db.get(`SELECT ${profileFields} FROM users WHERE id = ?`, [requestedId], (privateErr, privateUser) => {
                if (privateErr) return res.status(500).json({ error: 'Unable to load user' });
                res.json(privateUser);
            });
        });
    });
});

router.put('/:id', authenticateToken, withTransaction(db, 'user.profile.updated', 'user'), (req, res) => {
    // Only the user themselves can update their profile
    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide valid profile details' });

    const { name, department, year, phone, bio, skills, interests, projects, achievements,
            github_url, linkedin_url, portfolio_url } = parsed.data;
    const safeSkills = typeof skills === 'object' ? JSON.stringify(skills) : skills;
    const safeInterests = typeof interests === 'object' ? JSON.stringify(interests) : interests;
    const safeProjects = typeof projects === 'object' ? JSON.stringify(projects) : projects;
    const safeAchievements = typeof achievements === 'object' ? JSON.stringify(achievements) : achievements;
    const nullify = v => (v === '' || v == null) ? null : v;

    db.run(
        `UPDATE users SET
            name = ?, department = ?, year = ?, phone = ?, bio = ?,
            skills = ?, interests = ?, projects = ?, achievements = ?,
            github_url = ?, linkedin_url = ?, portfolio_url = ?
         WHERE id = ?`,
        [name, department, year, phone, bio,
         safeSkills, safeInterests, safeProjects, safeAchievements,
         nullify(github_url), nullify(linkedin_url), nullify(portfolio_url),
         req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Request failed' });
            res.json({ message: 'Profile updated' });
        }
    );
});

router.post('/:id/avatar', authenticateToken, withTransaction(db, 'user.avatar.updated', 'user'), (req, res, next) => {
    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    upload.single('avatar')(req, res, (err) => {
        if (err) {
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({ error: 'Avatar must be a PNG, JPG, or WebP image no larger than 2 MB' });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(req.file.path);
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
    if (!detected || !extensions[detected.mime]) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Avatar must be a PNG, JPG, or WebP image' });
    }

    const filename = `${crypto.randomUUID()}.${extensions[detected.mime]}`;
    const destination = path.join(path.dirname(req.file.path), filename);
    fs.renameSync(req.file.path, destination);
    const imageUrl = '/uploads/profiles/' + filename;

    db.run('UPDATE users SET profile_picture_url = ? WHERE id = ?', [imageUrl, req.user.id], function(err) {
        if (err) {
            fs.unlink(destination, () => {});
            return res.status(500).json({ error: 'Unable to save avatar' });
        }
        res.json({ url: imageUrl });
    });
});

// ── Resume upload ─────────────────────────────────────────────────────────────
// POST /users/:id/resume — authenticated student, self only, PDF ≤5MB
router.post('/:id/resume', authenticateToken, withTransaction(db, 'user.resume.updated', 'user'), (req, res) => {
    if (req.user.role !== 'student' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Students only' });
    }
    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    resumeUpload.single('resume')(req, res, async (err) => {
        if (err) {
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({ error: err.message || 'Upload error' });
        }
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        // Content-type check using file-type (detect from bytes, not extension)
        let fileType;
        try {
            const { fileTypeFromFile } = await import('file-type');
            fileType = await fileTypeFromFile(req.file.path);
        } catch {
            fs.unlink(req.file.path, () => {});
            return res.status(500).json({ error: 'Type check failed' });
        }
        if (!fileType || fileType.mime !== 'application/pdf') {
            fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: 'Only PDF files are accepted' });
        }

        // Delete previous resume if exists
        db.get('SELECT resume_path FROM users WHERE id = ?', [req.user.id], (e, row) => {
            if (row?.resume_path) {
                const old = path.join(__dirname, '..', row.resume_path.replace(/^\//, ''));
                fs.unlink(old, () => {});
            }

            const resumeUrl = '/uploads/resumes/' + path.basename(req.file.path);
            db.run('UPDATE users SET resume_path = ?, resume_uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
                [resumeUrl, req.user.id], function(dbErr) {
                    if (dbErr) {
                        fs.unlink(req.file.path, () => {});
                        return res.status(500).json({ error: 'Unable to save resume' });
                    }
                    req.activityEntityId = req.user.id;
                    res.json({ url: resumeUrl });
                }
            );
        });
    });
});

// GET /users/:id/resume — owner or authorized coordinator; serves file with nosniff
router.get('/:id/resume', authenticateToken, (req, res) => {
    const requestedId = Number(req.params.id);
    const isOwner = Number(req.user.id) === requestedId;
    const isAdmin = req.user.role === 'admin';

    const checkAndServe = (resumePath) => {
        if (!resumePath) return res.status(404).json({ error: 'No resume on file' });
        const filePath = path.join(__dirname, '..', resumePath.replace(/^\//, ''));
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Resume file not found' });
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
        res.sendFile(filePath);
    };

    if (isOwner || isAdmin) {
        db.get('SELECT resume_path FROM users WHERE id = ?', [requestedId], (e, row) => {
            if (e) return res.status(500).json({ error: 'Request failed' });
            checkAndServe(row?.resume_path);
        });
        return;
    }

    // Coordinator: must have an application in one of their clubs from this student
    if (req.user.role !== 'coordinator') return res.status(403).json({ error: 'Forbidden' });
    db.get(`SELECT u.resume_path FROM users u
        WHERE u.id = ? AND EXISTS (
            SELECT 1 FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN club_members cm ON cm.club_id = rd.club_id AND cm.user_id = ?
            WHERE a.student_id = u.id
        )`, [requestedId, req.user.id], (e, row) => {
        if (e) return res.status(500).json({ error: 'Request failed' });
        if (!row) return res.status(403).json({ error: 'Forbidden' });
        checkAndServe(row.resume_path);
    });
});

module.exports = router;
