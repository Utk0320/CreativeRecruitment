/**
 * routes/applications.test.js
 *
 * Uses an in-memory SQLite DB with migrations applied so all JOINs
 * (including club_members) work exactly as in production.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { before, after } = test;
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { db }
};

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) { error ? reject(error) : resolve(this); });
});

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

// IDs
const COORD_MEMBER = 4;    // coordinator who IS a member of club 1
const COORD_OTHER  = 5;    // coordinator who is NOT a member of any club
const STUDENT_OWN  = 12;   // student who owns application
const STUDENT_OTHER = 13;  // another student

before(async () => {
    await runMigrations(db);

    // Users
    await run('INSERT INTO users (id, name, email, password_hash, role, is_active, token_version) VALUES (4,  "Coord1",  "c1@mmcoe.edu.in", "h", "coordinator", 1, 0)');
    await run('INSERT INTO users (id, name, email, password_hash, role, is_active, token_version) VALUES (5,  "Coord2",  "c2@mmcoe.edu.in", "h", "coordinator", 1, 0)');
    await run('INSERT INTO users (id, name, email, password_hash, role, is_active, token_version, email_verified_at) VALUES (12, "Student1", "s1@comp.mmcoe.edu.in", "h", "student", 1, 0, CURRENT_TIMESTAMP)');
    await run('INSERT INTO users (id, name, email, password_hash, role, is_active, token_version, email_verified_at) VALUES (13, "Student2", "s2@comp.mmcoe.edu.in", "h", "student", 1, 0, CURRENT_TIMESTAMP)');

    // Club + membership
    await run('INSERT INTO clubs (id, name, coordinator_id) VALUES (1, "Alpha Club", 4)');
    await run('INSERT INTO club_members (club_id, user_id, role) VALUES (1, 4, "lead")');
    // coord 5 is NOT a member

    // Drive
    await run('INSERT INTO recruitment_drives (id, club_id, title, deadline, status) VALUES (1, 1, "Drive A", "2099-12-31", "open")');

    // Application (id=7) owned by student 12, in club 1
    await run(`INSERT INTO applications (id, drive_id, student_id, portfolio_url, motivation, status)
               VALUES (7, 1, 12, "https://portfolio.example", "I build useful things.", "Applied")`);
});

after(() => new Promise(resolve => db.close(resolve)));

const app = express();
app.use(express.json());
app.use('/applications', require('./applications'));

// ── Tests ─────────────────────────────────────────────────────────────────────

test('application detail rejects unauthenticated requests', async () => {
    const res = await request(app).get('/applications/7');
    assert.equal(res.status, 401);
});

test('students can read their application but cannot read another student application', async () => {
    const own   = await request(app).get('/applications/7').set('Authorization', `Bearer ${as(STUDENT_OWN,   'student')}`);
    const other = await request(app).get('/applications/7').set('Authorization', `Bearer ${as(STUDENT_OTHER, 'student')}`);
    assert.equal(own.status, 200, `Expected 200 for own app, got ${own.status}`);
    assert.equal(own.body.motivation, 'I build useful things.');
    // is_member must be stripped before sending
    assert.equal('is_member' in own.body, false);
    assert.equal(other.status, 404);
});

test('coordinators can read only applications owned by their club', async () => {
    const member    = await request(app).get('/applications/7').set('Authorization', `Bearer ${as(COORD_MEMBER, 'coordinator')}`);
    const nonMember = await request(app).get('/applications/7').set('Authorization', `Bearer ${as(COORD_OTHER,  'coordinator')}`);
    assert.equal(member.status,    200, `Member expected 200, got ${member.status}: ${JSON.stringify(member.body)}`);
    assert.equal(nonMember.status, 404);
});

test('students and non-member coordinators cannot change application status', async () => {
    const student   = await request(app).put('/applications/7').set('Authorization', `Bearer ${as(STUDENT_OWN,  'student')}`).send({ status: 'Selected' });
    const nonMember = await request(app).put('/applications/7').set('Authorization', `Bearer ${as(COORD_OTHER,  'coordinator')}`).send({ status: 'Selected' });
    assert.equal(student.status,   403);
    assert.equal(nonMember.status, 403);
});

test('coordinators cannot write an arbitrary application status', async () => {
    const res = await request(app).put('/applications/7')
        .set('Authorization', `Bearer ${as(COORD_MEMBER, 'coordinator')}`)
        .send({ status: 'promoted-to-admin' });
    assert.equal(res.status, 400);
});

test('unverified students cannot submit applications', async () => {
    // Remove email_verified_at to simulate unverified student 12
    await run('UPDATE users SET email_verified_at = NULL WHERE id = 12');
    const res = await request(app).post('/applications')
        .set('Authorization', `Bearer ${as(STUDENT_OWN, 'student')}`)
        .send({ drive_id: 1, portfolio_url: 'https://portfolio.example', motivation: 'I build useful things.' });
    assert.equal(res.status, 403);
    // Restore for other tests
    await run("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = 12");
});