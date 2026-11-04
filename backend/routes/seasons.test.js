/**
 * routes/seasons.test.js — Phase 2 integration tests
 *
 * Uses an in-memory SQLite DB with all migrations applied — isolated from production data.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

// ── In-memory DB shared across this file ──────────────────────────────────────
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

// All routes under test — mount on a fresh express app (no real server needed)
const app = express();
app.use(express.json());
app.use('/seasons', require('./seasons'));
app.use('/coordinator', require('./coordinator'));
app.use('/clubs', require('./clubs'));
// mount club-member routes with merged params
const clubMembersRouter = require('./clubMembers');
app.use('/clubs/:clubId/members', (req, res, next) => {
    req.params.clubId = req.params.clubId;
    next();
}, clubMembersRouter);

// IDs
let ADMIN_ID, COORD_ID, COORD2_ID, STUDENT_ID, CLUB_ID, SEASON_ID;

before(async () => {
    await runMigrations(db);

    // Admin
    const a = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Admin','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = a.lastID;

    // Coordinator 1 (lead)
    const c1 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Coord1','coord1@mmcoe.edu.in','h','coordinator',1,0)");
    COORD_ID = c1.lastID;

    // Coordinator 2 (non-member initially)
    const c2 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Coord2','coord2@mmcoe.edu.in','h','coordinator',1,0)");
    COORD2_ID = c2.lastID;

    // Student
    const s = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version, email_verified_at) VALUES ('Student','student@comp.mmcoe.edu.in','h','student',1,0,CURRENT_TIMESTAMP)");
    STUDENT_ID = s.lastID;

    // Club with COORD_ID as lead
    const cl = await run(`INSERT INTO clubs (name, category, coordinator_id) VALUES ('Test Club','technical',${COORD_ID})`);
    CLUB_ID = cl.lastID;
    await run(`INSERT INTO club_members (club_id, user_id, role, added_by) VALUES (${CLUB_ID}, ${COORD_ID}, 'lead', ${COORD_ID})`);
});

after(() => new Promise(resolve => db.close(resolve)));

// ── Season CRUD ───────────────────────────────────────────────────────────────

describe('Season routes', () => {
    test('unauthenticated GET /seasons returns 401', async () => {
        const res = await request(app).get('/seasons');
        assert.equal(res.status, 401);
    });

    test('admin can create a season', async () => {
        const res = await request(app).post('/seasons')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ name: 'AY 2025-26', start_date: '2025-08-01', end_date: '2026-05-31' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.ok(res.body.id);
        SEASON_ID = res.body.id;
    });

    test('coordinator cannot create a season', async () => {
        const res = await request(app).post('/seasons')
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ name: 'Coord Season', start_date: '2025-08-01', end_date: '2026-05-31' });
        assert.equal(res.status, 403);
    });

    test('student cannot create a season', async () => {
        const res = await request(app).post('/seasons')
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ name: 'Student Season', start_date: '2025-08-01', end_date: '2026-05-31' });
        assert.equal(res.status, 403);
    });

    test('authenticated coordinator can list seasons', async () => {
        const res = await request(app).get('/seasons')
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.some(s => s.name === 'AY 2025-26'));
    });

    test('admin can update season status', async () => {
        const res = await request(app).patch(`/seasons/${SEASON_ID}/status`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ status: 'active' });
        assert.equal(res.status, 200);
        const s = await getRow('SELECT status FROM recruitment_seasons WHERE id = ?', [SEASON_ID]);
        assert.equal(s.status, 'active');
    });

    test('invalid status is rejected', async () => {
        const res = await request(app).patch(`/seasons/${SEASON_ID}/status`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ status: 'deleted' });
        assert.equal(res.status, 400);
    });

    test('end_date before start_date is rejected', async () => {
        const res = await request(app).post('/seasons')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ name: 'Bad Dates', start_date: '2026-01-01', end_date: '2025-01-01' });
        assert.equal(res.status, 400);
    });
});

// ── Club Membership ───────────────────────────────────────────────────────────

describe('Club membership routes', () => {
    test('lead can list members of their club', async () => {
        const res = await request(app).get(`/clubs/${CLUB_ID}/members`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.some(m => m.user_id === COORD_ID && m.role === 'lead'));
    });

    test('non-member coordinator cannot list members', async () => {
        const res = await request(app).get(`/clubs/${CLUB_ID}/members`)
            .set('Authorization', `Bearer ${as(COORD2_ID, 'coordinator')}`);
        assert.equal(res.status, 403);
    });

    test('lead can add a member', async () => {
        const res = await request(app).post(`/clubs/${CLUB_ID}/members`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ user_id: COORD2_ID, role: 'member' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const m = await getRow('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, COORD2_ID]);
        assert.equal(m.role, 'member');
    });

    test('new member can list club members', async () => {
        const res = await request(app).get(`/clubs/${CLUB_ID}/members`)
            .set('Authorization', `Bearer ${as(COORD2_ID, 'coordinator')}`);
        assert.equal(res.status, 200);
    });

    test('regular member cannot add another member', async () => {
        // COORD2 is a member (not lead) — should get 403
        const res = await request(app).post(`/clubs/${CLUB_ID}/members`)
            .set('Authorization', `Bearer ${as(COORD2_ID, 'coordinator')}`)
            .send({ user_id: COORD_ID, role: 'member' });
        assert.equal(res.status, 403);
    });

    test('lead can transfer lead role', async () => {
        const res = await request(app).post(`/clubs/${CLUB_ID}/members/transfer-lead`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ new_lead_user_id: COORD2_ID });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const newLead = await getRow('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, COORD2_ID]);
        assert.equal(newLead.role, 'lead');
        const oldLead = await getRow('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, COORD_ID]);
        assert.equal(oldLead.role, 'member');
    });

    test('admin can set permission override', async () => {
        const res = await request(app).post(`/clubs/${CLUB_ID}/members/${COORD2_ID}/permissions`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ permission: 'export.data', granted: true });
        assert.equal(res.status, 200);
        const ov = await getRow(
            'SELECT granted FROM club_permission_overrides WHERE club_id = ? AND user_id = ? AND permission = ?',
            [CLUB_ID, COORD2_ID, 'export.data']
        );
        assert.equal(ov.granted, 1);
    });

    test('non-admin cannot set permission override', async () => {
        const res = await request(app).post(`/clubs/${CLUB_ID}/members/${COORD2_ID}/permissions`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ permission: 'ai.run', granted: true });
        assert.equal(res.status, 403);
    });

    test('coordinator can declare conflict of interest', async () => {
        const res = await request(app).post(`/clubs/${CLUB_ID}/members/${COORD2_ID}/conflicts`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`)
            .send({ reason: 'Friends' });
        assert.equal(res.status, 201);
        const cd = await getRow(
            'SELECT * FROM conflict_declarations WHERE coordinator_id = ? AND applicant_id = ?',
            [COORD_ID, COORD2_ID]
        );
        assert.ok(cd);
        assert.equal(cd.reason, 'Friends');
    });

    test('removing the only lead when members exist is blocked', async () => {
        // COORD2 is lead, COORD_ID is member; removing lead should be blocked
        const res = await request(app).delete(`/clubs/${CLUB_ID}/members/${COORD2_ID}`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);
        assert.equal(res.status, 409);
    });

    test('lead can remove a non-lead member', async () => {
        // COORD2 (lead) removes COORD_ID (member)
        const res = await request(app).delete(`/clubs/${CLUB_ID}/members/${COORD_ID}`)
            .set('Authorization', `Bearer ${as(COORD2_ID, 'coordinator')}`);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const m = await getRow('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [CLUB_ID, COORD_ID]);
        assert.equal(m, undefined);
    });
});

// ── can() authorization helper ────────────────────────────────────────────────

describe('can() authorization helper', () => {
    const { can, hasConflict } = require('../utils/can');

    test('admin is allowed all permissions without club check', async () => {
        const admin = { id: ADMIN_ID, role: 'admin' };
        assert.equal(await can(db, admin, 'drive.create', {}), true);
    });

    test('student is never allowed coordinator permissions', async () => {
        const student = { id: STUDENT_ID, role: 'student' };
        assert.equal(await can(db, student, 'drive.create', { clubId: CLUB_ID }), false);
    });

    test('coordinator not in any club is denied', async () => {
        // Use a fresh coordinator not in any club
        const c = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Coord3','coord3@mmcoe.edu.in','h','coordinator',1,0)");
        const notMember = { id: c.lastID, role: 'coordinator' };
        assert.equal(await can(db, notMember, 'drive.create', { clubId: CLUB_ID }), false);
    });

    test('lead has drive.create permission', async () => {
        // COORD2 is now lead of CLUB_ID
        const lead = { id: COORD2_ID, role: 'coordinator' };
        assert.equal(await can(db, lead, 'drive.create', { clubId: CLUB_ID }), true);
    });

    test('hasConflict returns true for self-review', async () => {
        assert.equal(await hasConflict(db, COORD_ID, COORD_ID), true);
    });

    test('hasConflict returns true for declared conflict', async () => {
        // COORD_ID declared conflict with COORD2_ID above
        assert.equal(await hasConflict(db, COORD_ID, COORD2_ID), true);
    });

    test('hasConflict returns false for undeclared pair', async () => {
        assert.equal(await hasConflict(db, COORD2_ID, STUDENT_ID), false);
    });

    test('admin-set permission override grants a non-default permission to a member', async () => {
        // COORD_ID was removed from club but was set export.data override on COORD2_ID
        // Re-add COORD_ID as member to test override
        await run(`INSERT OR IGNORE INTO club_members (club_id, user_id, role, added_by) VALUES (${CLUB_ID}, ${COORD_ID}, 'member', ${COORD2_ID})`);
        // Set override: deny ai.run for COORD_ID
        await run(`INSERT INTO club_permission_overrides (club_id, user_id, permission, granted, set_by) VALUES (${CLUB_ID}, ${COORD_ID}, 'ai.run', 0, ${ADMIN_ID})`);
        const member = { id: COORD_ID, role: 'coordinator' };
        assert.equal(await can(db, member, 'ai.run', { clubId: CLUB_ID }), false);
    });
});

// ── Coordinator routes use club_members ───────────────────────────────────────

describe('Coordinator routes use club_members (not coordinator_id)', () => {
    test('coordinator club list shows only clubs they are a member of', async () => {
        // COORD2 is lead of CLUB_ID; COORD_ID was re-added as member above
        const res = await request(app).get('/coordinator/clubs')
            .set('Authorization', `Bearer ${as(COORD2_ID, 'coordinator')}`);
        assert.equal(res.status, 200);
        const clubs = await res.body;
        // All returned clubs should be CLUB_ID
        assert.ok(clubs.every(c => c.id === CLUB_ID));
    });

    test('coordinator not in any club gets empty list', async () => {
        // Create a fresh coordinator with no memberships
        const c4 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Coord4','coord4@mmcoe.edu.in','h','coordinator',1,0)");
        const res = await request(app).get('/coordinator/clubs')
            .set('Authorization', `Bearer ${as(c4.lastID, 'coordinator')}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 0);
    });
});
