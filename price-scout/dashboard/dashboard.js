/* ============================================================
 * PRICE SCOUT — dashboard/dashboard.js
 * ------------------------------------------------------------
 * The command center. Reads the full state from the background worker,
 * paints the overview, the watchlist (with editable "my price" and
 * sparklines), the settings, the Pro panel, and the privacy/data view.
 *
 * No direct storage access — every mutation goes through the worker so
 * there is exactly one writer. Pure number/format work is borrowed from
 * PSPrice (loaded first).
 * ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const P = window.PSPrice;

  let CURRENCY = '₩';

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res || null); });
      } catch (_) { resolve(null); }
    });
  }
  function fmt(n) { return P ? P.formatPrice(n, CURRENCY) : CURRENCY + (n || 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function ago(ts) {
    if (!ts) return '아직 정찰 전';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '방금 정찰';
    const m = Math.floor(s / 60); if (m < 60) return m + '분 전 정찰';
    const h = Math.floor(m / 60); if (h < 24) return h + '시간 전 정찰';
    return Math.floor(h / 24) + '일 전 정찰';
  }

  // ---- count-up for headline numbers ----
  function animateCount(elm, target, prefix) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target = Number(target) || 0;
    const out = (v) => (prefix || '') + Math.round(v).toLocaleString('ko-KR');
    if (reduce || !target) { elm.textContent = out(target); return; }
    const start = performance.now(), dur = 900;
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      elm.textContent = out(target * eased);
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  /* ---------------- render ---------------- */
  async function render() {
    const state = await send({ type: 'PS_GET_STATE' });
    const products = (state && state.products) || [];
    const settings = (state && state.settings) || {};
    const stats = (state && state.stats) || {};
    CURRENCY = settings.currency || '₩';

    renderOverview(products, settings, stats);
    renderWatchlist(products, settings);
    fillSettings(settings);
    renderPlan(settings);
    renderData(products, settings, stats);

    // viewing the dashboard acknowledges the alerts
    send({ type: 'PS_MARK_SEEN' });
  }

  function renderOverview(products, settings, stats) {
    const threats = products.filter((p) => p.lastChange && p.lastChange.kind === 'threat').length;
    const opps = products.filter((p) => p.lastChange && p.lastChange.kind === 'opportunity').length;
    animateCount($('ovWatch'), products.length);
    animateCount($('ovThreat'), threats);
    animateCount($('ovOpp'), opps);
    animateCount($('ovChecks'), stats.checks || 0);
    animateCount($('ovAlerts'), stats.alerts || 0);

    const last = products.reduce((m, p) => Math.max(m, p.lastChecked || 0), 0);
    $('lastChecked').textContent = last ? ago(last) : '';
    const caption = $('stageCaption');
    if (!products.length) caption.textContent = '정찰 대기 중 — 상품을 추가해보세요';
    else if (threats) caption.textContent = '⚠ 언더컷 위협 ' + threats + '건 감지';
    else caption.textContent = products.length + '개 상품 정찰 중 · 안정적';
  }

  function renderWatchlist(products, settings) {
    const list = $('wlList');
    list.innerHTML = '';
    $('wlCount').textContent = String(products.length);
    $('wlEmpty').hidden = products.length > 0;

    // free-limit banner
    const limit = 5;
    const overOrAt = !settings.pro && products.length >= limit;
    $('limitBanner').hidden = !overOrAt;
    $('limitUsed').textContent = String(products.length);
    $('limitMax').textContent = String(limit);

    // newest-change first, then newest-added
    products
      .slice()
      .sort((a, b) => ((b.lastChange && b.lastChange.at) || b.createdAt || 0) - ((a.lastChange && a.lastChange.at) || a.createdAt || 0))
      .forEach((p, i) => list.appendChild(watchRow(p, i)));
  }

  function watchRow(p, i) {
    const ch = p.lastChange || {};
    const dir = ch.dir === 'down' ? 'down' : ch.dir === 'up' ? 'up' : 'same';
    const threat = ch.kind === 'threat';
    const pct = ch.pct != null ? ch.pct : 0;

    const row = document.createElement('div');
    row.className = 'wl-row' + (threat ? ' threat' : '');
    row.style.animationDelay = (i * 40) + 'ms';
    row.dataset.id = p.id;

    // thumb
    const thumb = p.image
      ? '<img src="' + esc(p.image) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'" />'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/></svg>';

    // vs-my-price badge
    const vs = P ? P.vsMyPrice(p.myPrice, p.currentPrice) : { status: 'unknown' };
    let vsHtml = '';
    if (vs.status === 'cheaper') vsHtml = '<span class="vs-badge vs-cheaper" title="경쟁사가 내 가격보다 쌉니다">▼ 내 가격보다 ' + fmt(Math.abs(vs.diff)) + ' 쌈</span>';
    else if (vs.status === 'pricier') vsHtml = '<span class="vs-badge vs-pricier" title="경쟁사가 내 가격보다 비쌉니다">▲ 내 가격보다 ' + fmt(Math.abs(vs.diff)) + ' 비쌈</span>';
    else if (vs.status === 'equal') vsHtml = '<span class="vs-badge vs-equal">= 동일가</span>';

    const range = (p.lowest || p.highest)
      ? '최저 ' + fmt(p.lowest) + ' · 최고 ' + fmt(p.highest)
      : '기록 누적 중';

    const arrow = dir === 'down' ? '▼' : dir === 'up' ? '▲' : '·';
    const stroke = dir === 'down' ? 'var(--accent-down)' : dir === 'up' ? 'var(--accent-good)' : 'var(--text-tertiary)';
    const badge = ch.dir && dir !== 'same'
      ? '<span class="change-badge ' + dir + '">' + arrow + ' ' + (pct > 0 ? '+' : '') + pct + '%</span>'
      : '<span class="change-badge same">변동 없음</span>';

    row.innerHTML =
      '<div class="wl-thumb">' + thumb + '</div>' +
      '<div class="wl-main">' +
        '<div class="wl-name"><a href="' + esc(p.url) + '" target="_blank" rel="noreferrer noopener">' + esc(p.name) + '</a></div>' +
        '<div class="wl-sub">' +
          '<span class="wl-host">' + esc(p.site || '') + ' · ' + ago(p.lastChecked) + '</span>' +
          (p.needsVisit ? '<span class="wl-note">↗ 페이지 방문이 필요해요</span>' : '') +
          vsHtml +
        '</div>' +
      '</div>' +
      '<div class="wl-prices">' +
        '<span class="wl-cur">' + fmt(p.currentPrice) + '</span>' +
        '<span class="wl-range">' + range + '</span>' +
      '</div>' +
      '<div class="my-price">' +
        '<label for="mp_' + p.id + '">내 판매가</label>' +
        '<input type="number" id="mp_' + p.id + '" min="0" step="100" placeholder="입력" value="' + (p.myPrice || '') + '" />' +
      '</div>' +
      '<div class="wl-spark-cell">' +
        sparkSvg(p.history, stroke) +
        badge +
        '<div class="wl-actions">' +
          '<button class="icon-btn" data-act="visit" title="상품 페이지 열기" aria-label="상품 페이지 열기">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>' +
          '</button>' +
          '<button class="icon-btn" data-act="scan" title="이 상품만 정찰" aria-label="이 상품만 정찰">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/></svg>' +
          '</button>' +
          '<button class="icon-btn danger" data-act="remove" title="추적 중지" aria-label="추적 중지">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    // my-price commit
    const mp = row.querySelector('#mp_' + p.id);
    const commit = async () => {
      await send({ type: 'PS_SET_MY_PRICE', id: p.id, myPrice: mp.value });
      render();
    };
    mp.addEventListener('change', commit);
    mp.addEventListener('keydown', (e) => { if (e.key === 'Enter') mp.blur(); });

    // actions
    row.querySelector('[data-act="visit"]').addEventListener('click', () => {
      if (p.url) window.open(p.url, '_blank', 'noopener');
    });
    row.querySelector('[data-act="scan"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.classList.add('spinning');
      await send({ type: 'PS_CHECK_NOW', id: p.id });
      btn.classList.remove('spinning');
      render();
    });
    row.querySelector('[data-act="remove"]').addEventListener('click', async () => {
      if (!confirm('"' + p.name + '" 추적을 중지할까요?')) return;
      await send({ type: 'PS_TRACK_REMOVE', id: p.id });
      render();
    });

    return row;
  }

  function sparkSvg(history, stroke) {
    const w = 92, h = 34, pad = 4;
    const sp = P ? P.sparkline(history || [], w, h, pad) : { points: '' };
    if (!sp.points) return '<svg class="wl-spark" viewBox="0 0 ' + w + ' ' + h + '"></svg>';
    // build a faint filled area under the line for a premium chart feel
    const first = sp.points.split(' ')[0].split(',')[0];
    const lastPt = sp.points.split(' ');
    const lastX = lastPt[lastPt.length - 1].split(',')[0];
    const area = sp.points + ' ' + lastX + ',' + h + ' ' + first + ',' + h;
    return '<svg class="wl-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="psFade" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + stroke + '"/><stop offset="100%" stop-color="' + stroke + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<polygon class="area" points="' + area + '" />' +
      '<polyline points="' + sp.points + '" style="stroke:' + stroke + '" />' +
      '</svg>';
  }

  /* ---------------- settings ---------------- */
  function fillSettings(s) {
    $('intervalSel').value = String(s.checkIntervalHours || 6);
    $('thresholdInput').value = s.notifyThresholdPct != null ? s.notifyThresholdPct : 0;
    $('notifyToggle').checked = s.notifyOnChange !== false;
    $('currencySel').value = s.currency || '₩';
  }
  function toast() {
    const t = $('saveToast'); t.hidden = false;
    clearTimeout(toast._h); toast._h = setTimeout(() => { t.hidden = true; }, 1600);
  }
  async function saveSetting(patch) {
    await send({ type: 'PS_SAVE_SETTINGS', patch });
    toast();
  }
  $('intervalSel').addEventListener('change', (e) => saveSetting({ checkIntervalHours: Number(e.target.value) || 6 }));
  $('thresholdInput').addEventListener('change', (e) => {
    let v = Math.max(0, Math.min(90, Number(e.target.value) || 0));
    e.target.value = v; saveSetting({ notifyThresholdPct: v });
  });
  $('notifyToggle').addEventListener('change', (e) => saveSetting({ notifyOnChange: e.target.checked }));
  $('currencySel').addEventListener('change', (e) => { CURRENCY = e.target.value; saveSetting({ currency: e.target.value }).then(render); });

  /* ---------------- plan / pro ---------------- */
  function renderPlan(s) {
    const chip = $('planChip');
    if (s.pro) { chip.textContent = '✦ Pro 플랜'; chip.classList.add('pro'); $('proToggle').textContent = 'Pro 해제 (데모)'; $('proNote').textContent = '※ 데모 Pro가 켜져 있어요. 무제한으로 추적할 수 있습니다.'; }
    else { chip.textContent = '무료 플랜'; chip.classList.remove('pro'); $('proToggle').textContent = 'Pro 시작하기'; $('proNote').textContent = '※ 결제 연동은 출시 시 활성화됩니다. 지금은 데모로 Pro 기능을 켜볼 수 있어요.'; }
  }
  $('proToggle').addEventListener('click', async () => {
    const state = await send({ type: 'PS_GET_STATE' });
    const cur = state && state.settings && state.settings.pro;
    await send({ type: 'PS_SET_PRO', pro: !cur });
    render();
  });
  $('limitUpgrade').addEventListener('click', () => { location.hash = '#pro'; });

  /* ---------------- data / privacy ---------------- */
  function renderData(products, settings, stats) {
    const points = products.reduce((n, p) => n + ((p.history && p.history.length) || 0), 0);
    const rows = [
      ['추적 중인 상품', products.length + '개'],
      ['누적 가격 기록', points.toLocaleString('ko-KR') + '개 지점'],
      ['누적 정찰 횟수', (stats.checks || 0).toLocaleString('ko-KR') + '회'],
      ['보낸 알림', (stats.alerts || 0).toLocaleString('ko-KR') + '회'],
      ['플랜', settings.pro ? 'Pro (데모)' : '무료'],
      ['서버로 전송된 개인정보', '0건 (전부 로컬 저장)'],
    ];
    $('dataTable').innerHTML = rows.map((r) =>
      '<div class="data-row"><span class="dr-key">' + esc(r[0]) + '</span><span class="dr-val">' + esc(r[1]) + '</span></div>'
    ).join('');
  }

  $('exportData').addEventListener('click', async () => {
    const state = await send({ type: 'PS_GET_STATE' });
    const payload = {
      app: 'PRICE SCOUT',
      exportedAt: new Date().toISOString(),
      products: (state && state.products) || [],
      settings: (state && state.settings) || {},
      stats: (state && state.stats) || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'price-scout-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('deleteAll').addEventListener('click', async () => {
    if (!confirm('추적 목록·가격 기록·통계·설정을 모두 삭제할까요? 되돌릴 수 없어요.')) return;
    await send({ type: 'PS_CLEAR_ALL' });
    render();
  });

  /* ---------------- scan-all buttons ---------------- */
  async function scanAll(btn, label) {
    if (btn) btn.classList.add('scanning');
    const r = await send({ type: 'PS_CHECK_NOW' });
    if (btn) btn.classList.remove('scanning');
    if (label && r) label.textContent = r.changed > 0 ? r.changed + '건 변동 감지' : '최신 상태';
    await render();
    if (label) setTimeout(() => { label.textContent = '지금 정찰하기'; }, 2600);
  }
  $('scanNow').addEventListener('click', () => scanAll($('scanNow'), $('scanLabel')));
  $('scanNow2').addEventListener('click', (e) => scanAll(e.currentTarget, null));

  /* ---------------- sidebar nav active state ---------------- */
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const panels = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
  function syncNav() {
    let active = panels[0];
    const y = window.scrollY + 120;
    for (const pan of panels) { if (pan && pan.offsetTop <= y) active = pan; }
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + (active && active.id)));
  }
  window.addEventListener('scroll', syncNav, { passive: true });

  // open directly to a section if a hash is present (e.g. #settings)
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 200);
  }

  render();
})();
