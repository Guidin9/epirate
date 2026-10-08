'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHARED = path.join(__dirname, '../../extension/shared');
const S = require(path.join(SHARED, 'settings.js'));
const { createMemoryStorage } = require(path.join(SHARED, 'cache.js'));

const DEFAULTS = {
  mode: 'controls',
  position: 'under-title',
  size: 'm',
  showVotes: true,
  showSeriesRating: true,
  seasonChart: true,
  listRatings: true,
  movies: true,
  toolbarBadge: true,
};

test('DEFAULT_SETTINGS and CHOICES', () => {
  assert.deepEqual({ ...S.DEFAULT_SETTINGS }, DEFAULTS);
  assert.ok(Object.isFrozen(S.DEFAULT_SETTINGS));
  assert.deepEqual(JSON.parse(JSON.stringify(S.CHOICES)), {
    mode: ['controls', 'start', 'always'],
    position: ['under-title', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
    size: ['s', 'm', 'l'],
  });
});

test('sanitizeSettings: non-objects -> defaults', () => {
  for (const raw of [null, undefined, 'x', 42, true, []]) {
    assert.deepEqual({ ...S.sanitizeSettings(raw) }, DEFAULTS, JSON.stringify(raw));
  }
});

test('sanitizeSettings: keeps valid known keys, drops unknown keys, rejects invalid values', () => {
  const out = S.sanitizeSettings({
    mode: 'always',
    position: 'top-right',
    size: 'l',
    showVotes: false,
    toolbarBadge: false,
    junk: 1,
    __proto__x: true,
  });
  assert.deepEqual({ ...out }, { ...DEFAULTS, mode: 'always', position: 'top-right', size: 'l', showVotes: false, toolbarBadge: false });

  const bad = S.sanitizeSettings({ mode: 'sometimes', position: 'center', size: 'xl', showVotes: 'false', movies: 0, seasonChart: null, listRatings: 1 });
  assert.deepEqual({ ...bad }, DEFAULTS);
});

test('sanitizeSettings: every listed choice is accepted, every boolean key accepts both values', () => {
  for (const [key, values] of Object.entries(S.CHOICES)) {
    for (const v of values) assert.equal(S.sanitizeSettings({ [key]: v })[key], v, `${key}=${v}`);
  }
  for (const key of Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean')) {
    assert.equal(S.sanitizeSettings({ [key]: false })[key], false, key);
    assert.equal(S.sanitizeSettings({ [key]: true })[key], true, key);
  }
});

test('loadSettings: defaults when nothing is stored, sanitized stored settings otherwise', async () => {
  assert.deepEqual({ ...(await S.loadSettings(createMemoryStorage())) }, DEFAULTS);
  const area = createMemoryStorage({ settings: { size: 'l', mode: 'bogus', junk: true } });
  assert.deepEqual({ ...(await S.loadSettings(area)) }, { ...DEFAULTS, size: 'l' });
});

test('saveSettings: merges the patch over current settings, sanitizes, persists and returns it', async () => {
  const area = createMemoryStorage({ settings: { size: 'l', showVotes: false } });
  const result = await S.saveSettings(area, { mode: 'always', position: 'nowhere', bogus: 1 });
  const expected = { ...DEFAULTS, size: 'l', showVotes: false, mode: 'always' };
  assert.deepEqual({ ...result }, expected);
  assert.deepEqual((await area.get('settings')).settings, expected);
  assert.deepEqual({ ...(await S.loadSettings(area)) }, expected);

  const second = await S.saveSettings(area, { size: 's' });
  assert.deepEqual({ ...second }, { ...expected, size: 's' });
  assert.deepEqual((await area.get('settings')).settings, { ...expected, size: 's' });
});
