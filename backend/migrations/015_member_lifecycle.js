/**
 * Migration 015 — Phase 9: Member Lifecycle
 *
 * Extends club membership:
 *  - club_members: title, status ('active', 'alumni', 'resigned'), joined_season_id, is_public, updated_at
 *
 * Creates tables:
 *  - onboarding_checklists: Club onboarding tasks with due windows and resources
 *  - member_onboarding_progress: Per-member onboarding progress tracking
 *  - club_events: Club activities, workshops, orientations with unique QR secret tokens
 *  - event_rsvps: Event RSVPs ('going', 'interested', 'declined')
 *  - event_attendance: Attendance logs with cryptographic QR or manual check-in
 *  - member_certificates: Verifiable certificates/credentials with SHA-256 hashes
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    await exec(`
        -- 1. Onboarding Checklists Table
        CREATE TABLE IF NOT EXISTS onboarding_checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            resource_url TEXT,
            due_days_after_join INTEGER DEFAULT 7,
            order_index INTEGER DEFAULT 0,
            is_required INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_onboarding_club ON onboarding_checklists(club_id);

        -- 2. Member Onboarding Progress Table
        CREATE TABLE IF NOT EXISTS member_onboarding_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
            is_completed INTEGER DEFAULT 1,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            UNIQUE(club_id, user_id, task_id)
        );

        CREATE INDEX IF NOT EXISTS idx_progress_member ON member_onboarding_progress(club_id, user_id);

        -- 3. Club Events Table
        CREATE TABLE IF NOT EXISTS club_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            event_date TEXT NOT NULL, -- YYYY-MM-DD
            start_time TEXT NOT NULL, -- HH:MM
            end_time TEXT NOT NULL, -- HH:MM
            qr_secret_token TEXT NOT NULL, -- Unique secret token for dynamic QR code
            is_public INTEGER DEFAULT 1, -- 1 = all students, 0 = members only
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_events_club ON club_events(club_id);
        CREATE INDEX IF NOT EXISTS idx_events_date ON club_events(event_date);

        -- 4. Event RSVPs Table
        CREATE TABLE IF NOT EXISTS event_rsvps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'going', -- 'going', 'interested', 'declined'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_rsvps_event ON event_rsvps(event_id, user_id);

        -- 5. Event Attendance Table
        CREATE TABLE IF NOT EXISTS event_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            check_in_method TEXT NOT NULL DEFAULT 'qr', -- 'qr' or 'manual'
            checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            verified_by INTEGER REFERENCES users(id),
            UNIQUE(event_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_attendance_event ON event_attendance(event_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_club ON event_attendance(club_id);

        -- 6. Member Certificates Table
        CREATE TABLE IF NOT EXISTS member_certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            certificate_type TEXT NOT NULL DEFAULT 'membership', -- 'membership', 'completion', 'merit', 'lead'
            issue_date TEXT NOT NULL, -- YYYY-MM-DD
            unique_credential_hash TEXT NOT NULL UNIQUE, -- Verifiable unique hash
            issued_by INTEGER REFERENCES users(id),
            metadata_json TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_certs_user ON member_certificates(user_id);
        CREATE INDEX IF NOT EXISTS idx_certs_hash ON member_certificates(unique_credential_hash);
    `);

    // Add columns to club_members safely
    const memberColumns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(club_members)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existingMemberCols = new Set(memberColumns.map(r => r.name));

    if (!existingMemberCols.has('title')) {
        await exec("ALTER TABLE club_members ADD COLUMN title TEXT DEFAULT 'Member'");
    }
    if (!existingMemberCols.has('status')) {
        await exec("ALTER TABLE club_members ADD COLUMN status TEXT DEFAULT 'active'");
    }
    if (!existingMemberCols.has('joined_season_id')) {
        await exec('ALTER TABLE club_members ADD COLUMN joined_season_id INTEGER REFERENCES recruitment_seasons(id)');
    }
    if (!existingMemberCols.has('is_public')) {
        await exec('ALTER TABLE club_members ADD COLUMN is_public INTEGER DEFAULT 1');
    }
    if (!existingMemberCols.has('updated_at')) {
        await exec('ALTER TABLE club_members ADD COLUMN updated_at DATETIME');
    }
};
