// tools/i18n/messages.mjs → extension/_locales/<dil>/messages.json
// Kullanım: npm run locales            (dosyaları yazar)
//           npm run locales -- --check (yalnızca doğrular; dosyalar güncel değilse hata verir)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LOCALES, MESSAGES, DEFAULT_LOCALE } from './i18n/messages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'extension', '_locales');
const CHECK = process.argv.includes('--check');

// Chrome Web Store sınırları
const LIMITS = { extName: 75, extShortName: 12, extDescription: 132 };

const problems = [];
const tokensOf = (text) => [...String(text).matchAll(/\$([A-Z_]+)\$/g)].map((m) => m[1].toLowerCase());

for (const [key, entry] of Object.entries(MESSAGES)) {
  const ph = entry.ph || [];
  for (const locale of LOCALES) {
    const text = entry[locale];
    if (typeof text !== 'string' || !text.trim()) {
      problems.push(`${key}: "${locale}" çevirisi eksik`);
      continue;
    }
    const used = tokensOf(text);
    for (const t of used) if (!ph.includes(t)) problems.push(`${key}/${locale}: tanımsız yer tutucu $${t.toUpperCase()}$`);
    for (const p of ph) if (!used.includes(p)) problems.push(`${key}/${locale}: $${p.toUpperCase()}$ kullanılmamış`);
    if (LIMITS[key] && [...text].length > LIMITS[key]) problems.push(`${key}/${locale}: ${[...text].length} karakter (sınır ${LIMITS[key]})`);
  }
}
if (!LOCALES.includes(DEFAULT_LOCALE)) problems.push(`varsayılan dil ${DEFAULT_LOCALE} listede yok`);

if (problems.length) {
  console.error('Çeviri hataları:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

function build(locale) {
  const out = {};
  for (const [key, entry] of Object.entries(MESSAGES)) {
    const item = { message: entry[locale] };
    if (entry.desc) item.description = entry.desc;
    if (entry.ph) {
      item.placeholders = {};
      entry.ph.forEach((name, i) => { item.placeholders[name] = { content: `$${i + 1}` }; });
    }
    out[key] = item;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

let stale = 0;
for (const locale of LOCALES) {
  const dir = join(OUT, locale);
  const file = join(dir, 'messages.json');
  const content = build(locale);
  if (CHECK) {
    const current = await readFile(file, 'utf8').catch(() => null);
    if (current !== content) { stale++; console.error(`güncel değil: _locales/${locale}/messages.json`); }
    continue;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, content, 'utf8');
}

if (CHECK && stale) {
  console.error('Çalıştır: npm run locales');
  process.exit(1);
}
console.log(`${CHECK ? 'Doğrulandı' : 'Yazıldı'}: ${LOCALES.length} dil × ${Object.keys(MESSAGES).length} metin`);
