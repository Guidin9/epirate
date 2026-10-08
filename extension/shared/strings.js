// Arayüz metinleri (chrome.i18n, 12 dil) ve dile göre sayı/tarih biçimlendirme.
// Metinlerin kaynağı: tools/i18n/messages.mjs → _locales/<dil>/messages.json (npm run locales).
(function (root, factory) {
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const i18n = root.chrome && root.chrome.i18n && typeof root.chrome.i18n.getMessage === 'function' ? root.chrome.i18n : null;

  // Tarayıcı dışında (Node testleri) İngilizce dil dosyası kullanılır.
  let fallback = null;
  function fallbackMessages() {
    if (fallback) return fallback;
    try {
      fallback = typeof require === 'function' ? require('../_locales/en/messages.json') : {};
    } catch (err) {
      fallback = {};
    }
    return fallback;
  }

  const asArgs = (subs) => (subs == null ? [] : (Array.isArray(subs) ? subs : [subs]).map(String));

  // chrome.i18n ile aynı kural: $AD$ → yer tutucunun içeriği ($1…) → argüman.
  function substitute(entry, args) {
    const named = entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (all, name) => {
      const ph = entry.placeholders && entry.placeholders[name.toLowerCase()];
      return ph ? ph.content : all;
    });
    return named.replace(/\$(\d)/g, (all, n) => (args[n - 1] !== undefined ? args[n - 1] : ''));
  }

  /** Arayüz metni: t('seasonEpisode', [1, 3]) → "Season 1 · Episode 3" (tarayıcının dilinde). */
  function t(key, subs) {
    const args = asArgs(subs);
    if (i18n) {
      const message = i18n.getMessage(key, args);
      if (message) return message;
    }
    const entry = fallbackMessages()[key];
    return entry ? substitute(entry, args) : key;
  }

  function uiLocale() {
    try {
      if (i18n && typeof i18n.getUILanguage === 'function') return i18n.getUILanguage() || 'en';
    } catch (err) { /* bağlam kapanmış olabilir */ }
    return 'en';
  }

  /** "rtl" (Arapça) ya da "ltr". */
  function textDirection() {
    return (i18n && i18n.getMessage('@@bidi_dir')) || 'ltr';
  }

  const numberFormats = new Map();
  function numberFormat(locale, options) {
    const key = locale + '|' + JSON.stringify(options);
    if (!numberFormats.has(key)) {
      let f;
      try {
        // Arapça arayüzde de puanlar 0-9 rakamlarıyla gösterilir (oynatıcıyla tutarlı).
        f = new Intl.NumberFormat(locale, Object.assign({ numberingSystem: 'latn' }, options));
      } catch (err) {
        f = new Intl.NumberFormat('en', options);
      }
      numberFormats.set(key, f);
    }
    return numberFormats.get(key);
  }

  /** 8.3 → "8,3" (tr) / "8.3" (en) */
  function formatRating(value, locale) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return numberFormat(locale || uiLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }

  /** 30456 → "30 B" (tr) / "30K" (en) */
  function formatVotes(value, locale) {
    if (typeof value !== 'number' || !(value > 0)) return '0';
    return numberFormat(locale || uiLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  /** 30456 → "30 B oy" / "30K votes" */
  function votesText(value, locale) {
    return t('votesCount', [formatVotes(value, locale)]);
  }

  /** "2019-07-26" → "26 Tem 2019" / "Jul 26, 2019" */
  function formatDate(iso, locale) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    try {
      return d.toLocaleDateString(locale || uiLocale(), { day: 'numeric', month: 'short', year: 'numeric', numberingSystem: 'latn' });
    } catch (err) {
      return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  /** Puan bandı (sezon grafiği ve liste etiketlerinin rengi). */
  function ratingTier(value) {
    if (typeof value !== 'number') return 'none';
    if (value >= 8.5) return 'great';
    if (value >= 7.5) return 'good';
    if (value >= 6.5) return 'ok';
    return 'low';
  }

  return { t, uiLocale, textDirection, formatRating, formatVotes, votesText, formatDate, ratingTier };
});
