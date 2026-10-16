const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');

router.use(authenticateToken, requireRole('coordinator'));

// ── GET /api/coordinator/clubs ─────────────────────────────────────────────────
// Lists clubs the current coordinator is a member of (lead or member via club_members).
// Falls back to clubs.coordinator_id for clubs that predate Phase 2 backfill.
router.get('/clubs', (req, res) => {
    const options = parseListOptions(req.query, { name: 'c.name', category: 'c.category' }, 'name');
    const conditions = ['c.deleted_at IS NULL', 'cm.user_id = ?'];
    const params = [req.user.id];
    if (options.search) {
        conditions.push('(c.name LIKE ? OR c.description LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    const where = conditions.join(' AND ');
    db.get(`SELECT COUNT(*) AS total FROM clubs c
        JOIN club_members cm ON cm.club_id = c.id
        WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load clubs' });
        db.all(`SELECT c.*, cm.role AS member_role,
                COUNT(DISTINCT rd.id) AS drives,
                COUNT(DISTINCT a.id) AS applications,
                COUNT(DISTINCT CASE WHEN a.status = 'Shortlisted' THEN a.id END) AS shortlisted
            FROM clubs c
            JOIN club_members cm ON cm.club_id = c.id
            LEFT JOIN recruitment_drives rd ON rd.club_id = c.id AND rd.deleted_at IS NULL
            LEFT JOIN applications a ON a.drive_id = rd.id
            WHERE ${where}
            GROUP BY c.id
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load clubs' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

// ── GET /api/coordinator/dashboard ────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
    db.all(`SELECT c.id, c.name, c.category, c.description, c.logo_url,
                cm.role AS member_role,
                COUNT(rd.id) AS drive_count
            FROM clubs c
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ?
            LEFT JOIN recruitment_drives rd ON rd.club_id = c.id AND rd.deleted_at IS NULL
            WHERE c.deleted_at IS NULL
            GROUP BY c.id
            ORDER BY c.name`, [req.user.id], (err, clubs) => {
        if (err) return res.status(500).json({ error: 'Unable to load dashboard' });
        if (clubs.length === 0) {
            return res.json({ clubs: [], club: null, stats: { totalApplications: 0, activeDrives: 0, shortlisted: 0 } });
        }

        const clubIds = clubs.map(club => club.id);
        const placeholders = clubIds.map(() => '?').join(',');
        const stats = { totalApplications: 0, activeDrives: 0, shortlisted: 0 };

        db.get(`SELECT COUNT(*) AS count FROM recruitment_drives WHERE club_id IN (${placeholders}) AND status = 'open'`, clubIds, (countErr, openDrives) => {
            if (countErr) return res.status(500).json({ error: 'Unable to load dashboard' });
            stats.activeDrives = openDrives?.count || 0;
            db.get(`SELECT COUNT(a.id) AS count FROM applications a
                JOIN recruitment_drives rd ON rd.id = a.drive_id
                WHERE rd.club_id IN (${placeholders})`, clubIds, (applicationErr, applications) => {
                if (applicationErr) return res.status(500).json({ error: 'Unable to load dashboard' });
                stats.totalApplications = applications?.count || 0;
                db.get(`SELECT COUNT(a.id) AS count FROM applications a
                    JOIN recruitment_drives rd ON rd.id = a.drive_id
                    WHERE rd.club_id IN (${placeholders}) AND a.status = 'Shortlisted'`, clubIds, (shortlistErr, shortlisted) => {
                    if (shortlistErr) return res.status(500).json({ error: 'Unable to load dashboard' });
                    stats.shortlisted = shortlisted?.count || 0;
                    res.json({ clubs, club: clubs[0], stats });
                });
            });
        });
    });
});

// ── GET /api/coordinator/drives ────────────────────────────────────────────────
router.get('/drives', (req, res) => {
    const options = parseListOptions(req.query, {
        title:   'rd.title',
        deadline:'rd.deadline',
        created: 'rd.created_at'
    }, 'created');
    const conditions = ['c.deleted_at IS NULL', 'rd.deleted_at IS NULL', 'cm.user_id = ?'];
    const params = [req.user.id];
    if (options.search) {
        conditions.push('rd.title LIKE ?');
        params.push(`%${options.search}%`);
    }
    if (['open', 'scheduled', 'closed', 'draft', 'archived'].includes(req.query.status)) {
        conditions.push('rd.status = ?');
        params.push(req.query.status);
    }
    const where = conditions.join(' AND ');
    const from = `FROM recruitment_drives rd
        JOIN clubs c ON c.id = rd.club_id
        JOIN club_members cm ON cm.club_id = c.id`;
    db.get(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Unable to load drives' });
        db.all(`SELECT rd.*, c.name AS club_name, cm.role AS member_role ${from}
            WHERE ${where}
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Unable to load drives' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

// ── GET /api/coordinator/inbox ────────────────────────────────────────────────
// Coordinator "Needs my action" inbox queue
router.get('/inbox', (req, res) => {
    db.all(`SELECT club_id FROM club_members WHERE user_id = ?`, [req.user.id], (err, memberClubs) => {
        if (err) return res.status(500).json({ error: 'Unable to load inbox' });
        if (!memberClubs || memberClubs.length === 0) {
            return res.json({
                stats: { unreviewedCount: 0, expiringDrivesCount: 0, expiringOffersCount: 0, totalActionItems: 0 },
                items: []
            });
        }
        const clubIds = memberClubs.map(c => c.club_id);
        const placeholders = clubIds.map(() => '?').join(',');

        const appSql = `
            SELECT a.id, a.drive_id, a.student_id, a.current_stage_id, a.outcome, a.applied_at,
                   u.name AS student_name, u.email AS student_email, u.department, u.year,
                   rd.title AS drive_title, rd.club_id, c.name AS club_name
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            JOIN users u ON u.id = a.student_id
            WHERE rd.club_id IN (${placeholders})
              AND a.is_withdrawn = 0
              AND (a.outcome = 'Pending' OR a.outcome IS NULL)
              AND rd.status IN ('published', 'closed')
            ORDER BY a.applied_at ASC
            LIMIT 50
        `;

        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
        const driveSql = `
            SELECT rd.id, rd.title, rd.deadline, rd.expected_decision_date, rd.club_id, rd.status, c.name AS club_name,
                   (SELECT COUNT(*) FROM applications WHERE drive_id = rd.id AND outcome = 'Pending' AND is_withdrawn = 0) AS pending_count
            FROM recruitment_drives rd
            JOIN clubs c ON c.id = rd.club_id
            WHERE rd.club_id IN (${placeholders})
              AND rd.deleted_at IS NULL
              AND rd.status = 'published'
              AND rd.deadline <= ?
            ORDER BY rd.deadline ASC
        `;

        const offerSql = `
            SELECT a.id, a.drive_id, a.student_id, a.applied_at, a.updated_at,
                   u.name AS student_name, u.email AS student_email,
                   rd.title AS drive_title, c.name AS club_name
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            JOIN clubs c ON c.id = rd.club_id
            JOIN users u ON u.id = a.student_id
            WHERE rd.club_id IN (${placeholders})
              AND a.offer_state = 'Offered'
              AND a.is_withdrawn = 0
            ORDER BY a.updated_at ASC
        `;

        db.all(appSql, clubIds, (err2, unreviewed) => {
            if (err2) return res.status(500).json({ error: 'Unable to load inbox applications' });
            db.all(driveSql, [...clubIds, in48h], (err3, expiringDrives) => {
                if (err3) return res.status(500).json({ error: 'Unable to load inbox drives' });
                db.all(offerSql, clubIds, (err4, expiringOffers) => {
                    if (err4) return res.status(500).json({ error: 'Unable to load inbox offers' });

                    const items = [];
                    (unreviewed || []).forEach(app => {
                        items.push({
                            id: `app_${app.id}`,
                            type: 'unreviewed_application',
                            title: `Review application from ${app.student_name}`,
                            description: `${app.club_name} • ${app.drive_title} (${app.current_stage_id || 'screening'})`,
                            urgency: 'medium',
                            link: `/coordinator/drives?driveId=${app.drive_id}&appId=${app.id}`,
                            created_at: app.applied_at,
                            data: {
                                application_id: app.id,
                                drive_id: app.drive_id,
                                student_name: app.student_name,
                                student_email: app.student_email,
                                department: app.department,
                                year: app.year
                            }
                        });
                    });

                    (expiringDrives || []).forEach(drive => {
                        items.push({
                            id: `drive_${drive.id}`,
                            type: 'deadline_approaching',
                            title: `Drive deadline approaching: ${drive.title}`,
                            description: `${drive.club_name} • Deadline: ${new Date(drive.deadline).toLocaleString()} (${drive.pending_count} pending reviews)`,
                            urgency: 'high',
                            link: `/coordinator/drives?driveId=${drive.id}`,
                            created_at: drive.deadline,
                            data: {
                                drive_id: drive.id,
                                pending_count: drive.pending_count
                            }
                        });
                    });

                    (expiringOffers || []).forEach(offer => {
                        items.push({
                            id: `offer_${offer.id}`,
                            type: 'expiring_offer',
                            title: `Pending offer acceptance: ${offer.student_name}`,
                            description: `${offer.club_name} • ${offer.drive_title}`,
                            urgency: 'high',
                            link: `/coordinator/drives?driveId=${offer.drive_id}&appId=${offer.id}`,
                            created_at: offer.updated_at,
                            data: {
                                application_id: offer.id,
                                drive_id: offer.drive_id,
                                student_name: offer.student_name
                            }
                        });
                    });

                    const stats = {
                        unreviewedCount: (unreviewed || []).length,
                        expiringDrivesCount: (expiringDrives || []).length,
                        expiringOffersCount: (expiringOffers || []).length,
                        totalActionItems: items.length
                    };

                    res.json({ stats, items });
                });
            });
        });
    });
});

module.exports = router;