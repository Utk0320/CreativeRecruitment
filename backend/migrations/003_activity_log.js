exports.up = async (db) => {
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id INTEGER,
            actor_role TEXT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            club_id INTEGER,
            ip TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, error => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run(`CREATE TRIGGER IF NOT EXISTS activity_log_no_update
            BEFORE UPDATE ON activity_log BEGIN
                SELECT RAISE(ABORT, 'activity_log is append-only');
            END`, error => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run(`CREATE TRIGGER IF NOT EXISTS activity_log_no_delete
            BEFORE DELETE ON activity_log BEGIN
                SELECT RAISE(ABORT, 'activity_log is append-only');
            END`, error => error ? reject(error) : resolve());
    });
};