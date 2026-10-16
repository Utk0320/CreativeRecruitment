require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
    console.error('Development seed is disabled when NODE_ENV=production');
    process.exit(1);
}

const { db } = require('./db');
const { runMigrations } = require('./migrationRunner');

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const seed = async () => {
    await runMigrations(db);
    const existing = await get('SELECT COUNT(*) AS count FROM clubs');
    if (existing.count === 0) {
        for (const club of [
            ['GDSC', 'Technical', 'A community for students building with technology.'],
            ['Robocon Team Rudra', 'Core', 'A student robotics and engineering team.'],
            ['Kalangan', 'Extracurricular', 'A student-led cultural and arts club.']
        ]) {
            await run('INSERT INTO clubs (name, category, description) VALUES (?, ?, ?)', club);
        }
    }
    console.log('Development data is ready. No accounts or passwords were created.');
};

seed().catch(error => {
    console.error(`Development seed failed: ${error.message}`);
    process.exitCode = 1;
}).finally(() => db.close());