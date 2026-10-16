/**
 * routes/phase8.test.js — Phase 8: Appeals, Tickets, Notification Preferences, and Announcements
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');
const { dispatchNotification, isDelayedByApproval } = require('../services/notifications/dispatcher');

process.env.JWT_SECRET = 'test-secret-phase8-appeals-tickets-notifications-32chars';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); })
);

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/appeals', require('./appeals'));
app.use('/tickets', require('./tickets'));
app.use('/notifications', require('./notifications'));
app.use('/announcements', require('./announcements'));

let ADMIN_ID, LEAD_COORD_1_ID, COORD_2_ID, STUDENT_1_ID, STUDENT_2_ID;
let CLUB_ID, DRIVE_ID;
let APP_REJECTED_ID, APP_EXPIRED_WINDOW_ID, APP_ACCEPTED_ID;
let APPEAL_ID;
let TICKET_ID;

before(async () => {
    await runMigrations(db);

    const adm = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Admin User','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = adm.lastID;

    const c1 = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Coord One','coord1@mmcoe.edu.in','h','coordinator',1,0)");
    LEAD_COORD_1_ID = c1.lastID;

    const c2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Coord Two','coord2@mmcoe.edu.in','h','coordinator',1,0)");
    COORD_2_ID = c2.lastID;

    const s1 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version,phone) VALUES ('Student One','s1@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0,'9876543210')");
    STUDENT_1_ID = s1.lastID;

    const s2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version,phone) VALUES ('Student Two','s2@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0,'9876543211')");
    STUDENT_2_ID = s2.lastID;

    const club = await run("INSERT INTO clubs (name,description,category) VALUES ('Coding Club','Tech club','Technical')");
    CLUB_ID = club.lastID;

    // Both coordinators are members of Club A (Coord 1 is lead, Coord 2 is member) -> Club has >1 coordinator
    await run("INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, 'lead')", [CLUB_ID, LEAD_COORD_1_ID]);
    await run("INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, 'member')", [CLUB_ID, COORD_2_ID]);

    const stagesJson = JSON.stringify([
        { id: 'screening', name: 'Screening' },
        { id: 'interview', name: 'Interview' },
        { id: 'final', name: 'Final Review' }
    ]);
    const drive = await run(
        `INSERT INTO recruitment_drives (club_id, title, status, stages, appeal_window_days)
         VALUES (?, 'Fall Recruitment', 'published', ?, 7)`,
        [CLUB_ID, stagesJson]
    );
    DRIVE_ID = drive.lastID;

    // Application 1: Student 1 rejected today by Coord 1
    const app1 = await run(
        `INSERT INTO applications (drive_id, student_id, status, outcome, current_stage_id, decision_date, decided_by)
         VALUES (?, ?, 'Rejected', 'Rejected', 'screening', CURRENT_TIMESTAMP, ?)`,
        [DRIVE_ID, STUDENT_1_ID, LEAD_COORD_1_ID]
    );
    APP_REJECTED_ID = app1.lastID;

    // Application 2: Student 2 rejected 10 days ago (past the 7-day appeal window)
    const app2 = await run(
        `INSERT INTO applications (drive_id, student_id, status, outcome, current_stage_id, decision_date, decided_by)
         VALUES (?, ?, 'Rejected', 'Rejected', 'screening', datetime('now', '-10 days'), ?)`,
        [DRIVE_ID, STUDENT_2_ID, LEAD_COORD_1_ID]
    );
    APP_EXPIRED_WINDOW_ID = app2.lastID;

    // Application 3: Student 1 accepted (not eligible for appeal)
    const app3 = await run(
        `INSERT INTO applications (drive_id, student_id, status, outcome, current_stage_id)
         VALUES (?, ?, 'Accepted', 'Selected', 'final')`,
        [DRIVE_ID, STUDENT_1_ID]
    );
    APP_ACCEPTED_ID = app3.lastID;
});

after(async () => {
    await new Promise(r => db.close(r));
});

// ==========================================
// 1. APPEALS TESTS
// ==========================================

test('POST /appeals/applications/:appId: student files appeal within window', async () => {
    const res = await request(app)
        .post(`/appeals/applications/${APP_REJECTED_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            reason: 'I would like to request a re-evaluation of my technical screening round.',
            attachment_url: 'https://example.com/portfolio.pdf'
        });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'Pending');
    assert.ok(res.body.id);
    APPEAL_ID = res.body.id;
});

test('POST /appeals/applications/:appId: enforces single appeal per application (returns 409)', async () => {
    const res = await request(app)
        .post(`/appeals/applications/${APP_REJECTED_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            reason: 'Second appeal attempt for the same application.'
        });

    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.error, /already been filed/i);
});

test('POST /appeals/applications/:appId: rejects appeal past the window (10 days > 7 days window)', async () => {
    const res = await request(app)
        .post(`/appeals/applications/${APP_EXPIRED_WINDOW_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_2_ID, 'student')}`)
        .send({
            reason: 'Late appeal attempt after 10 days.'
        });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /expired/i);
});

test('POST /appeals/applications/:appId: rejects appeal on non-rejected/waitlisted application', async () => {
    const res = await request(app)
        .post(`/appeals/applications/${APP_ACCEPTED_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            reason: 'Attempting to appeal an accepted application.'
        });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /rejected or waitlisted/i);
});

test('POST /appeals/:id/review: original decider is blocked when club has multiple coordinators', async () => {
    // Coord 1 was the original decider on APP_REJECTED_ID
    const res = await request(app)
        .post(`/appeals/${APPEAL_ID}/review`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_1_ID, 'coordinator')}`)
        .send({
            status: 'Upheld',
            notes: 'I stand by my decision.'
        });

    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.match(res.body.error, /must not be the original decider/i);
});

test('POST /appeals/:id/review: non-original coordinator overturns appeal and restores application stage', async () => {
    // Coord 2 is not the decider -> can review!
    const res = await request(app)
        .post(`/appeals/${APPEAL_ID}/review`)
        .set('Authorization', `Bearer ${as(COORD_2_ID, 'coordinator')}`)
        .send({
            status: 'Overturned',
            notes: 'Candidate screening demonstrates solid fundamentals. Advancing to Interview stage.',
            restored_stage_id: 'interview'
        });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'Overturned');
    assert.equal(res.body.restored_stage_id, 'interview');

    // Verify application in DB was moved back to 'interview' stage and 'Advanced' outcome
    const appRow = await new Promise(resolve => {
        db.get('SELECT * FROM applications WHERE id = ?', [APP_REJECTED_ID], (err, row) => resolve(row));
    });
    assert.equal(appRow.current_stage_id, 'interview');
    assert.equal(appRow.outcome, 'Advanced');
    assert.equal(appRow.status, 'Under Review');
});

// ==========================================
// 2. SUPPORT TICKETS TESTS
// ==========================================

test('POST /tickets: club-related ticket auto-routes to club lead with calculated SLA', async () => {
    const res = await request(app)
        .post('/tickets')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            subject: 'Question about coding test schedule',
            message: 'Could you please confirm if test links will be sent via email?',
            category: 'Application',
            priority: 'Medium',
            club_id: CLUB_ID
        });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.ticket_number.startsWith('TICK-'));
    assert.equal(res.body.assigned_to, LEAD_COORD_1_ID, 'Should route to club lead');
    assert.equal(res.body.status, 'Open');
    assert.ok(res.body.sla_due_at);
    TICKET_ID = res.body.id;
});

test('POST /tickets: account/technical ticket auto-routes to admin with Urgent SLA (4 hours)', async () => {
    const res = await request(app)
        .post('/tickets')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            subject: 'Cannot upload profile avatar',
            message: 'Getting an unexpected 500 error on upload.',
            category: 'Technical',
            priority: 'Urgent'
        });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.assigned_to, ADMIN_ID, 'Technical tickets route to admin');
    assert.equal(res.body.priority, 'Urgent');

    const now = Date.now();
    const slaTime = new Date(res.body.sla_due_at).getTime();
    const hoursDiff = (slaTime - now) / (3600 * 1000);
    assert.ok(hoursDiff >= 3.9 && hoursDiff <= 4.1, 'Urgent SLA should be 4 hours');
});

test('POST /tickets/:id/replies: threaded reply from coordinator updates status to In Progress', async () => {
    const res = await request(app)
        .post(`/tickets/${TICKET_ID}/replies`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_1_ID, 'coordinator')}`)
        .send({
            message: 'Yes, test links are sent automatically 1 hour prior to start.'
        });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.ticket_status, 'In Progress');

    const getRes = await request(app)
        .get(`/tickets/${TICKET_ID}`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.replies.length, 2, 'Initial message + coordinator reply');
    assert.equal(getRes.body.status, 'In Progress');
});

test('PATCH /tickets/:id/status and POST /tickets/:id/reopen: resolve and reopen within window', async () => {
    // Lead resolves ticket
    const resolveRes = await request(app)
        .patch(`/tickets/${TICKET_ID}/status`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_1_ID, 'coordinator')}`)
        .send({ status: 'Resolved' });

    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.body.status, 'Resolved');

    // Creator reopens ticket within 7-day window
    const reopenRes = await request(app)
        .post(`/tickets/${TICKET_ID}/reopen`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(reopenRes.status, 200, JSON.stringify(reopenRes.body));
    assert.equal(reopenRes.body.status, 'Open');
});

test('POST /tickets/:id/reopen: rejected if resolution was older than 7 days', async () => {
    // Manually set resolved_at to 10 days ago
    await run("UPDATE support_tickets SET status = 'Resolved', resolved_at = datetime('now', '-10 days') WHERE id = ?", [TICKET_ID]);

    const res = await request(app)
        .post(`/tickets/${TICKET_ID}/reopen`)
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /cannot be reopened after 7 days/i);
});

// ==========================================
// 3. NOTIFICATIONS & PREFERENCES TESTS
// ==========================================

test('GET & PUT /notifications/preferences: user manages channel preferences per event', async () => {
    // Default preferences
    const getRes = await request(app)
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.stage_change.in_app, true);
    assert.equal(getRes.body.stage_change.email, true);

    // Disable email for stage_change
    const putRes = await request(app)
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`)
        .send({
            event_type: 'stage_change',
            channel: 'email',
            enabled: false
        });

    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.enabled, false);

    // Verify preference updated
    const getRes2 = await request(app)
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(getRes2.body.stage_change.email, false);
    assert.equal(getRes2.body.stage_change.in_app, true);
});

test('dispatchNotification: respects channel preferences', async () => {
    // Student 1 has disabled email for stage_change
    const result = await dispatchNotification(db, {
        userId: STUDENT_1_ID,
        eventType: 'stage_change',
        title: 'Interview Stage',
        message: 'You have been advanced to Interview.'
    });

    assert.equal(result.delivered, true);
    assert.ok(result.channels.includes('in_app'));
    assert.ok(!result.channels.includes('email'), 'Email should be suppressed by preference');
    assert.ok(result.suppressedChannels.includes('email'));
});

test('dispatchNotification: delayed notification gate suppresses student notification if approval is pending', async () => {
    const result = await dispatchNotification(db, {
        userId: STUDENT_1_ID,
        eventType: 'stage_change',
        title: 'Status Update',
        message: 'You are selected',
        approvalStatus: 'pending' // Maker-checker pending proposal!
    });

    assert.equal(result.delivered, false);
    assert.equal(result.reason, 'suppressed_pending_approval');
    assert.equal(result.channels.length, 0, 'No notification should be dispatched before required approval');
});

// ==========================================
// 4. ANNOUNCEMENTS TESTS
// ==========================================

test('POST /announcements: club coordinator broadcasts announcement to applicants', async () => {
    const res = await request(app)
        .post('/announcements')
        .set('Authorization', `Bearer ${as(LEAD_COORD_1_ID, 'coordinator')}`)
        .send({
            club_id: CLUB_ID,
            title: 'Orientation Session Schedule',
            content: 'The recruitment orientation will take place this Saturday at 4 PM in Auditorium 2.',
            audience: 'applicants'
        });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.id);
    assert.ok(res.body.recipient_count >= 1);

    // Verify recipient received in-app notification
    const notifs = await new Promise(resolve => {
        db.all("SELECT * FROM notifications WHERE user_id = ? AND event_type = 'announcements'", [STUDENT_1_ID], (err, rows) => resolve(rows));
    });
    assert.ok(notifs.length >= 1);
    assert.match(notifs[0].title, /Orientation Session/);
});

test('GET /announcements/my: student fetches announcements for their clubs', async () => {
    const res = await request(app)
        .get('/announcements/my')
        .set('Authorization', `Bearer ${as(STUDENT_1_ID, 'student')}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(a => a.title === 'Orientation Session Schedule'));
});

