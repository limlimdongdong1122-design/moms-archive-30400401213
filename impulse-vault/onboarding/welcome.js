/* ============================================================
 * IMPULSE VAULT — onboarding/welcome.js
 * ------------------------------------------------------------
 * Drives the 4-step onboarding and — crucially — performs the
 * RUNTIME permission request inside a real user click, matching
 * a clean "ask for permission → user approves" experience.
 * ============================================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const steps = ['step-intro', 'step-grant', 'step-setup', 'step-done'];

  function show(id) {
    steps.forEach((s) => {
      const el = $(s);
      if (el) el.setAttribute('data-active', String(s === id));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Turn "coupang.com" → "*://*.coupang.com/*"
  function domainToOrigin(domain) {
    const clean = String(domain)
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    return `*://*.${clean}/*`;
  }

  let settings = null;

  async function init() {
    settings = await IVStorage.getSettings();

    // Render the watched-domain chips.
    const chips = $('domainChips');
    if (chips) {
      chips.innerHTML = '';
      settings.domains.forEach((d) => {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = d;
        chips.appendChild(c);
      });
    }

    // Pre-fill setup form from existing settings.
    $('hourlyWage').value = settings.hourlyWage || 12000;
    $('gamePrice').value = settings.gamePrice || 60000;
    $('coolingHours').value = String(settings.coolingHours || 24);
    setSeg(settings.strictness || 'balanced');
  }

  // ---- Step 1 → 2 ----
  $('toGrant').addEventListener('click', () => show('step-grant'));

  // ---- Step 2: the runtime permission request ----
  $('grantBtn').addEventListener('click', async () => {
    const status = $('grantStatus');
    status.className = 'grant-status';
    status.textContent = '브라우저 권한 창을 여는 중…';

    const origins = (settings.domains || []).map(domainToOrigin);

    // Request host access (required for content scripts) + the optional
    // capabilities. Must run synchronously inside this click gesture.
    let granted = false;
    try {
      granted = await new Promise((resolve) => {
        chrome.permissions.request(
          {
            permissions: ['history', 'tabs', 'webNavigation', 'activeTab'],
            origins,
          },
          (result) => {
            void chrome.runtime.lastError;
            resolve(!!result);
          }
        );
      });
    } catch (err) {
      status.classList.add('err');
      status.textContent = '권한 요청 중 문제가 생겼어요: ' + err;
      return;
    }

    if (!granted) {
      // Maybe they declined the optional perms but we can still try
      // host-only access, which is what actually matters.
      try {
        granted = await new Promise((resolve) => {
          chrome.permissions.request({ origins }, (result) => {
            void chrome.runtime.lastError;
            resolve(!!result);
          });
        });
      } catch (_) {}
    }

    if (!granted) {
      status.classList.add('err');
      status.textContent = '승인되지 않았어요. 확장은 계속 잠잠히 있을게요. 원하면 다시 눌러봐요.';
      return;
    }

    settings = await IVStorage.saveSettings({ granted: true });
    // Tell the service worker to register content scripts now.
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_CONTENT_SCRIPTS' }, () => void chrome.runtime.lastError);
    } catch (_) {}

    status.classList.add('ok');
    status.textContent = '승인 완료! 🎉';
    setTimeout(() => show('step-setup'), 700);
  });

  $('skipGrant').addEventListener('click', () => show('step-setup'));

  // ---- Step 3: strictness segmented control ----
  function setSeg(val) {
    const seg = $('strictnessSeg');
    Array.from(seg.querySelectorAll('button')).forEach((b) => {
      b.classList.toggle('on', b.dataset.val === val);
    });
  }
  $('strictnessSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) setSeg(btn.dataset.val);
  });

  $('finishBtn').addEventListener('click', async () => {
    const strictness =
      $('strictnessSeg').querySelector('button.on')?.dataset.val || 'balanced';
    await IVStorage.saveSettings({
      strictness,
      hourlyWage: parseInt($('hourlyWage').value, 10) || 0,
      gamePrice: parseInt($('gamePrice').value, 10) || 0,
      coolingHours: parseInt($('coolingHours').value, 10) || 24,
      onboarded: true,
    });
    show('step-done');
  });

  // ---- Step 4 ----
  $('openDash').addEventListener('click', () => {
    chrome.tabs
      ? chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') })
      : (location.href = chrome.runtime.getURL('dashboard/dashboard.html'));
  });
  $('closeTab').addEventListener('click', () => {
    try {
      window.close();
    } catch (_) {}
  });

  init();
})();
