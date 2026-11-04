const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

const profile = {
    id: 12,
    name: 'Applicant',
    email: 'applicant@mmcoe.edu.in',
    phone: '555-0100',
    role: 'student',
    department: 'Computer Science',
    year: 2,
    bio: 'Builds useful things',
    profile_picture_url: null,
    skills: '[]',
    interests: '[]',
    projects: '[]',
    achievements: '[]',
    portfolio_url: null,
    github_url: null,
    linkedin_url: null
};

const fakeDb = {
    get(sql, params, callback) {
        if (sql.includes('SELECT role, is_active, token_version')) {
            const roles = { 4: 'coordinator', 5: 'coordinator', 12: 'student', 13: 'coordinator' };
            const role = roles[Number(params[0])];
            return callback(null, role ? { role, is_active: 1, token_version: 0, must_change_password: 0 } : null);
        }
        if (sql.includes('SELECT 1 AS authorized')) {
            // Phase 2: query now passes [coordinator_user_id, student_id]
            return callback(null, Number(params[0]) === 4 ? { authorized: 1 } : null);
        }
        if (sql.includes('email')) return callback(null, { ...profile });
        const { email, phone, portfolio_url, github_url, linkedin_url, ...publicProfile } = profile;
        callback(null, publicProfile);
    },
    run(sql, params, callback) {
        callback.call({ changes: 1 }, null);
    },
    all() {}
};

const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { db: fakeDb }
};

const app = express();
app.use(express.json());
app.use('/users', require('./users'));
const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

test('user profile rejects unauthenticated requests', async () => {
    const response = await request(app).get('/users/12');
    assert.equal(response.status, 401);
});

test('users can view their own contact details', async () => {
    const response = await request(app).get('/users/12').set('Authorization', `Bearer ${as(12, 'student')}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.email, profile.email);
    assert.equal(response.body.phone, profile.phone);
});

test('unrelated viewers receive a redacted profile', async () => {
    const response = await request(app).get('/users/12').set('Authorization', `Bearer ${as(13, 'coordinator')}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.name, profile.name);
    assert.equal('email' in response.body, false);
    assert.equal('phone' in response.body, false);
});

test('coordinators see applicant contact details only for their own clubs', async () => {
    const own = await request(app).get('/users/12').set('Authorization', `Bearer ${as(4, 'coordinator')}`);
    const other = await request(app).get('/users/12').set('Authorization', `Bearer ${as(5, 'coordinator')}`);
    assert.equal(own.body.email, profile.email);
    assert.equal('email' in other.body, false);
    assert.equal('phone' in other.body, false);
});

test('avatar endpoint rejects content that is not a real image', async () => {
    const response = await request(app).post('/users/12/avatar')
        .set('Authorization', `Bearer ${as(12, 'student')}`)
        .attach('avatar', Buffer.from('not an image'), { filename: 'avatar.png', contentType: 'image/png' });
    assert.equal(response.status, 400);
});

test('avatar endpoint enforces the 2 MB upload limit', async () => {
    const response = await request(app).post('/users/12/avatar')
        .set('Authorization', `Bearer ${as(12, 'student')}`)
        .attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' });
    assert.equal(response.status, 413);
});