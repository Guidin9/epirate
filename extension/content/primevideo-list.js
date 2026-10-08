// Prime dizi sayfasındaki bölüm listesine IMDb puan etiketleri ekler.
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;
  const { t, formatRating, votesText, ratingTier, textDirection } = NS;

  const CHIP_ATTR = 'data-pvimdb-chip';
  // React sayfayı hydrate etmeden DOM'a dokunmamak için yüklemeden sonra bekle.
  const SETTLE_MS = 1500;

  const CSS = `
:host { all: initial; display: block; margin-top: 6px; }
a {
  display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  font-family: "Amazon Ember", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px; line-height: 1; color: rgba(255,255,255,.78); text-decoration: none;
  padding: 3px 9px 3px 3px; border-radius: 999px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
  transition: background 120ms ease, border-color 120ms ease;
}
a:hover { background: rgba(255,255,255,.11); border-color: rgba(245,197,24,.6); }
a:focus-visible { outline: 2px solid #f5c518; outline-offset: 2px; }
.logo { background: #f5c518; color: #0b0d10; font-weight: 900; font-size: 10.5px; padding: 3px 6px 2px; border-radius: 999px; letter-spacing: -0.01em; }
.star { color: #f5c518; }
.value { font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; font-size: 13.5px; }
.great .value { color: #6be39f; } .good .value { color: #b9e27a; } .low .value { color: #ff9a8d; }
.votes { color: rgba(255,255,255,.6); font-variant-numeric: tabular-nums; }
.muted { color: rgba(255,255,255,.6); }
`;

  function makeChip() {
    const host = document.createElement('div');
    host.setAttribute(CHIP_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const a = document.createElement('a');
    a.dir = textDirection();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    shadow.append(style, a);
    // Etikete tıklamak bölümü oynatmasın.
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown']) host.addEventListener(type, (e) => e.stopPropagation());
    return host;
  }

  function fillChip(host, ep) {
    const a = host.shadowRoot.querySelector('a');
    const key = ep ? `${ep.id}|${ep.rating}|${ep.votes}` : 'none';
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    a.replaceChildren();
    const logo = document.createElement('span');
    logo.className = 'logo';
    logo.textContent = 'IMDb';
    a.append(logo);
    if (ep && typeof ep.rating === 'number') {
      a.className = ratingTier(ep.rating);
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '★';
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatRating(ep.rating);
      a.append(star, value);
      if (ep.votes) {
        const votes = document.createElement('span');
        votes.className = 'votes';
        votes.textContent = votesText(ep.votes);
        a.append(votes);
      }
      a.href = ep.url || `https://www.imdb.com/title/${ep.id}/`;
      a.title = `${ep.title || ''} — IMDb ★ ${formatRating(ep.rating)}`.trim();
    } else {
      a.className = 'none';
      const muted = document.createElement('span');
      muted.className = 'muted';
      muted.textContent = ep ? t('noRating') : t('episodeNotFound');
      a.append(muted);
      if (ep) a.href = ep.url || `https://www.imdb.com/title/${ep.id}/`;
      else a.removeAttribute('href');
    }
  }

  function createEpisodeList(options) {
    const { send, getSettings } = options;
    let pageKey = null;
    let result = null;
    let status = 'idle';
    let requestId = 0;
    let failedAt = 0;
    const loadedAt = Date.now();
    const RETRY_MS = 30000;

    function removeChips() {
      document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((n) => n.remove());
    }

    async function load(page, key) {
      const id = ++requestId;
      status = 'loading';
      result = null;
      try {
        const res = await send({ type: 'pv:resolveSeason', item: { title: page.title, season: page.season, hints: page.hints } });
        if (id !== requestId) return;
        if (res && res.ok) {
          result = res.result;
          status = res.result.status;
        } else {
          status = 'error';
          failedAt = Date.now();
        }
      } catch (err) {
        if (id === requestId) { status = 'error'; failedAt = Date.now(); }
      }
      if (id === requestId && pageKey === key) decorate(NS.prime.readDetailPage());
    }

    function decorate(page) {
      if (!page || !result || status !== 'ok') return;
      const byNumber = new Map((result.episodes || []).map((e) => [e.episode, e]));
      for (const item of page.episodes) {
        const ep = byNumber.get(item.episode) || null;
        for (const heading of item.headings) {
          let chip = heading.nextElementSibling;
          if (!chip || !chip.hasAttribute(CHIP_ATTR)) {
            chip = makeChip();
            heading.insertAdjacentElement('afterend', chip);
          }
          fillChip(chip, ep);
        }
      }
    }

    function tick() {
      const settings = getSettings();
      if (!settings.listRatings) {
        if (pageKey) { pageKey = null; result = null; status = 'idle'; requestId++; }
        removeChips();
        return;
      }
      if (document.readyState !== 'complete' || Date.now() - loadedAt < SETTLE_MS) return;
      const page = NS.prime.readDetailPage();
      if (!page) {
        if (pageKey) { pageKey = null; result = null; status = 'idle'; requestId++; }
        return;
      }
      const key = NS.normalizeTitle(page.title) + '|' + page.season;
      // Bağlantı hatasından sonra bir süre bekleyip yeniden dene.
      if (status === 'error' && key === pageKey && Date.now() - failedAt > RETRY_MS) pageKey = null;
      if (key !== pageKey) {
        pageKey = key;
        removeChips();
        load(page, key);
        return;
      }
      // React listeyi yeniden çizdiyse etiketleri geri koy.
      decorate(page);
    }

    return {
      tick,
      refresh() { pageKey = null; },
      state() {
        return {
          active: !!pageKey,
          status,
          show: result && result.show ? { id: result.show.id, name: result.show.name, year: result.show.year, rating: result.show.rating } : null,
          season: result ? result.season : null,
          count: result && result.episodes ? result.episodes.length : 0,
          query: result ? result.query : null,
        };
      },
      destroy() { requestId++; removeChips(); },
    };
  }

  NS.createEpisodeList = createEpisodeList;
})();
