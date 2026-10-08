'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const { createResolver } = require(path.join(SHARED, 'resolver.js'));
const { createCache, createMemoryStorage } = require(path.join(SHARED, 'cache.js'));
const { normalizeTitle } = require(path.join(SHARED, 'parse.js'));
const H = require('./helpers/imdb-fixtures.js');

const EPISODIC = new Set(['tvSeries', 'tvMiniSeries']);
const MOVIE = new Set(['movie', 'tvMovie', 'video', 'tvSpecial', 'tvShort', 'short']);
const url = (id) => `https://www.imdb.com/title/${id}/`;
const BOYS_S1_IDS = ['tt7775902', 'tt8100946', 'tt8100948', 'tt8100950', 'tt8100952', 'tt8100954', 'tt8100956', 'tt8100958'];
const BOYS_S3_IDS = ['tt12312450', 'tt13609680', 'tt13707622', 'tt14048850', 'tt14075350', 'tt14143312', 'tt14246406', 'tt14268898'];

function setup({ db = H.buildRealDb(), storage = createMemoryStorage(), ...opts } = {}) {
  const client = H.createFakeClient(db);
  const cache = createCache({ storage });
  const resolver = createResolver({ client, cache, ...opts });
  return { client, storage, cache, resolver, db };
}

const sugg = (id, title, type, year, rank = 1000) => ({ id, title, type, typeLabel: type, year, yearRange: undefined, rank, stars: '', image: undefined });
const show = (id, name, type, year, rating, votes = 1000) => ({ id, name, originalName: name, type, year, endYear: null, rating, votes });
const ep = (id, season, episode, title, rating = 7.5) => ({ id, title, season, episode, rating, votes: 100, airDate: '2020-01-01' });

function expectEpisodeResult(r, { status = 'ok', showId, episodeId, season, matchedBy }) {
  const info = JSON.stringify({ status: r && r.status, show: r && r.show && r.show.id, episode: r && r.episode && r.episode.id, matchedBy: r && r.matchedBy, season: r && r.season });
  assert.equal(r.status, status, info);
  assert.equal(r.kind, 'episode', info);
  assert.equal(r.show && r.show.id, showId, info);
  assert.equal(r.show.url, url(showId), info);
  if (episodeId !== undefined) {
    assert.equal(r.episode && r.episode.id, episodeId, info);
    assert.equal(r.episode.url, url(episodeId), info);
  }
  if (season !== undefined) assert.equal(r.season, season, info);
  if (matchedBy !== undefined) assert.equal(r.matchedBy, matchedBy, info);
}

// ----------------------------------------------------------------------------------
test('createResolver exposes resolve/resolveEpisode/resolveMovie/resolveSeason/searchTitles', () => {
  const { resolver } = setup();
  for (const name of ['resolve', 'resolveEpisode', 'resolveMovie', 'resolveSeason', 'searchTitles']) assert.equal(typeof resolver[name], 'function', name);
});

test('resolve: "The Boys" S1E3 -> full episode result', async () => {
  const db = H.buildRealDb();
  const { resolver, client } = setup({ db });
  const r = await resolver.resolve({ title: 'The Boys', season: 1, episode: 3 });
  expectEpisodeResult(r, { showId: 'tt1190634', episodeId: 'tt8100948', season: 1, matchedBy: 'number' });
  assert.equal(typeof r.query, 'string');
  assert.equal(normalizeTitle(r.query), 'the boys');
  const boys = db.shows.tt1190634.show; // rating 8.5, votes 1030190 when recorded
  const s1e3 = db.shows.tt1190634.episodes.find((e) => e.id === 'tt8100948'); // 8.3 / 30456
  H.assertFields(assert, r.show, { id: 'tt1190634', name: 'The Boys', type: 'tvSeries', year: 2019, endYear: boys.endYear, rating: boys.rating, votes: boys.votes }, 'show');
  H.assertFields(assert, r.episode, { id: 'tt8100948', title: 'Get Some', season: 1, episode: 3, rating: s1e3.rating, votes: s1e3.votes, airDate: '2019-07-26' }, 'episode');
  assert.equal(typeof r.episode.rating, 'number');
  assert.equal(client.calls.search.length, 1, 'first title variant already yields episodic candidates, so no further searches');

  assert.ok(Array.isArray(r.seasonEpisodes));
  assert.deepEqual(r.seasonEpisodes.map((e) => e.id), BOYS_S1_IDS);
  assert.deepEqual(r.seasonEpisodes.map((e) => e.episode), [1, 2, 3, 4, 5, 6, 7, 8]);
  H.assertFields(assert, r.seasonEpisodes[2], { id: 'tt8100948', episode: 3, title: 'Get Some', rating: s1e3.rating, votes: s1e3.votes, airDate: '2019-07-26' }, 'seasonEpisodes[2]');

  assert.ok(Array.isArray(r.candidates) && r.candidates.length >= 1);
  for (const c of r.candidates) {
    assert.match(c.id, /^tt\d+$/);
    assert.equal(typeof c.name, 'string');
    assert.ok(EPISODIC.has(c.type), `candidate type ${c.type}`);
    assert.equal(typeof c.score, 'number');
  }
  H.assertFields(assert, r.candidates.find((c) => c.id === 'tt1190634'), { name: 'The Boys', year: 2019, type: 'tvSeries' }, 'candidate');
});

test('resolve: Prime display noise is cleaned before searching', async () => {
  const { resolver } = setup();
  const r = await resolver.resolve({ title: 'Prime Video: The Boys (4K UHD)', season: 1, episode: 3 });
  expectEpisodeResult(r, { showId: 'tt1190634', episodeId: 'tt8100948', season: 1 });
});

test('resolve: "The Grand Tour" S3E1 -> the 2016 series (the 2026 one has no season 3)', async () => {
  const { resolver } = setup();
  const r = await resolver.resolve({ title: 'The Grand Tour', season: 3, episode: 1 });
  expectEpisodeResult(r, { showId: 'tt5712554', episodeId: 'tt6068892', season: 3, matchedBy: 'number' });
  assert.equal(r.episode.title, 'Motown Funk');
  assert.equal(r.seasonEpisodes.length, 14);
});

test('resolve: Turkish title "Yüzüklerin Efendisi: Güç Yüzükleri" S2E1 -> The Rings of Power', async () => {
  const { resolver } = setup();
  const r = await resolver.resolve({ title: 'Yüzüklerin Efendisi: Güç Yüzükleri', season: 2, episode: 1 });
  expectEpisodeResult(r, { showId: 'tt7631058', episodeId: 'tt13580784', season: 2, matchedBy: 'number' });
});

test('resolve: several candidates have the episode -> episode title decides', async () => {
  const a = await setup().resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, episodeTitle: 'The Holy Trinity' });
  expectEpisodeResult(a, { showId: 'tt5712554', episodeId: 'tt5715192', season: 1 });
  const b = await setup().resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, episodeTitle: 'The Next Generation' });
  expectEpisodeResult(b, { showId: 'tt44974627', episodeId: 'tt39719719', season: 1 });
});

/** Series ratings of the two real "The Grand Tour" series (8.7 for 2016, 8.2 for 2026 when recorded). */
function grandTourRatings() {
  const db = H.buildRealDb();
  const old = db.shows.tt5712554.show.rating;
  const neu = db.shows.tt44974627.show.rating;
  assert.ok(Math.abs(old - neu) >= 0.3, `fixture precondition: the two series ratings differ (${old} vs ${neu})`);
  return { old, neu };
}

test('resolve: several candidates have the episode -> Prime rating hint decides', async () => {
  const { old, neu } = grandTourRatings();
  const a = await setup().resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { primeRating: old } });
  expectEpisodeResult(a, { showId: 'tt5712554', episodeId: 'tt5715192' });
  const b = await setup().resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { primeRating: neu } });
  expectEpisodeResult(b, { showId: 'tt44974627', episodeId: 'tt39719719' });
});

test('resolve: year hint penalizes a series that started years later', async () => {
  const r = await setup().resolver.resolve({ title: 'The Grand Tour', season: 1, episode: 1, hints: { year: 2016 } });
  expectEpisodeResult(r, { showId: 'tt5712554', episodeId: 'tt5715192' });
});

test('resolve: tries title variants until one yields episodic candidates', async () => {
  const db = {
    suggestions: {
      [H.searchKey("Tom Clancy's Jack Ryan")]: [sugg('tt9000010', "Tom Clancy's Without Remorse", 'movie', 2021)],
      [H.searchKey('Jack Ryan')]: [sugg('tt9000001', 'Jack Ryan', 'tvSeries', 2018)],
    },
    shows: {
      tt9000001: { show: show('tt9000001', 'Jack Ryan', 'tvSeries', 2018, 8.0), seasons: ['1'], episodes: [ep('tt9000002', 1, 1, 'Pilot', 7.9), ep('tt9000003', 1, 2, 'French Connection', 8.0)] },
    },
  };
  const { client, resolver } = setup({ db });
  const r = await resolver.resolve({ title: "Tom Clancy's Jack Ryan", season: 1, episode: 2 });
  expectEpisodeResult(r, { showId: 'tt9000001', episodeId: 'tt9000003', season: 1 });
  const searched = client.calls.search.map(H.searchKey);
  assert.equal(searched[0], 'tom clancys jack ryan', JSON.stringify(client.calls.search));
  assert.equal(searched[searched.length - 1], 'jack ryan', `stops at the variant that yields a series: ${JSON.stringify(client.calls.search)}`);
});

test('resolve: number not found but episode title matches inside the season -> matchedBy title', async () => {
  const r = await setup().resolver.resolve({ title: 'The Boys', season: 1, episode: 42, episodeTitle: 'Get Some' });
  expectEpisodeResult(r, { showId: 'tt1190634', episodeId: 'tt8100948', season: 1, matchedBy: 'title' });
  // Prime numbering off by one: S1E2 shown with the title of IMDb S1E3
  const r2 = await setup().resolver.resolve({ title: 'The Boys', season: 1, episode: 2, episodeTitle: 'Get Some' });
  expectEpisodeResult(r2, { showId: 'tt1190634', episodeId: 'tt8100948', season: 1, matchedBy: 'title' });
});

test('resolve: season unknown to IMDb + episode title -> getAllEpisodes and title match across seasons', async () => {
  const { client, resolver } = setup();
  const r = await resolver.resolve({ title: 'The Boys', season: 9, episode: 1, episodeTitle: 'Herogasm' });
  expectEpisodeResult(r, { showId: 'tt1190634', episodeId: 'tt14143312', season: 3, matchedBy: 'title' });
  assert.deepEqual(client.calls.getAllEpisodes, ['tt1190634']);
  assert.deepEqual(r.seasonEpisodes.map((e) => e.id), BOYS_S3_IDS, 'seasonEpisodes of the matched season');
});

test('resolve: episode not found -> episode-not-found with the first candidate\'s series info', async () => {
  const r = await setup().resolver.resolve({ title: 'The Boys', season: 9, episode: 1 });
  assert.equal(r.status, 'episode-not-found');
  assert.equal(r.kind, 'episode');
  assert.equal(r.episode, null);
  assert.equal(r.show && r.show.id, 'tt1190634');
  assert.equal(r.show.name, 'The Boys');
});

test('resolve: nothing found / missing title', async () => {
  const { client, resolver } = setup();
  assert.equal((await resolver.resolve({ title: 'Qwxzv Plmok', season: 1, episode: 1 })).status, 'not-found');
  assert.equal((await resolver.resolve({ title: 'Qwxzv Plmok' })).status, 'not-found');
  const before = client.totalCalls();
  for (const item of [{}, { title: '' }, { season: 1, episode: 2 }]) {
    const r = await resolver.resolve(item);
    assert.equal(r.status, 'not-found', JSON.stringify(item));
    assert.equal(r.kind, 'unknown', JSON.stringify(item));
  }
  assert.equal(client.totalCalls(), before, 'no IMDb calls without a title');
});

test('resolve: episode without rating -> no-rating', async () => {
  const db = H.buildRealDb();
  db.shows.tt1190634.episodes = db.shows.tt1190634.episodes.map((e) => (e.id === 'tt8100948' ? { ...e, rating: null, votes: 0 } : e));
  const r = await setup({ db }).resolver.resolve({ title: 'The Boys', season: 1, episode: 3 });
  expectEpisodeResult(r, { status: 'no-rating', showId: 'tt1190634', episodeId: 'tt8100948', season: 1 });
  assert.equal(r.episode.rating, null);
});

test('resolve: seasonEpisodes are sorted by episode and limited to the season', async () => {
  const db = H.buildRealDb();
  const stray = { id: 'tt11748808', title: 'Over the Hill with the Swords of a Thousand Men', season: 2, episode: 3, rating: 9, votes: 29359, airDate: '2020-09-04' };
  db.seasonOverride = (id, season, result) => (id === 'tt1190634' ? { ...result, episodes: [...result.episodes].reverse().concat([stray]) } : result);
  const r = await setup({ db }).resolver.resolve({ title: 'The Boys', season: 1, episode: 3 });
  expectEpisodeResult(r, { showId: 'tt1190634', episodeId: 'tt8100948', season: 1 });
  assert.deepEqual(r.seasonEpisodes.map((e) => e.id), BOYS_S1_IDS);
});

// ----------------------------------------------------------------------------------
test('resolve: override -> only that id, no search, matchedBy override', async () => {
  const keys = [];
  const getOverride = async (key) => {
    keys.push(key);
    return key === 'the grand tour' ? { id: 'tt44974627', name: 'The Grand Tour', year: 2026, type: 'tvSeries' } : null;
  };
  const { client, resolver } = setup({ getOverride });
  const r = await resolver.resolve({ title: 'Prime Video: The Grand Tour (4K UHD)', season: 1, episode: 1, episodeTitle: 'The Holy Trinity', hints: { primeRating: 8.7 } });
  expectEpisodeResult(r, { showId: 'tt44974627', episodeId: 'tt39719719', season: 1, matchedBy: 'override' });
  assert.ok(keys.includes('the grand tour'), `getOverride keys: ${JSON.stringify(keys)}`);
  assert.equal(client.calls.search.length, 0, 'no search with an override');

  const missing = await resolver.resolve({ title: 'The Grand Tour', season: 3, episode: 1 });
  assert.equal(missing.status, 'episode-not-found');
  assert.equal(missing.show && missing.show.id, 'tt44974627');
  assert.equal(client.calls.search.length, 0);
  assert.ok(client.calls.getSeason.every(([id]) => id === 'tt44974627'), JSON.stringify(client.calls.getSeason));
});

function twinsDb() {
  // Two series with the same title. A is listed first and is more popular.
  const A = 'tt9100001';
  const B = 'tt9100002';
  return {
    suggestions: { [H.searchKey('Twin Show')]: [sugg(A, 'Twin Show', 'tvSeries', 2010, 100), sugg(B, 'Twin Show', 'tvSeries', 2010, 900)] },
    shows: {
      [A]: { show: show(A, 'Twin Show', 'tvSeries', 2010, 7.5), seasons: ['1', '3'], episodes: [ep('tt9100011', 1, 1, 'Pilot'), ep('tt9100013', 3, 1, 'Return')] },
      [B]: { show: show(B, 'Twin Show', 'tvSeries', 2010, 7.5), seasons: ['1', '2'], episodes: [ep('tt9100021', 1, 1, 'Beginning'), ep('tt9100022', 2, 1, 'Second Wind')] },
    },
  };
}

test('resolve: a successful automatic match is remembered (in the cache) and tried first next time', async () => {
  // control: without memory the more prominent series A wins for S1E1
  const control = await setup({ db: twinsDb() }).resolver.resolve({ title: 'Twin Show', season: 1, episode: 1 });
  expectEpisodeResult(control, { showId: 'tt9100001', episodeId: 'tt9100011' });

  const storage = createMemoryStorage();
  const first = await setup({ db: twinsDb(), storage }).resolver.resolve({ title: 'Twin Show', season: 2, episode: 1 });
  expectEpisodeResult(first, { showId: 'tt9100002', episodeId: 'tt9100022' });

  // a new resolver over the same storage (e.g. service worker restart)
  const again = setup({ db: twinsDb(), storage });
  const second = await again.resolver.resolve({ title: 'Twin Show', season: 1, episode: 1 });
  expectEpisodeResult(second, { showId: 'tt9100002', episodeId: 'tt9100021' });

  // the remembered id is only tried first: an episode it lacks still resolves elsewhere
  const third = await again.resolver.resolve({ title: 'Twin Show', season: 3, episode: 1 });
  expectEpisodeResult(third, { showId: 'tt9100001', episodeId: 'tt9100013' });
});

test('resolve: repeated identical calls are served from cache', async () => {
  for (const item of [{ title: 'The Grand Tour', season: 3, episode: 1 }, { title: 'Saltburn' }]) {
    const { client, resolver } = setup();
    const r1 = await resolver.resolve(item);
    const counts = client.counts();
    const r2 = await resolver.resolve({ ...item });
    assert.deepEqual(client.counts(), counts, `no new client calls for ${item.title}`);
    assert.equal(r2.status, r1.status);
    assert.equal(r2.show.id, r1.show.id);
    assert.equal(r2.episode && r2.episode.id, r1.episode && r1.episode.id);
  }
});

test('resolve: concurrent identical calls are deduplicated', async () => {
  const item = { title: 'The Grand Tour', season: 3, episode: 1 };
  const single = setup();
  await single.resolver.resolve(item);
  const multi = setup();
  const results = await Promise.all([multi.resolver.resolve(item), multi.resolver.resolve({ ...item }), multi.resolver.resolve({ ...item })]);
  assert.deepEqual(multi.client.counts(), single.client.counts());
  for (const r of results) expectEpisodeResult(r, { showId: 'tt5712554', episodeId: 'tt6068892' });
});

// ----------------------------------------------------------------------------------
test('resolve (movie): "Saltburn" -> movie result', async () => {
  const db = H.buildRealDb();
  const { client, resolver } = setup({ db });
  const r = await resolver.resolve({ title: 'Saltburn', hints: { year: 2023 } });
  assert.equal(r.status, 'ok');
  assert.equal(r.kind, 'movie');
  const salt = db.shows.tt17351924.show; // 7 / 272487 when recorded
  H.assertFields(assert, r.show, { id: 'tt17351924', name: 'Saltburn', type: 'movie', year: 2023, rating: salt.rating, votes: salt.votes, url: url('tt17351924') }, 'show');
  assert.ok(client.calls.getTitle.includes('tt17351924'));
});

test('resolve (movie): year hint picks the matching one of two same-titled movies', async () => {
  const db = () => ({
    suggestions: { [H.searchKey('Dune')]: [sugg('tt9400001', 'Dune', 'movie', 1984, 500), sugg('tt9400002', 'Dune', 'movie', 2021, 500)] },
    shows: {
      tt9400001: { show: show('tt9400001', 'Dune', 'movie', 1984, 6.3), seasons: [], episodes: [] },
      tt9400002: { show: show('tt9400002', 'Dune', 'movie', 2021, 8.0), seasons: [], episodes: [] },
    },
  });
  const recent = await setup({ db: db() }).resolver.resolve({ title: 'Dune', hints: { year: 2021 } });
  assert.equal(recent.kind, 'movie');
  assert.equal(recent.show.id, 'tt9400002');
  const old = await setup({ db: db() }).resolver.resolve({ title: 'Dune', hints: { year: 1984 } });
  assert.equal(old.show.id, 'tt9400001');
});

test('resolve (movie): a remembered match does not override a conflicting year hint (same resolver)', async () => {
  const db = {
    suggestions: { [H.searchKey('Dune')]: [sugg('tt9400001', 'Dune', 'movie', 1984, 500), sugg('tt9400002', 'Dune', 'movie', 2021, 500)] },
    shows: {
      tt9400001: { show: show('tt9400001', 'Dune', 'movie', 1984, 6.3), seasons: [], episodes: [] },
      tt9400002: { show: show('tt9400002', 'Dune', 'movie', 2021, 8.0), seasons: [], episodes: [] },
    },
  };
  const { resolver } = setup({ db });
  assert.equal((await resolver.resolve({ title: 'Dune', hints: { year: 2021 } })).show.id, 'tt9400002');
  // Aynı ad, farklı yıl: hatırlanan 2021 eşleşmesi kullanılmamalı.
  assert.equal((await resolver.resolve({ title: 'Dune', hints: { year: 1984 } })).show.id, 'tt9400001');
  // Yıl ipucu yoksa hatırlanan (son) eşleşme kullanılabilir.
  assert.ok(['tt9400001', 'tt9400002'].includes((await resolver.resolve({ title: 'Dune' })).show.id));
});

test('resolve (movie): movie without rating -> no-rating', async () => {
  const db = {
    suggestions: { [H.searchKey('Quiet Film')]: [sugg('tt9200001', 'Quiet Film', 'movie', 2026)] },
    shows: { tt9200001: { show: show('tt9200001', 'Quiet Film', 'movie', 2026, null, 0), seasons: [], episodes: [] } },
  };
  const r = await setup({ db }).resolver.resolve({ title: 'Quiet Film' });
  assert.equal(r.status, 'no-rating');
  assert.equal(r.kind, 'movie');
  assert.equal(r.show.id, 'tt9200001');
  assert.equal(r.show.rating, null);
});

test('resolve (movie): no movie-type candidates -> falls back to the series (kind show)', async () => {
  const db = {
    suggestions: { [H.searchKey('Reacher')]: [sugg('tt9300001', 'Reacher', 'tvSeries', 2022)] },
    shows: { tt9300001: { show: show('tt9300001', 'Reacher', 'tvSeries', 2022, 8.0, 250000), seasons: ['1', '2', '3'], episodes: [ep('tt9300011', 1, 1, 'Welcome to Margrave', 8.1)] } },
  };
  const r = await setup({ db }).resolver.resolve({ title: 'Reacher' });
  assert.equal(r.status, 'ok');
  assert.equal(r.kind, 'show');
  H.assertFields(assert, r.show, { id: 'tt9300001', name: 'Reacher', rating: 8.0, url: url('tt9300001') }, 'show');
});

// ----------------------------------------------------------------------------------
test('resolveSeason: "The Boys" season 1', async () => {
  const r = await setup().resolver.resolveSeason({ title: 'The Boys', season: 1 });
  assert.equal(r.status, 'ok');
  assert.equal(r.season, 1);
  assert.equal(r.show.id, 'tt1190634');
  assert.equal(r.episodes.length, 8);
  const sorted = [...r.episodes].sort((a, b) => a.episode - b.episode);
  assert.deepEqual(sorted.map((e) => e.id), BOYS_S1_IDS);
  for (const e of r.episodes) {
    assert.equal(e.url, url(e.id));
    assert.equal(typeof e.rating, 'number');
  }
});

test('resolveSeason: picks the candidate that has the season', async () => {
  const r = await setup().resolver.resolveSeason({ title: 'The Grand Tour', season: 3 });
  assert.equal(r.status, 'ok');
  assert.equal(r.show.id, 'tt5712554');
  assert.equal(r.episodes.length, 14);
});

test('resolveSeason: Prime rating hint breaks the tie between two series that have the season', async () => {
  const { old, neu } = grandTourRatings();
  const a = await setup().resolver.resolveSeason({ title: 'The Grand Tour', season: 1, hints: { primeRating: old } });
  assert.equal(a.status, 'ok');
  assert.equal(a.show.id, 'tt5712554');
  assert.equal(a.episodes.length, 13);
  const b = await setup().resolver.resolveSeason({ title: 'The Grand Tour', season: 1, hints: { primeRating: neu } });
  assert.equal(b.status, 'ok');
  assert.equal(b.show.id, 'tt44974627');
  assert.equal(b.episodes.length, 6);
});

test('resolveSeason: season-not-found / not-found', async () => {
  const { resolver } = setup();
  assert.equal((await resolver.resolveSeason({ title: 'The Boys', season: 9 })).status, 'season-not-found');
  assert.equal((await resolver.resolveSeason({ title: 'Qwxzv Plmok', season: 1 })).status, 'not-found');
});

test('resolveSeason: repeated identical calls are served from cache', async () => {
  const { client, resolver } = setup();
  await resolver.resolveSeason({ title: 'The Boys', season: 1 });
  const counts = client.counts();
  const again = await resolver.resolveSeason({ title: 'The Boys', season: 1 });
  assert.deepEqual(client.counts(), counts);
  assert.equal(again.show.id, 'tt1190634');
});

// ----------------------------------------------------------------------------------
test('searchTitles: ranked series and movies with display fields', async () => {
  const { resolver } = setup();
  const list = await resolver.searchTitles('The Boys');
  assert.ok(Array.isArray(list));
  assert.equal(list[0].id, 'tt1190634');
  H.assertFields(assert, list[0], { name: 'The Boys', year: 2019, yearRange: '2019-2026', type: 'tvSeries', typeLabel: 'TV series', stars: 'Karl Urban, Jack Quaid' });
  assert.equal(typeof list[0].image, 'string');
  assert.ok(list.some((x) => MOVIE.has(x.type)), 'movies included');
  assert.ok(list.filter((x) => EPISODIC.has(x.type)).length >= 2, 'series included');
  assert.ok(list.every((x) => /^tt\d+$/.test(x.id)));

  const salt = await resolver.searchTitles('Saltburn');
  assert.equal(salt[0].id, 'tt17351924');
  for (const x of salt) assert.ok(EPISODIC.has(x.type) || MOVIE.has(x.type), `unexpected type ${x.type}`);
});
