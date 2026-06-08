/* ============================================================
 * IMPULSE VAULT — Cloudflare Pages advanced-mode worker
 * ------------------------------------------------------------
 * One file that powers the whole Pages site:
 *
 *   POST /api          → keyless AI proxy for the extension (holds YOUR key)
 *   POST /api/license  → verify a PayPal-issued, HMAC-signed license key
 *   anything else      → serves the static landing site (index.html, …)
 *
 * Because it lives in the Pages project, the proxy URL is simply
 * https://impursivevault.com/api — which the extension uses by default.
 *
 * 🔑 Your Claude key is NEVER in this file or the extension. Set it in
 *    Cloudflare → your Pages project → Settings → Variables and Secrets:
 *      ANTHROPIC_API_KEY = sk-ant-...   (type: Secret)
 *      LICENSE_SECRET    = <a long random string>  (type: Secret)
 *        ↑ signs/verifies Pro license keys. Use the SAME value in
 *          tools/make-license.cjs when you generate keys for buyers.
 *    Optional vars: PROVIDER ("claude"|"openai"), MODEL, DAILY_PER_IP,
 *    DAILY_GLOBAL, ALLOW_ORIGIN, OPENAI_API_KEY, SHARED_SECRET.
 *
 * 💡 When LICENSE_SECRET is set, the AI proxy (/api) ALSO requires a valid
 *    license (header x-iv-license) — so your API budget is only ever spent
 *    on real Pro users, even if someone tampers with the extension locally.
 *
 * 💰 Cost guard: bind a KV namespace named IV_KV (Settings → Functions →
 *    KV namespace bindings) to enable the per-IP/global daily caps. Without
 *    it the proxy still works but the caps are skipped.
 * ============================================================ */

const MAX_PROMPT = 8000;
const MAX_TOKENS = 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- License verify lives at /api/license ----
    if (url.pathname === '/api/license' || url.pathname === '/api/license/') {
      return handleLicense(request, env);
    }

    // ---- AI proxy lives at /api ; everything else is the static site ----
    if (url.pathname === '/api' || url.pathname === '/api/') {
      return handleApi(request, env);
    }

    // Serve the uploaded static assets (index.html, style.css, the .zip, …).
    return env.ASSETS.fetch(request);
  },
};

// ============================================================
// License keys — HMAC-signed, no database.
// Key format:  IVP-<expB36>-<nonce>-<sig>
//   expB36 = expiry unix-seconds in base36 ("0" = lifetime)
//   nonce  = random base36 (uniqueness; lets you revoke a single key)
//   sig    = first 20 hex chars of HMAC-SHA256("<expB36>.<nonce>", SECRET)
// The same algorithm lives in tools/make-license.cjs (key generator).
// ============================================================
async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// timing-safe-ish compare for equal-length hex strings
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns { valid, exp } or { valid:false, error }.
async function checkLicense(rawKey, secret) {
  const key = String(rawKey || '').trim();
  const m = key.match(/^IVP-([0-9a-z]+)-([0-9a-z]+)-([0-9a-f]{20})$/i);
  if (!m) return { valid: false, error: 'malformed' };
  const [, expB36, nonce, sig] = m;
  const expected = (await hmacHex(secret, `${expB36}.${nonce}`)).slice(0, 20);
  if (!safeEqual(sig.toLowerCase(), expected.toLowerCase())) return { valid: false, error: 'bad_signature' };
  const exp = parseInt(expB36, 36) || 0;
  if (exp && exp * 1000 <= Date.now()) return { valid: false, error: 'expired', exp };
  return { valid: true, exp };
}

async function handleLicense(request, env) {
  const origin = env.ALLOW_ORIGIN || '*';
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
  if (request.method !== 'POST') return cors(json({ error: 'POST only' }, 405), origin);
  if (!env.LICENSE_SECRET) return cors(json({ valid: false, error: 'not_configured' }, 200), origin);
  let body;
  try { body = await request.json(); } catch (_) { return cors(json({ error: 'bad json' }, 400), origin); }
  const result = await checkLicense(body.key, env.LICENSE_SECRET);
  return cors(json(result), origin);
}

async function handleApi(request, env) {
  const origin = env.ALLOW_ORIGIN || '*';
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
  if (request.method !== 'POST') return cors(json({ error: 'POST only' }, 405), origin);

  // Optional shared secret (cheap bot deterrent).
  if (env.SHARED_SECRET && request.headers.get('x-iv-secret') !== env.SHARED_SECRET) {
    return cors(json({ error: 'unauthorized' }, 401), origin);
  }

  // Pro gate: when LICENSE_SECRET is configured, only verified license
  // holders may use the managed proxy (so it only spends YOUR API budget
  // on real Pro users). Free users run BYOK and never hit this endpoint.
  if (env.LICENSE_SECRET) {
    const lic = await checkLicense(request.headers.get('x-iv-license'), env.LICENSE_SECRET);
    if (!lic.valid) return cors(json({ error: 'pro_required' }, 402), origin);
  }

  let body;
  try { body = await request.json(); } catch (_) { return cors(json({ error: 'bad json' }, 400), origin); }
  const prompt = String(body.prompt || '').slice(0, MAX_PROMPT);
  const useWeb = !!body.useWeb;
  if (!prompt) return cors(json({ error: 'no prompt' }, 400), origin);

  // ---- Rate limiting (soft, KV-based; skipped if IV_KV isn't bound) ----
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const day = new Date().toISOString().slice(0, 10);
  const perIp = Number(env.DAILY_PER_IP || 20);
  const globalCap = Number(env.DAILY_GLOBAL || 2000);
  const ipKey = `ip:${ip}:${day}`;
  const allKey = `all:${day}`;
  if (env.IV_KV) {
    const [ipc, allc] = await Promise.all([env.IV_KV.get(ipKey), env.IV_KV.get(allKey)]);
    if (Number(ipc || 0) >= perIp) return cors(json({ error: 'daily_limit_reached_ip' }, 429), origin);
    if (Number(allc || 0) >= globalCap) return cors(json({ error: 'daily_limit_reached_global' }, 429), origin);
  }

  let text;
  try {
    text = await callProvider(env, prompt, useWeb);
  } catch (e) {
    return cors(json({ error: String(e && e.message ? e.message : e) }, 502), origin);
  }

  if (env.IV_KV) {
    const ttl = 60 * 60 * 48; // 2 days
    const [ipc, allc] = await Promise.all([env.IV_KV.get(ipKey), env.IV_KV.get(allKey)]);
    await Promise.all([
      env.IV_KV.put(ipKey, String(Number(ipc || 0) + 1), { expirationTtl: ttl }),
      env.IV_KV.put(allKey, String(Number(allc || 0) + 1), { expirationTtl: ttl }),
    ]);
  }

  return cors(json({ ok: true, text }), origin);
}

async function callProvider(env, prompt, useWeb) {
  const provider = (env.PROVIDER || 'claude').toLowerCase();

  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    const model = useWeb ? 'gpt-4o-search-preview' : (env.MODEL || 'gpt-4o-mini');
    const reqBody = { model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_TOKENS };
    if (!useWeb) reqBody.temperature = 0.3;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify(reqBody),
    });
    if (!r.ok) throw new Error('OpenAI HTTP ' + r.status + ' · ' + (await r.text()).slice(0, 160));
    const d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message.content) || '';
  }

  // default: Anthropic (Claude) with optional server-side web search
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const reqBody = {
    model: env.MODEL || 'claude-sonnet-4-6',
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWeb) reqBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(reqBody),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status + ' · ' + (await r.text()).slice(0, 160));
  const d = await r.json();
  return (d.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('\n').trim();
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function cors(res, origin) {
  res.headers.set('Access-Control-Allow-Origin', origin || '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-iv-secret, x-iv-license');
  return res;
}
