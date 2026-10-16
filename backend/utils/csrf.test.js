const test = require('node:test');
const assert = require('node:assert/strict');
const { hasValidCsrfToken, requiresCsrfToken } = require('./csrf');

test('double-submit CSRF validation requires matching cookie and header', () => {
    assert.equal(hasValidCsrfToken('token-value', 'token-value'), true);
    assert.equal(hasValidCsrfToken('token-value', 'other-value'), false);
    assert.equal(hasValidCsrfToken('token-value', undefined), false);
});

test('only authenticated unsafe mutations require a CSRF token', () => {
    assert.equal(requiresCsrfToken('POST', '/api/auth/verify-email'), false);
    assert.equal(requiresCsrfToken('POST', '/api/auth/accept-invite'), false);
    assert.equal(requiresCsrfToken('POST', '/api/auth/reset-password'), false);
    assert.equal(requiresCsrfToken('POST', '/api/auth/refresh'), true);
    assert.equal(requiresCsrfToken('PUT', '/api/users/1'), true);
    assert.equal(requiresCsrfToken('GET', '/api/users/1'), false);
});