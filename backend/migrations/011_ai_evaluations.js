/**
 * Migration 011 — Phase 6: AI Triage and Assistant
 *
 * Creates tables:
 *  - ai_evaluations: Application evaluation result (rubric breakdown, strengths, growth areas, interview questions, flags, tokens)
 *  - ai_usage_log: Token tracking and auditing for all AI feature invocations
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    await exec(`
        CREATE TABLE IF NOT EXISTS ai_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
            scores_json TEXT NOT NULL,
            total_score REAL NOT NULL,
            strengths_json TEXT NOT NULL,
            growth_areas_json TEXT NOT NULL,
            suggested_questions_json TEXT NOT NULL,
            flags_json TEXT DEFAULT '[]',
            summary TEXT,
            model TEXT NOT NULL,
            tokens_used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_evaluations_app ON ai_evaluations(application_id);

        CREATE TABLE IF NOT EXISTS ai_usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            feature TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user ON ai_usage_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature ON ai_usage_log(feature);
    `);

    const columns = await new Promise((resolve, reject) =>
        db.all('PRAGMA table_info(applications)', (e, rows) => e ? reject(e) : resolve(rows))
    );
    const existing = new Set(columns.map(r => r.name));
    if (!existing.has('ai_consent')) {
        await exec('ALTER TABLE applications ADD COLUMN ai_consent INTEGER DEFAULT 0');
    }
    await exec('UPDATE applications SET ai_consent = 1 WHERE ai_consent_at IS NOT NULL');
};
