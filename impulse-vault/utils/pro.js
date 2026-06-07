/* ============================================================
 * IMPULSE VAULT — utils/pro.js  (Gumroad license edition)
 * ------------------------------------------------------------
 * Single source of truth for "is this user on Pro?".
 *
 * Payments run through GUMROAD. The user buys the Pro product on
 * Gumroad, receives a license key, pastes it into the dashboard, and
 * we verify it against Gumroad's public License API. The verified
 * result (paid + status) is cached in chrome.storage.local under
 * `iv_pro`, so every context (popup, dashboard, overlay, worker) can
 * read it cheaply via IVPro.isPro().
 *
 * Loaded as a CLASSIC script in the worker (importScripts) and in
 * extension pages (<script src>); attaches to the global as IVPro.
 *
 * NOTE: nothing here is secret. The Gumroad "product id" + product URL
 * are public. The license-verify endpoint needs no access token.
 * Set the two constants below after creating your Gumroad product.
 * ============================================================ */
(function (global) {
  'use strict';

  // ===== Configure these after creating your Gumroad product =====
  // 1) GUMROAD_PRODUCT_ID: Gumroad → your product → Settings/Advanced →
  //    "Product ID" (looks like a long random string).
  // 2) GUMROAD_URL: the public product page buyers go to.
  const GUMROAD_PRODUCT_ID = 'YOUR_GUMROAD_PRODUCT_ID';
  const GUMROAD_URL = 'https://gumroad.com/l/REPLACE_ME';

  const KEY = 'iv_pro';

  // Pricing copy shown in the UI (match your Gumroad price). USD.
  const PRICE = '$2.99';
  const PERIOD = 'mo';
  const ANNUAL = '$24.99';

  const VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

  const DEFAULT = {
    paid: false,         // verified active Gumroad license
    licenseKey: '',      // the key the user entered
    status: 'none',      // 'active' | 'inactive' | 'invalid' | 'none'
    lastChecked: 0,      // epoch ms of last verify
    devOverride: false,  // local-only preview toggle (NOT a real purchase)
    updatedAt: 0,
  };

  function get() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (res) => {
          void chrome.runtime.lastError;
          resolve(Object.assign({}, DEFAULT, (res && res[KEY]) || {}));
        });
      } catch (_) { resolve(Object.assign({}, DEFAULT)); }
    });
  }
  function set(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY]: obj }, () => { void chrome.runtime.lastError; resolve(true); });
      } catch (_) { resolve(false); }
    });
  }

  async function getStatus() {
    const s = await get();
    return Object.assign({}, s, {
      isPro: !!(s.paid || s.devOverride),
      configured: !isPlaceholder(),
    });
  }
  async function isPro() { return (await getStatus()).isPro; }

  async function setStatus(patch) {
    const cur = await get();
    const next = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    await set(next);
    return getStatus();
  }

  function isPlaceholder() {
    return GUMROAD_PRODUCT_ID.indexOf('YOUR_') === 0 || GUMROAD_URL.indexOf('REPLACE') !== -1;
  }

  /**
   * Verify a Gumroad license key against the public License API.
   * Run this from the BACKGROUND worker (it has the api.gumroad.com
   * host permission). Returns { ok, paid, error }.
   */
  async function verifyLicense(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, error: 'no_key' };
    if (isPlaceholder()) return { ok: false, error: 'not_configured' };
    try {
      const body = new URLSearchParams({
        product_id: GUMROAD_PRODUCT_ID,
        license_key: key,
        increment_uses_count: 'false',
      });
      const r = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data || !data.success) {
        await setStatus({ licenseKey: key, paid: false, status: 'invalid', lastChecked: Date.now() });
        return { ok: false, error: (data && data.message) || 'invalid_license' };
      }
      const p = data.purchase || {};
      // Active = not refunded/disputed and (for memberships) not ended/failed.
      const active = !p.refunded && !p.disputed && !p.chargebacked &&
        !p.subscription_ended_at && !p.subscription_failed_at;
      await setStatus({
        licenseKey: key,
        paid: !!active,
        status: active ? 'active' : 'inactive',
        lastChecked: Date.now(),
      });
      return { ok: true, paid: !!active };
    } catch (_) {
      // Network error: keep the last cached status, just report failure.
      return { ok: false, error: 'network' };
    }
  }

  /** Re-verify the stored license (catches cancellations/refunds). */
  async function recheck() {
    const s = await get();
    if (s.licenseKey) return verifyLicense(s.licenseKey);
    return { ok: true, paid: !!s.devOverride };
  }

  const API = {
    KEY,
    GUMROAD_PRODUCT_ID,
    GUMROAD_URL,
    PRICE,
    PERIOD,
    ANNUAL,
    DEFAULT,
    getStatus,
    isPro,
    setStatus,
    verifyLicense,
    recheck,
    isPlaceholder,
  };

  global.IVPro = API;
})(typeof self !== 'undefined' ? self : this);
