// Chrome Web Store görselleri: 12 dilde 1280×800 ekran görüntüleri + tanıtım görselleri.
// Görünmez (headless) Chrome for Testing kullanır; kişisel tarayıcılara dokunmaz.
// Kullanım: npm run store:assets            (tüm diller)
//           npm run store:assets -- en tr   (yalnızca seçilen diller)
import puppeteer from 'puppeteer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { LOCALES } from './i18n/messages.mjs';
import { CAPTIONS } from '../store/listing-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const OUT = join(ROOT, 'store');
const require = createRequire(import.meta.url);
const { EPISODE_FORMATS } = require(join(EXT, 'shared', 'episode-formats.js'));

const PLAYER_URL = 'https://www.primevideo.com/detail/E2E-PLAYER/ref=atv_dp';
const LIST_URL = 'https://www.primevideo.com/detail/E2E-LIST/ref=atv_dp';
const PLAYER_HTML = await readFile(join(ROOT, 'tests', 'fixtures', 'player.html'), 'utf8');
const LIST_HTML = await readFile(join(ROOT, 'tests', 'fixtures', 'detail.html'), 'utf8');
const ICON_SVG = await readFile(join(EXT, 'icons', 'icon.svg'), 'utf8');

const CHROME_LANG = { en: 'en-US', tr: 'tr', de: 'de', es: 'es', fr: 'fr', it: 'it', pt_BR: 'pt-BR', pl: 'pl', nl: 'nl', ja: 'ja', hi: 'hi', ar: 'ar' };
const PRIME_LOCALE = { en: 'en-US', tr: 'tr-TR', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt_BR: 'pt-BR', pl: 'pl-PL', nl: 'nl-NL', ja: 'ja-JP', hi: 'hi-IN', ar: 'ar-AE' };
const FONT = '"Segoe UI", "Yu Gothic UI", "Meiryo", "Nirmala UI", Arial, sans-serif';
const only = process.argv.slice(2);
const locales = only.length ? LOCALES.filter((l) => only.includes(l)) : LOCALES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (buf) => Buffer.from(buf).toString('base64');

function subtitleFor(locale) {
  const f = EPISODE_FORMATS[PRIME_LOCALE[locale]] || EPISODE_FORMATS['en-US'];
  return f.long.replace('{{seasonNumber}}', '1').replace('{{episodeNumber}}', '4').trim() + ' The Female of the Species';
}

async function badgeState(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-pvimdb-root]');
    if (!host) return null;
    const b = host.shadowRoot.querySelector('.badge');
    const r = b.getBoundingClientRect();
    return { status: b.className, visible: host.shadowRoot.querySelector('.anchor').classList.contains('visible'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
}

async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`${label}: zaman aşımı`);
}

function frameHtml({ caption, image, dir, kind }) {
  const shot = kind === 'popup'
    ? `<img src="data:image/png;base64,${image}" style="height:600px;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)">`
    : `<img src="data:image/png;base64,${image}" style="width:1060px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)">`;
  // Not: sayfanın tamamını rtl yapmak headless ekran görüntüsünü boşaltıyor; yön yalnızca başlıkta.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1280px;height:800px;overflow:hidden}
    body{background:radial-gradient(90% 70% at 50% 0%,#24364a 0%,#0d141c 55%,#070a0e 100%);font-family:${FONT};color:#fff;
      display:flex;flex-direction:column;align-items:center}
    .cap{height:150px;display:flex;align-items:center;justify-content:center;gap:18px;padding:0 60px;box-sizing:border-box;width:100%;
      font-size:38px;font-weight:700;letter-spacing:-.01em;text-align:center}
    .cap svg{width:46px;height:46px;flex:none}
  </style></head><body><div class="cap" dir="${dir}">${ICON_SVG.replace(/width="\d+" height="\d+"/, '')}<span>${caption}</span></div>${shot}</body></html>`;
}

async function compose(browser, html, path, width = 1280, height = 800) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await sleep(150);
  await page.screenshot({ path, clip: { x: 0, y: 0, width, height } });
  await page.close();
}

async function captureLocale(locale) {
  const browser = await puppeteer.launch({
    headless: true, // görünmez
    enableExtensions: true,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-first-run', '--no-default-browser-check', '--mute-audio', `--lang=${CHROME_LANG[locale]}`],
  });
  try {
    const id = await browser.installExtension(EXT);
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('https://www.primevideo.com/detail/E2E-PLAYER')) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: PLAYER_HTML });
      if (req.url().startsWith('https://www.primevideo.com/detail/E2E-LIST')) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: LIST_HTML });
      return req.continue();
    });

    // 1-2: oynatıcı rozeti ve sezon paneli
    await page.goto(PLAYER_URL, { waitUntil: 'load' });
    await page.evaluate((lang, sub) => {
      window.__pv.setLang(lang.toLowerCase());
      window.__pv.setTitle('The Boys');
      window.__pv.setSubtitle(sub);
      window.__pv.showControls();
      const next = Array.from(document.querySelectorAll('.row span')).find((s) => s.textContent.includes('›'));
      if (next) next.textContent = '';
    }, PRIME_LOCALE[locale], subtitleFor(locale));
    const s = await waitFor(async () => { const b = await badgeState(page); return b && /\bok\b/.test(b.status) && b.visible ? b : null; }, `${locale} rozet`);
    await page.mouse.move(1180, 600);
    await sleep(400);
    const badgeShot = await page.screenshot();
    await page.mouse.click(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2);
    await waitFor(() => page.evaluate(() => !document.querySelector('[data-pvimdb-root]').shadowRoot.querySelector('.panel').hidden), `${locale} panel`);
    await sleep(300);
    const panelShot = await page.screenshot();
    await page.keyboard.press('Escape');

    // 4: popup (oynatıcı sekmesini hedefler)
    const sw = await (await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${id}/`))).worker();
    const [tabId] = await sw.evaluate(() => chrome.tabs.query({ url: 'https://www.primevideo.com/*' }).then((t) => t.map((x) => x.id)));
    const popup = await browser.newPage();
    await popup.setViewport({ width: 360, height: 760, deviceScaleFactor: 2 });
    await popup.goto(`chrome-extension://${id}/popup/popup.html?tab=${tabId}`, { waitUntil: 'load' });
    await waitFor(() => popup.evaluate(() => !document.getElementById('nowBody').hidden && document.getElementById('nowScore').textContent.length > 0), `${locale} popup`);
    await sleep(300);
    const popupShot = await popup.screenshot({ clip: { x: 0, y: 0, width: 360, height: 760 } });
    await popup.close();

    // 3: dizi sayfasında bölüm listesi
    const list = await browser.newPage();
    await list.setRequestInterception(true);
    list.on('request', (req) => (req.url().startsWith('https://www.primevideo.com/detail/E2E-LIST')
      ? req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: LIST_HTML }) : req.continue()));
    await list.goto(LIST_URL, { waitUntil: 'load' });
    await waitFor(() => list.evaluate(() => document.querySelectorAll('[data-pvimdb-chip]').length >= 8), `${locale} liste`);
    await sleep(500);
    const listShot = await list.screenshot();
    await list.close();

    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    const captions = CAPTIONS[locale];
    const outDir = join(OUT, 'screenshots', locale);
    await mkdir(outDir, { recursive: true });
    await compose(browser, frameHtml({ caption: captions[0], image: b64(badgeShot), dir }), join(outDir, '1-badge.png'));
    await compose(browser, frameHtml({ caption: captions[1], image: b64(panelShot), dir }), join(outDir, '2-season.png'));
    await compose(browser, frameHtml({ caption: captions[2], image: b64(listShot), dir }), join(outDir, '3-episode-list.png'));
    await compose(browser, frameHtml({ caption: captions[3], image: b64(popupShot), dir, kind: 'popup' }), join(outDir, '4-settings.png'));
    if (locale === 'en') return { badgeShot };
    return {};
  } finally {
    await browser.close();
  }
}

function promoHtml({ width, height, badge }) {
  const big = width > 1000;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
    body{background:radial-gradient(80% 120% at 15% 10%,#2a3d52 0%,#0d141c 60%,#06090d 100%);font-family:${FONT};color:#fff;
      display:flex;align-items:center;gap:${big ? 60 : 22}px;padding:0 ${big ? 80 : 28}px;box-sizing:border-box}
    .mark svg{width:${big ? 150 : 92}px;height:${big ? 150 : 92}px;display:block}
    h1{margin:0;font-size:${big ? 92 : 50}px;font-weight:800;letter-spacing:-.03em;line-height:1}
    p{margin:${big ? 18 : 10}px 0 0;font-size:${big ? 30 : 17}px;color:#c9d4de;line-height:1.25}
    .shot{margin-left:auto}
    .shot img{height:${height - 120}px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}
  </style></head><body><div class="mark">${ICON_SVG.replace(/width="\d+" height="\d+"/, '')}</div>
  <div><h1>EpiRate</h1><p>IMDb episode ratings<br>while you watch</p></div>
  ${badge ? `<div class="shot"><img src="data:image/png;base64,${badge}"></div>` : ''}</body></html>`;
}

const results = {};
for (const locale of locales) {
  const t0 = Date.now();
  Object.assign(results, await captureLocale(locale));
  console.log(`  ✔ ${locale} (${Date.now() - t0} ms)`);
}

// Tanıtım görselleri (dil bağımsız, İngilizce)
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1280, height: 800 } });
try {
  await mkdir(join(OUT, 'promo'), { recursive: true });
  await compose(browser, promoHtml({ width: 440, height: 280 }), join(OUT, 'promo', 'small-tile-440x280.png'), 440, 280);
  const badge = results.badgeShot ? await (async () => {
    // Rozetli sahnenin üst-orta bölümünü kırp
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 720 });
    await p.setContent(`<img src="data:image/png;base64,${b64(results.badgeShot)}" style="display:block">`, { waitUntil: 'load' });
    const crop = await p.screenshot({ clip: { x: 340, y: 0, width: 600, height: 400 } });
    await p.close();
    return b64(crop);
  })() : null;
  await compose(browser, promoHtml({ width: 1400, height: 560, badge }), join(OUT, 'promo', 'marquee-1400x560.png'), 1400, 560);
} finally {
  await browser.close();
}
console.log(`Görseller: store/screenshots/<dil>/ (${locales.length} dil × 4), store/promo/`);
