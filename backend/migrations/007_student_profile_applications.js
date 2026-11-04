/**
 * Migration 007 — Slice 3A: student profile resume, application snapshots, versioning
 *
 * Adds:
 *  users: resume_path, resume_uploaded_at
 *  applications: profile_snapshot (JSON), answers_snapshot (JSON), version,
 *                ai_consent_at, is_withdrawn, withdrawn_at, submitted_at
 *  NEW TABLE: application_versions (append-only per-submit log)
 *  recruitment_seasons: simultaneous_app_limit
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

const tableExists = async (db, name) => {
    const row = await new Promise((resolve, reject) =>
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name],
            (e, r) => e ? reject(e) : resolve(r))
    );
    return !!row;
};

exports.up = async (db) => {
    // users: resume fields
    await addMissingColumns(db, 'users', [
        'resume_path TEXT',
        'resume_uploaded_at DATETIME'
    ]);

    // applications: snapshot + versioning + consent + withdrawal
    await addMissingColumns(db, 'applications', [
        'profile_snapshot TEXT',      // JSON frozen at first submit
        'answers_snapshot TEXT',       // JSON of custom-question answers
        'version INTEGER DEFAULT 1',
        'ai_consent_at DATETIME',
        'is_withdrawn INTEGER DEFAULT 0',
        'withdrawn_at DATETIME',
        'submitted_at DATETIME'
    ]);

    // seasons: per-season simultaneous limit
    await addMissingColumns(db, 'recruitment_seasons', [
        'simultaneous_app_limit INTEGER'   // NULL = no limit
    ]);

    // application_versions: one row per re-submit
    if (!(await tableExists(db, 'application_versions'))) {
        await new Promise((resolve, reject) =>
            db.run(`
                CREATE TABLE application_versions (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    application_id INTEGER NOT NULL REFERENCES applications(id),
                    version    INTEGER NOT NULL,
                    profile_snapshot TEXT,
                    answers_snapshot TEXT,
                    ai_consent_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, e => e ? reject(e) : resolve())
        );
    }
};

