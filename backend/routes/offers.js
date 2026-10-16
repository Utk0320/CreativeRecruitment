const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');

// Helper to cascade the top waitlisted candidate for a drive to a freed seat
function cascadeNextWaitlistedApplicant(driveId, clubId, callback) {
    db.get(`
        SELECT a.*
        FROM applications a
        WHERE a.drive_id = ? AND a.outcome = 'Waitlisted' AND (a.offer_status IS NULL OR a.offer_status != 'offered')
        ORDER BY a.id ASC
        LIMIT 1
    `, [driveId], (err, waitlistedApp) => {
        if (err || !waitlistedApp) {
            return callback(null, null); // No waitlisted candidate to cascade
        }

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        db.run(`
            UPDATE applications
            SET outcome = 'Selected',
                offer_status = 'offered',
                offer_expires_at = ?,
                version = version + 1
            WHERE id = ?
        `, [expiresAt, waitlistedApp.id], (uErr) => {
            if (uErr) return callback(uErr, null);

            db.run(`
                INSERT INTO offers (application_id, student_id, club_id, drive_id, status, expires_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
                ON CONFLICT(application_id) DO UPDATE SET
                    status = 'pending',
                    expires_at = excluded.expires_at,
                    accepted_at = NULL,
                    declined_at = NULL
            `, [waitlistedApp.id, waitlistedApp.student_id, clubId, driveId, expiresAt], (oErr) => {
                if (oErr) return callback(oErr, null);
                callback(null, {
                    promoted_application_id: waitlistedApp.id,
                    student_id: waitlistedApp.student_id,
                    expires_at: expiresAt
                });
            });
        });
    });
}

// ── GET /my-offers — Student views all active offers across clubs ─────────────
router.get('/my-offers', authenticateToken, requireRole('student'), (req, res) => {
    db.all(`
        SELECT a.id AS application_id, a.drive_id, a.outcome, a.offer_status, a.offer_expires_at,
               a.student_preference_rank, rd.title AS drive_title, c.name AS club_name, c.id AS club_id,
               c.category AS club_category, o.status AS recorded_offer_status
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        LEFT JOIN offers o ON o.application_id = a.id
        WHERE a.student_id = ? AND (a.outcome = 'Selected' OR a.offer_status = 'offered' OR a.offer_status = 'accepted')
        ORDER BY a.student_preference_rank ASC, a.id ASC
    `, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

// ── POST /rank — Student updates preference rankings for their offers ────────
router.post('/rank', authenticateToken, requireRole('student'), withTransaction(db, 'offer.ranked', 'offer_ranking'), (req, res) => {
    const { rankings = [] } = req.body; // array of { application_id, rank }

    if (!Array.isArray(rankings)) {
        return res.status(400).json({ error: 'Rankings must be an array of { application_id, rank }' });
    }

    let processed = 0;
    if (rankings.length === 0) return res.json({ message: 'Rankings updated' });

    rankings.forEach(item => {
        db.run(`
            UPDATE applications
            SET student_preference_rank = ?
            WHERE id = ? AND student_id = ?
        `, [Number(item.rank) || 0, Number(item.application_id), req.user.id], () => {
            db.run(`
                UPDATE offers
                SET rank = ?
                WHERE application_id = ? AND student_id = ?
            `, [Number(item.rank) || 0, Number(item.application_id), req.user.id], () => {
                processed++;
                if (processed === rankings.length) {
                    req.activityEntityId = req.user.id;
                    req.activityAfterJson = { count: rankings.length };
                    res.json({ message: 'Offer preferences saved successfully' });
                }
            });
        });
    });
});

// ── POST /:applicationId/accept — Student accepts an offer ───────────────────
router.post('/:applicationId/accept', authenticateToken, requireRole('student'), withTransaction(db, 'offer.accepted', 'offer'), (req, res) => {
    const appId = Number(req.params.applicationId);
    const studentId = req.user.id;

    // Fetch the accepted application
    db.get(`
        SELECT a.*, rd.club_id, rd.season_id, rd.title AS drive_title, c.name AS club_name
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        WHERE a.id = ? AND a.student_id = ?
    `, [appId, studentId], (err, targetApp) => {
        if (err || !targetApp) return res.status(404).json({ error: 'Application not found' });

        if (targetApp.outcome !== 'Selected' && targetApp.offer_status !== 'offered') {
            return res.status(400).json({ error: 'Cannot accept an application that is not in Selected or Offered state' });
        }

        // Check if offer expired
        if (targetApp.offer_expires_at && new Date(targetApp.offer_expires_at) < new Date()) {
            return res.status(400).json({ error: 'This recruitment offer has expired' });
        }

        // 1. Mark target application as accepted
        db.run(`
            UPDATE applications
            SET offer_status = 'accepted', outcome = 'Selected', version = version + 1
            WHERE id = ?
        `, [appId], (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Failed to accept offer' });

            db.run(`
                INSERT INTO offers (application_id, student_id, club_id, drive_id, status, accepted_at)
                VALUES (?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP)
                ON CONFLICT(application_id) DO UPDATE SET
                    status = 'accepted',
                    accepted_at = CURRENT_TIMESTAMP
            `, [appId, studentId, targetApp.club_id, targetApp.drive_id], () => {});

            // Phase 9: Automated idempotent roster membership generation upon offer acceptance
            db.run(`
                INSERT INTO club_members (club_id, user_id, role, title, status, joined_season_id, created_at)
                VALUES (?, ?, 'member', 'New Recruit', 'active', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(club_id, user_id) DO UPDATE SET
                    status = 'active',
                    updated_at = CURRENT_TIMESTAMP
            `, [targetApp.club_id, studentId, targetApp.season_id || null], () => {});

            // 2. Multi-offer coordination: Find all OTHER offers held by this student that must now be released
            db.all(`
                SELECT a.id, a.drive_id, rd.club_id
                FROM applications a
                JOIN recruitment_drives rd ON a.drive_id = rd.id
                WHERE a.student_id = ? AND a.id != ? AND (a.outcome = 'Selected' OR a.offer_status = 'offered')
            `, [studentId, appId], (otherErr, otherApps) => {
                if (otherErr) return res.status(500).json({ error: 'Failed to query other offers' });

                const cascadedList = [];

                // Function to release other offers and trigger waitlist cascades
                const releaseAndCascadeOthers = (index) => {
                    if (index >= otherApps.length) {
                        req.activityEntityId = appId;
                        req.activityClubId = targetApp.club_id;
                        req.activityAfterJson = {
                            accepted_club: targetApp.club_name,
                            released_offers_count: otherApps.length,
                            cascades: cascadedList
                        };

                        return res.json({
                            message: `Offer from ${targetApp.club_name} accepted successfully! Other offers were released.`,
                            accepted_application_id: appId,
                            released_count: otherApps.length,
                            cascaded_waitlist: cascadedList
                        });
                    }

                    const other = otherApps[index];
                    // Mark as declined by student to free the seat
                    db.run(`
                        UPDATE applications
                        SET offer_status = 'declined', outcome = 'Declined', version = version + 1
                        WHERE id = ?
                    `, [other.id], () => {
                        db.run(`
                            INSERT INTO offers (application_id, student_id, club_id, drive_id, status, declined_at)
                            VALUES (?, ?, ?, ?, 'declined', CURRENT_TIMESTAMP)
                            ON CONFLICT(application_id) DO UPDATE SET
                                status = 'declined',
                                declined_at = CURRENT_TIMESTAMP
                        `, [other.id, studentId, other.club_id, other.drive_id], () => {
                            // Cascade top waitlisted applicant for this freed seat
                            cascadeNextWaitlistedApplicant(other.drive_id, other.club_id, (cascErr, cascResult) => {
                                if (cascResult) {
                                    cascadedList.push(cascResult);
                                }
                                releaseAndCascadeOthers(index + 1);
                            });
                        });
                    });
                };

                releaseAndCascadeOthers(0);
            });
        });
    });
});

// ── POST /:applicationId/decline — Student declines an offer ─────────────────
router.post('/:applicationId/decline', authenticateToken, requireRole('student'), withTransaction(db, 'offer.declined', 'offer'), (req, res) => {
    const appId = Number(req.params.applicationId);
    const studentId = req.user.id;

    db.get(`
        SELECT a.*, rd.club_id, rd.title AS drive_title, c.name AS club_name
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        WHERE a.id = ? AND a.student_id = ?
    `, [appId, studentId], (err, targetApp) => {
        if (err || !targetApp) return res.status(404).json({ error: 'Application not found' });

        db.run(`
            UPDATE applications
            SET offer_status = 'declined', outcome = 'Declined', version = version + 1
            WHERE id = ?
        `, [appId], (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Failed to decline offer' });

            db.run(`
                INSERT INTO offers (application_id, student_id, club_id, drive_id, status, declined_at)
                VALUES (?, ?, ?, ?, 'declined', CURRENT_TIMESTAMP)
                ON CONFLICT(application_id) DO UPDATE SET
                    status = 'declined',
                    declined_at = CURRENT_TIMESTAMP
            `, [appId, studentId, targetApp.club_id, targetApp.drive_id], () => {});

            // Auto-cascade to top waitlisted applicant
            cascadeNextWaitlistedApplicant(targetApp.drive_id, targetApp.club_id, (cascErr, cascResult) => {
                req.activityEntityId = appId;
                req.activityClubId = targetApp.club_id;
                req.activityAfterJson = {
                    declined_club: targetApp.club_name,
                    cascaded: cascResult
                };

                res.json({
                    message: `Offer declined. Seat cascaded to waitlisted applicant.`,
                    declined_application_id: appId,
                    cascaded_applicant: cascResult
                });
            });
        });
    });
});

// ── POST /drive/:driveId/cascade-expired — Sweep and cascade expired offers ──
router.post('/drive/:driveId/cascade-expired', authenticateToken, requireRole('coordinator'), withTransaction(db, 'offer.cascade_expired', 'recruitment_drive'), async (req, res) => {
    const driveId = Number(req.params.driveId);

    db.get('SELECT club_id FROM recruitment_drives WHERE id = ?', [driveId], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: drive.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        // Find offers that expired without acceptance
        db.all(`
            SELECT a.id, a.drive_id, a.student_id
            FROM applications a
            WHERE a.drive_id = ? AND a.offer_status = 'offered' AND a.offer_expires_at < CURRENT_TIMESTAMP
        `, [driveId], (fErr, expiredApps) => {
            if (fErr) return res.status(500).json({ error: 'Database error' });

            const cascaded = [];

            const processExpired = (index) => {
                if (index >= expiredApps.length) {
                    req.activityEntityId = driveId;
                    req.activityClubId = drive.club_id;
                    req.activityAfterJson = { expired_count: expiredApps.length, cascades: cascaded };

                    return res.json({
                        message: `Processed ${expiredApps.length} expired offers.`,
                        expired_count: expiredApps.length,
                        cascaded
                    });
                }

                const expired = expiredApps[index];
                db.run(`
                    UPDATE applications
                    SET offer_status = 'expired', outcome = 'Expired', version = version + 1
                    WHERE id = ?
                `, [expired.id], () => {
                    db.run(`
                        UPDATE offers
                        SET status = 'expired'
                        WHERE application_id = ?
                    `, [expired.id], () => {
                        cascadeNextWaitlistedApplicant(driveId, drive.club_id, (cascErr, cascResult) => {
                            if (cascResult) cascaded.push(cascResult);
                            processExpired(index + 1);
                        });
                    });
                });
            };

            processExpired(0);
        });
    });
});

module.exports = router;
