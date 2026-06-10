# IMPULSE VAULT — Project Recap (for the side-project post)

A privacy-first browser extension that adds a calm pause at the moment of an
impulse buy — pros, cons, real cost in hours of your time, and better
alternatives — all computed locally, nothing sent to a server.

---

## Part 1 — What I asked for (the journey)

A rough timeline of the requests that shaped the project:

1. Add a **Pro subscription** to IMPULSE VAULT, with "managed AI analysis" as the headline paid feature (no API key needed).
2. Package the extension as a **.zip**.
3. Walk me through **adding a payment system**, step by step.
4. Wire in **real payments** (started with ExtensionPay / Stripe).
5. Host it on **Cloudflare** and make it actually work.
6. After someone clicks **"Buy it anyway,"** never show the intervention again for that product.
7. Make the **whole site + extension English by default**, Korean as a secondary toggle, prices in **USD**.
8. Give a **collaborator access** (via the GitHub repo).
9. Marketing help: **Product Hunt** launch copy, **Instagram** caption / hashtags / bio, where to advertise.
10. How do I **see how much API usage my users cost me**?
11. Payment provider questions: Stripe isn't live — how would I know if someone subscribes? Could I use Link? → **switch to Gumroad** → **switch to Lemon Squeezy** → finally **switch to PayPal**.
12. With PayPal: **split Monthly and Yearly** into separate buttons; fix the "We're having trouble verifying you" login error (→ made a fresh PayPal account).
13. **Block old/free users** from using the paid managed-AI feature.
14. **Advance the product** — add genuinely new features.
15. Do a **security pass + bug fixes**.
16. Make sure there are **no 4XX / 5XX errors**.
17. Decorate a **Squarespace** site, then a **Shopify** store, to look like the intro page (custom CSS, a full-page HTML block, then a full theme zip).
18. Fix the **"Add to your browser" button error (404)** on Shopify and turn the store into a teaser with the **site address shown large**.
19. Build a **preview** I can look at.

---

## Part 2 — What got built (the changelog)

### Monetization & payments
- Added a **Pro membership**. Free stays free forever (rules-based scorecard + bring-your-own-AI-key); Pro unlocks **managed AI analysis** with no setup.
- Built a single **`IVPro` abstraction** so the payment provider could be swapped without touching the rest of the app — which let me migrate cleanly: **ExtPay/Stripe → Gumroad → Lemon Squeezy → PayPal**.
- Final payment flow: **PayPal hosted buttons** (Monthly $2.99 / Yearly $24.99), plus **self-issued, HMAC-signed license keys** verified by a **Cloudflare Worker** — no database, no accounts, nothing secret in the extension.

### Cloudflare Worker (the backend)
- Serves the static site **and** a keyless **AI proxy** for managed-AI users.
- The proxy is **gated on a valid license** — so my Anthropic budget is only ever spent on real Pro users, even if someone tampers with the extension.
- Added a **license-verify endpoint** (`/api/license`).
- Hardened against errors: **inline favicon** (no `/favicon.ico` 404), **GET/HEAD health responses** (no 405), a **top-level try/catch** (no unexpected 5XX), and graceful **402** handling for "needs Pro."

### Localization
- The entire site and extension are **English by default** with a **Korean toggle**, and all prices are in **USD**.

### Behavior
- **"Buy it anyway" suppression** — once you proceed past the pause for a specific product, it never nags you about that product again.

### v1.2 "Momentum" update (new features)
- **Resist streaks** — a running count of impulses resisted, shown at the moment of truth ("🔥 5 in a row — don't break it").
- **Savings goal** — set a goal; resisted money fills a progress bar, and the goal shows up during interventions.
- **Achievement badges** — 9 milestones (first save, streaks, big saver, etc.).
- **Personal "why"** — a custom line you write that appears in the pause overlay.

### Security & quality
- Escaped **scraped page data** before rendering it on the dashboard (closed a DOM-XSS hole).
- Made all external link opens **safe** (http(s)-only + `noopener`, blocking `javascript:`/`data:` URLs).
- **Removed the public "demo Pro" toggle** so there's no free-Pro backdoor in the UI.
- **51 automated tests passing**; version bumped **1.0 → 1.1 → 1.2**.

### Marketing & site assets
- **Product Hunt** tagline + launch copy, Instagram bio/caption/hashtags.
- **Squarespace**: a promo section, a full-page HTML block, a Custom-CSS skin, a content pack (EN + KO), and an annotated layout guide.
- **Shopify**: a Custom-Liquid full-page block, a complete uploadable **theme**, and a standalone **preview** file — finished as a teaser that shows the site address large.

---

## One-line version (for a tweet / intro)
> IMPULSE VAULT is a privacy-first browser extension that adds a calm, smart pause right before an impulse buy — 100% local, free, with an optional Pro tier for managed AI analysis. Built solo, with streaks, savings goals, and badges to make resisting a habit.
