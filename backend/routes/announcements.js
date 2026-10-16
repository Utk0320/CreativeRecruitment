const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { dispatchNotification } = require('../services/notifications/dispatcher');

/**
 * POST /api/announcements
 * Club coordinator/lead or admin creates an announcement for applicants and/or members.
 */
router.post('/', authenticateToken, withTransaction(db, 'announcements.create', 'announcements'), async (req, res) => {
    const { club_id, title, content, audience = 'all' } = req.body;

    if (!club_id) {
        return res.status(400).json({ error: 'club_id is required' });
    }
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
        return res.status(400).json({ error: 'Title is required (min 3 chars)' });
    }
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
        return res.status(400).json({ error: 'Content is required (min 5 chars)' });
    }

    const validAudiences = ['all', 'applicants', 'members'];
    const chosenAudience = validAudiences.includes(audience) ? audience : 'all';

    // Verify coordinator / admin permission
    const checkAuth = (cb) => {
        if (req.user.role === 'admin') return cb(null, true);
        db.get(
            'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
            [club_id, req.user.id],
            (err, member) => {
                if (err || !member) return cb(new Error('Forbidden: Not a coordinator of this club'));
                cb(null, true);
            }
        );
    };

    checkAuth((authErr) => {
        if (authErr) return res.status(403).json({ error: authErr.message });

        db.run(
            `INSERT INTO announcements (club_id, title, content, audience, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [club_id, title.trim(), content.trim(), chosenAudience, req.user.id],
            function(err) {
                if (err) return res.status(500).json({ error: 'Failed to create announcement' });
                const announcementId = this.lastID;

                // Find recipient student IDs based on audience
                const findRecipients = (recipientsCb) => {
                    const recipientIds = new Set();

                    const queryApplicants = (done) => {
                        if (['all', 'applicants'].includes(chosenAudience)) {
                            db.all(
                                `SELECT DISTINCT a.student_id
                                 FROM applications a
                                 JOIN recruitment_drives rd ON rd.id = a.drive_id
                                 WHERE rd.club_id = ?`,
                                [club_id],
                                (err, rows) => {
                                    if (!err && rows) {
                                        for (const r of rows) recipientIds.add(r.student_id);
                                    }
                                    done();
                                }
                            );
                        } else {
                            done();
                        }
                    };

                    const queryMembers = (done) => {
                        if (['all', 'members'].includes(chosenAudience)) {
                            db.all(
                                `SELECT user_id FROM club_members WHERE club_id = ?`,
                                [club_id],
                                (err, rows) => {
                                    if (!err && rows) {
                                        for (const r of rows) recipientIds.add(r.user_id);
                                    }
                                    done();
                                }
                            );
                        } else {
                            done();
                        }
                    };

                    queryApplicants(() => {
                        queryMembers(() => {
                            recipientsCb(Array.from(recipientIds));
                        });
                    });
                };

                findRecipients(async (recipients) => {
                    const club = await new Promise(resolve => {
                        db.get('SELECT name FROM clubs WHERE id = ?', [club_id], (err, row) => resolve(row));
                    });
                    const clubName = club ? club.name : 'Club';

                    await Promise.all(recipients.map(studentId =>
                        dispatchNotification(db, {
                            userId: studentId,
                            eventType: 'announcements',
                            title: `${clubName}: ${title.trim()}`,
                            message: content.trim().slice(0, 140),
                            link: `/student/clubs/${club_id}`
                        }).catch(() => {})
                    ));

                    res.status(201).json({
                        id: announcementId,
                        club_id,
                        title: title.trim(),
                        content: content.trim(),
                        audience: chosenAudience,
                        recipient_count: recipients.length,
                        message: 'Announcement posted and dispatched to recipients'
                    });
                });
            }
        );
    });
});

/**
 * GET /api/announcements/club/:clubId
 * List announcements for a specific club.
 */
router.get('/club/:clubId', authenticateToken, (req, res) => {
    const clubId = Number(req.params.clubId);

    db.all(
        `SELECT a.*, u.name AS author_name, c.name AS club_name
         FROM announcements a
         JOIN users u ON u.id = a.created_by
         JOIN clubs c ON c.id = a.club_id
         WHERE a.club_id = ?
         ORDER BY a.created_at DESC`,
        [clubId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch announcements' });
            res.json(rows || []);
        }
    );
});

/**
 * GET /api/announcements/my
 * List announcements relevant to the current user (clubs applied to or member of).
 */
router.get('/my', authenticateToken, (req, res) => {
    db.all(
        `SELECT DISTINCT an.*, c.name AS club_name, u.name AS author_name
         FROM announcements an
         JOIN clubs c ON c.id = an.club_id
         JOIN users u ON u.id = an.created_by
         WHERE an.club_id IN (
            SELECT DISTINCT rd.club_id FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            WHERE a.student_id = ?
            UNION
            SELECT club_id FROM club_members WHERE user_id = ?
         )
         ORDER BY an.created_at DESC
         LIMIT 50`,
        [req.user.id, req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch my announcements' });
            res.json(rows || []);
        }
    );
});

module.exports = router;
