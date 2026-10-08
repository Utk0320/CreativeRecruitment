const test = require('node:test');
const assert = require('node:assert/strict');
const { isOfficialCollegeEmail } = require('./emailValidation');

test('accepts official student emails with the expected student pattern', () => {
    assert.equal(isOfficialCollegeEmail('jashwantnukala2025.comp@mmcoe.edu.in', 'student'), true);
    assert.equal(isOfficialCollegeEmail('student2025.comp@MMCOE.EDU.IN', 'student'), true);
});

test('rejects student emails that do not contain the student pattern', () => {
    assert.equal(isOfficialCollegeEmail('jashwantnukala2025@mmcoe.edu.in', 'student'), false);
    assert.equal(isOfficialCollegeEmail('student@gmail.com', 'student'), false);
});

test('accepts official coordinator emails and rejects external domains', () => {
    assert.equal(isOfficialCollegeEmail('mayurishelke@mmcoe.edu.in', 'coordinator'), true);
    assert.equal(isOfficialCollegeEmail('mayurishelke@gmail.com', 'coordinator'), false);
});

test('rejects malformed email addresses', () => {
    assert.equal(isOfficialCollegeEmail('not-an-email', 'student'), false);
    assert.equal(isOfficialCollegeEmail('student@mmcoe.edu.in.evil', 'student'), false);
});
