const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

test('development seed exits before database access in production', () => {
    const result = spawnSync(process.execPath, ['utils/seedDev.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'production' },
        encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /disabled when NODE_ENV=production/);
});