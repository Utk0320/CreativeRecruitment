/**
 * Migration 013 — Phase 8: Appeals, Tickets, Notification Preferences, and Announcements
 *
 * Creates tables:
 *  - appeals: Student appeals for rejected/waitlisted applications (window-checked, non-original reviewer, stage restore)
 *  - support_tickets: Help desk tickets with category routing (club lead vs admin) and SLA tracking
 *  - ticket_replies: Threaded replies for support tickets
 *  - notification_preferences: Per-user preferences per channel (in_app, email, sms, push) and event
 *  - announcements: Club announcements targeting applicants and/or members
 *
 * Alters tables:
 *  - applications: Adds decided_by column to enforce non-original reviewer check
 *  - recruitment_drives: Adds appeal_window_days (default 7)
 *  - notifications: Adds link, channel, and event_type columns if missing
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    await exec(`
        -- 1. Appeals Table
        CREATE TABLE IF NOT EXISTS appeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id),
            reason TEXT NOT NULL,
            attachment_url TEXT,
            status TEXT DEFAULT 'Pending', -- 'Pending', 'Under Review', 'Upheld', 'Overturned'
            reviewer_id INTEGER REFERENCES users(id),
            reviewer_notes TEXT,
            restored_stage_id TEXT,
            resolved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_appeals_app ON appeals(application_id);
        CREATE INDEX IF NOT EXISTS idx_appeals_student ON appeals(student_id);
        CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);

        -- 2. Support Tickets Table
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_number TEXT UNIQUE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            club_id INTEGER REFERENCES clubs(id),
            application_id INTEGER REFERENCES applications(id),
            category TEXT NOT NULL, -- 'Account', 'Application', 'Technical', 'Appeal-related', 'Other'
            priority TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Urgent'
            status TEXT DEFAULT 'Open', -- 'Open', 'In Progress', 'Resolved', 'Closed'
            subject TEXT NOT NULL,
            assigned_to INTEGER REFERENCES users(id),
            sla_due_at DATETIME,
            resolved_at DATETIME,
            reopened_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_club ON support_tickets(club_id);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);

        -- 3. Ticket Replies Table (Threaded)
        CREATE TABLE IF NOT EXISTS ticket_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            sender_id INTEGER NOT NULL REFERENCES users(id),
            message TEXT NOT NULL,
            attachment_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies(ticket_id);

        -- 4. Notification Preferences Table
        CREATE TABLE IF NOT EXISTS notification_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL, -- 'stage_change', 'deadline_reminder', 'interview_reminder', 'offer_expiry', 'appeal_update', 'ticket_update', 'mentions_assignments', 'announcements'
            channel TEXT NOT NULL, -- 'in_app', 'email', 'sms', 'push'
            enabled INTEGER DEFAULT 1,
            UNIQUE(user_id, event_type, channel)
        );

        CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);

        -- 5. Announcements Table
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            audience TEXT DEFAULT 'all', -- 'all', 'applicants', 'members'
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_announcements_club ON announcements(club_id);
    `);

    // Check & add columns to applications
    const appColumns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(applications)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existingAppCols = new Set(appColumns.map(r => r.name));
    if (!existingAppCols.has('decided_by')) {
        await exec('ALTER TABLE applications ADD COLUMN decided_by INTEGER REFERENCES users(id)');
    }

    // Check & add columns to recruitment_drives
    const driveColumns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(recruitment_drives)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existingDriveCols = new Set(driveColumns.map(r => r.name));
    if (!existingDriveCols.has('appeal_window_days')) {
        await exec('ALTER TABLE recruitment_drives ADD COLUMN appeal_window_days INTEGER DEFAULT 7');
    }

    // Check & add columns to notifications
    const notifColumns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(notifications)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existingNotifCols = new Set(notifColumns.map(r => r.name));
    if (!existingNotifCols.has('channel')) {
        await exec("ALTER TABLE notifications ADD COLUMN channel TEXT DEFAULT 'in_app'");
    }
    if (!existingNotifCols.has('link')) {
        await exec('ALTER TABLE notifications ADD COLUMN link TEXT');
    }
    if (!existingNotifCols.has('event_type')) {
        await exec('ALTER TABLE notifications ADD COLUMN event_type TEXT');
    }
};

