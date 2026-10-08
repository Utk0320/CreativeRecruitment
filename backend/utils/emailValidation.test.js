const test = require('node:test');
const assert = require('node:assert/strict');
const { isOfficialCollegeEmail } = require('./emailValidation');

test('accepts official student emails with any number of digits and a department code', () => {
    assert.equal(isOfficialCollegeEmail('aaradhybhatkar2025.ainds@mmcoe.edu.in', 'student'), true);
    assert.equal(isOfficialCollegeEmail('kedarkhedkar2019.it@mmcoe.edu.in', 'student'), true);
    assert.equal(isOfficialCollegeEmail('student2025.comp@MMCOE.EDU.IN', 'student'), true);
    assert.equal(isOfficialCollegeEmail('student12345.comp@mmcoe.edu.in', 'student'), true);
});

test('rejects student emails that do not contain the year and department pattern', () => {
    assert.equal(isOfficialCollegeEmail('jashwantnukala2025@mmcoe.edu.in', 'student'), false);
    assert.equal(isOfficialCollegeEmail('student2025@mmcoe.edu.in', 'student'), false);
    assert.equal(isOfficialCollegeEmail('student@gmail.com', 'student'), false);
});

test('accepts official coordinator emails and rejects external domains', () => {
    assert.equal(isOfficialCollegeEmail('mayurishelke@mmcoe.edu.in', 'coordinator'), true);
    assert.equal(isOfficialCollegeEmail('mayurishelke@gmail.com', 'coordinator'), false);
});

test('rejects malformed email addresses', () => {
    assert.equal(isOfficialCollegeEmail('not-an-email', 'student'), false);
    assert.equal(isOfficialCollegeEmail('student2025.ainds@mmcoe.edu.in.evil', 'student'), false);
    assert.equal(isOfficialCollegeEmail('studentabc.ainds@mmcoe.edu.in', 'student'), false);
});
