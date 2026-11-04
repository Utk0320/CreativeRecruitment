const addColumnIfMissing = async (db, table, column) => {
    const columns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (error, rows) => error ? reject(error) : resolve(rows));
    });
    if (columns.some(existing => existing.name === column)) return;
    await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} DATETIME`, error => error ? reject(error) : resolve());
    });
};

exports.up = async (db) => {
    await addColumnIfMissing(db, 'clubs', 'deleted_at');
    await addColumnIfMissing(db, 'recruitment_drives', 'deleted_at');
    await new Promise((resolve, reject) => {
        db.run('CREATE INDEX IF NOT EXISTS idx_drives_deadline_status ON recruitment_drives(status, deadline)', error => error ? reject(error) : resolve());
    });
};