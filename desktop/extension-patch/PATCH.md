# Extension patch — make the extension a "sensor" for the desktop app

These are the **small, additive** changes to the existing `impulse-vault/`
extension so it pairs with the desktop hub over `ws://127.0.0.1:47615`. They are
optional and safe: if the desktop app isn't running, the extension keeps working
exactly as before (it still analyzes locally and renders its own overlay).

The design: the extension keeps **sensing** (search/product/buy-click detection)
and keeps **rendering the on-site overlay** (only it can touch the shopping
page). It now also **mirrors events to the desktop app**, which stores them and
runs the pattern analysis centrally, and the app can **drive interventions**
back to the page.

---

## 1. Add the bridge file

Copy `bridge.js` (next to this file) into the extension folder as
`impulse-vault/bridge.js`.

## 2. Load it from the service worker

In **`impulse-vault/background.js`**, add `bridge.js` to the existing
`importScripts(...)` line at the top:

```js
// before
importScripts('utils/storage.js', 'utils/patterns.js');
// after
importScripts('utils/storage.js', 'utils/patterns.js', 'bridge.js');
```

## 3. Mirror sensor events to the app

Still in **`background.js`**, inside the message handlers, add one
`ivBridgeSend(...)` call each (keep everything else as-is):

```js
// in case 'RECORD_SEARCH', after storing:
ivBridgeSend({ type: 'search_logged', keyword: msg.keyword, site: msg.site, ts: Date.now() });

// in case 'RECORD_VIEW', after storing:
ivBridgeSend({ type: 'product_viewed', key: msg.key, name: msg.name, price: msg.price,
               url: msg.url, site: msg.site, category: msg.category, ts: Date.now() });

// in case 'SCORE_SIGNAL', right after computing `tier`:
ivBridgeSend({ type: 'purchase_intent', key: msg.key, name: msg.name,
               price: msg.price, site: msg.site, signalStrength: result.score, ts: Date.now() });

// in case 'DECISION', after bumping stats:
ivBridgeSend({ type: 'decision', decision: msg.decision, name: msg.name,
               price: msg.price, site: msg.site });
```

> The extension still computes its own `tier`/overlay locally, so it works with
> or without the app. When the app is connected, both see the same events; the
> app becomes the central store + analytics and can additionally push
> `show_intervention`/`config_update`.

## 4. (Optional) Let the app drive the overlay directly

The bridge already relays the app's `show_intervention` command to the active
tab as a `{ type: 'IV_SHOW_OVERLAY', level, payload }` runtime message. To honor
it, add a tiny listener in **`content/detector.js`** (or `overlay.js`):

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'IV_SHOW_OVERLAY' && window.IVOverlay) {
    if (msg.level === 'low') window.IVOverlay.toast(msg.payload);
    else window.IVOverlay.modal(msg.payload, {
      onProceed: () => {}, onResist: () => {}, onVault: () => {},
    });
  }
});
```

That's the whole integration. Connection status, reconnection with backoff, and
config syncing are handled inside `bridge.js`.
