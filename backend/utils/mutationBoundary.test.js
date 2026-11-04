const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every mutating route registers the shared transaction boundary', () => {
    const routesDirectory = path.resolve(__dirname, '../routes');
    const files = fs.readdirSync(routesDirectory).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'));
    const missing = [];

    for (const file of files) {
        const source = fs.readFileSync(path.join(routesDirectory, file), 'utf8');
        const declarations = source.match(/^\s*router\.(?:post|put|patch|delete)\([^\n]*/gm) || [];
        declarations.forEach((declaration, index) => {
            if (!declaration.includes('withTransaction(db,')) {
                missing.push(`${file}: mutation ${index + 1}`);
            }
        });
    }

    assert.deepEqual(missing, [], `Mutating routes missing withTransaction: ${missing.join(', ')}`);
});

test('transaction boundary writes an audit row before committing success', () => {
    const source = fs.readFileSync(path.join(__dirname, 'mutationBoundary.js'), 'utf8');
    assert.match(source, /await logActivity\(db, req/);
    assert.match(source, /await run\(db, 'COMMIT'/);
    assert.match(source, /await run\(db, 'ROLLBACK'/);
});