'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const { EPISODE_FORMATS } = require(path.join(SHARED, 'episode-formats.js'));
const P = require(path.join(SHARED, 'parse.js'));

const LOCALES = Object.keys(EPISODE_FORMATS);

/** What the Prime player renders: long template filled in (+ " " + title). */
function fill(locale, season, episode) {
  return EPISODE_FORMATS[locale].long
    .replace('{{seasonNumber}}', String(season))
    .replace('{{episodeNumber}}', String(episode));
}
function playerLine(locale, season, episode, title) {
  const filled = fill(locale, season, episode);
  return title === undefined ? filled : filled + ' ' + title;
}
function shortLine(locale, season, episode) {
  const f = EPISODE_FORMATS[locale];
  return f.seasonShort + season + ' ' + f.episodeShort + episode;
}

function expectEpisode(text, expected, preferredLang) {
  const got = preferredLang === undefined ? P.parseEpisodeLine(text) : P.parseEpisodeLine(text, preferredLang);
  const shown = JSON.stringify(text) + (preferredLang ? ` [${preferredLang}]` : '');
  assert.ok(got, `parseEpisodeLine(${shown}) returned ${JSON.stringify(got)}`);
  assert.equal(got.season, expected.season, `season of ${shown}: ${JSON.stringify(got)}`);
  assert.equal(got.episode, expected.episode, `episode of ${shown}: ${JSON.stringify(got)}`);
  assert.equal(got.episodeTitle, expected.episodeTitle, `episodeTitle of ${shown}: ${JSON.stringify(got)}`);
  assert.equal(typeof got.format, 'string', `format of ${shown}`);
  assert.ok(got.format.length > 0, `format of ${shown} is empty`);
}

// ----------------------------------------------------------------------------------
test('EPISODE_FORMATS: 34 locales, every long template has both placeholders', () => {
  assert.equal(LOCALES.length, 34);
  for (const loc of LOCALES) {
    const f = EPISODE_FORMATS[loc];
    assert.equal(typeof f.long, 'string', loc);
    assert.ok(f.long.includes('{{seasonNumber}}') && f.long.includes('{{episodeNumber}}'), loc);
    assert.equal(typeof f.seasonShort, 'string', loc);
    assert.equal(typeof f.episodeShort, 'string', loc);
  }
  assert.equal(EPISODE_FORMATS['tr-TR'].long, '{{seasonNumber}}. Sezon {{episodeNumber}} Bölüm');
  assert.equal(EPISODE_FORMATS['en-GB'].long, 'Season {{seasonNumber}}, Ep. {{episodeNumber}} ');
  assert.ok(EPISODE_FORMATS['fr-FR'].long.includes(' '), 'fr-FR uses NBSP');
});

// ----------------------------------------------------------------------------------
test('normalizeSpaces: NBSP / narrow NBSP / ideographic space / tabs collapse to one space, trimmed', () => {
  assert.equal(P.normalizeSpaces('  a   b  '), 'a b');
  assert.equal(P.normalizeSpaces('a b'), 'a b');
  assert.equal(P.normalizeSpaces('a b'), 'a b');
  assert.equal(P.normalizeSpaces('a　b'), 'a b');
  assert.equal(P.normalizeSpaces('a b c'), 'a b c');
  assert.equal(P.normalizeSpaces('a\t\n b\r\nc'), 'a b c');
  assert.equal(P.normalizeSpaces('  Get  Some '), 'Get Some');
});

test('normalizeSpaces: removes bidi marks', () => {
  const marks = ['‎', '‏', '‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'];
  for (const m of marks) {
    assert.equal(P.normalizeSpaces(`${m}ab${m}cd${m}`), 'abcd', `mark U+${m.codePointAt(0).toString(16)}`);
    assert.equal(P.normalizeSpaces(`a ${m} b`), 'a b', `mark U+${m.codePointAt(0).toString(16)} between spaces`);
  }
  assert.equal(P.normalizeSpaces('‏الموسم 1‎'), 'الموسم 1');
});

test('normalizeSpaces: null/undefined -> empty string', () => {
  assert.equal(P.normalizeSpaces(null), '');
  assert.equal(P.normalizeSpaces(undefined), '');
  assert.equal(P.normalizeSpaces(''), '');
});

// ----------------------------------------------------------------------------------
test('stripQuotes: trims and removes surrounding quote characters', () => {
  const cases = [
    ['"Get Some"', 'Get Some'],
    ["'Get Some'", 'Get Some'],
    ['“Oyunun Adı”', 'Oyunun Adı'],
    ['„Hallo Welt“', 'Hallo Welt'],
    ['«Bonjour»', 'Bonjour'],
    ['‹Bonjour›', 'Bonjour'],
    ['「東京」', '東京'],
    ['『東京』', '東京'],
    ['   "Get Some"   ', 'Get Some'],
    ['Get Some', 'Get Some'],
    ['  Get Some  ', 'Get Some'],
    ["Tom Clancy's Jack Ryan", "Tom Clancy's Jack Ryan"],
  ];
  for (const [input, expected] of cases) assert.equal(P.stripQuotes(input), expected, JSON.stringify(input));
});

// ----------------------------------------------------------------------------------
test('parseEpisodeLine: every locale, long template + episode title', () => {
  for (const loc of LOCALES) {
    expectEpisode(playerLine(loc, 1, 3, 'Get Some'), { season: 1, episode: 3, episodeTitle: 'Get Some' });
    expectEpisode(playerLine(loc, 3, 7, 'Oyunun Adı'), { season: 3, episode: 7, episodeTitle: 'Oyunun Adı' });
  }
});

test('parseEpisodeLine: every locale, multi-digit season/episode numbers', () => {
  for (const loc of LOCALES) {
    expectEpisode(playerLine(loc, 12, 105, 'The Name of the Game'), { season: 12, episode: 105, episodeTitle: 'The Name of the Game' });
    expectEpisode(playerLine(loc, 2, 10, 'Vişne'), { season: 2, episode: 10, episodeTitle: 'Vişne' });
  }
});

test('parseEpisodeLine: every locale, episode title starting with digits', () => {
  for (const loc of LOCALES) {
    expectEpisode(playerLine(loc, 2, 10, '1984'), { season: 2, episode: 10, episodeTitle: '1984' });
    expectEpisode(playerLine(loc, 1, 4, '24 Hours'), { season: 1, episode: 4, episodeTitle: '24 Hours' });
    expectEpisode(playerLine(loc, 1, 3, '2. Dünya Savaşı'), { season: 1, episode: 3, episodeTitle: '2. Dünya Savaşı' });
  }
  expectEpisode('1. évad, 3. epizód 2. rész', { season: 1, episode: 3, episodeTitle: '2. rész' });
  // the example from the spec, verbatim
  expectEpisode('2. Sezon 10 Bölüm 1984', { season: 2, episode: 10, episodeTitle: '1984' });
});

test('parseEpisodeLine: every locale, no title (empty title or nothing appended) -> episodeTitle null', () => {
  for (const loc of LOCALES) {
    expectEpisode(playerLine(loc, 1, 3, ''), { season: 1, episode: 3, episodeTitle: null }); // "<filled> "
    expectEpisode(playerLine(loc, 1, 3), { season: 1, episode: 3, episodeTitle: null }); // "<filled>"
  }
});

test('parseEpisodeLine: every locale, quoted episode title is returned without the quotes', () => {
  for (const loc of LOCALES) {
    expectEpisode(playerLine(loc, 4, 7, '“Get Some”'), { season: 4, episode: 7, episodeTitle: 'Get Some' });
    expectEpisode(playerLine(loc, 4, 7, '"Get Some"'), { season: 4, episode: 7, episodeTitle: 'Get Some' });
  }
});

test('parseEpisodeLine: every locale, tolerates NBSP, plain spaces instead of NBSP, double and trailing spaces', () => {
  for (const loc of LOCALES) {
    const line = playerLine(loc, 1, 3, 'Get Some');
    const expected = { season: 1, episode: 3, episodeTitle: 'Get Some' };
    expectEpisode(line.replace(/\s/g, ' '), expected); // every space as NBSP
    expectEpisode(line.replace(/\s/g, ' '), expected); // NBSP (fr-FR) typed as normal spaces
    expectEpisode(line.replace(/\s/g, '  '), expected); // doubled spaces
    expectEpisode(line + '   ', expected); // trailing spaces
    expectEpisode('  ' + line + '  ', expected);
  }
});

test('parseEpisodeLine: every locale, preferredLang (matching, mismatching, language-only) does not change the result', () => {
  for (const loc of LOCALES) {
    const line = playerLine(loc, 5, 8, 'Get Some');
    const expected = { season: 5, episode: 8, episodeTitle: 'Get Some' };
    expectEpisode(line, expected, loc);
    expectEpisode(line, expected, loc === 'en-US' ? 'tr-TR' : 'en-US');
    expectEpisode(line, expected, loc.split('-')[0]);
  }
});

test('parseEpisodeLine: RTL lines with bidi marks (ar-AE, he-IL)', () => {
  for (const loc of ['ar-AE', 'he-IL']) {
    const line = playerLine(loc, 2, 6, 'Get Some');
    const marked = '‏' + line.replace(/(\d+)/g, '‎$1‎') + '‏';
    expectEpisode(marked, { season: 2, episode: 6, episodeTitle: 'Get Some' });
  }
});

test('parseEpisodeLine: short form "S1 E3"', () => {
  expectEpisode('S1 E3', { season: 1, episode: 3, episodeTitle: null });
  expectEpisode('S12 E105', { season: 12, episode: 105, episodeTitle: null });
});

test('parseEpisodeLine: every locale, short form seasonShort+N+" "+episodeShort+M (live content)', () => {
  for (const loc of LOCALES) {
    expectEpisode(shortLine(loc, 1, 3), { season: 1, episode: 3, episodeTitle: null });
    expectEpisode(shortLine(loc, 11, 22), { season: 11, episode: 22, episodeTitle: null });
  }
});

test('parseEpisodeLine: generic fallbacks', () => {
  expectEpisode('Season 1 Episode 3 - Pilot', { season: 1, episode: 3, episodeTitle: 'Pilot' });
  expectEpisode('S01E05 Title', { season: 1, episode: 5, episodeTitle: 'Title' });
});

test('parseEpisodeLine: null for lines without episode info and empty input', () => {
  for (const input of ['Get Some', '1984', '', '   ', 'No digits here at all', 'The Name of the Game', null, undefined]) {
    assert.equal(P.parseEpisodeLine(input), null, JSON.stringify(input));
  }
});

test('parseEpisodeLine: season must be 0..200 and episode 0..5000', () => {
  assert.equal(P.parseEpisodeLine('Season 201, Ep. 3'), null);
  assert.equal(P.parseEpisodeLine('Season 1, Ep. 5001'), null);
  assert.equal(P.parseEpisodeLine('201. Sezon 3 Bölüm'), null);
  assert.equal(P.parseEpisodeLine('1. Sezon 5001 Bölüm Get Some'), null);
  assert.equal(P.parseEpisodeLine('S300 E1'), null);
  expectEpisode('Season 200, Ep. 5000', { season: 200, episode: 5000, episodeTitle: null });
  expectEpisode('Season 0, Ep. 1 Special', { season: 0, episode: 1, episodeTitle: 'Special' });
  expectEpisode('1. Sezon 0 Bölüm', { season: 1, episode: 0, episodeTitle: null });
});

// ----------------------------------------------------------------------------------
test('parseListEpisodeTitle: detail-page episode headings', () => {
  const a = P.parseListEpisodeTitle('1. “Oyunun Adı”');
  assert.ok(a);
  assert.equal(a.episode, 1);
  assert.equal(a.title, 'Oyunun Adı');
  const b = P.parseListEpisodeTitle('10. "Vişne"');
  assert.ok(b);
  assert.equal(b.episode, 10);
  assert.equal(b.title, 'Vişne');
  const c = P.parseListEpisodeTitle('3. Get Some');
  assert.ok(c);
  assert.equal(c.episode, 3);
  assert.equal(c.title, 'Get Some');
  assert.equal(P.parseListEpisodeTitle('Oyunun Adı'), null);
  assert.equal(P.parseListEpisodeTitle('“Oyunun Adı”'), null);
});

// ----------------------------------------------------------------------------------
test('normalizeTitle: Turkish letters folded, diacritics removed, lowercase', () => {
  assert.equal(P.normalizeTitle('IŞIK İLE ığdır'), 'isik ile igdir');
  assert.equal(P.normalizeTitle('ĞÜŞÖÇ ğüşöç'), 'gusoc gusoc');
  assert.equal(P.normalizeTitle('Yüzüklerin Efendisi: Güç Yüzükleri'), 'yuzuklerin efendisi guc yuzukleri');
  assert.equal(P.normalizeTitle('Amélie'), 'amelie');
  assert.equal(P.normalizeTitle('Señor Ñandú'), 'senor nandu');
  assert.equal(P.normalizeTitle('Über Çağ'), 'uber cag');
});

test("normalizeTitle: '&' -> 'and', apostrophes removed, other punctuation -> single space", () => {
  assert.equal(P.normalizeTitle("Tom Clancy's Jack Ryan"), 'tom clancys jack ryan');
  assert.equal(P.normalizeTitle('Tom Clancy’s Jack Ryan'), 'tom clancys jack ryan');
  assert.equal(P.normalizeTitle('Law & Order'), 'law and order');
  assert.equal(P.normalizeTitle('Spider-Man: Into the Spider-Verse'), 'spider man into the spider verse');
  assert.equal(P.normalizeTitle('  The   Boys!!  '), 'the boys');
  assert.equal(P.normalizeTitle('The Office - Season 3'), 'the office season 3');
  assert.equal(P.normalizeTitle('Mr. Robot'), 'mr robot');
  assert.equal(P.normalizeTitle('Agent 007'), 'agent 007');
  assert.equal(P.normalizeTitle(''), '');
});

test('normalizeTitle: keeps letters of non-Latin scripts', () => {
  assert.equal(P.normalizeTitle('進撃の巨人'), '進撃の巨人');
  assert.equal(P.normalizeTitle('进击的巨人：最终季'), '进击的巨人 最终季');
  assert.equal(P.normalizeTitle('Игра престолов'), 'игра престолов');
  assert.equal(P.normalizeTitle('Κύκλος επεισοδίων'), 'κυκλος επεισοδιων');
  assert.equal(P.normalizeTitle('עונה'), 'עונה');
  assert.equal(P.normalizeTitle('الموسم'), 'الموسم');
  assert.ok(P.normalizeTitle('시즌 1').length >= 3, 'Korean letters kept');
});

// ----------------------------------------------------------------------------------
test('cleanTitle: removes "Prime Video:" prefix', () => {
  assert.equal(P.cleanTitle('Prime Video: The Boys'), 'The Boys');
  assert.equal(P.cleanTitle('  The Boys  '), 'The Boys');
});

test('cleanTitle: removes bracket groups with noise words only', () => {
  const cases = [
    ['The Boys (4K UHD)', 'The Boys'],
    ['The Boys (4K)', 'The Boys'],
    ['Reacher [OV]', 'Reacher'],
    ['Reacher (OV)', 'Reacher'],
    ['Reacher [OmU]', 'Reacher'],
    ['Fallout (Türkçe Dublaj)', 'Fallout'],
    ['Fallout (Dublaj)', 'Fallout'],
    ['Fallout (Türkçe)', 'Fallout'],
    ['Jack Ryan (OmU)', 'Jack Ryan'],
    ['Jack Ryan (dt.)', 'Jack Ryan'],
    ['Invincible (Altyazılı)', 'Invincible'],
    ['Invincible (Altyazı)', 'Invincible'],
    ['Invincible [Dubbed]', 'Invincible'],
    ['Invincible (Subbed)', 'Invincible'],
    ['Invincible (Original)', 'Invincible'],
    ['The Boys [HD]', 'The Boys'],
    ['The Boys (UHD)', 'The Boys'],
    ['The Boys (Season 2)', 'The Boys'],
    ['The Boys (Sezon 2)', 'The Boys'],
  ];
  for (const [input, expected] of cases) assert.equal(P.cleanTitle(input), expected, JSON.stringify(input));
});

test('cleanTitle: keeps meaningful brackets', () => {
  assert.equal(P.cleanTitle('The Office (US)'), 'The Office (US)');
});

test('cleanTitle: removes trailing season markers', () => {
  assert.equal(P.cleanTitle('The Office - Season 3'), 'The Office');
  assert.equal(P.cleanTitle('The Grand Tour 2. Sezon'), 'The Grand Tour');
  assert.equal(P.cleanTitle('The Boys Season 4'), 'The Boys');
  assert.equal(P.cleanTitle('Prime Video: The Boys (4K UHD) - Season 2'), 'The Boys');
});

// ----------------------------------------------------------------------------------
function assertVariantInvariants(input, variants) {
  assert.ok(Array.isArray(variants), `titleVariants(${JSON.stringify(input)}) must be an array`);
  assert.ok(variants.length >= 1, `titleVariants(${JSON.stringify(input)}) is empty`);
  for (const v of variants) {
    assert.equal(typeof v, 'string');
    assert.ok(v.length >= 2, `variant ${JSON.stringify(v)} of ${JSON.stringify(input)} is shorter than 2`);
  }
  const keys = variants.map(P.normalizeTitle);
  assert.equal(new Set(keys).size, keys.length, `duplicates (by normalizeTitle) in ${JSON.stringify(variants)}`);
  assert.equal(variants[0], P.cleanTitle(input), `first variant must be cleanTitle(): ${JSON.stringify(variants)}`);
}

test('titleVariants: first is cleanTitle, then possessive-less title', () => {
  const input = "Tom Clancy's Jack Ryan";
  const v = P.titleVariants(input);
  assertVariantInvariants(input, v);
  assert.ok(v.indexOf('Jack Ryan') >= 1, JSON.stringify(v));

  const v2 = P.titleVariants("Agatha Christie's Marple");
  assertVariantInvariants("Agatha Christie's Marple", v2);
  assert.ok(v2.indexOf('Marple') >= 1, JSON.stringify(v2));
});

test('titleVariants: "A: B" and "A - B" add B then A', () => {
  const tr = 'Yüzüklerin Efendisi: Güç Yüzükleri';
  const v = P.titleVariants(tr);
  assertVariantInvariants(tr, v);
  const b = v.indexOf('Güç Yüzükleri');
  const a = v.indexOf('Yüzüklerin Efendisi');
  assert.ok(b >= 1 && a >= 1 && b < a, JSON.stringify(v));

  const v2 = P.titleVariants('Star Wars - Andor');
  assertVariantInvariants('Star Wars - Andor', v2);
  const b2 = v2.indexOf('Andor');
  const a2 = v2.indexOf('Star Wars');
  assert.ok(b2 >= 1 && a2 >= 1 && b2 < a2, JSON.stringify(v2));
});

test('titleVariants: de-duplicated, entries >= 2 chars, uses the cleaned title', () => {
  for (const input of ['The Boys', 'Dune: Dune', 'Q: Into the Storm', 'Prime Video: The Boys (4K UHD)', 'The Office - Season 3', 'Fallout (Türkçe Dublaj)']) {
    assertVariantInvariants(input, P.titleVariants(input));
  }
  assert.ok(P.titleVariants('Q: Into the Storm').includes('Into the Storm'));
  assert.equal(P.titleVariants('Prime Video: The Boys (4K UHD)')[0], 'The Boys');
  const office = P.titleVariants('The Office - Season 3');
  assert.ok(!office.some((v) => P.normalizeTitle(v) === 'season 3'), `season marker must not become a query: ${JSON.stringify(office)}`);
});

// ----------------------------------------------------------------------------------
test('similarity: identical normalized -> 1, empty -> 0', () => {
  assert.equal(P.similarity('The Boys', 'the boys!'), 1);
  assert.equal(P.similarity('Yüzüklerin Efendisi', 'yuzuklerin efendisi'), 1);
  assert.equal(P.similarity('시즌', '시즌'), 1);
  assert.equal(P.similarity('', 'The Boys'), 0);
  assert.equal(P.similarity('The Boys', ''), 0);
  assert.equal(P.similarity('!!!', 'The Boys'), 0);
});

const PAIRS = [
  ['The Boys', 'The Boys in the Boat'],
  ['Jack Ryan', "Tom Clancy's Jack Ryan"],
  ['Oyunun Adı', 'The Name of the Game'],
  ['Get Some', 'Cherry'],
  ['The Grand Tour', 'The Grand-ish Tour'],
  ['Saltburn', 'Saturn 3'],
  ['Rings of Power', 'The Lord of the Rings: The Rings of Power'],
  ['boys', 'the boys'],
];

test('similarity: symmetric and within 0..1', () => {
  for (const [a, b] of PAIRS) {
    const ab = P.similarity(a, b);
    const ba = P.similarity(b, a);
    assert.ok(ab >= 0 && ab <= 1, `${a} / ${b}: ${ab}`);
    assert.equal(ab, ba, `similarity not symmetric for ${a} / ${b}: ${ab} vs ${ba}`);
  }
});

test('similarity: containment of a >= 4 char normalized string -> >= 0.85', () => {
  for (const [a, b] of [
    ['Jack Ryan', "Tom Clancy's Jack Ryan"],
    ['The Grand Tour', 'The Grand Tour Presents'],
    ['Rings of Power', 'The Lord of the Rings: The Rings of Power'],
    ['boys', 'the boys'],
  ]) {
    assert.ok(P.similarity(a, b) >= 0.85, `${a} / ${b}: ${P.similarity(a, b)}`);
    assert.ok(P.similarity(b, a) >= 0.85, `${b} / ${a}: ${P.similarity(b, a)}`);
  }
});

test('similarity: unrelated titles < 0.3', () => {
  assert.ok(P.similarity('Oyunun Adı', 'The Name of the Game') < 0.3, String(P.similarity('Oyunun Adı', 'The Name of the Game')));
  assert.ok(P.similarity('Saltburn', 'The Boys') < 0.3);
  assert.ok(P.similarity('Vişne', 'Cherry') < 0.3);
});

// ----------------------------------------------------------------------------------
test('parseRatingText', () => {
  assert.equal(P.parseRatingText('IMDb 8,5/10'), 8.5);
  assert.equal(P.parseRatingText('IMDB Puanı: 7,9'), 7.9);
  assert.equal(P.parseRatingText('IMDb 8.5'), 8.5);
  assert.equal(P.parseRatingText('IMDb 10/10'), 10);
  assert.equal(P.parseRatingText('IMDb 11/10'), null);
  assert.equal(P.parseRatingText('IMDb 85'), null);
  assert.equal(P.parseRatingText('IMDb'), null);
  assert.equal(P.parseRatingText(''), null);
});

test('parseYear', () => {
  assert.equal(P.parseYear('2019'), 2019);
  assert.equal(P.parseYear('The Boys (2019)'), 2019);
  assert.equal(P.parseYear('2019–2026'), 2019);
  assert.equal(P.parseYear('Released 1987, remastered 2005'), 1987);
  assert.equal(P.parseYear('S1 E3 · 1999'), 1999);
  assert.equal(P.parseYear('S1 E3'), null);
  assert.equal(P.parseYear('in 1850 or 2150'), null);
  assert.equal(P.parseYear(''), null);
});
