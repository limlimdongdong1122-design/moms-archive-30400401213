/* ============================================================
 * IMPULSE VAULT desktop — store.js
 * ------------------------------------------------------------
 * A tiny, dependency-free local JSON store living in
 * app.getPath('userData'). Mirrors the extension's data model so
 * logic ports cleanly. 100% local — never touches the network.
 *
 * Writes are debounced; reads are from an in-memory cache that is
 * loaded once synchronously at startup.
 * ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DOMAINS = [
  'coupang.com', 'naver.com', 'gmarket.co.kr', '11st.co.kr', 'auction.co.kr',
  'musinsa.com', 'aliexpress.com', 'amazon.com', 'google.com', 'daum.net',
];

const DEFAULTS = {
  settings: {
    onboarded: false,
    strictness: 'balanced',
    hourlyWage: 12000,
    weeklyAllowance: 0,
    gamePrice: 60000,
    coolingHours: 24,
    paused: false,
    snoozeUntil: 0,
    launchAtStartup: false,
    screenWatch: false, // EXPERIMENTAL: OCR the screen to catch purchases in any app
    screenWatchIntervalMs: 5000,
    domains: DEFAULT_DOMAINS.slice(),
  },
  stats: { totalSaved: 0, resisted: 0, proceeded: 0, interventions: 0 },
  searches: [],
  views: {},
  vault: [],
  events: [],
  profile: null,
  interventionLog: [],
};

class Store {
  constructor(filePath) {
    this.file = filePath;
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this._writeTimer = null;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        // Merge so new default keys appear after upgrades.
        this.data = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), raw);
        this.data.settings = Object.assign({}, DEFAULTS.settings, raw.settings || {});
        this.data.stats = Object.assign({}, DEFAULTS.stats, raw.stats || {});
        if (!Array.isArray(this.data.settings.domains) || !this.data.settings.domains.length) {
          this.data.settings.domains = DEFAULT_DOMAINS.slice();
        }
      }
    } catch (err) {
      console.warn('[store] load failed, using defaults:', err);
    }
  }

  _scheduleWrite() {
    if (this._writeTimer) clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => this._flush(), 250);
  }

  _flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[store] write failed:', err);
    }
  }

  // ---- generic ----
  getAll() {
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this._scheduleWrite();
    return value;
  }

  // ---- settings ----
  getSettings() {
    return this.data.settings;
  }
  saveSettings(patch) {
    this.data.settings = Object.assign({}, this.data.settings, patch);
    this._scheduleWrite();
    return this.data.settings;
  }

  // ---- stats ----
  getStats() {
    return this.data.stats;
  }
  bumpStats(patch) {
    for (const k of Object.keys(patch)) {
      this.data.stats[k] = (this.data.stats[k] || 0) + patch[k];
    }
    this._scheduleWrite();
    return this.data.stats;
  }

  // ---- searches ----
  addSearch(entry) {
    this.data.searches.push(entry);
    this.data.searches = this.data.searches.slice(-500);
    this._scheduleWrite();
  }

  // ---- product views ----
  recordView(view) {
    const now = Date.now();
    const existing = this.data.views[view.key];
    if (existing) {
      existing.count += 1;
      existing.lastTs = now;
      if (!existing.name && view.name) existing.name = view.name;
      if (!existing.price && view.price) existing.price = view.price;
    } else {
      this.data.views[view.key] = {
        name: view.name || '', price: view.price || 0, url: view.url || '',
        site: view.site || '', category: view.category || '',
        count: 1, firstTs: now, lastTs: now,
      };
    }
    this._scheduleWrite();
    return this.data.views[view.key];
  }
  getView(key) {
    return this.data.views[key] || null;
  }

  // ---- vault ----
  getVault() {
    return this.data.vault;
  }
  addVaultItem(item) {
    const now = Date.now();
    const hours = item.coolingHours || this.data.settings.coolingHours || 24;
    const record = {
      id: 'v_' + now + '_' + Math.random().toString(36).slice(2, 7),
      item: item.item || 'Unnamed item',
      price: item.price || 0,
      url: item.url || '',
      site: item.site || '',
      ts: now,
      releaseAt: now + hours * 3600 * 1000,
      status: 'locked',
    };
    this.data.vault.push(record);
    this._scheduleWrite();
    return record;
  }
  updateVaultItem(id, patch) {
    const idx = this.data.vault.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    this.data.vault[idx] = Object.assign({}, this.data.vault[idx], patch);
    this._scheduleWrite();
    return this.data.vault[idx];
  }

  // ---- events ----
  addEvent(evt) {
    this.data.events.push(evt);
    this.data.events = this.data.events.slice(-1000);
    this._scheduleWrite();
  }

  // ---- profile ----
  getProfile() {
    return this.data.profile;
  }
  saveProfile(profile) {
    this.data.profile = profile;
    this._scheduleWrite();
    return profile;
  }

  // ---- intervention frequency log ----
  logIntervention(ts) {
    this.data.interventionLog.push(ts);
    const cutoff = Date.now() - 2 * 3600 * 1000;
    this.data.interventionLog = this.data.interventionLog.filter((t) => t >= cutoff);
    this._scheduleWrite();
  }
  interventionsInLastHour() {
    const cutoff = Date.now() - 3600 * 1000;
    return this.data.interventionLog.filter((t) => t >= cutoff).length;
  }

  // ---- delete everything ----
  deleteAll() {
    const onboarded = this.data.settings.onboarded;
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this.data.settings.onboarded = onboarded;
    this._flush();
    return this.data;
  }
}

module.exports = { Store, DEFAULT_DOMAINS };
