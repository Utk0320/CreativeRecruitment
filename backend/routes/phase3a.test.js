/**
 * routes/phase3a.test.js — Phase 3A integration tests
 *
 * Covers: snapshot immutability, re-submit versioning, resume upload (type/size/content),
 * per-season app limit, withdraw, auth on new endpoints.
 * Uses in-memory SQLite + runMigrations — never touches the real DB.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('../utils/migrationRunner');

process.env.JWT_SECRET = 'test-secret-phase3a-with-at-least-32-chars';

const db = new sqlite3.Database(':memory:');
const databasePath = require.resolve('../utils/db');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { db } };

const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); })
);
const getRow = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
);

const as = (id, role, extra = {}) => jwt.sign({ id, role, token_version: 0, ...extra }, process.env.JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/users', require('./users'));
app.use('/applications', require('./applications'));

let STUDENT_ID, STUDENT2_ID, COORD_ID, ADMIN_ID, CLUB_ID, DRIVE_ID, SEASON_ID;

before(async () => {
    await runMigrations(db);

    const a = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Admin','admin@mmcoe.edu.in','h','admin',1,0)");
    ADMIN_ID = a.lastID;

    const s = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version,email_verified_at,bio,phone,github_url) VALUES ('Stu1','s1@comp.mmcoe.edu.in','h','student',1,0,CURRENT_TIMESTAMP,'Bio here','1234567890','https://github.com/stu1')");
    STUDENT_ID = s.lastID;

    const s2 = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version,email_verified_at) VALUES ('Stu2','s2@comp.mmcoe.edu.in','h','student',1,0,CURRENT_TIMESTAMP)");
    STUDENT2_ID = s2.lastID;

    const c = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version) VALUES ('Coord','c1@mmcoe.edu.in','h','coordinator',1,0)");
    COORD_ID = c.lastID;

    const cl = await run(`INSERT INTO clubs (name,category,coordinator_id) VALUES ('Test Club','technical',${COORD_ID})`);
    CLUB_ID = cl.lastID;
    await run(`INSERT INTO club_members (club_id,user_id,role,added_by) VALUES (${CLUB_ID},${COORD_ID},'lead',${COORD_ID})`);

    const seas = await run("INSERT INTO recruitment_seasons (name,start_date,end_date,status,created_by) VALUES ('2025-26','2025-07-01','2026-06-30','active'," + ADMIN_ID + ")");
    SEASON_ID = seas.lastID;

    const d = await run(`INSERT INTO recruitment_drives (club_id,title,description,eligibility,open_date,deadline,status,season_id)
        VALUES (${CLUB_ID},'Test Drive','Desc','All','2000-01-01','2099-12-31','open',${SEASON_ID})`);
    DRIVE_ID = d.lastID;
});

after(() => new Promise(resolve => db.close(resolve)));

// ── Profile completeness ──────────────────────────────────────────────────────
describe('Profile completeness', () => {
    test('own profile GET includes completeness score', async () => {
        const res = await request(app)
            .get(`/users/${STUDENT_ID}`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);
        assert.equal(res.status, 200);
        assert.ok(typeof res.body.completeness === 'number', 'completeness should be a number');
        assert.ok(res.body.completeness >= 0 && res.body.completeness <= 100);
    });

    test('other user GET does not expose completeness', async () => {
        const res = await request(app)
            .get(`/users/${STUDENT2_ID}`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);
        assert.equal(res.status, 200);
        // Public profile — no completeness
        assert.ok(!('completeness' in res.body));
    });
});

// ── Resume upload ─────────────────────────────────────────────────────────────
describe('Resume upload', () => {
    test('401 without auth', async () => {
        const res = await request(app).post(`/users/${STUDENT_ID}/resume`);
        assert.equal(res.status, 401);
    });

    test('403 for coordinator (not a student)', async () => {
        const res = await request(app)
            .post(`/users/${COORD_ID}/resume`)
            .set('Authorization', `Bearer ${as(COORD_ID, 'coordinator')}`);
        assert.equal(res.status, 403);
    });

    test('403 uploading to another student ID', async () => {
        const res = await request(app)
            .post(`/users/${STUDENT2_ID}/resume`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);
        assert.equal(res.status, 403);
    });

    test('400 when no file provided', async () => {
        const res = await request(app)
            .post(`/users/${STUDENT_ID}/resume`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`);
        assert.equal(res.status, 400);
    });

    test('400 for non-PDF file (text content with .pdf extension)', async () => {
        // Create a tiny fake file that is NOT a PDF
        const fakePath = path.join(__dirname, '../uploads/test_fake.pdf');
        fs.mkdirSync(path.dirname(fakePath), { recursive: true });
        fs.writeFileSync(fakePath, 'this is plain text, not a PDF');
        try {
            const res = await request(app)
                .post(`/users/${STUDENT_ID}/resume`)
                .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
                .attach('resume', fakePath);
            assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
        } finally {
            fs.unlink(fakePath, () => {});
        }
    });

    test('413 for file over 5MB', async () => {
        const bigPath = path.join(__dirname, '../uploads/test_big.bin');
        fs.writeFileSync(bigPath, Buffer.alloc(6 * 1024 * 1024, 0));
        try {
            const res = await request(app)
                .post(`/users/${STUDENT_ID}/resume`)
                .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
                .attach('resume', bigPath);
            assert.equal(res.status, 413, `Expected 413, got ${res.status}`);
        } finally {
            fs.unlink(bigPath, () => {});
        }
    });

    test('200 for valid PDF (real PDF header)', async () => {
        // Minimal valid PDF
        const pdfPath = path.join(__dirname, '../uploads/test_valid.pdf');
        const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n9\n%%EOF');
        fs.writeFileSync(pdfPath, minimalPdf);
        try {
            const res = await request(app)
                .post(`/users/${STUDENT_ID}/resume`)
                .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
                .attach('resume', pdfPath);
            assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.ok(res.body.url?.includes('/uploads/resumes/'), 'should return resume URL');
        } finally {
            fs.unlink(pdfPath, () => {});
        }
    });
});

// ── Application submit & snapshot ─────────────────────────────────────────────
describe('Application submit and snapshot', () => {
    let appId;

    test('401 without auth', async () => {
        const res = await request(app).post('/applications');
        assert.equal(res.status, 401);
    });

    test('400 when ai_consent missing (verified student)', async () => {
        const res = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ drive_id: DRIVE_ID, motivation: 'I want to join', ai_consent: false });
        assert.equal(res.status, 400);
        assert.match(res.body.error, /consent/i);
    });

    test('201 submit creates application with profile_snapshot', async () => {
        const res = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ drive_id: DRIVE_ID, motivation: 'I want to join', ai_consent: true });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.ok(res.body.id);
        assert.equal(res.body.version, 1);
        appId = res.body.id;

        const row = await getRow('SELECT profile_snapshot FROM applications WHERE id = ?', [appId]);
        assert.ok(row.profile_snapshot, 'profile_snapshot should be set');
        const snap = JSON.parse(row.profile_snapshot);
        assert.ok(snap.name === 'Stu1', 'snapshot should have name');
    });

    test('snapshot is immutable — profile edit does not change it', async () => {
        // Get the original snapshot
        const before = await getRow('SELECT profile_snapshot FROM applications WHERE id = ?', [appId]);
        const snapBefore = JSON.parse(before.profile_snapshot);

        // Update user profile
        await request(app)
            .put(`/users/${STUDENT_ID}`)
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ name: 'Modified Name', department: 'CS', year: 2 });

        // Snapshot must be unchanged
        const after = await getRow('SELECT profile_snapshot FROM applications WHERE id = ?', [appId]);
        const snapAfter = JSON.parse(after.profile_snapshot);
        assert.equal(snapAfter.name, snapBefore.name, 'profile_snapshot must not change after profile edit');
    });

    test('re-submit before deadline creates version 2 and keeps v1 in application_versions', async () => {
        const res = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(STUDENT_ID, 'student')}`)
            .send({ drive_id: DRIVE_ID, motivation: 'Updated motivation', ai_consent: true });
        assert.ok(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.resubmitted, true);
        assert.equal(res.body.version, 2);

        // Check application_versions has v1
        const vRow = await getRow('SELECT version FROM application_versions WHERE application_id = ?', [appId]);
        assert.equal(vRow.version, 1, 'v1 should be archived in application_versions');
    });
});

// ── Per-season simultaneous limit ─────────────────────────────────────────────
describe('Per-season simultaneous application limit', () => {
    let limitStudentId, drive2Id;

    before(async () => {
        // Set limit=1 on season
        await run('UPDATE recruitment_seasons SET simultaneous_app_limit = 1 WHERE id = ?', [SEASON_ID]);

        // New student
        const ns = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version,email_verified_at) VALUES ('LimitStu','ls@comp.mmcoe.edu.in','h','student',1,0,CURRENT_TIMESTAMP)");
        limitStudentId = ns.lastID;

        // Second drive in same season
        const d2 = await run(`INSERT INTO recruitment_drives (club_id,title,description,eligibility,open_date,deadline,status,season_id)
            VALUES (${CLUB_ID},'Drive 2','Desc','All','2000-01-01','2099-12-31','open',${SEASON_ID})`);
        drive2Id = d2.lastID;
    });

    after(async () => {
        // Reset limit
        await run('UPDATE recruitment_seasons SET simultaneous_app_limit = NULL WHERE id = ?', [SEASON_ID]);
    });

    test('first application succeeds', async () => {
        const res = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(limitStudentId, 'student')}`)
            .send({ drive_id: DRIVE_ID, motivation: 'I want to join', ai_consent: true });
        assert.equal(res.status, 201, JSON.stringify(res.body));
    });

    test('second application in same season rejected 409', async () => {
        const res = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(limitStudentId, 'student')}`)
            .send({ drive_id: drive2Id, motivation: 'I want to join too', ai_consent: true });
        assert.equal(res.status, 409, JSON.stringify(res.body));
        assert.match(res.body.error, /limit/i);
    });
});

// ── Withdraw ──────────────────────────────────────────────────────────────────
describe('Withdraw application', () => {
    let withdrawAppId, withdrawStudentId;

    before(async () => {
        const ws = await run("INSERT INTO users (name,email,password_hash,role,is_active,token_version,email_verified_at) VALUES ('WdStu','wd@comp.mmcoe.edu.in','h','student',1,0,CURRENT_TIMESTAMP)");
        withdrawStudentId = ws.lastID;

        const wr = await request(app)
            .post('/applications')
            .set('Authorization', `Bearer ${as(withdrawStudentId, 'student')}`)
            .send({ drive_id: DRIVE_ID, motivation: 'Applying to withdraw', ai_consent: true });
        withdrawAppId = wr.body.id;
    });

    test('401 without auth', async () => {
        const res = await request(app).patch(`/applications/${withdrawAppId}/withdraw`);
        assert.equal(res.status, 401);
    });

    test('403 for another student trying to withdraw', async () => {
        const res = await request(app)
            .patch(`/applications/${withdrawAppId}/withdraw`)
            .set('Authorization', `Bearer ${as(STUDENT2_ID, 'student')}`);
        assert.equal(res.status, 403);
    });

    test('200 student withdraws own application', async () => {
        const res = await request(app)
            .patch(`/applications/${withdrawAppId}/withdraw`)
            .set('Authorization', `Bearer ${as(withdrawStudentId, 'student')}`);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.match(res.body.message, /withdrawn/i);
    });

    test('409 double withdraw', async () => {
        const res = await request(app)
            .patch(`/applications/${withdrawAppId}/withdraw`)
            .set('Authorization', `Bearer ${as(withdrawStudentId, 'student')}`);
        assert.equal(res.status, 409);
    });

    test('409 withdraw after deadline (past-deadline drive)', async () => {
        // Create past-deadline drive and application
        const pd = await run(`INSERT INTO recruitment_drives (club_id,title,description,eligibility,open_date,deadline,status)
            VALUES (${CLUB_ID},'Past Drive','D','All','2000-01-01','2000-01-02','open')`);
        const pa = await run(`INSERT INTO applications (drive_id,student_id,portfolio_url,motivation,status,profile_snapshot,ai_consent_at,submitted_at)
            VALUES (${pd.lastID},${withdrawStudentId},'https://p.example','late apply','Applied','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
        const res = await request(app)
            .patch(`/applications/${pa.lastID}/withdraw`)
            .set('Authorization', `Bearer ${as(withdrawStudentId, 'student')}`);
        assert.equal(res.status, 409, JSON.stringify(res.body));
        assert.match(res.body.error, /deadline/i);
    });
});
