// Popup: o anki eşleşme, ayarlar, elle düzeltme, tanılama. Metinler tarayıcının dilinde (chrome.i18n).
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;
  const { t, formatRating, votesText } = NS;
  const $ = (id) => document.getElementById(id);

  let tabId = null;
  let state = null;
  let settings = Object.assign({}, NS.DEFAULT_SETTINGS);

  // HTML'deki data-i18n işaretli metinleri doldur; Arapçada sağdan sola.
  function applyI18n() {
    document.documentElement.lang = NS.uiLocale();
    document.documentElement.dir = NS.textDirection();
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
    $('openImdb').textContent = t('openImdb') + ' ↗';
  }
  applyI18n();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  function toast(text) {
    const box = $('toast');
    box.textContent = text;
    box.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.remove('show'), 1600);
  }

  function span(className, text) {
    const s = document.createElement('span');
    if (className) s.className = className;
    if (text != null) s.textContent = text;
    return s;
  }

  function scoreLine(rating, extra) {
    return [span('star', '★'), span('big', formatRating(rating)), span('of', '/10'), span('votes', extra || '')];
  }

  async function resolveTab() {
    const param = new URLSearchParams(location.search).get('tab');
    if (param) return parseInt(param, 10);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? tab.id : null;
  }

  async function fetchState() {
    if (tabId == null) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'pv:getState' });
    } catch (err) {
      return null;
    }
  }

  // ---- "Şu an" kartı ----

  function overrideTarget() {
    if (!state) return null;
    if (state.player) return { key: state.player.overrideKey, label: state.player.item.title };
    if (state.list && state.list.active && state.list.query) return { key: NS.normalizeTitle(state.list.query), label: state.list.query };
    return null;
  }

  function renderNow() {
    const empty = $('nowEmpty');
    const body = $('nowBody');
    const fix = $('fixToggle');
    const open = $('openImdb');
    if (!state) {
      empty.textContent = t('notPrime');
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    const p = state.player;
    const l = state.list;
    if (!p && !(l && l.active)) {
      empty.textContent = t('idleHint');
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    const kicker = $('nowKicker');
    const title = $('nowTitle');
    const ep = $('nowEp');
    const score = $('nowScore');
    const meta = $('nowMeta');
    [title, ep, score, meta].forEach((n) => n.replaceChildren());
    open.hidden = true;

    const addYears = (show) => {
      if (show && show.year) {
        title.append(span('years', show.endYear && show.endYear !== show.year ? `${show.year}–${show.endYear}` : String(show.year)));
      }
    };

    if (p) {
      const r = p.result;
      kicker.textContent = r && r.kind === 'show' ? t('kickerShow') : p.item.kind === 'movie' ? t('kickerMovie') : t('kickerEpisode');
      title.append(r && r.show ? r.show.name : p.item.title);
      addYears(r && r.show);
      const season = r && r.episode ? r.episode.season : p.item.season;
      const number = r && r.episode ? r.episode.episode : p.item.episode;
      if (season != null && number != null) {
        ep.append(t('seasonEpisode', [season, number]));
        const epTitle = (r && r.episode && r.episode.title) || p.item.episodeTitle;
        if (epTitle) {
          const b = document.createElement('b');
          b.textContent = epTitle;
          ep.append(' — ', b);
        }
      }
      const subject = r ? (r.episode || (r.kind !== 'episode' ? r.show : null)) : null;
      if (p.status === 'loading') {
        score.append(span('state', t('loading')));
      } else if (p.status === 'error') {
        score.append(span('state error', `${t('error')} (${(p.error && p.error.code) || 'error'})`));
      } else if (subject && typeof subject.rating === 'number') {
        score.append(...scoreLine(subject.rating, subject.votes ? votesText(subject.votes) : ''));
      } else {
        score.append(span('state', p.status === 'not-found' ? t('notFound') : p.status === 'episode-not-found' ? t('episodeNotFound') : t('noRating')));
      }
      if (r && r.kind === 'episode' && r.show && typeof r.show.rating === 'number') {
        const b = document.createElement('b');
        b.textContent = formatRating(r.show.rating);
        meta.append(`${t('series')} ★ `, b);
      }
      if (r && r.matchedBy === 'override') meta.append(meta.childNodes.length ? ' · ' : '', t('matchedByOverride'));
      if (r && r.matchedBy === 'title') meta.append(meta.childNodes.length ? ' · ' : '', t('matchedByTitle'));
      const url = r && ((r.episode && r.episode.url) || (r.show && r.show.url));
      if (url) { open.href = url; open.hidden = false; }
    } else {
      kicker.textContent = t('openSeries');
      title.append(l.show ? l.show.name : l.query || '');
      addYears(l.show);
      ep.textContent = l.status === 'ok' ? t('listStatusOk', [l.season, l.count])
        : l.status === 'loading' ? t('listLoading')
          : l.status === 'season-not-found' ? t('seasonNotFound')
            : l.status === 'not-found' ? t('notFound') : t('error');
      if (l.show && typeof l.show.rating === 'number') score.append(...scoreLine(l.show.rating, t('seriesOverall')));
      if (l.show) { open.href = `https://www.imdb.com/title/${l.show.id}/`; open.hidden = false; }
    }
    fix.hidden = !overrideTarget();
  }

  // ---- Elle düzeltme ----

  let currentOverrideId = null;

  async function loadOverrideInfo() {
    const target = overrideTarget();
    const data = await chrome.storage.local.get(NS.OVERRIDES_KEY);
    const overrides = (data && data[NS.OVERRIDES_KEY]) || {};
    const entry = target ? overrides[target.key] : null;
    currentOverrideId = entry ? entry.id : null;
    $('clearOverride').hidden = !entry;
  }

  function openFix(open) {
    const target = overrideTarget();
    const section = $('fix');
    section.hidden = !open || !target;
    $('fixToggle').setAttribute('aria-expanded', String(!section.hidden));
    if (section.hidden) return;
    $('fixFor').textContent = t('fixFor', [target.label]);
    const input = $('searchInput');
    if (!input.value) input.value = NS.cleanTitle(target.label);
    loadOverrideInfo();
    runSearch(input.value);
    input.focus();
  }

  function emptyRow(text) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = text;
    return li;
  }

  let searchToken = 0;
  async function runSearch(query) {
    const list = $('results');
    const token = ++searchToken;
    list.replaceChildren();
    const q = String(query || '').trim();
    if (!q) return;
    list.append(emptyRow(t('searching')));
    const res = await chrome.runtime.sendMessage({ type: 'pv:search', query: q }).catch(() => null);
    if (token !== searchToken) return; // daha yeni bir arama başladı
    list.replaceChildren();
    if (!res || !res.ok) {
      list.append(emptyRow(t('error')));
      return;
    }
    if (!res.results.length) {
      list.append(emptyRow(t('noResults')));
      return;
    }
    const currentId = state && state.player && state.player.result && state.player.result.show ? state.player.result.show.id
      : state && state.list && state.list.show ? state.list.show.id : null;
    for (const r of res.results.slice(0, 8)) {
      const item = document.createElement('li');
      if (r.id === currentId) item.classList.add('current');
      let thumb;
      if (r.image) {
        thumb = document.createElement('img');
        thumb.src = r.image.replace(/\._V1_.*\.jpg$/, '._V1_QL75_UX64_.jpg');
        thumb.alt = '';
      } else {
        thumb = span('ph');
      }
      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = r.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = [r.yearRange || r.year, r.typeLabel, r.stars].filter(Boolean).join(' · ');
      info.append(name, meta);
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'btn' + (r.id === currentId ? '' : ' primary');
      pick.textContent = r.id === currentId ? t('currentPick') : t('pick');
      pick.disabled = r.id === currentId && currentOverrideId === r.id;
      pick.addEventListener('click', () => choose(r));
      item.append(thumb, info, pick);
      list.append(item);
    }
  }

  async function choose(r) {
    const target = overrideTarget();
    if (!target) return;
    const res = await chrome.runtime.sendMessage({ type: 'pv:setOverride', key: target.key, override: { id: r.id, name: r.name, year: r.year, type: r.type } }).catch(() => null);
    if (!res || !res.ok) { toast(t('saveFailed')); return; }
    toast(t('saved'));
    $('fix').hidden = true;
    $('fixToggle').setAttribute('aria-expanded', 'false');
    refreshSoon();
  }

  async function clearOverride() {
    const target = overrideTarget();
    if (!target) return;
    const res = await chrome.runtime.sendMessage({ type: 'pv:setOverride', key: target.key, override: null }).catch(() => null);
    if (!res || !res.ok) { toast(t('revertFailed')); return; }
    toast(t('revertedAuto'));
    $('fix').hidden = true;
    refreshSoon();
  }

  // ---- Ayarlar ----

  function renderSettings() {
    document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
      const key = group.dataset.setting;
      group.querySelectorAll('[data-value]').forEach((b) => {
        const on = settings[key] === b.dataset.value;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
      input.checked = !!settings[input.dataset.setting];
    });
  }

  async function save(patch) {
    settings = await NS.saveSettings(chrome.storage.sync, patch);
    renderSettings();
  }

  document.querySelectorAll('[role="radiogroup"][data-setting]').forEach((group) => {
    const key = group.dataset.setting;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b) save({ [key]: b.dataset.value });
    });
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const values = Array.from(group.querySelectorAll('[data-value]')).map((b) => b.dataset.value);
      const i = values.indexOf(settings[key]);
      const back = e.key === 'ArrowUp' || (e.key === 'ArrowLeft') !== (document.documentElement.dir === 'rtl');
      const next = values[(i + (back ? values.length - 1 : 1)) % values.length];
      save({ [key]: next }).then(() => group.querySelector(`[data-value="${next}"]`).focus());
    });
  });
  document.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
    input.addEventListener('change', () => save({ [input.dataset.setting]: input.checked }));
  });

  // ---- Alt kısım ----

  $('fixToggle').addEventListener('click', () => openFix($('fix').hidden));
  $('searchForm').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('searchInput').value); });
  $('clearOverride').addEventListener('click', clearOverride);

  $('clearCache').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'pv:clearCache' }).catch(() => null);
    if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'pv:refresh' }).catch(() => {});
    toast(res && res.ok ? t('cacheCleared', [res.removed]) : t('clearFailed'));
    refreshSoon();
  });

  $('copyDiag').addEventListener('click', async () => {
    const payload = JSON.stringify({ at: new Date().toISOString(), ui: NS.uiLocale(), state }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast(t('copied'));
    } catch (err) {
      toast(t('copyFailed'));
    }
  });

  $('testConn').addEventListener('click', async () => {
    toast(t('testing'));
    const res = await chrome.runtime.sendMessage({ type: 'pv:testConnection' }).catch(() => null);
    if (res && res.ok) toast(t('connOk', [res.ms]));
    else toast(t('connFail', [(res && res.error && res.error.code) || 'unknown']));
  });

  // ---- Hata bildirimi: sunucu yok, kullanıcı raporu kendi e-postasıyla gönderir ----

  const SUPPORT_EMAIL = 'contact@mertdemirdoven.me';
  const REPO_URL = 'https://github.com/Guidin9/epirate';
  const MAX_BODY = 1800; // mailto bağlantıları bazı e-posta uygulamalarında ~2000 karakterle sınırlı

  function hostPath(url) {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname;
    } catch (err) {
      return '—';
    }
  }

  function browserInfo() {
    const ua = navigator.userAgentData;
    const brands = ua && ua.brands ? ua.brands.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(', ') : '';
    const platform = (ua && ua.platform) || navigator.platform || '';
    return `${brands || navigator.userAgent}${platform ? ' · ' + platform : ''}`;
  }

  function diagnosticLines() {
    const lines = [`EpiRate ${chrome.runtime.getManifest().version}`, `Browser: ${browserInfo()}`, `UI language: ${NS.uiLocale()}`];
    if (!state) {
      lines.push('Page: not a Prime Video tab');
      return lines;
    }
    const d = state.diagnostics || {};
    lines.push(
      `Page: ${hostPath(state.url)}`,
      `Prime language: ${d.lang || '—'}`,
      `Player title: ${d.rawTitle || '—'}`,
      `Episode line: ${d.rawSubtitle || '—'}`,
      `Parsed: ${d.parsed ? `S${d.parsed.season}E${d.parsed.episode} (${d.parsed.format})` : '—'}`,
    );
    const p = state.player;
    if (p) {
      const r = p.result;
      const match = r && r.show ? `${r.show.name} (${r.show.year || '?'}) ${r.show.id}` : '—';
      const ep = r && r.episode ? ` · S${r.episode.season}E${r.episode.episode} ${r.episode.id} ★${r.episode.rating}` : '';
      lines.push(`Status: ${p.status}${p.error ? ` (${p.error.code})` : ''}`, `Match: ${match}${ep}${r && r.matchedBy ? ` · ${r.matchedBy}` : ''}`);
    }
    const l = state.list;
    if (l && l.active) lines.push(`Episode list: ${l.status} · ${l.query || '—'} S${l.season} · ${l.count}`);
    if (state.settings) lines.push(`Settings: ${Object.entries(state.settings).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    return lines;
  }

  const reportSubject = () => `EpiRate ${chrome.runtime.getManifest().version} – bug report / feedback`;

  function reportText() {
    const parts = [$('reportText').value.trim() || '—'];
    if ($('reportDiag').checked) parts.push('', '— Technical details —', ...diagnosticLines());
    const body = parts.join('\n');
    return body.length > MAX_BODY ? body.slice(0, MAX_BODY - 1) + '…' : body;
  }

  function updateReportLinks() {
    const subject = encodeURIComponent(reportSubject());
    const body = encodeURIComponent(reportText());
    $('reportMail').href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    $('reportGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${subject}&body=${body}`;
    $('reportGithub').href = `${REPO_URL}/issues/new?title=${subject}&body=${body}`;
  }

  function openReport(open) {
    const section = $('report');
    section.hidden = !open;
    $('reportBug').setAttribute('aria-expanded', String(open));
    if (!open) return;
    $('reportOr').textContent = t('reportOrWrite', [SUPPORT_EMAIL]);
    updateReportLinks();
    section.scrollIntoView({ block: 'nearest' });
    $('reportText').focus();
  }

  $('reportBug').addEventListener('click', () => openReport($('report').hidden));
  $('reportText').addEventListener('input', updateReportLinks);
  $('reportDiag').addEventListener('change', updateReportLinks);
  $('reportCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`To: ${SUPPORT_EMAIL}\nSubject: ${reportSubject()}\n\n${reportText()}`);
      toast(t('reportCopied', [SUPPORT_EMAIL]));
    } catch (err) {
      toast(t('copyFailed'));
    }
  });

  async function refresh() {
    state = await fetchState();
    renderNow();
    if (!$('report').hidden) updateReportLinks();
  }

  function refreshSoon() {
    let n = 0;
    const tickRefresh = async () => {
      await refresh();
      if (++n < 6 && state && state.player && state.player.status === 'loading') setTimeout(tickRefresh, 400);
    };
    setTimeout(tickRefresh, 350);
  }

  (async function init() {
    tabId = await resolveTab();
    settings = await NS.loadSettings(chrome.storage.sync);
    renderSettings();
    await refresh();
    if (state && state.player && state.player.status === 'loading') refreshSoon();
  })();
})();
