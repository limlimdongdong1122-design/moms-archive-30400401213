/* ============================================================
 * IMPULSE VAULT desktop — renderer.js
 * ------------------------------------------------------------
 * The UI controller. Talks ONLY to window.iv (the safe preload
 * bridge) — no Node, no direct IPC. Renders the hub views, drives
 * the 3D vault, and reacts to live events pushed from main (sensor
 * activity, interventions, bridge connect/disconnect).
 * ============================================================ */

(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  let state = null;
  let vault3dState = 'pending';
  let vaultTick = null;
  let supportLoaded = false;

  const fmtKRW = (n) => {
    try { return '₩' + Number(n || 0).toLocaleString('ko-KR'); }
    catch (_) { return '₩' + (n || 0); }
  };

  function animateCount(elm, target) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !target) { elm.textContent = fmtKRW(target || 0); return; }
    const start = performance.now();
    const dur = 1100;
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      elm.textContent = fmtKRW(Math.round(target * (1 - Math.pow(1 - t, 4))));
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
    if (name === 'home') initVault3D();
    if (name === 'support' && !supportLoaded && window.IVSupport && state) {
      window.IVSupport.init(state.config);
      supportLoaded = true;
    }
  }
  function initNav() {
    $$('.nav-link').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  }

  // ---------- Load + render everything ----------
  async function refresh() {
    state = await window.iv.getState();
    renderHome();
    renderVault();
    renderDashboard();
    renderSettings();
    renderBridge(state.bridgeConnected);
  }

  // ---------- Home ----------
  function renderHome() {
    const s = state.stats || {};
    const p = state.profile;
    animateCount($('#totalSaved'), s.totalSaved || 0);
    $('#resisted').textContent = s.resisted || 0;
    $('#resistRate').textContent = Math.round(((p && p.resistRate) || 0) * 100) + '%';

    initVault3D();
    const locked = (state.vault || []).filter((v) => v.status === 'locked');
    if (locked.length === 0) {
      $('#stageItem').textContent = '금고는 비어 있어요';
      if (vault3dState === 'ready') window.IVVault3D.setHasItem(false);
    } else {
      const soonest = locked.slice().sort((a, b) => a.releaseAt - b.releaseAt)[0];
      $('#stageItem').textContent = `🔒 ${soonest.item} · ${fmtKRW(soonest.price)}`;
      if (vault3dState === 'ready') {
        window.IVVault3D.setHasItem(true);
        const total = soonest.releaseAt - soonest.ts;
        const elapsed = Math.min(total, Date.now() - soonest.ts);
        window.IVVault3D.setClarity(total > 0 ? elapsed / total : 1);
      }
    }
    renderActivity();
  }

  function renderActivity() {
    const list = $('#activityList');
    const events = (state.events || []).slice(-15).reverse();
    list.innerHTML = '';
    $('#activityEmpty').hidden = events.length > 0;
    events.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'activity-row';
      const dot = document.createElement('span');
      const kind = e.type === 'search' ? 'search' : e.type === 'view' ? 'view' : 'decision';
      dot.className = 'activity-ico ' + kind;
      const label = document.createElement('span');
      label.textContent = describeEvent(e);
      const when = document.createElement('span');
      when.className = 'activity-when';
      when.textContent = relTime(e.ts);
      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(when);
      list.appendChild(row);
    });
  }
  function describeEvent(e) {
    if (e.type === 'search') return `검색: ${e.keyword || ''}`;
    if (e.type === 'view') return `상품 봄: ${e.keyword || ''}${e.price ? ' · ' + fmtKRW(e.price) : ''}`;
    if (e.type && e.type.startsWith('decision_')) {
      const d = e.type.slice('decision_'.length);
      const map = { resisted: '참았어요', proceeded: '구매함', vaulted: '금고에 넣음' };
      return `${map[d] || d}: ${e.keyword || ''}`;
    }
    return e.type || '';
  }
  function relTime(ts) {
    const m = Math.floor((Date.now() - Number(ts)) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  }

  function renderBridge(connected) {
    const chip = $('#bridgeChip');
    chip.dataset.connected = String(!!connected);
    $('#bridgeText').textContent = connected ? '센서(확장) 연결됨' : '센서(확장) 연결 안 됨';
    $('#bridgeBanner').hidden = !!connected;
  }

  // ---------- 3D ----------
  function initVault3D() {
    if (vault3dState !== 'pending') return;
    const canvas = $('#vaultCanvas');
    vault3dState = window.IVVault3D && window.IVVault3D.init(canvas) ? 'ready' : 'fallback';
    if (vault3dState === 'fallback') {
      $('#vaultFallback').hidden = false;
      canvas.style.display = 'none';
    }
  }

  // ---------- Vault ----------
  function renderVault() {
    const grid = $('#vaultGrid');
    const vault = state.vault || [];
    grid.innerHTML = '';
    $('#vaultEmptyNote').hidden = vault.length > 0;
    vault.slice().sort((a, b) => b.ts - a.ts).forEach((item) => grid.appendChild(vaultCard(item)));
    if (vaultTick) clearInterval(vaultTick);
    vaultTick = setInterval(tickVault, 1000);
    tickVault();
  }
  function vaultCard(item) {
    const card = document.createElement('div');
    card.className = 'v-item ' + item.status;
    card.dataset.id = item.id;

    const name = document.createElement('div');
    name.className = 'vi-name';
    name.textContent = item.item || '이름 없는 항목';
    const price = document.createElement('div');
    price.className = 'vi-price';
    price.textContent = fmtKRW(item.price);
    card.appendChild(name);
    card.appendChild(price);

    if (item.status === 'locked') {
      const timer = document.createElement('div');
      timer.className = 'vi-timer';
      timer.dataset.role = 'timer';
      card.appendChild(timer);
      const actions = document.createElement('div');
      actions.className = 'vi-actions';
      actions.dataset.role = 'actions';
      actions.style.display = 'none';
      const buy = document.createElement('button');
      buy.className = 'vi-buy';
      buy.textContent = '살래요';
      buy.addEventListener('click', async () => {
        await window.iv.vaultUpdate(item.id, { status: 'bought' });
        if (item.url) window.iv.openExternal(item.url);
        refresh();
      });
      const letGo = document.createElement('button');
      letGo.className = 'vi-let';
      letGo.textContent = '보낼래요';
      letGo.addEventListener('click', async () => {
        await window.iv.vaultUpdate(item.id, { status: 'released' });
        if (vault3dState === 'ready') window.IVVault3D.shatter();
        refresh();
      });
      actions.appendChild(buy);
      actions.appendChild(letGo);
      card.appendChild(actions);
    } else {
      const status = document.createElement('span');
      status.className = 'vi-status s-' + item.status;
      status.textContent = item.status === 'bought' ? '구매함' : '보냄 · 절약';
      card.appendChild(status);
    }
    return card;
  }
  function tickVault() {
    const now = Date.now();
    (state.vault || []).filter((v) => v.status === 'locked').forEach((item) => {
      const card = $(`.v-item[data-id="${item.id}"]`);
      if (!card) return;
      const remaining = item.releaseAt - now;
      const timer = card.querySelector('[data-role="timer"]');
      const actions = card.querySelector('[data-role="actions"]');
      if (remaining <= 0) {
        if (timer) timer.textContent = '식음 완료 ✓ — 이제 결정할 시간';
        if (actions) actions.style.display = 'flex';
      } else if (timer) {
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        timer.textContent = h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
      }
    });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const p = state.profile || {};
    const byHour = p.byHour || new Array(24).fill(0);
    const byWeekday = p.byWeekday || new Array(7).fill(0);

    const hm = $('#hourHeatmap');
    hm.innerHTML = '';
    const maxH = Math.max(1, ...byHour);
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.setProperty('--v', String(byHour[h] > 0 ? Math.round(12 + (byHour[h] / maxH) * 78) : 0));
      cell.title = `${h}시 · ${byHour[h]}회`;
      hm.appendChild(cell);
    }
    $('#hourInsight').textContent = p.hasHourSignal
      ? `가장 충동적인 시간대: ${p.peakHour}시쯤.${(p.peakHour >= 23 || p.peakHour <= 3) ? ' 밤 시간 주의 ⚠️' : ''}`
      : '데이터가 더 쌓이면 시간대 패턴을 알려줄게요.';

    const wb = $('#weekdayBars');
    wb.innerHTML = '';
    const maxW = Math.max(1, ...byWeekday);
    for (let d = 0; d < 7; d++) {
      const col = document.createElement('div');
      col.className = 'bar-col';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = Math.round((byWeekday[d] / maxW) * 100) + '%';
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = WEEKDAYS[d];
      col.appendChild(bar);
      col.appendChild(label);
      wb.appendChild(col);
    }

    const kw = $('#topKeywords');
    kw.innerHTML = '';
    if (!p.topKeywords || !p.topKeywords.length) {
      kw.innerHTML = '<span class="empty-note">아직 데이터가 없어요.</span>';
    } else {
      p.topKeywords.forEach((k) => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.appendChild(document.createTextNode(k.key));
        const b = document.createElement('b');
        b.textContent = k.value;
        tag.appendChild(b);
        kw.appendChild(tag);
      });
    }

    const sites = $('#topSites');
    sites.innerHTML = '';
    if (!p.topSites || !p.topSites.length) {
      sites.innerHTML = '<span class="empty-note">아직 데이터가 없어요.</span>';
    } else {
      const max = Math.max(...p.topSites.map((t) => t.value), 1);
      p.topSites.forEach((st) => {
        const row = document.createElement('div');
        row.className = 'rank-row';
        const nm = document.createElement('span'); nm.className = 'rank-name'; nm.textContent = st.key;
        const barWrap = document.createElement('span'); barWrap.className = 'rank-bar';
        const i = document.createElement('i'); i.style.width = Math.round((st.value / max) * 100) + '%';
        barWrap.appendChild(i);
        const val = document.createElement('span'); val.className = 'rank-val'; val.textContent = st.value;
        row.appendChild(nm); row.appendChild(barWrap); row.appendChild(val);
        sites.appendChild(row);
      });
    }
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = state.settings || {};
    $$('#strictnessSeg button').forEach((b) => b.classList.toggle('on', b.dataset.val === s.strictness));
    $('#hourlyWage').value = s.hourlyWage || 0;
    $('#gamePrice').value = s.gamePrice || 0;
    $('#coolingHours').value = String(s.coolingHours || 24);
    $('#pauseToggle').checked = !!s.paused;
    $('#startupToggle').checked = !!s.launchAtStartup;
    if ($('#screenWatchToggle')) $('#screenWatchToggle').checked = !!s.screenWatch;
  }
  function flashSaved() {
    const t = $('#saveToast');
    t.hidden = false;
    clearTimeout(flashSaved._h);
    flashSaved._h = setTimeout(() => (t.hidden = true), 1400);
  }
  async function save(patch) {
    state.settings = await window.iv.saveSettings(patch);
    flashSaved();
  }
  function initSettings() {
    $('#strictnessSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $$('#strictnessSeg button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      save({ strictness: btn.dataset.val });
    });
    $('#hourlyWage').addEventListener('change', (e) => save({ hourlyWage: parseInt(e.target.value, 10) || 0 }));
    $('#gamePrice').addEventListener('change', (e) => save({ gamePrice: parseInt(e.target.value, 10) || 0 }));
    $('#coolingHours').addEventListener('change', (e) => save({ coolingHours: parseInt(e.target.value, 10) || 24 }));
    $('#pauseToggle').addEventListener('change', (e) => save({ paused: e.target.checked }));
    $('#startupToggle').addEventListener('change', (e) => save({ launchAtStartup: e.target.checked }));
    if ($('#screenWatchToggle')) {
      $('#screenWatchToggle').addEventListener('change', (e) => {
        if (e.target.checked) {
          alert('화면 감시를 켜요 (실험적).\n\n- 화면을 주기적으로 읽어(OCR) 결제 화면을 감지해요.\n- OCR은 기기 안에서만 동작하고, 화면 내용은 밖으로 나가지 않아요.\n- 처음엔 화면 녹화 권한을 물어볼 수 있어요(허용 필요).\n- 클릭을 막진 못하고 알림으로 멈춰 세워요.');
        }
        save({ screenWatch: e.target.checked });
      });
    }
    $('#deleteAll').addEventListener('click', async () => {
      if (!confirm('정말 모든 데이터를 삭제할까요? 되돌릴 수 없어요.')) return;
      state = await window.iv.deleteAll();
      refresh();
      alert('모든 데이터를 삭제했어요. 🧹');
    });
    $('#installExt').addEventListener('click', () => showView('settings'));
  }

  // ---------- Live events from main ----------
  function initEvents() {
    window.iv.on('bridge-status', (p) => renderBridge(p.connected));
    window.iv.on('sensor', () => refresh());
    window.iv.on('intervention', () => refresh());
    window.iv.on('settings-changed', () => refresh());
    window.iv.on('navigate', (p) => showView(p.view || 'home'));
    window.iv.on('screen-intervention', (p) => {
      // A purchase screen was detected in some app → reflect it in the hub.
      const d = (p && p.detect) || {};
      const el = document.getElementById('stageItem');
      if (el) el.textContent = '🛑 결제 화면 감지' + (d.price ? ' · 약 ₩' + Number(d.price).toLocaleString('ko-KR') : '');
      showView('home');
    });
    window.iv.on('screen-status', (p) => renderScreenStatus((p && p.status) || {}));
  }

  // Show the live screen-watch status under the toggle so the user can see
  // whether OCR loaded and is actually scanning (it used to fail silently).
  function renderScreenStatus(st) {
    const el = document.getElementById('screenWatchStatus');
    if (!el) return;
    const icon = { loading: '⏳', ready: '✅', scan: '👁️', error: '⚠️', off: '' };
    if (!st.state || st.state === 'off') { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.style.color = st.state === 'error' ? 'var(--accent-warn)' : 'var(--accent-calm)';
    el.textContent = (icon[st.state] || '') + ' ' + (st.info || st.state);
  }

  // ---------- Boot ----------
  function boot() {
    initNav();
    initSettings();
    initEvents();
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
