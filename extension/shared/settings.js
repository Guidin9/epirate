// Kullanıcı ayarları (chrome.storage.sync → 'settings' anahtarı).
(function (root, factory) {
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SETTINGS_KEY = 'settings';
  const OVERRIDES_KEY = 'overrides';

  const DEFAULT_SETTINGS = Object.freeze({
    mode: 'controls',        // controls | start | always
    position: 'under-title', // under-title | top-left | top-right | bottom-left | bottom-right
    size: 'm',               // s | m | l
    showVotes: true,
    showSeriesRating: true,
    seasonChart: true,
    listRatings: true,
    movies: true,
    toolbarBadge: true,
  });

  const CHOICES = {
    mode: ['controls', 'start', 'always'],
    position: ['under-title', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
    size: ['s', 'm', 'l'],
  };

  function sanitizeSettings(raw) {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in raw)) continue;
      const value = raw[key];
      if (CHOICES[key]) { if (CHOICES[key].includes(value)) out[key] = value; }
      else if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  }

  async function loadSettings(area) {
    const data = await area.get(SETTINGS_KEY);
    return sanitizeSettings(data && data[SETTINGS_KEY]);
  }

  async function saveSettings(area, patch) {
    const next = sanitizeSettings(Object.assign({}, await loadSettings(area), patch));
    await area.set({ [SETTINGS_KEY]: next });
    return next;
  }

  return { SETTINGS_KEY, OVERRIDES_KEY, DEFAULT_SETTINGS, CHOICES, sanitizeSettings, loadSettings, saveSettings };
});
