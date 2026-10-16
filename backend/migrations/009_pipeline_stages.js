/**
 * Migration 009 — Phase 4: Pipeline stages, outcome & offer tracking
 *
 * Adds:
 *  applications:
 *   - current_stage_id (TEXT DEFAULT 'screening')
 *   - outcome (TEXT DEFAULT 'Pending')
 *   - offer_state (TEXT DEFAULT 'None')
 *   - rejection_reason_code (TEXT)
 *   - rejection_feedback (TEXT)
 *   - decision_date (DATETIME)
 *  recruitment_drives:
 *   - expected_decision_date (DATETIME)
 *
 * Backfills existing applications and drives.
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

const DEFAULT_STAGES_JSON = JSON.stringify([
    { id: 'screening', name: 'Screening', order: 1 },
    { id: 'task',      name: 'Task',      order: 2 },
    { id: 'interview', name: 'Interview', order: 3 },
    { id: 'final',     name: 'Final',     order: 4 }
]);

exports.up = async (db) => {
    // 1. Add columns to applications
    await addMissingColumns(db, 'applications', [
        "current_stage_id TEXT DEFAULT 'screening'",
        "outcome TEXT DEFAULT 'Pending'",
        "offer_state TEXT DEFAULT 'None'",
        "rejection_reason_code TEXT",
        "rejection_feedback TEXT",
        "decision_date DATETIME"
    ]);

    // 2. Add columns to recruitment_drives
    await addMissingColumns(db, 'recruitment_drives', [
        "expected_decision_date DATETIME"
    ]);

    // 3. Backfill default stages on drives where stages is empty or null
    await run(db, `
        UPDATE recruitment_drives
        SET stages = ?
        WHERE stages IS NULL OR stages = '' OR stages = '[]'
    `, [DEFAULT_STAGES_JSON]);

    // 4. Backfill application outcomes and stages based on legacy status and is_withdrawn
    await run(db, `
        UPDATE applications
        SET outcome = 'Withdrawn'
        WHERE is_withdrawn = 1
    `);

    await run(db, `
        UPDATE applications
        SET current_stage_id = 'final', outcome = 'Selected'
        WHERE is_withdrawn = 0 AND status = 'Selected' AND (outcome IS NULL OR outcome = 'Pending')
    `);

    await run(db, `
        UPDATE applications
        SET current_stage_id = 'screening', outcome = 'Rejected', rejection_reason_code = 'other'
        WHERE is_withdrawn = 0 AND status = 'Rejected' AND (outcome IS NULL OR outcome = 'Pending')
    `);

    await run(db, `
        UPDATE applications
        SET current_stage_id = 'interview', outcome = 'Advanced'
        WHERE is_withdrawn = 0 AND status = 'Shortlisted' AND (outcome IS NULL OR outcome = 'Pending')
    `);

    await run(db, `
        UPDATE applications
        SET current_stage_id = 'screening', outcome = 'Pending'
        WHERE is_withdrawn = 0 AND (status = 'Under Review' OR status = 'Applied') AND (outcome IS NULL)
    `);
};

