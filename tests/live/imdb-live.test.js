'use strict';
// Live tests: real IMDb services through createImdbClient + createResolver.
// Run: node --test "tests/live/**/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const { createImdbClient, GRAPHQL_HOSTS } = require(path.join(SHARED, 'imdb.js'));
const { createResolver } = require(path.join(SHARED, 'resolver.js'));
const { createCache, createMemoryStorage } = require(path.join(SHARED, 'cache.js'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const TIMEOUT = 30_000;

/** fetch that adds a desktop Chrome User-Agent (IMDb rejects Node's default UA). */
function browserFetch(log) {
  return (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('user-agent', UA);
    if (log) log.push(String(input));
    return fetch(input, { ...init, headers });
  };
}

function makeResolver() {
  const client = createImdbClient({ fetch: browserFetch(), timeoutMs: 15_000 });
  const cache = createCache({ storage: createMemoryStorage() });
  return createResolver({ client, cache });
}

test('live: "The Boys" S1E3 -> tt8100948 "Get Some" with a rating', { timeout: TIMEOUT }, async () => {
  const r = await makeResolver().resolve({ title: 'The Boys', season: 1, episode: 3 });
  assert.equal(r.status, 'ok', JSON.stringify({ status: r.status, show: r.show && r.show.id }));
  assert.equal(r.show.id, 'tt1190634');
  assert.equal(r.episode.id, 'tt8100948');
  assert.equal(r.episode.title, 'Get Some');
  assert.equal(typeof r.episode.rating, 'number');
  assert.ok(r.episode.rating >= 1 && r.episode.rating <= 10, String(r.episode.rating));
});

test('live: Turkish title "Yüzüklerin Efendisi: Güç Yüzükleri" S2E1 -> tt7631058', { timeout: TIMEOUT }, async () => {
  const r = await makeResolver().resolve({ title: 'Yüzüklerin Efendisi: Güç Yüzükleri', season: 2, episode: 1 });
  assert.equal(r.show && r.show.id, 'tt7631058', JSON.stringify({ status: r.status, show: r.show && r.show.id }));
  assert.equal(r.status, 'ok');
  assert.equal(r.season, 2);
  assert.equal(r.episode.episode, 1);
});

test('live: "The Grand Tour" S3E1 -> tt5712554', { timeout: TIMEOUT }, async () => {
  const r = await makeResolver().resolve({ title: 'The Grand Tour', season: 3, episode: 1 });
  assert.equal(r.show && r.show.id, 'tt5712554', JSON.stringify({ status: r.status, show: r.show && r.show.id }));
  assert.equal(r.status, 'ok');
  assert.equal(r.episode.season, 3);
  assert.equal(r.episode.episode, 1);
});

test('live: "Saltburn" movie -> tt17351924', { timeout: TIMEOUT }, async () => {
  const r = await makeResolver().resolve({ title: 'Saltburn' });
  assert.equal(r.kind, 'movie');
  assert.equal(r.show && r.show.id, 'tt17351924');
  assert.equal(r.status, 'ok');
  assert.equal(typeof r.show.rating, 'number');
});

test('live: resolveSeason("The Boys", 1) -> 8 episodes with numeric ratings', { timeout: TIMEOUT }, async () => {
  const r = await makeResolver().resolveSeason({ title: 'The Boys', season: 1 });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, 'tt1190634');
  assert.equal(r.episodes.length, 8);
  for (const e of r.episodes) {
    assert.equal(typeof e.rating, 'number', `${e.id} rating`);
    assert.ok(e.rating >= 1 && e.rating <= 10, `${e.id} rating ${e.rating}`);
  }
});

for (const host of GRAPHQL_HOSTS) {
  test(`live: GraphQL host ${host} answers getTitle('tt1190634')`, { timeout: TIMEOUT }, async () => {
    // Every other host fails like a network error, so the client must use this one.
    const log = [];
    const real = browserFetch(log);
    const onlyThisHost = (input, init) => {
      const u = String(input);
      if (GRAPHQL_HOSTS.some((h) => u.startsWith(h)) && !u.startsWith(host)) return Promise.reject(new TypeError(`blocked by test: ${u}`));
      return real(input, init);
    };
    const client = createImdbClient({ fetch: onlyThisHost, timeoutMs: 15_000, retries: 0 });
    const show = await client.getTitle('tt1190634');
    assert.equal(show.id, 'tt1190634');
    assert.equal(show.name, 'The Boys');
    assert.equal(typeof show.rating, 'number');
    assert.ok(show.votes > 100000, String(show.votes));
    assert.ok(log.some((u) => u.startsWith(host)), `request went to ${host}: ${JSON.stringify(log)}`);
  });
}
