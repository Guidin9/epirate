// Popup: o anki eşleşme, ayarlar, elle düzeltme, tanılama.
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;
  const { T, formatRating, formatVotes } = NS;
  const $ = (id) => document.getElementById(id);

  let tabId = null;
  let state = null;
  let settings = Object.assign({}, NS.DEFAULT_SETTINGS);

  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1600);
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
      empty.textContent = 'Bu sekme Prime Video değil. Prime Video’da bir bölüm açınca puan burada da görünür.';
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    const p = state.player;
    const l = state.list;
    if (!p && !(l && l.active)) {
      empty.textContent = 'Bir bölüm oynatınca ya da bir dizinin sayfasını açınca puanlar burada görünür.';
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
        const y = document.createElement('span');
        y.className = 'years';
        y.textContent = show.endYear && show.endYear !== show.year ? `${show.year}–${show.endYear}` : String(show.year);
        title.append(y);
      }
    };

    if (p) {
      const r = p.result;
      kicker.textContent = r && r.kind === 'show' ? 'Şu an izlenen içerik' : p.item.kind === 'movie' ? 'Şu an izlenen film' : 'Şu an izlenen bölüm';
      title.append(r && r.show ? r.show.name : p.item.title);
      addYears(r && r.show);
      const season = r && r.episode ? r.episode.season : p.item.season;
      const number = r && r.episode ? r.episode.episode : p.item.episode;
      if (season != null && number != null) {
        ep.append(`${season}. ${T.season} · ${number}. ${T.episode}`);
        const epTitle = (r && r.episode && r.episode.title) || p.item.episodeTitle;
        if (epTitle) { ep.append(' — '); const b = document.createElement('b'); b.textContent = epTitle; ep.append(b); }
      }
      const subject = r ? (r.episode || (r.kind !== 'episode' ? r.show : null)) : null;
      if (p.status === 'loading') {
        score.innerHTML = '<span class="state">Puan aranıyor…</span>';
      } else if (p.status === 'error') {
        const s = document.createElement('span');
        s.className = 'state error';
        s.textContent = `${T.error} (${(p.error && p.error.code) || 'hata'})`;
        score.append(s);
      } else if (subject && typeof subject.rating === 'number') {
        score.innerHTML = '<span class="star">★</span><span class="big"></span><span class="of">/10</span><span class="votes"></span>';
        score.querySelector('.big').textContent = formatRating(subject.rating);
        score.querySelector('.votes').textContent = subject.votes ? `${formatVotes(subject.votes)} ${T.votes}` : '';
      } else {
        const s = document.createElement('span');
        s.className = 'state';
        s.textContent = p.status === 'not-found' ? T.notFound : p.status === 'episode-not-found' ? T.episodeNotFound : T.noRating;
        score.append(s);
      }
      if (r && r.kind === 'episode' && r.show && typeof r.show.rating === 'number') {
        meta.append(`${T.series} ★ `);
        const b = document.createElement('b');
        b.textContent = formatRating(r.show.rating);
        meta.append(b);
      }
      if (r && r.matchedBy === 'override') meta.append(meta.childNodes.length ? ' · ' : '', T.matchedByOverride);
      if (r && r.matchedBy === 'title') meta.append(meta.childNodes.length ? ' · ' : '', T.matchedByTitle);
      const url = r && ((r.episode && r.episode.url) || (r.show && r.show.url));
      if (url) { open.href = url; open.hidden = false; }
    } else {
      kicker.textContent = 'Dizi sayfası';
      title.append(l.show ? l.show.name : l.query || '');
      addYears(l.show);
      ep.textContent = l.status === 'ok'
        ? `${l.season}. ${T.season} · ${l.count} bölümün puanı listede gösteriliyor`
        : l.status === 'loading' ? 'Puanlar yükleniyor…' : l.status === 'season-not-found' ? 'Bu sezon IMDb’de bulunamadı' : l.status === 'not-found' ? T.notFound : T.error;
      if (l.show && typeof l.show.rating === 'number') {
        score.innerHTML = '<span class="star">★</span><span class="big"></span><span class="of">/10</span><span class="votes">dizinin genel puanı</span>';
        score.querySelector('.big').textContent = formatRating(l.show.rating);
      }
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
    $('fixFor').textContent = `Prime’daki ad: “${target.label}”. Seçimin bu ad için kalıcı olarak hatırlanır.`;
    const input = $('searchInput');
    if (!input.value) input.value = NS.cleanTitle(target.label);
    loadOverrideInfo();
    runSearch(input.value);
    input.focus();
  }

  let searchToken = 0;
  async function runSearch(query) {
    const list = $('results');
    const token = ++searchToken;
    list.replaceChildren();
    const q = String(query || '').trim();
    if (!q) return;
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aranıyor…';
    list.append(li);
    const res = await chrome.runtime.sendMessage({ type: 'pv:search', query: q }).catch(() => null);
    if (token !== searchToken) return; // daha yeni bir arama başladı
    list.replaceChildren();
    if (!res || !res.ok) {
      const e = document.createElement('li');
      e.className = 'empty';
      e.textContent = T.error;
      list.append(e);
      return;
    }
    if (!res.results.length) {
      const e = document.createElement('li');
      e.className = 'empty';
      e.textContent = 'Sonuç yok. Farklı ya da İngilizce adı deneyin.';
      list.append(e);
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
        thumb = document.createElement('span');
        thumb.className = 'ph';
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
      pick.textContent = r.id === currentId ? 'Şu anki' : 'Seç';
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
    if (!res || !res.ok) { toast('Kaydedilemedi'); return; }
    toast('Kaydedildi');
    $('fix').hidden = true;
    $('fixToggle').setAttribute('aria-expanded', 'false');
    refreshSoon();
  }

  async function clearOverride() {
    const target = overrideTarget();
    if (!target) return;
    const res = await chrome.runtime.sendMessage({ type: 'pv:setOverride', key: target.key, override: null }).catch(() => null);
    if (!res || !res.ok) { toast('Geri alınamadı'); return; }
    toast('Otomatik eşleşmeye dönüldü');
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
      const next = values[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? values.length - 1 : 1)) % values.length];
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
    toast(res && res.ok ? `Önbellek temizlendi (${res.removed})` : 'Temizlenemedi');
    refreshSoon();
  });

  $('copyDiag').addEventListener('click', async () => {
    const payload = JSON.stringify({ at: new Date().toISOString(), state }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast('Panoya kopyalandı');
    } catch (err) {
      toast('Kopyalanamadı');
    }
  });

  $('testConn').addEventListener('click', async () => {
    toast('Test ediliyor…');
    const res = await chrome.runtime.sendMessage({ type: 'pv:testConnection' }).catch(() => null);
    if (res && res.ok) toast(`IMDb bağlantısı tamam (${res.ms} ms)`);
    else toast(`Bağlantı hatası: ${(res && res.error && res.error.code) || 'bilinmiyor'}`);
  });

  async function refresh() {
    state = await fetchState();
    renderNow();
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
