const columnsByTable = {
    users: [
        'profile_picture_url TEXT',
        "skills TEXT DEFAULT '[]'",
        "interests TEXT DEFAULT '[]'",
        "projects TEXT DEFAULT '[]'",
        "achievements TEXT DEFAULT '[]'",
        'github_url TEXT',
        'linkedin_url TEXT'
    ],
    applications: ['notes TEXT DEFAULT \'\'']
};

const addMissingColumns = async (db, table, definitions) => {
    const columns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (error, rows) => error ? reject(error) : resolve(rows));
    });
    const existing = new Set(columns.map(column => column.name));
    for (const definition of definitions) {
        const column = definition.split(/\s+/, 1)[0];
        if (existing.has(column)) continue;
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`, error => error ? reject(error) : resolve());
        });
    }
};

exports.up = async (db) => {
    for (const [table, definitions] of Object.entries(columnsByTable)) {
        await addMissingColumns(db, table, definitions);
    }
};