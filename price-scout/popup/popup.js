/* ============================================================
 * PRICE SCOUT — popup/popup.js
 * ------------------------------------------------------------
 * The quick-glance surface: how many competitors we're watching,
 * how many are undercutting us (threats) vs. leaving room (opportunity),
 * and a ledger of the most recent price moves — each with a sparkline.
 *
 * Talks to the background worker over chrome.runtime messages; never
 * touches storage directly. Opening the popup also clears the badge.
 * ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const P = window.PSPrice;

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res || null); });
      } catch (_) { resolve(null); }
    });
  }
  function fmt(n, cur) { return P ? P.formatPrice(n, cur || '₩') : '₩' + (n || 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Calm count-up: the headline number eases up, it never snaps.
  function animateCount(elm, target) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target = Number(target) || 0;
    if (reduce || !target) { elm.textContent = String(target); return; }
    const start = performance.now(), dur = 900;
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      elm.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  function ago(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '방금';
    const m = Math.floor(s / 60); if (m < 60) return m + '분 전';
    const h = Math.floor(m / 60); if (h < 24) return h + '시간 전';
    return Math.floor(h / 24) + '일 전';
  }

  async function render() {
    const state = await send({ type: 'PS_GET_STATE' });
    const products = (state && state.products) || [];
    const settings = (state && state.settings) || { currency: '₩' };
    const cur = settings.currency || '₩';

    // Headline counts.
    animateCount($('watchCount'), products.length);
    const threats = products.filter((p) => p.lastChange && p.lastChange.kind === 'threat').length;
    const opps = products.filter((p) => p.lastChange && p.lastChange.kind === 'opportunity').length;
    $('threatCount').textContent = String(threats);
    $('oppCount').textContent = String(opps);

    // Recent moves (products that have actually changed at least once).
    const moved = products
      .filter((p) => p.lastChange && p.lastChange.dir && p.lastChange.dir !== 'same')
      .sort((a, b) => (b.lastChange.at || 0) - (a.lastChange.at || 0));

    const list = $('movesList');
    list.innerHTML = '';
    $('movesCount').textContent = String(moved.length);

    const hasProducts = products.length > 0;
    $('movesEmpty').hidden = hasProducts;
    $('allQuiet').hidden = !(hasProducts && moved.length === 0);

    moved.slice(0, 6).forEach((p, i) => list.appendChild(moveCard(p, cur, i)));

    // Opening the popup acknowledges the alerts → clear the toolbar badge.
    send({ type: 'PS_MARK_SEEN' });
  }

  function moveCard(p, cur, i) {
    const ch = p.lastChange || {};
    const threat = ch.kind === 'threat';
    const card = document.createElement('div');
    card.className = 'move-card' + (threat ? ' threat' : '') + (p.unseen ? ' unseen' : '');
    card.style.setProperty('--ps-delay', (i * 45) + 'ms');
    card.style.animationDelay = (i * 45) + 'ms';
    card.title = p.url || '';

    const dir = ch.dir === 'down' ? 'down' : ch.dir === 'up' ? 'up' : 'same';
    const arrow = dir === 'down' ? '▼' : dir === 'up' ? '▲' : '·';
    const pct = ch.pct != null ? ch.pct : 0;
    const stroke = dir === 'down' ? 'var(--accent-down)' : dir === 'up' ? 'var(--accent-good)' : 'var(--text-tertiary)';

    card.innerHTML =
      '<div class="mc-body">' +
        '<div class="mc-name">' + esc(p.name) + '</div>' +
        '<div class="mc-sub">' +
          '<span class="mc-price">' + esc(fmt(p.currentPrice, cur)) + '</span>' +
          '<span class="mc-host">' + esc(p.site || '') + ' · ' + ago(ch.at) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="mc-right">' +
        sparkSvg(p.history, stroke) +
        '<span class="mc-badge ' + dir + '">' + arrow + ' ' + (pct > 0 ? '+' : '') + pct + '%</span>' +
      '</div>';

    card.addEventListener('click', () => {
      if (p.url) chrome.tabs.create({ url: p.url });
    });
    return card;
  }

  function sparkSvg(history, stroke) {
    const w = 64, h = 22, pad = 3;
    const sp = P ? P.sparkline(history || [], w, h, pad) : { points: '', flat: true };
    if (!sp.points) return '<svg class="mc-spark" viewBox="0 0 ' + w + ' ' + h + '"></svg>';
    return '<svg class="mc-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + sp.points + '" style="stroke:' + stroke + '" opacity="0.9" />' +
      '</svg>';
  }

  // ---- Scan now ----
  $('scanNow').addEventListener('click', async () => {
    const btn = $('scanNow'), label = $('scanLabel');
    btn.classList.add('scanning');
    label.textContent = '정찰 중';
    const r = await send({ type: 'PS_CHECK_NOW' });
    btn.classList.remove('scanning');
    if (r && r.changed > 0) label.textContent = r.changed + '건 변동';
    else label.textContent = '최신';
    await render();
    setTimeout(() => { label.textContent = '정찰'; }, 2400);
  });

  // ---- Navigation ----
  $('openDash').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') }));
  $('openSettings').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#settings') }));

  render();
})();
