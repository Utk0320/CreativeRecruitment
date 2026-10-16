const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword } = require('./passwordPolicy');

test('password policy requires ten characters and rejects bundled common passwords', () => {
    assert.equal(validatePassword('short123').valid, false);
    assert.equal(validatePassword('PASSWORD123').valid, false);
    assert.equal(validatePassword('A-secure-and-unique-phrase').valid, true);
});