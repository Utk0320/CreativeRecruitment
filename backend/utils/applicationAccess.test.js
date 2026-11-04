const test = require('node:test');
const assert = require('node:assert/strict');
const { APPLICATION_STATUSES, canViewApplication } = require('./applicationAccess');

test('students can view only their own application', () => {
    const application = { student_id: 12, coordinator_id: 4 };
    assert.equal(canViewApplication({ id: 12, role: 'student' }, application), true);
    assert.equal(canViewApplication({ id: 13, role: 'student' }, application), false);
});

test('coordinators can view applications only for their club', () => {
    const application = { student_id: 12, coordinator_id: 4 };
    assert.equal(canViewApplication({ id: 4, role: 'coordinator' }, application), true);
    assert.equal(canViewApplication({ id: 5, role: 'coordinator' }, application), false);
});

test('missing identities and unknown roles cannot view applications', () => {
    const application = { student_id: 12, coordinator_id: 4 };
    assert.equal(canViewApplication(null, application), false);
    assert.equal(canViewApplication({ id: 1, role: 'visitor' }, application), false);
});

test('application statuses are an explicit allowlist', () => {
    assert.ok(APPLICATION_STATUSES.includes('Shortlisted'));
    assert.ok(!APPLICATION_STATUSES.includes('anything-goes'));
});