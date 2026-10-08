// Arka plan servisi: IMDb istekleri, önbellek, araç çubuğu rozeti, açık sekmelere enjeksiyon.
try {
  importScripts(
    'shared/episode-formats.js',
    'shared/parse.js',
    'shared/match.js',
    'shared/cache.js',
    'shared/imdb.js',
    'shared/settings.js',
    'shared/strings.js',
    'shared/resolver.js'
  );
} catch (err) {
  console.error('[PV IMDb] Modüller yüklenemedi:', err);
}

const NS = self.PVIMDB;
const client = NS.createImdbClient({ fetch: self.fetch.bind(self) });
const cache = NS.createCache({ storage: chrome.storage.local });

async function getOverrides() {
  const data = await chrome.storage.local.get(NS.OVERRIDES_KEY);
  return (data && data[NS.OVERRIDES_KEY]) || {};
}

const resolver = NS.createResolver({
  client,
  cache,
  getOverride: async (key) => (await getOverrides())[key] || null,
});

const TIER_COLORS = { great: '#1f8f4e', good: '#2a7d3f', ok: '#b07d12', low: '#b23b3b', none: '#5a6672' };

// Simge rozetini content script, isteğin hâlâ güncel olduğunu doğruladıktan sonra ister (eski sonuç yazılmasın).
async function updateToolbarBadge(tabId, rating) {
  if (tabId == null) return;
  try {
    const settings = await NS.loadSettings(chrome.storage.sync);
    if (!settings.toolbarBadge || typeof rating !== 'number') {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    await chrome.action.setBadgeText({ tabId, text: NS.formatRating(rating) });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: TIER_COLORS[NS.ratingTier(rating)] });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  } catch (err) {
    // sekme kapanmış olabilir
  }
}

function errorPayload(err) {
  return { code: (err && err.code) || 'unknown', message: (err && err.message) || String(err) };
}

async function handleMessage(msg, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  switch (msg && msg.type) {
    case 'pv:resolve': {
      try {
        return { ok: true, result: await resolver.resolve(msg.item) };
      } catch (err) {
        return { ok: false, error: errorPayload(err) };
      }
    }
    case 'pv:badge':
      await updateToolbarBadge(tabId, typeof msg.rating === 'number' ? msg.rating : null);
      return { ok: true };
    case 'pv:resolveSeason': {
      try {
        return { ok: true, result: await resolver.resolveSeason(msg.item) };
      } catch (err) {
        return { ok: false, error: errorPayload(err) };
      }
    }
    case 'pv:clearBadge':
      await updateToolbarBadge(tabId, null);
      return { ok: true };
    case 'pv:search': {
      try {
        return { ok: true, results: await resolver.searchTitles(msg.query) };
      } catch (err) {
        return { ok: false, error: errorPayload(err) };
      }
    }
    case 'pv:setOverride': {
      const overrides = await getOverrides();
      if (msg.override && msg.override.id) {
        overrides[msg.key] = Object.assign({ setAt: Date.now() }, msg.override);
      } else {
        delete overrides[msg.key];
      }
      await chrome.storage.local.set({ [NS.OVERRIDES_KEY]: overrides });
      return { ok: true };
    }
    case 'pv:clearCache': {
      const removed = await cache.clear();
      return { ok: true, removed };
    }
    case 'pv:openTab': {
      // Oynatıcıdan açılan IMDb sayfası arka planda açılır: tam ekran bozulmaz.
      if (!/^https:\/\/www\.imdb\.com\//.test(String(msg.url))) return { ok: false, error: { code: 'bad-url', message: 'Geçersiz adres' } };
      const props = { url: msg.url, active: false };
      if (sender && sender.tab) {
        props.index = sender.tab.index + 1;
        props.windowId = sender.tab.windowId;
      }
      await chrome.tabs.create(props);
      return { ok: true };
    }
    case 'pv:testConnection': {
      const started = Date.now();
      try {
        const [search, title] = await Promise.all([client.search('the boys'), client.getTitle('tt1190634')]);
        return { ok: true, ms: Date.now() - started, searchResults: search.length, sample: { name: title.name, rating: title.rating } };
      } catch (err) {
        return { ok: false, ms: Date.now() - started, error: errorPayload(err) };
      }
    }
    default:
      return { ok: false, error: { code: 'unknown-message', message: String(msg && msg.type) } };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: errorPayload(err) }));
  return true; // yanıt asenkron
});

// Açık Prime sekmelerinde content script yoksa (yeni kurulum, güncelleme, yeniden etkinleştirme) hemen yükle:
// sayfayı yenilemeye gerek kalmasın. Zaten çalışan bir kopya "ping"e yanıt verir ve atlanır.
async function ensureInjected() {
  const contentScripts = chrome.runtime.getManifest().content_scripts || [];
  for (const cs of contentScripts) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: cs.matches });
    } catch (err) {
      continue;
    }
    for (const tab of tabs) {
      // Yüklenmekte olan sekmeye script zaten manifest yoluyla gelecek.
      if (tab.discarded || tab.id == null || tab.status !== 'complete') continue;
      const alive = await chrome.tabs.sendMessage(tab.id, { type: 'pv:ping' }).then((r) => !!(r && r.ok), () => false);
      if (alive) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs.js });
      } catch (err) {
        // ör. sekme hata sayfasında — atla
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureInjected();
  cache.prune().catch(() => {});
});
// Eklenti kapatılıp açıldığında onInstalled tetiklenmez; service worker her başladığında kontrol et.
ensureInjected();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-badge') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'pv:toggle' }).catch(() => {});
});
