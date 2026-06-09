/* ============================================================
 * IMPULSE VAULT — utils/storage.js
 * ------------------------------------------------------------
 * The single source of truth for all persisted state.
 *
 * Design notes:
 *  - This file is loaded as a CLASSIC script in three different
 *    worlds: the service worker (via importScripts), content
 *    scripts (via the manifest/scripting js array), and extension
 *    pages (via <script src>). To work in all of them it attaches
 *    its API to the global object (`self`, which equals `window`
 *    inside content scripts and pages).
 *  - The MV3 service worker is non-persistent, so NOTHING is kept
 *    in long-lived memory. Every read/write goes through
 *    chrome.storage.local. Callers always await fresh reads.
 *  - All data stays on-device. This module never makes a network
 *    request of any kind.
 * ============================================================ */

(function (global) {
  'use strict';

  // ---- Storage keys (namespaced to avoid collisions) ----
  const K = {
    SETTINGS: 'iv_settings',
    SEARCHES: 'iv_searches',
    VIEWS: 'iv_views',
    VAULT: 'iv_vault',
    STATS: 'iv_stats',
    EVENTS: 'iv_events',
    PROFILE: 'iv_profile',
    INTERVENTIONS: 'iv_intervention_log',
    SUPPRESS: 'iv_suppressed',
    ACHIEVEMENTS: 'iv_achievements',
  };

  // ---- The default list of watched shopping + search domains ----
  // Korean + global to start. Fully user-editable from settings.
  const DEFAULT_DOMAINS = [
    'coupang.com',
    'naver.com',
    'gmarket.co.kr',
    '11st.co.kr',
    'auction.co.kr',
    'musinsa.com',
    'aliexpress.com',
    'amazon.com',
    'google.com',
    'daum.net',
  ];

  // ---- Default settings ----
  const DEFAULT_SETTINGS = {
    onboarded: false, // has the user finished onboarding?
    granted: false, // have host/optional permissions been granted?
    strictness: 'balanced', // 'gentle' | 'balanced' | 'strict'
    hourlyWage: 12000, // KRW per hour (used for cost reframing)
    weeklyAllowance: 0, // optional alternative to hourly wage
    gamePrice: 60000, // KRW — "a thing you value" reference unit
    coolingHours: 24, // default Vault cooling-off duration
    paused: false, // global pause toggle
    snoozeUntil: 0, // epoch ms; while now < this, stay quiet
    domains: DEFAULT_DOMAINS.slice(),

    alwaysAsk: true, // force a blocking modal on EVERY detected buy click (no freq-cap downgrade)

    // ---- Cold Purchase Analysis ----
    coldAnalysis: true, // show the rules-based scorecard in interventions
    allSites: false, // analyze purchases on ALL sites (opt-in, broad permission)
    // AI is ON by default and routed through the shared proxy, so users get
    // the analysis with NO key of their own. If a user pastes their OWN key in
    // settings, that takes priority (BYOK) and the proxy is bypassed.
    aiEnabled: true, // AI enrichment on by default (uses the proxy below)
    aiProvider: 'claude', // 'claude' | 'openai'
    aiKey: '', // the user's OWN api key (optional; overrides the proxy)
    aiModel: '', // optional model override (blank = provider default)
    aiProxyUrl: 'https://impursivevault.com/api', // shared proxy: users need NO key
    aiProxySecret: '', // optional x-iv-secret header for the proxy
    webSearchEnabled: false, // "더 싼 대안 찾기" + review search

    // ---- v1.2 Momentum ----
    goal: { name: '', target: 0 }, // a savings goal to aim resisted money at
    motivation: '', // a personal "why" the user sees during interventions
  };

  const DEFAULT_STATS = {
    totalSaved: 0, // KRW the user decided NOT to spend
    resisted: 0, // # times user backed off after an intervention
    proceeded: 0, // # times user bought anyway (never shamed)
    interventions: 0, // # of blocking interventions shown
    vaulted: 0, // # items sent to the Vault to cool off
    streak: 0, // current run of resists without a "buy anyway"
    bestStreak: 0, // longest run ever
  };

  // ---- Low-level helpers (Promise wrappers over chrome.storage) ----
  function get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  }
  function set(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  // Deep-ish merge for settings so new default keys appear after upgrades.
  function withDefaults(stored, defaults) {
    return Object.assign({}, defaults, stored || {});
  }

  // ---- Public API ----
  const Storage = {
    K,
    DEFAULT_DOMAINS,
    DEFAULT_SETTINGS,

    async getSettings() {
      const res = await get(K.SETTINGS);
      const s = withDefaults(res[K.SETTINGS], DEFAULT_SETTINGS);
      // Guarantee domains is always a non-empty array.
      if (!Array.isArray(s.domains) || s.domains.length === 0) {
        s.domains = DEFAULT_DOMAINS.slice();
      }
      return s;
    },

    async saveSettings(patch) {
      const cur = await this.getSettings();
      const next = Object.assign({}, cur, patch);
      await set({ [K.SETTINGS]: next });
      return next;
    },

    async getStats() {
      const res = await get(K.STATS);
      return withDefaults(res[K.STATS], DEFAULT_STATS);
    },

    async bumpStats(patch) {
      const cur = await this.getStats();
      const next = Object.assign({}, cur);
      for (const key of Object.keys(patch)) {
        next[key] = (next[key] || 0) + patch[key];
      }
      await set({ [K.STATS]: next });
      return next;
    },

    // ---- v1.2: resist streak ----
    // didResist=true extends the current streak (and best); false breaks it.
    async updateStreak(didResist) {
      const cur = await this.getStats();
      const next = Object.assign({}, cur);
      if (didResist) {
        next.streak = (next.streak || 0) + 1;
        next.bestStreak = Math.max(next.bestStreak || 0, next.streak);
      } else {
        next.streak = 0;
      }
      await set({ [K.STATS]: next });
      return next;
    },

    // ---- v1.2: achievement badges (list of unlocked ids) ----
    async getAchievements() {
      const res = await get(K.ACHIEVEMENTS);
      return Array.isArray(res[K.ACHIEVEMENTS]) ? res[K.ACHIEVEMENTS] : [];
    },
    // Merge in any newly-earned ids; returns ONLY the ones that were new.
    async addAchievements(ids) {
      const cur = await this.getAchievements();
      const have = new Set(cur);
      const added = [];
      for (const id of ids || []) {
        if (!have.has(id)) { have.add(id); added.push(id); }
      }
      if (added.length) await set({ [K.ACHIEVEMENTS]: Array.from(have) });
      return added;
    },

    // ---- Search-query history (capped to keep storage small) ----
    async addSearch(entry) {
      const res = await get(K.SEARCHES);
      const list = res[K.SEARCHES] || [];
      list.push(entry); // {keyword, site, ts}
      // Keep only the most recent 500 searches.
      const trimmed = list.slice(-500);
      await set({ [K.SEARCHES]: trimmed });
      return trimmed;
    },
    async getSearches() {
      const res = await get(K.SEARCHES);
      return res[K.SEARCHES] || [];
    },

    // ---- Product-view tracking keyed by a stable product id ----
    async recordView(view) {
      // view: {key, name, price, url, site, category}
      const res = await get(K.VIEWS);
      const views = res[K.VIEWS] || {};
      const now = Date.now();
      const existing = views[view.key];
      if (existing) {
        existing.count += 1;
        existing.lastTs = now;
        // Backfill name/price if we learned them on a later visit.
        if (!existing.name && view.name) existing.name = view.name;
        if (!existing.price && view.price) existing.price = view.price;
      } else {
        views[view.key] = {
          name: view.name || '',
          price: view.price || 0,
          url: view.url || '',
          site: view.site || '',
          category: view.category || '',
          count: 1,
          firstTs: now,
          lastTs: now,
        };
      }
      await set({ [K.VIEWS]: views });
      return views[view.key];
    },
    async getView(key) {
      const res = await get(K.VIEWS);
      return (res[K.VIEWS] || {})[key] || null;
    },
    async getViews() {
      const res = await get(K.VIEWS);
      return res[K.VIEWS] || {};
    },

    // ---- Vault (locked, cooling-off items) ----
    async getVault() {
      const res = await get(K.VAULT);
      return res[K.VAULT] || [];
    },
    async addVaultItem(item) {
      const list = await this.getVault();
      const now = Date.now();
      const settings = await this.getSettings();
      const hours = item.coolingHours || settings.coolingHours || 24;
      const record = {
        id: 'v_' + now + '_' + Math.random().toString(36).slice(2, 7),
        item: item.item || 'Unnamed item',
        price: item.price || 0,
        url: item.url || '',
        site: item.site || '',
        ts: now,
        releaseAt: now + hours * 3600 * 1000,
        status: 'locked', // 'locked' | 'bought' | 'released'
      };
      list.push(record);
      await set({ [K.VAULT]: list });
      return record;
    },
    async updateVaultItem(id, patch) {
      const list = await this.getVault();
      const idx = list.findIndex((x) => x.id === id);
      if (idx === -1) return null;
      list[idx] = Object.assign({}, list[idx], patch);
      await set({ [K.VAULT]: list });
      return list[idx];
    },
    async removeVaultItem(id) {
      const list = await this.getVault();
      const next = list.filter((x) => x.id !== id);
      await set({ [K.VAULT]: next });
      return next;
    },

    // ---- Impulse events (the raw signal for pattern analysis) ----
    async addEvent(evt) {
      // evt: {ts, type, price, site, category, keyword}
      const res = await get(K.EVENTS);
      const list = res[K.EVENTS] || [];
      list.push(evt);
      const trimmed = list.slice(-1000);
      await set({ [K.EVENTS]: trimmed });
      return trimmed;
    },
    async getEvents() {
      const res = await get(K.EVENTS);
      return res[K.EVENTS] || [];
    },

    // ---- Computed impulse profile ----
    async getProfile() {
      const res = await get(K.PROFILE);
      return res[K.PROFILE] || null;
    },
    async saveProfile(profile) {
      await set({ [K.PROFILE]: profile });
      return profile;
    },

    // ---- Frequency-cap log (blocking interventions per hour) ----
    async logIntervention(ts) {
      const res = await get(K.INTERVENTIONS);
      const list = res[K.INTERVENTIONS] || [];
      list.push(ts);
      // Keep only the last 2 hours of timestamps.
      const cutoff = Date.now() - 2 * 3600 * 1000;
      const trimmed = list.filter((t) => t >= cutoff);
      await set({ [K.INTERVENTIONS]: trimmed });
      return trimmed;
    },
    async interventionsInLastHour() {
      const res = await get(K.INTERVENTIONS);
      const list = res[K.INTERVENTIONS] || [];
      const cutoff = Date.now() - 3600 * 1000;
      return list.filter((t) => t >= cutoff).length;
    },

    // ---- Per-product "don't ask again" list ----
    // When the user chooses "Buy it anyway", that product's key is recorded
    // here so the intervention never re-appears for the same product. Stored
    // as { [key]: ts } and capped so it can't grow without bound.
    async getSuppressed() {
      const res = await get(K.SUPPRESS);
      const map = res[K.SUPPRESS];
      return map && typeof map === 'object' ? map : {};
    },
    async isSuppressed(key) {
      if (!key) return false;
      const map = await this.getSuppressed();
      return Object.prototype.hasOwnProperty.call(map, key);
    },
    async addSuppressed(key) {
      if (!key) return null;
      const map = await this.getSuppressed();
      map[key] = Date.now();
      // Cap to the 1000 most recent so the list can't grow forever.
      const keys = Object.keys(map);
      if (keys.length > 1000) {
        keys
          .sort((a, b) => map[a] - map[b]) // oldest first
          .slice(0, keys.length - 1000)
          .forEach((k) => delete map[k]);
      }
      await set({ [K.SUPPRESS]: map });
      return map;
    },
    async removeSuppressed(key) {
      const map = await this.getSuppressed();
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        delete map[key];
        await set({ [K.SUPPRESS]: map });
      }
      return map;
    },
    async clearSuppressed() {
      await set({ [K.SUPPRESS]: {} });
      return {};
    },

    // ---- The nuclear "Delete all my data" button ----
    async deleteAll() {
      await new Promise((resolve) =>
        chrome.storage.local.clear(() => resolve())
      );
      // Re-seed sane defaults but keep the extension "onboarded/granted"
      // so we don't bounce the user back through setup unexpectedly.
      const fresh = Object.assign({}, DEFAULT_SETTINGS, {
        onboarded: true,
        granted: true,
      });
      await set({ [K.SETTINGS]: fresh });
      return fresh;
    },
  };

  global.IVStorage = Storage;
})(typeof self !== 'undefined' ? self : this);
