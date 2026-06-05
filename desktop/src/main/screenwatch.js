/* ============================================================
 * IMPULSE VAULT desktop — screenwatch.js   (EXPERIMENTAL)
 * ------------------------------------------------------------
 * Computer-wide purchase detection. A hidden window captures the
 * screen and OCRs it locally; when checkout/buy keywords + a price
 * appear (in ANY app), main fires a system notification + analysis.
 *
 * Honest limits: it can only NOTICE and nudge — the OS sandbox makes
 * it impossible to block another app's click. OCR runs on a long
 * interval, downscaled, throttled, and a per-detection cooldown
 * prevents spam. Everything stays local (OCR runs on-device; only the
 * Tesseract library/lang data is fetched once from a CDN).
 *
 * Requires the OS screen-recording permission (prompted on first use,
 * macOS especially). Fails gracefully if capture/OCR is unavailable.
 * ============================================================ */

'use strict';

const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

let win = null;
let onDetect = null;
let onStatus = null;
let lastNudge = 0;
const NUDGE_COOLDOWN_MS = 8 * 60 * 1000; // don't nudge more than ~once / 8 min

// Receive detections from the hidden watcher renderer (registered once).
ipcMain.on('iv-screen-detect', (_e, payload) => {
  const now = Date.now();
  if (now - lastNudge < NUDGE_COOLDOWN_MS) return;
  lastNudge = now;
  if (onDetect) {
    try { onDetect(payload || {}); } catch (_) {}
  }
});

// Status heartbeats (loading / ready / scan / error) → surfaced in the app UI.
ipcMain.on('iv-screen-status', (_e, payload) => {
  if (onStatus) {
    try { onStatus(payload || {}); } catch (_) {}
  }
});

async function start(opts) {
  if (win) return; // already running
  onDetect = (opts && opts.onDetect) || null;
  onStatus = (opts && opts.onStatus) || null;
  const intervalMs = (opts && opts.intervalMs) || 5000;
  try {
    win = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      webPreferences: {
        preload: path.join(__dirname, '..', 'watcher', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // needed for the capture + OCR worker plumbing
        backgroundThrottling: false,
      },
    });
    await win.loadFile(path.join(__dirname, '..', 'watcher', 'watcher.html'));

    // Pick a screen source and hand its id to the watcher renderer.
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const src = sources && sources[0];
    if (!src) {
      stop();
      return;
    }
    win.webContents.send('iv-watch-start', { sourceId: src.id, intervalMs });
  } catch (err) {
    console.warn('[IMPULSE VAULT] screenwatch start failed:', err);
    stop();
  }
}

function stop() {
  if (win) {
    try { win.destroy(); } catch (_) {}
  }
  win = null;
}

function isRunning() {
  return !!win;
}

module.exports = { start, stop, isRunning };
