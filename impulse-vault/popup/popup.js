/* ============================================================
 * IMPULSE VAULT — popup/popup.js
 * ------------------------------------------------------------
 * The quick-glance surface: Total Saved (animated counter),
 * impulses resisted, live Vault timers, and a pause toggle.
 * ============================================================ */

(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  let tickHandle = null;

  function fmtKRW(n) {
    try {
      return '₩' + Number(n || 0).toLocaleString('ko-KR');
    } catch (_) {
      return '₩' + (n || 0);
    }
  }

  // Calm count-up: numbers ease up to their value, they never snap.
  // Honors prefers-reduced-motion (jumps straight to the value).
  function animateCount(elm, target) {
    const reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !target) {
      elm.textContent = fmtKRW(target || 0);
      return;
    }
    const start = performance.now();
    const dur = 1100; // slower = more deliberate
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4); // quart-out, gentle settle
      elm.textContent = fmtKRW(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function fmtRemaining(ms) {
    if (ms <= 0) return '준비됨 ✓';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}시간 ${m}분 남음`;
    if (m > 0) return `${m}분 ${sec}초 남음`;
    return `${sec}초 남음`;
  }

  async function render() {
    const settings = await IVStorage.getSettings();

    if (!settings.onboarded) {
      $('needSetup').hidden = false;
      $('main').hidden = true;
      return;
    }
    $('needSetup').hidden = true;
    $('main').hidden = false;

    const [stats, vault, profile] = await Promise.all([
      IVStorage.getStats(),
      IVStorage.getVault(),
      IVStorage.getProfile(),
    ]);

    // Pause toggle
    $('pauseToggle').checked = !!settings.paused;

    // Snooze banner
    const snoozed = settings.snoozeUntil && Date.now() < settings.snoozeUntil;
    $('snoozeBanner').hidden = !snoozed;

    // Stats
    animateCount($('totalSaved'), stats.totalSaved || 0);
    $('resisted').textContent = stats.resisted || 0;
    const rate = profile ? Math.round((profile.resistRate || 0) * 100) : 0;
    $('resistRate').textContent = rate + '%';

    renderVault(vault);
  }

  function renderVault(vault) {
    const list = $('vaultList');
    const locked = vault.filter((v) => v.status === 'locked');
    $('vaultCount').textContent = String(locked.length);
    $('vaultEmpty').hidden = locked.length > 0;

    list.innerHTML = '';
    locked
      .slice()
      .sort((a, b) => a.releaseAt - b.releaseAt)
      .forEach((item) => list.appendChild(vaultCard(item)));

    // Restart the per-second ticking for timers/progress bars.
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(() => updateTimers(locked), 1000);
    updateTimers(locked);
  }

  function vaultCard(item) {
    const card = document.createElement('div');
    card.className = 'vault-card';
    card.dataset.id = item.id;
    card.dataset.url = item.url || '';
    card.dataset.price = String(item.price || 0);

    // Thin circular countdown ring (conic-gradient driven by --p).
    const ringwrap = document.createElement('div');
    ringwrap.className = 'vc-ringwrap';
    const ring = document.createElement('div');
    ring.className = 'vc-ring';
    ring.dataset.role = 'ring';
    const core = document.createElement('div');
    core.className = 'vc-ring-core';
    core.dataset.role = 'core';
    ringwrap.appendChild(ring);
    ringwrap.appendChild(core);

    const body = document.createElement('div');
    body.className = 'vc-body';
    const name = document.createElement('div');
    name.className = 'vc-name';
    name.textContent = item.item || '이름 없는 항목';
    const sub = document.createElement('div');
    sub.className = 'vc-sub';
    const price = document.createElement('span');
    price.className = 'vc-price';
    price.textContent = fmtKRW(item.price);
    const timer = document.createElement('span');
    timer.className = 'vc-timer';
    timer.dataset.role = 'timer';
    sub.appendChild(price);
    sub.appendChild(timer);
    body.appendChild(name);
    body.appendChild(sub);

    card.appendChild(ringwrap);
    card.appendChild(body);

    // Actions appear once cooled off.
    const actions = document.createElement('div');
    actions.className = 'vc-actions';
    actions.dataset.role = 'actions';
    actions.style.display = 'none';

    const buy = document.createElement('button');
    buy.className = 'vc-buy';
    buy.textContent = '살래요';
    buy.addEventListener('click', () => onBuy(item));

    const letGo = document.createElement('button');
    letGo.className = 'vc-let';
    letGo.textContent = '보낼래요';
    letGo.addEventListener('click', () => onLetGo(item, card));

    actions.appendChild(buy);
    actions.appendChild(letGo);
    card.appendChild(actions);

    return card;
  }

  function updateTimers(locked) {
    const now = Date.now();
    locked.forEach((item) => {
      const card = document.querySelector(`.vault-card[data-id="${item.id}"]`);
      if (!card) return;
      const remaining = item.releaseAt - now;
      const total = item.releaseAt - item.ts;
      const elapsed = Math.max(0, Math.min(total, now - item.ts));
      const pct = total > 0 ? Math.round((elapsed / total) * 100) : 100;

      const timer = card.querySelector('[data-role="timer"]');
      const ring = card.querySelector('[data-role="ring"]');
      const core = card.querySelector('[data-role="core"]');
      const actions = card.querySelector('[data-role="actions"]');
      if (timer) timer.textContent = fmtRemaining(remaining);
      // The ring fills as the cooling-off elapses.
      if (ring) ring.style.setProperty('--p', String(pct));

      if (remaining <= 0) {
        card.classList.add('ready');
        if (core) core.textContent = '✓';
        if (actions) actions.style.display = 'flex';
      } else if (core) {
        // Show the hour/minute headline inside the ring.
        const mins = Math.ceil(remaining / 60000);
        core.textContent = mins >= 60 ? Math.ceil(mins / 60) + 'h' : mins + 'm';
      }
    });
  }

  async function onBuy(item) {
    await IVStorage.updateVaultItem(item.id, { status: 'bought' });
    // Buying after a cooling-off is a fine, un-shamed outcome.
    if (item.url) {
      chrome.tabs
        ? chrome.tabs.create({ url: item.url })
        : window.open(item.url, '_blank');
    }
    render();
  }

  async function onLetGo(item, card) {
    // Satisfying release: shatter animation, then bank the savings.
    card.classList.add('vc-letting');
    await IVStorage.updateVaultItem(item.id, { status: 'released' });
    await IVStorage.bumpStats({ totalSaved: item.price || 0 });
    setTimeout(render, 600);
  }

  // ---- Controls ----
  $('pauseToggle').addEventListener('change', async (e) => {
    await IVStorage.saveSettings({ paused: e.target.checked });
    try {
      chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' }, () => void chrome.runtime.lastError);
    } catch (_) {}
  });

  $('unsnooze').addEventListener('click', async () => {
    await IVStorage.saveSettings({ snoozeUntil: 0 });
    render();
  });

  $('openOnboard').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/welcome.html') })
  );
  $('openDash').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') })
  );
  $('openSettings').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#settings') })
  );

  render();
})();
