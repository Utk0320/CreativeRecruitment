/**
 * Migration 017 — AI Application Screening with Google Gemini
 *
 * Adds columns to applications:
 *  - ai_score: Weighted total screening score (0-100)
 *  - ai_skill_match: Skill match score (0-100, 40% weight)
 *  - ai_portfolio_relevance: Portfolio relevance score (0-100, 25% weight)
 *  - ai_experience: Relevant experience score (0-100, 20% weight)
 *  - ai_availability: Availability score (0-100, 15% weight)
 *  - ai_explanation: Short evaluation explanation
 *  - ai_strengths_json: JSON array of identified strengths
 *  - ai_missing_skills_json: JSON array of missing required skills
 *  - ai_needs_review: Flag indicating application needs manual coordinator review
 *  - ai_review_reason: Explanation if flagged for review (missing info, malformed output, API failure)
 *  - screening_status: 'pending', 'passed', 'rejected', 'needs_review'
 *  - ai_evaluated_at: Timestamp of AI screening evaluation
 *  - screening_threshold_used: Rejection threshold configured at time of evaluation (default 30)
 *  - manual_override: Flag indicating coordinator manual override (0 or 1)
 *  - override_reason: Note describing manual override
 *  - overridden_by: User ID of coordinator who performed override
 *  - overridden_at: Timestamp of manual override
 *
 * Adds columns to recruitment_drives:
 *  - screening_threshold: Configurable minimum score threshold (default 30.0)
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });

    // Check existing columns in applications
    const appColumns = await all(`PRAGMA table_info(applications)`);
    const appColSet = new Set(appColumns.map(c => c.name));

    const appColumnsToAdd = [
        { name: 'ai_score', type: 'REAL' },
        { name: 'ai_skill_match', type: 'REAL' },
        { name: 'ai_portfolio_relevance', type: 'REAL' },
        { name: 'ai_experience', type: 'REAL' },
        { name: 'ai_availability', type: 'REAL' },
        { name: 'ai_explanation', type: 'TEXT' },
        { name: 'ai_strengths_json', type: "TEXT DEFAULT '[]'" },
        { name: 'ai_missing_skills_json', type: "TEXT DEFAULT '[]'" },
        { name: 'ai_needs_review', type: 'INTEGER DEFAULT 0' },
        { name: 'ai_review_reason', type: 'TEXT' },
        { name: 'screening_status', type: "TEXT DEFAULT 'pending'" },
        { name: 'ai_evaluated_at', type: 'DATETIME' },
        { name: 'screening_threshold_used', type: 'REAL DEFAULT 30.0' },
        { name: 'manual_override', type: 'INTEGER DEFAULT 0' },
        { name: 'override_reason', type: 'TEXT' },
        { name: 'overridden_by', type: 'INTEGER REFERENCES users(id)' },
        { name: 'overridden_at', type: 'DATETIME' }
    ];

    for (const col of appColumnsToAdd) {
        if (!appColSet.has(col.name)) {
            await exec(`ALTER TABLE applications ADD COLUMN ${col.name} ${col.type};`);
        }
    }

    // Check existing columns in recruitment_drives
    const driveColumns = await all(`PRAGMA table_info(recruitment_drives)`);
    const driveColSet = new Set(driveColumns.map(c => c.name));

    if (!driveColSet.has('screening_threshold')) {
        await exec(`ALTER TABLE recruitment_drives ADD COLUMN screening_threshold REAL DEFAULT 30.0;`);
    }

    // Create indexes for fast querying and filtering
    await exec(`
        CREATE INDEX IF NOT EXISTS idx_applications_screening_status ON applications(screening_status);
        CREATE INDEX IF NOT EXISTS idx_applications_ai_score ON applications(ai_score);
    `);
};

exports.down = async () => {
    // SQLite doesn't drop columns easily without table rebuild, migrations leave columns in place
};

