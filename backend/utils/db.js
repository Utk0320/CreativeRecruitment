const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const REAL_DB = path.resolve(path.join(__dirname, '../database/creativerecruit.db'));
const dbPath = path.resolve(process.env.DATABASE_PATH || REAL_DB);

// Safety guard: tests must inject an in-memory DB via require.cache before loading
// this module, OR set DATABASE_PATH to a non-production path.  If they don't,
// the real database would be silently mutated.
if (process.env.NODE_ENV === 'test' && dbPath === REAL_DB) {
    throw new Error(
        'Tests must not use the real database.\n' +
        'Either set process.env.DATABASE_PATH to ":memory:" or a temp file,\n' +
        'or inject a fake DB into require.cache before requiring this module.'
    );
}

if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    } else {
        if (process.env.NODE_ENV !== 'test') {
            console.log('Connected to the SQLite database.');
        }
    }
});

module.exports = { db };
