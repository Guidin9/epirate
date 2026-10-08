// IMDb istemcisi: arama (suggestion API) + puanlar (GraphQL). API anahtarı gerekmez.
// Not: IMDb verisi yalnızca kişisel, ticari olmayan kullanım içindir.
(function (root, factory) {
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SUGGEST_BASE = 'https://v3.sg.media-imdb.com/suggestion/x/';
  const GRAPHQL_HOSTS = [
    'https://caching.graphql.imdb.com/',
    'https://api.graphql.imdb.com/',
    'https://graphql.imdb.com/',
  ];
  // Bu başlık olmadan GraphQL 403 döndürüyor.
  const GRAPHQL_HEADERS = {
    'content-type': 'application/json',
    accept: 'application/json',
    'x-imdb-client-name': 'imdb-web-next-localized',
  };
  const PAGE_SIZE = 250;
  const MAX_PAGES = 8;

  const TITLE_FIELDS = 'id titleText { text } originalTitleText { text } titleType { id text } releaseYear { year endYear } ratingsSummary { aggregateRating voteCount }';
  const EPISODE_FIELDS = 'id titleText { text } ratingsSummary { aggregateRating voteCount } releaseDate { year month day } series { episodeNumber { episodeNumber seasonNumber } }';

  const SEASON_QUERY = `query PvImdbSeason($id: ID!, $season: String!, $first: Int!, $after: ID) {
  title(id: $id) {
    ${TITLE_FIELDS}
    episodes {
      displayableSeasons(first: 250) { edges { node { text } } }
      episodes(first: $first, after: $after, filter: { includeSeasons: [$season] }) {
        total
        pageInfo { hasNextPage endCursor }
        edges { node { ${EPISODE_FIELDS} } }
      }
    }
  }
}`;

  const ALL_EPISODES_QUERY = `query PvImdbAllEpisodes($id: ID!, $first: Int!, $after: ID) {
  title(id: $id) {
    ${TITLE_FIELDS}
    episodes {
      displayableSeasons(first: 250) { edges { node { text } } }
      episodes(first: $first, after: $after) {
        total
        pageInfo { hasNextPage endCursor }
        edges { node { ${EPISODE_FIELDS} } }
      }
    }
  }
}`;

  const TITLE_QUERY = `query PvImdbTitle($id: ID!) { title(id: $id) { ${TITLE_FIELDS} } }`;

  class ImdbError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'ImdbError';
      this.code = code; // network | timeout | http | blocked | graphql | parse | not-found
      this.details = details;
    }
  }

  function mapShow(t) {
    if (!t || !t.titleText) return null;
    const rating = t.ratingsSummary || {};
    return {
      id: t.id,
      name: t.titleText.text,
      originalName: t.originalTitleText ? t.originalTitleText.text : null,
      type: t.titleType ? t.titleType.id : null,
      year: t.releaseYear ? t.releaseYear.year : null,
      endYear: t.releaseYear ? t.releaseYear.endYear : null,
      rating: typeof rating.aggregateRating === 'number' ? rating.aggregateRating : null,
      votes: typeof rating.voteCount === 'number' ? rating.voteCount : 0,
    };
  }

  function mapEpisode(node) {
    const num = (node.series && node.series.episodeNumber) || {};
    const rating = node.ratingsSummary || {};
    const d = node.releaseDate;
    return {
      id: node.id,
      title: node.titleText ? node.titleText.text : null,
      season: typeof num.seasonNumber === 'number' ? num.seasonNumber : null,
      episode: typeof num.episodeNumber === 'number' ? num.episodeNumber : null,
      rating: typeof rating.aggregateRating === 'number' ? rating.aggregateRating : null,
      votes: typeof rating.voteCount === 'number' ? rating.voteCount : 0,
      airDate: d && d.year ? [d.year, d.month || 1, d.day || 1].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-') : null,
    };
  }

  function createImdbClient(options) {
    // Service worker'ın 30 sn sınırına takılmamak için deneme başına kısa zaman aşımı.
    const opts = Object.assign({ timeoutMs: 6000, retries: 1 }, options);
    const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    if (!doFetch) throw new Error('fetch bulunamadı');
    let preferredHost = 0;

    async function fetchWithTimeout(url, init) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        return await doFetch(url, Object.assign({}, init, { signal: controller.signal, credentials: 'omit' }));
      } catch (err) {
        if (controller.signal.aborted) throw new ImdbError('timeout', `Zaman aşımı: ${url}`);
        throw new ImdbError('network', `Ağ hatası: ${err && err.message}`);
      } finally {
        clearTimeout(timer);
      }
    }

    async function search(query) {
      const q = String(query || '').toLowerCase().replace(/[\/\?#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!q) return [];
      let lastError;
      for (let attempt = 0; attempt <= opts.retries; attempt++) {
        try {
          const res = await fetchWithTimeout(SUGGEST_BASE + encodeURIComponent(q) + '.json', { method: 'GET' });
          if (!res.ok) throw new ImdbError('http', `Arama HTTP ${res.status}`, { status: res.status });
          const json = await res.json().catch(() => { throw new ImdbError('parse', 'Arama yanıtı okunamadı'); });
          return (json.d || [])
            .filter((d) => /^tt\d+$/.test(d.id))
            .map((d) => ({
              id: d.id,
              title: d.l,
              type: d.qid || null,
              typeLabel: d.q || null,
              year: typeof d.y === 'number' ? d.y : null,
              yearRange: d.yr || null,
              rank: typeof d.rank === 'number' ? d.rank : null,
              stars: d.s || null,
              image: d.i && d.i.imageUrl ? d.i.imageUrl : null,
            }));
        } catch (err) {
          lastError = err;
          if (err.code === 'parse') break;
        }
      }
      throw lastError;
    }

    // Sunucular arasında otomatik geçiş: 403/5xx/ağ/zaman aşımı → sıradaki sunucu.
    async function graphql(query, variables) {
      let lastError;
      for (let i = 0; i < GRAPHQL_HOSTS.length; i++) {
        const hostIndex = (preferredHost + i) % GRAPHQL_HOSTS.length;
        const url = GRAPHQL_HOSTS[hostIndex];
        try {
          const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: GRAPHQL_HEADERS,
            body: JSON.stringify({ query, variables }),
          });
          if (res.status === 403 || res.status === 429) throw new ImdbError('blocked', `IMDb isteği reddetti (HTTP ${res.status})`, { status: res.status });
          if (res.status >= 400 && res.status < 500) {
            // Ör. 400 + {errors}: sorgunun kendisi hatalı; diğer sunucular da aynısını döndürür.
            const body = await res.json().catch(() => null);
            if (body && Array.isArray(body.errors)) throw new ImdbError('graphql', body.errors.map((e) => e.message).join('; '), { status: res.status });
          }
          if (!res.ok) throw new ImdbError('http', `GraphQL HTTP ${res.status}`, { status: res.status });
          let json;
          try { json = await res.json(); } catch (e) { throw new ImdbError('parse', 'GraphQL yanıtı okunamadı'); }
          if (!json.data && json.errors) throw new ImdbError('graphql', json.errors.map((e) => e.message).join('; '));
          if (!json.data) throw new ImdbError('parse', 'GraphQL yanıtında veri yok');
          preferredHost = hostIndex;
          return json.data;
        } catch (err) {
          lastError = err instanceof ImdbError ? err : new ImdbError('network', String(err));
          if (lastError.code === 'graphql') throw lastError; // sorgu hatası: diğer sunucular da aynısını döndürür
        }
      }
      throw lastError;
    }

    async function paged(query, variables) {
      let after = null;
      let show = null;
      let seasons = [];
      let total = 0;
      const episodes = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await graphql(query, Object.assign({}, variables, { first: PAGE_SIZE, after }));
        const t = data.title;
        if (!show) {
          show = mapShow(t);
          if (!show) throw new ImdbError('not-found', 'IMDb kaydı bulunamadı');
          const ds = t.episodes && t.episodes.displayableSeasons;
          seasons = ds && Array.isArray(ds.edges) ? ds.edges.filter((e) => e && e.node).map((e) => e.node.text) : [];
        }
        const conn = t.episodes && t.episodes.episodes;
        if (!conn) break;
        total = conn.total || 0;
        // IMDb bazen eksik kayıt (null) döndürür: atla, sezonun geri kalanını kaybetme.
        for (const edge of conn.edges || []) if (edge && edge.node && edge.node.id) episodes.push(mapEpisode(edge.node));
        if (!conn.pageInfo || !conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
        after = conn.pageInfo.endCursor;
      }
      return { show, seasons, total, episodes };
    }

    return {
      search,
      graphql,
      /** Bir sezonun tüm bölümleri + dizi bilgisi. */
      getSeason(id, season) {
        return paged(SEASON_QUERY, { id, season: String(season) });
      },
      /** Dizinin tüm bölümleri (bölüm adıyla eşleştirme yedeği için). */
      getAllEpisodes(id) {
        return paged(ALL_EPISODES_QUERY, { id });
      },
      /** Film/dizi puanı. */
      async getTitle(id) {
        const data = await graphql(TITLE_QUERY, { id });
        const show = mapShow(data.title);
        if (!show) throw new ImdbError('not-found', 'IMDb kaydı bulunamadı');
        return show;
      },
    };
  }

  function imdbTitleUrl(id) {
    return `https://www.imdb.com/title/${id}/`;
  }

  return { createImdbClient, ImdbError, imdbTitleUrl, GRAPHQL_HOSTS, SUGGEST_BASE };
});
