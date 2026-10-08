// Eklenti simgelerini SVG'den PNG'ye çizer (görünmez Chrome ile). Kullanım: npm run icons
import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

function starPath(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return 'M' + pts.join(' L') + ' Z';
}

function svg(size) {
  const small = size <= 16;
  const inset = small ? 0 : 4;
  const radius = small ? 3.5 : 28;
  const star = small ? starPath(64, 68, 58, 25) : starPath(64, 67, 46, 20);
  const play = small ? '' : '<path d="M58 56 L58 78 L76 67 Z" fill="#0d141c"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d2a38"/><stop offset="1" stop-color="#0a0f15"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${128 - 2 * inset}" height="${128 - 2 * inset}" rx="${radius * (small ? 8 : 1)}" fill="url(#bg)"/>
  ${small ? '' : `<rect x="${inset + 1}" y="${inset + 1}" width="${126 - 2 * inset}" height="${126 - 2 * inset}" rx="${radius - 1}" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="2"/>`}
  <path d="${star}" fill="#f5c518" stroke="#f5c518" stroke-width="${small ? 6 : 3}" stroke-linejoin="round"/>
  ${play}
</svg>`;
}

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await writeFile(join(OUT, `icon${size}.png`), png);
    console.log(`icon${size}.png yazıldı`);
  }
  await writeFile(join(OUT, 'icon.svg'), svg(128));
} finally {
  await browser.close();
}
