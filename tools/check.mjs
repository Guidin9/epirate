// Statik kontroller: sözdizimi, manifest ve dosya bütünlüğü. Kullanım: npm run check
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const problems = [];
const exists = (p) => access(p).then(() => true, () => false);

const manifest = JSON.parse(await readFile(join(EXT, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) problems.push('manifest_version 3 olmalı');
for (const key of ['name', 'version', 'description', 'background', 'action', 'content_scripts', 'icons']) {
  if (!manifest[key]) problems.push(`manifest.${key} eksik`);
}

const referenced = new Set([manifest.background.service_worker, manifest.action.default_popup]);
Object.values(manifest.icons).forEach((f) => referenced.add(f));
Object.values(manifest.action.default_icon || {}).forEach((f) => referenced.add(f));
for (const cs of manifest.content_scripts) {
  cs.js.forEach((f) => referenced.add(f));
  for (const m of cs.matches) if (!/^https:\/\/(\*\.)?[a-z0-9.-]+\/.*$/.test(m)) problems.push(`geçersiz eşleşme kalıbı: ${m}`);
  const firstContent = cs.js.findIndex((f) => f.startsWith('content/'));
  if (cs.js.slice(firstContent).some((f) => f.startsWith('shared/'))) problems.push('ortak modüller content script’lerden önce yüklenmeli');
}

const sw = await readFile(join(EXT, manifest.background.service_worker), 'utf8');
for (const m of sw.matchAll(/'(shared\/[^']+\.js)'/g)) referenced.add(m[1]);
const popupHtml = await readFile(join(EXT, manifest.action.default_popup), 'utf8');
for (const m of popupHtml.matchAll(/(?:src|href)="\.\.\/([^"]+)"/g)) referenced.add(m[1]);
for (const m of popupHtml.matchAll(/(?:src|href)="(popup\.[a-z]+)"/g)) referenced.add('popup/' + m[1]);

for (const f of referenced) if (!(await exists(join(EXT, f)))) problems.push(`eksik dosya: ${f}`);

const jsFiles = [...referenced].filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', join(EXT, f)], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`sözdizimi hatası: ${f}\n${String(err.stderr)}`);
  }
}

if (problems.length) {
  console.error('Kontrol BAŞARISIZ:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Kontrol tamam: manifest v${manifest.version}, ${referenced.size} dosya, ${jsFiles.length} JS dosyası sözdizimi temiz.`);
