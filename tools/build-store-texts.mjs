// store/listing-source.mjs + tools/i18n/messages.mjs → store/listing/<dil>.md (mağazaya yapıştırılacak metinler)
// Kullanım: npm run store:texts
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { LOCALES, MESSAGES } from './i18n/messages.mjs';
import { DESCRIPTIONS, CAPTIONS, SUPPORT_EMAIL } from '../store/listing-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'listing');
const require = createRequire(import.meta.url);
const S = require(join(ROOT, 'extension', 'shared', 'strings.js'));

const intlLocale = (l) => l.replace('_', '-');
const fill = (text, values) => text.replace(/\$([A-Z_]+)\$/g, (all, name) => (name.toLowerCase() in values ? values[name.toLowerCase()] : all));

/** O dilde örnek rozet: ★ 8,3/10 · 30,5 B oy · Dizi 8,5 */
export function sampleBadge(locale) {
  const loc = intlLocale(locale);
  const votes = fill(MESSAGES.votesCount[locale], { count: S.formatVotes(30456, loc) });
  return `★ ${S.formatRating(8.3, loc)}/10 · ${votes} · ${MESSAGES.series[locale]} ${S.formatRating(8.5, loc)}`;
}

const problems = [];
await mkdir(OUT, { recursive: true });
for (const locale of LOCALES) {
  const description = DESCRIPTIONS[locale];
  const captions = CAPTIONS[locale];
  if (!description) { problems.push(`${locale}: açıklama yok`); continue; }
  if (!captions || captions.length !== 4) { problems.push(`${locale}: 4 ekran görüntüsü başlığı gerekli`); continue; }
  const body = description.replace('{BADGE}', sampleBadge(locale)).replaceAll('{EMAIL}', SUPPORT_EMAIL);
  if (body.length > 16000) problems.push(`${locale}: açıklama çok uzun`);
  const md = `# EpiRate — ${locale}

Chrome Web Store › Store listing › ${locale} alanlarına kopyala.

## Name (manifest'ten gelir, değiştirmeye gerek yok)

${MESSAGES.extName[locale]}

## Summary (en fazla 132 karakter)

${MESSAGES.extDescription[locale]}

## Description

${body}

## Screenshot captions

${captions.map((c, i) => `${i + 1}. ${c}`).join('\n')}
`;
  await writeFile(join(OUT, `${locale}.md`), md, 'utf8');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Yazıldı: store/listing/*.md (${LOCALES.length} dil)`);
for (const l of LOCALES) console.log(`  ${l.padEnd(6)} ${sampleBadge(l)}`);
