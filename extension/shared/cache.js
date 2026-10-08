// chrome.storage.local üzerinde süreli önbellek + eşzamanlı istekleri tek isteğe indirme.
(function (root, factory) {
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  /**
   * storage: chrome.storage.local benzeri { get(keys|null), set(obj), remove(keys) } (Promise döndürür).
   */
  function createCache(options) {
    const opts = Object.assign({ prefix: 'cache:', maxEntries: 400, now: () => Date.now() }, options);
    const storage = opts.storage;
    const memory = new Map();
    let writesSincePrune = 0;

    const fullKey = (key) => opts.prefix + key;

    async function get(key) {
      const k = fullKey(key);
      let entry = memory.get(k);
      if (!entry) {
        const stored = await storage.get(k);
        entry = stored && stored[k];
        if (entry) memory.set(k, entry);
      }
      if (!entry) return undefined;
      if (entry.expires && entry.expires <= opts.now()) {
        memory.delete(k);
        await storage.remove(k);
        return undefined;
      }
      return entry.value;
    }

    async function set(key, value, ttlMs) {
      const k = fullKey(key);
      const entry = { value, saved: opts.now(), expires: ttlMs ? opts.now() + ttlMs : 0 };
      memory.set(k, entry);
      await storage.set({ [k]: entry });
      if (++writesSincePrune >= 25) {
        writesSincePrune = 0;
        prune().catch(() => {});
      }
    }

    async function remove(key) {
      const k = fullKey(key);
      memory.delete(k);
      await storage.remove(k);
    }

    async function entries() {
      const all = (await storage.get(null)) || {};
      return Object.entries(all).filter(([k]) => k.startsWith(opts.prefix));
    }

    async function clear() {
      memory.clear();
      const keys = (await entries()).map(([k]) => k);
      if (keys.length) await storage.remove(keys);
      return keys.length;
    }

    // Süresi geçenleri ve en eski fazlalıkları siler.
    async function prune() {
      const now = opts.now();
      const list = await entries();
      const expired = list.filter(([, e]) => !e || (e.expires && e.expires <= now)).map(([k]) => k);
      const alive = list.filter(([k]) => !expired.includes(k)).sort((a, b) => (a[1].saved || 0) - (b[1].saved || 0));
      const overflow = alive.slice(0, Math.max(0, alive.length - opts.maxEntries)).map(([k]) => k);
      const doomed = expired.concat(overflow);
      for (const k of doomed) memory.delete(k);
      if (doomed.length) await storage.remove(doomed);
      return doomed.length;
    }

    return { get, set, remove, clear, prune };
  }

  /** Aynı anahtarla gelen eşzamanlı çağrıları tek promise'te birleştirir. */
  function createDeduper() {
    const inflight = new Map();
    return function dedupe(key, fn) {
      if (inflight.has(key)) return inflight.get(key);
      const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    };
  }

  /** Testler ve Node için bellek içi chrome.storage.local taklidi. */
  function createMemoryStorage(initial) {
    const data = Object.assign({}, initial);
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    return {
      data,
      async get(keys) {
        if (keys === null || keys === undefined) return clone(data);
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) if (k in data) out[k] = clone(data[k]);
        return out;
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = clone(v); },
      async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; },
    };
  }

  return { createCache, createDeduper, createMemoryStorage, HOUR, DAY };
});
