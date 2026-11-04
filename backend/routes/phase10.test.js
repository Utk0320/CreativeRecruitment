/**
 * routes/phase10.test.js — Phase 10 Analytics, Privacy & Platform Integration Tests
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

// In-memory test DB
const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );

const getRow = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );

const as = (id, role) => jwt.sign({ id, role, token_version: 0 }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/analytics', require('./analytics'));
app.use('/privacy', require('./privacy'));

let ADMIN_ID, COORD_ID, STUDENT1_ID, STUDENT2_ID;
let CLUB_ID, OTHER_CLUB_ID, SEASON_ID, DRIVE_ID, APP1_ID, APP2_ID;

before(async () => {
    await runMigrations(db);

    const a = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('System Admin','admin@mmcoe.edu.in','hash','admin',1,0)");
    ADMIN_ID = a.lastID;

    const c1 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version) VALUES ('Club Lead','coord@mmcoe.edu.in','hash','coordinator',1,0)");
    COORD_ID = c1.lastID;

    const s1 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version, department, year, bio, phone, prn) VALUES ('Aditi Rao','aditi@mmcoe.edu.in','hash','student',1,0,'Computer Engineering',2,'Full stack developer','9876543210','PRN2024001')");
    STUDENT1_ID = s1.lastID;

    const s2 = await run("INSERT INTO users (name, email, password_hash, role, is_active, token_version, department, year, bio, phone, prn) VALUES ('Rohan Patil','rohan@mmcoe.edu.in','hash','student',1,0,'Information Technology',3,'AI enthusiast','9876543211','PRN2024002')");
    STUDENT2_ID = s2.lastID;

    const cl1 = await run("INSERT INTO clubs (name, category) VALUES ('Web & Coding Club','Technical')");
    CLUB_ID = cl1.lastID;

    const cl2 = await run("INSERT INTO clubs (name, category) VALUES ('Design Guild','Creative')");
    OTHER_CLUB_ID = cl2.lastID;

    // Set lead coordinator
    await run(`INSERT INTO club_members (club_id, user_id, role, title, added_by) VALUES (${CLUB_ID}, ${COORD_ID}, 'lead', 'Lead Coordinator', ${COORD_ID})`);

    // Create season & drive
    const seas = await run("INSERT INTO recruitment_seasons (name, start_date, end_date, status, created_by) VALUES ('Academic Year 2026-27','2026-07-01','2027-06-30','active'," + ADMIN_ID + ")");
    SEASON_ID = seas.lastID;

    const dr = await run(`
        INSERT INTO recruitment_drives (club_id, season_id, title, description, status)
        VALUES (${CLUB_ID}, ${SEASON_ID}, 'Fall Web Dev Recruitment', 'Seeking fullstack devs', 'active')
    `);
    DRIVE_ID = dr.lastID;

    // Create applications: Aditi (Accepted), Rohan (Interview / Reviewing)
    const a1 = await run(`
        INSERT INTO applications (drive_id, student_id, status, current_stage_id, answers_snapshot, applied_at)
        VALUES (${DRIVE_ID}, ${STUDENT1_ID}, 'Accepted', 'final', '{"why":"I love coding"}', '2026-09-01 10:00:00')
    `);
    APP1_ID = a1.lastID;

    const a2 = await run(`
        INSERT INTO applications (drive_id, student_id, status, current_stage_id, answers_snapshot, applied_at)
        VALUES (${DRIVE_ID}, ${STUDENT2_ID}, 'Reviewing', 'interview', '{"why":"Building ML projects"}', '2026-09-02 11:00:00')
    `);
    APP2_ID = a2.lastID;

    // Add interview slot and booking for Rohan
    const slot = await run(`
        INSERT INTO interview_slots (drive_id, coordinator_id, start_time, end_time, location, capacity, booked_count)
        VALUES (${DRIVE_ID}, ${COORD_ID}, '2026-09-10 14:00:00', '2026-09-10 14:30:00', 'Online Google Meet', 1, 1)
    `);
    await run(`
        INSERT INTO interview_bookings (slot_id, application_id, student_id, status)
        VALUES (${slot.lastID}, ${APP2_ID}, ${STUDENT2_ID}, 'confirmed')
    `);

    // Add offer for Aditi
    await run(`
        INSERT INTO offers (application_id, student_id, club_id, drive_id, status, created_at)
        VALUES (${APP1_ID}, ${STUDENT1_ID}, ${CLUB_ID}, ${DRIVE_ID}, 'accepted', '2026-09-15 12:00:00')
    `);

    // Add certificate for Aditi
    await run(`
        INSERT INTO member_certificates (club_id, user_id, title, certificate_type, issue_date, unique_credential_hash, issued_by)
        VALUES (${CLUB_ID}, ${STUDENT1_ID}, 'Certificate of Excellence', 'merit', '2026-09-20', 'sha256hashaditi1234567890abcdef', ${COORD_ID})
    `);
});

after(() => {
    db.close();
});

describe('Phase 10: Analytics, Privacy & Platform Integration Tests', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // 1. RECRUITMENT OVERVIEW ANALYTICS
    // ─────────────────────────────────────────────────────────────────────────
    test('overview metrics return counts and conversion rates; students are denied (403)', async () => {
        // Student denied
        const denied = await request(app)
            .get('/analytics/overview')
            .set('Authorization', `Bearer ${as(STUDENT1_ID, 'student')}`);
        assert.equal(denied.status, 403);

        // Coordinator view
        const coordRes = await request(app)
            .get(`/analytics/overview?club_id=${CLUB_ID}`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);
        assert.equal(coordRes.status, 200);
        assert.equal(coordRes.body.total_drives, 1);
        assert.equal(coordRes.body.total_applications, 2);
        assert.equal(coordRes.body.total_shortlisted, 2);
        assert.equal(coordRes.body.total_interviewed, 1);
        assert.equal(coordRes.body.total_offers, 1);
        assert.equal(coordRes.body.total_accepted, 1);
        assert.equal(coordRes.body.acceptance_rate, 50); // 1 out of 2 = 50%
        assert.equal(coordRes.body.offer_acceptance_rate, 100); // 1 out of 1 offer = 100%
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RECRUITMENT FUNNEL ANALYSIS
    // ─────────────────────────────────────────────────────────────────────────
    test('funnel analysis computes stage drop-offs accurately', async () => {
        const res = await request(app)
            .get(`/analytics/funnel?drive_id=${DRIVE_ID}`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.total_candidates, 2);

        const funnel = res.body.funnel;
        assert.ok(Array.isArray(funnel));
        assert.equal(funnel[0].stage, 'Applied');
        assert.equal(funnel[0].count, 2);

        // Accepted stage
        const acceptedStage = funnel.find(f => f.stage === 'Accepted');
        assert.ok(acceptedStage);
        assert.equal(acceptedStage.count, 1);
        assert.equal(acceptedStage.conversion_from_total, 50.0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. APPLICANT DEMOGRAPHICS (Department & Year)
    // ─────────────────────────────────────────────────────────────────────────
    test('demographics returns department and year of study distribution', async () => {
        const res = await request(app)
            .get(`/analytics/demographics?club_id=${CLUB_ID}`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.total, 2);

        const depts = res.body.departments;
        const comp = depts.find(d => d.department === 'Computer Engineering');
        const it = depts.find(d => d.department === 'Information Technology');
        assert.ok(comp && comp.count === 1);
        assert.ok(it && it.count === 1);

        const years = res.body.years;
        const y2 = years.find(y => y.year === 2);
        const y3 = years.find(y => y.year === 3);
        assert.ok(y2 && y2.count === 1);
        assert.ok(y3 && y3.count === 1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CROSS-CLUB PERFORMANCE BENCHMARK
    // ─────────────────────────────────────────────────────────────────────────
    test('clubs comparison benchmarks all clubs across applications and members', async () => {
        const res = await request(app)
            .get('/analytics/clubs-comparison')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        const codingClub = res.body.find(c => c.id === CLUB_ID);
        assert.ok(codingClub);
        assert.equal(codingClub.drives_count, 1);
        assert.equal(codingClub.applications_count, 2);
        assert.equal(codingClub.accepted_count, 1);
        assert.equal(codingClub.acceptance_rate, 50);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CSV ANALYTICS EXPORT
    // ─────────────────────────────────────────────────────────────────────────
    test('analytics CSV export returns proper text/csv headers and row contents', async () => {
        const res = await request(app)
            .get('/analytics/export/csv')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(res.status, 200);
        assert.ok(res.headers['content-type'].includes('text/csv'));
        assert.ok(res.headers['content-disposition'].includes('recruitment_analytics.csv'));
        assert.ok(res.text.includes('Drive Title'));
        assert.ok(res.text.includes('Fall Web Dev Recruitment'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. SUBJECT ACCESS REQUEST (SAR) JSON EXPORT & REDACTION
    // ─────────────────────────────────────────────────────────────────────────
    test('student SAR export returns full profile, offers, certs, and redacts internal evaluator notes', async () => {
        const res = await request(app)
            .get('/privacy/my-data')
            .set('Authorization', `Bearer ${as(STUDENT1_ID, 'student')}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.compliance, 'DPDP & GDPR Subject Access Request (SAR)');
        assert.equal(res.body.data_subject.email, 'aditi@mmcoe.edu.in');
        assert.equal(res.body.data_subject.department, 'Computer Engineering');

        // Verify applications present
        assert.equal(res.body.applications.length, 1);
        const appRecord = res.body.applications[0];
        assert.equal(appRecord.drive_title, 'Fall Web Dev Recruitment');
        assert.equal(appRecord.status, 'Accepted');

        // Security check: private coordinator notes and evaluator identities must NOT be leaked
        assert.equal(appRecord.scorecard_notes, undefined);
        assert.equal(appRecord.evaluator_id, undefined);
        assert.equal(appRecord.internal_comments, undefined);

        // Verify offers and certificates
        assert.equal(res.body.offers.length, 1);
        assert.equal(res.body.offers[0].status, 'accepted');
        assert.equal(res.body.offers[0].drive_title, 'Fall Web Dev Recruitment');

        assert.equal(res.body.certificates.length, 1);
        assert.equal(res.body.certificates[0].unique_credential_hash, 'sha256hashaditi1234567890abcdef');
        assert.equal(res.body.certificates[0].verification_url, '/verify/sha256hashaditi1234567890abcdef');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. STUDENT CSV DATA EXPORT
    // ─────────────────────────────────────────────────────────────────────────
    test('student personal CSV export returns user applications file', async () => {
        const res = await request(app)
            .get('/privacy/my-data/csv')
            .set('Authorization', `Bearer ${as(STUDENT1_ID, 'student')}`);

        assert.equal(res.status, 200);
        assert.ok(res.headers['content-type'].includes('text/csv'));
        assert.ok(res.text.includes('Application ID'));
        assert.ok(res.text.includes('Fall Web Dev Recruitment'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DATA DELETION / ANONYMIZATION REQUEST SUBMISSION
    // ─────────────────────────────────────────────────────────────────────────
    test('student can submit deletion request; duplicate pending request is blocked', async () => {
        // Validation check
        const shortReq = await request(app)
            .post('/privacy/delete-request')
            .set('Authorization', `Bearer ${as(STUDENT2_ID, 'student')}`)
            .send({ reason: 'short' });
        assert.equal(shortReq.status, 400);

        // Valid submission
        const res = await request(app)
            .post('/privacy/delete-request')
            .set('Authorization', `Bearer ${as(STUDENT2_ID, 'student')}`)
            .send({ reason: 'Graduated from college and requesting profile anonymization' });

        assert.equal(res.status, 201);
        assert.equal(res.body.status, 'pending');

        // Duplicate attempt blocked
        const dupRes = await request(app)
            .post('/privacy/delete-request')
            .set('Authorization', `Bearer ${as(STUDENT2_ID, 'student')}`)
            .send({ reason: 'Graduated from college and requesting profile anonymization' });
        assert.equal(dupRes.status, 400);
        assert.ok(dupRes.body.error.includes('already have a pending'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 9. ADMIN REVIEW & EXECUTION OF DELETION (RIGHT TO BE FORGOTTEN)
    // ─────────────────────────────────────────────────────────────────────────
    test('admin lists deletion requests and approves request, triggering user anonymization', async () => {
        // Admin lists requests
        const listRes = await request(app)
            .get('/privacy/delete-requests')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(listRes.status, 200);
        const reqItem = listRes.body.find(r => r.user_id === STUDENT2_ID);
        assert.ok(reqItem);
        assert.equal(reqItem.status, 'pending');

        // Admin approves request
        const actionRes = await request(app)
            .post(`/privacy/delete-requests/${reqItem.id}/action`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ action: 'approve', admin_notes: 'Verified graduation; anonymizing records.' });

        assert.equal(actionRes.status, 200);
        assert.equal(actionRes.body.status, 'completed');

        // Verify Rohan's profile was anonymized in DB
        const anonymizedUser = await getRow(`SELECT * FROM users WHERE id = ?`, [STUDENT2_ID]);
        assert.equal(anonymizedUser.is_anonymized, 1);
        assert.equal(anonymizedUser.is_active, 0);
        assert.equal(anonymizedUser.name, `Anonymized Candidate #${STUDENT2_ID}`);
        assert.equal(anonymizedUser.email, `anonymized_${STUDENT2_ID}@deleted.local`);
        assert.equal(anonymizedUser.phone, null);
        assert.equal(anonymizedUser.bio, null);
        assert.equal(anonymizedUser.prn, null);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 10. RETENTION POLICIES CONFIGURATION & PURGE CLEANER
    // ─────────────────────────────────────────────────────────────────────────
    test('admin updates retention policy and triggers retention purge', async () => {
        // Read policies
        const listRes = await request(app)
            .get('/privacy/retention/policies')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`);

        assert.equal(listRes.status, 200);
        const notifPolicy = listRes.body.policies.find(p => p.entity_type === 'notifications');
        assert.ok(notifPolicy);

        // Update policy retention days
        const updateRes = await request(app)
            .put(`/privacy/retention/policies/${notifPolicy.id}`)
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ retention_days: 30, is_active: true });

        assert.equal(updateRes.status, 200);
        assert.equal(updateRes.body.retention_days, 30);

        // Seed an old read notification
        await run(`
            INSERT INTO notifications (user_id, title, message, is_read, created_at)
            VALUES (${STUDENT1_ID}, 'Old alert', 'Old notification', 1, datetime('now', '-45 days'))
        `);

        // Seed a fresh unread notification (should NOT be purged)
        await run(`
            INSERT INTO notifications (user_id, title, message, is_read, created_at)
            VALUES (${STUDENT1_ID}, 'Fresh alert', 'New notification', 0, datetime('now', '-5 days'))
        `);

        // Execute purge
        const purgeRes = await request(app)
            .post('/privacy/retention/purge')
            .set('Authorization', `Bearer ${as(ADMIN_ID, 'admin')}`)
            .send({ entity_type: 'notifications' });

        assert.equal(purgeRes.status, 200);
        assert.ok(purgeRes.body.summary[0].records_purged >= 1);

        // Verify logs created
        const purgeLog = await getRow(`SELECT * FROM data_retention_logs WHERE entity_type = 'notifications' ORDER BY id DESC LIMIT 1`);
        assert.ok(purgeLog);
        assert.ok(purgeLog.records_purged >= 1);

        // Verify fresh unread notification is intact
        const freshNotif = await getRow(`SELECT * FROM notifications WHERE title = 'Fresh alert'`);
        assert.ok(freshNotif);
    });
});
