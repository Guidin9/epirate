'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const C = require(path.join(SHARED, 'cache.js'));
const { createMemoryStorage, createCache, createDeduper, HOUR, DAY } = C;

test('HOUR and DAY in milliseconds', () => {
  assert.equal(HOUR, 60 * 60 * 1000);
  assert.equal(DAY, 24 * 60 * 60 * 1000);
});

// ----------------------------------------------------------------------------------
test('memory storage: async chrome.storage.local-like get/set/remove', async () => {
  const s = createMemoryStorage({ a: 1 });
  const pending = s.get(null);
  assert.equal(typeof pending.then, 'function', 'get() returns a promise');
  assert.deepEqual(await pending, { a: 1 });
  assert.deepEqual(await s.get('a'), { a: 1 });
  assert.deepEqual(await s.get(['a', 'missing']), { a: 1 });
  assert.deepEqual(await s.get('missing'), {});

  await s.set({ b: { x: [1, 2] }, c: 'z' });
  assert.deepEqual(await s.get(null), { a: 1, b: { x: [1, 2] }, c: 'z' });
  assert.deepEqual(await s.get(['b', 'c']), { b: { x: [1, 2] }, c: 'z' });
  assert.ok('b' in s.data, '`data` exposes the stored keys');

  await s.set({ c: 'overwritten' });
  assert.deepEqual(await s.get('c'), { c: 'overwritten' });

  await s.remove('a');
  assert.deepEqual(await s.get(null), { b: { x: [1, 2] }, c: 'overwritten' });
  await s.remove(['b', 'c', 'never-existed']);
  assert.deepEqual(await s.get(null), {});
  assert.ok(!('b' in s.data));
});

test('memory storage: values are deep-copied on set and get', async () => {
  const s = createMemoryStorage();
  const original = { nested: { n: 1 }, list: [1] };
  await s.set({ k: original });
  original.nested.n = 2;
  original.list.push(2);
  const read = await s.get('k');
  assert.deepEqual(read.k, { nested: { n: 1 }, list: [1] });
  read.k.nested.n = 3;
  assert.deepEqual((await s.get('k')).k, { nested: { n: 1 }, list: [1] });
  const all = await s.get(null);
  all.k.nested.n = 4;
  assert.deepEqual((await s.get('k')).k, { nested: { n: 1 }, list: [1] });
});

// ----------------------------------------------------------------------------------
function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

test('cache: set stores { value, saved, expires } under prefix+key', async () => {
  const storage = createMemoryStorage();
  const c = clock();
  const cache = createCache({ storage, now: c.now });
  await cache.set('k', { v: 1 }, 5000);
  const raw = (await storage.get('cache:k'))['cache:k'];
  assert.deepEqual(raw.value, { v: 1 });
  assert.equal(raw.saved, 1_000_000);
  assert.equal(raw.expires, 1_005_000);

  const custom = createCache({ storage, prefix: 'x:', now: c.now });
  await custom.set('k', 'other', 1000);
  assert.equal((await storage.get('x:k'))['x:k'].value, 'other');
  assert.deepEqual(await cache.get('k'), { v: 1 });
  assert.equal(await custom.get('k'), 'other');
});

test('cache: get returns value until expiry, then undefined and removes the entry', async () => {
  const storage = createMemoryStorage();
  const c = clock();
  const cache = createCache({ storage, now: c.now });
  await cache.set('k', [1, 2, 3], HOUR);
  c.t += HOUR - 1;
  assert.deepEqual(await cache.get('k'), [1, 2, 3]);
  c.t += 2;
  assert.equal(await cache.get('k'), undefined);
  assert.deepEqual(await storage.get('cache:k'), {}, 'expired entry removed from storage');
  assert.equal(await cache.get('never-set'), undefined);
});

test('cache: ttl 0 or absent never expires', async () => {
  const storage = createMemoryStorage();
  const c = clock();
  const cache = createCache({ storage, now: c.now });
  await cache.set('a', 'A');
  await cache.set('b', 'B', 0);
  c.t += 3650 * DAY;
  assert.equal(await cache.get('a'), 'A');
  assert.equal(await cache.get('b'), 'B');
});

test('cache: falsy values are real hits', async () => {
  const cache = createCache({ storage: createMemoryStorage(), now: clock().now });
  for (const [key, value] of [['zero', 0], ['false', false], ['empty', ''], ['null', null]]) {
    await cache.set(key, value, HOUR);
    assert.equal(await cache.get(key), value, key);
  }
});

test('cache: remove deletes one entry', async () => {
  const storage = createMemoryStorage();
  const cache = createCache({ storage, now: clock().now });
  await cache.set('a', 1, HOUR);
  await cache.set('b', 2, HOUR);
  await cache.remove('a');
  assert.equal(await cache.get('a'), undefined);
  assert.equal(await cache.get('b'), 2);
});

test('cache: clear removes only prefixed keys and returns the count', async () => {
  const storage = createMemoryStorage({ settings: { size: 'l' }, overrides: { x: 1 } });
  const cache = createCache({ storage, now: clock().now });
  await cache.set('a', 1, HOUR);
  await cache.set('b', 2);
  await storage.set({ 'other:c': 3 });
  assert.equal(await cache.clear(), 2);
  assert.deepEqual(await storage.get(null), { settings: { size: 'l' }, overrides: { x: 1 }, 'other:c': 3 });
});

test('cache: prune removes expired entries, then the oldest (by saved) beyond maxEntries', async () => {
  const now = 100_000;
  const live = (saved) => ({ value: saved, saved, expires: now + 10 * DAY });
  const storage = createMemoryStorage({
    settings: { mode: 'always' },
    'cache:expired1': { value: 1, saved: 10_000, expires: 20_000 },
    'cache:expired2': { value: 2, saved: 90_000, expires: 99_999 },
    // keys deliberately not in age order
    'cache:z': live(20_000),
    'cache:a': live(50_000),
    'cache:y': live(30_000),
    'cache:b': live(60_000),
    'cache:x': live(40_000),
  });
  const cache = createCache({ storage, maxEntries: 3, now: () => now });
  const removed = await cache.prune();
  assert.equal(removed, 4);
  assert.deepEqual(Object.keys(await storage.get(null)).sort(), ['cache:a', 'cache:b', 'cache:x', 'settings']);
});

test('cache: default prefix "cache:" and default maxEntries 400', async () => {
  const now = 1_000_000;
  const initial = {};
  for (let i = 0; i < 403; i++) initial[`cache:k${i}`] = { value: i, saved: 1000 + i, expires: now + DAY };
  const storage = createMemoryStorage(initial);
  const cache = createCache({ storage, now: () => now });
  assert.equal(await cache.prune(), 3);
  const left = Object.keys(await storage.get(null));
  assert.equal(left.length, 400);
  for (const gone of ['cache:k0', 'cache:k1', 'cache:k2']) assert.ok(!left.includes(gone), `${gone} (oldest) should be pruned`);
});

test('cache: prune with nothing to do returns 0', async () => {
  const cache = createCache({ storage: createMemoryStorage(), maxEntries: 10, now: clock().now });
  await cache.set('a', 1, HOUR);
  assert.equal(await cache.prune(), 0);
  assert.equal(await cache.get('a'), 1);
});

// ----------------------------------------------------------------------------------
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('dedupe: concurrent calls with the same key share one run', async () => {
  const dedupe = createDeduper();
  let runs = 0;
  const d = deferred();
  const fn = () => {
    runs++;
    return d.promise;
  };
  const p1 = dedupe('k', fn);
  const p2 = dedupe('k', fn);
  const p3 = dedupe('k', fn);
  d.resolve(42);
  assert.deepEqual(await Promise.all([p1, p2, p3]), [42, 42, 42]);
  assert.equal(runs, 1);
  // after settling, a new call runs fn again
  assert.equal(await dedupe('k', async () => (runs++, 7)), 7);
  assert.equal(runs, 2);
});

test('dedupe: different keys run separately', async () => {
  const dedupe = createDeduper();
  let runs = 0;
  const results = await Promise.all([dedupe('a', async () => (runs++, 'A')), dedupe('b', async () => (runs++, 'B'))]);
  assert.deepEqual(results, ['A', 'B']);
  assert.equal(runs, 2);
});

test('dedupe: a rejection is shared and does not stick', async () => {
  const dedupe = createDeduper();
  let runs = 0;
  const d = deferred();
  const fn = () => {
    runs++;
    return d.promise;
  };
  const p1 = dedupe('k', fn);
  const p2 = dedupe('k', fn);
  d.reject(new Error('boom'));
  await assert.rejects(p1, /boom/);
  await assert.rejects(p2, /boom/);
  assert.equal(runs, 1);
  assert.equal(await dedupe('k', async () => (runs++, 'ok')), 'ok');
  assert.equal(runs, 2);
});
