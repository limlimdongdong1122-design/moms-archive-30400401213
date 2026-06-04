# IMPULSE VAULT 🛡️

A privacy-first **Chrome / Edge / Brave (Manifest V3)** extension that detects
*your own* online-shopping intent from your browsing and search activity, then
adds **gentle, smart friction** at the moment of purchase — so you buy on
purpose, not on impulse.

It never hard-blocks anything. It just makes you pause, reflect, and (optionally)
drop the item into a cooling-off **Vault** instead of buying right now. When you
resist, it celebrates and banks the money you didn't spend. When you do buy, it
never shames you.

> **No build step.** Vanilla HTML/CSS/JS. Load it unpacked and go.

---

## 🔒 Privacy (non-negotiable)

- **100% local.** The extension makes **zero** network requests containing any
  user data — no browsing data, no search terms, no product info, no analytics.
- Everything is stored in `chrome.storage.local`, on your device only.
- The onboarding screen explains exactly what's tracked.
- The dashboard's **My Data** panel shows everything stored and has a one-click
  **Delete all my data** button (plus JSON export).

## 🔑 Permissions model (explicit, runtime-approved)

- The only permission requested at install time is `storage` (plus the
  non-sensitive `scripting` + `alarms`, which show no warning).
- Sensitive capabilities (`history`, `tabs`, `webNavigation`, `activeTab`) and
  **all host access** are declared as **optional** and requested **at runtime**
  with an explicit click during onboarding (`chrome.permissions.request()`).
- **The extension does nothing on any page until you approve.** Content scripts
  are registered dynamically (via `chrome.scripting`) only for the domains you
  actually granted.
- It never requests `<all_urls>`.

---

## ▶️ How to load it (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this **`impulse-vault/`** folder.
4. A **welcome / onboarding** tab opens automatically. Read the privacy notes,
   click **Grant permissions**, approve the browser prompt, and finish setup.

That's it. Now when you click a Buy / 장바구니 / 구매하기 button on a watched
shopping site, IMPULSE VAULT steps in.

## 🧊 Enable the 3D vault (optional but pretty)

The dashboard ships with a Three.js 3D scene (a glowing item behind a frosted
dome that clears as the cooling-off timer runs, shattering into particles when
you let an item go). Three.js must be bundled **locally** because MV3's CSP
blocks remote scripts.

1. Download the minified UMD build, e.g.
   `https://unpkg.com/three@0.160.0/build/three.min.js`
2. Save it over **`lib/three.min.js`** (replacing the placeholder).
3. Reload the extension.

Until you do, the dashboard automatically shows a CSS fallback — everything else
works fine.

## ➕ Adding / removing watched domains

Open the **dashboard → Settings → "감시할 사이트"** (Watched sites). Type a domain
(e.g. `ssg.com`) and click **추가 (Add)** — the browser will ask you to approve
host access for that site. Remove a domain with the **×** on its chip, which also
revokes the host permission.

> **Note on custom domains:** Chrome only lets an extension request host
> permissions for origins it *declared* in `optional_host_permissions`. The ten
> defaults (Coupang, Naver, Gmarket, 11st, Auction, Musinsa, AliExpress, Amazon,
> Google, Daum) work out of the box. To allow a brand-new domain beyond that
> list, add its `*://*.<domain>/*` pattern to `optional_host_permissions` in
> `manifest.json` and reload, then add it in Settings.

---

## 🧠 How detection works (best-effort, per-site adapters)

Detection is **best-effort** and may need per-site tuning — sites change their
markup constantly. Everything is wrapped in `try/catch` and **never throws into
the host page**; if it can't find something, it silently does nothing.

1. **Search-query tracking** — on a search results page (search engine or a
   shop's internal search), the query is parsed from the URL (`q` / `query` /
   `keyword` / `k`). Repeated or similar searches → rising intent.
2. **Product-page detection** — via schema.org JSON-LD (`"@type":"Product"`),
   price + buy-button heuristics, and known per-site patterns. Extracts the
   product name + price when possible.
3. **Repeat-view detection** — the same product viewed multiple times across
   hours/days is a strong impulse signal.
4. **Buy-button interception** — a single **capture-phase** click listener on
   `document` fires *before* the site's own handlers, intercepts the genuine
   high-intent click, shows the intervention, then either lets the original
   action proceed or quietly cancels it.

**Adapter architecture:** a generic schema.org detector is the fallback, with
specific adapters for **Coupang, Naver, and Amazon**. Adding a new adapter is
just pushing one object into the `ADAPTERS` array in `content/detector.js`.

## 🎚️ The intervention (friction, not prohibition)

It escalates with strictness + signal strength (price, repeat-views, known
impulse pattern, time-of-day), and **you can always proceed**:

- **Low signal** → a small, gentle, auto-dismiss toast. Purchase continues.
- **Medium signal** → a calm glassmorphism modal: 1–2 reflection questions, cost
  reframing (≈ hours of work · ≈ units of "a thing you value"), a short
  *thinking timer* before the "buy anyway" button enables, and a **Lock in
  Vault** option.
- **High signal** → the modal *also* shows a personalized insight from your local
  profile (e.g. your late-night spike), a short "message from future you", and
  requires an explicit confirm.

**Anti-annoyance:** frequency cap (downgrades to a passive toast past N modals/
hour), **Snooze for today**, a global **pause** toggle, and a positive,
never-shaming tone.

## 🗄️ The Vault + cooling-off

**Lock in Vault** stores `{item, price, url, timestamp}` and starts a cooling-off
timer (default 24h). While locked it's frosted; once cooled you decide: **buy**
(opens the saved URL) or **let it go** (banks the amount into *Total Saved* with a
satisfying shatter animation).

---

## 📁 Structure

```
impulse-vault/
├── manifest.json            # MV3 manifest (storage required; rest optional/runtime)
├── tokens.css              # 🎨 single design-token source + shared primitives
├── background.js            # service worker: events, dynamic CS registration, profile
├── content/
│   ├── detector.js         # search/product/button detection + per-site adapters
│   ├── overlay.js          # injected intervention UI (Shadow DOM)
│   └── overlay.css         # CSS-only animations, loaded into the shadow root
├── popup/                  # toolbar popup (Total Saved, vault timers, pause)
├── dashboard/              # full dashboard: 3D vault, charts, settings, My Data
│   ├── vault3d.js          # Three.js scene (graceful CSS fallback)
│   └── ...
├── onboarding/             # welcome + runtime permission flow + setup
├── utils/
│   ├── storage.js          # the single source of truth (chrome.storage.local)
│   └── patterns.js         # pure analysis + signal scoring (no storage/network)
├── lib/three.min.js        # LOCAL Three.js — placeholder; download & replace
├── fonts/                  # LOCAL Space Grotesk + Inter — placeholder; see fonts/README.md
└── icons/                  # generated placeholder icons
```

## 🎨 Design system

All styling flows from **`tokens.css`** — a single set of CSS custom properties
(color, type scale, spacing, radius, elevation, motion easings/durations) plus a
few shared primitives (`.glass`, the drifting aurora + film-grain + vignette
atmosphere, focus rings, reduced-motion). Every stylesheet imports it; there are
no stray hardcoded colors or sizes. The design thesis is "the antidote to
impulse": calm, dark, spacious, slow — one quiet accent at a time (teal = good,
peach-amber = temptation, periwinkle = neutral). All motion is gated behind
`prefers-reduced-motion`.

Fonts (Space Grotesk + Inter) are bundled **locally** via `@font-face` (no CDN —
CSP-safe) and fall back gracefully to system fonts until you add the files; see
`fonts/README.md`.

## ⚠️ Notes & limitations

- On-site detection is heuristic; buy-button selectors for big sites change
  often. The generic schema.org adapter is the safety net.
- The MV3 service worker is non-persistent — all state lives in
  `chrome.storage.local`; nothing relies on long-lived memory.
- Newly registered content scripts apply to **future** page loads, not tabs
  already open.
- UI copy is in **Korean** by default; all code and comments are in English.
