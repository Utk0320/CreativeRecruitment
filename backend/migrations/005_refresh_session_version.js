exports.up = async (db) => {
    const columns = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(refresh_sessions)', (error, rows) => error ? reject(error) : resolve(rows));
    });
    if (columns.some(column => column.name === 'token_version')) return;
    await new Promise((resolve, reject) => {
        db.run('ALTER TABLE refresh_sessions ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0', error => error ? reject(error) : resolve());
    });
};