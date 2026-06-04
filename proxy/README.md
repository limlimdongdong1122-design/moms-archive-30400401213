# IMPULSE VAULT — AI proxy (so users don't need their own key)

A tiny Cloudflare Worker that holds **one** API key (yours) and forwards
analysis requests from the extension. End users get AI analysis with **no key**.

> You pay for everyone's usage, so this ships with **hard limits** (per-IP/day,
> global/day, max tokens). Tune them in `wrangler.toml`. Fund it with the
> donations on your landing page.

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
4. Deploy:
   ```bash
   wrangler deploy
   ```
   You'll get a URL like `https://impulse-vault-proxy.<you>.workers.dev`.

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

`POST /` JSON `{ "prompt": "...", "useWeb": true }` → `{ "ok": true, "text": "..." }`
(429 when a daily limit is hit; 401 if the shared secret is wrong.)
