const fs = require('fs');
const path = require('path');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, error => error ? reject(error) : resolve());
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const runMigrations = async (db) => {
    await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const directory = path.resolve(__dirname, '../migrations');
    const files = fs.readdirSync(directory).filter(file => /^\d{3}_.+\.js$/.test(file)).sort();

    for (const file of files) {
        if (await get(db, 'SELECT name FROM schema_migrations WHERE name = ?', [file])) continue;
        const migration = require(path.join(directory, file));
        await run(db, 'BEGIN IMMEDIATE');
        try {
            await migration.up(db);
            await run(db, 'INSERT INTO schema_migrations (name) VALUES (?)', [file]);
            await run(db, 'COMMIT');
        } catch (error) {
            await run(db, 'ROLLBACK');
            throw error;
        }
    }
};

module.exports = { runMigrations };