'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const M = require(path.join(SHARED, 'match.js'));
const { loadFixture, suggestionFromApi, seasonResultFromFixture } = require('./helpers/imdb-fixtures.js');

const EPISODIC = new Set(['tvSeries', 'tvMiniSeries']);
const MOVIE = new Set(['movie', 'tvMovie', 'video', 'tvSpecial', 'tvShort', 'short']);

/** Raw API order INCLUDING non-title (nm…) entries, mapped field by field. */
const rawList = (name) => loadFixture(name).d.map(suggestionFromApi);

const sugg = (id, title, type, year, rank = 1000, extra = {}) => ({ id, title, type, typeLabel: type, year, yearRange: undefined, rank, stars: '', image: undefined, ...extra });

function assertRankedShape(ranked, input) {
  assert.ok(Array.isArray(ranked));
  assert.notEqual(ranked, input, 'must return a new array');
  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    assert.match(c.id, /^tt\d+$/);
    assert.equal(typeof c.score, 'number', `score of ${c.id}`);
    assert.ok(Number.isFinite(c.score), `score of ${c.id}`);
    assert.equal(typeof c.sim, 'number', `sim of ${c.id}`);
    assert.ok(c.sim >= 0 && c.sim <= 1, `sim of ${c.id}: ${c.sim}`);
    assert.equal(typeof c.index, 'number', `index of ${c.id}`);
    assert.equal(input[c.index].id, c.id, `index of ${c.id} must point into the original list`);
    for (const key of ['title', 'type', 'year', 'rank']) assert.deepEqual(c[key], input[c.index][key], `${c.id}.${key} preserved`);
    if (i > 0) assert.ok(ranked[i - 1].score >= c.score, `not sorted by score desc at ${i}`);
  }
}

// ----------------------------------------------------------------------------------
/** Expected id set for a kind, straight from the documented type groups. */
const idsOfTypes = (list, types) => list.filter((s) => /^tt\d+$/.test(s.id || '') && types.has(s.type)).map((s) => s.id).sort();

test('rankCandidates: real "The Boys" list, no kind: drops nm ids, keeps series+movies, exact title first', () => {
  const input = rawList('suggest-the-boys.json');
  assert.ok(input.some((s) => /^nm/.test(s.id)), 'fixture contains nm entries');
  const snapshot = structuredClone(input); // keeps undefined-valued keys
  const ranked = M.rankCandidates('The Boys', input, {});
  assertRankedShape(ranked, input);
  assert.deepEqual(input, snapshot, 'input list/items must not be mutated');
  // when recorded: tt0093437, tt1190634, tt1856080, tt8323628
  assert.deepEqual(ranked.map((c) => c.id).sort(), idsOfTypes(input, new Set([...EPISODIC, ...MOVIE])));
  assert.equal(ranked[0].id, 'tt1190634');
  assert.equal(ranked[0].sim, 1);
  for (const c of ranked) assert.equal(c.index, input.findIndex((s) => s.id === c.id), `index of ${c.id} counts dropped nm entries`);
});

test('rankCandidates: kind filters', () => {
  const boys = rawList('suggest-the-boys.json');
  const ep = M.rankCandidates('The Boys', boys, { kind: 'episode' });
  assertRankedShape(ep, boys);
  assert.deepEqual(ep.map((c) => c.id).sort(), idsOfTypes(boys, EPISODIC));
  assert.equal(ep[0].id, 'tt1190634');
  const mv = M.rankCandidates('The Boys', boys, { kind: 'movie' });
  assertRankedShape(mv, boys);
  assert.deepEqual(mv.map((c) => c.id).sort(), idsOfTypes(boys, MOVIE));
  assert.ok(mv.length >= 1);

  const all = [
    sugg('tt1', 'X', 'podcastSeries', 2020),
    sugg('tt2', 'X', 'musicVideo', 2020),
    sugg('tt3', 'X', 'videoGame', 2020),
    sugg('tt4', 'X', 'tvEpisode', 2020),
    sugg('tt5', 'X', 'tvSeries', 2020),
    sugg('tt6', 'X', 'movie', 2020),
    sugg('tt7', 'X', 'tvMovie', 2020),
    sugg('tt8', 'X', 'video', 2020),
    sugg('tt9', 'X', 'tvSpecial', 2020),
    sugg('tt10', 'X', 'short', 2020),
    sugg('tt11', 'X', 'tvShort', 2020),
    sugg('tt12', 'X', 'tvMiniSeries', 2020),
  ];
  const ids = (list) => list.map((c) => c.id).sort();
  assert.deepEqual(ids(M.rankCandidates('X', all, {})), ['tt10', 'tt11', 'tt12', 'tt5', 'tt6', 'tt7', 'tt8', 'tt9']);
  assert.deepEqual(ids(M.rankCandidates('X', all, { kind: 'episode' })), ['tt12', 'tt5']);
  assert.deepEqual(ids(M.rankCandidates('X', all, { kind: 'movie' })), ['tt10', 'tt11', 'tt6', 'tt7', 'tt8', 'tt9']);
  for (const c of M.rankCandidates('X', all, { kind: 'episode' })) assert.ok(EPISODIC.has(c.type));
  for (const c of M.rankCandidates('X', all, { kind: 'movie' })) assert.ok(MOVIE.has(c.type));
});

test('rankCandidates: ids not matching /^tt\\d+$/ are dropped', () => {
  const input = [
    sugg('nm0001764', 'The Boys', 'tvSeries', 2019),
    sugg('co0001', 'The Boys', 'tvSeries', 2019),
    sugg('', 'The Boys', 'tvSeries', 2019),
    sugg(undefined, 'The Boys', 'tvSeries', 2019),
    sugg('ttabc', 'The Boys', 'tvSeries', 2019),
    sugg('tt123x', 'The Boys', 'tvSeries', 2019),
    sugg('TT123', 'The Boys', 'tvSeries', 2019),
    sugg('tt1190634', 'The Boys', 'tvSeries', 2019),
  ];
  const ranked = M.rankCandidates('The Boys', input, { kind: 'episode' });
  assert.deepEqual(ranked.map((c) => c.id), ['tt1190634']);
  assert.equal(ranked[0].index, 7);
});

test('rankCandidates: exact normalized title outranks a partial match of similar popularity/position', () => {
  const input = [sugg('tt1', 'The Boys in the Boat', 'tvSeries', 2020, 1000), sugg('tt2', 'The Boys!', 'tvSeries', 2020, 1100)];
  assert.equal(M.rankCandidates('the boys', input, { kind: 'episode' })[0].id, 'tt2');
  assert.equal(M.rankCandidates('the boys', input, {})[0].id, 'tt2');
  const movies = [sugg('tt3', 'Dune: Part Two', 'movie', 2024, 1000), sugg('tt4', 'Dune', 'movie', 2024, 1100)];
  assert.equal(M.rankCandidates('Dune', movies, { kind: 'movie' })[0].id, 'tt4');

  // real list: both exact "The Grand Tour" series beat the partial matches
  const gt = rawList('suggest-the-grand-tour.json');
  const ranked = M.rankCandidates('The Grand Tour', gt, { kind: 'episode' });
  assertRankedShape(ranked, gt);
  assert.deepEqual(ranked.slice(0, 2).map((c) => c.id).sort(), ['tt44974627', 'tt5712554']);
});

test('rankCandidates (episode + year): a series starting > 1 year after the hint ranks below one that started before', () => {
  const gt = rawList('suggest-the-grand-tour.json'); // 2026 series is listed first and is more popular
  const ranked = M.rankCandidates('The Grand Tour', gt, { kind: 'episode', year: 2019 });
  const ids = ranked.map((c) => c.id);
  assert.ok(ids.indexOf('tt5712554') < ids.indexOf('tt44974627'), JSON.stringify(ranked.map((c) => [c.id, c.year, c.score])));

  const twins = [sugg('tt1', 'Twin', 'tvSeries', 2024, 100), sugg('tt2', 'Twin', 'tvSeries', 2010, 100)];
  assert.equal(M.rankCandidates('Twin', twins, { kind: 'episode', year: 2015 })[0].id, 'tt2');
});

test('rankCandidates (movie + year): candidate within ±1 year outranks a similar one far from the year', () => {
  const a = [sugg('tt1', 'Dune', 'movie', 1984, 500), sugg('tt2', 'Dune', 'movie', 2021, 500)];
  assert.equal(M.rankCandidates('Dune', a, { kind: 'movie', year: 2021 })[0].id, 'tt2');
  assert.equal(M.rankCandidates('Dune', a, { kind: 'movie', year: 2022 })[0].id, 'tt2');
  assert.equal(M.rankCandidates('Dune', a, { kind: 'movie', year: 2020 })[0].id, 'tt2');
  const b = [sugg('tt2', 'Dune', 'movie', 2021, 500), sugg('tt1', 'Dune', 'movie', 1984, 500)];
  assert.equal(M.rankCandidates('Dune', b, { kind: 'movie', year: 1984 })[0].id, 'tt1');
  assert.equal(M.rankCandidates('Dune', b, { kind: 'movie', year: 1985 })[0].id, 'tt1');
});

// ----------------------------------------------------------------------------------
const boysS1 = seasonResultFromFixture('gql-the-boys-s1.json').episodes;
const boysAll = seasonResultFromFixture('gql-the-boys-all.json').episodes;
const gtS3 = seasonResultFromFixture('gql-grand-tour-2016-s3.json').episodes;

function expectFound(result, id, matchedBy) {
  assert.ok(result, `expected ${id} via ${matchedBy}, got null`);
  assert.equal(result.episode && result.episode.id, id, JSON.stringify(result));
  assert.equal(result.matchedBy, matchedBy, JSON.stringify(result));
}

test('findEpisode: number match', () => {
  expectFound(M.findEpisode(boysS1, { season: 1, episode: 3 }), 'tt8100948', 'number');
  const withTitle = M.findEpisode(boysS1, { season: 1, episode: 3, episodeTitle: 'Get Some' });
  expectFound(withTitle, 'tt8100948', 'number');
  assert.ok(withTitle.titleSim >= 0.99, `titleSim ${withTitle.titleSim}`);
  // across seasons the season number matters
  expectFound(M.findEpisode(boysAll, { season: 2, episode: 3 }), 'tt11748808', 'number');
  expectFound(M.findEpisode(boysAll, { season: 4, episode: 8 }), 'tt26660301', 'number');
});

test('findEpisode: falls back to the best title match (>= 0.82) when the number is missing or unknown', () => {
  const r = M.findEpisode(boysS1, { season: 1, episode: 42, episodeTitle: 'Get Some' });
  expectFound(r, 'tt8100948', 'title');
  assert.ok(r.titleSim >= 0.82, `titleSim ${r.titleSim}`);
  expectFound(M.findEpisode(boysS1, { episodeTitle: 'You Found Me' }), 'tt8100958', 'title');
  expectFound(M.findEpisode(boysAll, { episodeTitle: 'herogasm' }), 'tt14143312', 'title');
  // best, not first, similar title
  expectFound(M.findEpisode(gtS3, { season: 3, episode: 99, episodeTitle: 'The Colombia Special Part 2' }), 'tt6068898', 'title');
});

test('findEpisode: null when neither number nor a good-enough title matches', () => {
  assert.equal(M.findEpisode(boysS1, { season: 1, episode: 42 }), null);
  assert.equal(M.findEpisode(boysS1, { season: 1, episode: 42, episodeTitle: 'Completely Unrelated Words Here' }), null);
  assert.equal(M.findEpisode(boysS1, { season: 2, episode: 1 }), null);
  assert.equal(M.findEpisode([], { season: 1, episode: 1, episodeTitle: 'Get Some' }), null);
});

test('findEpisode: number match with a very different title loses to an almost exact title match elsewhere', () => {
  // S1E2 is "Cherry" on IMDb; the player says the episode is called "Get Some" (IMDb S1E3)
  expectFound(M.findEpisode(boysS1, { season: 1, episode: 2, episodeTitle: 'Get Some' }), 'tt8100948', 'title');
  // ...but without such a strong alternative the number match stays
  expectFound(M.findEpisode(boysS1, { season: 1, episode: 3, episodeTitle: 'Some Other Words' }), 'tt8100948', 'number');
  expectFound(M.findEpisode(boysS1, { season: 1, episode: 3, episodeTitle: 'Get Somme' }), 'tt8100948', 'number');
});

// ----------------------------------------------------------------------------------
// Scores in the range rankCandidates really produces (about 0..1.1 on the recorded lists).
const entry = (tag, { score = 0.8, override, mapped, rating = 8, titleSim = 0.5, hit = true } = {}) => ({
  tag,
  candidate: { id: 'tt' + tag.charCodeAt(0), score, ...(override ? { override: true } : {}), ...(mapped ? { mapped: true } : {}) },
  show: { id: 'tt' + tag.charCodeAt(0), rating },
  hit: hit ? { titleSim } : null,
});

function best(found, hints = {}) {
  const r = M.pickBest(found, hints);
  assert.ok(r, 'pickBest returned nothing');
  assert.equal(typeof r.total, 'number', 'result has a numeric total');
  return r;
}

test('pickBest: override wins against the strongest realistic competitor', () => {
  const found = [entry('A', { score: 1.1, mapped: true, titleSim: 1, rating: 8.4 }), entry('B', { score: 0, override: true, rating: 2, hit: false })];
  assert.equal(best(found, { primeRating: 8.4 }).tag, 'B');
  assert.equal(best([...found].reverse(), { primeRating: 8.4 }).tag, 'B');
});

test('pickBest: override ALWAYS wins (spec), whatever the other scores are', () => {
  const found = [entry('A', { score: 100, titleSim: 1, rating: 8.4 }), entry('B', { score: 1, override: true, rating: 2, hit: false })];
  assert.equal(best(found, { primeRating: 8.4 }).tag, 'B');
  assert.equal(best([...found].reverse(), { primeRating: 8.4 }).tag, 'B');
});

test('pickBest: higher candidate score wins when all else is equal', () => {
  assert.equal(best([entry('A', { score: 0.6 }), entry('B', { score: 0.9 })]).tag, 'B');
  assert.equal(best([entry('B', { score: 0.9 }), entry('A', { score: 0.6 })]).tag, 'B');
});

test('pickBest: mapped flag increases the total', () => {
  assert.equal(best([entry('A'), entry('B', { mapped: true })]).tag, 'B');
  assert.equal(best([entry('B', { mapped: true }), entry('A')]).tag, 'B');
});

test('pickBest: higher episode-title similarity wins', () => {
  assert.equal(best([entry('A', { titleSim: 0.2 }), entry('B', { titleSim: 0.95 })]).tag, 'B');
  assert.equal(best([entry('B', { titleSim: 0.95 }), entry('A', { titleSim: 0.2 })]).tag, 'B');
});

test('pickBest: show rating closer to the Prime rating wins', () => {
  const found = [entry('A', { rating: 8.5 }), entry('B', { rating: 6.0 })];
  assert.equal(best(found, { primeRating: 8.4 }).tag, 'A');
  assert.equal(best(found, { primeRating: 6.1 }).tag, 'B');
  assert.equal(best([...found].reverse(), { primeRating: 8.4 }).tag, 'A');
  assert.equal(best([...found].reverse(), { primeRating: 6.1 }).tag, 'B');
});
