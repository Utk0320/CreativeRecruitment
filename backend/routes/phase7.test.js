/**
 * routes/phase7.test.js — Phase 7: Interviews, Tests, Offers, and Stage Broadcasts
 *
 * Tests:
 *  - Assessment builder: Timed MCQs (auto-graded), timer enforcement, one-attempt constraint, retry granting, coordinator grading.
 *  - Interview scheduling: Slot publishing, atomic booking, cross-club clash detection, concurrent race-condition handling, .ics generation, no-show outcome.
 *  - Offer coordination: Multi-club ranking, atomic multi-offer acceptance, automatic waitlist cascading on acceptance/decline/expiry.
 *  - Stage messaging: Templates, preview variable interpolation, and stage broadcast dispatch with send logs.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-phase7-interviews-offers-with-32-chars';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); })
);

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/tests', require('./tests'));
app.use('/interviews', require('./interviews'));
app.use('/offers', require('./offers'));
app.use('/messages', require('./messages'));

let ADMIN_ID, LEAD_COORD_A_ID, LEAD_COORD_B_ID;
let STUDENT_1_ID, STUDENT_2_ID, STUDENT_3_ID;
let CLUB_A_ID, CLUB_B_ID, DRIVE_A_ID, DRIVE_B_ID;
let APP_A1_ID, APP_A2_ID, APP_B1_ID, APP_B3_ID;
let SLOT_A_ID, SLOT_B_CLASH_ID, SLOT_SINGLE_CAPACITY_ID;

before(async () => {
    await runMigrations(db);

    const adm = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Admin User','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = adm.lastID;

    const leadA = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Lead Coord A','leada@mmcoe.edu.in','h','coordinator',1,0)");
    LEAD_COORD_A_ID = leadA.lastID;

    const leadB = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Lead Coord B','leadb@mmcoe.edu.in','h','coordinator',1,0)");
    LEAD_COORD_B_ID = leadB.lastID;

    const s1 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Aarav Patel','aarav@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    STUDENT_1_ID = s1.lastID;

    const s2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Bhavna Roy','bhavna@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    STUDENT_2_ID = s2.lastID;

    const s3 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Chirag Sen','chirag@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    STUDENT_3_ID = s3.lastID;

    // Clubs
    const clA = await run("INSERT INTO clubs (name, category, description, version) VALUES ('Coding Club', 'Technical', 'Dev', 1)");
    CLUB_A_ID = clA.lastID;

    const clB = await run("INSERT INTO clubs (name, category, description, version) VALUES ('Robotics Club', 'Technical', 'Robotics', 1)");
    CLUB_B_ID = clB.lastID;

    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'lead', ?)", [CLUB_A_ID, LEAD_COORD_A_ID, ADMIN_ID]);
    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'lead', ?)", [CLUB_B_ID, LEAD_COORD_B_ID, ADMIN_ID]);

    // Drives
    const drA = await run("INSERT INTO recruitment_drives (club_id, title, status, version) VALUES (?, 'Coders 2026', 'published', 1)", [CLUB_A_ID]);
    DRIVE_A_ID = drA.lastID;

    const drB = await run("INSERT INTO recruitment_drives (club_id, title, status, version) VALUES (?, 'RoboWars 2026', 'published', 1)", [CLUB_B_ID]);
    DRIVE_B_ID = drB.lastID;

    // Applications
    // Student 1 applies to Drive A and Drive B
    const a1 = await run("INSERT INTO applications (drive_id, student_id, status, current_stage_id, outcome, version) VALUES (?, ?, 'pending', 'stage_test', 'Shortlisted', 1)", [DRIVE_A_ID, STUDENT_1_ID]);
    APP_A1_ID = a1.lastID;

    const b1 = await run("INSERT INTO applications (drive_id, student_id, status, current_stage_id, outcome, version) VALUES (?, ?, 'pending', 'stage_test', 'Shortlisted', 1)", [DRIVE_B_ID, STUDENT_1_ID]);
    APP_B1_ID = b1.lastID;

    // Student 2 applies to Drive A
    const a2 = await run("INSERT INTO applications (drive_id, student_id, status, current_stage_id, outcome, version) VALUES (?, ?, 'pending', 'stage_test', 'Shortlisted', 1)", [DRIVE_A_ID, STUDENT_2_ID]);
    APP_A2_ID = a2.lastID;

    // Student 3 applies to Drive B (Waitlisted)
    const b3 = await run("INSERT INTO applications (drive_id, student_id, status, current_stage_id, outcome, version) VALUES (?, ?, 'pending', 'stage_final', 'Waitlisted', 1)", [DRIVE_B_ID, STUDENT_3_ID]);
    APP_B3_ID = b3.lastID;
});

after(() => db.close());

// ─────────────────────────────────────────────────────────────────────────────
// 1. SKILL TESTS & ASSESSMENTS
// ─────────────────────────────────────────────────────────────────────────────

test('POST /tests/drive/:driveId: coordinator configures test with MCQs and short answer', async () => {
    const res = await request(app)
        .post(`/tests/drive/${DRIVE_A_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            title: 'Technical Screening Test',
            description: 'Evaluate DSA and Web concepts',
            duration_minutes: 30,
            questions: [
                { id: 'q1', type: 'mcq', prompt: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n^2)'], correct_option: 'O(log n)', points: 10 },
                { id: 'q2', type: 'mcq', prompt: 'Which hook handles side effects in React?', options: ['useState', 'useEffect', 'useMemo'], correct_option: 'useEffect', points: 10 },
                { id: 'q3', type: 'short_answer', prompt: 'Explain how Node event loop handles asynchronous I/O.', points: 20 }
            ],
            total_points: 40
        });

    assert.equal(res.status, 201);
    assert.equal(res.body.drive_id, DRIVE_A_ID);
});

test('GET /tests/drive/:driveId: student views questions without answers; coordinator sees answer keys', async () => {
    // Student view
    const sRes = await request(app)
        .get(`/tests/drive/${DRIVE_A_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(sRes.status, 200);
    assert.equal(sRes.body.questions.length, 3);
    assert.equal(sRes.body.questions[0].correct_option, undefined); // Redacted

    // Coordinator view
    const cRes = await request(app)
        .get(`/tests/drive/${DRIVE_A_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);

    assert.equal(cRes.status, 200);
    assert.equal(cRes.body.questions[0].correct_option, 'O(log n)'); // Present
});

test('POST /tests/applications/:appId/start: student begins test attempt', async () => {
    const res = await request(app)
        .post(`/tests/applications/${APP_A1_ID}/start`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(res.status, 201);
    assert.equal(res.body.attempt_number, 1);
    assert.equal(res.body.duration_minutes, 30);
});

test('GET /tests/applications/:appId/status: verifies active attempt and timer', async () => {
    const res = await request(app)
        .get(`/tests/applications/${APP_A1_ID}/status`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.has_attempt, true);
    assert.equal(res.body.status, 'in_progress');
    assert.ok(res.body.remaining_seconds > 0);
});

test('POST /tests/applications/:appId/submit: student submits answers; MCQs are auto-graded', async () => {
    const res = await request(app)
        .post(`/tests/applications/${APP_A1_ID}/submit`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            answers: {
                q1: 'O(log n)', // correct (10 pts)
                q2: 'useState', // wrong (0 pts)
                q3: 'The event loop uses libuv threadpool for async operations...' // manual grading needed
            }
        });

    assert.equal(res.status, 200);
    assert.equal(res.body.auto_graded_score, 10);
    assert.equal(res.body.requires_manual_grading, true);
    assert.equal(res.body.status, 'submitted');
});

test('POST /tests/applications/:appId/start: second attempt is blocked without coordinator retry grant', async () => {
    const res = await request(app)
        .post(`/tests/applications/${APP_A1_ID}/start`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Assessment already completed/);
});

test('POST /tests/applications/:appId/grant-retry and second attempt succeeds', async () => {
    // Coordinator grants retry
    const grantRes = await request(app)
        .post(`/tests/applications/${APP_A1_ID}/grant-retry`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);
    assert.equal(grantRes.status, 200);

    // Student now successfully starts attempt 2
    const startRes = await request(app)
        .post(`/tests/applications/${APP_A1_ID}/start`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(startRes.status, 201);
    assert.equal(startRes.body.attempt_number, 2);
});

test('POST /tests/submissions/:id/grade: coordinator assigns manual score for short answer', async () => {
    // Get submission 1 id
    const statusRes = await request(app)
        .get(`/tests/applications/${APP_A1_ID}/status`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    const subId = statusRes.body.submission_id;

    const gradeRes = await request(app)
        .post(`/tests/submissions/${subId}/grade`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            manual_score: 18,
            feedback: 'Solid explanation of libuv and macrotask queue.'
        });

    assert.equal(gradeRes.status, 200);
    assert.equal(gradeRes.body.manual_score, 18);
    assert.equal(gradeRes.body.total_score, 18); // attempt 2 auto_score was 0 before submit
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. INTERVIEWS, CLASH DETECTION & RACE CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────

test('POST /interviews/drive/:driveId/slots: coordinators publish interview slots', async () => {
    // Slot in Club A: Tomorrow 10:00 to 10:30 AM (capacity 2)
    const slotA = await request(app)
        .post(`/interviews/drive/${DRIVE_A_ID}/slots`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            start_time: '2026-10-25T10:00:00Z',
            end_time: '2026-10-25T10:30:00Z',
            location: 'MMCOE Room 204',
            capacity: 2
        });

    assert.equal(slotA.status, 201);
    SLOT_A_ID = slotA.body.id;

    // Slot in Club B: Tomorrow 10:15 to 10:45 AM (OVERLAPS with Slot A from 10:15 to 10:30)
    const slotB = await request(app)
        .post(`/interviews/drive/${DRIVE_B_ID}/slots`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_B_ID, 'coordinator')}`)
        .send({
            start_time: '2026-10-25T10:15:00Z',
            end_time: '2026-10-25T10:45:00Z',
            location: 'MMCOE Robotics Lab',
            capacity: 1
        });

    assert.equal(slotB.status, 201);
    SLOT_B_CLASH_ID = slotB.body.id;

    // Slot in Club A: Single capacity slot (capacity 1) for race test
    const singleSlot = await request(app)
        .post(`/interviews/drive/${DRIVE_A_ID}/slots`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            start_time: '2026-10-26T14:00:00Z',
            end_time: '2026-10-26T14:30:00Z',
            location: 'Online Google Meet',
            capacity: 1
        });

    assert.equal(singleSlot.status, 201);
    SLOT_SINGLE_CAPACITY_ID = singleSlot.body.id;
});

test('POST /interviews/book: Student 1 books Slot A in Club A', async () => {
    const res = await request(app)
        .post('/interviews/book')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            slot_id: SLOT_A_ID,
            application_id: APP_A1_ID
        });

    assert.equal(res.status, 201);
    assert.equal(res.body.slot_id, SLOT_A_ID);
});

test('POST /interviews/book: Clash detection blocks Student 1 from booking overlapping Slot B in Club B', async () => {
    const res = await request(app)
        .post('/interviews/book')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            slot_id: SLOT_B_CLASH_ID,
            application_id: APP_B1_ID
        });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Interview time clash/);
    assert.equal(res.body.clash_club, 'Coding Club');
});

test('POST /interviews/book: Race condition test — two students booking last seat simultaneously', async () => {
    // Both Student 1 and Student 2 try to book the single-capacity slot concurrently
    const [res1, res2] = await Promise.all([
        request(app)
            .post('/interviews/book')
            .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
            .send({ slot_id: SLOT_SINGLE_CAPACITY_ID, application_id: APP_A1_ID }),
        request(app)
            .post('/interviews/book')
            .set('Authorization', `Bearer ${as(STUDENT_2_ID, 'student')}`)
            .send({ slot_id: SLOT_SINGLE_CAPACITY_ID, application_id: APP_A2_ID })
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (201) and the other must be rejected (409 Slot full)
    assert.deepEqual(statuses, [201, 409]);
});

test('GET /interviews/:bookingId/ics: generates valid RFC 5545 iCalendar file', async () => {
    // Get booking ID for Student 2
    const slotsRes = await request(app)
        .get(`/interviews/drive/${DRIVE_A_ID}/slots`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);

    const booking = slotsRes.body.bookings[0];
    assert.ok(booking, 'Booking must exist');

    const icsRes = await request(app)
        .get(`/interviews/${booking.id}/ics`)
        .set('Authorization', `Bearer ${as(booking.student_id, 'student')}`);

    assert.equal(icsRes.status, 200);
    assert.match(icsRes.headers['content-type'], /text\/calendar/);
    assert.ok(icsRes.text.includes('BEGIN:VCALENDAR'));
    assert.ok(icsRes.text.includes('BEGIN:VEVENT'));
    assert.ok(icsRes.text.includes('STATUS:CONFIRMED'));
    assert.ok(icsRes.text.includes('END:VCALENDAR'));
});

test('POST /interviews/:bookingId/no-show: coordinator records No Show', async () => {
    const slotsRes = await request(app)
        .get(`/interviews/drive/${DRIVE_A_ID}/slots`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);

    const booking = slotsRes.body.bookings[0];

    const res = await request(app)
        .post(`/interviews/${booking.id}/no-show`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);

    assert.equal(res.status, 200);
    assert.match(res.body.message, /recorded as No Show/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. MULTI-OFFER COORDINATION & AUTO-WAITLIST CASCADING
// ─────────────────────────────────────────────────────────────────────────────

test('POST /offers/rank and GET /offers/my-offers: student ranks multi-club offers', async () => {
    // Set both APP_A1 and APP_B1 to Selected
    await run("UPDATE applications SET outcome = 'Selected', offer_status = 'offered', offer_expires_at = datetime('now', '+2 days') WHERE id = ?", [APP_A1_ID]);
    await run("UPDATE applications SET outcome = 'Selected', offer_status = 'offered', offer_expires_at = datetime('now', '+2 days') WHERE id = ?", [APP_B1_ID]);

    // Student fetches their offers
    const offersRes = await request(app)
        .get('/offers/my-offers')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(offersRes.status, 200);
    assert.equal(offersRes.body.length, 2);

    // Student ranks Club A as #1, Club B as #2
    const rankRes = await request(app)
        .post('/offers/rank')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            rankings: [
                { application_id: APP_A1_ID, rank: 1 },
                { application_id: APP_B1_ID, rank: 2 }
            ]
        });

    assert.equal(rankRes.status, 200);
});

test('POST /offers/:appId/accept: accepting Club A releases Club B and auto-cascades to waitlisted Student 3', async () => {
    // Student 1 accepts Club A
    const acceptRes = await request(app)
        .post(`/offers/${APP_A1_ID}/accept`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.accepted_application_id, APP_A1_ID);
    assert.equal(acceptRes.body.released_count, 1); // Club B offer was released

    // Verify Club B application for Student 1 is now Declined
    const student1BApp = await new Promise((res, rej) => db.get('SELECT * FROM applications WHERE id = ?', [APP_B1_ID], (e, r) => e ? rej(e) : res(r)));
    assert.equal(student1BApp.outcome, 'Declined');
    assert.equal(student1BApp.offer_status, 'declined');

    // Verify Student 3 (who was Waitlisted in Club B) has been AUTOMATICALLY PROMOTED to Selected!
    const student3BApp = await new Promise((res, rej) => db.get('SELECT * FROM applications WHERE id = ?', [APP_B3_ID], (e, r) => e ? rej(e) : res(r)));
    assert.equal(student3BApp.outcome, 'Selected');
    assert.equal(student3BApp.offer_status, 'offered');
    assert.ok(student3BApp.offer_expires_at);
});

test('POST /offers/:appId/decline: student explicitly declining an offer triggers cascade', async () => {
    // Student 4 joins waitlist in Club A
    const s4 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Divya Rao','divya@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    const a4 = await run("INSERT INTO applications (drive_id, student_id, status, outcome, version) VALUES (?, ?, 'pending', 'Waitlisted', 1)", [DRIVE_A_ID, s4.lastID]);

    // Student 1 declines their Club A offer
    const decRes = await request(app)
        .post(`/offers/${APP_A1_ID}/decline`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(decRes.status, 200);

    // Divya (APP a4) was waitlisted and is now promoted to Selected!
    const divyaApp = await new Promise((res, rej) => db.get('SELECT * FROM applications WHERE id = ?', [a4.lastID], (e, r) => e ? rej(e) : res(r)));
    assert.equal(divyaApp.outcome, 'Selected');
    assert.equal(divyaApp.offer_status, 'offered');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MESSAGE TEMPLATES & STAGE BROADCASTS
// ─────────────────────────────────────────────────────────────────────────────

test('POST /messages/templates/club/:clubId: coordinator creates reusable template', async () => {
    const res = await request(app)
        .post(`/messages/templates/club/${CLUB_A_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            name: 'Interview Shortlist Invitation',
            subject: 'Congratulations {{student_name}} - Shortlisted for {{drive_title}}',
            body_template: 'Dear {{student_name}},\n\nYou have advanced to {{stage_name}} for {{club_name}}.\nPlease book your interview slot.',
            stage_id: 'stage_interview'
        });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Interview Shortlist Invitation');
});

test('POST /messages/broadcast/preview: variable interpolation works for sample applicant', async () => {
    const res = await request(app)
        .post('/messages/broadcast/preview')
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            drive_id: DRIVE_A_ID,
            stage_id: 'stage_test',
            subject_template: 'Notice for {{student_name}} regarding {{drive_title}}',
            body_template: 'Hello {{student_name}}, your stage is {{stage_name}}.'
        });

    assert.equal(res.status, 200);
    assert.match(res.body.sample_preview.subject, /Notice for/);
    assert.match(res.body.sample_preview.body, /stage_test/);
});

test('POST /messages/broadcast/send: dispatches bulk stage message and logs send history', async () => {
    const res = await request(app)
        .post('/messages/broadcast/send')
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`)
        .send({
            drive_id: DRIVE_A_ID,
            stage_id: 'stage_test',
            subject: 'Important Instructions for Technical Test',
            body: 'Please ensure your web camera is functional and have your MMCOE ID ready.'
        });

    assert.equal(res.status, 201);
    assert.ok(res.body.log_id);

    // Verify logs
    const logsRes = await request(app)
        .get(`/messages/logs/drive/${DRIVE_A_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_A_ID, 'coordinator')}`);

    assert.equal(logsRes.status, 200);
    assert.equal(logsRes.body.length, 1);
    assert.equal(logsRes.body[0].subject, 'Important Instructions for Technical Test');
});
