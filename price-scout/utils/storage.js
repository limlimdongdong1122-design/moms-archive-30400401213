/* ============================================================
 * PRICE SCOUT — utils/storage.js
 * ------------------------------------------------------------
 * The only module that touches chrome.storage.local. Everything is
 * stored on-device (100% local — no server, no account). Exposes a
 * small promise-based API as PSStorage.
 *
 * Shapes:
 *   products: [{
 *     id, name, url, site, image,
 *     myPrice,            // optional — the seller's own price
 *     currentPrice,
 *     firstPrice, lowest, highest,
 *     lastChecked, createdAt,
 *     lastChange,         // {dir, kind, pct, at} from the most recent move
 *     needsVisit,         // true if background re-check couldn't read a price
 *     history: [{ ts, price }],
 *     note,
 *   }]
 *   settings: { checkIntervalHours, notifyOnChange, notifyThresholdPct,
 *               currency, pro }
 *   stats: { checks, alerts }
 * ============================================================ */
(function (global) {
  'use strict';

  const KEYS = { products: 'ps_products', settings: 'ps_settings', stats: 'ps_stats' };

  const FREE_LIMIT = 5; // free plan: track up to 5 products

  const DEFAULT_SETTINGS = {
    checkIntervalHours: 6,    // background re-check cadence
    notifyOnChange: true,     // OS notification when a tracked price moves
    notifyThresholdPct: 0,    // 0 = notify on any change; e.g. 3 = only ≥3%
    currency: '₩',
    pro: false,               // Pro unlock (stub — wire a payments SDK to flip)
  };

  const DEFAULT_STATS = { checks: 0, alerts: 0 };

  function get(key, fallback) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (res) => {
          void chrome.runtime.lastError;
          resolve(res && res[key] != null ? res[key] : fallback);
        });
      } catch (_) {
        resolve(fallback);
      }
    });
  }
  function set(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => {
          void chrome.runtime.lastError;
          resolve(true);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function getProducts() {
    const list = await get(KEYS.products, []);
    return Array.isArray(list) ? list : [];
  }
  async function saveProducts(list) {
    return set({ [KEYS.products]: Array.isArray(list) ? list : [] });
  }
  async function getProduct(id) {
    return (await getProducts()).find((p) => p.id === id) || null;
  }
  async function getByUrl(url) {
    const u = (url || '').split('#')[0];
    return (await getProducts()).find((p) => (p.url || '').split('#')[0] === u) || null;
  }

  async function getSettings() {
    const s = await get(KEYS.settings, {});
    return Object.assign({}, DEFAULT_SETTINGS, s || {});
  }
  async function saveSettings(patch) {
    const cur = await getSettings();
    const next = Object.assign({}, cur, patch || {});
    await set({ [KEYS.settings]: next });
    return next;
  }

  async function getStats() {
    const s = await get(KEYS.stats, {});
    return Object.assign({}, DEFAULT_STATS, s || {});
  }
  async function bumpStats(patch) {
    const cur = await getStats();
    const next = Object.assign({}, cur);
    for (const k in (patch || {})) next[k] = (next[k] || 0) + patch[k];
    await set({ [KEYS.stats]: next });
    return next;
  }

  function genId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const API = {
    KEYS,
    FREE_LIMIT,
    DEFAULT_SETTINGS,
    getProducts,
    saveProducts,
    getProduct,
    getByUrl,
    getSettings,
    saveSettings,
    getStats,
    bumpStats,
    genId,
  };

  global.PSStorage = API;
})(typeof self !== 'undefined' ? self : this);
