const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require('./migrationRunner');
const { createAdmin } = require('./createAdmin');

test('first admin is explicit, college-scoped, and audited', async () => {
    const db = new sqlite3.Database(':memory:');
    await runMigrations(db);
    const id = await createAdmin(db, {
        name: 'First Admin',
        email: 'admin@mmcoe.edu.in',
        password: 'A-unique-admin-password-2026'
    });
    const user = await new Promise((resolve, reject) => db.get('SELECT role, is_active, email_verified_at FROM users WHERE id = ?', [id], (error, row) => error ? reject(error) : resolve(row)));
    const log = await new Promise((resolve, reject) => db.get('SELECT action, entity_id FROM activity_log WHERE actor_id = ?', [id], (error, row) => error ? reject(error) : resolve(row)));
    assert.equal(user.role, 'admin');
    assert.equal(user.is_active, 1);
    assert.ok(user.email_verified_at);
    assert.deepEqual(log, { action: 'admin.bootstrap.created', entity_id: id });
    await new Promise(resolve => db.close(resolve));
});

test('admin creation rejects missing/default-quality credentials', async () => {
    const db = new sqlite3.Database(':memory:');
    await runMigrations(db);
    await assert.rejects(createAdmin(db, { name: 'Admin', email: 'admin@example.com', password: 'password123' }));
    await new Promise(resolve => db.close(resolve));
});