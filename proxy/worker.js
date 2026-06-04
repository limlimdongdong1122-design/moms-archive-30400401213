/* ============================================================
 * IMPULSE VAULT — AI proxy (Cloudflare Worker)
 * ------------------------------------------------------------
 * Lets end users get AI analysis WITHOUT their own API key:
 * the extension calls THIS worker, the worker holds ONE key
 * (your secret) and forwards to Anthropic/OpenAI.
 *
 * Abuse control (you pay for everyone, so this matters):
 *   - per-IP daily cap + global daily cap (Cloudflare KV)
 *   - hard max_tokens cap, prompt length cap
 *   - optional shared secret header (x-iv-secret)
 *   - only forwards a single user prompt (no arbitrary model/system)
 *
 * Secrets (set via `wrangler secret put`):
 *   ANTHROPIC_API_KEY  and/or  OPENAI_API_KEY,  optional SHARED_SECRET
 * Vars (wrangler.toml): PROVIDER, MODEL, DAILY_PER_IP, DAILY_GLOBAL, ALLOW_ORIGIN
 * KV binding: IV_KV (optional but strongly recommended for limits)
 * ============================================================ */

const MAX_PROMPT = 8000;
const MAX_TOKENS = 1000;

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    if (request.method !== 'POST') return cors(json({ error: 'POST only' }, 405), origin);

    // Optional shared secret (cheap bot deterrent).
    if (env.SHARED_SECRET && request.headers.get('x-iv-secret') !== env.SHARED_SECRET) {
      return cors(json({ error: 'unauthorized' }, 401), origin);
    }

    let body;
    try { body = await request.json(); } catch (_) { return cors(json({ error: 'bad json' }, 400), origin); }
    const prompt = String(body.prompt || '').slice(0, MAX_PROMPT);
    const useWeb = !!body.useWeb;
    if (!prompt) return cors(json({ error: 'no prompt' }, 400), origin);

    // ---- Rate limiting (soft, KV-based) ----
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

    // ---- Forward to provider ----
    let text;
    try {
      text = await callProvider(env, prompt, useWeb);
    } catch (e) {
      return cors(json({ error: String(e && e.message ? e.message : e) }, 502), origin);
    }

    // ---- Increment counters (best-effort; KV is not atomic) ----
    if (env.IV_KV) {
      const ttl = 60 * 60 * 48; // 2 days
      const [ipc, allc] = await Promise.all([env.IV_KV.get(ipKey), env.IV_KV.get(allKey)]);
      await Promise.all([
        env.IV_KV.put(ipKey, String(Number(ipc || 0) + 1), { expirationTtl: ttl }),
        env.IV_KV.put(allKey, String(Number(allc || 0) + 1), { expirationTtl: ttl }),
      ]);
    }

    return cors(json({ ok: true, text }), origin);
  },
};

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
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-iv-secret');
  return res;
}
