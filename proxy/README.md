# IMPULSE VAULT — Worker (landing page + AI proxy on one domain)

A single Cloudflare Worker that does **two** jobs on the same domain:

- **`GET /`  → serves the public landing page** (so `impursivevault.com` actually
  shows your website in a browser).
- **`POST /` → the keyless AI proxy** — holds **one** API key (yours) and
  forwards analysis requests from the extension, so end users get AI with **no
  key of their own**.

> You pay for everyone's AI usage, so this ships with **hard limits** (per-IP/day,
> global/day, max tokens). Tune them in `wrangler.toml`. Fund it with the
> donations on your landing page.

## ❗ Why your site "doesn't open" in a browser

A Worker that only handled `POST` would answer a normal browser visit (a `GET`)
with `{"error":"POST only"}` (HTTP 405) — so the page never shows. That's the
**combined worker fixes**: it serves the website on `GET` and keeps the proxy on
`POST`. Point your custom domain at this one Worker and both work — **no separate
Cloudflare Pages setup needed.**

> The `observability` block in the dashboard's `wrangler.jsonc` is only *logging*
> config — it never blocks visitors. If it errors, replace that block with the
> minimal `"observability": { "enabled": true }` (drop unknown keys like
> `persist`/`traces`). It's unrelated to whether the page loads.

## Build the deployable worker

`worker.js` is **generated**: it's `worker.template.js` (the logic) with the
landing page (`../landing/`) inlined into it. Whenever you change the landing
page or the template, regenerate it:

```bash
node proxy/build.cjs          # → writes proxy/worker.js (ready to deploy/paste)
```

The committed `proxy/worker.js` is already built, so you can deploy right away.

## Deploy (≈10 minutes, free tier)

1. Install + log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Create the rate-limit store and paste its id into `wrangler.toml` (`IV_KV`):
   ```bash
   wrangler kv:namespace create IV_KV
   ```
3. Add your key as a secret (never committed):
   ```bash
   wrangler secret put ANTHROPIC_API_KEY      # paste your Claude key
   # or, if PROVIDER="openai" in wrangler.toml:
   # wrangler secret put OPENAI_API_KEY
   # optional bot deterrent:
   # wrangler secret put SHARED_SECRET
   ```
4. Build + deploy:
   ```bash
   node build.cjs       # regenerate worker.js (landing page + proxy)
   wrangler deploy
   ```
   You'll get a URL like `https://impulse-vault-proxy.<you>.workers.dev`.

   **Prefer the dashboard?** Open the Worker in the Cloudflare dashboard editor
   and paste the full contents of `proxy/worker.js` (it's self-contained), then
   **Save & deploy**.

## Connect your custom domain (so the site shows at impursivevault.com)

In the Cloudflare dashboard: **Workers & Pages → your Worker → Settings →
Domains & Routes → Add → Custom Domain →** enter `impursivevault.com` (and add
`www.impursivevault.com` too if you want). Cloudflare creates the DNS records
automatically. After it goes green, visiting the domain shows the landing page,
and the extension can POST to the same URL for AI.

> If the domain was previously attached to this Worker as a *route* with only
> `POST` handling, no change is needed — the new combined worker now answers
> browser `GET`s with the page.

## Point the extension at it

In the extension **dashboard → 설정 → AI 분석**, paste that URL into
**"공용 분석 서버(프록시) URL"** (and the shared secret if you set one). When a
proxy URL is set, the extension uses it instead of asking the user for a key.

To ship it to everyone by default, set `aiProxyUrl` (and `aiEnabled: true`) in
`impulse-vault/utils/storage.js` `DEFAULT_SETTINGS` before publishing — then
installed users get free AI out of the box, capped by your limits.

## Cost & abuse notes

- Each analysis ≈ a few cents; web search adds a little. With `DAILY_GLOBAL`
  you cap the worst case (e.g. 2000/day). Lower it if donations are thin.
- Limits are **soft** (KV isn't atomic) — fine for a hobby project. For strict
  guarantees use Durable Objects or Cloudflare Rate Limiting rules.
- Keep `SHARED_SECRET` set so random scripts can't drain your quota. The
  extension sends it as the `x-iv-secret` header.
- The worker only forwards a single user prompt with a capped `max_tokens`;
  it never lets callers choose arbitrary models/system prompts.

## API

- `GET /` → the landing page (HTML). `GET /favicon.ico` → 204.
- `POST /` JSON `{ "prompt": "...", "useWeb": true }` → `{ "ok": true, "text": "..." }`
  (429 when a daily limit is hit; 401 if the shared secret is wrong.)
