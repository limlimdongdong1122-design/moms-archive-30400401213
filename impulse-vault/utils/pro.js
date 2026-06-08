/* ============================================================
 * IMPULSE VAULT — utils/pro.js  (PayPal + signed-license edition)
 * ------------------------------------------------------------
 * Single source of truth for "is this user on Pro?".
 *
 * Payments run through PAYPAL. PayPal doesn't hand out license keys,
 * so we issue our OWN: each key is HMAC-signed with a secret that lives
 * ONLY in your Cloudflare Worker (never in this extension). The flow:
 *   1) Buyer pays via PayPal  →  you send them a license key by email.
 *   2) Buyer pastes the key into the dashboard.
 *   3) The extension asks YOUR Worker to verify it (the Worker holds the
 *      secret and re-computes the signature). No secret, no DB, no
 *      accounts on the client side.
 * The verified result is cached in chrome.storage.local under `iv_pro`,
 * so every context reads it cheaply via IVPro.isPro(). The same key is
 * also sent with managed-AI calls so the Worker only spends your API
 * budget on real Pro users.
 * ============================================================ */
(function (global) {
  'use strict';

  // ===== Configure after setting up PayPal + your Cloudflare Worker =====
  // 1) CHECKOUT_URL: your PayPal payment / subscription link (PayPal →
  //    Pay Links / Buttons → copy the public link buyers go to).
  // 2) LICENSE_API: your Worker's license-verify endpoint. With the bundled
  //    _worker.js on Cloudflare Pages this is <site>/api/license.
  const CHECKOUT_URL = 'https://www.paypal.com/ncp/payment/EMNBNM7WZHRNC';
  const LICENSE_API = 'https://impursivevault.com/api/license';

  const KEY = 'iv_pro';

  // Pricing copy shown in the UI (match your PayPal price). USD.
  const PRICE = '$2.99';
  const PERIOD = 'mo';
  const ANNUAL = '$24.99';

  const DEFAULT = {
    paid: false,         // verified, unexpired license
    licenseKey: '',      // the key the user entered (sent to Worker / proxy)
    exp: 0,              // expiry unix seconds (0 = lifetime)
    status: 'none',      // 'active' | 'expired' | 'invalid' | 'none'
    lastChecked: 0,
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

  function notExpired(s) {
    return !s.exp || s.exp * 1000 > Date.now();
  }

  async function getStatus() {
    const s = await get();
    const live = !!(s.paid && notExpired(s)) || s.devOverride;
    return Object.assign({}, s, {
      isPro: live,
      configured: !isPlaceholder(),
    });
  }
  async function isPro() { return (await getStatus()).isPro; }

  /** The verified key, so the AI proxy call can prove Pro to the Worker. */
  async function getLicenseKey() {
    const s = await get();
    return (s.paid && notExpired(s)) ? s.licenseKey : '';
  }

  async function setStatus(patch) {
    const cur = await get();
    const next = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    await set(next);
    return getStatus();
  }

  function isPlaceholder() {
    return CHECKOUT_URL.indexOf('REPLACE') !== -1;
  }

  /**
   * Verify a license key against the Worker. Run from the BACKGROUND worker
   * (it holds the host permission). Returns { ok, paid, error }.
   */
  async function verifyLicense(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, error: 'no_key' };
    if (isPlaceholder()) return { ok: false, error: 'not_configured' };
    try {
      const r = await fetch(LICENSE_API, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.valid) {
        await setStatus({ licenseKey: key, exp: Number(d.exp || 0), paid: true, status: 'active', lastChecked: Date.now() });
        return { ok: true, paid: true };
      }
      const expired = d && d.error === 'expired';
      await setStatus({
        licenseKey: key, paid: false,
        status: expired ? 'expired' : 'invalid', lastChecked: Date.now(),
      });
      return { ok: false, error: (d && d.error) || 'invalid_license' };
    } catch (_) {
      return { ok: false, error: 'network' };
    }
  }

  /** Re-verify the stored license (catches expiry / revocation). */
  async function recheck() {
    const s = await get();
    if (!s.licenseKey) return { ok: true, paid: !!s.devOverride };
    // Cheap local short-circuit: if we already know it's expired, don't call out.
    if (s.exp && s.exp * 1000 <= Date.now()) {
      await setStatus({ paid: false, status: 'expired', lastChecked: Date.now() });
      return { ok: false, error: 'expired' };
    }
    return verifyLicense(s.licenseKey);
  }

  const API = {
    KEY,
    CHECKOUT_URL,
    LICENSE_API,
    PRICE,
    PERIOD,
    ANNUAL,
    DEFAULT,
    getStatus,
    isPro,
    getLicenseKey,
    setStatus,
    verifyLicense,
    recheck,
    isPlaceholder,
  };

  global.IVPro = API;
})(typeof self !== 'undefined' ? self : this);
