// Çözümleme hattı: Prime'da görülen başlık/sezon/bölüm → IMDb kaydı ve puanı.
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof require === 'function') {
    require('./parse.js');
    require('./match.js');
    require('./cache.js');
    require('./imdb.js');
  }
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const P = () => root.PVIMDB;
  const MAX_CANDIDATES = 4;

  function createResolver(options) {
    const { client, cache } = options;
    const getOverride = options.getOverride || (async () => null);
    const now = options.now || (() => Date.now());
    const { HOUR, DAY, createDeduper } = P();
    const contradictsHints = (show, hints) => P().contradictsHints(show, hints);
    const TTL = Object.assign({
      suggest: 7 * DAY,
      emptySuggest: 6 * HOUR,
      season: 12 * HOUR,
      recentSeason: 3 * HOUR,
      emptySeason: 1 * HOUR,
      allEpisodes: 24 * HOUR,
      title: 24 * HOUR,
      map: 30 * DAY,
    }, options.ttl);
    const dedupe = createDeduper();

    async function cached(key, ttl, load) {
      const hit = await cache.get(key);
      if (hit !== undefined) return hit;
      return dedupe(key, async () => {
        const value = await load();
        await cache.set(key, value, typeof ttl === 'function' ? ttl(value) : ttl);
        return value;
      });
    }

    function search(query) {
      const { normalizeTitle } = P();
      const q = normalizeTitle(query);
      if (!q) return Promise.resolve([]);
      // Boş sonuç kısa süre saklanır (yeni dizi IMDb aramasına sonradan düşebilir).
      return cached(`s:${q}`, (results) => (results && results.length ? TTL.suggest : TTL.emptySuggest), () => client.search(query));
    }

    // Yeni/yayındaki sezonların puanları hızla değişir → daha kısa süre sakla.
    // IMDb'de henüz boş olan sezon 1 saat sonra yeniden denenir.
    function seasonTtl(data) {
      const episodes = data.episodes || [];
      if (!episodes.length) return TTL.emptySeason;
      const t = now();
      const fresh = episodes.some((e) => {
        if (!e.airDate) return true;
        const age = t - Date.parse(e.airDate);
        return (age < 30 * DAY && age > -90 * DAY) || (age >= 0 && e.rating == null);
      });
      return fresh ? TTL.recentSeason : TTL.season;
    }

    const getSeason = (id, season) => cached(`season:${id}:${season}`, seasonTtl, () => client.getSeason(id, season));
    const getAllEpisodes = (id) => cached(`all:${id}`, TTL.allEpisodes, () => client.getAllEpisodes(id));
    const getTitle = (id) => cached(`title:${id}`, TTL.title, () => client.getTitle(id));

    async function candidatesFor(cleanTitle, kind, hints) {
      const { titleVariants, rankCandidates, normalizeTitle } = P();
      const key = normalizeTitle(cleanTitle);
      const override = await getOverride(key);
      if (override) {
        return { key, override, list: [{ id: override.id, title: override.name, year: override.year, type: override.type, score: 1, override: true }] };
      }
      let mapped = await cache.get(`map:${kind}:${key}`);
      if (mapped && mappingConflicts(mapped, kind, hints)) mapped = null;
      let list = [];
      try {
        for (const variant of titleVariants(cleanTitle)) {
          list = rankCandidates(variant, await search(variant), { kind, year: hints && hints.year });
          if (list.length) break;
        }
      } catch (err) {
        // Arama başarısız ama daha önce doğrulanmış bir eşleşme var: onunla devam et.
        if (!mapped) throw err;
        list = [];
      }
      if (mapped) {
        const existing = list.find((c) => c.id === mapped.id);
        const entry = Object.assign({}, existing || { id: mapped.id, title: mapped.name, year: mapped.year, type: mapped.type, score: 0.5 }, { mapped: true });
        list = [entry].concat(list.filter((c) => c.id !== mapped.id));
      }
      return { key, override: null, list };
    }

    // Hatırlanan eşleşme, sayfadaki yıl ipucuyla çelişiyorsa kullanılmaz (aynı adlı yeniden çevrim/yeni dizi).
    function mappingConflicts(mapped, kind, hints) {
      const year = hints && hints.year;
      if (!year) return false;
      if (kind === 'movie') return !!mapped.year && Math.abs(mapped.year - year) > 1;
      return (!!mapped.year && mapped.year > year + 1) || (!!mapped.endYear && mapped.endYear < year - 1);
    }

    function remember(kind, key, show) {
      return cache.set(`map:${kind}:${key}`, { id: show.id, name: show.name, year: show.year, endYear: show.endYear || null, type: show.type }, TTL.map);
    }

    function describeCandidates(list) {
      return list.slice(0, MAX_CANDIDATES).map((c) => ({ id: c.id, name: c.title, year: c.year, type: c.type, score: Math.round(c.score * 100) / 100 }));
    }

    function withUrls(show, episode) {
      const { imdbTitleUrl } = P();
      return {
        show: show ? Object.assign({}, show, { url: imdbTitleUrl(show.id) }) : null,
        episode: episode ? Object.assign({}, episode, { url: imdbTitleUrl(episode.id) }) : null,
      };
    }

    function seasonList(episodes, season) {
      return (episodes || [])
        .filter((e) => e.season === season && e.episode != null)
        .sort((a, b) => a.episode - b.episode)
        .map((e) => ({ id: e.id, episode: e.episode, title: e.title, rating: e.rating, votes: e.votes, airDate: e.airDate }));
    }

    /** Oynatıcıda oynayan bölüm. item: { title, season, episode, episodeTitle, hints } */
    async function resolveEpisode(item) {
      const { cleanTitle, findEpisode, pickBest } = P();
      const clean = cleanTitle(item.title);
      const { key, override, list } = await candidatesFor(clean, 'episode', item.hints);
      if (!list.length) return { status: 'not-found', kind: 'episode', query: clean, candidates: [] };

      const top = list.slice(0, override ? 1 : MAX_CANDIDATES);
      const found = [];
      let firstData = null;
      let lastError = null;
      for (let i = 0; i < top.length; i++) {
        const candidate = top[i];
        if (found.length && candidate.score < found[0].candidate.score - 0.3) break;
        let data;
        try {
          data = await getSeason(candidate.id, item.season);
        } catch (err) {
          // Yedek adaydaki hata, bulunmuş eşleşmeyi bozmasın.
          if (!err || err.code !== 'not-found') lastError = lastError || err;
          continue;
        }
        if (!firstData) firstData = { candidate, data };
        const hit = findEpisode(data.episodes, item);
        if (hit) found.push({ candidate, show: data.show, data, hit });
        const next = top[i + 1];
        // Hatırlanan eşleşme, ipuçlarıyla çelişmiyorsa ve bölüm adı açıkça tutmazlık göstermiyorsa aramayı bitirir.
        const trustedMapping = candidate.mapped && !contradictsHints(data.show, item.hints)
          && !(hit && typeof hit.titleSim === 'number' && hit.titleSim < 0.5);
        const clearWinner = candidate.override || trustedMapping || !next || candidate.score - next.score > 0.12;
        if (hit && found.length === 1 && i === 0 && clearWinner) break;
      }
      // Hiçbir adayda bulunamadı ve bir istek hata verdi: "bölüm yok" demek yerine hatayı göster.
      if (!found.length && lastError) throw lastError;

      if (found.length) {
        const best = pickBest(found, item.hints);
        if (!best.candidate.override) await remember('episode', key, best.show);
        const ep = best.hit.episode;
        return Object.assign({
          status: ep.rating == null ? 'no-rating' : 'ok',
          kind: 'episode',
          query: clean,
          season: ep.season,
          matchedBy: best.candidate.override ? 'override' : best.hit.matchedBy,
          seasonEpisodes: seasonList(best.data.episodes, ep.season),
          candidates: describeCandidates(list),
        }, withUrls(best.show, ep));
      }

      // Numarayla bulunamadı: bölüm adıyla tüm sezonlarda ara (farklı sezon numaralandırması).
      if (item.episodeTitle) {
        const candidate = top[0];
        const all = await getAllEpisodes(candidate.id).catch(() => null);
        const hit = all && findEpisode(all.episodes, { episodeTitle: item.episodeTitle });
        if (hit) {
          const ep = hit.episode;
          return Object.assign({
            status: ep.rating == null ? 'no-rating' : 'ok',
            kind: 'episode',
            query: clean,
            season: ep.season,
            matchedBy: 'title',
            seasonEpisodes: seasonList(all.episodes, ep.season),
            candidates: describeCandidates(list),
          }, withUrls(all.show, ep));
        }
      }

      // Bölüm IMDb'de yok (çok yeni ya da farklı numaralandırma): en azından dizinin puanını ver.
      const fallback = firstData || { candidate: top[0], data: null };
      const show = fallback.data ? fallback.data.show : await getTitle(fallback.candidate.id).catch(() => null);
      return Object.assign({
        status: 'episode-not-found',
        kind: 'episode',
        query: clean,
        season: item.season,
        matchedBy: fallback.candidate.override ? 'override' : null,
        seasonEpisodes: fallback.data ? seasonList(fallback.data.episodes, item.season) : [],
        candidates: describeCandidates(list),
      }, withUrls(show, null));
    }

    /** Film (bölüm bilgisi olmayan içerik). */
    async function resolveMovie(item) {
      const { cleanTitle } = P();
      const clean = cleanTitle(item.title);
      let { key, override, list } = await candidatesFor(clean, 'movie', item.hints);
      let kind = 'movie';
      if (!list.length) {
        // Prime bazı dizi özel bölümlerini bölüm numarasız gösterir: dizinin puanını dene.
        ({ key, override, list } = await candidatesFor(clean, 'episode', item.hints));
        kind = 'show';
      }
      if (!list.length) return { status: 'not-found', kind: 'movie', query: clean, candidates: [] };
      for (const candidate of list.slice(0, override ? 1 : 3)) {
        let show;
        try {
          show = await getTitle(candidate.id);
        } catch (err) {
          if (err && err.code === 'not-found') continue; // kaydı olmayan aday: sıradakine geç
          throw err;
        }
        if (!candidate.override) await remember(kind === 'show' ? 'episode' : 'movie', key, show);
        return Object.assign({
          status: show.rating == null ? 'no-rating' : 'ok',
          kind,
          query: clean,
          matchedBy: candidate.override ? 'override' : 'search',
          seasonEpisodes: [],
          candidates: describeCandidates(list),
        }, withUrls(show, null));
      }
      return { status: 'not-found', kind, query: clean, candidates: describeCandidates(list) };
    }

    /** Numarası olmayan bölüm (Prime yalnızca bölüm adını gösteriyor): tüm bölümlerde adla ara. */
    async function resolveUnnumbered(item) {
      const { cleanTitle, findEpisode } = P();
      const clean = cleanTitle(item.title);
      const { key, override, list } = await candidatesFor(clean, 'episode', item.hints);
      if (!list.length) return resolveMovie(item);
      let all = null;
      let hit = null;
      for (const candidate of list.slice(0, override ? 1 : 2)) {
        let data;
        try {
          data = await getAllEpisodes(candidate.id);
        } catch (err) {
          if (err && err.code === 'not-found') continue;
          throw err;
        }
        const h = findEpisode(data.episodes, { episodeTitle: item.episodeTitle });
        if (!all || h) { all = data; hit = h; }
        if (h) break;
      }
      if (!all) return { status: 'not-found', kind: 'episode', query: clean, candidates: describeCandidates(list) };
      if (!override && hit) await remember('episode', key, all.show);
      const ep = hit ? hit.episode : null;
      return Object.assign({
        status: ep ? (ep.rating == null ? 'no-rating' : 'ok') : 'episode-not-found',
        kind: 'episode',
        query: clean,
        season: ep ? ep.season : null,
        matchedBy: override ? 'override' : ep ? 'title' : null,
        seasonEpisodes: ep ? seasonList(all.episodes, ep.season) : [],
        candidates: describeCandidates(list),
      }, withUrls(all.show, ep));
    }

    function resolve(item) {
      if (!item || !item.title) return Promise.resolve({ status: 'not-found', kind: 'unknown', query: '', candidates: [] });
      if (item.season != null && item.episode != null) return resolveEpisode(item);
      if (item.episodeTitle) return resolveUnnumbered(item);
      return resolveMovie(item);
    }

    /** Dizi sayfasındaki bölüm listesi için tüm sezon. item: { title, season, hints } */
    async function resolveSeason(item) {
      const { cleanTitle, pickBest } = P();
      const clean = cleanTitle(item.title);
      const { key, override, list } = await candidatesFor(clean, 'episode', item.hints);
      if (!list.length) return { status: 'not-found', query: clean, season: item.season, episodes: [], candidates: [] };
      const top = list.slice(0, override ? 1 : MAX_CANDIDATES);
      const found = [];
      let lastError = null;
      for (let i = 0; i < top.length; i++) {
        const candidate = top[i];
        if (found.length && candidate.score < found[0].candidate.score - 0.3) break;
        let data;
        try {
          data = await getSeason(candidate.id, item.season);
        } catch (err) {
          if (!err || err.code !== 'not-found') lastError = lastError || err;
          continue;
        }
        if (!data.episodes.length) continue;
        found.push({ candidate, show: data.show, data, hit: null });
        const next = top[i + 1];
        const trustedMapping = candidate.mapped && !contradictsHints(data.show, item.hints);
        if (i === 0 && (candidate.override || trustedMapping || !next || candidate.score - next.score > 0.12)) break;
      }
      if (!found.length && lastError) throw lastError;
      if (!found.length) {
        return Object.assign({ status: 'season-not-found', query: clean, season: item.season, episodes: [], candidates: describeCandidates(list) },
          withUrls(top[0] ? await getTitle(top[0].id).catch(() => null) : null, null));
      }
      const best = pickBest(found, item.hints);
      if (!best.candidate.override) await remember('episode', key, best.show);
      return Object.assign({
        status: 'ok',
        query: clean,
        season: item.season,
        episodes: seasonList(best.data.episodes, item.season).map((e) => Object.assign(e, { url: P().imdbTitleUrl(e.id) })),
        matchedBy: best.candidate.override ? 'override' : 'search',
        candidates: describeCandidates(list),
      }, withUrls(best.show, null));
    }

    /** Popup'taki elle arama: dizi ve filmler. */
    async function searchTitles(query) {
      const { rankCandidates } = P();
      return rankCandidates(query, await search(query), {}).map((c) => ({
        id: c.id, name: c.title, year: c.year, yearRange: c.yearRange, type: c.type, typeLabel: c.typeLabel, stars: c.stars, image: c.image,
      }));
    }

    return { resolve, resolveEpisode, resolveMovie, resolveUnnumbered, resolveSeason, searchTitles };
  }

  return { createResolver };
});
