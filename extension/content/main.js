// Content script kontrolcüsü: oynatıcıyı izler, puanı ister, rozeti ve bölüm listesini yönetir.
(function () {
  'use strict';
  const NS = globalThis.PVIMDB;
  const INSTANCE_ATTR = 'data-pvimdb-instance';
  const INSTANCE = Math.random().toString(36).slice(2);
  const FAST_MS = 250;   // oynatıcı açıkken (görünürlük/konum)
  const SLOW_MS = 1000;  // oynatıcı yokken
  const HIDDEN_MS = 2000; // sekme arka plandayken
  const STABLE_MS = 300; // metin değişimi bu kadar sabit kalınca yeni içerik say
  const START_SHOW_MS = 10000;
  const MISSING_GRACE_MS = 5000; // reklam/özet ekranında başlık kısa süre kaybolabilir

  // Eski kopya (eklenti güncellendi/yeniden yüklendi) varsa yerini al.
  document.documentElement.setAttribute(INSTANCE_ATTR, INSTANCE);
  document.querySelectorAll(`[${NS.OVERLAY_ROOT_ATTR}]`).forEach((n) => n.remove());

  let settings = Object.assign({}, NS.DEFAULT_SETTINGS);
  let timer = null;
  let dead = false;
  let userHidden = false;

  const player = {
    key: null, item: null, status: 'idle', result: null, error: null,
    resultAt: 0, requestId: 0, pendingKey: null, pendingSince: 0, snap: null, missingSince: 0,
  };
  let visObserver = null;
  let observedEl = null;
  let framePending = false;

  function orphaned() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return true; // eklenti güncellendi/kaldırıldı
    } catch (err) {
      return true;
    }
    const owner = document.documentElement.getAttribute(INSTANCE_ATTR);
    if (owner === null) {
      // Sayfa özniteliği silmiş olabilir: sahiplenmeyi yenile.
      document.documentElement.setAttribute(INSTANCE_ATTR, INSTANCE);
      return false;
    }
    return owner !== INSTANCE; // daha yeni bir kopya devraldı
  }

  async function send(msg) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch (err) {
        // Service worker uyanırken ilk mesaj kaybolabilir: bir kez daha dene.
        if (attempt >= 1 || orphaned()) throw err;
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  function openInBackground(url) {
    send({ type: 'pv:openTab', url }).catch(() => window.open(url, '_blank', 'noopener'));
  }

  const overlay = NS.createOverlay({ onRetry: () => resolveCurrent(), onOpen: openInBackground });
  overlay.update({ settings });
  const list = NS.createEpisodeList({ send, getSettings: () => settings });

  function itemKey(item) {
    return [item.kind, NS.normalizeTitle(item.title), item.season ?? '', item.episode ?? '', item.season == null ? NS.normalizeTitle(item.episodeTitle || '') : ''].join('|');
  }

  async function resolveCurrent() {
    const item = player.item;
    if (!item) return;
    const id = ++player.requestId;
    player.status = 'loading';
    player.result = null;
    player.error = null;
    overlay.update({ status: 'loading', result: null, item });
    let res;
    try {
      res = await send({ type: 'pv:resolve', item });
    } catch (err) {
      res = { ok: false, error: { code: 'messaging', message: String(err && err.message) } };
    }
    if (id !== player.requestId || dead) return;
    if (res && res.ok) {
      player.result = res.result;
      player.status = res.result.status;
    } else {
      player.status = 'error';
      player.error = res && res.error;
    }
    player.resultAt = Date.now();
    overlay.update({ status: player.status, result: player.result, item });
    syncBadge();
  }

  function currentRating() {
    const r = player.result;
    if (!r) return null;
    const subject = r.episode || (r.kind !== 'episode' ? r.show : null);
    return subject && typeof subject.rating === 'number' ? subject.rating : null;
  }

  // Araç çubuğu simgesi: yalnızca güncel sonuç (eski istekler requestId ile elendi).
  function syncBadge() {
    send({ type: 'pv:badge', rating: player.key ? currentRating() : null }).catch(() => {});
  }

  function clearPlayer() {
    if (!player.key) return;
    player.key = null;
    player.item = null;
    player.status = 'idle';
    player.result = null;
    player.requestId++;
    overlay.setVisible(false, settings.position, null);
    overlay.update({ status: 'idle', result: null, item: null });
    send({ type: 'pv:clearBadge' }).catch(() => {});
  }

  function controlsVisible(snap) {
    const el = snap.subtitleEl || snap.titleEl;
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function'
      && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Tam ekranda yalnızca tam ekran öğesinin içi görünür: rozeti oraya taşı.
  function mountParent(snap) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) {
      if (snap.container && fs.contains(snap.container)) return snap.container;
      if (fs.tagName !== 'VIDEO') return fs;
    }
    return snap.container || document.body;
  }

  // Prime'ın kontrolleri soldurduğu sınıf değişimini anında yakala (yoklama gecikmesi olmasın).
  function watchVisibility(snap) {
    const target = snap ? snap.titleEl : null;
    if (observedEl === target) return;
    if (visObserver) visObserver.disconnect();
    observedEl = target;
    if (!target) return;
    visObserver = new MutationObserver(() => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        if (dead) return;
        if (orphaned()) { teardown(); return; }
        if (player.snap && player.key) applyVisibility(Date.now(), player.snap);
      });
    });
    let node = target;
    for (let i = 0; node && i < 8; i++) {
      visObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      if (node === snap.container) break;
      node = node.parentElement;
    }
  }

  function applyVisibility(now, snap) {
    overlay.mount(mountParent(snap));
    const controls = controlsVisible(snap);
    let show;
    if (settings.mode === 'always') show = true;
    else if (settings.mode === 'start') show = controls || (player.resultAt > 0 && now - player.resultAt < START_SHOW_MS && player.status !== 'loading');
    else show = controls;
    show = !userHidden && (show || overlay.isHovered() || overlay.isPanelOpen());
    const anchorEl = snap.subtitleEl || snap.titleEl;
    overlay.setVisible(show, settings.position, anchorEl ? anchorEl.getBoundingClientRect() : null);
  }

  function updatePlayer(now) {
    const snap = NS.prime.readPlayer();
    player.snap = snap;
    watchVisibility(snap);
    if (!snap) {
      player.pendingKey = null;
      if (player.key) {
        overlay.setVisible(false, settings.position, null);
        if (!player.missingSince) player.missingSince = now;
        else if (now - player.missingSince > MISSING_GRACE_MS) clearPlayer();
      }
      return false;
    }
    player.missingSince = 0;
    const item = NS.prime.buildItem(snap);
    if (item.kind === 'movie' && !settings.movies) {
      // Bölüm satırı bir an boş görünebilir: hemen silme, kısa süre sabit kalırsa temizle.
      if (player.pendingKey !== 'movie-off') {
        player.pendingKey = 'movie-off';
        player.pendingSince = now;
      } else if (now - player.pendingSince >= STABLE_MS) {
        clearPlayer();
      }
      return true;
    }
    const key = itemKey(item);
    if (key !== player.key) {
      if (player.pendingKey !== key) {
        player.pendingKey = key;
        player.pendingSince = now;
      } else if (now - player.pendingSince >= STABLE_MS) {
        player.key = key;
        player.item = NS.prime.buildItem(snap, true);
        player.pendingKey = null;
        if (overlay.isPanelOpen()) overlay.closePanel();
        resolveCurrent(false);
      }
    }
    if (!player.key) return true;
    applyVisibility(now, snap);
    return true;
  }

  function schedule(ms) {
    if (!dead) timer = setTimeout(loop, ms);
  }

  function loop() {
    if (orphaned()) return teardown();
    let playerOpen = false;
    try {
      playerOpen = updatePlayer(Date.now());
      list.tick();
    } catch (err) {
      // Prime'ın DOM'u beklenmedik durumda olabilir; bir sonraki turda tekrar dene.
    }
    schedule(document.hidden ? HIDDEN_MS : playerOpen ? FAST_MS : SLOW_MS);
  }

  function teardown() {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    if (visObserver) visObserver.disconnect();
    overlay.destroy();
    list.destroy();
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (err) { /* bağlam kapanmış */ }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (err) { /* bağlam kapanmış */ }
    document.removeEventListener('fullscreenchange', onFullscreen);
  }

  function onStorageChanged(changes, area) {
    if (area === 'sync' && changes[NS.SETTINGS_KEY]) {
      const before = settings;
      settings = NS.sanitizeSettings(changes[NS.SETTINGS_KEY].newValue);
      overlay.update({ settings });
      if (before.toolbarBadge !== settings.toolbarBadge && player.key) syncBadge();
    }
    if (area === 'local' && changes[NS.OVERRIDES_KEY]) {
      if (player.item) resolveCurrent();
      list.refresh();
    }
  }

  function snapshotState() {
    const snap = player.snap;
    return {
      url: location.href,
      player: player.item ? {
        item: player.item,
        status: player.status,
        result: player.result,
        error: player.error,
        overrideKey: NS.normalizeTitle(NS.cleanTitle(player.item.title)),
      } : null,
      list: list.state(),
      settings,
      diagnostics: {
        version: chrome.runtime.getManifest().version,
        lang: document.documentElement.lang || null,
        rawTitle: snap ? snap.title : null,
        rawSubtitle: snap ? snap.subtitle : null,
        parsed: snap && snap.subtitle ? NS.parseEpisodeLine(snap.subtitle, snap.lang) : null,
        titleElements: document.querySelectorAll(NS.prime.SEL.title).length,
        subtitleElements: document.querySelectorAll(NS.prime.SEL.subtitle).length,
        listItems: document.querySelectorAll(NS.prime.SEL.listItem).length,
        fullscreen: !!document.fullscreenElement,
        userHidden,
      },
    };
  }

  function onMessage(msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') return false;
    if (msg.type === 'pv:getState') {
      sendResponse(snapshotState());
      return false;
    }
    if (msg.type === 'pv:ping') {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'pv:refresh') {
      if (player.item) resolveCurrent();
      list.refresh();
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'pv:toggle') {
      userHidden = !userHidden;
      sendResponse({ ok: true, hidden: userHidden });
      return false;
    }
    return false;
  }

  function onFullscreen() {
    if (player.snap) overlay.mount(mountParent(player.snap));
  }

  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.runtime.onMessage.addListener(onMessage);
  document.addEventListener('fullscreenchange', onFullscreen);

  NS.loadSettings(chrome.storage.sync).then((s) => {
    settings = s;
    overlay.update({ settings });
  }).catch(() => {}).finally(loop);
})();
