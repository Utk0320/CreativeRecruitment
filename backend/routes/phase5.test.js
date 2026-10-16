/**
 * routes/phase5.test.js — Phase 5: Collaboration, Audit, Optimistic Locking, Scorecards, Blind Review & Approvals
 *
 * Uses isolated in-memory SQLite + runMigrations.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-phase5-collab-with-32-chars';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); })
);

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/applications', require('./applications'));
app.use('/drives', require('./drives'));
app.use('/clubs', require('./clubs'));
app.use('/admin', require('./admin'));
app.use('/collaboration', require('./collaboration'));

let ADMIN_ID, LEAD_COORD_ID, MEMBER_COORD_ID, MEMBER_COORD2_ID, STUDENT_ID;
let CLUB_ID, DRIVE_ID, BLIND_DRIVE_ID, APP1_ID, APP2_ID;

before(async () => {
    await runMigrations(db);

    const adm = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Admin User','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = adm.lastID;

    const lead = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Lead Coord','lead@mmcoe.edu.in','h','coordinator',1,0)");
    LEAD_COORD_ID = lead.lastID;

    const mem = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Member Coord','member@mmcoe.edu.in','h','coordinator',1,0)");
    MEMBER_COORD_ID = mem.lastID;

    const mem2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Alice Coord','alice@mmcoe.edu.in','h','coordinator',1,0)");
    MEMBER_COORD2_ID = mem2.lastID;

    const s = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version,department,year) VALUES ('Rohit Sharma','rohit@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0,'Computer',3)");
    STUDENT_ID = s.lastID;

    const cl = await run("INSERT INTO clubs (name, category, description, version) VALUES ('Robotics Club', 'Technical', 'Robotics and AI', 1)");
    CLUB_ID = cl.lastID;

    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'lead', ?)", [CLUB_ID, LEAD_COORD_ID, ADMIN_ID]);
    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'member', ?)", [CLUB_ID, MEMBER_COORD_ID, LEAD_COORD_ID]);
    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'member', ?)", [CLUB_ID, MEMBER_COORD2_ID, LEAD_COORD_ID]);

    const stagesJson = JSON.stringify([
        { id: 'screening', name: 'Screening', order: 1 },
        { id: 'interview', name: 'Interview', order: 2 },
        { id: 'final',     name: 'Final',     order: 3 }
    ]);

    const rubricJson = JSON.stringify([
        { criterion: 'Technical Skills', weight: 60 },
        { criterion: 'Communication', weight: 40 }
    ]);

    // Standard drive
    const dr = await run(`INSERT INTO recruitment_drives
        (club_id, title, description, open_date, deadline, status, stages, rubric, version, hide_scores_until_submitted)
        VALUES (?, 'Robotics Recruitment', 'Join us', '2026-01-01', '2026-12-31', 'published', ?, ?, 1, 1)`,
        [CLUB_ID, stagesJson, rubricJson]);
    DRIVE_ID = dr.lastID;

    // Blind review drive
    const bdr = await run(`INSERT INTO recruitment_drives
        (club_id, title, description, open_date, deadline, status, stages, rubric, version, blind_review)
        VALUES (?, 'Blind Review Drive', 'Blind evaluation', '2026-01-01', '2026-12-31', 'published', ?, ?, 1, 1)`,
        [CLUB_ID, stagesJson, rubricJson]);
    BLIND_DRIVE_ID = bdr.lastID;

    // Applications
    const a1 = await run(`INSERT INTO applications
        (drive_id, student_id, motivation, status, current_stage_id, outcome, offer_state, version, profile_snapshot)
        VALUES (?, ?, 'Motivation 1', 'Applied', 'screening', 'Pending', 'None', 1, ?)`,
        [DRIVE_ID, STUDENT_ID, JSON.stringify({ name: 'Rohit Sharma', email: 'rohit@mmcoe.edu.in', department: 'Computer', year: 3 })]);
    APP1_ID = a1.lastID;

    const a2 = await run(`INSERT INTO applications
        (drive_id, student_id, motivation, status, current_stage_id, outcome, offer_state, version, profile_snapshot)
        VALUES (?, ?, 'Motivation Blind', 'Applied', 'screening', 'Pending', 'None', 1, ?)`,
        [BLIND_DRIVE_ID, STUDENT_ID, JSON.stringify({ name: 'Rohit Sharma', email: 'rohit@mmcoe.edu.in', department: 'Computer', year: 3 })]);
    APP2_ID = a2.lastID;
});

after(() => db.close());

// ── 1. Optimistic Concurrency & Edit Conflict Protection ──────────────────────

test('PUT /drives/:id: version check succeeds and increments version', async () => {
    const res = await request(app)
        .put(`/drives/${DRIVE_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            title: 'Robotics Recruitment Updated',
            description: 'Updated description',
            open_date: '2026-01-01',
            deadline: '2026-12-31',
            version: 1
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.version, 2);
});

test('PUT /drives/:id: outdated version returns 409 Conflict', async () => {
    const res = await request(app)
        .put(`/drives/${DRIVE_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            title: 'Concurrent update attempt',
            description: 'Should conflict',
            open_date: '2026-01-01',
            deadline: '2026-12-31',
            version: 1 // DB is now at 2
        });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Conflict/);
    assert.equal(res.body.current_version, 2);
});

test('PUT /clubs/:id: version check increments on match and returns 409 on mismatch', async () => {
    // Succeeded update with version 1 -> 2
    const resOk = await request(app)
        .put(`/clubs/${CLUB_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            name: 'Robotics & Automation Club',
            category: 'Technical',
            description: 'Updated',
            version: 1
        });
    assert.equal(resOk.status, 200);
    assert.equal(resOk.body.version, 2);

    // Mismatched version 1 against current 2
    const resConflict = await request(app)
        .put(`/clubs/${CLUB_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            name: 'Robotics Club Conflict',
            category: 'Technical',
            description: 'Outdated version',
            version: 1
        });
    assert.equal(resConflict.status, 409);
    assert.equal(resConflict.body.current_version, 2);
});

test('PATCH /applications/:id/stage: version conflict returns 409', async () => {
    // Outdated version 99
    const resConflict = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ stage_id: 'interview', version: 99 });
    assert.equal(resConflict.status, 409);

    // Correct version 1 advances and increments to 2
    const resOk = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ stage_id: 'interview', version: 1 });
    assert.equal(resOk.status, 200);
    assert.equal(resOk.body.version, 2);
    assert.equal(resOk.body.current_stage_id, 'interview');
});

// ── 2. Currently Viewing Heartbeat ───────────────────────────────────────────

test('POST /collaboration/heartbeat records presence and returns active viewers', async () => {
    // Member coord pings heartbeat
    const resPing = await request(app)
        .post('/collaboration/heartbeat')
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ entity_type: 'application', entity_id: APP1_ID });
    assert.equal(resPing.status, 200);

    // Lead coord requests viewers for this application
    const resViewers = await request(app)
        .get(`/collaboration/viewers/application/${APP1_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    assert.equal(resViewers.status, 200);
    assert.ok(Array.isArray(resViewers.body.viewers));
    const found = resViewers.body.viewers.find(v => v.user_id === MEMBER_COORD_ID);
    assert.ok(found, 'Member coordinator should be listed as active viewer');
});

// ── 3. Internal Comments & Mentions ───────────────────────────────────────────

test('GET /applications/:id/comments rejects student access with 403', async () => {
    const res = await request(app)
        .get(`/applications/${APP1_ID}/comments`)
        .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);
    assert.equal(res.status, 403);
});

test('POST /applications/:id/comments creates comment and triggers mention notifications', async () => {
    const res = await request(app)
        .post(`/applications/${APP1_ID}/comments`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ body: 'Great project in robotics! @Alice what do you think?' });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);

    // Check Alice (MEMBER_COORD2_ID) received notification for mention
    const notifs = await new Promise((resolve) =>
        db.all("SELECT * FROM notifications WHERE user_id = ? AND type = 'mention'", [MEMBER_COORD2_ID], (err, rows) => resolve(rows))
    );
    assert.ok(notifs.length >= 1, 'Alice should have received a mention notification');

    // Edit comment by author
    const resEdit = await request(app)
        .put(`/applications/${APP1_ID}/comments/${res.body.id}`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ body: 'Updated comment: Excellent candidate!' });
    assert.equal(resEdit.status, 200);
    assert.equal(resEdit.body.is_edited, 1);
});

// ── 4. Reviewer Assignments & Auto-balance ────────────────────────────────────

test('POST /applications/:id/assign and auto-balance distribution', async () => {
    // Assign Alice to APP1
    const resAssign = await request(app)
        .post(`/applications/${APP1_ID}/assign`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({ reviewer_ids: [MEMBER_COORD2_ID] });
    assert.equal(resAssign.status, 200);

    // Query drive assignments
    const resList = await request(app)
        .get(`/drives/${DRIVE_ID}/assignments`) // or /applications/drive/:driveId/assignments
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    // Check via direct route
    const resAppAssignments = await request(app)
        .get(`/applications/drive/${DRIVE_ID}/assignments`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    assert.equal(resAppAssignments.status, 200);
    const hasAlice = resAppAssignments.body.some(a => a.reviewer_id === MEMBER_COORD2_ID);
    assert.equal(hasAlice, true);

    // Auto-balance on BLIND_DRIVE_ID (which has APP2 unassigned)
    const resAuto = await request(app)
        .post(`/applications/drive/${BLIND_DRIVE_ID}/auto-balance`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({});
    assert.equal(resAuto.status, 200);
    assert.ok(resAuto.body.assigned_count >= 1);
});

// ── 5. Panel Scorecards & Anti-Anchoring ───────────────────────────────────────

test('Panel Scorecards: submission, average score, and anti-anchoring', async () => {
    // Member coord 1 submits scorecard
    const resSubmit1 = await request(app)
        .post(`/applications/${APP1_ID}/scorecards`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({
            scores: { 'Technical Skills': 80, 'Communication': 90 },
            remarks: 'Strong foundations'
        });
    assert.equal(resSubmit1.status, 200);
    // Weighted: 80 * 0.6 + 90 * 0.4 = 48 + 36 = 84
    assert.equal(resSubmit1.body.total_score, 84);

    // Member coord 2 hasn't submitted yet; since hide_scores_until_submitted=1,
    // scores should be masked for Member coord 2!
    const resViewMasked = await request(app)
        .get(`/applications/${APP1_ID}/scorecards`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD2_ID, 'coordinator')}`);
    assert.equal(resViewMasked.status, 200);
    assert.equal(resViewMasked.body.user_submitted, false);
    assert.equal(resViewMasked.body.scorecards[0].scores_json, null);
    assert.match(resViewMasked.body.scorecards[0].remarks, /Hidden/);

    // Member coord 2 submits scorecard
    const resSubmit2 = await request(app)
        .post(`/applications/${APP1_ID}/scorecards`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD2_ID, 'coordinator')}`)
        .send({
            scores: { 'Technical Skills': 50, 'Communication': 40 },
            remarks: 'Needs improvement'
        });
    assert.equal(resSubmit2.status, 200);
    // 50 * 0.6 + 40 * 0.4 = 30 + 16 = 46

    // Now Member coord 2 can see full breakdown and average
    const resViewUnmasked = await request(app)
        .get(`/applications/${APP1_ID}/scorecards`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD2_ID, 'coordinator')}`);
    assert.equal(resViewUnmasked.status, 200);
    assert.equal(resViewUnmasked.body.user_submitted, true);
    assert.ok(resViewUnmasked.body.scorecards[0].scores_json !== null);
    assert.equal(resViewUnmasked.body.average_score, 65); // (84 + 46) / 2 = 65
    assert.equal(resViewUnmasked.body.disagreement_flag, true); // 84 - 46 = 38 > 25
});

// ── 6. Blind Review Redaction ─────────────────────────────────────────────────

test('Blind Review mode: redacts candidate identity for non-admin coordinators', async () => {
    // Regular coordinator reviews application in blind review drive
    const resBlind = await request(app)
        .get(`/applications/${APP2_ID}`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`);
    assert.equal(resBlind.status, 200);
    assert.equal(resBlind.body.student_name, `Candidate #${APP2_ID}`);
    assert.equal(resBlind.body.email, 'redacted@blind.review');
    const snap = JSON.parse(resBlind.body.profile_snapshot);
    assert.equal(snap.name, `Candidate #${APP2_ID}`);
    assert.equal(snap.email, 'redacted@blind.review');

    // Admin sees unredacted name
    const resAdmin = await request(app)
        .get(`/applications/${APP2_ID}`)
        .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);
    assert.equal(resAdmin.status, 200);
    assert.equal(resAdmin.body.student_name, 'Rohit Sharma');
});

// ── 7. Maker-Checker Approval Flow & Undo ─────────────────────────────────────

test('Maker-checker: member proposes Selected, lead approves', async () => {
    // Member proposes Selected
    const resProp = await request(app)
        .post(`/applications/${APP1_ID}/propose`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ proposed_outcome: 'Selected', proposed_stage_id: 'final' });
    assert.equal(resProp.status, 200);
    assert.equal(resProp.body.approval_status, 'pending');

    // Check application DB state remains Pending until approved
    const appBefore = await new Promise(r => db.get('SELECT outcome, approval_status FROM applications WHERE id = ?', [APP1_ID], (e, row) => r(row)));
    assert.equal(appBefore.approval_status, 'pending');

    // Lead approves
    const resApprove = await request(app)
        .post(`/applications/${APP1_ID}/approve`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({});
    assert.equal(resApprove.status, 200);
    assert.equal(resApprove.body.outcome, 'Selected');

    const appAfter = await new Promise(r => db.get('SELECT outcome, approval_status FROM applications WHERE id = ?', [APP1_ID], (e, row) => r(row)));
    assert.equal(appAfter.outcome, 'Selected');
    assert.equal(appAfter.approval_status, 'approved');
});

test('Undo: reverts stage change back to previous stage', async () => {
    const resUndo = await request(app)
        .post(`/applications/${APP1_ID}/undo`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({});
    assert.equal(resUndo.status, 200);
    assert.ok(resUndo.body.outcome);
});

// ── 8. Admin Audit Feed & CSV Export ──────────────────────────────────────────

test('Admin audit view and CSV export', async () => {
    const resAudit = await request(app)
        .get('/admin/audit')
        .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);
    assert.equal(resAudit.status, 200);
    assert.ok(Array.isArray(resAudit.body));
    assert.ok(resAudit.body.length > 0);

    const resCsv = await request(app)
        .get('/admin/audit/export-csv')
        .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);
    assert.equal(resCsv.status, 200);
    assert.match(resCsv.headers['content-type'], /text\/csv/);
    assert.match(resCsv.text, /ID,Timestamp,Actor Name/);
});

// ── 9. Club Activity Feed ─────────────────────────────────────────────────────

test('GET /collaboration/activity/club/:clubId returns club activity entries', async () => {
    const resFeed = await request(app)
        .get(`/collaboration/activity/club/${CLUB_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    assert.equal(resFeed.status, 200);
    assert.ok(Array.isArray(resFeed.body));
    assert.ok(resFeed.body.length > 0);
});

