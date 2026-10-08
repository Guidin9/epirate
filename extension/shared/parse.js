// Prime Video'nun bölüm satırını ayrıştırma ve başlıkları eşleştirmeye hazırlama.
// Content script, service worker ve Node testleri aynı dosyayı kullanır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof require === 'function') require('./episode-formats.js');
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SPACES = /[\s   -​  　﻿]+/g;
  const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
  const EDGE_QUOTES = /^[\s"'“”„‟«»‹›「」『』]+|[\s"'“”„‟«»‹›「」『』]+$/g;
  const MAX_SEASON = 200;
  const MAX_EPISODE = 5000;

  function normalizeSpaces(text) {
    return String(text == null ? '' : text).replace(BIDI_MARKS, '').replace(SPACES, ' ').trim();
  }

  function stripQuotes(text) {
    return normalizeSpaces(text).replace(EDGE_QUOTES, '').trim();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Kalıptaki sabit metni esnek bir desene çevirir: boşluklar isteğe bağlı olur.
  function literalPattern(literal) {
    const clean = normalizeSpaces(literal);
    if (!clean) return '\\s*';
    return '\\s*' + clean.split(' ').map(escapeRegExp).join('\\s*') + '\\s*';
  }

  // "{{seasonNumber}}. Sezon {{episodeNumber}} Bölüm" → regex + yakalama sırası
  function compileLongTemplate(template) {
    const parts = String(template).split(/(\{\{seasonNumber\}\}|\{\{episodeNumber\}\})/);
    const order = [];
    let body = '';
    for (const part of parts) {
      if (part === '{{seasonNumber}}') { order.push('season'); body += '(\\d{1,4})'; }
      else if (part === '{{episodeNumber}}') { order.push('episode'); body += '(\\d{1,5})'; }
      else body += literalPattern(part);
    }
    if (order.length !== 2) return null;
    return { re: new RegExp('^' + body + '(?:[-–—:·|,]\\s*)?(.*)$', 'iu'), order };
  }

  // Canlı yayın / kısa biçim: "S1 E3", "С.1 Эп.3"
  function compileShortTemplate(seasonShort, episodeShort) {
    const s = normalizeSpaces(seasonShort);
    const e = normalizeSpaces(episodeShort);
    if (!s || !e) return null;
    const body = '\\s*' + escapeRegExp(s) + '\\s*(\\d{1,4})\\s+' + escapeRegExp(e) + '\\s*(\\d{1,5})\\b';
    return { re: new RegExp('^' + body + '(?:\\s*[-–—:·|,]?\\s*)(.*)$', 'iu'), order: ['season', 'episode'] };
  }

  // Hiçbir dil kalıbı tutmazsa son çare desenler.
  const GENERIC = [
    {
      re: /^\s*(?:season|staffel|saison|temporada|stagione|seizoen|sezon|säsong|sæson|sesong|kausi|řada|sezonul|évad|сезон|s)\s*\.?\s*(\d{1,3})\s*[,.:;·\-–—x×]?\s*(?:episode|episodio|épisode|ep|ép|e|folge|f|afl|aflevering|avsnitt|jakso|odc|bölüm|böl|b|эпизод|эп|серия)\s*\.?\s*(\d{1,5})\b\.?\s*[-–—:·|,]?\s*(.*)$/iu,
      order: ['season', 'episode'],
    },
    {
      re: /^\s*(\d{1,3})\s*\.?\s*(?:sezon|season|staffel|évad|сезон)\s*[,.]?\s*(\d{1,5})\s*\.?\s*(?:bölüm|böl|b|episode|ep|epizód|folge|серия)\b\.?\s*[-–—:·|,]?\s*(.*)$/iu,
      order: ['season', 'episode'],
    },
  ];

  let compiled = null;
  function compiledFormats() {
    if (compiled) return compiled;
    const formats = (root.PVIMDB && root.PVIMDB.EPISODE_FORMATS) || {};
    const longs = [];
    const shorts = [];
    const seenLong = new Map();
    const seenShort = new Set();
    for (const [locale, f] of Object.entries(formats)) {
      const longKey = normalizeSpaces(f.long);
      if (seenLong.has(longKey)) {
        seenLong.get(longKey).locales.push(locale);
      } else {
        const c = compileLongTemplate(f.long);
        if (c) {
          const entry = { ...c, locales: [locale] };
          seenLong.set(longKey, entry);
          longs.push(entry);
        }
      }
      const shortKey = normalizeSpaces(f.seasonShort) + '|' + normalizeSpaces(f.episodeShort);
      if (!seenShort.has(shortKey)) {
        seenShort.add(shortKey);
        const c = compileShortTemplate(f.seasonShort, f.episodeShort);
        if (c) shorts.push({ ...c, locales: [locale] });
      }
    }
    compiled = { longs, shorts };
    return compiled;
  }

  function languageOf(locale) {
    return String(locale || '').toLowerCase().split(/[-_]/)[0];
  }

  // Tercih edilen dilin kalıplarını öne alır.
  function ordered(list, preferredLang) {
    const lang = languageOf(preferredLang);
    if (!lang) return list;
    const first = [];
    const rest = [];
    for (const item of list) (item.locales.some((l) => languageOf(l) === lang) ? first : rest).push(item);
    return first.concat(rest);
  }

  function applyPattern(pattern, text, source) {
    const m = pattern.re.exec(text);
    if (!m) return null;
    const values = {};
    pattern.order.forEach((name, i) => { values[name] = parseInt(m[i + 1], 10); });
    if (!(values.season >= 0 && values.season <= MAX_SEASON && values.episode >= 0 && values.episode <= MAX_EPISODE)) return null;
    const rest = stripQuotes(m[pattern.order.length + 1] || '');
    return { season: values.season, episode: values.episode, episodeTitle: rest || null, format: source };
  }

  /**
   * Oynatıcının ikinci satırını ayrıştırır.
   * "1. Sezon 3 Bölüm Get Some" → { season: 1, episode: 3, episodeTitle: "Get Some" }
   * Bölüm bilgisi yoksa null döner (film ya da numarasız özel bölüm).
   */
  function parseEpisodeLine(text, preferredLang) {
    const line = normalizeSpaces(text);
    if (!line || !/\d/.test(line)) return null;
    const { longs, shorts } = compiledFormats();
    for (const p of ordered(longs, preferredLang)) {
      const r = applyPattern(p, line, 'long:' + p.locales[0]);
      if (r) return r;
    }
    for (const p of ordered(shorts, preferredLang)) {
      const r = applyPattern(p, line, 'short:' + p.locales[0]);
      if (r) return r;
    }
    for (const p of GENERIC) {
      const r = applyPattern(p, line, 'generic');
      if (r) return r;
    }
    return null;
  }

  /** Dizi sayfasındaki bölüm başlığı: '1. “Oyunun Adı”' → { episode: 1, title: 'Oyunun Adı' } */
  function parseListEpisodeTitle(text) {
    const line = normalizeSpaces(text);
    const m = /^(\d{1,5})\s*[.):\-–—]?\s*(.*)$/u.exec(line);
    if (!m) return null;
    return { episode: parseInt(m[1], 10), title: stripQuotes(m[2]) || null };
  }

  const TR_FOLD = { İ: 'i', I: 'i', ı: 'i', Ş: 's', ş: 's', Ğ: 'g', ğ: 'g', Ü: 'u', ü: 'u', Ö: 'o', ö: 'o', Ç: 'c', ç: 'c' };

  /** Karşılaştırma anahtarı: küçük harf, aksansız, noktalamasız. "Yüzüklerin Efendisi: Güç" → "yuzuklerin efendisi guc" */
  function normalizeTitle(text) {
    let t = normalizeSpaces(text).replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => TR_FOLD[c]);
    t = t.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
    t = t.replace(/&/g, ' and ').replace(/['’`´ʼ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  const NOISE = /(4k|uhd|ultra\s*hd|\bhd\b|\bsd\b|hdr|dolby|\bov\b|\bomu\b|\bdt\b|deutsch|dub|dublaj|altyaz|subbed|dubbed|subtitled|t[üu]rk[çc]e|turkish|english|original|orijinal|version|versiyon|director.?s cut|extended|uncut|prime video|amazon original|season|sezon|staffel|saison|temporada|series)/i;
  const TRAILING_SEASON = [
    /\s*[-–—:,|]?\s*(?:season|sezon|staffel|saison|temporada|stagione|seizoen|series|series)\s*\d{1,3}\s*$/i,
    /\s*[-–—:,|]?\s*\d{1,3}\s*\.?\s*(?:sezon|season|évad|staffel)\s*$/i,
  ];

  /** Prime'daki görünen adı IMDb aramasına uygun hale getirir: "The Boys (4K UHD)" → "The Boys" */
  function cleanTitle(text) {
    let t = normalizeSpaces(text);
    t = t.replace(/^(?:prime video|amazon(?:\.[a-z.]+)?)\s*:\s*/i, '');
    t = t.replace(/\s*[([{]([^)\]}]*)[)\]}]\s*/g, (all, inner) => (NOISE.test(inner) ? ' ' : all));
    for (const re of TRAILING_SEASON) t = t.replace(re, '');
    return normalizeSpaces(t);
  }

  /** Arama başarısız olursa denenecek varyantlar (sırayla). */
  function titleVariants(text) {
    const clean = cleanTitle(text);
    const out = [];
    const add = (v) => {
      const s = normalizeSpaces(v);
      if (s.length >= 2 && !out.some((o) => normalizeTitle(o) === normalizeTitle(s))) out.push(s);
    };
    add(clean);
    const possessive = clean.replace(/^[\p{L}.\- ]{2,30}?['’]s\s+/u, '');
    if (possessive !== clean) add(possessive);
    const parts = clean.split(/\s*(?::|\s[-–—]\s)\s*/).filter(Boolean);
    if (parts.length > 1) {
      add(parts[parts.length - 1]);
      add(parts[0]);
    }
    return out;
  }

  function bigrams(text) {
    const s = ' ' + text + ' ';
    const grams = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      grams.set(g, (grams.get(g) || 0) + 1);
    }
    return grams;
  }

  /** 0..1 arası başlık benzerliği (Dice katsayısı, normalize edilmiş metin üzerinde). */
  function similarity(a, b) {
    const x = normalizeTitle(a);
    const y = normalizeTitle(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const gx = bigrams(x);
    const gy = bigrams(y);
    let overlap = 0;
    let total = 0;
    for (const [g, n] of gx) { total += n; if (gy.has(g)) overlap += Math.min(n, gy.get(g)); }
    for (const n of gy.values()) total += n;
    const dice = (2 * overlap) / total;
    const contained = (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
    return contained ? Math.max(dice, 0.85) : dice;
  }

  /** "IMDb 8,5/10" → 8.5 */
  function parseRatingText(text) {
    const t = normalizeSpaces(text);
    const m = /(\d{1,2}(?:[.,]\d)?)\s*\/\s*10/.exec(t) || /(\d{1,2}[.,]\d)/.exec(t);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return v >= 0 && v <= 10 ? v : null;
  }

  function parseYear(text) {
    const m = /\b(19\d{2}|20\d{2})\b/.exec(normalizeSpaces(text));
    return m ? parseInt(m[1], 10) : null;
  }

  return {
    normalizeSpaces,
    stripQuotes,
    parseEpisodeLine,
    parseListEpisodeTitle,
    normalizeTitle,
    cleanTitle,
    titleVariants,
    similarity,
    parseRatingText,
    parseYear,
  };
});
