'use strict';
// Dil dosyaları ve dile göre biçimlendirme.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT = path.join(__dirname, '../../extension');
const LOCALES_DIR = path.join(EXT, '_locales');
const S = require(path.join(EXT, 'shared/strings.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const locales = fs.readdirSync(LOCALES_DIR).sort();
const load = (l) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, l, 'messages.json'), 'utf8'));
const en = load('en');

test('12 dil var ve varsayılan dil İngilizce', () => {
  assert.deepEqual(locales, ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'nl', 'pl', 'pt_BR', 'tr']);
  assert.equal(manifest.default_locale, 'en');
});

test('her dilde aynı anahtarlar, boş metin yok, yer tutucular tutarlı', () => {
  const keys = Object.keys(en).sort();
  for (const l of locales) {
    const m = load(l);
    assert.deepEqual(Object.keys(m).sort(), keys, `${l}: anahtarlar farklı`);
    for (const [key, entry] of Object.entries(m)) {
      assert.ok(entry.message && entry.message.trim(), `${l}/${key} boş`);
      const used = [...entry.message.matchAll(/\$([A-Z_]+)\$/g)].map((x) => x[1].toLowerCase()).sort();
      const declared = Object.keys(entry.placeholders || {}).sort();
      assert.deepEqual([...new Set(used)], declared, `${l}/${key}: yer tutucular uyuşmuyor`);
      assert.deepEqual(declared, Object.keys(en[key].placeholders || {}).sort(), `${l}/${key}: İngilizceden farklı yer tutucu`);
    }
  }
});

test('manifest metinleri her dilde var ve mağaza sınırları içinde', () => {
  const refs = JSON.stringify(manifest).match(/__MSG_([A-Za-z0-9_]+)__/g).map((r) => r.slice(6, -2));
  assert.ok(refs.includes('extName') && refs.includes('extDescription'));
  for (const l of locales) {
    const m = load(l);
    for (const r of refs) assert.ok(m[r], `${l}: ${r} eksik`);
    assert.ok([...m.extName.message].length <= 75, `${l}: ad çok uzun`);
    assert.ok([...m.extDescription.message].length <= 132, `${l}: açıklama çok uzun`);
    assert.ok(m.extName.message.startsWith('EpiRate'), `${l}: ad EpiRate ile başlamıyor`);
  }
});

test('t(): yer tutucular chrome.i18n ile aynı kuralla doldurulur (Node yedeği)', () => {
  assert.equal(S.t('seasonEpisode', [1, 3]), 'Season 1 · Episode 3');
  assert.equal(S.t('votesCount', ['30K']), '30K votes');
  assert.equal(S.t('connOk', [420]), 'IMDb connection OK (420 ms)');
  assert.equal(S.t('olmayan-anahtar'), 'olmayan-anahtar');
});

test('puan ve oy biçimi dile göre', () => {
  assert.equal(S.formatRating(8.3, 'tr'), '8,3');
  assert.equal(S.formatRating(8.3, 'en'), '8.3');
  assert.equal(S.formatRating(8, 'de'), '8,0');
  assert.equal(S.formatRating(8.3, 'ar'), '8.3', 'Arapçada da Latin rakamları');
  assert.equal(S.formatRating(null, 'en'), '—');
  assert.equal(S.formatVotes(30456, 'tr'), '30,5 B', 'sayı ile birim arasında bölünmez boşluk');
  assert.equal(S.formatVotes(30456, 'en'), '30.5K');
  assert.equal(S.formatVotes(1030190, 'en'), '1M');
  assert.equal(S.formatVotes(0, 'en'), '0');
  assert.match(S.formatDate('2019-07-26', 'en'), /Jul 26, 2019/);
  assert.match(S.formatDate('2019-07-26', 'tr'), /26 Tem 2019/);
});
