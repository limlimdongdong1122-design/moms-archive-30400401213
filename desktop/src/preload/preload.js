/* ============================================================
 * IMPULSE VAULT desktop — preload.js
 * ------------------------------------------------------------
 * The ONLY bridge between the sandboxed renderer and the main
 * process. Exposes a small, explicit, promise-based API via
 * contextBridge — no raw ipcRenderer, no Node, no fs in the
 * renderer. Everything privileged is brokered by main.js.
 * ============================================================ */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Renderer-side event subscribers, keyed by event name.
const listeners = Object.create(null);

ipcRenderer.on('app-event', (_event, payload) => {
  const type = payload && payload.type;
  // Fan out to specific subscribers and to a catch-all '*'.
  (listeners[type] || []).forEach((fn) => {
    try { fn(payload); } catch (_) {}
  });
  (listeners['*'] || []).forEach((fn) => {
    try { fn(payload); } catch (_) {}
  });
});

contextBridge.exposeInMainWorld('iv', {
  // ---- state & settings ----
  getState: () => ipcRenderer.invoke('iv:getState'),
  getConfig: () => ipcRenderer.invoke('iv:getConfig'),
  saveSettings: (patch) => ipcRenderer.invoke('iv:saveSettings', patch),

  // ---- vault ----
  vaultAdd: (item) => ipcRenderer.invoke('iv:vaultAdd', item),
  vaultUpdate: (id, patch) => ipcRenderer.invoke('iv:vaultUpdate', { id, patch }),

  // ---- decisions / pattern ----
  decision: (d) => ipcRenderer.invoke('iv:decision', d),
  pause: (ms) => ipcRenderer.invoke('iv:pause', ms),
  rebuildProfile: () => ipcRenderer.invoke('iv:rebuildProfile'),
  deleteAll: () => ipcRenderer.invoke('iv:deleteAll'),

  // ---- bridge status ----
  bridgeStatus: () => ipcRenderer.invoke('iv:bridgeStatus'),

  // ---- support ----
  openExternal: (url) => ipcRenderer.invoke('iv:openExternal', url),
  openDonation: (key) => ipcRenderer.invoke('iv:openDonation', key),
  board: {
    fetch: () => ipcRenderer.invoke('iv:boardFetch'),
    post: (msg) => ipcRenderer.invoke('iv:boardPost', msg),
  },

  // ---- events from main (intervention, sensor, bridge-status, navigate) ----
  on: (eventType, fn) => {
    if (typeof fn !== 'function') return () => {};
    (listeners[eventType] || (listeners[eventType] = [])).push(fn);
    // Return an unsubscribe handle.
    return () => {
      listeners[eventType] = (listeners[eventType] || []).filter((f) => f !== fn);
    };
  },
});
