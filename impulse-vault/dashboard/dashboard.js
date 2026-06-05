/* ============================================================
 * IMPULSE VAULT — dashboard/dashboard.js
 * ------------------------------------------------------------
 * Loads the local impulse profile and renders every visualization,
 * drives the 3D vault, and hosts settings + the My Data panel.
 * Everything reads from chrome.storage; nothing leaves the device.
 * ============================================================ */

(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  // 'pending' until we try once, then 'ready' (WebGL) or 'fallback' (CSS).
  let vault3dState = 'pending';

  // Cached Pro status (from the background worker / IVPro).
  let proStatus = { isPro: false, paid: false, trialActive: false, devOverride: false };
  let proIsStub = true;

  function fmtKRW(n) {
    try {
      return '₩' + Number(n || 0).toLocaleString('ko-KR');
    } catch (_) {
      return '₩' + (n || 0);
    }
  }

  function domainToOrigin(domain) {
    const clean = String(domain)
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    return `*://*.${clean}/*`;
  }

  // ------- Sidebar active state on scroll/click -------
  function initNav() {
    $$('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        $$('.nav-link').forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
      });
    });
    // If arrived with #settings etc., scroll there.
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  // ===================================================
  // OVERVIEW + 3D
  // ===================================================
  async function renderOverview() {
    const [stats, profile, vault] = await Promise.all([
      IVStorage.getStats(),
      IVStorage.getProfile(),
      IVStorage.getVault(),
    ]);

    $('#totalSaved').textContent = fmtKRW(stats.totalSaved);
    $('#resisted').textContent = stats.resisted || 0;
    $('#interventions').textContent = stats.interventions || 0;
    $('#resistRate').textContent =
      Math.round(((profile && profile.resistRate) || 0) * 100) + '%';
    $('#avgSpend').textContent = fmtKRW((profile && profile.avgSpend) || 0);

    // 3D vault reflects the nearest locked item's cooling progress.
    // Initialize the WebGL scene exactly once (subsequent refreshes only
    // update clarity / item visibility).
    const locked = vault.filter((v) => v.status === 'locked');
    const canvas = $('#vaultCanvas');
    if (vault3dState === 'pending') {
      vault3dState = window.IVVault3D && window.IVVault3D.init(canvas) ? 'ready' : 'fallback';
      if (vault3dState === 'fallback') {
        $('#vaultFallback').hidden = false;
        canvas.style.display = 'none';
      }
    }
    const ok = vault3dState === 'ready';

    if (locked.length === 0) {
      $('#stageItem').textContent = '금고는 비어 있어요';
      if (ok) window.IVVault3D.setHasItem(false);
    } else {
      // Pick the item closest to release for the visual.
      const soonest = locked.slice().sort((a, b) => a.releaseAt - b.releaseAt)[0];
      $('#stageItem').textContent = `🔒 ${soonest.item} · ${fmtKRW(soonest.price)}`;
      if (ok) {
        window.IVVault3D.setHasItem(true);
        const total = soonest.releaseAt - soonest.ts;
        const elapsed = Math.min(total, Date.now() - soonest.ts);
        window.IVVault3D.setClarity(total > 0 ? elapsed / total : 1);
      }
    }
  }

  // ===================================================
  // PROFILE CHARTS
  // ===================================================
  function renderHeatmap(byHour) {
    const wrap = $('#hourHeatmap');
    wrap.innerHTML = '';
    const max = Math.max(1, ...byHour);
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      // --v (0..100) drives a token-based color-mix in CSS:
      // bg-elev-2 → accent-warn. More temptation = warmer.
      const v = byHour[h] > 0 ? 12 + (byHour[h] / max) * 78 : 0;
      cell.style.setProperty('--v', String(Math.round(v)));
      cell.title = `${h}시 · ${byHour[h]}회`;
      wrap.appendChild(cell);
    }
  }

  function renderWeekday(byWeekday) {
    const wrap = $('#weekdayBars');
    wrap.innerHTML = '';
    const max = Math.max(1, ...byWeekday);
    for (let d = 0; d < 7; d++) {
      const col = document.createElement('div');
      col.className = 'bar-col';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = Math.round((byWeekday[d] / max) * 100) + '%';
      bar.title = `${byWeekday[d]}회`;
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = WEEKDAYS[d];
      col.appendChild(bar);
      col.appendChild(label);
      wrap.appendChild(col);
    }
  }

  function renderKeywords(top) {
    const wrap = $('#topKeywords');
    wrap.innerHTML = '';
    if (!top || top.length === 0) {
      wrap.innerHTML = '<span class="empty-note">아직 끌린 게 없어요 — 고요하네요. 🌙</span>';
      return;
    }
    top.forEach((k) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `${k.key}<b>${k.value}</b>`;
      wrap.appendChild(tag);
    });
  }

  function renderSites(top) {
    const wrap = $('#topSites');
    wrap.innerHTML = '';
    if (!top || top.length === 0) {
      wrap.innerHTML = '<span class="empty-note">아직 패턴이 없어요. 며칠 쓰면 여기에 보여줄게요.</span>';
      return;
    }
    const max = Math.max(...top.map((t) => t.value), 1);
    top.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'rank-row';
      row.innerHTML = `
        <span class="rank-name">${s.key}</span>
        <span class="rank-bar"><i style="width:${Math.round((s.value / max) * 100)}%"></i></span>
        <span class="rank-val">${s.value}</span>`;
      wrap.appendChild(row);
    });
  }

  async function renderProfile() {
    let profile = await IVStorage.getProfile();
    if (!profile) {
      // Ask the worker to compute one from whatever exists.
      const res = await sendMsg({ type: 'REBUILD_PROFILE' });
      profile = (res && res.profile) || null;
    }
    const byHour = (profile && profile.byHour) || new Array(24).fill(0);
    const byWeekday = (profile && profile.byWeekday) || new Array(7).fill(0);

    renderHeatmap(byHour);
    renderWeekday(byWeekday);
    renderKeywords(profile && profile.topKeywords);
    renderSites(profile && profile.topSites);

    const insight = $('#hourInsight');
    if (profile && profile.hasHourSignal) {
      const h = profile.peakHour;
      const lateNote = IVPatterns.isLateNight(h) ? ' 밤 시간 주의 ⚠️' : '';
      insight.textContent = `가장 충동적인 시간대: ${h}시쯤.${lateNote}`;
    } else {
      insight.textContent = '데이터가 더 쌓이면 시간대 패턴을 알려줄게요.';
    }
  }

  // ===================================================
  // VAULT
  // ===================================================
  async function renderVault() {
    const vault = await IVStorage.getVault();
    const grid = $('#vaultGrid');
    grid.innerHTML = '';
    $('#vaultEmptyNote').hidden = vault.length > 0;

    vault
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .forEach((item) => grid.appendChild(vaultItemCard(item)));
  }

  function vaultItemCard(item) {
    const now = Date.now();
    const ready = item.status === 'locked' && now >= item.releaseAt;
    const card = document.createElement('div');
    card.className = 'v-item ' + item.status;

    const statusText = {
      locked: ready ? '식음 완료 ✓' : '식히는 중',
      bought: '구매함',
      released: '보냄 · 절약',
    }[item.status];

    card.innerHTML = `
      <div class="vi-name">${escapeHtml(item.item)}</div>
      <div class="vi-price">${fmtKRW(item.price)}</div>
      <span class="vi-status s-${item.status}">${statusText}</span>`;

    if (item.status === 'locked') {
      const actions = document.createElement('div');
      actions.className = 'vi-actions';
      const buy = document.createElement('button');
      buy.className = 'vi-buy';
      buy.textContent = '살래요';
      buy.addEventListener('click', async () => {
        await IVStorage.updateVaultItem(item.id, { status: 'bought' });
        if (item.url) window.open(item.url, '_blank');
        refreshAll();
      });
      const letGo = document.createElement('button');
      letGo.className = 'vi-let';
      letGo.textContent = '보낼래요';
      letGo.addEventListener('click', async () => {
        await IVStorage.updateVaultItem(item.id, { status: 'released' });
        await IVStorage.bumpStats({ totalSaved: item.price || 0 });
        if (window.IVVault3D && window.IVVault3D.available()) window.IVVault3D.shatter();
        refreshAll();
      });
      actions.appendChild(buy);
      actions.appendChild(letGo);
      card.appendChild(actions);
    }
    return card;
  }

  // ===================================================
  // SETTINGS
  // ===================================================
  let settingsCache = null;

  async function renderSettings() {
    const s = await IVStorage.getSettings();
    settingsCache = s;

    $$('#strictnessSeg button').forEach((b) =>
      b.classList.toggle('on', b.dataset.val === s.strictness)
    );
    $('#hourlyWage').value = s.hourlyWage || 0;
    $('#weeklyAllowance').value = s.weeklyAllowance || 0;
    $('#gamePrice').value = s.gamePrice || 0;
    $('#coolingHours').value = String(s.coolingHours || 24);
    $('#pauseToggle').checked = !!s.paused;

    $('#alwaysAskToggle').checked = s.alwaysAsk !== false;

    // Cold Purchase Analysis settings
    $('#coldToggle').checked = s.coldAnalysis !== false;
    $('#allSitesToggle').checked = !!s.allSites;
    $('#webSearchToggle').checked = !!s.webSearchEnabled;
    $('#aiToggle').checked = !!s.aiEnabled;
    $('#aiProvider').value = s.aiProvider || 'claude';
    $('#aiKey').value = s.aiKey || '';
    $('#aiModel').value = s.aiModel || '';
    $('#aiProxyUrl').value = s.aiProxyUrl || '';
    $('#aiProxySecret').value = s.aiProxySecret || '';
    $('#aiKeyArea').hidden = !s.aiEnabled;

    // Managed AI (no key) is a Pro perk — show the note to Free users who
    // haven't supplied their own key.
    const note = $('#aiProNote');
    if (note) note.hidden = !!(proStatus && proStatus.isPro) || !!(s.aiKey && s.aiKey.trim());

    renderDomainList(s.domains);
  }

  function renderDomainList(domains) {
    const wrap = $('#domainList');
    wrap.innerHTML = '';
    domains.forEach((d) => {
      const pill = document.createElement('span');
      pill.className = 'domain-pill';
      pill.innerHTML = `<span>${escapeHtml(d)}</span>`;
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = '제거';
      x.addEventListener('click', () => removeDomain(d));
      pill.appendChild(x);
      wrap.appendChild(pill);
    });
  }

  function flashSaved() {
    const t = $('#saveToast');
    t.hidden = false;
    clearTimeout(flashSaved._h);
    flashSaved._h = setTimeout(() => (t.hidden = true), 1400);
  }

  async function saveField(patch) {
    settingsCache = await IVStorage.saveSettings(patch);
    flashSaved();
  }

  async function addDomain() {
    const input = $('#newDomain');
    const raw = input.value.trim();
    if (!raw) return;
    const domain = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (settingsCache.domains.includes(domain)) {
      input.value = '';
      return;
    }
    // Request host permission for the new domain (needs this click gesture).
    const origin = domainToOrigin(domain);
    const granted = await new Promise((resolve) => {
      try {
        chrome.permissions.request({ origins: [origin] }, (r) => {
          void chrome.runtime.lastError;
          resolve(!!r);
        });
      } catch (_) {
        resolve(false);
      }
    });
    if (!granted) {
      alert('권한이 승인되지 않아 추가하지 못했어요.');
      return;
    }
    const next = settingsCache.domains.concat(domain);
    await saveField({ domains: next });
    input.value = '';
    await sendMsg({ type: 'SETTINGS_CHANGED' });
    renderDomainList(next);
  }

  async function removeDomain(domain) {
    const origin = domainToOrigin(domain);
    // Drop the host permission too (best-effort).
    try {
      await new Promise((resolve) =>
        chrome.permissions.remove({ origins: [origin] }, () => resolve())
      );
    } catch (_) {}
    const next = settingsCache.domains.filter((d) => d !== domain);
    await saveField({ domains: next });
    await sendMsg({ type: 'SETTINGS_CHANGED' });
    renderDomainList(next);
  }

  function initSettingsHandlers() {
    $('#strictnessSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $$('#strictnessSeg button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      saveField({ strictness: btn.dataset.val });
    });
    $('#hourlyWage').addEventListener('change', (e) =>
      saveField({ hourlyWage: parseInt(e.target.value, 10) || 0 })
    );
    $('#weeklyAllowance').addEventListener('change', (e) =>
      saveField({ weeklyAllowance: parseInt(e.target.value, 10) || 0 })
    );
    $('#gamePrice').addEventListener('change', (e) =>
      saveField({ gamePrice: parseInt(e.target.value, 10) || 0 })
    );
    $('#coolingHours').addEventListener('change', (e) =>
      saveField({ coolingHours: parseInt(e.target.value, 10) || 24 })
    );
    $('#pauseToggle').addEventListener('change', async (e) => {
      await saveField({ paused: e.target.checked });
      await sendMsg({ type: 'SETTINGS_CHANGED' });
    });
    $('#addDomain').addEventListener('click', addDomain);
    $('#newDomain').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addDomain();
    });

    $('#alwaysAskToggle').addEventListener('change', async (e) => {
      await saveField({ alwaysAsk: e.target.checked });
      await sendMsg({ type: 'SETTINGS_CHANGED' });
    });

    // ---- Cold Purchase Analysis ----
    $('#coldToggle').addEventListener('change', (e) => saveField({ coldAnalysis: e.target.checked }));
    $('#webSearchToggle').addEventListener('change', (e) => saveField({ webSearchEnabled: e.target.checked }));
    $('#allSitesToggle').addEventListener('change', async (e) => {
      const on = e.target.checked;
      if (on) {
        const granted = await new Promise((resolve) => {
          try {
            chrome.permissions.request({ origins: ['*://*/*'] }, (r) => { void chrome.runtime.lastError; resolve(!!r); });
          } catch (_) { resolve(false); }
        });
        if (!granted) {
          e.target.checked = false;
          alert('모든 사이트에서 감지하려면 전체 사이트 접근 권한이 필요해요.');
          return;
        }
      }
      await saveField({ allSites: on });
      await sendMsg({ type: 'SETTINGS_CHANGED' }); // re-register content scripts
    });
    $('#aiProvider').addEventListener('change', (e) => saveField({ aiProvider: e.target.value }));
    $('#aiKey').addEventListener('change', (e) => saveField({ aiKey: e.target.value.trim() }));
    $('#aiModel').addEventListener('change', (e) => saveField({ aiModel: e.target.value.trim() }));
    $('#aiProxySecret').addEventListener('change', (e) => saveField({ aiProxySecret: e.target.value.trim() }));
    $('#aiProxyUrl').addEventListener('change', async (e) => {
      const url = e.target.value.trim();
      await saveField({ aiProxyUrl: url });
      // Need host permission to fetch the proxy origin from the worker.
      if (/^https?:\/\//i.test(url)) {
        let origin = url;
        try { origin = new URL(url).origin + '/*'; } catch (_) {}
        chrome.permissions.request({ origins: [origin] }, (r) => { void chrome.runtime.lastError; });
      }
    });

    // "AI 연결 테스트" — isolates the AI call so the exact error is visible.
    $('#aiTestBtn').addEventListener('click', async () => {
      const out = $('#aiTestResult');
      // Make sure we have permission to reach the provider (user gesture).
      const granted = await new Promise((resolve) => {
        try {
          chrome.permissions.request(
            { origins: ['https://api.anthropic.com/*', 'https://api.openai.com/*'] },
            (r) => { void chrome.runtime.lastError; resolve(!!r); }
          );
        } catch (_) { resolve(false); }
      });
      if (!granted) {
        out.style.color = 'var(--accent-warn)';
        out.textContent = '✗ 제공자 접근 권한이 필요해요.';
        return;
      }
      // Persist current field values first so the worker uses them.
      await saveField({
        aiEnabled: true,
        aiProvider: $('#aiProvider').value,
        aiKey: $('#aiKey').value.trim(),
        aiModel: $('#aiModel').value.trim(),
      });
      $('#aiToggle').checked = true;
      $('#aiKeyArea').hidden = false;
      out.style.color = 'var(--text-secondary)';
      out.textContent = '테스트 중…';
      const res = await sendMsg({
        type: 'ANALYZE_AI',
        details: { name: '테스트 상품', price: 50000, itemType: 'product', specs: ['예시 스펙'], reviews: [] },
      });
      if (res && res.ok && res.text) {
        out.style.color = 'var(--accent-good)';
        out.textContent = '✓ 연결 성공! AI 분석이 정상 작동해요.';
      } else {
        out.style.color = 'var(--accent-warn)';
        out.textContent = '✗ 실패: ' + ((res && res.error) || '알 수 없는 오류');
      }
    });
    $('#aiToggle').addEventListener('change', async (e) => {
      const on = e.target.checked;
      $('#aiKeyArea').hidden = !on;
      if (on) {
        // Request host permission for the chosen AI provider (runtime grant).
        const origins = ['https://api.anthropic.com/*', 'https://api.openai.com/*'];
        const granted = await new Promise((resolve) => {
          try {
            chrome.permissions.request({ origins }, (r) => { void chrome.runtime.lastError; resolve(!!r); });
          } catch (_) { resolve(false); }
        });
        if (!granted) {
          e.target.checked = false;
          $('#aiKeyArea').hidden = true;
          alert('AI 분석을 쓰려면 제공자(api.anthropic.com / api.openai.com) 접근 권한이 필요해요.');
          return;
        }
      }
      await saveField({ aiEnabled: on });
    });
  }

  // ===================================================
  // MEMBERSHIP / PRO
  // ===================================================
  async function loadPro() {
    const res = await sendMsg({ type: 'GET_PRO' });
    if (res && res.status) proStatus = res.status;
    proIsStub = !!(res && res.stub);
    return proStatus;
  }

  function trialDaysLeft() {
    if (!proStatus.trialStartedAt) return 0;
    const days = (window.IVPro ? IVPro.TRIAL_DAYS : 7);
    const end = proStatus.trialStartedAt + days * 24 * 3600 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 3600 * 1000)));
  }

  function renderMembership() {
    const s = proStatus || {};
    const badge = $('#proBadge');
    const upgrade = $('#proUpgrade');
    const manage = $('#proManage');
    const status = $('#proStatus');
    const demo = $('#proDemo');
    const devToggle = $('#devProToggle');

    badge.classList.remove('is-pro', 'is-trial');
    status.classList.remove('good', 'warn');

    if (s.paid) {
      badge.textContent = 'PRO'; badge.classList.add('is-pro');
      upgrade.hidden = true; manage.hidden = false;
      status.textContent = '💙 Pro 구독 중이에요. 함께해줘서 고마워요.'; status.classList.add('good');
    } else if (s.trialActive) {
      badge.textContent = '체험 중'; badge.classList.add('is-trial');
      upgrade.hidden = false; upgrade.textContent = '지금 구독하기'; manage.hidden = false;
      status.textContent = `무료 체험 중 — 남은 ${trialDaysLeft()}일`; status.classList.add('warn');
    } else if (s.devOverride) {
      badge.textContent = 'PRO · 데모'; badge.classList.add('is-pro');
      upgrade.hidden = false; upgrade.textContent = 'Pro 시작하기'; manage.hidden = true;
      status.textContent = '🧪 데모로 Pro 기능을 미리 보는 중이에요 (실제 결제 아님).'; status.classList.add('good');
    } else {
      badge.textContent = 'FREE';
      upgrade.hidden = false; upgrade.textContent = 'Pro 시작하기'; manage.hidden = true;
      status.textContent = proIsStub
        ? '※ 결제 연동(ExtPay) 전이라 데모 모드예요. 아래 토글로 Pro 기능을 미리 볼 수 있어요.'
        : '';
    }

    // The local preview toggle only makes sense before real billing is wired.
    demo.hidden = !proIsStub;
    devToggle.checked = !!s.devOverride;
  }

  function initProHandlers() {
    $('#proUpgrade').addEventListener('click', async () => {
      if (proIsStub) {
        const st = $('#proStatus');
        st.classList.remove('good'); st.classList.add('warn');
        st.textContent = '결제는 실제 ExtPay 연동 후 활성화돼요. 지금은 아래 “데모” 토글로 Pro를 미리 체험해보세요. (lib/ExtPay.js 안내 참고)';
        $('#proDemo').hidden = false;
        return;
      }
      await sendMsg({ type: 'OPEN_PAYMENT' });
    });

    $('#proManage').addEventListener('click', async () => {
      await sendMsg({ type: 'OPEN_PAYMENT' }); // ExtPay's page handles manage/cancel
    });

    $('#devProToggle').addEventListener('change', async (e) => {
      const res = await sendMsg({ type: 'SET_DEV_PRO', on: e.target.checked });
      if (res && res.status) proStatus = res.status;
      renderMembership();
      await renderSettings(); // reflect the AI Pro-lock note immediately
      flashSaved();
    });

    const noteBtn = $('#aiNoteUpgrade');
    if (noteBtn) {
      noteBtn.addEventListener('click', () => {
        const target = document.querySelector('#membership');
        $$('.nav-link').forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#membership'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // When returning from the hosted checkout tab, refresh status.
    window.addEventListener('focus', async () => {
      if (proIsStub) return;
      await sendMsg({ type: 'REFRESH_PRO' });
      await loadPro();
      renderMembership();
      await renderSettings();
    });
  }

  // ===================================================
  // MY DATA / PRIVACY
  // ===================================================
  async function renderDataTable() {
    const [searches, views, vault, events, stats] = await Promise.all([
      IVStorage.getSearches(),
      IVStorage.getViews(),
      IVStorage.getVault(),
      IVStorage.getEvents(),
      IVStorage.getStats(),
    ]);
    const rows = [
      ['검색 기록', `${searches.length}건`],
      ['상품 조회 기록', `${Object.keys(views).length}개 상품`],
      ['금고 항목', `${vault.length}건`],
      ['행동 이벤트(패턴 계산용)', `${events.length}건`],
      ['멈춘 순간(누적)', `${stats.interventions || 0}회`],
      ['저장 위치', 'chrome.storage.local (이 기기)'],
      ['서버 전송', '없음 — 0건'],
    ];
    const wrap = $('#dataTable');
    wrap.innerHTML = '';
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'data-row';
      row.innerHTML = `<span class="dr-key">${k}</span><span class="dr-val">${v}</span>`;
      wrap.appendChild(row);
    });
  }

  function initDataHandlers() {
    $('#deleteAll').addEventListener('click', async () => {
      if (
        !confirm(
          '정말 모든 데이터를 삭제할까요?\n검색·조회·금고·통계·프로필이 전부 지워지고 되돌릴 수 없어요.'
        )
      )
        return;
      await IVStorage.deleteAll();
      await sendMsg({ type: 'REBUILD_PROFILE' });
      refreshAll();
      alert('모든 데이터를 삭제했어요. 🧹');
    });

    $('#exportData').addEventListener('click', async () => {
      const dump = {};
      await new Promise((resolve) =>
        chrome.storage.local.get(null, (all) => {
          Object.assign(dump, all);
          resolve();
        })
      );
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'impulse-vault-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // ------- helpers -------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  }
  function sendMsg(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function refreshAll() {
    await loadPro(); // load Pro status first so settings/membership reflect it
    await renderOverview();
    await renderProfile();
    await renderVault();
    await renderSettings();
    renderMembership();
    await renderDataTable();
  }

  // ------- boot -------
  function boot() {
    initNav();
    initSettingsHandlers();
    initProHandlers();
    initDataHandlers();
    refreshAll();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
