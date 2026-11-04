const readline = require('readline/promises');
const { stdin, stdout } = require('process');
require('dotenv').config();
const { db } = require('./db');
const { runMigrations } = require('./migrationRunner');
const { createAdmin } = require('./createAdmin');

const promptFor = async (prompt, name, fallback) => fallback || (await prompt.question(`${name}: `)).trim();

const main = async () => {
    const prompt = readline.createInterface({ input: stdin, output: stdout });
    try {
        await runMigrations(db);
        const name = await promptFor(prompt, 'Admin name', process.env.ADMIN_NAME);
        const email = await promptFor(prompt, 'Admin email', process.env.ADMIN_EMAIL);
        const password = await promptFor(prompt, 'Admin password', process.env.ADMIN_PASSWORD);
        const id = await createAdmin(db, { name, email, password });
        console.log(`Admin account ${id} created.`);
    } finally {
        prompt.close();
        db.close();
    }
};

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { main };