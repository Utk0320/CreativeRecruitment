/**
 * Migration 012 — Phase 7: Interviews, Tests, Offers, and Stage Broadcasts
 *
 * Creates tables:
 *  - drive_tests: Per-drive test builder (MCQs, file/link, short answers, timer)
 *  - test_submissions: Candidate test attempts, server-side timer, auto & manual grading
 *  - interview_slots: Coordinator published interview slots
 *  - interview_bookings: Student booked interviews with cross-club clash detection
 *  - offers: Multi-club offer ranking, acceptance, expiration, and waitlist auto-cascades
 *  - message_templates: Per-club reusable communication templates
 *  - stage_message_logs: Send audit logs for bulk stage messages
 *
 * Adds columns to applications:
 *  - offer_status ('none', 'offered', 'accepted', 'declined', 'expired', 'cascaded')
 *  - offer_expires_at
 *  - student_preference_rank
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    await exec(`
        -- 1. Tests & Assessments
        CREATE TABLE IF NOT EXISTS drive_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drive_id INTEGER NOT NULL REFERENCES recruitment_drives(id) ON DELETE CASCADE,
            stage_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            duration_minutes INTEGER DEFAULT 60,
            questions_json TEXT NOT NULL DEFAULT '[]',
            total_points INTEGER DEFAULT 100,
            is_published INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_drive_tests_drive ON drive_tests(drive_id);

        CREATE TABLE IF NOT EXISTS test_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL REFERENCES drive_tests(id) ON DELETE CASCADE,
            application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id),
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            submitted_at DATETIME,
            answers_json TEXT DEFAULT '{}',
            score REAL,
            auto_graded_score REAL DEFAULT 0,
            manual_score REAL,
            feedback TEXT,
            attempt_number INTEGER DEFAULT 1,
            status TEXT DEFAULT 'in_progress',
            extra_attempt_granted_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_test_submissions_app ON test_submissions(application_id);
        CREATE INDEX IF NOT EXISTS idx_test_submissions_test ON test_submissions(test_id);

        -- 2. Interview Slots & Bookings
        CREATE TABLE IF NOT EXISTS interview_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drive_id INTEGER NOT NULL REFERENCES recruitment_drives(id) ON DELETE CASCADE,
            coordinator_id INTEGER NOT NULL REFERENCES users(id),
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            location TEXT NOT NULL,
            capacity INTEGER DEFAULT 1,
            booked_count INTEGER DEFAULT 0,
            is_cancelled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_interview_slots_drive ON interview_slots(drive_id);
        CREATE INDEX IF NOT EXISTS idx_interview_slots_time ON interview_slots(start_time, end_time);

        CREATE TABLE IF NOT EXISTS interview_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_id INTEGER NOT NULL REFERENCES interview_slots(id) ON DELETE CASCADE,
            application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT DEFAULT 'confirmed',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_bookings_app ON interview_bookings(application_id);
        CREATE INDEX IF NOT EXISTS idx_interview_bookings_student ON interview_bookings(student_id);

        -- 3. Offers & Auto-Cascading
        CREATE TABLE IF NOT EXISTS offers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id),
            club_id INTEGER NOT NULL REFERENCES clubs(id),
            drive_id INTEGER NOT NULL REFERENCES recruitment_drives(id),
            status TEXT DEFAULT 'pending',
            rank INTEGER DEFAULT 0,
            expires_at DATETIME,
            accepted_at DATETIME,
            declined_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_offers_student ON offers(student_id);
        CREATE INDEX IF NOT EXISTS idx_offers_club ON offers(club_id);
        CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

        -- 4. Message Templates & Stage Broadcast Logs
        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body_template TEXT NOT NULL,
            stage_id TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_message_templates_club ON message_templates(club_id);

        CREATE TABLE IF NOT EXISTS stage_message_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drive_id INTEGER NOT NULL REFERENCES recruitment_drives(id),
            club_id INTEGER NOT NULL REFERENCES clubs(id),
            sender_id INTEGER NOT NULL REFERENCES users(id),
            stage_id TEXT NOT NULL,
            recipient_count INTEGER NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            recipients_json TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_stage_message_logs_drive ON stage_message_logs(drive_id);
    `);

    // Add offer columns to applications table if not present
    const columns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(applications)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existing = new Set(columns.map(r => r.name));

    if (!existing.has('offer_status')) {
        await exec("ALTER TABLE applications ADD COLUMN offer_status TEXT DEFAULT 'none'");
    }
    if (!existing.has('offer_expires_at')) {
        await exec('ALTER TABLE applications ADD COLUMN offer_expires_at DATETIME');
    }
    if (!existing.has('student_preference_rank')) {
        await exec('ALTER TABLE applications ADD COLUMN student_preference_rank INTEGER DEFAULT 0');
    }
};

