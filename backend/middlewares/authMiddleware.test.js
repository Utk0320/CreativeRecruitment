const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = 'identity-test-secret-with-at-least-32-characters';
let account = { role: 'coordinator', is_active: 1, token_version: 2, must_change_password: 0 };
const fakeDb = {
    get(sql, params, callback) {
        callback(null, account);
    }
};
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { db: fakeDb }
};

const { authenticateToken } = require('./authMiddleware');
const app = express();
app.get('/private', authenticateToken, (req, res) => res.json({ id: req.user.id }));
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ id: req.user.id }));
app.post('/api/auth/change-password', authenticateToken, (req, res) => res.json({ id: req.user.id }));

const tokenFor = (version = 2, role = 'coordinator') => jwt.sign({ id: 4, role, token_version: version }, process.env.JWT_SECRET);

test('active accounts accept tokens with the current token version', async () => {
    account = { role: 'coordinator', is_active: 1, token_version: 2, must_change_password: 0 };
    const response = await request(app).get('/private').set('Authorization', `Bearer ${tokenFor()}`);
    assert.equal(response.status, 200);
});

test('deactivated accounts and stale token versions are rejected', async () => {
    account = { role: 'coordinator', is_active: 0, token_version: 2, must_change_password: 0 };
    const deactivated = await request(app).get('/private').set('Authorization', `Bearer ${tokenFor()}`);
    account = { role: 'coordinator', is_active: 1, token_version: 3, must_change_password: 0 };
    const stale = await request(app).get('/private').set('Authorization', `Bearer ${tokenFor()}`);
    assert.equal(deactivated.status, 401);
    assert.equal(stale.status, 401);
});

test('role changes and forced password changes invalidate other access', async () => {
    account = { role: 'admin', is_active: 1, token_version: 2, must_change_password: 0 };
    const changedRole = await request(app).get('/private').set('Authorization', `Bearer ${tokenFor()}`);
    account = { role: 'coordinator', is_active: 1, token_version: 2, must_change_password: 1 };
    const forcedChange = await request(app).get('/private').set('Authorization', `Bearer ${tokenFor()}`);
    assert.equal(changedRole.status, 401);
    assert.equal(forcedChange.status, 403);
});

test('forced password-change accounts can only access identity bootstrap and change routes', async () => {
    account = { role: 'coordinator', is_active: 1, token_version: 2, must_change_password: 1 };
    const token = `Bearer ${tokenFor()}`;
    const privateRoute = await request(app).get('/private').set('Authorization', token);
    const me = await request(app).get('/api/auth/me').set('Authorization', token);
    const change = await request(app).post('/api/auth/change-password').set('Authorization', token);
    assert.equal(privateRoute.status, 403);
    assert.equal(me.status, 200);
    assert.equal(change.status, 200);
});