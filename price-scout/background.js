/* ============================================================
 * PRICE SCOUT — background.js (MV3 service worker)
 * ------------------------------------------------------------
 * The engine room:
 *   • Message router for the popup, dashboard, and content widget.
 *   • Scheduled re-check (chrome.alarms) — fetches each tracked
 *     product's page, parses the price, records history, and fires an
 *     OS notification when a competitor moves their price.
 *   • Toolbar badge = number of unseen price alerts.
 *
 * Everything is local: products + history live in chrome.storage.local;
 * nothing about the user is sent anywhere. The only network calls are
 * GETs to the product pages the user chose to track.
 *
 * No long-lived state — the worker can be torn down anytime; all state
 * is reloaded from storage on demand.
 * ============================================================ */
'use strict';

importScripts('utils/price.js', 'utils/storage.js', 'utils/adapters.js');

const ALARM = 'ps-recheck';

/* ---------------- lifecycle ---------------- */
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  await refreshBadge();
  if (details && details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await refreshBadge();
});

async function ensureAlarm() {
  try {
    const s = await PSStorage.getSettings();
    const minutes = Math.max(30, Math.round((s.checkIntervalHours || 6) * 60));
    chrome.alarms.create(ALARM, { periodInMinutes: minutes, delayInMinutes: 1 });
  } catch (_) {}
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a && a.name === ALARM) recheckAll('schedule');
});

/* ---------------- message router ---------------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'PS_GET_STATE': {
          const [products, settings, stats] = await Promise.all([
            PSStorage.getProducts(), PSStorage.getSettings(), PSStorage.getStats(),
          ]);
          return sendResponse({ ok: true, products, settings, stats });
        }

        case 'PS_PAGE_STATUS': {
          // content widget asks: is this URL already tracked?
          const existing = await PSStorage.getByUrl(msg.url || '');
          const settings = await PSStorage.getSettings();
          const products = await PSStorage.getProducts();
          return sendResponse({
            ok: true,
            tracked: !!existing,
            atLimit: !settings.pro && products.length >= PSStorage.FREE_LIMIT,
            limit: PSStorage.FREE_LIMIT,
            currency: settings.currency,
          });
        }

        case 'PS_TRACK_ADD': {
          const res = await addProduct(msg.product || {});
          return sendResponse(res);
        }

        case 'PS_TRACK_REMOVE': {
          const list = (await PSStorage.getProducts()).filter((p) => p.id !== msg.id);
          await PSStorage.saveProducts(list);
          await refreshBadge();
          return sendResponse({ ok: true });
        }

        case 'PS_UPDATE_PRICE': {
          // content script reports a fresh price seen on a visited page
          const res = await applyPrice(msg.url, msg.price, { name: msg.name, image: msg.image, source: 'visit' });
          return sendResponse(res);
        }

        case 'PS_SET_MY_PRICE': {
          await mutate(msg.id, (p) => { p.myPrice = Math.round(Number(msg.myPrice) || 0) || null; });
          return sendResponse({ ok: true });
        }

        case 'PS_SET_NOTE': {
          await mutate(msg.id, (p) => { p.note = String(msg.note || '').slice(0, 200); });
          return sendResponse({ ok: true });
        }

        case 'PS_MARK_SEEN': {
          // popup/dashboard opened → clear unseen flags + badge
          const list = await PSStorage.getProducts();
          list.forEach((p) => { p.unseen = false; });
          await PSStorage.saveProducts(list);
          await refreshBadge();
          return sendResponse({ ok: true });
        }

        case 'PS_SAVE_SETTINGS': {
          const next = await PSStorage.saveSettings(msg.patch || {});
          await ensureAlarm();
          return sendResponse({ ok: true, settings: next });
        }

        case 'PS_SET_PRO': {
          const next = await PSStorage.saveSettings({ pro: !!msg.pro });
          return sendResponse({ ok: true, settings: next });
        }

        case 'PS_CHECK_NOW': {
          const r = await recheckAll('manual', msg.id || null);
          return sendResponse({ ok: true, checked: r.checked, changed: r.changed });
        }

        case 'PS_OPEN_DASHBOARD': {
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
          return sendResponse({ ok: true });
        }

        case 'PS_CLEAR_ALL': {
          // wipe everything this extension stored on the device
          await new Promise((res) => {
            try { chrome.storage.local.remove(Object.values(PSStorage.KEYS), () => { void chrome.runtime.lastError; res(); }); }
            catch (_) { res(); }
          });
          await refreshBadge();
          return sendResponse({ ok: true });
        }

        default:
          return sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (err) {
      return sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();
  return true; // async
});

/* ---------------- core operations ---------------- */
async function addProduct(input) {
  const url = (input.url || '').split('#')[0];
  if (!url) return { ok: false, error: 'no_url' };

  const products = await PSStorage.getProducts();
  const settings = await PSStorage.getSettings();

  const existing = products.find((p) => (p.url || '').split('#')[0] === url);
  if (existing) {
    // already tracked → just refresh its price
    await applyPrice(url, input.price, { name: input.name, image: input.image, source: 'add' });
    return { ok: true, already: true };
  }
  if (!settings.pro && products.length >= PSStorage.FREE_LIMIT) {
    return { ok: false, error: 'limit', limit: PSStorage.FREE_LIMIT };
  }

  const price = Math.round(Number(input.price) || 0);
  const now = Date.now();
  const product = {
    id: PSStorage.genId(),
    name: (input.name || '추적 상품').slice(0, 140),
    url,
    site: input.site || PSAdapters.hostOf(url),
    image: input.image || '',
    myPrice: null,
    currentPrice: price,
    firstPrice: price,
    lowest: price || 0,
    highest: price || 0,
    lastChecked: now,
    createdAt: now,
    lastChange: null,
    needsVisit: price <= 0,
    unseen: false,
    history: price > 0 ? [{ ts: now, price }] : [],
    note: '',
  };
  products.push(product);
  await PSStorage.saveProducts(products);
  return { ok: true, id: product.id };
}

/** Apply a freshly observed price to a tracked product (by URL). */
async function applyPrice(url, rawPrice, opts) {
  const o = opts || {};
  const u = (url || '').split('#')[0];
  const price = Math.round(Number(rawPrice) || 0);
  const list = await PSStorage.getProducts();
  const p = list.find((x) => (x.url || '').split('#')[0] === u);
  if (!p) return { ok: false, error: 'not_tracked' };
  if (price <= 0) {
    p.needsVisit = true;
    p.lastChecked = Date.now();
    await PSStorage.saveProducts(list);
    return { ok: true, updated: false };
  }

  const prev = p.currentPrice || 0;
  const cls = PSPrice.classifyForSeller(prev, price);
  p.currentPrice = price;
  p.needsVisit = false;
  p.lastChecked = Date.now();
  if (o.name && (!p.name || p.name === '추적 상품')) p.name = o.name.slice(0, 140);
  if (o.image && !p.image) p.image = o.image;
  if (!p.firstPrice) p.firstPrice = price;
  p.history = PSPrice.appendPoint(p.history, price, p.lastChecked);
  const sum = PSPrice.summarize(p.history);
  p.lowest = sum.lowest; p.highest = sum.highest;

  let notified = false;
  if (cls.dir !== 'same') {
    p.lastChange = { dir: cls.dir, kind: cls.kind, pct: cls.pct, prev, at: p.lastChecked };
    p.unseen = true;
    notified = await maybeNotify(p, cls);
  }
  await PSStorage.saveProducts(list);
  await PSStorage.bumpStats({ checks: 1, alerts: notified ? 1 : 0 });
  await refreshBadge();
  return { ok: true, updated: true, changed: cls.dir !== 'same', kind: cls.kind, pct: cls.pct };
}

/** Re-check every product (or one) by fetching its page server-side-style. */
async function recheckAll(reason, onlyId) {
  let products = await PSStorage.getProducts();
  if (onlyId) products = products.filter((p) => p.id === onlyId);
  let checked = 0, changed = 0;
  for (const p of products) {
    try {
      const html = await fetchText(p.url);
      const data = html ? PSAdapters.extractFromHtml(html) : { price: 0 };
      const res = await applyPrice(p.url, data.price, { name: data.name, image: data.image, source: reason });
      checked++;
      if (res && res.changed) changed++;
    } catch (_) {
      await markNeedsVisit(p.id);
    }
    // be polite between fetches
    await sleep(350);
  }
  await PSStorage.bumpStats({ checks: 0 }); // checks already counted per-apply
  await refreshBadge();
  return { checked, changed };
}

async function fetchText(url) {
  try {
    const r = await fetch(url, { credentials: 'omit', redirect: 'follow' });
    if (!r.ok) return '';
    return await r.text();
  } catch (_) {
    return '';
  }
}

async function markNeedsVisit(id) {
  await mutate(id, (p) => { p.needsVisit = true; p.lastChecked = Date.now(); });
}

async function mutate(id, fn) {
  const list = await PSStorage.getProducts();
  const p = list.find((x) => x.id === id);
  if (!p) return false;
  fn(p);
  await PSStorage.saveProducts(list);
  return true;
}

/* ---------------- notifications + badge ---------------- */
async function maybeNotify(product, cls) {
  const s = await PSStorage.getSettings();
  if (!s.notifyOnChange) return false;
  if (s.notifyThresholdPct && Math.abs(cls.pct) < s.notifyThresholdPct) return false;
  const cur = PSPrice.formatPrice(product.currentPrice, s.currency);
  const arrow = cls.dir === 'down' ? '▼' : '▲';
  const head = cls.kind === 'threat'
    ? '⚠️ 경쟁사가 가격을 내렸어요 (언더컷)'
    : '📈 경쟁사가 가격을 올렸어요 (기회)';
  try {
    chrome.notifications.create('ps_' + product.id + '_' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: head,
      message: `${product.name}\n${arrow} ${cls.pct > 0 ? '+' : ''}${cls.pct}% → ${cur}`,
      priority: cls.kind === 'threat' ? 2 : 1,
    });
    return true;
  } catch (_) {
    return false;
  }
}

// Open the product page when its notification is clicked.
chrome.notifications.onClicked.addListener(async (nid) => {
  try {
    const m = /^ps_(p_[a-z0-9]+)_/.exec(nid);
    if (!m) return;
    const p = await PSStorage.getProduct(m[1]);
    if (p && p.url) chrome.tabs.create({ url: p.url });
    chrome.notifications.clear(nid);
  } catch (_) {}
});

async function refreshBadge() {
  try {
    const list = await PSStorage.getProducts();
    const unseen = list.filter((p) => p.unseen).length;
    await chrome.action.setBadgeBackgroundColor({ color: '#2fe0a6' });
    await chrome.action.setBadgeTextColor({ color: '#06120d' }).catch(() => {});
    await chrome.action.setBadgeText({ text: unseen ? String(unseen) : '' });
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
