const statements = [
    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL, department TEXT, year INTEGER,
        phone TEXT, portfolio_url TEXT, bio TEXT, profile_picture_url TEXT,
        skills TEXT DEFAULT '[]', interests TEXT DEFAULT '[]', projects TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]', github_url TEXT, linkedin_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS clubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT,
        description TEXT, logo_url TEXT, coordinator_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coordinator_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS recruitment_drives (
        id INTEGER PRIMARY KEY AUTOINCREMENT, club_id INTEGER, title TEXT NOT NULL,
        description TEXT, eligibility TEXT, open_date TEXT, deadline TEXT, status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (club_id) REFERENCES clubs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT, drive_id INTEGER, student_id INTEGER,
        portfolio_url TEXT, motivation TEXT, skills TEXT, experience TEXT,
        status TEXT DEFAULT 'Applied', notes TEXT DEFAULT '',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (drive_id) REFERENCES recruitment_drives(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT NOT NULL,
        message TEXT, type TEXT, is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`
];

exports.up = async (db) => {
    for (const statement of statements) {
        await new Promise((resolve, reject) => db.run(statement, error => error ? reject(error) : resolve()));
    }
};