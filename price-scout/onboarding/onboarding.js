/* ============================================================
 * PRICE SCOUT — onboarding/onboarding.js
 * Renders the supported-shop chips and wires the two CTAs. Tiny by
 * design: the welcome page is mostly static, premium markup.
 * ============================================================ */
(function () {
  'use strict';

  const SITES = [
    '쿠팡', '네이버 스마트스토어', '11번가', 'G마켓',
    '옥션', '위메프', '티몬', '무신사', 'AliExpress', 'Amazon',
  ];

  const wrap = document.getElementById('siteChips');
  if (wrap) {
    SITES.forEach((name) => {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = name;
      wrap.appendChild(span);
    });
  }

  const openDash = document.getElementById('openDash');
  if (openDash) {
    openDash.addEventListener('click', () => {
      try { chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') }); }
      catch (_) { window.location.href = '../dashboard/dashboard.html'; }
    });
  }

  const closeTab = document.getElementById('closeTab');
  if (closeTab) {
    closeTab.addEventListener('click', () => {
      try { chrome.tabs.getCurrent((t) => { if (t && t.id) chrome.tabs.remove(t.id); else window.close(); }); }
      catch (_) { window.close(); }
    });
  }
})();
