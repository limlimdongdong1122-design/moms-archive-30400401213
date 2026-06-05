/* ============================================================
 * IMPULSE VAULT — extension bridge.js  (NEW FILE for the extension)
 * ------------------------------------------------------------
 * Drop this into the EXISTING extension folder (impulse-vault/bridge.js)
 * and load it from the service worker via importScripts (see PATCH.md).
 *
 * It connects the extension (the "sensor") to the desktop app (the
 * "hub") over a LOCAL-ONLY WebSocket at ws://127.0.0.1:47615.
 *
 *   - Sends sensor events to the app: search_logged / product_viewed /
 *     purchase_intent / decision.
 *   - Receives commands from the app: config_update (sync strictness/
 *     pause/snooze) and show_intervention (relay to the page so the
 *     extension's own overlay renders it).
 *
 * It is fully OPTIONAL and defensive: if the desktop app isn't running,
 * the extension keeps working entirely on its own. The MV3 service
 * worker can sleep, so we reconnect with backoff whenever it wakes.
 * ============================================================ */

'use strict';

const IV_BRIDGE_PORT = 47615; // must match the desktop app's BRIDGE_PORT

let ivWs = null;
let ivConnected = false;
let ivReconnectTimer = null;
let ivBackoff = 2000;

function ivBridgeConnected() {
  return ivConnected;
}

function ivBridgeConnect() {
  if (ivWs && (ivWs.readyState === 0 || ivWs.readyState === 1)) return;
  try {
    ivWs = new WebSocket('ws://127.0.0.1:' + IV_BRIDGE_PORT);
    ivWs.onopen = () => {
      ivConnected = true;
      ivBackoff = 2000;
      ivBridgeSend({ type: 'hello' });
    };
    ivWs.onclose = () => {
      ivConnected = false;
      ivScheduleReconnect();
    };
    ivWs.onerror = () => {
      try { ivWs.close(); } catch (_) {}
    };
    ivWs.onmessage = (e) => {
      let msg = null;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      ivHandleCommand(msg);
    };
  } catch (_) {
    ivScheduleReconnect();
  }
}

function ivScheduleReconnect() {
  if (ivReconnectTimer) return;
  ivReconnectTimer = setTimeout(() => {
    ivReconnectTimer = null;
    ivBackoff = Math.min(ivBackoff * 2, 30000); // exponential backoff, capped
    ivBridgeConnect();
  }, ivBackoff);
}

function ivBridgeSend(obj) {
  try {
    if (ivWs && ivWs.readyState === 1) {
      ivWs.send(JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  // Not connected: try to (re)connect for next time.
  ivBridgeConnect();
  return false;
}

function ivHandleCommand(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'config_update') {
    // Let the app be the source of truth for these while connected.
    try {
      IVStorage.saveSettings({
        strictness: msg.strictness,
        snoozeUntil: msg.snoozeUntil,
        paused: msg.paused,
      });
    } catch (_) {}
  } else if (msg.type === 'show_intervention') {
    // The app decided to intervene → relay to the active tab so the
    // extension's existing overlay renders it on the page.
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        void chrome.runtime.lastError;
        const tab = tabs && tabs[0];
        if (tab && tab.id != null) {
          chrome.tabs.sendMessage(
            tab.id,
            { type: 'IV_SHOW_OVERLAY', level: msg.level, payload: msg.payload },
            () => void chrome.runtime.lastError
          );
        }
      });
    } catch (_) {}
  }
}

// Kick off a connection attempt as soon as the worker loads/wakes.
ivBridgeConnect();
