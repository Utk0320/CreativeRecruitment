const test = require('node:test');
const assert = require('node:assert/strict');
const { isVerifiedCollegeIdentity } = require('./ssoValidation');

test('Google SSO requires verified .comp email and matching hosted domain', () => {
    const identity = { email: 'student2025.comp@mmcoe.edu.in', email_verified: true, hd: 'mmcoe.edu.in' };
    assert.equal(isVerifiedCollegeIdentity(identity, 'google'), true);
    assert.equal(isVerifiedCollegeIdentity({ ...identity, hd: 'evil.example' }, 'google'), false);
    assert.equal(isVerifiedCollegeIdentity({ ...identity, email_verified: false }, 'google'), false);
    assert.equal(isVerifiedCollegeIdentity({ ...identity, email: 'student2025.it@mmcoe.edu.in' }, 'google'), false);
});

test('Microsoft SSO requires the configured tenant and verified college email', () => {
    const identity = { email: 'student2025.comp@mmcoe.edu.in', email_verified: true, tid: 'tenant-mmcoe' };
    assert.equal(isVerifiedCollegeIdentity(identity, 'microsoft', 'tenant-mmcoe'), true);
    assert.equal(isVerifiedCollegeIdentity(identity, 'microsoft', 'another-tenant'), false);
    assert.equal(isVerifiedCollegeIdentity(identity, 'microsoft', undefined), false);
});