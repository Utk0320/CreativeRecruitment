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
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});

const app = express();
app.use('/clubs', require('./clubs'));
app.use('/drives', require('./drives'));
app.use('/applications', require('./applications'));
app.use('/notifications', require('./notifications'));
app.use('/coordinator', require('./coordinator'));
const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

before(async () => {
    await runMigrations(db);
    await runMigrations(db);
    await run('INSERT INTO users (id, name, email, password_hash, role) VALUES (4, ?, ?, ?, ?)', ['Coordinator', 'coord@mmcoe.edu.in', 'hash', 'coordinator']);
    await run('INSERT INTO users (id, name, email, password_hash, role) VALUES (5, ?, ?, ?, ?)', ['Non-member', 'other@mmcoe.edu.in', 'hash', 'coordinator']);
    await run('INSERT INTO users (id, name, email, password_hash, role) VALUES (12, ?, ?, ?, ?)', ['Applicant', 'student@mmcoe.edu.in', 'hash', 'student']);
    await run('INSERT INTO clubs (id, name, category, coordinator_id) VALUES (1, ?, ?, 4), (2, ?, ?, 4)', ['Alpha', 'Technical', 'Beta', 'Cultural']);
    // Phase 2: coordinator 4 is lead of both clubs; coordinator 5 is not a member
    await run('INSERT INTO club_members (club_id, user_id, role) VALUES (1, 4, "lead"), (2, 4, "lead")');
    await run(`INSERT INTO recruitment_drives (id, club_id, title, deadline, status) VALUES
        (1, 1, 'Backend A', '2026-10-20T23:59:59+05:30', 'published'),
        (2, 2, 'Design B', '2026-10-25T23:59:59+05:30', 'closed')`);
    await run(`INSERT INTO applications (drive_id, student_id, portfolio_url, motivation, status)
        VALUES (1, 12, 'https://portfolio.example', 'I build APIs', 'Applied'),
               (2, 12, 'https://portfolio.example', 'I design systems', 'Under Review')`);
    await run("INSERT INTO notifications (user_id, title, message, type) VALUES (12, 'Update A', 'First', 'system'), (12, 'Update B', 'Second', 'system')");
});


after(() => new Promise(resolve => db.close(resolve)));

test('club lists paginate, search, sort safely, and expose totals', async () => {
    const response = await request(app).get('/clubs?page=2&limit=1&sort=name&order=asc&search=a')
        .set('Authorization', `Bearer ${as(12, 'student')}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].name, 'Beta');
    assert.equal(response.headers['x-total-count'], '2');
    assert.equal(response.headers['x-page-count'], '2');
});

test('drive lists apply status filters and allowlisted sorting', async () => {
    const response = await request(app).get('/drives?status=published&sort=title&order=desc&limit=1')
        .set('Authorization', `Bearer ${as(12, 'student')}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].title, 'Backend A');
    assert.equal(response.headers['x-total-count'], '1');
});

test('application and notification lists paginate against the real SQLite schema', async () => {
    const applications = await request(app).get('/applications?limit=1&sort=status')
        .set('Authorization', `Bearer ${as(12, 'student')}`);
    const notifications = await request(app).get('/notifications?page=2&limit=1')
        .set('Authorization', `Bearer ${as(12, 'student')}`);
    assert.equal(applications.status, 200);
    assert.equal(applications.body.length, 1);
    assert.equal(applications.headers['x-total-count'], '2');
    assert.equal(notifications.status, 200);
    assert.equal(notifications.body.length, 1);
    assert.equal(notifications.headers['x-total-count'], '2');
});

test('coordinator club and drive lists are scoped and paginate against SQLite', async () => {
    const token = `Bearer ${as(4, 'coordinator')}`;
    const clubs = await request(app).get('/coordinator/clubs?limit=1').set('Authorization', token);
    const drives = await request(app).get('/coordinator/drives?limit=1').set('Authorization', token);
    assert.equal(clubs.status, 200);
    assert.equal(clubs.body.length, 1);
    assert.equal(clubs.headers['x-total-count'], '2');
    assert.equal(drives.status, 200);
    assert.equal(drives.body.length, 1);
    assert.equal(drives.headers['x-total-count'], '2');
});

test('coordinator lists reject unauthenticated/wrong-role callers and hide non-member clubs', async () => {
    const unauthenticated = await request(app).get('/coordinator/clubs');
    const student = await request(app).get('/coordinator/clubs')
        .set('Authorization', `Bearer ${as(12, 'student')}`);
    const nonMember = await request(app).get('/coordinator/drives')
        .set('Authorization', `Bearer ${as(5, 'coordinator')}`);
    assert.equal(unauthenticated.status, 401);
    assert.equal(student.status, 403);
    assert.equal(nonMember.status, 200);
    assert.equal(nonMember.body.length, 0);
    assert.equal(nonMember.headers['x-total-count'], '0');
});