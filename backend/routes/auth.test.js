const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'auth-test-secret-with-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.SSO_PROVIDER = 'none';
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
app.use(cookieParser());
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
let verificationUrl;
let originalInfo;

test.before(async () => {
    await runMigrations(db);
    originalInfo = console.info;
    console.info = message => {
        const match = message.match(/https?:\/\/\S+/);
        if (match) verificationUrl = new URL(match[0]);
    };
});

test('public registration always creates an unverified student despite a coordinator role field', async () => {
    const response = await request(app).post('/auth/register').send({
        name: 'New Student',
        email: 'newstudent2025.comp@mmcoe.edu.in',
        password: 'A-unique-long-password-2026',
        role: 'coordinator',
        department: 'Computer',
        year: 1
    });
    assert.equal(response.status, 201);
    const user = await get('SELECT role, email_verified_at, email_verification_token_hash FROM users WHERE email = ?', ['newstudent2025.comp@mmcoe.edu.in']);
    assert.equal(user.role, 'student');
    assert.equal(user.email_verified_at, null);
    assert.equal(user.email_verification_token_hash.length, 64);
    assert.ok(verificationUrl?.searchParams.get('token'));
    const firstVerificationUrl = verificationUrl;

    const attemptedAdmin = await request(app).post('/auth/register').send({
        name: 'Escalation Attempt',
        email: 'attempt2025.comp@mmcoe.edu.in',
        password: 'A-unique-long-password-2026',
        role: 'admin',
        department: 'Computer',
        year: 1
    });
    assert.equal(attemptedAdmin.status, 201);
    assert.equal((await get('SELECT role FROM users WHERE email = ?', ['attempt2025.comp@mmcoe.edu.in'])).role, 'student');
    verificationUrl = firstVerificationUrl;
});

test('email verification tokens expire and can be used only once', async () => {
    const expiredToken = verificationUrl.searchParams.get('token');
    await run("UPDATE users SET email_verification_expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?", ['newstudent2025.comp@mmcoe.edu.in']);
    const expired = await request(app).post('/auth/verify-email').send({ token: expiredToken });
    assert.equal(expired.status, 400);

    const registration = await request(app).post('/auth/register').send({
        name: 'Verified Student',
        email: 'verified2025.comp@mmcoe.edu.in',
        password: 'Another-unique-password-2026',
        department: 'Computer',
        year: 2
    });
    assert.equal(registration.status, 201);
    const token = verificationUrl.searchParams.get('token');
    const verified = await request(app).post('/auth/verify-email').send({ token });
    const reused = await request(app).post('/auth/verify-email').send({ token });
    assert.equal(verified.status, 200);
    assert.equal(reused.status, 400);
    assert.ok((await get('SELECT email_verified_at FROM users WHERE email = ?', ['verified2025.comp@mmcoe.edu.in'])).email_verified_at);
    // Admin approves student access
    await run("UPDATE users SET approval_status = 'approved', is_active = 1 WHERE email = ?", ['verified2025.comp@mmcoe.edu.in']);
});

test('unverified students cannot log in with a password', async () => {
    const response = await request(app).post('/auth/login').send({
        email: 'newstudent2025.comp@mmcoe.edu.in',
        password: 'A-unique-long-password-2026'
    });
    assert.equal(response.status, 403);
    assert.match(response.body.error, /pending administrator approval/i);
});

test('student registration accepts standard emails (e.g. gmail) and sets pending status', async () => {
    const res = await request(app).post('/auth/register').send({
        name: 'General Email Applicant',
        email: 'applicant.dev@gmail.com',
        password: 'A-unique-long-password-2026',
        department: 'Artificial Intelligence & Data Science',
        year: 2,
        phone: '9876543210',
        prn: 'PRN2026001',
        bio: 'Interested in AI/ML and robotics.'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.approval_status, 'pending');

    const user = await get('SELECT role, approval_status, is_active, prn, bio FROM users WHERE email = ?', ['applicant.dev@gmail.com']);
    assert.equal(user.role, 'student');
    assert.equal(user.approval_status, 'pending');
    assert.equal(user.is_active, 0);
    assert.equal(user.prn, 'PRN2026001');
    assert.equal(user.bio, 'Interested in AI/ML and robotics.');

    const loginRes = await request(app).post('/auth/login').send({
        email: 'applicant.dev@gmail.com',
        password: 'A-unique-long-password-2026'
    });
    assert.equal(loginRes.status, 403);
    assert.match(loginRes.body.error, /pending administrator approval/i);
});

test('development SSO accepts only college .comp addresses and creates verified student accounts', async () => {
    process.env.SSO_PROVIDER = 'console';
    const rejected = await request(app).post('/auth/sso/console').send({ email: 'attacker@gmail.com' });
    const accepted = await request(app).post('/auth/sso/console').send({ email: 'devstudent2026.comp@mmcoe.edu.in' });
    process.env.SSO_PROVIDER = 'none';
    assert.equal(rejected.status, 403);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.user.role, 'student');
    assert.ok(accepted.body.user.email_verified_at);
    assert.ok(accepted.headers['set-cookie'].some(cookie => cookie.startsWith('access_token=')));
});

test('refresh tokens rotate, reject reuse, and issue a new session', async () => {
    const login = await request(app).post('/auth/login').send({
        email: 'verified2025.comp@mmcoe.edu.in',
        password: 'Another-unique-password-2026'
    });
    assert.equal(login.status, 200);
    const cookies = login.headers['set-cookie'];
    const oldRefresh = cookies.find(cookie => cookie.startsWith('refresh_token=')).split(';')[0];
    const csrf = cookies.find(cookie => cookie.startsWith('csrf_token=')).split(';')[0];

    const refreshed = await request(app).post('/auth/refresh')
        .set('Cookie', [oldRefresh, csrf])
        .set('X-CSRF-Token', decodeURIComponent(csrf.split('=')[1]));
    assert.equal(refreshed.status, 200);
    const newRefresh = refreshed.headers['set-cookie'].find(cookie => cookie.startsWith('refresh_token=')).split(';')[0];
    assert.notEqual(newRefresh, oldRefresh);

    const reused = await request(app).post('/auth/refresh')
        .set('Cookie', [oldRefresh, csrf])
        .set('X-CSRF-Token', decodeURIComponent(csrf.split('=')[1]));
    assert.equal(reused.status, 401);
});

test('password-reset links expire, are single-use, and replace the password', async () => {
    const original = console.info;
    let resetUrl;
    console.info = message => {
        const match = message.match(/https?:\/\/\S+/);
        if (match) resetUrl = new URL(match[0]);
    };
    try {
        const unknownAccount = await request(app).post('/auth/forgot-password').send({ email: 'nobody2025.comp@mmcoe.edu.in' });
        const requested = await request(app).post('/auth/forgot-password').send({ email: 'verified2025.comp@mmcoe.edu.in' });
        assert.equal(requested.status, 200);
        assert.deepEqual(requested.body, unknownAccount.body);
        const expiredToken = resetUrl.searchParams.get('token');
        await run("UPDATE users SET password_reset_expires_at = '2000-01-01T00:00:00.000Z' WHERE email = ?", ['verified2025.comp@mmcoe.edu.in']);
        const expired = await request(app).post('/auth/reset-password').send({ token: expiredToken, password: 'New-unique-password-2026' });
        assert.equal(expired.status, 400);

        await request(app).post('/auth/forgot-password').send({ email: 'verified2025.comp@mmcoe.edu.in' });
        const token = resetUrl.searchParams.get('token');
        const reset = await request(app).post('/auth/reset-password').send({ token, password: 'New-unique-password-2026' });
        const reused = await request(app).post('/auth/reset-password').send({ token, password: 'Another-new-password-2026' });
        assert.equal(reset.status, 200);
        assert.equal(reused.status, 400);
        const oldPassword = await request(app).post('/auth/login').send({ email: 'verified2025.comp@mmcoe.edu.in', password: 'Another-unique-password-2026' });
        const newPassword = await request(app).post('/auth/login').send({ email: 'verified2025.comp@mmcoe.edu.in', password: 'New-unique-password-2026' });
        assert.equal(oldPassword.status, 401);
        assert.equal(newPassword.status, 200);
    } finally {
        console.info = original;
    }
});

test.after(async () => {
    console.info = originalInfo;
    await new Promise(resolve => db.close(resolve));
});
