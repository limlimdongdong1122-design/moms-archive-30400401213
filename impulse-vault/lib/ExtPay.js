/* ============================================================
 * ExtPay.js — PLACEHOLDER STUB (not the real library)
 * ------------------------------------------------------------
 * This stub implements the ExtPay public API surface so IMPULSE
 * VAULT loads and runs TODAY with everyone safely on the Free tier.
 * No payments happen until you drop in the REAL ExtPay.js.
 *
 * ── To enable real subscriptions (one-time, ~10 min): ──
 *   1. Register your extension at https://extensionpay.com  →
 *      you'll get a public "extension id".
 *   2. Put that id in utils/pro.js  (EXTPAY_ID).
 *   3. Download the official library and REPLACE this file:
 *        npm install extpay   →   copy node_modules/extpay/dist/ExtPay.js
 *        (or grab it from the ExtPay dashboard / GitHub: Glench/ExtPay)
 *   4. Add to manifest.json (already prepared here):
 *        permissions: ["storage"]                     ✓ present
 *        host_permissions: ["https://extensionpay.com/*"]  ✓ present
 *   5. Reload at chrome://extensions. Done — billing is live.
 *
 * The rest of the app talks to ExtPay only through utils/pro.js +
 * background.js, so swapping this file is the ONLY change needed.
 * ============================================================ */
(function (global) {
  'use strict';

  // Marker the UI uses to show "demo / not wired yet" messaging and to
  // reveal the local Pro-preview toggle. The real library does NOT set this.
  global.__EXTPAY_STUB__ = true;

  function noopEvent() {
    const listeners = [];
    return {
      addListener: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  }

  function ExtPay(/* extensionId */) {
    return {
      // In the real library this opens hosted Stripe checkout. The stub
      // can't charge anyone, so it just warns; the dashboard detects the
      // stub and shows clear "결제 연동 대기" guidance instead.
      openPaymentPage() {
        console.warn('[ExtPay stub] 실제 ExtPay.js가 설치되지 않아 결제 페이지를 열 수 없어요. lib/ExtPay.js 안내를 참고하세요.');
      },
      openTrialPage() {
        console.warn('[ExtPay stub] 체험 페이지는 실제 ExtPay.js 설치 후 동작합니다.');
      },
      openLoginPage() {
        console.warn('[ExtPay stub] 로그인 페이지는 실제 ExtPay.js 설치 후 동작합니다.');
      },
      // Always Free in stub mode.
      getUser() {
        return Promise.resolve({
          paid: false,
          paidAt: null,
          installedAt: new Date(),
          trialStartedAt: null,
          plan: null,
          subscriptionStatus: 'none',
        });
      },
      getPlans() { return Promise.resolve([]); },
      onPaid: noopEvent(),
      onTrialStarted: noopEvent(),
      // Called once in the service worker; no-op here.
      startBackground() { /* real lib wires runtime listeners here */ },
    };
  }

  global.ExtPay = ExtPay;
})(typeof self !== 'undefined' ? self : this);
