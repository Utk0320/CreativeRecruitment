/**
 * Migration 008 — Slice 3B/3C: structured drive fields, state remap, drive Q&A
 *
 * - Adds new columns to recruitment_drives (idempotent ADD COLUMN)
 * - Remaps status: 'open' → 'published' (data-preserving)
 * - Creates drive_qa table
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

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, e => e ? reject(e) : resolve())
);

exports.up = async (db) => {
    // New columns on recruitment_drives
    await addMissingColumns(db, 'recruitment_drives', [
        'seats INTEGER',
        "required_skills TEXT DEFAULT '[]'",
        "preferred_skills TEXT DEFAULT '[]'",
        "allowed_years TEXT DEFAULT '[]'",
        "allowed_departments TEXT DEFAULT '[]'",
        'min_motivation_length INTEGER DEFAULT 0',
        "rubric TEXT DEFAULT '[]'",       // [{criterion,description,weight}]; weights must sum to 100
        "deal_breakers TEXT DEFAULT '[]'",
        "custom_questions TEXT DEFAULT '[]'", // [{id,type,prompt,options[],required}]
        "stages TEXT DEFAULT '[]'",
        'shareable_slug TEXT',
        'is_template INTEGER DEFAULT 0',
        'template_for_category TEXT'
    ]);

    // Remap status 'open' → 'published' (idempotent: check if already done)
    const openExists = await new Promise((resolve, reject) =>
        db.get("SELECT 1 AS n FROM recruitment_drives WHERE status='open' LIMIT 1",
            (e, r) => e ? reject(e) : resolve(r))
    );
    if (openExists) {
        await run(db, "UPDATE recruitment_drives SET status='published' WHERE status='open'");
    }

    // drive_qa table (3C)
    if (!(await tableExists(db, 'drive_qa'))) {
        await run(db, `
            CREATE TABLE drive_qa (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                drive_id      INTEGER NOT NULL REFERENCES recruitment_drives(id),
                student_id    INTEGER NOT NULL REFERENCES users(id),
                question      TEXT NOT NULL,
                answer        TEXT,
                answered_by   INTEGER REFERENCES users(id),
                asked_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                answered_at   DATETIME
            )
        `);
    }
};

