const addColumnIfMissing = async (db, table, definition) => {
    const columns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (error, rows) => error ? reject(error) : resolve(rows));
    });
    const name = definition.split(/\s+/, 1)[0];
    if (columns.some(column => column.name === name)) return;
    await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`, error => error ? reject(error) : resolve());
    });
};

exports.up = async (db) => {
    for (const definition of [
        'is_active INTEGER NOT NULL DEFAULT 1',
        'token_version INTEGER NOT NULL DEFAULT 0',
        'must_change_password INTEGER NOT NULL DEFAULT 0',
        'email_verified_at DATETIME',
        'email_verification_token_hash TEXT',
        'email_verification_expires_at DATETIME',
        'password_reset_token_hash TEXT',
        'password_reset_expires_at DATETIME'
    ]) {
        await addColumnIfMissing(db, 'users', definition);
    }

    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS coordinator_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            department TEXT,
            year INTEGER,
            phone TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`, error => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS refresh_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME,
            replaced_by_hash TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, error => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run('CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(is_active, role)', error => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run('CREATE INDEX IF NOT EXISTS idx_coordinator_invites_email ON coordinator_invites(email, expires_at)', error => error ? reject(error) : resolve());
    });
};