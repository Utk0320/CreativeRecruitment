const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { runMigrations } = require('./migrationRunner');
const { withTransaction } = require('./mutationBoundary');

const db = new sqlite3.Database(':memory:');
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const app = express();
app.use(express.json());
app.post('/clubs/:id', withTransaction(db, 'club.updated', 'club'), (req, res) => {
    db.run('UPDATE clubs SET name = ? WHERE id = ?', [req.body.name, req.params.id], error => {
        if (error) return res.status(500).json({ error: 'write failed' });
        req.activityClubId = Number(req.params.id);
        res.json({ saved: true });
    });
});
app.post('/reject/:id', withTransaction(db, 'club.rejected', 'club'), (req, res) => {
    db.run('UPDATE clubs SET name = ? WHERE id = ?', ['Must roll back', req.params.id], error => {
        if (error) return res.status(500).json({ error: 'write failed' });
        res.status(422).json({ error: 'rejected' });
    });
});

test('successful mutation commits its change and activity record atomically', async () => {
    await runMigrations(db);
    await run("INSERT INTO clubs (id, name) VALUES (1, 'Before')");
    const response = await request(app).post('/clubs/1').send({ name: 'After' });
    assert.equal(response.status, 200);
    assert.equal((await get('SELECT name FROM clubs WHERE id = 1')).name, 'After');
    const activity = await get("SELECT action, entity_type, entity_id, club_id FROM activity_log");
    assert.deepEqual(activity, {
        action: 'club.updated',
        entity_type: 'club',
        entity_id: 1,
        club_id: 1
    });
});

test('rejected mutation rolls back both data and activity record', async () => {
    const response = await request(app).post('/reject/1');
    assert.equal(response.status, 422);
    assert.equal(response.body.error, 'rejected');
    assert.equal((await get('SELECT name FROM clubs WHERE id = 1')).name, 'After');
    assert.equal((await get('SELECT COUNT(*) AS count FROM activity_log')).count, 1);
});

test('activity log rows cannot be updated or deleted', async () => {
    await assert.rejects(run("UPDATE activity_log SET action = 'forged' WHERE id = 1"), /append-only/);
    await assert.rejects(run('DELETE FROM activity_log WHERE id = 1'), /append-only/);
});

test.after(() => new Promise(resolve => db.close(resolve)));
