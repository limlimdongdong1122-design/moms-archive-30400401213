/* ============================================================
 * IMPULSE VAULT — utils/pro.js  (Lemon Squeezy license edition)
 * ------------------------------------------------------------
 * Single source of truth for "is this user on Pro?".
 *
 * Payments run through LEMON SQUEEZY. The user buys the Pro product,
 * receives a license key, pastes it into the dashboard, and we:
 *   1) ACTIVATE the key (binds an "instance" to this device), then
 *   2) VALIDATE it on later launches (catches cancel/refund/expiry).
 * The verified result is cached in chrome.storage.local under `iv_pro`,
 * so every context reads it cheaply via IVPro.isPro(). The gating logic
 * elsewhere never changes — it only asks IVPro.
 *
 * NOTE: nothing here is secret. The activate/validate endpoints are
 * keyed by the license key itself and need NO API token. Set the two
 * constants below after creating your Lemon Squeezy product.
 * ============================================================ */
(function (global) {
  'use strict';

  // ===== Configure after creating your Lemon Squeezy product =====
  // 1) CHECKOUT_URL: the public checkout/product URL buyers go to.
  //    (Lemon Squeezy → Products → Share → checkout link)
  // 2) LS_PRODUCT_ID: optional. If set, we also confirm the verified
  //    license belongs to THIS product (Store → Products → product id).
  //    Leave '' to skip that extra check.
  const CHECKOUT_URL = 'https://YOURSTORE.lemonsqueezy.com/buy/REPLACE_ME';
  const LS_PRODUCT_ID = ''; // e.g. '123456' (number as string), optional

  const KEY = 'iv_pro';

  // Pricing copy shown in the UI (match your Lemon Squeezy price). USD.
  const PRICE = '$2.99';
  const PERIOD = 'mo';
  const ANNUAL = '$24.99';

  const ACTIVATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/activate';
  const VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
  const INSTANCE_NAME = 'IMPULSE VAULT';

  const DEFAULT = {
    paid: false,         // verified active license
    licenseKey: '',      // the key the user entered
    instanceId: '',      // Lemon Squeezy activation instance id (this device)
    status: 'none',      // 'active' | 'inactive' | 'invalid' | 'none'
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
    return CHECKOUT_URL.indexOf('REPLACE') !== -1 || CHECKOUT_URL.indexOf('YOURSTORE') !== -1;
  }

  function post(url, params) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  }

  // Decide paid/active from a Lemon Squeezy license_key object + meta.
  function judge(lk, meta) {
    if (!lk) return false;
    const statusOk = lk.status === 'active';
    const notExpired = !lk.expires_at || (Date.parse(lk.expires_at) > Date.now());
    const productOk = !LS_PRODUCT_ID || !meta || String(meta.product_id) === String(LS_PRODUCT_ID);
    return statusOk && notExpired && productOk;
  }

  /**
   * Verify a Lemon Squeezy license key. ACTIVATE on first use (binds this
   * device), VALIDATE thereafter. Run from the BACKGROUND worker (it holds
   * the api.lemonsqueezy.com host permission). Returns { ok, paid, error }.
   */
  async function verifyLicense(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, error: 'no_key' };
    if (isPlaceholder()) return { ok: false, error: 'not_configured' };
    const cur = await get();
    try {
      // Re-validate an existing instance for the same key.
      if (cur.licenseKey === key && cur.instanceId) {
        const r = await post(VALIDATE_URL, { license_key: key, instance_id: cur.instanceId });
        const d = await r.json().catch(() => ({}));
        if (d && d.valid && judge(d.license_key, d.meta)) {
          await setStatus({ licenseKey: key, paid: true, status: 'active', lastChecked: Date.now() });
          return { ok: true, paid: true };
        }
        // Instance no longer valid → fall through to a fresh activate.
      }

      // First-time activation (binds an instance to this device).
      const a = await post(ACTIVATE_URL, { license_key: key, instance_name: INSTANCE_NAME });
      const ad = await a.json().catch(() => ({}));
      if (ad && ad.activated && judge(ad.license_key, ad.meta)) {
        await setStatus({
          licenseKey: key,
          instanceId: (ad.instance && ad.instance.id) || '',
          paid: true, status: 'active', lastChecked: Date.now(),
        });
        return { ok: true, paid: true };
      }

      // Activation failed. If it's just the device limit, the key may still be
      // valid — validate without an instance and accept if active.
      if (ad && ad.error && /activation limit/i.test(ad.error)) {
        const v = await post(VALIDATE_URL, { license_key: key });
        const vd = await v.json().catch(() => ({}));
        if (vd && vd.valid && judge(vd.license_key, vd.meta)) {
          await setStatus({ licenseKey: key, paid: true, status: 'active', lastChecked: Date.now() });
          return { ok: true, paid: true };
        }
      }

      const lk = (ad && ad.license_key) || {};
      const inactive = lk.status && lk.status !== 'active';
      await setStatus({
        licenseKey: key, instanceId: '', paid: false,
        status: inactive ? 'inactive' : 'invalid', lastChecked: Date.now(),
      });
      return { ok: false, error: (ad && ad.error) || 'invalid_license' };
    } catch (_) {
      return { ok: false, error: 'network' };
    }
  }

  /** Re-verify the stored license (catches cancellations/refunds/expiry). */
  async function recheck() {
    const s = await get();
    if (s.licenseKey) return verifyLicense(s.licenseKey);
    return { ok: true, paid: !!s.devOverride };
  }

  const API = {
    KEY,
    CHECKOUT_URL,
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
