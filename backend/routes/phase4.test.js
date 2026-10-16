/**
 * routes/phase4.test.js — Phase 4: Pipeline Stages, Kanban, Bulk Actions & Coordinator Inbox
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
const {
    OUTCOMES,
    OFFER_STATES,
    REASON_CODES,
    validateOutcomeTransition,
    validateStageTransition,
    normalizeStages,
    mapOutcomeToLegacyStatus
} = require('../utils/pipelineTransitions');

process.env.JWT_SECRET = 'test-secret-phase4-pipeline-with-32-chars';

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
app.use('/coordinator', require('./coordinator'));

let ADMIN_ID, LEAD_COORD_ID, MEMBER_COORD_ID, OTHER_COORD_ID, STUDENT1_ID, STUDENT2_ID;
let CLUB_ID, DRIVE_ID, DRAFT_DRIVE_ID, APP1_ID, APP2_ID;

before(async () => {
    await runMigrations(db);

    const adm = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Admin','adm@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = adm.lastID;

    const lead = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Lead Coord','lead@mmcoe.edu.in','h','coordinator',1,0)");
    LEAD_COORD_ID = lead.lastID;

    const mem = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Member Coord','member@mmcoe.edu.in','h','coordinator',1,0)");
    MEMBER_COORD_ID = mem.lastID;

    const other = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Other Coord','other@mmcoe.edu.in','h','coordinator',1,0)");
    OTHER_COORD_ID = other.lastID;

    const s1 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Student 1','s1@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    STUDENT1_ID = s1.lastID;

    const s2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,email_verified_at,token_version) VALUES ('Student 2','s2@mmcoe.edu.in','h','student',1,CURRENT_TIMESTAMP,0)");
    STUDENT2_ID = s2.lastID;

    const cl = await run("INSERT INTO clubs (name, category, description) VALUES ('Tech Club', 'Technical', 'Desc')");
    CLUB_ID = cl.lastID;

    // Club memberships: lead vs member
    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'lead', ?)", [CLUB_ID, LEAD_COORD_ID, ADMIN_ID]);
    await run("INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (?, ?, 'member', ?)", [CLUB_ID, MEMBER_COORD_ID, LEAD_COORD_ID]);

    const stagesJson = JSON.stringify([
        { id: 'screening', name: 'Screening', order: 1 },
        { id: 'task',      name: 'Task Round', order: 2 },
        { id: 'interview', name: 'Interview',  order: 3 },
        { id: 'final',     name: 'Final Offer',order: 4 }
    ]);

    // Published drive with custom stages
    const dr = await run(`INSERT INTO recruitment_drives
        (club_id, title, description, open_date, deadline, status, stages)
        VALUES (?, 'Annual Drive', 'Join us', '2026-01-01', '2026-12-31', 'published', ?)`,
        [CLUB_ID, stagesJson]);
    DRIVE_ID = dr.lastID;

    // Draft drive for stage editing test
    const ddr = await run(`INSERT INTO recruitment_drives
        (club_id, title, description, open_date, deadline, status, stages)
        VALUES (?, 'Draft Drive', 'Coming soon', '2026-01-01', '2026-12-31', 'draft', ?)`,
        [CLUB_ID, stagesJson]);
    DRAFT_DRIVE_ID = ddr.lastID;

    // Seed 2 applications for DRIVE_ID
    const a1 = await run(`INSERT INTO applications
        (drive_id, student_id, motivation, status, current_stage_id, outcome, offer_state)
        VALUES (?, ?, 'Motivation 1', 'Applied', 'screening', 'Pending', 'None')`,
        [DRIVE_ID, STUDENT1_ID]);
    APP1_ID = a1.lastID;

    const a2 = await run(`INSERT INTO applications
        (drive_id, student_id, motivation, status, current_stage_id, outcome, offer_state)
        VALUES (?, ?, 'Motivation 2', 'Applied', 'screening', 'Pending', 'None')`,
        [DRIVE_ID, STUDENT2_ID]);
    APP2_ID = a2.lastID;
});

after(() => db.close());

// ── Unit Tests: Pipeline Transitions Module ───────────────────────────────────

test('pipeline transitions unit: validateOutcomeTransition rules', () => {
    // Valid transitions
    assert.equal(validateOutcomeTransition('Pending', 'Advanced').valid, true);
    assert.equal(validateOutcomeTransition('Pending', 'Waitlisted', 'seat_limit').valid, true);
    assert.equal(validateOutcomeTransition('Pending', 'Rejected', 'skill_mismatch').valid, true);

    // Rejection or Waitlist without reason code must fail
    assert.equal(validateOutcomeTransition('Pending', 'Rejected').valid, false);
    assert.equal(validateOutcomeTransition('Pending', 'Waitlisted').valid, false);
    assert.equal(validateOutcomeTransition('Pending', 'Rejected', 'invalid_code').valid, false);

    // Withdrawn is terminal
    assert.equal(validateOutcomeTransition('Withdrawn', 'Advanced').valid, false);

    // Unknown target outcome
    assert.equal(validateOutcomeTransition('Pending', 'UnknownState').valid, false);
});

test('pipeline transitions unit: validateStageTransition checks drive stage presence', () => {
    const stages = [
        { id: 'screening', name: 'Screening', order: 1 },
        { id: 'interview', name: 'Interview', order: 2 }
    ];

    assert.equal(validateStageTransition('screening', 'interview', stages).valid, true);
    assert.equal(validateStageTransition('screening', 'nonexistent_stage', stages).valid, false);
});

test('pipeline transitions unit: mapOutcomeToLegacyStatus backward compatibility', () => {
    const stages = [{ id: 'screening', order: 1 }, { id: 'final', order: 2 }];
    assert.equal(mapOutcomeToLegacyStatus('Selected', 'final', stages), 'Selected');
    assert.equal(mapOutcomeToLegacyStatus('Rejected', 'screening', stages), 'Rejected');
    assert.equal(mapOutcomeToLegacyStatus('Waitlisted', 'screening', stages), 'Shortlisted');
    assert.equal(mapOutcomeToLegacyStatus('Pending', 'screening', stages), 'Applied');
    assert.equal(mapOutcomeToLegacyStatus('Advanced', 'final', stages), 'Shortlisted');
});

// ── Integration Tests: PATCH /applications/:id/stage ──────────────────────────

test('PATCH /applications/:id/stage rejects unauthenticated caller', async () => {
    const res = await request(app).patch(`/applications/${APP1_ID}/stage`).send({ stage_id: 'task' });
    assert.equal(res.status, 401);
});

test('PATCH /applications/:id/stage rejects non-member coordinator', async () => {
    const res = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(OTHER_COORD_ID, 'coordinator')}`)
        .send({ stage_id: 'task' });
    assert.equal(res.status, 403);
});

test('PATCH /applications/:id/stage: member advances applicant stage', async () => {
    const res = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ stage_id: 'task' });
    assert.equal(res.status, 200);
    assert.equal(res.body.current_stage_id, 'task');
    assert.equal(res.body.outcome, 'Pending');
});

test('PATCH /applications/:id/stage rejects invalid stage ID', async () => {
    const res = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ stage_id: 'invalid_stage_xyz' });
    assert.equal(res.status, 400);
});

test('PATCH /applications/:id/stage: rejection requires reason code', async () => {
    // Missing reason code
    const resMissing = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ outcome: 'Rejected' });
    assert.equal(resMissing.status, 400);

    // With reason code
    const resOk = await request(app)
        .patch(`/applications/${APP1_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ outcome: 'Rejected', rejection_reason_code: 'skill_mismatch', rejection_feedback: 'Need React experience' });
    assert.equal(resOk.status, 200);
    assert.equal(resOk.body.outcome, 'Rejected');
    assert.equal(resOk.body.rejection_reason_code, 'skill_mismatch');
    assert.equal(resOk.body.rejection_feedback, 'Need React experience');
});

test('PATCH /applications/:id/stage: member without application.decide cannot mark Selected', async () => {
    const res = await request(app)
        .patch(`/applications/${APP2_ID}/stage`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`)
        .send({ outcome: 'Selected' });
    assert.equal(res.status, 403);
});

test('PATCH /applications/:id/stage: lead coordinator CAN mark Selected', async () => {
    const res = await request(app)
        .patch(`/applications/${APP2_ID}/stage`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({ outcome: 'Selected' });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'Selected');
});

// ── Integration Tests: POST /applications/bulk-stage ──────────────────────────

test('POST /applications/bulk-stage: bulk move applicants', async () => {
    const res = await request(app)
        .post('/applications/bulk-stage')
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            application_ids: [APP1_ID, APP2_ID],
            stage_id: 'interview',
            outcome: 'Advanced'
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated_count, 2);
});

test('POST /applications/bulk-stage: rejection without reason code fails atomically', async () => {
    const res = await request(app)
        .post('/applications/bulk-stage')
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            application_ids: [APP1_ID, APP2_ID],
            outcome: 'Rejected'
        });
    assert.equal(res.status, 400);
});

// ── Integration Tests: Drive stage edit constraints ───────────────────────────

test('PUT /drives/:id: draft drive stages can be freely edited', async () => {
    const newStages = [
        { id: 'screening', name: 'Screening', order: 1 },
        { id: 'final',     name: 'Final',     order: 2 }
    ];
    const res = await request(app)
        .put(`/drives/${DRAFT_DRIVE_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            title: 'Draft Drive Updated',
            description: 'Updated description',
            open_date: '2026-01-01',
            deadline: '2026-12-31',
            stages: newStages
        });
    assert.equal(res.status, 200);
});

test('PUT /drives/:id: published drive cannot remove a stage that currently has active applicants', async () => {
    // Current applications are in stage 'interview' (from the bulk move test)
    // Attempt to remove 'interview' by supplying stages only containing 'screening' and 'final'
    const newStages = [
        { id: 'screening', name: 'Screening', order: 1 },
        { id: 'final',     name: 'Final',     order: 2 }
    ];
    const res = await request(app)
        .put(`/drives/${DRIVE_ID}`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`)
        .send({
            title: 'Annual Drive Updated',
            description: 'Updated description',
            open_date: '2026-01-01',
            deadline: '2026-12-31',
            stages: newStages
        });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Cannot remove stage 'interview'/);
});

// ── Integration Tests: CSV Export ─────────────────────────────────────────────

test('GET /applications/drive/:driveId/export-csv: member coordinator without export.data is rejected 403', async () => {
    const res = await request(app)
        .get(`/applications/drive/${DRIVE_ID}/export-csv`)
        .set('Authorization', `Bearer ${as(MEMBER_COORD_ID, 'coordinator')}`);
    assert.equal(res.status, 403);
});

test('GET /applications/drive/:driveId/export-csv: lead coordinator receives CSV content', async () => {
    const res = await request(app)
        .get(`/applications/drive/${DRIVE_ID}/export-csv`)
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.text, /"Application ID","Student Name","Email"/);
    assert.match(res.text, /Student 1/);
});

// ── Integration Tests: Coordinator Inbox ──────────────────────────────────────

test('GET /coordinator/inbox: returns actionable queue and statistics', async () => {
    const res = await request(app)
        .get('/coordinator/inbox')
        .set('Authorization', `Bearer ${as(LEAD_COORD_ID, 'coordinator')}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.stats === 'object');
    assert.ok(Array.isArray(res.body.items));
    assert.ok(typeof res.body.stats.totalActionItems === 'number');
});

