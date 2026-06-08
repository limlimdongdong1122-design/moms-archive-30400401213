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

  const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const weekdays = () => IVI18n.pick(WEEKDAYS_EN, WEEKDAYS_KO);

  // 'pending' until we try once, then 'ready' (WebGL) or 'fallback' (CSS).
  let vault3dState = 'pending';

  // Cached Pro status (from the background worker / IVPro).
  let proStatus = { isPro: false, paid: false, trialActive: false, devOverride: false };
  let proIsStub = true;

  function fmtKRW(n) {
    try {
      return '$' + Number(n || 0).toLocaleString('en-US');
    } catch (_) {
      return '$' + (n || 0);
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
      $('#stageItem').textContent = IVI18n.pick('Your vault is empty', '금고는 비어 있어요');
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
      cell.title = IVI18n.pick(`${h}:00 · ${byHour[h]}×`, `${h}시 · ${byHour[h]}회`);
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
      bar.title = IVI18n.pick(`${byWeekday[d]}×`, `${byWeekday[d]}회`);
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = weekdays()[d];
      col.appendChild(bar);
      col.appendChild(label);
      wrap.appendChild(col);
    }
  }

  function renderKeywords(top) {
    const wrap = $('#topKeywords');
    wrap.innerHTML = '';
    if (!top || top.length === 0) {
      wrap.innerHTML = `<span class="empty-note">${IVI18n.pick('Nothing has tempted you yet — all quiet. 🌙', '아직 끌린 게 없어요 — 고요하네요. 🌙')}</span>`;
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
      wrap.innerHTML = `<span class="empty-note">${IVI18n.pick("No patterns yet. Use it for a few days and we'll show them here.", '아직 패턴이 없어요. 며칠 쓰면 여기에 보여줄게요.')}</span>`;
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
      const lateNote = IVPatterns.isLateNight(h)
        ? IVI18n.pick(' Watch out late at night ⚠️', ' 밤 시간 주의 ⚠️')
        : '';
      insight.textContent = IVI18n.pick(
        `Your most impulsive time: around ${h}:00.${lateNote}`,
        `가장 충동적인 시간대: ${h}시쯤.${lateNote}`
      );
    } else {
      insight.textContent = IVI18n.pick(
        "As more data builds up, we'll reveal your time-of-day patterns.",
        '데이터가 더 쌓이면 시간대 패턴을 알려줄게요.'
      );
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
      locked: ready
        ? IVI18n.pick('Cooled off ✓', '식음 완료 ✓')
        : IVI18n.pick('Cooling off', '식히는 중'),
      bought: IVI18n.pick('Bought', '구매함'),
      released: IVI18n.pick('Let go · saved', '보냄 · 절약'),
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
      buy.textContent = IVI18n.pick("I'll buy it", '살래요');
      buy.addEventListener('click', async () => {
        await IVStorage.updateVaultItem(item.id, { status: 'bought' });
        if (item.url) window.open(item.url, '_blank');
        refreshAll();
      });
      const letGo = document.createElement('button');
      letGo.className = 'vi-let';
      letGo.textContent = IVI18n.pick("I'll let it go", '보낼래요');
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
      x.title = IVI18n.pick('Remove', '제거');
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
      alert(IVI18n.pick("Permission wasn't granted, so we couldn't add it.", '권한이 승인되지 않아 추가하지 못했어요.'));
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
          alert(IVI18n.pick('Detecting on all sites requires access-to-all-sites permission.', '모든 사이트에서 감지하려면 전체 사이트 접근 권한이 필요해요.'));
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
        out.textContent = IVI18n.pick('✗ Provider access permission is required.', '✗ 제공자 접근 권한이 필요해요.');
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
      out.textContent = IVI18n.pick('Testing…', '테스트 중…');
      const res = await sendMsg({
        type: 'ANALYZE_AI',
        details: {
          name: IVI18n.pick('Test product', '테스트 상품'),
          price: 50000,
          itemType: 'product',
          specs: [IVI18n.pick('Example spec', '예시 스펙')],
          reviews: [],
        },
      });
      if (res && res.ok && res.text) {
        out.style.color = 'var(--accent-good)';
        out.textContent = IVI18n.pick('✓ Connected! AI analysis is working.', '✓ 연결 성공! AI 분석이 정상 작동해요.');
      } else {
        out.style.color = 'var(--accent-warn)';
        out.textContent = IVI18n.pick('✗ Failed: ', '✗ 실패: ') + ((res && res.error) || IVI18n.pick('Unknown error', '알 수 없는 오류'));
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
          alert(IVI18n.pick('Using AI analysis requires access to the provider (api.anthropic.com / api.openai.com).', 'AI 분석을 쓰려면 제공자(api.anthropic.com / api.openai.com) 접근 권한이 필요해요.'));
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
    return proStatus;
  }

  function renderMembership() {
    const s = proStatus || {};
    const badge = $('#proBadge');
    const upgrade = $('#proUpgrade');
    const status = $('#proStatus');
    const demo = $('#proDemo');
    const devToggle = $('#devProToggle');
    const licenseRow = $('#licenseRow');
    const licenseInput = $('#licenseInput');

    badge.classList.remove('is-pro', 'is-trial');
    status.classList.remove('good', 'warn');
    if (licenseInput && s.licenseKey && !licenseInput.value) licenseInput.value = s.licenseKey;

    if (s.paid) {
      badge.textContent = 'PRO'; badge.classList.add('is-pro');
      upgrade.hidden = true;
      if (licenseRow) licenseRow.hidden = true;
      status.textContent = IVI18n.pick('💙 Pro is active. Thanks for supporting IMPULSE VAULT!', '💙 Pro가 활성화됐어요. 응원해줘서 고마워요!'); status.classList.add('good');
    } else if (s.devOverride) {
      badge.textContent = IVI18n.pick('PRO · Demo', 'PRO · 데모'); badge.classList.add('is-pro');
      upgrade.hidden = false;
      if (licenseRow) licenseRow.hidden = false;
      status.textContent = IVI18n.pick('🧪 Previewing Pro features in demo (not a real purchase).', '🧪 데모로 Pro 기능을 미리 보는 중이에요 (실제 구매 아님).'); status.classList.add('good');
    } else {
      badge.textContent = 'FREE';
      upgrade.hidden = false;
      if (licenseRow) licenseRow.hidden = false;
      if (s.status === 'invalid') {
        status.textContent = IVI18n.pick('✗ That license key didn’t verify. Check it and try again.', '✗ 라이선스 키 확인에 실패했어요. 다시 확인해 주세요.'); status.classList.add('warn');
      } else if (s.status === 'expired') {
        status.textContent = IVI18n.pick('Your license has expired. Renew to keep Pro.', '라이선스가 만료됐어요. Pro 유지하려면 갱신해 주세요.'); status.classList.add('warn');
      } else if (s.configured === false) {
        status.textContent = IVI18n.pick('※ PayPal isn’t set up yet (set CHECKOUT_URL in utils/pro.js).', '※ PayPal 설정 전이에요 (utils/pro.js의 CHECKOUT_URL 설정).');
      } else {
        status.textContent = '';
      }
    }

    // Demo toggle is hidden from users (owner-only preview via SET_DEV_PRO).
    // It never grants managed AI anyway — the Worker requires a real license.
    demo.hidden = true;
    devToggle.checked = !!s.devOverride;
  }

  function initProHandlers() {
    // Open the PayPal checkout page.
    $('#proUpgrade').addEventListener('click', () => {
      sendMsg({ type: 'OPEN_PAYMENT' });
    });

    // Activate a license key (verified by the Worker).
    const actBtn = $('#licenseActivate');
    if (actBtn) {
      actBtn.addEventListener('click', async () => {
        const input = $('#licenseInput');
        const key = ((input && input.value) || '').trim();
        const status = $('#proStatus');
        if (!key) {
          status.classList.remove('good'); status.classList.add('warn');
          status.textContent = IVI18n.pick('Enter your license key first.', '라이선스 키를 먼저 입력해 주세요.');
          return;
        }
        const prev = actBtn.textContent;
        actBtn.disabled = true; actBtn.textContent = IVI18n.pick('Checking…', '확인 중…');
        const res = await sendMsg({ type: 'VERIFY_LICENSE', key });
        actBtn.disabled = false; actBtn.textContent = prev;
        if (res && res.status) proStatus = res.status;
        if (!(res && res.ok && res.paid)) {
          status.classList.remove('good'); status.classList.add('warn');
          const map = {
            not_configured: IVI18n.pick('PayPal checkout isn’t configured yet (set CHECKOUT_URL in utils/pro.js).', 'PayPal 결제가 아직 설정 안 됐어요 (utils/pro.js의 CHECKOUT_URL 설정).'),
            invalid_license: IVI18n.pick('✗ Invalid license key.', '✗ 잘못된 라이선스 키예요.'),
            malformed: IVI18n.pick('✗ That doesn’t look like a valid key (IVP-…).', '✗ 올바른 키 형식이 아니에요 (IVP-…).'),
            bad_signature: IVI18n.pick('✗ Invalid license key.', '✗ 잘못된 라이선스 키예요.'),
            expired: IVI18n.pick('Your license has expired. Renew to keep Pro.', '라이선스가 만료됐어요. Pro 유지하려면 갱신해 주세요.'),
            no_key: IVI18n.pick('Enter your license key first.', '라이선스 키를 먼저 입력해 주세요.'),
            network: IVI18n.pick('Network error — please try again.', '네트워크 오류 — 다시 시도해 주세요.'),
          };
          status.textContent = map[(res && res.error)] || IVI18n.pick('✗ Could not verify the license.', '✗ 라이선스 확인에 실패했어요.');
        }
        renderMembership();
        await renderSettings(); // reflect the AI Pro-lock note immediately
        flashSaved();
      });
    }

    $('#devProToggle').addEventListener('change', async (e) => {
      const res = await sendMsg({ type: 'SET_DEV_PRO', on: e.target.checked });
      if (res && res.status) proStatus = res.status;
      renderMembership();
      await renderSettings();
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

    // Returning from the PayPal tab → re-verify the stored license.
    window.addEventListener('focus', async () => {
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
      [IVI18n.pick('Search history', '검색 기록'), IVI18n.pick(`${searches.length} entries`, `${searches.length}건`)],
      [IVI18n.pick('Product view history', '상품 조회 기록'), IVI18n.pick(`${Object.keys(views).length} products`, `${Object.keys(views).length}개 상품`)],
      [IVI18n.pick('Vault items', '금고 항목'), IVI18n.pick(`${vault.length} items`, `${vault.length}건`)],
      [IVI18n.pick('Behavior events (for pattern calc)', '행동 이벤트(패턴 계산용)'), IVI18n.pick(`${events.length} events`, `${events.length}건`)],
      [IVI18n.pick('Interventions (cumulative)', '멈춘 순간(누적)'), IVI18n.pick(`${stats.interventions || 0} times`, `${stats.interventions || 0}회`)],
      [IVI18n.pick('Storage location', '저장 위치'), IVI18n.pick('chrome.storage.local (this device)', 'chrome.storage.local (이 기기)')],
      [IVI18n.pick('Sent to server', '서버 전송'), IVI18n.pick('None — 0', '없음 — 0건')],
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
          IVI18n.pick(
            "Really delete all data?\nYour searches, views, vault, stats, and profile will all be erased — this can't be undone.",
            '정말 모든 데이터를 삭제할까요?\n검색·조회·금고·통계·프로필이 전부 지워지고 되돌릴 수 없어요.'
          )
        )
      )
        return;
      await IVStorage.deleteAll();
      await sendMsg({ type: 'REBUILD_PROFILE' });
      refreshAll();
      alert(IVI18n.pick('All data deleted. 🧹', '모든 데이터를 삭제했어요. 🧹'));
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

  // ------- language toggle -------
  function initLangHandlers() {
    const seg = $('#langSeg');
    if (seg) {
      seg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lang-btn]');
        if (!btn) return;
        IVI18n.setLang(btn.dataset.val);
      });
    }
    // Re-run the renders that build dynamic strings, then re-apply static swaps.
    IVI18n.onChange(() => {
      renderOverview();
      renderProfile();
      renderVault();
      renderMembership();
      renderDataTable();
      renderSettings();
      IVI18n.apply();
    });
  }

  // ------- boot -------
  // Promo deep-link: dashboard.html#ph (or #producthunt) jumps to the Pro
  // section so a campaign link lands people right on the offer.
  function initPromo() {
    const h = (location.hash || '').toLowerCase();
    if (h !== '#ph' && h !== '#producthunt') return;
    const mem = document.querySelector('#membership');
    if (mem) mem.scrollIntoView({ behavior: 'smooth' });
  }

  function boot() {
    initNav();
    initLangHandlers();
    initSettingsHandlers();
    initProHandlers();
    initDataHandlers();
    refreshAll();
    IVI18n.apply();
    initPromo();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
