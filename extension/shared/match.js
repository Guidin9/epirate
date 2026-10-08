// IMDb arama sonuçlarından doğru diziyi/filmi seçme ve bölümü bulma.
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof require === 'function') require('./parse.js');
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const EPISODIC_TYPES = ['tvSeries', 'tvMiniSeries'];
  const MOVIE_TYPES = ['movie', 'tvMovie', 'video', 'tvSpecial', 'tvShort', 'short'];

  const P = () => root.PVIMDB;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function typeFits(type, kind) {
    if (kind === 'episode') return EPISODIC_TYPES.includes(type);
    if (kind === 'movie') return MOVIE_TYPES.includes(type);
    return EPISODIC_TYPES.includes(type) || MOVIE_TYPES.includes(type);
  }

  /**
   * Arama sonuçlarını puanlar. API'nin kendi sırası (Türkçe/yerel adları da eşleştiriyor),
   * başlık benzerliği, popülerlik ve yıl ipucu birlikte değerlendirilir.
   */
  function rankCandidates(query, suggestions, options) {
    const { kind, year } = options || {};
    const { normalizeTitle, similarity } = P();
    const qn = normalizeTitle(query);
    const ranked = [];
    (suggestions || []).forEach((s, index) => {
      if (!s || !/^tt\d+$/.test(s.id) || !typeFits(s.type, kind)) return;
      const sn = normalizeTitle(s.title);
      const sim = similarity(qn, sn);
      const position = Math.max(0, 1 - index * 0.12);
      const popularity = s.rank ? clamp(1 - Math.log10(Math.max(1, s.rank)) / 6, 0, 1) : 0;
      let score = 0.5 * sim + 0.3 * position + 0.2 * popularity;
      if (sn && sn === qn) score += 0.15;
      if (year && s.year) {
        if (kind === 'movie') score += Math.abs(s.year - year) <= 1 ? 0.15 : -Math.min(0.4, Math.abs(s.year - year) * 0.04);
        else if (s.year > year + 1) score -= 0.5; // dizi, bu sezondan sonra başlamış olamaz
      }
      ranked.push(Object.assign({}, s, { score, sim, index }));
    });
    return ranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Bölümü önce numarayla, olmazsa bölüm adıyla bulur.
   * Numara tutup ad hiç tutmuyorsa ve başka bir bölümün adı birebir tutuyorsa (farklı numaralandırma) adı tercih eder.
   */
  function findEpisode(episodes, query) {
    const { similarity } = P();
    const { season, episode, episodeTitle } = query || {};
    const list = episodes || [];
    let bestByTitle = null;
    if (episodeTitle) {
      for (const e of list) {
        if (!e.title) continue;
        const s = similarity(episodeTitle, e.title);
        if (!bestByTitle || s > bestByTitle.sim) bestByTitle = { episode: e, sim: s };
      }
    }
    if (season != null && episode != null) {
      const byNumber = list.find((e) => e.season === season && e.episode === episode);
      if (byNumber) {
        const sim = episodeTitle && byNumber.title ? similarity(episodeTitle, byNumber.title) : null;
        if (bestByTitle && bestByTitle.episode !== byNumber && bestByTitle.sim >= 0.9 && sim !== null && sim < 0.4) {
          return { episode: bestByTitle.episode, matchedBy: 'title', titleSim: bestByTitle.sim };
        }
        return { episode: byNumber, matchedBy: 'number', titleSim: sim };
      }
    }
    if (bestByTitle && bestByTitle.sim >= 0.82) return { episode: bestByTitle.episode, matchedBy: 'title', titleSim: bestByTitle.sim };
    return null;
  }

  /**
   * Bulunan dizi, Prime'ın sayfasındaki ipuçlarıyla çelişiyor mu?
   * (Prime'ın gösterdiği IMDb dizi puanı belirgin farklı ya da dizi bu sezonun yılından önce bitmiş/sonra başlamış.)
   */
  function contradictsHints(show, hints) {
    if (!show || !hints) return false;
    if (typeof hints.primeRating === 'number' && typeof show.rating === 'number' && Math.abs(show.rating - hints.primeRating) > 0.3) return true;
    if (hints.year) {
      if (show.year && show.year > hints.year + 1) return true;
      if (show.endYear && show.endYear < hints.year - 1) return true;
    }
    return false;
  }

  /**
   * Birden çok aday bölümü bulduysa en olası olanı seçer:
   * aday puanı + bölüm adı benzerliği + Prime'ın gösterdiği dizi puanına yakınlık.
   */
  function pickBest(found, hints) {
    const primeRating = hints && typeof hints.primeRating === 'number' ? hints.primeRating : null;
    // Kullanıcının elle seçtiği eşleşme puanlamaya girmeden kazanır.
    const override = (found || []).find((f) => f.candidate.override);
    if (override) return Object.assign({}, override, { total: Infinity });
    let best = null;
    for (const f of found) {
      let total = f.candidate.score;
      if (f.candidate.mapped && !contradictsHints(f.show, hints)) total += 0.3;
      if (f.hit && typeof f.hit.titleSim === 'number') total += 0.4 * f.hit.titleSim;
      if (primeRating !== null && f.show && typeof f.show.rating === 'number') {
        total += 0.4 * (1 - Math.min(Math.abs(f.show.rating - primeRating), 1));
      }
      if (!best || total > best.total) best = Object.assign({}, f, { total });
    }
    return best;
  }

  return { rankCandidates, findEpisode, pickBest, contradictsHints, EPISODIC_TYPES, MOVIE_TYPES };
});
