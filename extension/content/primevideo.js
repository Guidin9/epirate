// Prime Video site adaptörü: oynatıcıdan ve dizi sayfasından bilgi okur (yalnızca DOM okuma).
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;

  // Prime'ın canlı oynatıcı kodunda doğrulanan seçiciler (bkz. tools/sync-prime-formats.mjs).
  const SEL = {
    title: '.atvwebplayersdk-title-text',
    subtitle: '.atvwebplayersdk-subtitle-text',
    episodeInfo: '.atvwebplayersdk-episode-info',
    sdkContainer: '.webPlayerSDKContainer',
    uiContainer: '.webPlayerUIContainer',
    listItem: 'li[data-testid="episode-list-item"]',
    listTitle: '[data-automation-id^="ep-title-episode-"]',
    seasonSelector: '[data-testid="dp-season-selector"]',
    titleArt: '[data-testid="title-art"] img[alt]',
    yearBadge: '[data-automation-id="release-year-badge"]',
    imdbBadge: '[data-automation-id="imdb-rating-badge"]',
    hydration: '#dv-web-page-hydration-data',
  };

  const textOf = (el) => (el ? NS.normalizeSpaces(el.textContent) : '');

  function isRendered(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Oynatıcı açıksa başlık/bölüm öğeleri ve metinleri; değilse null. */
  function readPlayer() {
    const titles = Array.from(document.querySelectorAll(SEL.title)).filter((el) => textOf(el));
    if (!titles.length) return null;
    // Normal katman ve resim-içinde-resim katmanı aynı anda olabilir: görüneni seç.
    const titleEl = titles.find(isRendered) || titles[0];
    const container = titleEl.closest(SEL.sdkContainer) || titleEl.closest(SEL.uiContainer);
    if (container && !isRendered(container)) return null;
    const siblings = titleEl.parentElement;
    const scope = container || document;
    const subtitleEl = (siblings && siblings.querySelector(SEL.subtitle)) || scope.querySelector(SEL.subtitle) || scope.querySelector(SEL.episodeInfo);
    return {
      titleEl,
      subtitleEl: subtitleEl && textOf(subtitleEl) ? subtitleEl : null,
      container,
      title: textOf(titleEl),
      subtitle: textOf(subtitleEl),
      lang: document.documentElement.lang || navigator.language || '',
    };
  }

  /** Oynatıcı bilgisinden arka plana gönderilecek öğe (ipuçları istenirse eklenir; her turda gerekmez). */
  function buildItem(snap, withHints) {
    const parsed = snap.subtitle ? NS.parseEpisodeLine(snap.subtitle, snap.lang) : null;
    const hints = withHints ? readDetailHints(snap.title) : {};
    if (parsed) {
      return { kind: 'episode', title: snap.title, season: parsed.season, episode: parsed.episode, episodeTitle: parsed.episodeTitle, hints };
    }
    if (snap.subtitle) {
      // Numarasız bölüm (özel bölüm vb.): bölüm adıyla eşleştirilecek.
      return { kind: 'episode', title: snap.title, season: null, episode: null, episodeTitle: snap.subtitle, hints };
    }
    return { kind: 'movie', title: snap.title, hints };
  }

  // ---- Dizi sayfası ----

  /** "Prime Video: The Boys - 1. Sezon" → { title: 'The Boys', season: 1 } */
  function parseDocumentTitle(raw) {
    let s = NS.normalizeSpaces(raw);
    s = s.replace(/^(?:prime video|amazon(?:\.[a-z.]+)?)\s*:\s*/i, '').replace(/\s*[|–-]\s*prime video\s*$/i, '');
    s = s.replace(/^(?:watch|izle)\s+/i, '');
    const idx = s.lastIndexOf(' - ');
    if (idx > 0) {
      const tail = s.slice(idx + 3);
      const num = /\d{1,3}/.exec(tail);
      if (num && tail.length <= 32) return { title: s.slice(0, idx).trim(), season: parseInt(num[0], 10) };
    }
    return { title: s, season: null };
  }

  // Sayfa verisi (~200 KB) yalnızca öğe değişince yeniden okunur.
  let hydrationCache = { el: null, value: null };
  function readHydration() {
    const el = document.querySelector(SEL.hydration);
    if (!el) return null;
    if (hydrationCache.el === el) return hydrationCache.value;
    let value = null;
    try {
      const json = JSON.parse(el.textContent || '');
      const header = json && json.init && json.init.preparations && json.init.preparations.body && json.init.preparations.body.atf
        && json.init.preparations.body.atf.state && json.init.preparations.body.atf.state.detail && json.init.preparations.body.atf.state.detail.headerDetail;
      const season = header && Object.values(header).find((h) => h && h.titleType === 'season');
      if (season) value = { title: season.parentTitle || null, season: typeof season.seasonNumber === 'number' ? season.seasonNumber : null, year: season.releaseYear || null };
    } catch (err) {
      value = null;
    }
    hydrationCache = { el, value };
    return value;
  }

  function detailTitle() {
    const fromDoc = parseDocumentTitle(document.title);
    const art = document.querySelector(SEL.titleArt);
    const hyd = readHydration();
    return {
      title: (art && NS.normalizeSpaces(art.getAttribute('alt'))) || fromDoc.title || (hyd && hyd.title) || '',
      docSeason: fromDoc.season,
      hydration: hyd,
    };
  }

  function detailSeason(info) {
    const selector = document.querySelector(SEL.seasonSelector);
    if (selector) {
      const labelled = selector.querySelector('[aria-label]');
      const sources = [labelled && labelled.getAttribute('aria-label'), textOf(selector)];
      for (const s of sources) {
        const m = s && /\d{1,3}/.exec(s);
        if (m) return parseInt(m[0], 10);
      }
    }
    if (info.docSeason != null) return info.docSeason;
    if (info.hydration && info.hydration.season != null) return info.hydration.season;
    return null;
  }

  /** Dizi sayfasındaki yıl ve Prime'ın gösterdiği IMDb dizi puanı (aynı diziye aitse). */
  function readDetailHints(expectedTitle) {
    // Ana sayfadaki vitrinlerde başka dizilerin rozetleri olabilir: yalnızca dizi sayfasında kullan.
    if (!/\/detail\//.test(location.pathname)) return {};
    const yearEl = document.querySelector(SEL.yearBadge);
    const ratingEl = document.querySelector(SEL.imdbBadge);
    if (!yearEl && !ratingEl) return {};
    if (expectedTitle) {
      const info = detailTitle();
      if (info.title && NS.similarity(info.title, expectedTitle) < 0.75) return {};
    }
    const hints = {};
    const year = NS.parseYear(textOf(yearEl));
    if (year) hints.year = year;
    const rating = ratingEl ? NS.parseRatingText(textOf(ratingEl) || ratingEl.getAttribute('aria-label') || '') : null;
    if (rating != null) hints.primeRating = rating;
    return hints;
  }

  /** Dizi sayfası ve bölüm listesi; liste yoksa null. */
  function readDetailPage() {
    const lis = Array.from(document.querySelectorAll(SEL.listItem));
    if (!lis.length) return null;
    const info = detailTitle();
    const season = detailSeason(info) ?? 1;
    if (!info.title) return null;
    const episodes = [];
    for (const li of lis) {
      // Prime başlığı iki kez çiziyor (liste ve kart düzeni; biri gizli): ikisini de al.
      const box = li.querySelector(SEL.listTitle);
      const candidates = Array.from(li.querySelectorAll('h3, h2, h4'));
      if (!candidates.length && box) candidates.push(box);
      let parsed = null;
      const headings = [];
      for (const h of candidates) {
        const p = NS.parseListEpisodeTitle(textOf(h));
        if (!p || (parsed && p.episode !== parsed.episode)) continue;
        parsed = parsed || p;
        headings.push(h);
      }
      if (!parsed) continue;
      episodes.push({ li, headings, episode: parsed.episode, title: parsed.title });
    }
    if (!episodes.length) return null;
    return { title: info.title, season, hints: readDetailHints(null), episodes };
  }

  NS.prime = { SEL, readPlayer, buildItem, readDetailPage, readDetailHints, parseDocumentTitle, isRendered, textOf };
})();
