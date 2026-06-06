/* ============================================================
 * IMPULSE VAULT — utils/pro.js
 * ------------------------------------------------------------
 * The single source of truth for "is this user on Pro?".
 *
 * Pro status ultimately comes from ExtensionPay (Stripe). The
 * background worker listens to ExtPay and CACHES the result into
 * chrome.storage.local under `iv_pro`, so every other context
 * (popup, dashboard, content overlay, worker) can read it cheaply
 * and consistently without each making its own network call.
 *
 * Loaded as a CLASSIC script in the worker (importScripts), in
 * extension pages (<script src>), and — like storage.js — attaches
 * its API to the global object as IVPro.
 *
 * NOTE: nothing here is secret. The ExtPay "extension id" is a public
 * identifier you get after registering at https://extensionpay.com.
 * Replace EXTPAY_ID below with yours to go live.
 * ============================================================ */
(function (global) {
  'use strict';

  // ---- Register your extension at extensionpay.com, then paste its id here.
  //      Until you do, the bundled ExtPay STUB keeps everyone on Free safely. ----
  const EXTPAY_ID = 'impursivevault';

  const KEY = 'iv_pro';

  // Pricing copy shown in the UI (keep in one place). USD.
  const PRICE = '$2.99';
  const PERIOD = 'mo';
  const ANNUAL = '$24.99';
  const TRIAL_DAYS = 7;

  const DEFAULT = {
    paid: false,         // real paid subscription (ExtPay)
    plan: null,          // optional plan label from ExtPay
    status: 'none',      // 'active' | 'past_due' | 'canceled' | 'none'
    trialStartedAt: 0,   // epoch ms, 0 = never
    devOverride: false,  // local-only preview toggle (NOT a real payment)
    updatedAt: 0,
  };

  function get() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (res) => {
          void chrome.runtime.lastError;
          resolve(Object.assign({}, DEFAULT, (res && res[KEY]) || {}));
        });
      } catch (_) {
        resolve(Object.assign({}, DEFAULT));
      }
    });
  }
  function set(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY]: obj }, () => { void chrome.runtime.lastError; resolve(true); });
      } catch (_) { resolve(false); }
    });
  }

  // Is a (real) free trial still running?
  function trialActive(s) {
    if (!s || !s.trialStartedAt) return false;
    return Date.now() < s.trialStartedAt + TRIAL_DAYS * 24 * 3600 * 1000;
  }

  async function getStatus() {
    const s = await get();
    const tActive = trialActive(s);
    return Object.assign({}, s, {
      trialActive: tActive,
      // The one flag the rest of the app should branch on:
      isPro: !!(s.paid || tActive || s.devOverride),
    });
  }

  async function isPro() {
    return (await getStatus()).isPro;
  }

  async function setStatus(patch) {
    const cur = await get();
    const next = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    await set(next);
    return getStatus();
  }

  /** Map an ExtPay user object onto our cached shape. */
  function fromExtPayUser(user) {
    if (!user) return {};
    return {
      paid: !!user.paid,
      plan: (user.plan && (user.plan.name || user.plan)) || null,
      status: user.subscriptionStatus || (user.paid ? 'active' : 'none'),
      trialStartedAt: user.trialStartedAt ? new Date(user.trialStartedAt).getTime() : 0,
    };
  }

  /** Create an ExtPay client if the library is loaded in this context. */
  function client() {
    try {
      return typeof global.ExtPay === 'function' ? global.ExtPay(EXTPAY_ID) : null;
    } catch (_) { return null; }
  }

  /** True when only the bundled STUB is present (no real billing yet). */
  function isStub() {
    return !!global.__EXTPAY_STUB__;
  }

  const API = {
    KEY,
    EXTPAY_ID,
    PRICE,
    PERIOD,
    ANNUAL,
    TRIAL_DAYS,
    DEFAULT,
    getStatus,
    isPro,
    setStatus,
    fromExtPayUser,
    client,
    isStub,
  };

  global.IVPro = API;
})(typeof self !== 'undefined' ? self : this);
