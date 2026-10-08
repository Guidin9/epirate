// Prime Video oynatıcısının canlı kodunu indirir:
//  1) Başlık/bölüm öğelerinin sınıf adlarının hâlâ var olduğunu doğrular.
//  2) Tüm dillerin bölüm kalıplarını (episodeLong, seasonShort, episodeShort) çekip
//     extension/shared/episode-formats.js dosyasını yeniden üretir.
// Kullanım: npm run sync:prime   (yalnızca doğrulama için: npm run sync:prime -- --check)

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'extension', 'shared', 'episode-formats.js');
const SDK_BASE = 'https://cloudfront.xp-assets.aiv-cdn.net/family/web/ATVWebPlayerSDK-1.0/prod/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const CHECK_ONLY = process.argv.includes('--check');

// Oynatıcının DOM'da kullandığı ve eklentinin dayandığı sınıf adları.
const REQUIRED_DEBUG_CLASSES = ['title-text', 'subtitle-text', 'episode-info'];

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

function findKey(obj, key) {
  if (obj && typeof obj === 'object') {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    for (const value of Object.values(obj)) {
      const found = findKey(value, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const sdk = await get(SDK_BASE + 'ATVWebPlayerSDK.js');
console.log(`SDK indirildi: ${(sdk.length / 1e6).toFixed(1)} MB`);

// 1) Sınıf adı doğrulaması
const problems = [];
if (!/debugClassName\("atvwebplayersdk",\s*\w+\)/.test(sdk)) problems.push('"atvwebplayersdk" sınıf öneki bulunamadı');
for (const name of REQUIRED_DEBUG_CLASSES) {
  if (!sdk.includes(`debugClassName("${name}")`)) problems.push(`atvwebplayersdk-${name} sınıfı bulunamadı`);
}
if (!sdk.includes('.webPlayerSDKContainer')) problems.push('.webPlayerSDKContainer bulunamadı');
if (problems.length) {
  console.error('UYARI — Prime oynatıcısı değişmiş olabilir:\n  - ' + problems.join('\n  - '));
  process.exitCode = 1;
} else {
  console.log('Sınıf adları doğrulandı: ' + REQUIRED_DEBUG_CLASSES.map((n) => 'atvwebplayersdk-' + n).join(', '));
}

// 2) Dil listesi ve kalıplar
const listStart = sdk.indexOf('e.AvailableLocales=[');
if (listStart < 0) throw new Error('AvailableLocales listesi bulunamadı');
const listBody = sdk.slice(listStart, sdk.indexOf(']', listStart));
const constNames = [...listBody.matchAll(/e\.([A-Z_]+)/g)].map((m) => m[1]);
const codeByConst = Object.fromEntries([...sdk.matchAll(/e\.([A-Z_]+)="([a-z]{2,3}-[A-Z0-9]{2,3})"/g)].map((m) => [m[1], m[2]]));
const locales = [...new Set(constNames.map((c) => codeByConst[c]).filter(Boolean))];
console.log(`${locales.length} dil bulundu.`);

// en-US paketin içine gömülü; dosyası yoksa koddaki varsayılanı kullan.
const embeddedLong = (sdk.match(/episodeLong:"([^"]+)"/) || [])[1] || 'Season {{seasonNumber}}, Ep. {{episodeNumber}}';

const table = {};
for (const locale of locales) {
  let long, seasonShort, episodeShort;
  try {
    const json = await get(`${SDK_BASE}languages/${locale}.json`, 'json');
    long = findKey(json, 'episodeLong');
    seasonShort = findKey(json, 'seasonShort');
    episodeShort = findKey(json, 'episodeShort');
  } catch (err) {
    if (locale !== 'en-US') {
      console.warn(`  ${locale}: indirilemedi (${err.message}), atlandı`);
      continue;
    }
  }
  if (locale === 'en-US' && !long) {
    long = embeddedLong;
    seasonShort = 'S';
    episodeShort = 'E';
  }
  if (typeof long !== 'string' || !long.includes('{{seasonNumber}}') || !long.includes('{{episodeNumber}}')) {
    console.warn(`  ${locale}: episodeLong beklenmedik biçimde, atlandı`);
    continue;
  }
  table[locale] = { long, seasonShort: seasonShort || 'S', episodeShort: episodeShort || 'E' };
}

const sorted = Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]]));
const today = new Date().toISOString().slice(0, 10);
const source = `// BU DOSYA OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Yenilemek için: npm run sync:prime
// Kaynak: Prime Video web oynatıcısının dil dosyaları (${SDK_BASE}languages/<dil>.json)
// Üretim tarihi: ${today}
(function (root) {
  'use strict';
  const EPISODE_FORMATS = ${JSON.stringify(sorted, null, 2).replace(/\n/g, '\n  ')};
  root.PVIMDB = Object.assign(root.PVIMDB || {}, { EPISODE_FORMATS });
  if (typeof module === 'object' && module.exports) module.exports = { EPISODE_FORMATS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

if (CHECK_ONLY) {
  console.log(`Kontrol modu: ${Object.keys(sorted).length} dil kalıbı okundu, dosya yazılmadı.`);
} else {
  await writeFile(OUT, source, 'utf8');
  console.log(`Yazıldı: ${OUT} (${Object.keys(sorted).length} dil)`);
  for (const [k, v] of Object.entries(sorted)) console.log(`  ${k.padEnd(7)} ${JSON.stringify(v.long)}  ${v.seasonShort}/${v.episodeShort}`);
}
