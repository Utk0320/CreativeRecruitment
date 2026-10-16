/**
 * routes/phase9.test.js — Phase 9 Member Lifecycle Integration Tests
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

// In-memory test DB
const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );

const getRow = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/clubs/:clubId/members', require('./clubMembers'));
app.use('/offers', require('./offers'));
app.use('/lifecycle', require('./lifecycle'));

let ADMIN_ID, COORD_ID, COORD_OTHER_ID, STUDENT_ID, STUDENT2_ID;
let CLUB_ID, OTHER_CLUB_ID, DRIVE_ID, SEASON_ID, APP_ID;

before(async () => {
    await runMigrations(db);

    const a = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Admin','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = a.lastID;

    const c1 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Lead Coord','lead@mmcoe.edu.in','h','coordinator',1,0)");
    COORD_ID = c1.lastID;

    const c2 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Other Coord','other@mmcoe.edu.in','h','coordinator',1,0)");
    COORD_OTHER_ID = c2.lastID;

    const s1 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version, department, year) VALUES ('Alice Student','alice@mmcoe.edu.in','h','student',1,0,'Computer',2)");
    STUDENT_ID = s1.lastID;

    const s2 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version, department, year) VALUES ('Bob Student','bob@mmcoe.edu.in','h','student',1,0,'IT',3)");
    STUDENT2_ID = s2.lastID;

    const cl1 = await run("INSERT INTO clubs (name, category) VALUES ('Robotics Club','Technical')");
    CLUB_ID = cl1.lastID;

    const cl2 = await run("INSERT INTO clubs (name, category) VALUES ('Music Club','Cultural')");
    OTHER_CLUB_ID = cl2.lastID;

    // Set lead coordinator for CLUB_ID
    await run(`INSERT INTO club_members (club_id, user_id, role, title, added_by) VALUES (${CLUB_ID}, ${COORD_ID}, 'lead', 'President', ${COORD_ID})`);

    // Create season & drive
    const seas = await run("INSERT INTO recruitment_seasons (name, start_date, end_date, status, created_by) VALUES ('AY 2026-27','2026-07-01','2027-06-30','active'," + ADMIN_ID + ")");
    SEASON_ID = seas.lastID;

    const dr = await run(`INSERT INTO recruitment_drives (club_id, title, status, season_id) VALUES (${CLUB_ID}, 'Robo Tech Drive', 'published', ${SEASON_ID})`);
    DRIVE_ID = dr.lastID;

    // Student application with offer ready
    const ap = await run(`INSERT INTO applications (student_id, drive_id, outcome, offer_status, current_stage_id) VALUES (${STUDENT_ID}, ${DRIVE_ID}, 'Selected', 'offered', 'stage-offer')`);
    APP_ID = ap.lastID;
});

after(() => new Promise(resolve => db.close(resolve)));

describe('Phase 9: Member Lifecycle Integration Tests', () => {

    test('accepting an offer automatically & idempotently enrolls student in club_members roster', async () => {
        // Initially not in club_members
        const before = await getRow('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, STUDENT_ID]);
        assert.equal(before, undefined);

        const res = await request(app)
            .post(`/offers/${APP_ID}/accept`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({});

        assert.equal(res.status, 200);

        // Verify roster record
        const member = await getRow('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, STUDENT_ID]);
        assert.ok(member);
        assert.equal(member.role, 'member');
        assert.equal(member.status, 'active');
        assert.equal(member.joined_season_id, SEASON_ID);
    });

    test('club lead can update member title and status (e.g. promoting or marking alumni)', async () => {
        const res = await request(app)
            .patch(`/clubs/${CLUB_ID}/members/${STUDENT_ID}`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ title: 'Hardware Lead', status: 'active' });

        assert.equal(res.status, 200);

        const updated = await getRow('SELECT title, status FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, STUDENT_ID]);
        assert.equal(updated.title, 'Hardware Lead');
    });

    test('member can toggle their own public directory visibility', async () => {
        const res = await request(app)
            .patch(`/clubs/${CLUB_ID}/members/my/visibility`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ is_public: 0 });

        assert.equal(res.status, 200);
        assert.equal(res.body.is_public, 0);

        const member = await getRow('SELECT is_public FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, STUDENT_ID]);
        assert.equal(member.is_public, 0);
    });

    test('public roster redacts hidden members for regular viewers but shows to coordinators', async () => {
        // Regular student viewer
        const pubRes = await request(app)
            .get(`/clubs/${CLUB_ID}/members/roster`)
            .set('Authorization', `Bearer ${as(STUDENT2_ID, 'student')}`);

        assert.equal(pubRes.status, 200);
        // STUDENT_ID has is_public = 0, so should NOT be visible to student viewer
        assert.equal(pubRes.body.some(m => m.user_id === STUDENT_ID), false);

        // Coordinator viewer
        const coordRes = await request(app)
            .get(`/clubs/${CLUB_ID}/members/roster`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);

        assert.equal(coordRes.status, 200);
        assert.equal(coordRes.body.some(m => m.user_id === STUDENT_ID), true);
    });

    let TASK_ID;
    test('coordinator can create onboarding tasks; unauthorized student is blocked', async () => {
        const blocked = await request(app)
            .post(`/lifecycle/clubs/${CLUB_ID}/onboarding`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ title: 'Unauthorized Task' });
        assert.equal(blocked.status, 403);

        const res = await request(app)
            .post(`/lifecycle/clubs/${CLUB_ID}/onboarding`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({
                title: 'Join Discord & Introduce Yourself',
                description: 'Join the club discord and say hello in #introductions',
                due_days_after_join: 5,
                is_required: 1
            });

        assert.equal(res.status, 201);
        assert.ok(res.body.id);
        TASK_ID = res.body.id;
    });

    test('member can view onboarding tasks and toggle completion', async () => {
        const listRes = await request(app)
            .get(`/lifecycle/clubs/${CLUB_ID}/onboarding`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);

        assert.equal(listRes.status, 200);
        assert.ok(listRes.body.length >= 1);
        assert.equal(listRes.body[0].is_completed, 0);

        // Toggle task
        const toggleRes = await request(app)
            .post(`/lifecycle/clubs/${CLUB_ID}/onboarding/${TASK_ID}/toggle`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({});

        assert.equal(toggleRes.status, 200);
        assert.equal(toggleRes.body.is_completed, 1);

        // Coordinator overview verifies progress
        const overviewRes = await request(app)
            .get(`/lifecycle/clubs/${CLUB_ID}/onboarding/members`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);

        assert.equal(overviewRes.status, 200);
        const st = overviewRes.body.members.find(m => m.user_id === STUDENT_ID);
        assert.ok(st);
        assert.equal(st.completed_tasks_count, 1);
    });

    let EVENT_ID, QR_TOKEN;
    test('coordinator can create an event with secure QR secret token', async () => {
        const res = await request(app)
            .post(`/lifecycle/clubs/${CLUB_ID}/events`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({
                title: 'Annual Robotics Hackathon',
                description: 'Autonomous rover challenge in Lab 3',
                location: 'Mechanical Lab 3',
                event_date: '2026-11-15',
                start_time: '10:00',
                end_time: '17:00'
            });

        assert.equal(res.status, 201);
        assert.ok(res.body.id);
        assert.ok(res.body.qr_secret_token);
        EVENT_ID = res.body.id;
        QR_TOKEN = res.body.qr_secret_token;
    });

    test('student can RSVP for event', async () => {
        const res = await request(app)
            .post(`/lifecycle/events/${EVENT_ID}/rsvp`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ status: 'going' });

        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'going');
    });

    test('cross-club / forged QR attendance scan is rejected with 403', async () => {
        const forgedRes = await request(app)
            .post(`/lifecycle/events/${EVENT_ID}/check-in`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ qr_token: 'fake-or-other-club-token-12345' });

        assert.equal(forgedRes.status, 403);
        assert.match(forgedRes.body.error, /forged|invalid/i);
    });

    test('valid QR code check-in verifies attendance idempotently', async () => {
        const res = await request(app)
            .post(`/lifecycle/events/${EVENT_ID}/check-in`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ qr_token: QR_TOKEN });

        assert.equal(res.status, 200);

        // Verify attendance in DB
        const att = await getRow('SELECT * FROM event_attendance WHERE event_id = ? AND user_id = ?', [EVENT_ID, STUDENT_ID]);
        assert.ok(att);
        assert.equal(att.check_in_method, 'qr');

        // Check-in again (idempotent)
        const secondRes = await request(app)
            .post(`/lifecycle/events/${EVENT_ID}/check-in`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ qr_token: QR_TOKEN });
        assert.equal(secondRes.status, 200);
    });

    let CERT_HASH;
    test('coordinator can issue a verifiable certificate with unique SHA-256 hash', async () => {
        const res = await request(app)
            .post(`/lifecycle/clubs/${CLUB_ID}/certificates`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({
                user_id: STUDENT_ID,
                title: 'Certificate of Active Membership',
                certificate_type: 'membership',
                issue_date: '2026-10-16',
                metadata: { role: 'Hardware Lead', grade: 'Distinction' }
            });

        assert.equal(res.status, 201);
        assert.ok(res.body.unique_credential_hash);
        assert.equal(res.body.unique_credential_hash.length, 64); // SHA-256 hex length
        CERT_HASH = res.body.unique_credential_hash;
    });

    test('recipient student can view earned certificates', async () => {
        const res = await request(app)
            .get('/lifecycle/certificates/my')
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);

        assert.equal(res.status, 200);
        assert.ok(res.body.length >= 1);
        assert.equal(res.body[0].unique_credential_hash, CERT_HASH);
    });

    test('public certificate verification returns valid credential without authentication', async () => {
        const res = await request(app)
            .get(`/lifecycle/certificates/verify/${CERT_HASH}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.valid, true);
        assert.equal(res.body.title, 'Certificate of Active Membership');
        assert.equal(res.body.recipient.name, 'Alice Student');
        assert.equal(res.body.club.name, 'Robotics Club');

        // Invalid hash returns 404
        const invalidRes = await request(app)
            .get('/lifecycle/certificates/verify/deadbeef00000000000000000000000000000000000000000000000000000000');
        assert.equal(invalidRes.status, 404);
    });
});

