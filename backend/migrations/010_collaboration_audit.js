/**
 * Migration 010 — Phase 5: Collaboration, Audit and Approvals
 *
 * Adds:
 *  activity_log:
 *   - season_id INTEGER
 *   - before_json TEXT
 *   - after_json TEXT
 *  recruitment_drives:
 *   - version INTEGER DEFAULT 1
 *   - blind_review INTEGER DEFAULT 0
 *   - hide_scores_until_submitted INTEGER DEFAULT 0
 *  clubs:
 *   - version INTEGER DEFAULT 1
 *  applications:
 *   - version INTEGER DEFAULT 1
 *   - proposed_outcome TEXT
 *   - proposed_stage_id TEXT
 *   - proposed_by INTEGER
 *   - proposed_at DATETIME
 *   - approval_status TEXT DEFAULT 'none'
 *
 * Creates tables:
 *  - application_comments
 *  - reviewer_assignments
 *  - scorecards
 *  - viewing_heartbeats
 *
 * Backfills:
 *  - Migrates non-empty applications.notes into application_comments.
 */

const addMissingColumns = async (db, table, definitions) => {
    const columns = await new Promise((resolve, reject) =>
        db.all(`PRAGMA table_info(${table})`, (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existing = new Set(columns.map(r => r.name));
    for (const def of definitions) {
        const col = def.split(/\s+/, 1)[0];
        if (existing.has(col)) continue;
        await new Promise((resolve, reject) =>
            db.run(`ALTER TABLE ${table} ADD COLUMN ${def}`, e => e ? reject(e) : resolve())
        );
    }
};

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, e => e ? reject(e) : resolve())
);

const all = (db, sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows))
);

exports.up = async (db) => {
    // 1. Extend activity_log columns
    await addMissingColumns(db, 'activity_log', [
        'season_id INTEGER',
        'before_json TEXT',
        'after_json TEXT'
    ]);

    // 2. Add version & settings to recruitment_drives
    await addMissingColumns(db, 'recruitment_drives', [
        'version INTEGER DEFAULT 1',
        'blind_review INTEGER DEFAULT 0',
        'hide_scores_until_submitted INTEGER DEFAULT 0'
    ]);

    // 3. Add version to clubs
    await addMissingColumns(db, 'clubs', [
        'version INTEGER DEFAULT 1'
    ]);

    // 4. Add version and maker-checker columns to applications
    await addMissingColumns(db, 'applications', [
        'version INTEGER DEFAULT 1',
        'proposed_outcome TEXT',
        'proposed_stage_id TEXT',
        'proposed_by INTEGER',
        'proposed_at DATETIME',
        "approval_status TEXT DEFAULT 'none'"
    ]);

    // 5. Create application_comments table
    await run(db, `
        CREATE TABLE IF NOT EXISTS application_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL REFERENCES applications(id),
            author_id INTEGER NOT NULL REFERENCES users(id),
            body TEXT NOT NULL,
            is_edited INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 6. Create reviewer_assignments table
    await run(db, `
        CREATE TABLE IF NOT EXISTS reviewer_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL REFERENCES applications(id),
            reviewer_id INTEGER NOT NULL REFERENCES users(id),
            assigned_by INTEGER NOT NULL REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(application_id, reviewer_id)
        )
    `);

    // 7. Create scorecards table
    await run(db, `
        CREATE TABLE IF NOT EXISTS scorecards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL REFERENCES applications(id),
            reviewer_id INTEGER NOT NULL REFERENCES users(id),
            scores_json TEXT NOT NULL,
            total_score REAL NOT NULL,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(application_id, reviewer_id)
        )
    `);

    // 8. Create viewing_heartbeats table
    await run(db, `
        CREATE TABLE IF NOT EXISTS viewing_heartbeats (
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id),
            user_name TEXT NOT NULL,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (entity_type, entity_id, user_id)
        )
    `);

    // 9. Backfill legacy applications.notes into application_comments
    try {
        const appsWithNotes = await all(db, `
            SELECT a.id, a.notes, a.drive_id, d.club_id
            FROM applications a
            LEFT JOIN recruitment_drives d ON a.drive_id = d.id
            WHERE a.notes IS NOT NULL AND TRIM(a.notes) != ''
        `);

        for (const app of appsWithNotes) {
            // Find a suitable author: club lead or first coordinator, or fallback to user 1
            const lead = await new Promise((resolve) => {
                db.get(`
                    SELECT user_id FROM club_members
                    WHERE club_id = ? AND role = 'lead'
                    LIMIT 1
                `, [app.club_id], (err, row) => resolve(row?.user_id));
            });
            const authorId = lead || 1;

            const existingComment = await new Promise((resolve) => {
                db.get(`SELECT id FROM application_comments WHERE application_id = ? LIMIT 1`, [app.id], (err, row) => resolve(row));
            });

            if (!existingComment) {
                await run(db, `
                    INSERT INTO application_comments (application_id, author_id, body)
                    VALUES (?, ?, ?)
                `, [app.id, authorId, app.notes]);
            }
        }
    } catch {
        // Safe fallback if notes column doesn't exist or table is empty
    }
};

