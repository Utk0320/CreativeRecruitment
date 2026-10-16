/**
 * Migration 016 — Phase 10: Analytics, Privacy, and Platform
 *
 * Creates tables:
 *  - data_deletion_requests: Right-to-be-forgotten / profile anonymization requests
 *  - data_retention_policies: Configurable retention windows per entity type
 *  - data_retention_logs: Audit log of automated and manual retention purges
 *
 * Extends tables:
 *  - recruitment_drives: archived_at DATETIME
 *  - users: is_anonymized INTEGER DEFAULT 0
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });
    const run = (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });

    await exec(`
        -- 1. Student Data Deletion / Anonymization Requests
        CREATE TABLE IF NOT EXISTS data_deletion_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed'
            reason TEXT,
            admin_notes TEXT,
            reviewed_by INTEGER REFERENCES users(id),
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_deletion_req_user ON data_deletion_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_deletion_req_status ON data_deletion_requests(status);

        -- 2. Data Retention Policies
        CREATE TABLE IF NOT EXISTS data_retention_policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL UNIQUE, -- 'notifications', 'support_tickets', 'audit_archives'
            retention_days INTEGER NOT NULL DEFAULT 90,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_purged_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 3. Data Retention Execution Logs
        CREATE TABLE IF NOT EXISTS data_retention_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            records_purged INTEGER NOT NULL DEFAULT 0,
            purged_by INTEGER REFERENCES users(id),
            purged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_retention_entity ON data_retention_logs(entity_type);
    `);

    // Safely add columns to recruitment_drives
    const driveColumns = await all(`PRAGMA table_info(recruitment_drives)`);
    const hasArchivedAt = driveColumns.some(c => c.name === 'archived_at');
    if (!hasArchivedAt) {
        await exec(`ALTER TABLE recruitment_drives ADD COLUMN archived_at DATETIME;`);
    }

    // Safely add columns to users
    const userColumns = await all(`PRAGMA table_info(users)`);
    const hasIsAnonymized = userColumns.some(c => c.name === 'is_anonymized');
    if (!hasIsAnonymized) {
        await exec(`ALTER TABLE users ADD COLUMN is_anonymized INTEGER DEFAULT 0;`);
    }

    // Seed default retention policies if none exist
    const existingPolicies = await all(`SELECT entity_type FROM data_retention_policies`);
    const policyTypes = existingPolicies.map(p => p.entity_type);

    if (!policyTypes.includes('notifications')) {
        await run(`INSERT INTO data_retention_policies (entity_type, retention_days, is_active) VALUES ('notifications', 90, 1)`);
    }
    if (!policyTypes.includes('support_tickets')) {
        await run(`INSERT INTO data_retention_policies (entity_type, retention_days, is_active) VALUES ('support_tickets', 365, 1)`);
    }
    if (!policyTypes.includes('archived_drives')) {
        await run(`INSERT INTO data_retention_policies (entity_type, retention_days, is_active) VALUES ('archived_drives', 730, 1)`);
    }
};

exports.down = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    await exec(`
        DROP TABLE IF EXISTS data_retention_logs;
        DROP TABLE IF EXISTS data_retention_policies;
        DROP TABLE IF EXISTS data_deletion_requests;
    `);
};

