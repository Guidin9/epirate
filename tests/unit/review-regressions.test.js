'use strict';
// Bağımsız kod incelemesinde bulunan hatalar için regresyon testleri.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const { createResolver } = require(path.join(SHARED, 'resolver.js'));
const { createCache, createMemoryStorage } = require(path.join(SHARED, 'cache.js'));
const { createImdbClient, ImdbError } = require(path.join(SHARED, 'imdb.js'));
const H = require('./helpers/imdb-fixtures.js');

const HOUR = 3600 * 1000;
const GT_2016 = 'tt5712554';
const GT_2026 = 'tt44974627';

function setup({ db = H.buildRealDb(), client, now } = {}) {
  const storage = createMemoryStorage();
  const cacheOpts = { storage };
  const resolverOpts = {};
  if (now) { cacheOpts.now = now; resolverOpts.now = now; }
  const fake = client || H.createFakeClient(db);
  return { storage, client: fake, resolver: createResolver({ client: fake, cache: createCache(cacheOpts), ...resolverOpts }) };
}

test('hatırlanan eşleşme, sayfanın yıl/puan ipuçlarıyla çelişirse kullanılmaz (Grand Tour 2016 → 2026)', async () => {
  const { resolver } = setup();
  const old = await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { year: 2016, primeRating: 8.7 } });
  assert.equal(old.show.id, GT_2016);
  const fresh = await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { year: 2026, primeRating: 8.2 } });
  assert.equal(fresh.show.id, GT_2026);
  const list = await resolver.resolveSeason({ title: 'The Grand Tour', season: 1, hints: { year: 2026, primeRating: 8.2 } });
  assert.equal(list.show.id, GT_2026);
});

test('yalnızca Prime puanı farklı olsa da hatırlanan eşleşme kazanmaz', async () => {
  const { resolver } = setup();
  assert.equal((await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { primeRating: 8.7 } })).show.id, GT_2016);
  assert.equal((await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { primeRating: 8.2 } })).show.id, GT_2026);
});

test('ipucu yokken hatırlanan eşleşme korunur (kararlılık)', async () => {
  const { resolver } = setup();
  const first = await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { year: 2016, primeRating: 8.7 } });
  const again = await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 2 });
  assert.equal(again.show.id, first.show.id);
});

test('yedek adaydaki hata, bulunmuş eşleşmeyi bozmaz', async () => {
  const db = H.buildRealDb();
  db.seasonOverride = (id, season, result) => {
    if (id === GT_2016) throw new ImdbError('blocked', 'HTTP 429');
    return result;
  };
  const { resolver } = setup({ db });
  const r = await resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1 });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, GT_2026);
});

test('ilk adaydaki hata, bölümü içeren sonraki adayın bulunmasını engellemez', async () => {
  const db = H.buildRealDb();
  db.seasonOverride = (id, season, result) => {
    if (id === GT_2026) throw new ImdbError('timeout', 'zaman aşımı');
    return result;
  };
  const { resolver } = setup({ db });
  const r = await resolver.resolve({ title: 'The Grand Tour', season: 3, episode: 1 });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, GT_2016);
});

test('hiçbir aday okunamazsa "bölüm yok" yerine hata fırlatılır', async () => {
  const db = H.buildRealDb();
  db.seasonOverride = () => { throw new ImdbError('timeout', 'zaman aşımı'); };
  const { resolver } = setup({ db });
  await assert.rejects(resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1 }), (e) => e.code === 'timeout');
  await assert.rejects(resolver.resolveSeason({ title: 'The Grand Tour', season: 1 }), (e) => e.code === 'timeout');
});

test('arama başarısız olsa da hatırlanan eşleşmeyle devam edilir', async () => {
  const db = H.buildRealDb();
  const base = H.createFakeClient(db);
  let failSearch = false;
  const client = Object.assign({}, base, {
    async search(q) {
      if (failSearch) throw new ImdbError('network', 'ağ yok');
      return base.search(q);
    },
  });
  const storage = createMemoryStorage();
  const cache = createCache({ storage });
  const resolver = createResolver({ client, cache });
  await resolver.resolve({ title: 'The Boys', season: 1, episode: 1 });
  // Arama önbelleğini boşalt, eşleşme hafızası kalsın.
  for (const k of Object.keys(storage.data)) if (k.startsWith('cache:s:')) delete storage.data[k];
  const fresh = createResolver({ client, cache: createCache({ storage }) });
  failSearch = true;
  const r = await fresh.resolve({ title: 'The Boys', season: 1, episode: 2 });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, 'tt1190634');
});

test('önbellek süreleri: boş sezon 1 sa, eski sezon 12 sa', async () => {
  const now = () => Date.parse('2026-10-09T12:00:00Z');
  const { resolver, storage } = setup({ now });
  const empty = await resolver.resolve({ title: 'The Boys', season: 9, episode: 1 });
  assert.equal(empty.status, 'episode-not-found');
  const e = storage.data['cache:season:tt1190634:9'];
  assert.equal(e.expires - e.saved, 1 * HOUR);
  await resolver.resolve({ title: 'The Boys', season: 1, episode: 1 });
  const s1 = storage.data['cache:season:tt1190634:1'];
  assert.equal(s1.expires - s1.saved, 12 * HOUR);
});

test('film: ilk adayın IMDb kaydı yoksa sıradaki aday kullanılır', async () => {
  const sugg = (id, year, rank) => ({ id, title: 'Twin Film', type: 'movie', typeLabel: 'feature', year, rank });
  const db = {
    suggestions: { [H.searchKey('Twin Film')]: [sugg('tt9500001', 2020, 100), sugg('tt9500002', 2020, 200)] },
    shows: { tt9500002: { show: { id: 'tt9500002', name: 'Twin Film', originalName: 'Twin Film', type: 'movie', year: 2020, endYear: null, rating: 6.9, votes: 1200 }, seasons: [], episodes: [] } },
  };
  const base = H.createFakeClient(db);
  const client = Object.assign({}, base, {
    async getTitle(id) {
      if (id === 'tt9500001') throw new ImdbError('not-found', 'kayıt yok');
      return base.getTitle(id);
    },
  });
  const { resolver } = setup({ client });
  const r = await resolver.resolve({ title: 'Twin Film' });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, 'tt9500002');
});

test('GraphQL yanıtındaki eksik (null) bölüm kayıtları atlanır, sezon yine okunur', async () => {
  const body = JSON.parse(JSON.stringify(H.loadFixture('gql-the-boys-s1.json')));
  const conn = body.data.title.episodes.episodes;
  const realCount = conn.edges.length;
  conn.edges.splice(1, 0, null, { node: null });
  if (body.data.title.episodes.displayableSeasons) body.data.title.episodes.displayableSeasons.edges.push(null);
  const fake = H.createFakeFetch(() => H.jsonResponse(body));
  const r = await createImdbClient({ fetch: fake.fetch }).getSeason('tt1190634', 1);
  assert.equal(r.episodes.length, realCount);
  assert.ok(r.episodes.every((e) => /^tt\d+$/.test(e.id)));
});
