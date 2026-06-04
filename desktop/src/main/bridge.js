/* ============================================================
 * IMPULSE VAULT desktop — bridge.js
 * ------------------------------------------------------------
 * The LOCAL-ONLY WebSocket bridge between the browser extension
 * (the "sensor") and this desktop app (the "hub").
 *
 * Security: the server binds to 127.0.0.1 ONLY — it is never
 * exposed to the network. It speaks a small JSON protocol:
 *
 *   Extension → App
 *     { type:'hello' }
 *     { type:'search_logged', keyword, site, ts }
 *     { type:'product_viewed', name, price, url, site, key, ts }
 *     { type:'purchase_intent', name, price, url, site, key, ts }
 *     { type:'decision', decision:'resisted'|'proceeded'|'vaulted', ... }
 *
 *   App → Extension
 *     { type:'show_intervention', level, item, reframing, insight, payload }
 *     { type:'config_update', strictness, snoozeUntil, paused }
 *     { type:'welcome', port }
 *
 * The app owns all analysis + storage centrally; the extension just
 * senses and renders the on-site overlay (only it can touch the page).
 * ============================================================ */

'use strict';

const { WebSocketServer } = require('ws');
const analysis = require('./analysis');

class Bridge {
  /**
   * @param {object} opts
   * @param {number} opts.port
   * @param {Store}  opts.store
   * @param {(payload:object)=>void} opts.onIntervention  fired on medium/high signal
   * @param {(evt:object)=>void}     opts.onEvent         fired on any sensor event
   * @param {(connected:boolean)=>void} opts.onStatus     connection state changes
   */
  constructor(opts) {
    this.port = opts.port;
    this.store = opts.store;
    this.onIntervention = opts.onIntervention || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.wss = null;
    this.clients = new Set();
  }

  isExtensionConnected() {
    return this.clients.size > 0;
  }

  start() {
    if (this.wss) return;
    // Bind to loopback only — never the network.
    this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.onStatus(true);
      this._send(ws, { type: 'welcome', port: this.port });
      // Push current config immediately so the extension is in sync.
      this._send(ws, this._configMessage());

      ws.on('message', (raw) => {
        let msg = null;
        try {
          msg = JSON.parse(raw.toString());
        } catch (_) {
          return; // ignore malformed frames
        }
        this._handle(ws, msg).catch((err) =>
          console.warn('[bridge] handler error:', err)
        );
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.onStatus(this.isExtensionConnected());
      });
      ws.on('error', () => {
        this.clients.delete(ws);
        this.onStatus(this.isExtensionConnected());
      });
    });

    this.wss.on('error', (err) => {
      console.warn('[bridge] server error:', err);
    });
  }

  stop() {
    if (this.wss) {
      for (const ws of this.clients) {
        try { ws.close(); } catch (_) {}
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
    }
  }

  _send(ws, obj) {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch (_) {}
  }

  broadcast(obj) {
    for (const ws of this.clients) this._send(ws, obj);
  }

  _configMessage() {
    const s = this.store.getSettings();
    return {
      type: 'config_update',
      strictness: s.strictness,
      snoozeUntil: s.snoozeUntil,
      paused: s.paused,
      domains: s.domains,
    };
  }

  // Call whenever settings change so the extension stays in sync.
  pushConfig() {
    this.broadcast(this._configMessage());
  }

  async _handle(ws, msg) {
    const settings = this.store.getSettings();

    switch (msg && msg.type) {
      case 'hello':
        this._send(ws, this._configMessage());
        return;

      case 'search_logged': {
        if (settings.paused) return;
        this.store.addSearch({ keyword: msg.keyword, site: msg.site, ts: msg.ts || Date.now() });
        this.store.addEvent({
          ts: msg.ts || Date.now(), type: 'search', price: 0,
          site: msg.site, category: '', keyword: msg.keyword,
        });
        this._rebuildProfile();
        this.onEvent({ kind: 'search', keyword: msg.keyword, site: msg.site });
        return;
      }

      case 'product_viewed': {
        if (settings.paused) return;
        this.store.recordView({
          key: msg.key, name: msg.name, price: msg.price,
          url: msg.url, site: msg.site, category: msg.category,
        });
        this.store.addEvent({
          ts: msg.ts || Date.now(), type: 'view', price: msg.price || 0,
          site: msg.site, category: msg.category || '', keyword: msg.name || '',
        });
        this._rebuildProfile();
        this.onEvent({ kind: 'view', name: msg.name, price: msg.price, site: msg.site });
        return;
      }

      case 'purchase_intent': {
        const now = Date.now();
        if (settings.paused) return this._send(ws, { type: 'no_intervention', reason: 'paused' });
        if (settings.snoozeUntil && now < settings.snoozeUntil)
          return this._send(ws, { type: 'no_intervention', reason: 'snoozed' });

        const profile = this.store.getProfile();
        const viewRec = msg.key ? this.store.getView(msg.key) : null;
        const similar = analysis.similarSearchCount(
          this.store.get('searches'), msg.name || '', 14 * 24 * 3600 * 1000
        );

        const result = analysis.scoreSignal({
          price: msg.price || (viewRec && viewRec.price) || 0,
          viewCount: (viewRec && viewRec.count) || 1,
          similarSearches: similar,
          hour: new Date().getHours(),
          profile,
          strictness: settings.strictness,
          gamePrice: settings.gamePrice,
        });

        // Frequency cap → downgrade to a passive toast.
        const FREQ_CAP = settings.strictness === 'strict' ? 6 : 3;
        let tier = result.tier;
        if ((tier === 'medium' || tier === 'high') && this.store.interventionsInLastHour() >= FREQ_CAP) {
          tier = 'low';
          result.reasons.push('freq_capped');
        }

        const payload = analysis.buildInterventionPayload(
          tier, result, settings, profile, viewRec, similar, msg
        );

        if (tier === 'medium' || tier === 'high') {
          this.store.logIntervention(now);
          this.store.bumpStats({ interventions: 1 });
        }

        // Tell the extension to render the overlay on the page.
        this._send(ws, {
          type: 'show_intervention',
          level: tier,
          item: payload.name,
          reframing: payload.reframing,
          insight: payload.insight,
          payload,
        });

        // Tell the app itself (native notification on high signal + UI tick).
        this.onIntervention({ tier, payload });
        return;
      }

      case 'decision': {
        if (msg.decision === 'resisted') {
          this.store.bumpStats({ resisted: 1, totalSaved: msg.price || 0 });
        } else if (msg.decision === 'proceeded') {
          this.store.bumpStats({ proceeded: 1 });
        } else if (msg.decision === 'vaulted') {
          this.store.addVaultItem({
            item: msg.name, price: msg.price, url: msg.url,
            site: msg.site, coolingHours: settings.coolingHours,
          });
          this.store.bumpStats({ resisted: 1 });
        }
        this.store.addEvent({
          ts: Date.now(), type: 'decision_' + msg.decision, price: msg.price || 0,
          site: msg.site || '', category: '', keyword: msg.name || '',
        });
        this._rebuildProfile();
        this.onEvent({ kind: 'decision', decision: msg.decision });
        return;
      }

      default:
        return;
    }
  }

  _rebuildProfile() {
    try {
      const profile = analysis.buildProfile(
        this.store.get('events'), this.store.get('searches'), this.store.getStats()
      );
      this.store.saveProfile(profile);
    } catch (err) {
      console.warn('[bridge] rebuildProfile failed:', err);
    }
  }
}

module.exports = { Bridge };
