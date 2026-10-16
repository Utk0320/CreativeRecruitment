require('dotenv').config();
const { db } = require('./utils/db');
const { runMigrations } = require('./utils/migrationRunner');

runMigrations(db)
    .then(() => console.log('Database migrations are up to date.'))
    .catch(error => {
        console.error(`Migration failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => db.close());