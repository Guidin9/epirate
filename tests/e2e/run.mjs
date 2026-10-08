// Uçtan uca testler — yalnızca GÖRÜNMEZ (headless) Chrome for Testing, geçici profil.
// Brave'e ve kişisel Chrome profiline dokunulmaz; hiçbir pencere açılmaz.
// Kullanım: npm run test:e2e            (tümü)
//           npm run test:e2e -- panel   (adında "panel" geçen senaryolar)
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');
const ARTIFACTS = join(ROOT, 'tests', 'artifacts');
const PLAYER_URL = 'https://www.primevideo.com/detail/E2E-PLAYER/ref=atv_dp';
const REAL_DETAIL_URL = 'https://www.primevideo.com/detail/0KRGHGZCHKS920ZQGY5LBRF7MA';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const FILTER = process.argv.slice(2).map((s) => s.toLowerCase());

const LAUNCH = {
  headless: true, // GÜVENLİK: asla false yapılmaz (kullanıcının ekranında pencere açılmasın)
  enableExtensions: true,
  defaultViewport: { width: 1280, height: 720 },
  args: ['--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1280,720', '--lang=tr-TR'],
};
if (LAUNCH.headless !== true || LAUNCH.devtools) throw new Error('E2E yalnızca headless çalışır.');

const require = createRequire(import.meta.url);
require(join(EXT, 'shared', 'episode-formats.js'));
require(join(EXT, 'shared', 'resolver.js'));
require(join(EXT, 'shared', 'strings.js'));
const NS = globalThis.PVIMDB;

const PLAYER_HTML = await readFile(join(ROOT, 'tests', 'fixtures', 'player.html'), 'utf8');
await mkdir(ARTIFACTS, { recursive: true });

// ---- Beklenen değerler: eklentiyle aynı kaynaktan (canlı IMDb) Node tarafında hesaplanır ----
const nodeResolver = NS.createResolver({
  client: NS.createImdbClient({ fetch: (u, i = {}) => fetch(u, { ...i, headers: { ...(i.headers || {}), 'user-agent': UA } }) }),
  cache: NS.createCache({ storage: NS.createMemoryStorage() }),
});
const expectRating = async (item) => {
  const r = await nodeResolver.resolve(item);
  const subject = r.episode || r.show;
  return { text: NS.formatRating(subject.rating), result: r };
};

// ---- Küçük test altyapısı ----
const results = [];
const consoleErrors = [];
function check(cond, message) {
  if (!cond) throw new Error(message);
}
async function scenario(name, fn) {
  if (FILTER.length && !FILTER.some((f) => name.toLowerCase().includes(f))) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: err.message });
    console.log(`  ✘ ${name}: ${err.message}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function badge(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-pvimdb-root]');
    if (!host || !host.shadowRoot) return null;
    const root = host.shadowRoot;
    const anchor = root.querySelector('.anchor');
    const b = root.querySelector('.badge');
    const panel = root.querySelector('.panel');
    const r = anchor.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      parent: host.parentElement ? (host.parentElement.className || host.parentElement.tagName) : null,
      inFullscreen: !!document.fullscreenElement && document.fullscreenElement.contains(host),
      visible: anchor.classList.contains('visible'),
      classes: anchor.className,
      opacity: parseFloat(getComputedStyle(anchor).opacity),
      text: b.textContent,
      status: b.className.replace('badge', '').trim(),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      badgeRect: { x: br.x, y: br.y, w: br.width, h: br.height },
      panelOpen: !panel.hidden,
      bars: root.querySelectorAll('.bar').length,
      barTitles: Array.from(root.querySelectorAll('.bar')).map((x) => x.title),
      currentLabel: (root.querySelector('.labels .current') || {}).textContent || null,
      panelText: panel.hidden ? '' : panel.textContent,
      scale: getComputedStyle(root.querySelector('.layer')).getPropertyValue('--k').trim(),
      hosts: document.querySelectorAll('[data-pvimdb-root]').length,
    };
  });
}

async function waitBadge(page, predicate, label, timeout = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await badge(page).catch(() => null);
    if (last && predicate(last)) return last;
    await sleep(150);
  }
  throw new Error(`${label} beklenirken zaman aşımı. Son durum: ${JSON.stringify(last && { text: last.text, status: last.status, visible: last.visible, parent: last.parent })}`);
}

async function shot(page, name) {
  await page.bringToFront();
  await sleep(250);
  await page.screenshot({ path: join(ARTIFACTS, name) });
}

function watchConsole(page, label) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location() || {};
    const text = msg.text();
    if ((loc.url || '').startsWith('chrome-extension://') || /PV IMDb|PVIMDB/.test(text)) consoleErrors.push(`[${label}] ${text} @ ${loc.url || ''}`);
  });
  page.on('pageerror', (err) => {
    if (/pvimdb|PVIMDB/i.test(String(err && err.stack))) consoleErrors.push(`[${label}] ${err.message}`);
  });
}

async function openPlayer(browser) {
  const page = await browser.newPage();
  watchConsole(page, 'player');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().startsWith('https://www.primevideo.com/detail/E2E')) {
      return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: PLAYER_HTML });
    }
    return req.continue();
  });
  await page.goto(PLAYER_URL, { waitUntil: 'load' });
  return page;
}

async function serviceWorker(browser, extId) {
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${extId}/`), { timeout: 15000 });
  return { target, worker: await target.worker() };
}

async function swEval(browser, extId, fn, ...args) {
  const { worker } = await serviceWorker(browser, extId);
  return worker.evaluate(fn, ...args);
}

// ---- Senaryolar ----
console.log('Beklenen değerler canlı IMDb’den alınıyor…');
const EXP = {
  s1e3: await expectRating({ title: 'The Boys', season: 1, episode: 3 }),
  s1e4: await expectRating({ title: 'The Boys', season: 1, episode: 4 }),
  s1e2: await expectRating({ title: 'The Boys', season: 1, episode: 2 }),
  rop: await expectRating({ title: 'Yüzüklerin Efendisi: Güç Yüzükleri', season: 2, episode: 1 }),
  movie: await expectRating({ title: 'Saltburn' }),
  reacher: await expectRating({ title: 'Reacher', season: 2, episode: 1 }),
  season: await nodeResolver.resolveSeason({ title: 'The Boys', season: 1, hints: { year: 2019, primeRating: 8.5 } }),
};
console.log(`  The Boys S1B3=${EXP.s1e3.text}, S1B4=${EXP.s1e4.text}, S1B2=${EXP.s1e2.text}, Güç Yüzükleri S2B1=${EXP.rop.text}, Saltburn=${EXP.movie.text}`);

console.log('Görünmez Chrome başlatılıyor…');
const browser = await puppeteer.launch(LAUNCH);
let extId;
try {
  extId = await browser.installExtension(EXT);
  console.log(`  Chrome ${await browser.version()} · eklenti ${extId}`);
  const page = await openPlayer(browser);
  const tabIds = () => swEval(browser, extId, () => chrome.tabs.query({ url: 'https://www.primevideo.com/*' }).then((t) => t.map((x) => x.id)));

  await scenario('Türkçe arayüzde bölüm puanı (The Boys 1. Sezon 3. Bölüm)', async () => {
    const s = await waitBadge(page, (b) => b.status === 'ok' && b.visible, 'puan');
    check(s.text.includes(EXP.s1e3.text), `rozet "${s.text}" beklenen puanı (${EXP.s1e3.text}) içermiyor`);
    check(/\d.*B oy|\d.*Mn oy/.test(s.text), `oy sayısı yok: ${s.text}`);
    check(s.text.includes('Dizi'), `dizi puanı yok: ${s.text}`);
    check(s.parent.includes('webPlayerSDKContainer'), `rozet oynatıcı kapsayıcısında değil: ${s.parent}`);
    check(s.hosts === 1, `birden fazla rozet var: ${s.hosts}`);
    const sub = await page.$eval('.atvwebplayersdk-subtitle-text', (el) => { const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, bottom: r.bottom }; });
    const cx = s.badgeRect.x + s.badgeRect.w / 2;
    check(Math.abs(cx - sub.cx) < 3, `rozet başlığın altında ortalı değil (${cx} vs ${sub.cx})`);
    check(s.badgeRect.y >= sub.bottom, 'rozet bölüm satırının altında değil');
    await shot(page, '01-tr-bolum.png');
  });

  await scenario('Araç çubuğu simgesinde puan ("8,3" biçimi) ve ayarın anında etkisi', async () => {
    const [tabId] = await tabIds();
    const badgeText = () => swEval(browser, extId, (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    const waitText = async (want, label) => {
      for (let i = 0; i < 40; i++) { if ((await badgeText()) === want) return; await sleep(150); }
      throw new Error(`${label}: simge metni "${await badgeText()}", beklenen "${want}"`);
    };
    const expected = NS.formatRating(EXP.s1e3.result.episode.rating);
    await waitText(expected, 'ilk durum');
    await swEval(browser, extId, () => chrome.storage.sync.set({ settings: { toolbarBadge: false } }));
    await waitText('', 'ayar kapatılınca');
    await swEval(browser, extId, () => chrome.storage.sync.remove('settings'));
    await waitText(expected, 'ayar açılınca');
  });

  await scenario('Kontroller gizlenince rozet de gizlenir, görününce geri gelir', async () => {
    await page.evaluate(() => window.__pv.hideControls());
    const t0 = Date.now();
    await waitBadge(page, (b) => !b.visible, 'gizlenme', 3000);
    const lag = Date.now() - t0;
    await sleep(300);
    const hidden = await badge(page);
    check(hidden.opacity < 0.05, `gizliyken opaklık ${hidden.opacity}`);
    await shot(page, '02-kontroller-gizli.png');
    await page.evaluate(() => window.__pv.showControls());
    await waitBadge(page, (b) => b.visible, 'yeniden görünme', 3000);
    console.log(`     (gizlenme gecikmesi ≈ ${lag} ms)`);
  });

  await scenario('Otomatik sonraki bölüme geçiş (1. Sezon 4. Bölüm)', async () => {
    await page.evaluate(() => window.__pv.setSubtitle('1. Sezon 4 Bölüm Türün Dişisi'));
    const s = await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.s1e4.text), 'yeni bölüm puanı');
    check(s.hosts === 1, 'çift rozet');
  });

  await scenario('Panel: sezon grafiği, tıklama oynatıcıya sızmaz, boşluk tuşu çalışır, spoiler yok', async () => {
    const before = await page.evaluate(() => ({ ...window.__pv.state }));
    const s0 = await badge(page);
    await page.mouse.click(s0.badgeRect.x + s0.badgeRect.w / 2, s0.badgeRect.y + s0.badgeRect.h / 2);
    const s = await waitBadge(page, (b) => b.panelOpen, 'panel açılması', 3000);
    const after = await page.evaluate(() => ({ ...window.__pv.state }));
    check(after.playToggles === before.playToggles, `rozet tıklaması oynatıcıya sızdı (${before.playToggles} → ${after.playToggles})`);
    check(s.bars === EXP.season.episodes.length, `grafikte ${s.bars} çubuk var, beklenen ${EXP.season.episodes.length}`);
    check(s.currentLabel === '4', `vurgulu bölüm ${s.currentLabel}`);
    const futureTitle = EXP.season.episodes.find((e) => e.episode === 6).title;
    check(!s.barTitles[5].includes(futureTitle), `sonraki bölüm adı görünüyor (spoiler): ${s.barTitles[5]}`);
    check(s.barTitles[2].includes(EXP.season.episodes[2].title), 'geçmiş bölüm adı görünmüyor');
    check(s.panelText.includes('IMDb'), 'panel metni eksik');
    await shot(page, '03-panel.png');
    await page.keyboard.press('Space');
    const afterKey = await page.evaluate(() => window.__pv.state.keyToggles);
    check(afterKey === before.keyToggles + 1, 'boşluk tuşu oynatıcıya ulaşmadı (odak rozete kaymış)');
    await page.keyboard.press('Escape');
    await waitBadge(page, (b) => !b.panelOpen, 'Esc ile kapanma', 2000);
  });

  await scenario('Paneldeki IMDb bağlantısı arka plan sekmesinde açılır', async () => {
    const s0 = await badge(page);
    await page.mouse.click(s0.badgeRect.x + s0.badgeRect.w / 2, s0.badgeRect.y + s0.badgeRect.h / 2);
    await waitBadge(page, (b) => b.panelOpen, 'panel', 3000);
    const created = new Promise((res) => browser.once('targetcreated', res));
    await page.evaluate(() => document.querySelector('[data-pvimdb-root]').shadowRoot.querySelector('.p-links a').click());
    const target = await Promise.race([created, sleep(8000).then(() => null)]);
    check(target, 'yeni sekme açılmadı');
    check(target.url().startsWith('https://www.imdb.com/title/' + EXP.s1e4.result.episode.id), `açılan adres: ${target.url()}`);
    const visible = await page.evaluate(() => document.visibilityState);
    check(visible === 'visible', 'oynatıcı sekmesi arka plana düştü');
    const p = await target.page();
    if (p) await p.close();
    await page.keyboard.press('Escape');
  });

  await scenario('Tam ekranda rozet görünür kalır', async () => {
    await page.click('#fsButton');
    await page.waitForFunction(() => !!document.fullscreenElement, { timeout: 5000 });
    const s = await waitBadge(page, (b) => b.inFullscreen && b.visible, 'tam ekranda rozet', 5000);
    check(s.status === 'ok', `tam ekranda durum ${s.status}`);
    await shot(page, '04-tam-ekran.png');
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement, { timeout: 5000 });
  });

  await scenario('Popup: durum, ayarlar (hep açık + sağ üst + boyut)', async () => {
    const [tabId] = await tabIds();
    const popup = await browser.newPage();
    watchConsole(popup, 'popup');
    await popup.setViewport({ width: 360, height: 640 });
    await popup.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`, { waitUntil: 'load' });
    await popup.waitForFunction(() => !document.getElementById('nowBody').hidden && document.getElementById('nowScore').textContent.length > 0, { timeout: 8000 });
    const now = await popup.$eval('#now', (el) => el.textContent);
    check(now.includes(EXP.s1e4.text) && now.includes('The Boys'), `popup durumu: ${now}`);
    await popup.screenshot({ path: join(ARTIFACTS, '05-popup.png'), fullPage: true });
    await popup.click('[data-setting="mode"] [data-value="always"]');
    await popup.click('[data-setting="position"] [data-value="top-right"]');
    await popup.click('[data-setting="size"] [data-value="l"]');
    await sleep(400);
    await page.bringToFront();
    await page.evaluate(() => window.__pv.hideControls());
    const s = await waitBadge(page, (b) => b.classes.includes('right') && b.scale === '1.18', 'ayarların uygulanması', 5000);
    await sleep(500);
    const s2 = await badge(page);
    check(s2.visible, '"hep açık" modunda kontroller gizliyken rozet görünmüyor');
    check(s2.badgeRect.x + s2.badgeRect.w > 1280 - 60, `rozet sağ üstte değil (x=${s2.badgeRect.x})`);
    await shot(page, '06-hep-acik-sag-ust.png');
    await page.evaluate(() => window.__pv.showControls());
    await popup.bringToFront();
    await popup.click('[data-setting="mode"] [data-value="controls"]');
    await popup.click('[data-setting="position"] [data-value="under-title"]');
    await popup.click('[data-setting="size"] [data-value="m"]');
    await sleep(300);
    await popup.close();
    await page.bringToFront();
    await waitBadge(page, (b) => b.classes.includes('center') && b.scale === '1', 'ayarların geri alınması', 5000);
    void s;
  });

  await scenario('Türkçe dizi adıyla eşleşme (Yüzüklerin Efendisi: Güç Yüzükleri)', async () => {
    await page.evaluate(() => { window.__pv.setTitle('Yüzüklerin Efendisi: Güç Yüzükleri'); window.__pv.setSubtitle('2. Sezon 1 Bölüm Göğün Altındaki Elf Kralları'); });
    const s = await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.rop.text) && !b.text.includes(EXP.s1e4.text + ' '), 'Güç Yüzükleri puanı');
    check(s.visible, 'görünmüyor');
  });

  await scenario('İngilizce arayüz ("Season 1, Ep. 2 Cherry")', async () => {
    await page.evaluate(() => { window.__pv.setLang('en-us'); window.__pv.setTitle('The Boys'); window.__pv.setSubtitle('Season 1, Ep. 2 Cherry'); });
    await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.s1e2.text), 'S1E2 puanı');
    await page.evaluate(() => window.__pv.setLang('tr-tr'));
  });

  await scenario('Film puanı (Saltburn)', async () => {
    await page.evaluate(() => { window.__pv.setTitle('Saltburn'); window.__pv.setSubtitle(null); });
    const s = await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.movie.text) && !b.text.includes('Dizi'), 'film puanı');
    await page.mouse.click(s.badgeRect.x + s.badgeRect.w / 2, s.badgeRect.y + s.badgeRect.h / 2);
    const p = await waitBadge(page, (b) => b.panelOpen, 'film paneli', 3000);
    check(p.bars === 0, 'filmde sezon grafiği olmamalı');
    check(p.panelText.includes('Saltburn'), 'panelde film adı yok');
    await page.keyboard.press('Escape');
  });

  await scenario('Bulunamayan dizi', async () => {
    await page.evaluate(() => { window.__pv.setTitle('Zzqx Olmayan Dizi Adı Qwv'); window.__pv.setSubtitle('1. Sezon 1 Bölüm Pilot'); });
    const s = await waitBadge(page, (b) => b.status === 'not-found', 'bulunamadı durumu');
    check(s.text.includes('bulunamadı'), `metin: ${s.text}`);
    await shot(page, '07-bulunamadi.png');
  });

  await scenario('Elle düzeltme (aynı adlı iki "The Grand Tour")', async () => {
    await page.evaluate(() => { window.__pv.setTitle('The Grand Tour'); window.__pv.setSubtitle('1. Sezon 1 Bölüm Kutsal Üçlü'); });
    await waitBadge(page, (b) => b.status === 'ok' || b.status === 'no-rating' || b.status === 'episode-not-found', 'ilk eşleşme');
    const [tabId] = await tabIds();
    const getState = () => swEval(browser, extId, (id) => chrome.tabs.sendMessage(id, { type: 'pv:getState' }), tabId);
    const first = await getState();
    const firstId = first.player.result.show.id;
    const popup = await browser.newPage();
    watchConsole(popup, 'popup');
    await popup.setViewport({ width: 360, height: 640 });
    await popup.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`, { waitUntil: 'load' });
    await popup.waitForSelector('#fixToggle:not([hidden])', { timeout: 8000 });
    await popup.click('#fixToggle');
    await popup.waitForFunction(() => document.querySelectorAll('#results li button').length >= 2, { timeout: 10000 });
    await sleep(800); // küçük afişler yüklensin
    const clearVisible = await popup.$eval('#clearOverride', (el) => el.getBoundingClientRect().height > 0);
    check(!clearVisible, 'elle seçim yokken "Otomatik eşleşmeye dön" görünüyor');
    await popup.screenshot({ path: join(ARTIFACTS, '08-elle-duzeltme.png'), fullPage: true });
    const picked = await popup.evaluate((currentId) => {
      const items = Array.from(document.querySelectorAll('#results li'));
      const other = items.find((li) => !li.classList.contains('current') && /Grand Tour/.test(li.textContent) && li.querySelector('button.primary'));
      if (!other) return null;
      other.querySelector('button').click();
      return other.querySelector('.name').textContent + ' ' + other.querySelector('.meta').textContent;
    }, firstId);
    check(picked, 'seçilecek diğer "The Grand Tour" bulunamadı');
    await popup.close();
    await page.bringToFront();
    let st = null;
    for (let i = 0; i < 60; i++) {
      st = await getState();
      if (st.player && st.player.result && st.player.result.matchedBy === 'override') break;
      await sleep(250);
    }
    check(st.player.result.matchedBy === 'override', `elle seçim uygulanmadı: ${JSON.stringify(st.player.result && st.player.result.matchedBy)}`);
    check(st.player.result.show.id !== firstId, 'eşleşme değişmedi');
    console.log(`     (otomatik: ${firstId} → elle: ${st.player.result.show.id}, ${picked})`);
    await swEval(browser, extId, () => chrome.storage.local.remove('overrides'));
  });

  await scenario('IMDb’ye ulaşılamayınca hata ve "tekrar dene"', async () => {
    const { target } = await serviceWorker(browser, extId);
    const session = await target.createCDPSession();
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.evaluate(() => { window.__pv.setTitle('Reacher'); window.__pv.setSubtitle('2. Sezon 1 Bölüm ATM'); });
    const s = await waitBadge(page, (b) => b.status === 'error', 'hata durumu', 40000);
    check(s.text.includes('Tekrar dene'), `metin: ${s.text}`);
    await shot(page, '09-hata.png');
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.mouse.click(s.badgeRect.x + s.badgeRect.w / 2, s.badgeRect.y + s.badgeRect.h / 2);
    await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.reacher.text), 'tekrar denemede puan', 30000);
    await session.detach();
  });

  await scenario('Oynatıcı kapanınca rozet ve simge temizlenir', async () => {
    await page.evaluate(() => window.__pv.closePlayer());
    await waitBadge(page, (b) => !b.visible, 'gizlenme', 3000);
    await sleep(6500);
    const [tabId] = await tabIds();
    const text = await swEval(browser, extId, (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    check(text === '', `simge temizlenmedi: "${text}"`);
    await page.evaluate(() => { window.__pv.openPlayer(); window.__pv.setTitle('The Boys'); window.__pv.setSubtitle('1. Sezon 3 Bölüm Al Bakalım'); });
    await waitBadge(page, (b) => b.status === 'ok' && b.visible && b.text.includes(EXP.s1e3.text), 'yeniden açılış');
  });

  await scenario('Service worker yeniden başlasa da çalışır', async () => {
    const { worker } = await serviceWorker(browser, extId);
    await worker.close().catch(() => {});
    await sleep(500);
    await page.evaluate(() => window.__pv.setSubtitle('1. Sezon 2 Bölüm Vişne'));
    await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.s1e2.text), 'yeniden başlatma sonrası puan', 30000);
  });

  await scenario('"Bölüm başında" modu: yeni bölümde 10 sn görünür, sonra gizlenir', async () => {
    await swEval(browser, extId, () => chrome.storage.sync.set({ settings: { mode: 'start' } }));
    await page.mouse.move(640, 600);
    await page.evaluate(() => window.__pv.hideControls());
    await sleep(500);
    const exp5 = NS.formatRating(EXP.season.episodes.find((e) => e.episode === 5).rating);
    const votes5 = NS.formatVotes(EXP.season.episodes.find((e) => e.episode === 5).votes);
    await page.evaluate(() => window.__pv.setSubtitle('1. Sezon 5 Bölüm Ruhun İlacı'));
    await waitBadge(page, (b) => b.status === 'ok' && b.visible && b.text.includes(exp5) && b.text.includes(votes5), 'yeni bölüm puanının görünmesi', 15000);
    const shownAt = Date.now();
    await waitBadge(page, (b) => !b.visible, '10 sn sonra gizlenme', 14000);
    const shownFor = Date.now() - shownAt;
    check(shownFor >= 9000, `rozet yalnızca ${shownFor} ms görünür kaldı (≈10 sn bekleniyordu)`);
    console.log(`     (kontroller gizliyken ${shownFor} ms görünür kaldı)`);
    await swEval(browser, extId, () => chrome.storage.sync.remove('settings'));
    await page.evaluate(() => window.__pv.showControls());
  });

  await scenario('Farklı ekran boyutlarında rozet orantılı ve ekranın içinde', async () => {
    await page.evaluate(() => { window.__pv.setTitle('The Boys'); window.__pv.setSubtitle('1. Sezon 3 Bölüm Al Bakalım'); window.__pv.showControls(); });
    await waitBadge(page, (b) => b.status === 'ok' && b.visible && b.text.includes(EXP.s1e3.text), 'puan');
    const sizes = [];
    for (const [w, h] of [[1920, 1080], [960, 540], [1280, 720]]) {
      await page.setViewport({ width: w, height: h });
      await sleep(700);
      const s = await badge(page);
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-pvimdb-root]').shadowRoot.querySelector('.badge')).fontSize));
      check(s.badgeRect.x >= 0 && s.badgeRect.x + s.badgeRect.w <= w && s.badgeRect.y >= 0, `${w}x${h}: rozet ekran dışında`);
      sizes.push({ w, fs });
      if (w === 1920) await shot(page, '11-1920x1080.png');
      if (w === 960) await shot(page, '12-960x540.png');
    }
    console.log(`     (yazı boyu: ${sizes.map((x) => `${x.w}px→${x.fs.toFixed(1)}px`).join(', ')})`);
    check(sizes[0].fs > sizes[1].fs, 'büyük ekranda rozet büyümüyor');
    check(sizes[1].fs >= 12, 'küçük pencerede rozet okunamayacak kadar küçük');
  });

  await scenario('Gerçek Prime Video dizi sayfasında bölüm listesi puanları (girişsiz)', async () => {
    const real = await browser.newPage();
    watchConsole(real, 'real-detail');
    await real.goto(REAL_DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Girişsiz yeni profilde çıkan çerez penceresini reddet (yalnızca görüntü için).
    await real.waitForFunction(() => Array.from(document.querySelectorAll('button, a, input[type="submit"]')).some((b) => /^(Reddet|Decline)$/i.test((b.textContent || b.value || '').trim())), { timeout: 15000 }).catch(() => {});
    await real.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button, a, input[type="submit"]')).find((x) => /^(Reddet|Decline)$/i.test((x.textContent || x.value || '').trim()));
      if (b) b.click();
    });
    await real.waitForFunction(() => document.querySelectorAll('li[data-testid="episode-list-item"] [data-pvimdb-chip]').length >= 1, { timeout: 30000 });
    await sleep(1500);
    const chips = await real.evaluate(() => Array.from(document.querySelectorAll('li[data-testid="episode-list-item"]')).map((li) => {
      // Görünen (kart ya da liste düzenindeki) etiket
      const all = Array.from(li.querySelectorAll('[data-pvimdb-chip]'));
      const chip = all.find((c) => c.getBoundingClientRect().width > 0) || null;
      const h = li.querySelector('h3');
      return { heading: h ? h.textContent : null, chip: chip ? chip.shadowRoot.querySelector('a').textContent : null, count: all.length };
    }));
    console.log(`     (${chips.length} bölüm; ilk: ${chips[0].heading} → ${chips[0].chip})`);
    check(chips.length === EXP.season.episodes.length, `liste ${chips.length} bölüm, beklenen ${EXP.season.episodes.length}`);
    chips.forEach((c, i) => {
      const exp = NS.formatRating(EXP.season.episodes[i].rating);
      check(c.chip && c.chip.includes(exp), `${i + 1}. bölüm etiketi "${c.chip}" (beklenen ${exp})`);
    });
    await real.evaluate(() => document.querySelector('li[data-testid="episode-list-item"]').scrollIntoView({ block: 'center' }));
    await sleep(600);
    await real.screenshot({ path: join(ARTIFACTS, '10-gercek-bolum-listesi.png') });
    await real.close();
  });

  await scenario('Oynatıcı olmayan sayfada rozet yok', async () => {
    const other = await browser.newPage();
    await other.setRequestInterception(true);
    other.on('request', (req) => (req.url().startsWith('https://www.primevideo.com/region/eu/storefront')
      ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Prime Video</title><h1>Ana sayfa</h1>' })
      : req.continue()));
    await other.goto('https://www.primevideo.com/region/eu/storefront', { waitUntil: 'load' });
    await sleep(2500);
    const n = await other.evaluate(() => document.querySelectorAll('[data-pvimdb-root], [data-pvimdb-chip]').length);
    check(n === 0, `oynatıcı olmayan sayfada ${n} öğe eklendi`);
    await other.close();
  });
} finally {
  await browser.close();
}

// Kurulum anında açık sekmeye enjeksiyon: ayrı, temiz bir görünmez tarayıcıda.
await scenario('Kurulumda açık Prime sekmesine sayfa yenilemeden yüklenir', async () => {
  const b2 = await puppeteer.launch(LAUNCH);
  try {
    const page = await openPlayer(b2);
    await sleep(800);
    check((await badge(page)) === null, 'eklenti kurulmadan rozet olmamalı');
    const reloads = await page.evaluate(() => performance.getEntriesByType('navigation').length);
    await b2.installExtension(EXT);
    await waitBadge(page, (b) => b.status === 'ok' && b.text.includes(EXP.s1e3.text), 'enjeksiyon sonrası puan', 30000);
    const sameDoc = await page.evaluate(() => performance.getEntriesByType('navigation').length);
    check(sameDoc === reloads, 'sayfa yenilenmiş');
  } finally {
    await b2.close();
  }
});

await scenario('Konsolda eklenti hatası yok', async () => {
  check(consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} senaryo başarılı. Ekran görüntüleri: ${ARTIFACTS}`);
if (failed.length) {
  for (const f of failed) console.log(`  ✘ ${f.name}\n     ${f.error}`);
  process.exitCode = 1;
}
