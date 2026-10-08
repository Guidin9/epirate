// Oynatıcı üzerindeki IMDb rozeti ve detay paneli (Shadow DOM; Prime'ın stilleriyle çakışmaz).
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;
  const { t, formatRating, votesText, formatDate, ratingTier, textDirection } = NS;

  const ROOT_ATTR = 'data-pvimdb-root';
  const SIZE_SCALE = { s: 0.86, m: 1, l: 1.18 };
  // Rozete gelen olaylar oynatıcıya ulaşmasın (oynat/duraklat, kısayollar).
  const ISOLATED_EVENTS = ['click', 'dblclick', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu'];

  const CSS = `
:host { all: initial; }
.layer {
  --yellow: #f5c518;
  --ink: #0b0d10;
  --text: #ffffff;
  --muted: rgba(255, 255, 255, 0.74);
  --faint: rgba(255, 255, 255, 0.5);
  --line: rgba(255, 255, 255, 0.16);
  --glass: rgba(10, 13, 18, 0.58);
  --panel: rgba(13, 16, 22, 0.94);
  --great: #4fd98c; --good: #a6d75f; --ok: #f5c518; --low: #ff7b6b; --none: #8a96a3;
  --k: 1;
  --fs: calc(clamp(13px, 0.55vw + 8px, 21px) * var(--k));
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
  font-family: "Amazon Ember", "Amazon Ember Display", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: var(--fs); line-height: 1.25; color: var(--text);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.anchor {
  position: absolute; left: 0; top: 0;
  --tx: 0px; --ty: -4px;
  transform: translate(var(--tx), var(--ty));
  opacity: 0; transition: opacity 200ms ease, transform 200ms ease;
  pointer-events: none;
}
.anchor.visible { opacity: 1; --ty: 0px; pointer-events: auto; }
.anchor.center { --tx: -50%; }
.anchor.right { --tx: -100%; }
.anchor.bottom { --ty: -100%; }
.anchor.bottom:not(.visible) { --ty: calc(-100% + 4px); }

.badge {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.55em; white-space: nowrap;
  padding: 0.28em 0.75em 0.28em 0.32em;
  border-radius: 999px; background: var(--glass);
  border: 1px solid var(--line);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px) saturate(140%); -webkit-backdrop-filter: blur(10px) saturate(140%);
  transition: background 150ms ease, border-color 150ms ease;
}
.badge:hover, .badge[aria-expanded="true"] { background: rgba(18, 22, 30, 0.78); border-color: rgba(245, 197, 24, 0.55); }
.badge:focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }
.logo {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--yellow); color: var(--ink);
  font-weight: 900; font-size: 0.78em; letter-spacing: -0.01em;
  padding: 0.22em 0.42em 0.18em; border-radius: 999px; line-height: 1;
}
.main { display: inline-flex; align-items: baseline; gap: 0.2em; }
.star { color: var(--yellow); font-size: 0.95em; transform: translateY(-0.02em); }
.value { font-weight: 700; font-size: 1.08em; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.scale { color: var(--faint); font-size: 0.8em; }
.extra { display: inline-flex; align-items: center; gap: 0.55em; color: var(--muted); font-size: 0.86em; font-variant-numeric: tabular-nums; }
.extra::before { content: ""; width: 1px; height: 0.95em; background: var(--line); }
.extra b { color: var(--text); font-weight: 600; }
.status { color: var(--muted); font-size: 0.9em; }
.badge.loading .dots::after { content: "…"; animation: blink 1.2s steps(4, end) infinite; }
.badge.error .status { color: #ffd2cc; }
.badge.error .retry { color: var(--yellow); font-weight: 600; }
@keyframes blink { 0% { opacity: .25 } 50% { opacity: 1 } 100% { opacity: .25 } }

.panel {
  position: absolute; top: calc(100% + 0.6em); left: 50%; transform: translateX(-50%);
  width: min(22em, calc(100vw - 32px)); box-sizing: border-box;
  padding: 0.9em 1em 0.85em; border-radius: 14px;
  background: var(--panel); border: 1px solid var(--line);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  font-size: 0.86em; color: var(--text); white-space: normal; text-align: left;
}
.panel[hidden] { display: none; }
.anchor.left .panel { left: 0; transform: none; }
.anchor.right .panel { left: auto; right: 0; transform: none; }
.anchor.bottom .panel { top: auto; bottom: calc(100% + 0.6em); }
.p-head { display: flex; align-items: flex-start; gap: 0.6em; }
.p-show { flex: 1; min-width: 0; }
.p-show a { color: var(--text); font-weight: 700; font-size: 1.05em; text-decoration: none; }
.p-show a:hover { text-decoration: underline; }
.p-years { color: var(--faint); font-weight: 400; margin-left: 0.35em; }
.p-close { all: unset; cursor: pointer; color: var(--faint); font-size: 1.25em; line-height: 1; padding: 0 0.15em; border-radius: 6px; }
.p-close:hover { color: var(--text); }
.p-close:focus-visible { outline: 2px solid var(--yellow); }
.p-ep { margin-top: 0.35em; color: var(--muted); }
.p-ep b { color: var(--text); font-weight: 600; }
.p-score { display: flex; align-items: baseline; gap: 0.35em; margin-top: 0.6em; }
.p-score .star { font-size: 1.3em; }
.p-big { font-size: 2em; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.p-of { color: var(--faint); }
.p-votes { color: var(--muted); margin-left: 0.4em; }
.p-meta { margin-top: 0.15em; color: var(--muted); font-size: 0.92em; }
.p-meta b { color: var(--text); font-weight: 600; }
.p-note { margin-top: 0.45em; color: var(--faint); font-size: 0.86em; }
.chart-title { margin-top: 0.9em; color: var(--faint); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.08em; }
.chart { direction: ltr; margin-top: 0.45em; display: flex; align-items: flex-end; gap: 3px; height: 5.2em; }
.bar { flex: 1 1 0; min-width: 4px; position: relative; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; text-decoration: none; }
.bar i { display: block; border-radius: 3px 3px 1px 1px; background: var(--none); opacity: 0.55; transition: opacity 120ms ease; }
.bar.great i { background: var(--great); } .bar.good i { background: var(--good); }
.bar.ok i { background: var(--ok); } .bar.low i { background: var(--low); }
.bar:hover i { opacity: 0.95; }
.bar.current i { opacity: 1; box-shadow: 0 0 0 1.5px #fff; }
.bar.after i { opacity: 0.8; }
.labels { direction: ltr; display: flex; gap: 3px; margin-top: 0.3em; }
.labels span { flex: 1 1 0; min-width: 4px; text-align: center; color: var(--faint); font-size: 0.72em; font-variant-numeric: tabular-nums; }
.labels span.current { color: var(--text); font-weight: 700; }
.p-links { display: flex; gap: 0.5em; margin-top: 0.85em; flex-wrap: wrap; }
.p-links a { color: var(--ink); background: var(--yellow); text-decoration: none; font-weight: 700; padding: 0.38em 0.75em; border-radius: 999px; }
.p-links a.ghost { color: var(--text); background: transparent; border: 1px solid var(--line); font-weight: 600; }
.p-links a:hover { filter: brightness(1.08); }
.p-hint { margin-top: 0.7em; color: var(--faint); font-size: 0.8em; }
@media (prefers-reduced-motion: reduce) {
  .anchor { transition: opacity 120ms linear; --ty: 0px; }
  .anchor.bottom:not(.visible) { --ty: -100%; }
  .badge.loading .dots::after { animation: none; }
}
`;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function link(href, className, text) {
    const a = el('a', className, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function createOverlay(options) {
    const opts = Object.assign({ onRetry() {}, onOpen(url) { window.open(url, '_blank', 'noopener'); } }, options);
    const host = document.createElement('div');
    host.setAttribute(ROOT_ATTR, '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    const layer = el('div', 'layer');
    layer.setAttribute('dir', textDirection());
    const anchor = el('div', 'anchor');
    const badge = el('button', 'badge');
    badge.type = 'button';
    badge.setAttribute('aria-haspopup', 'dialog');
    badge.setAttribute('aria-expanded', 'false');
    const panel = el('div', 'panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('panelLabel'));
    anchor.append(badge, panel);
    layer.append(anchor);
    shadow.append(style, layer);

    for (const type of ISOLATED_EVENTS) host.addEventListener(type, (e) => e.stopPropagation());

    let state = { status: 'idle', result: null, item: null, settings: NS.DEFAULT_SETTINGS };
    let hovered = false;
    let lastPointerMove = 0;
    let panelOpen = false;
    let lastBadgeKey = '';
    let lastPanelKey = '';

    // Rozet, üzerinde fare GERÇEKTEN hareket ederken açık kalır; hareketsiz imleç onu sabitlemez.
    anchor.addEventListener('pointerenter', () => { hovered = true; });
    anchor.addEventListener('pointermove', () => { hovered = true; lastPointerMove = Date.now(); });
    anchor.addEventListener('pointerleave', () => { hovered = false; });

    // Fareyle tıklamada odak rozete geçmesin: boşluk tuşu yine videoyu durdursun.
    shadow.addEventListener('mousedown', (e) => {
      if (e.target.closest && e.target.closest('button, a')) e.preventDefault();
    });
    badge.addEventListener('click', () => {
      if (state.status === 'error') {
        opts.onRetry();
      } else if (state.result && (state.result.show || state.result.episode)) {
        setPanel(!panelOpen);
      }
    });
    // IMDb bağlantıları arka plan sekmesinde açılır (tam ekran bozulmaz).
    shadow.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      opts.onOpen(a.href);
    });
    // Odak rozette olmasa da Esc paneli kapatsın (tam ekrandan çıkışı engellemeden).
    const onEscape = (e) => {
      if (e.key === 'Escape' && panelOpen) setPanel(false);
    };
    document.addEventListener('keydown', onEscape, true);
    shadow.addEventListener('keydown', onEscape);
    const onOutside = (e) => {
      if (panelOpen && !e.composedPath().includes(host)) setPanel(false);
    };
    document.addEventListener('pointerdown', onOutside, true);

    function setPanel(open) {
      panelOpen = !!open;
      if (panelOpen) renderPanel(true);
      panel.hidden = !panelOpen;
      badge.setAttribute('aria-expanded', String(panelOpen));
    }

    function renderBadge() {
      const { status, result, settings } = state;
      const ep = result && result.episode;
      const show = result && result.show;
      const ratingSource = ep || (result && result.kind !== 'episode' ? show : null);
      const key = JSON.stringify([status, ratingSource && ratingSource.rating, ratingSource && ratingSource.votes, show && show.rating,
        settings.showVotes, settings.showSeriesRating, result && result.kind]);
      if (key === lastBadgeKey) return;
      lastBadgeKey = key;

      badge.className = 'badge ' + status;
      badge.replaceChildren(el('span', 'logo', 'IMDb'));
      const add = (node) => badge.append(node);

      if (status === 'loading') {
        const s = el('span', 'status');
        s.append(el('span', null, t('loading').replace(/(…|\.\.\.)$/, '')), el('span', 'dots'));
        add(s);
        badge.setAttribute('aria-label', t('loading'));
        return;
      }
      if (status === 'error') {
        const s = el('span', 'status', t('error') + ' · ');
        s.append(el('span', 'retry', t('retry')));
        add(s);
        badge.setAttribute('aria-label', t('error'));
        return;
      }
      if (status === 'not-found') {
        add(el('span', 'status', t('notFound')));
        badge.setAttribute('aria-label', t('notFound'));
        return;
      }

      if (status === 'ok' && ratingSource && typeof ratingSource.rating === 'number') {
        const main = el('span', 'main');
        main.append(el('span', 'star', '★'), el('span', 'value', formatRating(ratingSource.rating)), el('span', 'scale', '/10'));
        add(main);
        if (settings.showVotes && ratingSource.votes) add(el('span', 'extra votes', votesText(ratingSource.votes)));
      } else {
        add(el('span', 'status', status === 'episode-not-found' ? t('episodeNotFound') : t('noRating')));
      }

      const showSeries = result && result.kind === 'episode' && show && typeof show.rating === 'number'
        && (settings.showSeriesRating || status !== 'ok');
      if (showSeries) {
        const s = el('span', 'extra series', t('series') + ' ');
        s.append(el('b', null, formatRating(show.rating)));
        add(s);
      }
      const label = ratingSource && typeof ratingSource.rating === 'number'
        ? `${t('badgeLabel')}: ${formatRating(ratingSource.rating)} / 10`
        : `${t('badgeLabel')}: ${status === 'episode-not-found' ? t('episodeNotFound') : t('noRating')}`;
      badge.setAttribute('aria-label', label);
    }

    function renderChart(result) {
      const eps = (result.seasonEpisodes || []).filter((e) => e.episode != null);
      if (eps.length < 2) return null;
      const rated = eps.filter((e) => typeof e.rating === 'number').map((e) => e.rating);
      // Taban en düşük puanın biraz altında: yakın puanlar arasındaki fark da görünsün.
      const floor = rated.length ? Math.max(0, Math.min(7, Math.floor((Math.min(...rated) - 1.5) * 2) / 2)) : 0;
      // Bölüm IMDb'de bulunamasa da oynayan bölüm numarası bilinir: spoiler sınırı ona göre.
      const playing = state.item && state.item.episode != null ? state.item.episode : null;
      const current = result.episode ? result.episode.episode : playing;
      const wrap = el('div');
      wrap.append(el('div', 'chart-title', t('seasonChartTitle', [result.season])));
      const chart = el('div', 'chart');
      const labels = el('div', 'labels');
      const every = eps.length > 24 ? 5 : eps.length > 12 ? 2 : 1;
      for (const e of eps) {
        const tier = ratingTier(e.rating);
        const bar = link(NS.imdbTitleUrl ? NS.imdbTitleUrl(e.id) : `https://www.imdb.com/title/${e.id}/`, `bar ${tier}`);
        if (current != null && e.episode === current) bar.classList.add('current');
        else if (current != null && e.episode > current) bar.classList.add('after');
        const h = typeof e.rating === 'number' ? Math.max(6, ((e.rating - floor) / (10 - floor)) * 100) : 6;
        const fill = el('i');
        fill.style.height = h.toFixed(1) + '%';
        bar.append(fill);
        // Sonraki bölümlerin adı gösterilmez (spoiler olmasın); hangi bölümde olunduğu bilinmiyorsa hiçbiri.
        const showName = e.title && current != null && e.episode <= current;
        bar.title = `${t('episodeN', [e.episode])}${showName ? ' · ' + e.title : ''} · ★ ${formatRating(e.rating)}${e.votes ? ` (${votesText(e.votes)})` : ''}`;
        bar.setAttribute('aria-label', bar.title);
        chart.append(bar);
        const lab = el('span', current != null && e.episode === current ? 'current' : null, (e.episode % every === 0 || e.episode === 1 || e.episode === current) ? String(e.episode) : '');
        labels.append(lab);
      }
      wrap.append(chart, labels);
      return wrap;
    }

    function renderPanel(force) {
      const { result, item, status } = state;
      const key = JSON.stringify([status, result && result.show && result.show.id, result && result.episode && result.episode.id,
        result && result.episode && result.episode.rating, state.settings.showVotes, state.settings.seasonChart]);
      if (!force && key === lastPanelKey) return;
      lastPanelKey = key;
      panel.replaceChildren();
      if (!result || !(result.show || result.episode)) return;
      const show = result.show;
      const ep = result.episode;

      const head = el('div', 'p-head');
      const showBox = el('div', 'p-show');
      if (show) {
        showBox.append(link(show.url, null, show.name));
        const years = show.year ? (show.endYear && show.endYear !== show.year ? `${show.year}–${show.endYear}` : String(show.year)) : '';
        if (years) showBox.append(el('span', 'p-years', years));
      }
      const close = el('button', 'p-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', t('close'));
      close.addEventListener('click', () => setPanel(false));
      head.append(showBox, close);
      panel.append(head);

      if (result.kind === 'episode') {
        const line = el('div', 'p-ep');
        const season = ep ? ep.season : result.season;
        const number = ep ? ep.episode : item && item.episode;
        if (season != null && number != null) line.append(t('seasonEpisode', [season, number]));
        if (ep && ep.title) { line.append(' — '); line.append(el('b', null, ep.title)); }
        if (line.childNodes.length) panel.append(line);
      }

      const subject = ep || (result.kind !== 'episode' ? show : null);
      const score = el('div', 'p-score');
      if (subject && typeof subject.rating === 'number') {
        score.append(el('span', 'star', '★'), el('span', 'p-big', formatRating(subject.rating)), el('span', 'p-of', '/10'));
        if (subject.votes) score.append(el('span', 'p-votes', votesText(subject.votes)));
      } else {
        score.append(el('span', 'p-of', status === 'episode-not-found' ? t('episodeNotFound') : t('noRating')));
      }
      panel.append(score);

      const meta = el('div', 'p-meta');
      const metaParts = [];
      if (ep && ep.airDate) metaParts.push(document.createTextNode(formatDate(ep.airDate)));
      if (result.kind === 'episode' && show && typeof show.rating === 'number') {
        const s = el('span', null, `${t('series')} ★ `);
        s.append(el('b', null, formatRating(show.rating)));
        metaParts.push(s);
      }
      metaParts.forEach((p, i) => { if (i) meta.append(' · '); meta.append(p); });
      if (metaParts.length) panel.append(meta);

      if (result.matchedBy === 'title') panel.append(el('div', 'p-note', t('matchedByTitle')));
      if (result.matchedBy === 'override') panel.append(el('div', 'p-note', t('matchedByOverride')));

      if (result.kind === 'episode' && state.settings.seasonChart) {
        const chart = renderChart(result);
        if (chart) panel.append(chart);
      }

      const links = el('div', 'p-links');
      if (ep) links.append(link(ep.url, null, t('openImdb') + ' ↗'));
      if (show) links.append(link(show.url, ep ? 'ghost' : null, (ep ? t('openSeries') : t('openImdb')) + ' ↗'));
      panel.append(links);
      panel.append(el('div', 'p-hint', t('wrongMatch')));
    }

    function render() {
      renderBadge();
      if (panelOpen) renderPanel(false);
      if (panelOpen && !(state.result && (state.result.show || state.result.episode))) setPanel(false);
    }

    /** Konumu ve görünürlüğü uygular. anchorRect: Prime'ın başlık/bölüm satırının konumu. */
    function place(position, anchorRect) {
      const hostRect = host.getBoundingClientRect();
      const W = hostRect.width || window.innerWidth;
      const H = hostRect.height || window.innerHeight;
      const margin = Math.round(Math.max(16, Math.min(40, W * 0.022)));
      anchor.classList.remove('center', 'right', 'bottom', 'left');
      let x;
      let y;
      if (position === 'under-title' && anchorRect && anchorRect.width > 0) {
        x = anchorRect.left - hostRect.left + anchorRect.width / 2;
        y = anchorRect.bottom - hostRect.top + Math.max(6, H * 0.008);
        anchor.classList.add('center');
      } else if (position === 'under-title') {
        x = W / 2;
        y = Math.max(56, H * 0.1);
        anchor.classList.add('center');
      } else {
        const top = position.startsWith('top');
        const left = position.endsWith('left');
        x = left ? margin : W - margin;
        y = top ? Math.max(margin, H * (left ? 0.035 : 0.11)) : H - Math.max(110, H * 0.17);
        anchor.classList.add(left ? 'left' : 'right');
        if (!top) anchor.classList.add('bottom');
      }
      anchor.style.left = Math.round(x) + 'px';
      anchor.style.top = Math.round(y) + 'px';
    }

    return {
      host,
      /** Rozeti doğru kapsayıcıya taşır (tam ekranda tam ekran öğesinin içine). */
      mount(parent) {
        const target = parent || document.body || document.documentElement;
        if (host.parentNode !== target) target.appendChild(host);
      },
      update(next) {
        if (next.settings) {
          state.settings = next.settings;
          layer.style.setProperty('--k', String(SIZE_SCALE[next.settings.size] || 1));
        }
        if ('status' in next) state.status = next.status;
        if ('result' in next) state.result = next.result;
        if ('item' in next) state.item = next.item;
        render();
      },
      setVisible(visible, position, anchorRect) {
        // Gizlenirken konum bilgisi yoksa yerinde sön (zıplamasın).
        if (visible || anchorRect) place(position, anchorRect);
        anchor.classList.toggle('visible', !!visible);
        if (!visible) {
          if (panelOpen) setPanel(false);
          // Klavyeyle odaklanmış rozet görünmezken boşluk tuşunu yutmasın.
          if (shadow.activeElement && shadow.activeElement.blur) shadow.activeElement.blur();
        }
      },
      isHovered: () => hovered && Date.now() - lastPointerMove < 2500,
      isPanelOpen: () => panelOpen,
      closePanel: () => setPanel(false),
      destroy() {
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onEscape, true);
        host.remove();
      },
    };
  }

  NS.createOverlay = createOverlay;
  NS.OVERLAY_ROOT_ATTR = ROOT_ATTR;
})();
