'use strict';
// Test-side helpers: real IMDb fixtures (tests/fixtures/imdb), a recording fake
// fetch, and a fake IMDb client. The raw -> object mappings below follow the
// documented contract (spec), so the imdb.js tests can cross-check the real client
// against them and the resolver tests can feed it realistic data.
const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '../../fixtures/imdb');
const SHARED = path.join(__dirname, '../../../extension/shared');

function shared(name) {
  return require(path.join(SHARED, name + '.js'));
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const pad2 = (n) => String(n).padStart(2, '0');

// --- documented mappings -------------------------------------------------------
function suggestionFromApi(d) {
  return {
    id: d.id,
    title: d.l,
    type: d.qid,
    typeLabel: d.q,
    year: d.y,
    yearRange: d.yr,
    rank: d.rank,
    stars: d.s,
    image: d.i && d.i.imageUrl,
  };
}

/** Suggestion objects (tt ids only, API order) from a recorded suggestion response. */
function suggestionsFromFixture(name) {
  return loadFixture(name).d.filter((d) => /^tt\d+$/.test(d.id)).map(suggestionFromApi);
}

function showFromGqlTitle(t) {
  const rs = t.ratingsSummary || {};
  const ry = t.releaseYear || {};
  return {
    id: t.id,
    name: t.titleText ? t.titleText.text : null,
    originalName: t.originalTitleText ? t.originalTitleText.text : null,
    type: t.titleType ? t.titleType.id : null,
    year: ry.year == null ? null : ry.year,
    endYear: ry.endYear == null ? null : ry.endYear,
    rating: rs.aggregateRating == null ? null : rs.aggregateRating,
    votes: rs.voteCount == null ? 0 : rs.voteCount,
  };
}

function episodeFromGqlNode(n) {
  const rs = n.ratingsSummary || {};
  const d = n.releaseDate;
  const num = (n.series && n.series.episodeNumber) || {};
  return {
    id: n.id,
    title: n.titleText ? n.titleText.text : null,
    season: num.seasonNumber,
    episode: num.episodeNumber,
    rating: rs.aggregateRating == null ? null : rs.aggregateRating,
    votes: rs.voteCount == null ? 0 : rs.voteCount,
    airDate: d && d.year && d.month && d.day ? `${d.year}-${pad2(d.month)}-${pad2(d.day)}` : null,
  };
}

/** { show, seasons, total, episodes } as documented for getSeason/getAllEpisodes. */
function seasonResultFromFixture(name) {
  const t = loadFixture(name).data.title;
  return {
    show: showFromGqlTitle(t),
    seasons: t.episodes.displayableSeasons.edges.map((e) => e.node.text),
    total: t.episodes.episodes.total,
    episodes: t.episodes.episodes.edges.map((e) => episodeFromGqlNode(e.node)),
  };
}

function showFromFixture(name) {
  return showFromGqlTitle(loadFixture(name).data.title);
}

// --- fake fetch ----------------------------------------------------------------
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch that never settles unless the request's AbortSignal fires (like real fetch). */
function hangingResponse(init) {
  return new Promise((resolve, reject) => {
    const signal = init && init.signal;
    if (!signal) return;
    const fail = () => reject(signal.reason || Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
}

/**
 * Recording fetch. `handler(req, index)` returns a Response, throws (network error)
 * or returns the string 'hang'. Each recorded req: { url, init, method, headers, body }.
 */
function createFakeFetch(handler) {
  const calls = [];
  async function fetch(url, init = {}) {
    let body;
    if (typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    const req = { url: String(url), init, method: (init.method || 'GET').toUpperCase(), headers: new Headers(init.headers || {}), body };
    calls.push(req);
    const out = await handler(req, calls.length - 1);
    if (out === 'hang') return hangingResponse(init);
    return out;
  }
  return { fetch, calls };
}

// --- fake IMDb client ------------------------------------------------------------
/** Lenient search key, like the real suggestion endpoint (case/diacritics/punctuation-insensitive). */
function searchKey(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * db = {
 *   suggestions: { [searchKey]: suggestion[] },
 *   shows: { [id]: { show, seasons: string[], episodes: episode[] } },
 *   seasonOverride?: (id, season, result) => result   // to tamper with getSeason output
 * }
 */
function createFakeClient(db) {
  const { ImdbError } = shared('imdb');
  const calls = { search: [], getSeason: [], getAllEpisodes: [], getTitle: [], graphql: [] };
  const lookup = (id) => {
    const entry = db.shows[id];
    if (entry) return entry;
    // A title that only appears in search results: like the real API, answer with the
    // title itself and no episodes (instead of pretending it does not exist).
    for (const list of Object.values(db.suggestions)) {
      const s = list.find((x) => x.id === id);
      if (s) {
        return {
          show: { id, name: s.title, originalName: s.title, type: s.type, year: s.year == null ? null : s.year, endYear: null, rating: null, votes: 0 },
          seasons: [],
          episodes: [],
        };
      }
    }
    throw new ImdbError('not-found', `fake: unknown title ${id}`);
  };
  const client = {
    calls,
    totalCalls() {
      return Object.values(calls).reduce((n, list) => n + list.length, 0);
    },
    counts() {
      return Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, v.length]));
    },
    async search(query) {
      calls.search.push(query);
      return clone(db.suggestions[searchKey(query)] || []);
    },
    async getSeason(id, season) {
      calls.getSeason.push([id, season]);
      const entry = lookup(id);
      const episodes = entry.episodes.filter((e) => e.season === Number(season));
      let result = { show: clone(entry.show), seasons: clone(entry.seasons), total: episodes.length, episodes: clone(episodes) };
      if (db.seasonOverride) result = db.seasonOverride(id, Number(season), result);
      return result;
    },
    async getAllEpisodes(id) {
      calls.getAllEpisodes.push(id);
      const entry = lookup(id);
      return { show: clone(entry.show), seasons: clone(entry.seasons), total: entry.episodes.length, episodes: clone(entry.episodes) };
    },
    async getTitle(id) {
      calls.getTitle.push(id);
      return clone(lookup(id).show);
    },
    async graphql() {
      calls.graphql.push([...arguments]);
      throw new Error('fake client: graphql() should not be needed by the resolver');
    },
  };
  return client;
}

/** A fake-client database built only from recorded real IMDb responses. */
function buildRealDb() {
  const boysAll = seasonResultFromFixture('gql-the-boys-all.json');
  const gt2016s1 = seasonResultFromFixture('gql-grand-tour-2016-s1.json');
  const gt2016s3 = seasonResultFromFixture('gql-grand-tour-2016-s3.json');
  const gt2026s1 = seasonResultFromFixture('gql-grand-tour-2026-s1.json');
  const rop = seasonResultFromFixture('gql-rings-of-power-s2.json');
  const rings = suggestionsFromFixture('suggest-yuzuklerin-efendisi-guc-yuzukleri.json');
  return {
    suggestions: {
      [searchKey('the boys')]: suggestionsFromFixture('suggest-the-boys.json'),
      [searchKey('the grand tour')]: suggestionsFromFixture('suggest-the-grand-tour.json'),
      [searchKey('saltburn')]: suggestionsFromFixture('suggest-saltburn.json'),
      // The real endpoint answered these three queries (almost) identically.
      [searchKey('Yüzüklerin Efendisi: Güç Yüzükleri')]: rings,
      [searchKey('Güç Yüzükleri')]: rings,
      [searchKey('Yüzüklerin Efendisi')]: rings,
    },
    shows: {
      tt1190634: { show: boysAll.show, seasons: boysAll.seasons, episodes: boysAll.episodes },
      tt5712554: { show: gt2016s1.show, seasons: gt2016s1.seasons, episodes: [...gt2016s1.episodes, ...gt2016s3.episodes] },
      tt44974627: { show: gt2026s1.show, seasons: gt2026s1.seasons, episodes: gt2026s1.episodes },
      tt7631058: { show: rop.show, seasons: rop.seasons, episodes: rop.episodes },
      tt17351924: { show: showFromFixture('gql-saltburn-title.json'), seasons: [], episodes: [] },
    },
  };
}

/** Assert that `actual` has (at least) the given fields with strictly equal values. */
function assertFields(assert, actual, expected, label = '') {
  assert.ok(actual && typeof actual === 'object', `${label} expected an object, got ${JSON.stringify(actual)}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepStrictEqual(actual[key], value, `${label}.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
  }
}

module.exports = {
  SHARED,
  shared,
  loadFixture,
  clone,
  suggestionFromApi,
  suggestionsFromFixture,
  showFromGqlTitle,
  episodeFromGqlNode,
  seasonResultFromFixture,
  showFromFixture,
  jsonResponse,
  createFakeFetch,
  searchKey,
  createFakeClient,
  buildRealDb,
  assertFields,
};
