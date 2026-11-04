const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListOptions } = require('./listOptions');

test('list options enforce bounded page sizes and whitelisted sorting', () => {
    const options = parseListOptions({ page: '3', limit: '1000', sort: 'invalid', order: 'desc', search: '  club  ' }, { name: 'c.name' }, 'name');
    assert.equal(options.page, 3);
    assert.equal(options.limit, 100);
    assert.equal(options.offset, 200);
    assert.equal(options.sortField, 'c.name');
    assert.equal(options.direction, 'DESC');
    assert.equal(options.search, 'club');
});

test('invalid pagination input falls back to a bounded first page', () => {
    const options = parseListOptions({ page: '-1', limit: '0', search: 'x'.repeat(200) }, { id: 'id' }, 'id');
    assert.equal(options.page, 1);
    assert.equal(options.limit, 100);
    assert.equal(options.search.length, 100);
});