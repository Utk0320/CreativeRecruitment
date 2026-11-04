const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { can } = require('../utils/can');

// Helper to format ISO date for RFC 5545 iCalendar
function formatIcsDate(d) {
    return new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function generateIcs({ title, description, location, startTime, endTime, organizerName, organizerEmail }) {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@creativerecruit.mmcoe.edu.in`;
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//MMCOE//CreativeRecruit//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(startTime)}`,
        `DTEND:${formatIcsDate(endTime)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${(description || '').replace(/\r?\n/g, '\\n')}`,
        `LOCATION:${location || 'MMCOE Campus'}`,
        `ORGANIZER;CN=${organizerName || 'CreativeRecruit'}:mailto:${organizerEmail || 'no-reply@mmcoe.edu.in'}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

// ── GET /drive/:driveId/slots — List slots for a recruitment drive ───────────
router.get('/drive/:driveId/slots', authenticateToken, (req, res) => {
    const driveId = Number(req.params.driveId);

    if (req.user.role === 'coordinator' || req.user.role === 'admin') {
        db.all(`
            SELECT s.*, u.name AS coordinator_name,
                   (SELECT COUNT(*) FROM interview_bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed') AS actual_booked_count
            FROM interview_slots s
            LEFT JOIN users u ON s.coordinator_id = u.id
            WHERE s.drive_id = ? AND s.is_cancelled = 0
            ORDER BY s.start_time ASC
        `, [driveId], (err, slots) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            // Fetch bookings with student details for coordinators
            db.all(`
                SELECT b.*, u.name AS student_name, u.email AS student_email, a.current_stage_id, a.outcome
                FROM interview_bookings b
                JOIN interview_slots s ON b.slot_id = s.id
                JOIN users u ON b.student_id = u.id
                JOIN applications a ON b.application_id = a.id
                WHERE s.drive_id = ? AND b.status = 'confirmed'
            `, [driveId], (bErr, bookings) => {
                if (bErr) return res.status(500).json({ error: 'Database error' });
                res.json({ slots, bookings });
            });
        });
    } else {
        // Student view: available slots & student's own booking
        db.all(`
            SELECT s.id, s.drive_id, s.start_time, s.end_time, s.location, s.capacity, s.booked_count,
                   (s.capacity > s.booked_count) AS is_available
            FROM interview_slots s
            WHERE s.drive_id = ? AND s.is_cancelled = 0
            ORDER BY s.start_time ASC
        `, [driveId], (err, slots) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            db.get(`
                SELECT b.*, s.start_time, s.end_time, s.location
                FROM interview_bookings b
                JOIN interview_slots s ON b.slot_id = s.id
                WHERE s.drive_id = ? AND b.student_id = ? AND b.status = 'confirmed'
            `, [driveId, req.user.id], (bErr, myBooking) => {
                if (bErr) return res.status(500).json({ error: 'Database error' });
                res.json({ slots, my_booking: myBooking || null });
            });
        });
    }
});

// ── POST /drive/:driveId/slots — Coordinator publishes an interview slot ─────
router.post('/drive/:driveId/slots', authenticateToken, requireRole('coordinator'), withTransaction(db, 'interview.slot_created', 'interview_slot'), async (req, res) => {
    const driveId = Number(req.params.driveId);
    const { start_time, end_time, location, capacity = 1 } = req.body;

    if (!start_time || !end_time || !location) {
        return res.status(400).json({ error: 'Start time, end time, and location are required' });
    }

    if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ error: 'End time must be strictly after start time' });
    }

    db.get('SELECT club_id FROM recruitment_drives WHERE id = ?', [driveId], async (err, drive) => {
        if (err || !drive) return res.status(404).json({ error: 'Drive not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: drive.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized to manage interview slots' });

        db.run(`
            INSERT INTO interview_slots (drive_id, coordinator_id, start_time, end_time, location, capacity, booked_count)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `, [driveId, req.user.id, start_time, end_time, location.trim(), Number(capacity) || 1], function(insErr) {
            if (insErr) return res.status(500).json({ error: 'Failed to create slot' });

            req.activityEntityId = this.lastID;
            req.activityClubId = drive.club_id;
            req.activityAfterJson = { start_time, end_time, location, capacity };

            res.status(201).json({
                id: this.lastID,
                drive_id: driveId,
                start_time,
                end_time,
                location,
                capacity: Number(capacity) || 1
            });
        });
    });
});

// ── DELETE /slots/:slotId — Coordinator cancels / removes slot ───────────────
router.delete('/slots/:slotId', authenticateToken, requireRole('coordinator'), withTransaction(db, 'interview.slot_deleted', 'interview_slot'), async (req, res) => {
    const slotId = Number(req.params.slotId);

    db.get(`
        SELECT s.*, rd.club_id
        FROM interview_slots s
        JOIN recruitment_drives rd ON s.drive_id = rd.id
        WHERE s.id = ?
    `, [slotId], async (err, slot) => {
        if (err || !slot) return res.status(404).json({ error: 'Slot not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: slot.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.run('UPDATE interview_slots SET is_cancelled = 1 WHERE id = ?', [slotId], function(uErr) {
            if (uErr) return res.status(500).json({ error: 'Failed to cancel slot' });

            req.activityEntityId = slotId;
            req.activityClubId = slot.club_id;
            req.activityAfterJson = { is_cancelled: 1 };

            res.json({ message: 'Interview slot cancelled' });
        });
    });
});

// ── POST /book — Student books interview slot with clash detection ───────────
router.post('/book', authenticateToken, requireRole('student'), withTransaction(db, 'interview.booked', 'interview_booking'), (req, res) => {
    const { slot_id, application_id } = req.body;
    const studentId = req.user.id;

    if (!slot_id || !application_id) {
        return res.status(400).json({ error: 'Slot ID and Application ID are required' });
    }

    // 1. Verify application belongs to student and drive matches slot
    db.get(`
        SELECT a.*, rd.id AS drive_id, rd.title AS drive_title, rd.club_id, c.name AS club_name
        FROM applications a
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        WHERE a.id = ? AND a.student_id = ?
    `, [application_id, studentId], (aErr, app) => {
        if (aErr || !app) return res.status(404).json({ error: 'Application not found' });

        // 2. Fetch slot
        db.get('SELECT * FROM interview_slots WHERE id = ? AND is_cancelled = 0', [slot_id], (sErr, slot) => {
            if (sErr || !slot) return res.status(404).json({ error: 'Interview slot not found or cancelled' });
            if (slot.drive_id !== app.drive_id) {
                return res.status(400).json({ error: 'Slot does not match application drive' });
            }

            // 3. Check capacity atomically
            if (slot.booked_count >= slot.capacity) {
                return res.status(409).json({ error: 'Slot is already fully booked' });
            }

            // 4. CROSS-CLUB CLASH DETECTION
            // Check if student has ANY other confirmed interview overlapping with [slot.start_time, slot.end_time)
            db.get(`
                SELECT ib.*, s.start_time, s.end_time, c.name AS club_name, rd.title AS drive_title
                FROM interview_bookings ib
                JOIN interview_slots s ON ib.slot_id = s.id
                JOIN applications a ON ib.application_id = a.id
                JOIN recruitment_drives rd ON a.drive_id = rd.id
                JOIN clubs c ON rd.club_id = c.id
                WHERE ib.student_id = ? AND ib.status = 'confirmed' AND ib.application_id != ?
                  AND s.is_cancelled = 0
                  AND (s.start_time < ? AND s.end_time > ?)
            `, [studentId, application_id, slot.end_time, slot.start_time], (cErr, clash) => {
                if (cErr) return res.status(500).json({ error: 'Clash check failed' });

                if (clash) {
                    return res.status(409).json({
                        error: `Interview time clash: You already have an interview scheduled with ${clash.club_name} from ${new Date(clash.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(clash.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        clash_club: clash.club_name,
                        clash_start: clash.start_time,
                        clash_end: clash.end_time
                    });
                }

                // 5. Cancel any previous booking for this application if rescheduling
                db.run(`
                    UPDATE interview_slots
                    SET booked_count = MAX(0, booked_count - 1)
                    WHERE id IN (
                        SELECT slot_id FROM interview_bookings WHERE application_id = ? AND status = 'confirmed'
                    )
                `, [application_id], (uErr) => {
                    if (uErr) return res.status(500).json({ error: 'Failed to update old booking' });

                    db.run('DELETE FROM interview_bookings WHERE application_id = ?', [application_id], (dErr) => {
                        if (dErr) return res.status(500).json({ error: 'Failed to clear old booking' });

                        // 6. Insert new booking & increment slot booked_count
                        db.run(`
                            INSERT INTO interview_bookings (slot_id, application_id, student_id, status)
                            VALUES (?, ?, ?, 'confirmed')
                        `, [slot_id, application_id, studentId], function(bInsErr) {
                            if (bInsErr) return res.status(500).json({ error: 'Failed to book slot' });
                            const bookingId = this.lastID;

                            db.run('UPDATE interview_slots SET booked_count = booked_count + 1 WHERE id = ?', [slot_id], (incErr) => {
                                if (incErr) return res.status(500).json({ error: 'Failed to reserve slot capacity' });

                                req.activityEntityId = bookingId;
                                req.activityClubId = app.club_id;
                                req.activityAfterJson = {
                                    slot_id,
                                    start_time: slot.start_time,
                                    end_time: slot.end_time,
                                    location: slot.location
                                };

                                res.status(201).json({
                                    message: 'Interview slot booked successfully',
                                    booking_id: bookingId,
                                    slot_id,
                                    start_time: slot.start_time,
                                    end_time: slot.end_time,
                                    location: slot.location
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ── POST /cancel — Cancel an interview booking ───────────────────────────────
router.post('/cancel', authenticateToken, withTransaction(db, 'interview.cancelled', 'interview_booking'), (req, res) => {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: 'Booking ID is required' });

    db.get(`
        SELECT ib.*, s.id AS slot_id, rd.club_id
        FROM interview_bookings ib
        JOIN interview_slots s ON ib.slot_id = s.id
        JOIN applications a ON ib.application_id = a.id
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        WHERE ib.id = ?
    `, [booking_id], (err, booking) => {
        if (err || !booking) return res.status(404).json({ error: 'Booking not found' });

        // Authorization check: student who booked or authorized coordinator
        if (req.user.role === 'student' && booking.student_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        db.run("UPDATE interview_bookings SET status = 'cancelled' WHERE id = ?", [booking_id], (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Failed to cancel booking' });

            db.run('UPDATE interview_slots SET booked_count = MAX(0, booked_count - 1) WHERE id = ?', [booking.slot_id], () => {
                req.activityEntityId = booking_id;
                req.activityClubId = booking.club_id;
                req.activityAfterJson = { status: 'cancelled' };

                res.json({ message: 'Interview booking cancelled successfully' });
            });
        });
    });
});

// ── GET /:bookingId/ics — Download .ics calendar event file ──────────────────
router.get('/:bookingId/ics', authenticateToken, (req, res) => {
    const bookingId = Number(req.params.bookingId);

    db.get(`
        SELECT ib.*, s.start_time, s.end_time, s.location,
               rd.title AS drive_title, c.name AS club_name,
               u.name AS student_name, u.email AS student_email
        FROM interview_bookings ib
        JOIN interview_slots s ON ib.slot_id = s.id
        JOIN applications a ON ib.application_id = a.id
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        JOIN clubs c ON rd.club_id = c.id
        JOIN users u ON ib.student_id = u.id
        WHERE ib.id = ?
    `, [bookingId], (err, b) => {
        if (err || !b) return res.status(404).json({ error: 'Booking not found' });

        if (req.user.role === 'student' && b.student_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const icsContent = generateIcs({
            title: `MMCOE Interview: ${b.club_name} - ${b.drive_title}`,
            description: `Recruitment interview for ${b.student_name} (${b.student_email}). Drive: ${b.drive_title}. Location: ${b.location}`,
            location: b.location,
            startTime: b.start_time,
            endTime: b.end_time,
            organizerName: `${b.club_name} Recruitment`,
            organizerEmail: 'recruit@mmcoe.edu.in'
        });

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="interview-${b.club_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics"`);
        res.send(icsContent);
    });
});

// ── POST /:bookingId/no-show — Coordinator marks candidate as No Show ────────
router.post('/:bookingId/no-show', authenticateToken, requireRole('coordinator'), withTransaction(db, 'interview.no_show', 'interview_booking'), async (req, res) => {
    const bookingId = Number(req.params.bookingId);

    db.get(`
        SELECT ib.*, a.id AS app_id, rd.club_id
        FROM interview_bookings ib
        JOIN applications a ON ib.application_id = a.id
        JOIN recruitment_drives rd ON a.drive_id = rd.id
        WHERE ib.id = ?
    `, [bookingId], async (err, b) => {
        if (err || !b) return res.status(404).json({ error: 'Booking not found' });
        const canReview = await can(db, req.user, 'application.review', { clubId: b.club_id });
        if (!canReview) return res.status(403).json({ error: 'Not authorized' });

        db.run("UPDATE interview_bookings SET status = 'no_show' WHERE id = ?", [bookingId], (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Failed to update booking status' });

            db.run("UPDATE applications SET outcome = 'No Show', version = version + 1 WHERE id = ?", [b.app_id], (aErr) => {
                if (aErr) return res.status(500).json({ error: 'Failed to update application outcome' });

                req.activityEntityId = bookingId;
                req.activityClubId = b.club_id;
                req.activityAfterJson = { status: 'no_show', outcome: 'No Show' };

                res.json({ message: 'Candidate recorded as No Show' });
            });
        });
    });
});

module.exports = router;
