const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database', 'creativerecruit.db');
const db = new sqlite3.Database(dbPath);

const columnsToAdd = [
    'profile_picture_url TEXT',
    'skills TEXT DEFAULT "[]"',
    'interests TEXT DEFAULT "[]"',
    'projects TEXT DEFAULT "[]"',
    'achievements TEXT DEFAULT "[]"',
    'github_url TEXT',
    'linkedin_url TEXT'
];

const applicationColumnsToAdd = ['notes TEXT DEFAULT ""'];

db.serialize(() => {
    columnsToAdd.forEach(col => {
        const colName = col.split(' ')[0];
        db.run(`ALTER TABLE users ADD COLUMN ${col}`, (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log(`Column ${colName} already exists.`);
                } else {
                    console.error(`Error adding ${colName}:`, err.message);
                }
            } else {
                console.log(`Added column ${colName}`);
            }
        });
    });

    applicationColumnsToAdd.forEach(col => {
        const colName = col.split(' ')[0];
        db.run(`ALTER TABLE applications ADD COLUMN ${col}`, (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log(`Column ${colName} already exists.`);
                } else {
                    console.error(`Error adding ${colName}:`, err.message);
                }
            } else {
                console.log(`Added column ${colName}`);
            }
        });
    });
});

db.close(() => {
    console.log('Migration completed.');
});
