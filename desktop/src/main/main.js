/* ============================================================
 * IMPULSE VAULT desktop — main.js  (Electron main process)
 * ------------------------------------------------------------
 * The hub: app lifecycle, single-instance lock, the premium window,
 * system tray, native notifications, local data store, the
 * localhost WebSocket bridge to the extension, the supporter board
 * adapter, and a minimal, safe IPC API for the renderer.
 *
 * Security posture: the renderer runs with contextIsolation + sandbox
 * and NO node integration. All privileged work happens here in main
 * and is exposed through a tiny, explicit IPC surface (see preload).
 * 100% local — the only outbound network use is (a) the supporter
 * board (Supabase, if configured) and (b) opening donation links in
 * the external browser. No telemetry.
 * ============================================================ */

'use strict';

const {
  app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage,
} = require('electron');
const path = require('path');

const config = require('./config');
const { Store } = require('./store');
const { Bridge } = require('./bridge');
const analysis = require('./analysis');
const board = require('./board');

let store = null;
let bridge = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

// ---- Single-instance lock (so the tray/bridge aren't duplicated) ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
  app.whenReady().then(init);
}

function init() {
  store = new Store(path.join(app.getPath('userData'), 'impulse-vault-data.json'));

  applyLoginItem(store.getSettings().launchAtStartup);
  createWindow();
  createTray();
  startBridge();
  registerIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
}

// ============================================================
// Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0a0e14',
    title: 'IMPULSE VAULT',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, // renderer can't reach Node directly
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Closing the window hides to tray (app keeps sensing in the background).
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // External links (e.g. donation pages) never open inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ============================================================
// Tray
// ============================================================
function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  if (process.platform === 'darwin') img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('IMPULSE VAULT');
  refreshTrayMenu();
  tray.on('click', showWindow);
}

function refreshTrayMenu() {
  if (!tray) return;
  const stats = store.getStats();
  const saved = '₩' + Number(stats.totalSaved || 0).toLocaleString('ko-KR');
  const menu = Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { type: 'separator' },
    { label: `지금까지 아낀 돈 · ${saved}`, enabled: false },
    { type: 'separator' },
    {
      label: '1시간 잠시 멈춤',
      click: () => {
        store.saveSettings({ snoozeUntil: Date.now() + 3600 * 1000 });
        bridge && bridge.pushConfig();
        notifyRenderer({ type: 'settings-changed' });
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

// ============================================================
// Bridge (extension sensor)
// ============================================================
function startBridge() {
  bridge = new Bridge({
    port: config.BRIDGE_PORT,
    store,
    onStatus: (connected) => notifyRenderer({ type: 'bridge-status', connected }),
    onEvent: (evt) => {
      refreshTrayMenu();
      notifyRenderer({ type: 'sensor', evt });
    },
    onIntervention: ({ tier, payload }) => {
      refreshTrayMenu();
      notifyRenderer({ type: 'intervention', tier, payload });
      if (tier === 'high') nativeNotify(payload);
    },
  });
  bridge.start();
}

function nativeNotify(payload) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: '잠깐 — 이거 진짜 필요해?',
    body: `${payload.name || '이 상품'} · 천천히 한 번 더 생각해보자`,
    silent: false,
  });
  n.on('click', () => {
    showWindow();
    notifyRenderer({ type: 'navigate', view: 'home' });
  });
  n.show();
}

// ============================================================
// Renderer messaging
// ============================================================
function notifyRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-event', payload);
  }
}

function openExternalSafe(url) {
  // Only ever open http(s) links externally.
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
    return true;
  }
  return false;
}

function applyLoginItem(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
  } catch (_) {
    /* not supported on some Linux setups; ignore */
  }
}

// ============================================================
// IPC — the minimal, explicit API surface for the renderer
// ============================================================
function publicConfig() {
  return {
    currency: config.CURRENCY,
    tiers: config.DONATION_TIERS.map((t) => ({
      amount: t.amount,
      label: t.label,
      emoji: t.emoji,
      custom: !!t.custom,
      // Resolve the link + whether it's still a placeholder ("준비 중").
      ready: !config.isPlaceholder(config.DONATION_LINKS[t.link]),
      linkKey: t.link,
    })),
    boardPreview: board.isPreview(),
    maxMessageLength: config.BOARD.maxMessageLength,
    postCooldownMs: config.BOARD.postCooldownMs,
    bridgePort: config.BRIDGE_PORT,
  };
}

function fullState() {
  return {
    settings: store.getSettings(),
    stats: store.getStats(),
    vault: store.getVault(),
    profile: store.getProfile(),
    views: store.get('views'),
    searches: store.get('searches'),
    events: store.get('events'),
    bridgeConnected: bridge ? bridge.isExtensionConnected() : false,
    config: publicConfig(),
  };
}

function registerIpc() {
  ipcMain.handle('iv:getState', () => fullState());
  ipcMain.handle('iv:getConfig', () => publicConfig());

  ipcMain.handle('iv:saveSettings', (_e, patch) => {
    const before = store.getSettings();
    const next = store.saveSettings(patch || {});
    if (patch && 'launchAtStartup' in patch && patch.launchAtStartup !== before.launchAtStartup) {
      applyLoginItem(next.launchAtStartup);
    }
    bridge && bridge.pushConfig();
    refreshTrayMenu();
    return next;
  });

  ipcMain.handle('iv:vaultAdd', (_e, item) => {
    const rec = store.addVaultItem(item || {});
    store.bumpStats({ resisted: 1 });
    refreshTrayMenu();
    return rec;
  });

  ipcMain.handle('iv:vaultUpdate', (_e, { id, patch }) => {
    const rec = store.updateVaultItem(id, patch || {});
    // "Let it go" banks the savings.
    if (patch && patch.status === 'released' && rec) {
      store.bumpStats({ totalSaved: rec.price || 0 });
      refreshTrayMenu();
    }
    return rec;
  });

  ipcMain.handle('iv:decision', (_e, d) => {
    if (!d) return null;
    if (d.decision === 'resisted') store.bumpStats({ resisted: 1, totalSaved: d.price || 0 });
    else if (d.decision === 'proceeded') store.bumpStats({ proceeded: 1 });
    store.addEvent({
      ts: Date.now(), type: 'decision_' + d.decision, price: d.price || 0,
      site: d.site || '', category: '', keyword: d.name || '',
    });
    rebuildProfile();
    refreshTrayMenu();
    return store.getStats();
  });

  ipcMain.handle('iv:pause', (_e, ms) => {
    if (ms && ms > 0) store.saveSettings({ snoozeUntil: Date.now() + ms });
    else store.saveSettings({ paused: !store.getSettings().paused });
    bridge && bridge.pushConfig();
    return store.getSettings();
  });

  ipcMain.handle('iv:rebuildProfile', () => rebuildProfile());
  ipcMain.handle('iv:deleteAll', () => {
    store.deleteAll();
    rebuildProfile();
    refreshTrayMenu();
    return fullState();
  });

  ipcMain.handle('iv:openExternal', (_e, url) => openExternalSafe(url));
  ipcMain.handle('iv:openDonation', (_e, key) => {
    const url = config.DONATION_LINKS[key];
    if (config.isPlaceholder(url)) return false;
    return openExternalSafe(url);
  });
  ipcMain.handle('iv:bridgeStatus', () => (bridge ? bridge.isExtensionConnected() : false));

  // Supporter board
  ipcMain.handle('iv:boardFetch', () => board.fetchMessages());
  ipcMain.handle('iv:boardPost', (_e, msg) => board.postMessage(msg || {}));
}

function rebuildProfile() {
  try {
    const profile = analysis.buildProfile(
      store.get('events'), store.get('searches'), store.getStats()
    );
    store.saveProfile(profile);
    return profile;
  } catch (err) {
    console.warn('[main] rebuildProfile failed:', err);
    return null;
  }
}

// ============================================================
// Lifecycle
// ============================================================
app.on('window-all-closed', () => {
  // Keep running in the tray (so the bridge keeps sensing). Only the
  // tray "종료" / app.quit() actually exits. On macOS this is standard.
});

app.on('before-quit', () => {
  isQuitting = true;
  if (bridge) bridge.stop();
});
