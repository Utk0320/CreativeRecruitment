const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'admin-route-test-secret-with-at-least-32chars';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { db }
};
const app = express();
app.use(express.json());
app.use('/admin', require('./admin'));
app.use('/auth', require('./auth'));
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});
const tokenFor = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);
let inviteUrl;
const originalInfo = console.info;

test.before(async () => {
    await runMigrations(db);
    await run("INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'Root Admin', 'admin@mmcoe.edu.in', 'hash', 'admin')");
    await run("INSERT INTO users (id, name, email, password_hash, role) VALUES (2, 'Student', 'student2025.comp@mmcoe.edu.in', 'hash', 'student')");
    await run("INSERT INTO users (id, name, email, password_hash, role) VALUES (3, 'Coordinator', 'lead@mmcoe.edu.in', 'hash', 'coordinator')");
    console.info = message => {
        const match = message.match(/https?:\/\/\S+/);
        if (match) inviteUrl = new URL(match[0]);
    };
});

test('coordinator invite endpoint rejects unauthenticated and non-admin callers', async () => {
    const body = { name: 'New Coordinator', email: 'lead@mmcoe.edu.in', department: 'Computer', year: 3 };
    const unauthenticated = await request(app).post('/admin/coordinators/invites').send(body);
    const student = await request(app).post('/admin/coordinators/invites').set('Authorization', `Bearer ${tokenFor(2, 'student')}`).send(body);
    assert.equal(unauthenticated.status, 401);
    assert.equal(student.status, 403);
});

test('all admin-only mutations reject unauthenticated users and wrong roles', async () => {
    const actions = [
        ['get', '/admin/users', {}],
        ['get', '/admin/coordinators', {}],
        ['get', '/admin/clubs', {}],
        ['post', '/admin/coordinators/invites', { name: 'Invite', email: 'invite@mmcoe.edu.in', department: 'Computer', year: 2 }],
        ['post', '/admin/clubs', { name: 'Club', category: 'Technical', coordinator_id: 3 }],
        ['put', '/admin/clubs/1', { name: 'Club', category: 'Technical', coordinator_id: 3 }],
        ['delete', '/admin/clubs/1', { confirm: true }],
        ['patch', '/admin/users/2/active', { is_active: false }],
        ['post', '/admin/users/2/force-logout', {}],
        ['post', '/admin/users/2/password-reset', {}]
    ];
    for (const [method, path, body] of actions) {
        const unauthenticated = await request(app)[method](path).send(body);
        const wrongRole = await request(app)[method](path).set('Authorization', `Bearer ${tokenFor(2, 'student')}`).send(body);
        assert.equal(unauthenticated.status, 401, `${method.toUpperCase()} ${path} unauthenticated`);
        assert.equal(wrongRole.status, 403, `${method.toUpperCase()} ${path} wrong role`);
    }
});

test('admin-created invite is hashed, expiring, single-use, and provisions a coordinator', async () => {
    const headers = { Authorization: `Bearer ${tokenFor(1, 'admin')}` };
    const expiredInvite = await request(app).post('/admin/coordinators/invites').set(headers).send({
        name: 'Expired Invite', email: 'expired@mmcoe.edu.in', department: 'Computer', year: 2
    });
    assert.equal(expiredInvite.status, 201);
    const expiredToken = new URL(expiredInvite.body.invite_url).searchParams.get('token');
    const expiredHash = require('node:crypto').createHash('sha256').update(expiredToken).digest('hex');
    assert.notEqual((await get('SELECT token_hash FROM coordinator_invites WHERE email = ?', ['expired@mmcoe.edu.in'])).token_hash, expiredToken);
    await run("UPDATE coordinator_invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?", ['expired@mmcoe.edu.in']);
    const expiredAcceptance = await request(app).post('/auth/accept-invite').send({ token: expiredToken, password: 'A-unique-invite-password-2026' });
    assert.equal(expiredAcceptance.status, 400);

    const issued = await request(app).post('/admin/coordinators/invites').set(headers).send({
        name: 'New Coordinator', email: 'newlead@mmcoe.edu.in', department: 'Computer', year: 3
    });
    assert.equal(issued.status, 201);
    const token = new URL(issued.body.invite_url).searchParams.get('token');
    const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
    assert.equal((await get('SELECT token_hash FROM coordinator_invites WHERE email = ?', ['newlead@mmcoe.edu.in'])).token_hash, tokenHash);
    const accepted = await request(app).post('/auth/accept-invite').send({ token, password: 'A-unique-invite-password-2026' });
    const reused = await request(app).post('/auth/accept-invite').send({ token, password: 'A-unique-invite-password-2026' });
    assert.equal(accepted.status, 201);
    assert.equal(reused.status, 400);
    const coordinator = await get('SELECT role, email_verified_at, is_active FROM users WHERE email = ?', ['newlead@mmcoe.edu.in']);
    assert.equal(coordinator.role, 'coordinator');
    assert.ok(coordinator.email_verified_at);
    assert.equal(coordinator.is_active, 1);
    assert.ok(inviteUrl);
});

test('admin deactivation revokes an active user token', async () => {
    const headers = { Authorization: `Bearer ${tokenFor(1, 'admin')}` };
    const deactivated = await request(app).patch('/admin/users/2/active').set(headers).send({ is_active: false });
    const stale = await request(app).get('/admin/users').set({ Authorization: `Bearer ${tokenFor(2, 'student')}` });
    assert.equal(deactivated.status, 200);
    assert.equal(stale.status, 401);
    assert.equal((await get('SELECT is_active, token_version FROM users WHERE id = 2')).token_version, 1);
});

test('admins can create, assign, edit, and soft-archive clubs', async () => {
    const headers = { Authorization: `Bearer ${tokenFor(1, 'admin')}` };
    const created = await request(app).post('/admin/clubs').set(headers).send({
        name: 'Robotics', category: 'Technical', description: 'Build robots', coordinator_id: 3
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    const edited = await request(app).put(`/admin/clubs/${id}`).set(headers).send({
        name: 'Robotics Lab', category: 'Technical', description: 'Build more robots', coordinator_id: 3
    });
    assert.equal(edited.status, 200);
    const invalidAssignment = await request(app).put(`/admin/clubs/${id}`).set(headers).send({
        name: 'Robotics Lab', category: 'Technical', description: 'Build more robots', coordinator_id: 2
    });
    assert.equal(invalidAssignment.status, 400);
    const confirmationRequired = await request(app).delete(`/admin/clubs/${id}`).set(headers).send({});
    assert.equal(confirmationRequired.status, 400);
    const archived = await request(app).delete(`/admin/clubs/${id}`).set(headers).send({ confirm: true });
    assert.equal(archived.status, 200);
    assert.ok((await get('SELECT deleted_at FROM clubs WHERE id = ?', [id])).deleted_at);
});

test('admin can view, approve, and reject pending student registrations', async () => {
    const adminHeaders = { Authorization: `Bearer ${tokenFor(1, 'admin')}` };
    const coordHeaders = { Authorization: `Bearer ${tokenFor(3, 'coordinator')}` };

    // Insert pending student
    const pendingInsert = await run(`INSERT INTO users
        (name, email, password_hash, role, department, year, phone, prn, bio, approval_status, is_active)
        VALUES ('Pending Student', 'pending@gmail.com', 'hash', 'student', 'Computer', 2, '9876543210', 'PRN999', 'I want to join', 'pending', 0)`);
    const pendingId = pendingInsert.lastID;

    // Non-admin rejected
    const unauth = await request(app).get('/admin/registration-requests');
    assert.equal(unauth.status, 401);
    const nonAdmin = await request(app).get('/admin/registration-requests').set(coordHeaders);
    assert.equal(nonAdmin.status, 403);

    // Admin lists pending requests
    const listRes = await request(app).get('/admin/registration-requests').set(adminHeaders);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    const found = listRes.body.find(u => u.id === pendingId);
    assert.ok(found);
    assert.equal(found.prn, 'PRN999');
    assert.equal(found.approval_status, 'pending');

    // Admin approves student
    const approveRes = await request(app).post(`/admin/registration-requests/${pendingId}/approve`).set(adminHeaders);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.user.approval_status, 'approved');

    const approvedUser = await get('SELECT approval_status, is_active, email_verified_at, reviewed_by FROM users WHERE id = ?', [pendingId]);
    assert.equal(approvedUser.approval_status, 'approved');
    assert.equal(approvedUser.is_active, 1);
    assert.ok(approvedUser.email_verified_at);
    assert.equal(approvedUser.reviewed_by, 1);

    // Insert another student to test rejection
    const rejectInsert = await run(`INSERT INTO users
        (name, email, password_hash, role, department, year, phone, prn, bio, approval_status, is_active)
        VALUES ('Invalid Applicant', 'fake@gmail.com', 'hash', 'student', 'Computer', 1, '1234567890', 'FAKE123', 'Not a student', 'pending', 0)`);
    const rejectId = rejectInsert.lastID;

    const rejectRes = await request(app).post(`/admin/registration-requests/${rejectId}/reject`).set(adminHeaders).send({
        reason: 'PRN not found in college registry'
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.user.approval_status, 'rejected');

    const rejectedUser = await get('SELECT approval_status, is_active, approval_notes FROM users WHERE id = ?', [rejectId]);
    assert.equal(rejectedUser.approval_status, 'rejected');
    assert.equal(rejectedUser.is_active, 0);
    assert.equal(rejectedUser.approval_notes, 'PRN not found in college registry');
});

test.after(async () => {
    console.info = originalInfo;
    await new Promise(resolve => db.close(resolve));
});
