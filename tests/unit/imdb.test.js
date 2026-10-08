'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const I = require(path.join(SHARED, 'imdb.js'));
const H = require('./helpers/imdb-fixtures.js');

const { createImdbClient, ImdbError, imdbTitleUrl, GRAPHQL_HOSTS, SUGGEST_BASE } = I;
const HOSTS = ['https://caching.graphql.imdb.com/', 'https://api.graphql.imdb.com/', 'https://graphql.imdb.com/'];

const hostOf = (url) => HOSTS.find((h) => url.startsWith(h)) || url;

async function rejectsWithCode(promise, code) {
  let error;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected an ImdbError(${code}), but it resolved`);
  assert.ok(error instanceof ImdbError, `expected ImdbError, got ${error && error.name}: ${error && error.message}`);
  assert.equal(error.code, code, `error code (message: ${error.message})`);
  return error;
}

// ----------------------------------------------------------------------------------
test('constants and imdbTitleUrl', () => {
  assert.deepEqual([...GRAPHQL_HOSTS], HOSTS);
  assert.equal(SUGGEST_BASE, 'https://v3.sg.media-imdb.com/suggestion/x/');
  assert.equal(imdbTitleUrl('tt1190634'), 'https://www.imdb.com/title/tt1190634/');
  const e = new ImdbError('blocked', 'x');
  assert.ok(e instanceof Error);
  assert.equal(e.code, 'blocked');
});

// ----------------------------------------------------------------------------------
test('search: GET to the suggestion URL with lowercased, collapsed, trimmed, encoded query', async () => {
  const fake = H.createFakeFetch(() => H.jsonResponse(H.loadFixture('suggest-the-boys.json')));
  const client = createImdbClient({ fetch: fake.fetch });
  await client.search('  The   Boys  ');
  await client.search('The\tBoys\n');
  await client.search('The Boys');
  await client.search('Yüzüklerin Efendisi: Güç Yüzükleri');
  assert.equal(fake.calls.length, 4);
  assert.equal(fake.calls[0].url, 'https://v3.sg.media-imdb.com/suggestion/x/the%20boys.json');
  assert.equal(fake.calls[1].url, 'https://v3.sg.media-imdb.com/suggestion/x/the%20boys.json');
  assert.equal(fake.calls[2].url, 'https://v3.sg.media-imdb.com/suggestion/x/the%20boys.json');
  assert.equal(fake.calls[3].url, SUGGEST_BASE + encodeURIComponent('yüzüklerin efendisi: güç yüzükleri') + '.json');
  for (const c of fake.calls) assert.equal(c.method, 'GET');
});

test('search: query is limited to 80 characters', async () => {
  const fake = H.createFakeFetch(() => H.jsonResponse({ d: [] }));
  const client = createImdbClient({ fetch: fake.fetch });
  await client.search('A'.repeat(100));
  await client.search('   ' + 'b'.repeat(90));
  assert.equal(fake.calls[0].url, SUGGEST_BASE + 'a'.repeat(80) + '.json');
  assert.equal(fake.calls[1].url, SUGGEST_BASE + 'b'.repeat(80) + '.json');
});

test('search: maps the real response to suggestion objects, drops nm ids, keeps API order', async () => {
  for (const name of ['suggest-the-boys.json', 'suggest-saltburn.json', 'suggest-the-grand-tour.json']) {
    const raw = H.loadFixture(name);
    const fake = H.createFakeFetch(() => H.jsonResponse(raw));
    const client = createImdbClient({ fetch: fake.fetch });
    const results = await client.search('x');
    const expected = H.suggestionsFromFixture(name);
    assert.deepEqual(results.map((r) => r.id), expected.map((r) => r.id), name);
    assert.ok(!results.some((r) => /^nm/.test(r.id)), `${name}: nm ids must be dropped`);
    results.forEach((r, i) => {
      const exp = expected[i];
      for (const key of ['id', 'title', 'type', 'typeLabel', 'year', 'rank', 'stars']) {
        assert.deepEqual(r[key], exp[key], `${name} ${exp.id}.${key}`);
      }
      // optional fields: equal when present in the API data, empty otherwise
      if (exp.yearRange == null) assert.ok(r.yearRange == null, `${exp.id}.yearRange`);
      else assert.equal(r.yearRange, exp.yearRange, `${exp.id}.yearRange`);
      if (exp.image == null) assert.ok(r.image == null, `${exp.id}.image`);
      else assert.equal(r.image, exp.image, `${exp.id}.image`);
    });
  }
});

test('search: concrete mapping of "The Boys"', async () => {
  const raw = H.loadFixture('suggest-the-boys.json');
  const d = raw.d.find((x) => x.id === 'tt1190634');
  const fake = H.createFakeFetch(() => H.jsonResponse(raw));
  const [first] = await createImdbClient({ fetch: fake.fetch }).search('the boys');
  H.assertFields(assert, first, {
    id: 'tt1190634',
    title: 'The Boys',
    type: 'tvSeries',
    typeLabel: 'TV series',
    year: 2019,
    yearRange: d.yr, // "2019-2026" when recorded
    rank: d.rank,
    stars: d.s,
    image: d.i.imageUrl,
  });
  assert.equal(typeof first.rank, 'number');
  assert.match(first.image, /^https:\/\/m\.media-amazon\.com\//);
});

test('search: empty query -> [] without fetching; real "no results" answer -> []', async () => {
  const fake = H.createFakeFetch(() => H.jsonResponse(H.loadFixture('suggest-no-results.json')));
  const client = createImdbClient({ fetch: fake.fetch });
  assert.deepEqual(await client.search(''), []);
  assert.deepEqual(await client.search('   '), []);
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await client.search('qwxzvplmok'), []);
  assert.equal(fake.calls.length, 1);
});

test('createImdbClient exposes search/getSeason/getAllEpisodes/getTitle/graphql', () => {
  const client = createImdbClient({ fetch: async () => H.jsonResponse({}) });
  for (const name of ['search', 'getSeason', 'getAllEpisodes', 'getTitle', 'graphql']) assert.equal(typeof client[name], 'function', name);
});

test('search: non-OK HTTP -> ImdbError "http" after `retries` extra attempts', async () => {
  for (const [retries, expectedCalls] of [[undefined, 2], [0, 1], [1, 2], [2, 3]]) {
    const fake = H.createFakeFetch(() => H.jsonResponse({ message: 'nope' }, 500));
    const opts = { fetch: fake.fetch };
    if (retries !== undefined) opts.retries = retries;
    await rejectsWithCode(createImdbClient(opts).search('the boys'), 'http');
    assert.equal(fake.calls.length, expectedCalls, `retries=${retries}`);
  }
});

test('search: a failed attempt followed by success returns the results', async () => {
  const fake = H.createFakeFetch((req, i) => (i === 0 ? H.jsonResponse({}, 503) : H.jsonResponse(H.loadFixture('suggest-the-boys.json'))));
  const results = await createImdbClient({ fetch: fake.fetch, retries: 1 }).search('the boys');
  assert.equal(fake.calls.length, 2);
  assert.equal(results[0].id, 'tt1190634');
});

test('search: network failure and timeout surface as ImdbError', async () => {
  const net = H.createFakeFetch(() => {
    throw new TypeError('fetch failed');
  });
  await rejectsWithCode(createImdbClient({ fetch: net.fetch, retries: 0 }).search('the boys'), 'network');
  const hang = H.createFakeFetch(() => 'hang');
  await rejectsWithCode(createImdbClient({ fetch: hang.fetch, retries: 0, timeoutMs: 40 }).search('the boys'), 'timeout');
});

// ----------------------------------------------------------------------------------
function assertGraphqlRequest(req) {
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.get('x-imdb-client-name'), 'imdb-web-next-localized');
  assert.match(req.headers.get('content-type') || '', /^application\/json/);
  assert.equal(req.init.credentials, 'omit');
  assert.ok(req.body && typeof req.body === 'object', 'JSON body');
  assert.equal(typeof req.body.query, 'string');
  assert.ok(req.body.query.length > 0);
  assert.ok(req.body.variables && typeof req.body.variables === 'object', 'variables object');
}

const BOYS_S1_IDS = ['tt7775902', 'tt8100946', 'tt8100948', 'tt8100950', 'tt8100952', 'tt8100954', 'tt8100956', 'tt8100958'];

test('getSeason: request shape and mapping of the real response', async () => {
  const raw = H.loadFixture('gql-the-boys-s1.json');
  const rawS1E3 = raw.data.title.episodes.episodes.edges[2].node;
  const fake = H.createFakeFetch(() => H.jsonResponse(raw));
  const client = createImdbClient({ fetch: fake.fetch });
  const r = await client.getSeason('tt1190634', 1);

  assert.equal(fake.calls.length, 1);
  const req = fake.calls[0];
  assert.ok(req.url.startsWith(HOSTS[0]), req.url);
  assertGraphqlRequest(req);
  assert.ok(JSON.stringify(req.body).includes('tt1190634'), 'request carries the title id');
  assert.ok('first' in req.body.variables && typeof req.body.variables.first === 'number' && req.body.variables.first > 0, 'variables.first');

  const rs = raw.data.title.ratingsSummary; // 8.5 / 1030190 when recorded
  H.assertFields(assert, r.show, { id: 'tt1190634', name: 'The Boys', originalName: 'The Boys', type: 'tvSeries', year: 2019, endYear: raw.data.title.releaseYear.endYear, rating: rs.aggregateRating, votes: rs.voteCount }, 'show');
  assert.equal(typeof r.show.rating, 'number');
  assert.deepEqual(r.seasons, raw.data.title.episodes.displayableSeasons.edges.map((e) => e.node.text)); // ['1'..'5']
  assert.ok(r.seasons.every((s) => typeof s === 'string'));
  assert.equal(r.total, 8);
  assert.deepEqual(r.episodes.map((e) => e.id), BOYS_S1_IDS);
  H.assertFields(assert, r.episodes[2], { id: 'tt8100948', title: 'Get Some', season: 1, episode: 3, rating: rawS1E3.ratingsSummary.aggregateRating, votes: rawS1E3.ratingsSummary.voteCount, airDate: '2019-07-26' }, 'S1E3');
  assert.equal(typeof r.episodes[2].rating, 'number');
  const expected = H.seasonResultFromFixture('gql-the-boys-s1.json').episodes;
  r.episodes.forEach((e, i) => H.assertFields(assert, e, expected[i], `episode ${i}`));
});

test('getSeason: different seasons produce different requests', async () => {
  const fake = H.createFakeFetch(() => H.jsonResponse(H.loadFixture('gql-grand-tour-2016-s3.json')));
  const client = createImdbClient({ fetch: fake.fetch });
  await client.getSeason('tt5712554', 3);
  await client.getSeason('tt5712554', 4);
  assert.notDeepEqual(fake.calls[0].body, fake.calls[1].body);
});

test('getSeason: follows pageInfo.hasNextPage/endCursor over real pages and merges them', async () => {
  const pages = [1, 2, 3].map((n) => H.loadFixture(`gql-the-boys-s1-page${n}.json`));
  const cursorOf = (p) => p.data.title.episodes.episodes.pageInfo.endCursor;
  const fake = H.createFakeFetch((req) => {
    const after = req.body.variables.after;
    if (!after) return H.jsonResponse(pages[0]);
    if (after === cursorOf(pages[0])) return H.jsonResponse(pages[1]);
    if (after === cursorOf(pages[1])) return H.jsonResponse(pages[2]);
    return H.jsonResponse({ errors: [{ message: `unexpected cursor ${after}` }] });
  });
  const r = await createImdbClient({ fetch: fake.fetch }).getSeason('tt1190634', 1);
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls[1].body.variables.after, cursorOf(pages[0]));
  assert.equal(fake.calls[2].body.variables.after, cursorOf(pages[1]));
  for (const c of fake.calls) assertGraphqlRequest(c);
  assert.deepEqual(r.episodes.map((e) => e.id), BOYS_S1_IDS);
  assert.equal(r.total, 8);
  assert.equal(r.show.name, 'The Boys');
});

test('getSeason/getAllEpisodes: stops after 8 pages', async () => {
  for (const method of ['getSeason', 'getAllEpisodes']) {
    const template = H.loadFixture('gql-the-boys-s1-page1.json');
    const fake = H.createFakeFetch((req, i) => {
      const body = H.clone(template);
      const conn = body.data.title.episodes.episodes;
      conn.total = 1000;
      conn.pageInfo = { hasNextPage: true, endCursor: `cursor-${i + 1}` };
      conn.edges.forEach((edge, k) => {
        edge.node.id = `tt9${String(i).padStart(3, '0')}${k}`;
        edge.node.series.episodeNumber.episodeNumber = i * 3 + k + 1;
      });
      return H.jsonResponse(body);
    });
    const client = createImdbClient({ fetch: fake.fetch });
    const r = method === 'getSeason' ? await client.getSeason('tt1190634', 1) : await client.getAllEpisodes('tt1190634');
    assert.equal(fake.calls.length, 8, `${method}: number of page requests`);
    assert.equal(r.episodes.length, 24, `${method}: merged episodes`);
  }
});

test('getAllEpisodes: maps all seasons of the real response, paginated', async () => {
  const all = H.loadFixture('gql-the-boys-all.json');
  const edges = all.data.title.episodes.episodes.edges;
  const pageSize = 10;
  const fake = H.createFakeFetch((req) => {
    const after = req.body.variables.after;
    const start = after ? Number(after.replace('page-', '')) : 0;
    const body = H.clone(all);
    const conn = body.data.title.episodes.episodes;
    conn.edges = edges.slice(start, start + pageSize);
    const next = start + pageSize;
    conn.pageInfo = { hasNextPage: next < edges.length, endCursor: `page-${next}` };
    return H.jsonResponse(body);
  });
  const r = await createImdbClient({ fetch: fake.fetch }).getAllEpisodes('tt1190634');
  assert.equal(fake.calls.length, 4);
  assert.ok(JSON.stringify(fake.calls[0].body).includes('tt1190634'));
  const expected = H.seasonResultFromFixture('gql-the-boys-all.json');
  assert.equal(r.episodes.length, 40);
  r.episodes.forEach((e, i) => H.assertFields(assert, e, expected.episodes[i], `episode ${i}`));
  assert.deepEqual(r.seasons, ['1', '2', '3', '4', '5']);
  assert.equal(r.total, 40);
  H.assertFields(assert, r.show, expected.show, 'show');
});

test('getSeason: empty season of a real series (no episodes) is not an error', async () => {
  const raw = H.loadFixture('gql-grand-tour-2026-s3.json');
  const fake = H.createFakeFetch(() => H.jsonResponse(raw));
  const r = await createImdbClient({ fetch: fake.fetch }).getSeason('tt44974627', 3);
  assert.deepEqual(r.episodes, []);
  assert.equal(r.total, 0);
  assert.deepEqual(r.seasons, ['1']);
  const rs = raw.data.title.ratingsSummary;
  H.assertFields(assert, r.show, { id: 'tt44974627', name: 'The Grand Tour', type: 'tvSeries', year: 2026, rating: rs.aggregateRating, votes: rs.voteCount });
  assert.ok(r.show.endYear == null, 'ongoing series has no endYear');
});

test('episode/show mapping: missing rating -> null, votes 0, missing date -> null', async () => {
  const body = H.loadFixture('gql-the-boys-s1.json');
  const t = body.data.title;
  t.ratingsSummary = null;
  const edges = t.episodes.episodes.edges;
  edges[0].node.ratingsSummary = { aggregateRating: null, voteCount: 0 };
  edges[1].node.releaseDate = null;
  const fake = H.createFakeFetch(() => H.jsonResponse(body));
  const r = await createImdbClient({ fetch: fake.fetch }).getSeason('tt1190634', 1);
  assert.equal(r.show.rating, null);
  assert.equal(r.show.votes, 0);
  assert.equal(r.episodes[0].rating, null);
  assert.equal(r.episodes[0].votes, 0);
  assert.equal(r.episodes[1].airDate, null);
  assert.equal(r.episodes[1].rating, edges[1].node.ratingsSummary.aggregateRating);
  assert.equal(typeof r.episodes[1].rating, 'number');
});

test('getTitle: maps a real movie response', async () => {
  const raw = H.loadFixture('gql-saltburn-title.json');
  const fake = H.createFakeFetch(() => H.jsonResponse(raw));
  const show = await createImdbClient({ fetch: fake.fetch }).getTitle('tt17351924');
  assertGraphqlRequest(fake.calls[0]);
  assert.ok(JSON.stringify(fake.calls[0].body).includes('tt17351924'));
  const rs = raw.data.title.ratingsSummary; // 7 / 272487 when recorded
  H.assertFields(assert, show, { id: 'tt17351924', name: 'Saltburn', originalName: 'Saltburn', type: 'movie', year: 2023, rating: rs.aggregateRating, votes: rs.voteCount });
  assert.equal(typeof show.rating, 'number');
  assert.ok(show.endYear == null);
});

test('not-found: data.title null or titleText null (real unknown-id response)', async () => {
  const unknown = H.loadFixture('gql-unknown-title.json');
  for (const body of [unknown, { data: { title: null } }]) {
    for (const call of [(c) => c.getTitle('tt99999999'), (c) => c.getSeason('tt99999999', 1), (c) => c.getAllEpisodes('tt99999999')]) {
      const fake = H.createFakeFetch(() => H.jsonResponse(body));
      await rejectsWithCode(call(createImdbClient({ fetch: fake.fetch })), 'not-found');
    }
  }
});

// ----------------------------------------------------------------------------------
/** behaviours: per host -> 'ok' | status number | 'network' | 'hang' */
function hostFetch(behaviours, okBody = H.loadFixture('gql-the-boys-title.json')) {
  return H.createFakeFetch((req) => {
    const b = behaviours[hostOf(req.url)];
    if (b === 'ok' || b === undefined) return H.jsonResponse(okBody);
    if (b === 'network') throw new TypeError('fetch failed');
    if (b === 'hang') return 'hang';
    return H.jsonResponse({ message: 'error' }, b);
  });
}

test('graphql failover: 403 / 429 / 5xx / network / timeout on a host -> next host', async () => {
  for (const failure of [403, 429, 500, 'network', 'hang']) {
    const fake = hostFetch({ [HOSTS[0]]: failure, [HOSTS[1]]: 'ok' });
    const client = createImdbClient({ fetch: fake.fetch, retries: 0, timeoutMs: 50 });
    const show = await client.getTitle('tt1190634');
    assert.equal(show.name, 'The Boys', `failure ${failure}`);
    assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), [HOSTS[0], HOSTS[1]], `failure ${failure}`);
    for (const c of fake.calls) assertGraphqlRequest(c);
  }
});

test('graphql failover: third host is used when the first two fail', async () => {
  const fake = hostFetch({ [HOSTS[0]]: 403, [HOSTS[1]]: 502, [HOSTS[2]]: 'ok' });
  const show = await createImdbClient({ fetch: fake.fetch, retries: 0 }).getTitle('tt1190634');
  assert.equal(show.id, 'tt1190634');
  assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), HOSTS);
});

test('graphql failover: all hosts fail -> the last ImdbError is thrown', async () => {
  const cases = [
    [[500, 'network', 403], 'blocked'],
    [[403, 500, 429], 'blocked'],
    [['network', 403, 503], 'http'],
    [[403, 500, 'network'], 'network'],
    [[403, 'network', 'hang'], 'timeout'],
  ];
  for (const [failures, code] of cases) {
    const fake = hostFetch({ [HOSTS[0]]: failures[0], [HOSTS[1]]: failures[1], [HOSTS[2]]: failures[2] });
    await rejectsWithCode(createImdbClient({ fetch: fake.fetch, retries: 0, timeoutMs: 50 }).getTitle('tt1190634'), code);
    assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), HOSTS, `${failures.join(',')}`);
  }
});

test('graphql: `errors` without `data` -> ImdbError "graphql" immediately, no failover', async () => {
  const realErrors = H.loadFixture('gql-validation-error-400.json').errors;
  const fake = H.createFakeFetch(() => H.jsonResponse({ errors: realErrors }, 200));
  await rejectsWithCode(createImdbClient({ fetch: fake.fetch }).getTitle('tt1190634'), 'graphql');
  assert.equal(fake.calls.length, 1);
});

test('graphql: partial `errors` next to `data` are not fatal', async () => {
  const body = H.loadFixture('gql-the-boys-title.json');
  body.errors = [{ message: 'partial failure', path: ['title', 'plot'] }];
  const fake = H.createFakeFetch(() => H.jsonResponse(body));
  const show = await createImdbClient({ fetch: fake.fetch }).getTitle('tt1190634');
  assert.equal(show.name, 'The Boys');
  assert.equal(fake.calls.length, 1);
});

test('graphql: real validation error (HTTP 400 + errors) is a query error -> "graphql", no failover', async () => {
  const body = H.loadFixture('gql-validation-error-400.json');
  const fake = H.createFakeFetch(() => H.jsonResponse(body, 400));
  await rejectsWithCode(createImdbClient({ fetch: fake.fetch, retries: 0 }).getTitle('tt1190634'), 'graphql');
  assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), [HOSTS[0]]);
});

test('graphql: 4xx without an errors body still fails over and ends as "http"', async () => {
  const fake = H.createFakeFetch(() => H.jsonResponse({ message: 'nope' }, 404));
  await rejectsWithCode(createImdbClient({ fetch: fake.fetch, retries: 0 }).getTitle('tt1190634'), 'http');
  assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), HOSTS);
});

test('graphql: after a host succeeds, later calls start from that host', async () => {
  const fake = hostFetch({ [HOSTS[0]]: 403, [HOSTS[1]]: 'ok' });
  const client = createImdbClient({ fetch: fake.fetch, retries: 0 });
  await client.getTitle('tt1190634');
  await client.getTitle('tt1190634');
  assert.deepEqual(fake.calls.map((c) => hostOf(c.url)), [HOSTS[0], HOSTS[1], HOSTS[1]]);
});
