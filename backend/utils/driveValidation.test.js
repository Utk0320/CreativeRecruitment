const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDriveInput, getInitialDriveStatus } = require('./driveValidation');

const validDrive = {
    club_id: '4',
    title: 'Design team',
    description: 'Build things',
    eligibility: 'Open to all',
    open_date: '2026-10-15',
    deadline: '2026-10-20'
};

test('date-only drive inputs become India-time ISO datetimes', () => {
    const parsed = parseDriveInput(validDrive);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.open_date, '2026-10-15T00:00:00+05:30');
    assert.equal(parsed.data.deadline, '2026-10-20T23:59:59+05:30');
});

test('drive validation rejects malformed or reversed dates', () => {
    assert.equal(parseDriveInput({ ...validDrive, deadline: 'not-a-date' }).success, false);
    assert.equal(parseDriveInput({ ...validDrive, deadline: '2026-10-14' }).success, false);
});

test('future drives remain scheduled until their start date', () => {
    const parsed = parseDriveInput(validDrive);
    assert.equal(getInitialDriveStatus(parsed.data, new Date('2026-10-14T00:00:00Z')), 'scheduled');
    assert.equal(getInitialDriveStatus(parsed.data, new Date('2026-10-15T00:00:00Z')), 'published');
});