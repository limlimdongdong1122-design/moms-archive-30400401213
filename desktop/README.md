# IMPULSE VAULT — Desktop App 🛡️🖥️

A downloadable cross-platform **desktop hub** (Electron) for IMPULSE VAULT. It
pairs with the existing **browser extension** (the "sensor") to add gentle,
smart friction to impulse buying — while keeping the premium calm design and the
signature 3D frosted-vault. **100% local.**

> New here? The browser extension lives in `../impulse-vault/`. This desktop app
> is the hub it talks to.

---

## Why a hybrid (app + extension)?

A desktop app **cannot see inside your browser**, and only a browser extension
can detect shopping pages and intercept a purchase click. So we split the roles:

- **Desktop app = the hub.** Full premium UI (home, vault, dashboard, support,
  settings), local data storage, system tray, native OS notifications, central
  pattern-analysis + decision logic, and a **localhost-only WebSocket server**.
- **Extension = the sensor.** Detects searches/products/buy-clicks, renders the
  on-page overlay, and talks to the app over `ws://127.0.0.1:47615`.

They communicate on `127.0.0.1` only (port `47615`) — the bridge **never binds to
the network**. If the extension isn't connected, the app still works as a manual
hub and shows a "센서(확장) 연결 안 됨" status.

```
 ┌────────────────────────┐        ws://127.0.0.1:47615        ┌─────────────────────┐
 │  Browser extension      │  ──  search/product/buy events ──▶ │  Desktop app (hub)   │
 │  (sensor + overlay)     │  ◀── show_intervention/config ──   │  analysis + storage  │
 └────────────────────────┘                                    │  tray + notifications │
                                                                └─────────────────────┘
```

### Bridge protocol

- **Extension → App:** `search_logged`, `product_viewed`, `purchase_intent`,
  `decision`, `hello`.
- **App → Extension:** `show_intervention {level,item,reframing,insight,payload}`,
  `config_update {strictness,snoozeUntil,paused,domains}`, `welcome`.

---

## Run it (development)

```bash
cd desktop
npm install
npm start          # launches the Electron app
```

## Build installers (distribution)

```bash
npm run dist        # current OS
npm run dist:win    # Windows  → NSIS .exe
npm run dist:mac    # macOS    → .dmg
npm run dist:linux  # Linux    → AppImage + .deb
```

Output lands in `desktop/dist/`.

### ⚠️ Unsigned-app warning (important, and normal)

These installers are **unsigned**, so the OS will warn the first time:

- **Windows (SmartScreen):** "Windows protected your PC" → click **More info** →
  **Run anyway**.
- **macOS (Gatekeeper):** "cannot be opened because the developer cannot be
  verified" → **right-click the app → Open → Open**, or System Settings →
  Privacy & Security → **Open Anyway**.
- **Linux (AppImage):** `chmod +x` the file, then run it.

Code-signing (an Apple Developer cert / Windows OV-EV cert) removes these
warnings but is a **paid, optional, advanced step** for later — not required to
use the app yourself.

---

## Connect the extension (sensor)

The desktop app works on its own, but to actually detect shopping you pair the
extension. See **`extension-patch/PATCH.md`** — it's a small, additive change:

1. Copy `extension-patch/bridge.js` → `impulse-vault/bridge.js`.
2. Add `bridge.js` to the `importScripts(...)` line in the extension's
   `background.js`.
3. Add a few `ivBridgeSend(...)` calls to mirror events (exact snippets in
   PATCH.md). The extension keeps working standalone if the app is off.
4. Load/reload the extension at `chrome://extensions` (Load unpacked → select
   `impulse-vault/`).

A connection status indicator (with auto-reconnect/backoff) is shown in the
app's sidebar.

---

## Support / 후원 (optional)

A **Support** tab with optional donation tiers + a supporter board. Donations are
**purely optional** — the app never gates features or nags.

### Donation links (no secrets in code)

Donations open the developer's **hosted** donation page in the external browser
(`shell.openExternal`). There is **no card form and no payment secret key** in
the app. Edit the links in **`src/main/config.js`**:

```js
const DONATION_LINKS = {
  buyMeACoffee: "PASTE_URL_HERE",
  koFi:         "PASTE_URL_HERE",
  toss:         "PASTE_URL_HERE",   // Korean
  paypal:       "PASTE_URL_HERE",
  kakaoPay:     "PASTE_URL_HERE",   // Korean
};
```

While a value is still `PASTE_URL_HERE`, its tier button shows **"준비 중"** and
does nothing. Tiers/labels/currency are also editable in `config.js`.

> 💡 Actually **receiving** money requires meeting the platform's age/eligibility
> terms — best set up with a **parent/guardian**. Keep the placeholders until the
> account is ready, then just paste the links.

### Supporter board ("응원 게시판")

A real multi-user board needs a backend. We use **Supabase (free tier)**.

**Leave the Supabase config as placeholders** and the board runs in **local
preview mode** with sample messages — great for development. Fill it in to go
live (in `src/main/config.js`):

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key"; // publishable — safe to ship WITH RLS
```

#### Supabase setup

1. Create a project at supabase.com (free).
2. Create the table (SQL editor):

   ```sql
   create table public.messages (
     id uuid primary key default gen_random_uuid(),
     name text,
     message text not null,
     badge text,
     created_at timestamptz not null default now(),
     approved boolean not null default false
   );
   alter table public.messages enable row level security;
   ```

3. **Row Level Security policies** (this is what makes shipping the anon key
   safe):

   ```sql
   -- Public can READ only approved messages
   create policy "read approved" on public.messages
     for select using (approved = true);

   -- Public can INSERT, but only the allowed columns; approved stays false
   create policy "public insert" on public.messages
     for insert with check (
       approved = false
       and char_length(message) <= 200
       and (name is null or char_length(name) <= 40)
     );

   -- No public UPDATE / DELETE policies  → those are blocked by default.
   ```

4. Copy your Project URL + `anon` public key into `config.js`.

#### Approval workflow (admin)

New posts arrive with `approved = false` and show as **"검토 중"** to the poster
(hidden from everyone else). To publish one, in the Supabase dashboard open
**Table editor → messages**, find the row, and flip **`approved` to `true`** (or
run `update public.messages set approved = true where id = '…';`). That's your
moderation step.

#### Board safety (built in)

- Max message length (200), plain-text rendering (never HTML injection),
  input trimmed/sanitized, simple profanity mask, client-side post cooldown
  (one post / few minutes), no sensitive personal data collected.
- The data source is a swappable adapter (`src/main/board.js`) — switching from
  preview to live is a **config change, not a rewrite**.

---

## Project structure

```
desktop/
├── package.json              # electron + electron-builder + ws; scripts; build config
├── src/
│   ├── main/
│   │   ├── main.js           # app lifecycle, window, tray, notifications, IPC
│   │   ├── config.js         # 🔧 edit here: port, donation links, Supabase
│   │   ├── store.js          # local JSON store in userData (100% local)
│   │   ├── analysis.js       # pattern analysis + signal scoring (central)
│   │   ├── bridge.js         # localhost WebSocket server (extension ↔ app)
│   │   └── board.js          # supporter board adapter (Supabase / preview)
│   ├── preload/preload.js    # safe contextBridge API (no Node in renderer)
│   └── renderer/             # the premium UI (tokens.css + vault3d.js reused)
├── extension-patch/          # bridge.js + PATCH.md for the existing extension
└── assets/                   # app + tray icons
```

## Privacy & data

- All app data lives in a single JSON file under Electron's `userData`
  directory. No telemetry, no accounts.
- The only outbound network use is (a) the supporter board (Supabase, only if you
  configure it) and (b) opening donation links in your browser.
- Settings → **모든 데이터 삭제** wipes everything locally.

## Notes

- **Local everything:** `three.js`, fonts, and assets are bundled locally (no
  CDNs); the renderer runs with a strict CSP, `contextIsolation`, `sandbox`, and
  no node integration.
- **Fonts:** drop the Space Grotesk / Inter `.woff2` files into
  `src/renderer/fonts/` (see that folder's README); otherwise system fonts are
  used. Same for `src/renderer/three.min.js` (replace the placeholder to enable
  the 3D scene).
- **Want much smaller binaries later?** [Tauri](https://tauri.app) (native
  webview + Rust) produces far smaller apps than Electron. This project uses
  Electron now for simplicity; the renderer UI would port to Tauri with a
  different main/preload layer.
```
