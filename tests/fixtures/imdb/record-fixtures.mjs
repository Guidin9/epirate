// Re-records the real IMDb responses used by tests/unit as fixtures.
//   node tests/fixtures/imdb/record-fixtures.mjs
// The GraphQL query below is written independently of extension/shared/imdb.js;
// only the response SHAPE matters to the unit tests (they serve these bodies
// from a fake fetch, whatever query the client under test sends).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const GQL = 'https://caching.graphql.imdb.com/';

const TITLE = 'id titleText { text } originalTitleText { text } titleType { id text } releaseYear { year endYear } ratingsSummary { aggregateRating voteCount }';
const EPISODE_NODE = 'id titleText { text } ratingsSummary { aggregateRating voteCount } releaseDate { year month day } series { episodeNumber { episodeNumber seasonNumber } }';
const EPISODES = (filter) =>
  `episodes { displayableSeasons(first: 250) { edges { node { text } } } episodes(first: $first, after: $after${filter}) { total pageInfo { hasNextPage endCursor } edges { node { ${EPISODE_NODE} } } } }`;
const Q_SEASON = `query Season($id: ID!, $first: Int!, $after: ID, $seasons: [String!]) { title(id: $id) { ${TITLE} ${EPISODES(', filter: { includeSeasons: $seasons }')} } }`;
const Q_ALL = `query All($id: ID!, $first: Int!, $after: ID) { title(id: $id) { ${TITLE} ${EPISODES('')} } }`;
const Q_TITLE = `query Title($id: ID!) { title(id: $id) { ${TITLE} } }`;

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized' },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: await res.json() };
}

async function suggest(query) {
  const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`suggest ${query}: HTTP ${res.status}`);
  return res.json();
}

async function save(name, data) {
  await writeFile(path.join(DIR, name), JSON.stringify(data, null, 1) + '\n', 'utf8');
  console.log('saved', name);
}

async function ok(query, variables) {
  const r = await gql(query, variables);
  if (r.status !== 200) throw new Error(`GraphQL HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

// --- suggestion endpoint
await save('suggest-the-boys.json', await suggest('the boys'));
await save('suggest-the-grand-tour.json', await suggest('the grand tour'));
await save('suggest-saltburn.json', await suggest('saltburn'));
await save('suggest-yuzuklerin-efendisi-guc-yuzukleri.json', await suggest('yüzüklerin efendisi: güç yüzükleri'));
await save('suggest-no-results.json', await suggest('qwxzvplmok'));

// --- GraphQL
await save('gql-the-boys-s1.json', await ok(Q_SEASON, { id: 'tt1190634', first: 250, after: null, seasons: ['1'] }));
// Same season in real pages of 3 (real cursors).
let after = null;
for (let page = 1; page <= 5; page++) {
  const body = await ok(Q_SEASON, { id: 'tt1190634', first: 3, after, seasons: ['1'] });
  await save(`gql-the-boys-s1-page${page}.json`, body);
  const info = body.data.title.episodes.episodes.pageInfo;
  if (!info.hasNextPage) break;
  after = info.endCursor;
}
await save('gql-the-boys-all.json', await ok(Q_ALL, { id: 'tt1190634', first: 250, after: null }));
await save('gql-the-boys-title.json', await ok(Q_TITLE, { id: 'tt1190634' }));
await save('gql-grand-tour-2016-s1.json', await ok(Q_SEASON, { id: 'tt5712554', first: 250, after: null, seasons: ['1'] }));
await save('gql-grand-tour-2016-s3.json', await ok(Q_SEASON, { id: 'tt5712554', first: 250, after: null, seasons: ['3'] }));
await save('gql-grand-tour-2026-s3.json', await ok(Q_SEASON, { id: 'tt44974627', first: 250, after: null, seasons: ['3'] }));
await save('gql-grand-tour-2026-s1.json', await ok(Q_SEASON, { id: 'tt44974627', first: 250, after: null, seasons: ['1'] }));
await save('gql-rings-of-power-s2.json', await ok(Q_SEASON, { id: 'tt7631058', first: 250, after: null, seasons: ['2'] }));
await save('gql-saltburn-title.json', await ok(Q_TITLE, { id: 'tt17351924' }));
// Unknown id: IMDb answers 200 with titleText null.
await save('gql-unknown-title.json', await ok(Q_TITLE, { id: 'tt99999999' }));
// Invalid query: IMDb answers HTTP 400 with `errors` and no `data` (body recorded as-is).
await save('gql-validation-error-400.json', (await gql('query T($id: ID!) { title(id: $id) { id noSuchField } }', { id: 'tt1190634' })).body);
