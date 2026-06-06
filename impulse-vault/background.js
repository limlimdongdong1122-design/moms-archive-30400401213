/* ============================================================
 * IMPULSE VAULT — background.js  (MV3 service worker)
 * ------------------------------------------------------------
 * Responsibilities:
 *   - Open onboarding on install.
 *   - Register/unregister content scripts AT RUNTIME, only for the
 *     domains the user actually granted (the extension does nothing
 *     until then).
 *   - Route messages from content scripts and extension pages.
 *   - Aggregate raw events into the local impulse profile.
 *   - Schedule Vault cooling-off reminders via chrome.alarms.
 *
 * The worker is non-persistent: we keep ZERO important state in
 * memory and always read/write through IVStorage.
 * ============================================================ */

importScripts('utils/storage.js', 'utils/i18n.js', 'utils/patterns.js', 'utils/analysis.js', 'utils/pro.js', 'lib/ExtPay.js');

// ---- ExtensionPay (Pro subscriptions) -------------------------------------
// `lib/ExtPay.js` is a safe stub until the real library is dropped in (see its
// header). We keep ExtPay isolated here + in utils/pro.js so the rest of the
// app only ever asks IVPro "is this user Pro?".
let extpay = null;
try {
  extpay = ExtPay(IVPro.EXTPAY_ID);
  extpay.startBackground();
  if (extpay.onPaid && extpay.onPaid.addListener) extpay.onPaid.addListener(() => syncPro());
  if (extpay.onTrialStarted && extpay.onTrialStarted.addListener) extpay.onTrialStarted.addListener(() => syncPro());
} catch (e) {
  console.warn('[IMPULSE VAULT] ExtPay unavailable — staying on Free:', e);
}

/** Pull the latest paid/trial status from ExtPay and cache it via IVPro. */
async function syncPro() {
  if (!extpay) return;
  try {
    const user = await extpay.getUser();
    await IVPro.setStatus(IVPro.fromExtPayUser(user));
  } catch (e) {
    // network/offline — keep the last cached status
  }
}

/** AI availability with the Pro rule baked in.
 *  - rules-based scorecard: always free (handled elsewhere)
 *  - BYOK (user's own key): free
 *  - managed proxy (we pay): PRO only
 *  Returns { ok, reason } where reason is 'pro_required' | 'ai_disabled' | ''. */
async function aiAvailability(settings) {
  if (!settings.aiEnabled) return { ok: false, reason: 'ai_disabled' };
  if (settings.aiKey) return { ok: true, reason: '' };           // BYOK is free
  if (settings.aiProxyUrl) {
    return (await IVPro.isPro())
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'pro_required' };                   // managed AI = Pro
  }
  return { ok: false, reason: 'ai_disabled' };
}

const CONTENT_SCRIPT_ID = 'iv-dynamic-content';
const CONTENT_FILES = {
  js: ['utils/i18n.js', 'utils/storage.js', 'utils/patterns.js', 'content/detector.js', 'content/overlay.js'],
  // No page-level CSS: the overlay renders in a Shadow DOM and pulls
  // overlay.css into the shadow root (declared web_accessible_resource),
  // so nothing leaks into — or breaks from — the host page.
  css: [],
};

// --- Turn a bare domain ("coupang.com") into a match pattern. ---
function domainToMatch(domain) {
  const clean = String(domain).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `*://*.${clean}/*`;
}

// --- Build the list of match patterns the user has BOTH listed in
//     settings AND actually granted host permission for. ---
async function grantedMatches(settings) {
  const wanted = (settings.domains || []).map(domainToMatch);
  if (wanted.length === 0) return [];
  // Filter to only the patterns we truly have permission for, so
  // registerContentScripts never throws on an ungranted origin.
  const granted = [];
  for (const pattern of wanted) {
    const ok = await new Promise((resolve) =>
      chrome.permissions.contains({ origins: [pattern] }, (r) => resolve(!!r))
    );
    if (ok) granted.push(pattern);
  }
  return granted;
}

/**
 * (Re)register the dynamic content scripts to match exactly the set of
 * granted+enabled domains. Safe to call repeatedly; it replaces the
 * previous registration. Fails silently if nothing is granted yet.
 */
async function syncContentScripts() {
  try {
    const settings = await IVStorage.getSettings();

    // "All sites" mode (opt-in): if the user enabled it AND granted broad
    // host access, watch every site. Otherwise, only the listed domains.
    let matches;
    if (settings.allSites) {
      const allOk = await new Promise((resolve) =>
        chrome.permissions.contains({ origins: ['*://*/*'] }, (r) => resolve(!!r))
      );
      matches = allOk ? ['*://*/*'] : await grantedMatches(settings);
    } else {
      matches = await grantedMatches(settings);
    }

    // Always clear the old registration first.
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID],
    }).catch(() => []);
    if (existing && existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    }

    if (!settings.granted || matches.length === 0) return;

    const registration = {
      id: CONTENT_SCRIPT_ID,
      matches,
      js: CONTENT_FILES.js,
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    };
    if (CONTENT_FILES.css.length) registration.css = CONTENT_FILES.css;
    await chrome.scripting.registerContentScripts([registration]);
  } catch (err) {
    // Never let registration problems kill the worker.
    console.warn('[IMPULSE VAULT] syncContentScripts failed:', err);
  }
}

// ---- Install / update lifecycle ----
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open the welcome/onboarding page. Defaults are applied lazily on
    // every IVStorage read, so there's nothing to seed here.
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/welcome.html') });
  }
  // On any install/update, make sure registration reflects current grants.
  await syncContentScripts();
  await syncPro();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncContentScripts();
  await syncPro();
});

// Re-sync whenever the granted permission set changes from anywhere.
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(syncContentScripts);
}
if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(syncContentScripts);
}

// Heuristic: does the user likely already own/consider something similar?
// True if another DIFFERENT product in the same category was viewed before.
async function likelyOwnsSimilar(viewRec, key) {
  try {
    if (!viewRec || !viewRec.category) return false;
    const views = await IVStorage.getViews();
    for (const k of Object.keys(views)) {
      if (k === key) continue;
      if (views[k] && views[k].category === viewRec.category) return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Call the user's OWN AI provider (BYOK). The key is read from local
 * settings and sent ONLY to the chosen provider — never anywhere else,
 * never hardcoded. Requires host permission for the provider origin
 * (requested when the user enables AI in settings).
 */
async function callAiProvider(settings, details) {
  // Web-search-augmented analysis when the user enabled web search + AI.
  const useWeb = !!settings.webSearchEnabled;
  return callAi(settings, IVAnalysis.buildAiPrompt(details, useWeb), useWeb);
}

/**
 * Low-level BYOK call shared by the scorecard analysis and the
 * "find alternatives" feature. `useWeb` adds live web search.
 */
async function callAi(settings, prompt, useWeb) {
  // ---- Shared proxy mode: no user key needed; the proxy holds the key ----
  // Hybrid rule: if the user supplied their OWN key, honor it (BYOK) and skip
  // the proxy; otherwise fall back to the shared proxy (owner pays).
  if (settings.aiProxyUrl && !settings.aiKey) {
    // Managed AI (we pay the bill) is a Pro feature. BYOK stays free above.
    if (!(await IVPro.isPro())) {
      const e = new Error('pro_required');
      e.code = 'pro_required';
      throw e;
    }
    const headers = { 'Content-Type': 'application/json' };
    if (settings.aiProxySecret) headers['x-iv-secret'] = settings.aiProxySecret;
    const res = await fetch(settings.aiProxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, useWeb: !!useWeb }),
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (_) {}
      let msg = body;
      try { const j = JSON.parse(body); msg = j.error || body; } catch (_) {}
      throw new Error(IVI18n.pick('Proxy ', '프록시 ') + 'HTTP ' + res.status + (msg ? ' · ' + String(msg).slice(0, 160) : ''));
    }
    const data = await res.json();
    if (data && data.ok && data.text) return data.text;
    throw new Error(IVI18n.pick('Proxy response error', '프록시 응답 오류') + (data && data.error ? ' · ' + data.error : ''));
  }

  // Helper: extract a short human-readable error from a failed API response.
  async function errText(res) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    let msg = body;
    try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error.type)) || body; } catch (_) {}
    return 'HTTP ' + res.status + (msg ? ' · ' + String(msg).slice(0, 180) : '');
  }

  if (settings.aiProvider === 'openai') {
    // gpt-4o-search-preview performs live web search; otherwise the chosen model.
    const model = useWeb ? 'gpt-4o-search-preview' : (settings.aiModel || 'gpt-4o-mini');
    const body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 800 };
    if (!useWeb) body.temperature = 0.3; // search-preview rejects temperature
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.aiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('OpenAI ' + (await errText(res)));
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message.content) || '';
  }

  // default: Claude (Anthropic) — add the server-side web_search tool.
  const body = {
    model: settings.aiModel || 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWeb) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.aiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Anthropic ' + (await errText(res)));
  const data = await res.json();
  // With tools, content is an array of blocks; collect all text blocks.
  const text = (data.content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || (data.content && data.content[0] && data.content[0].text) || '';
}

// ---- Rebuild the impulse profile from raw events (debounced-ish) ----
async function rebuildProfile() {
  try {
    const [events, searches, stats] = await Promise.all([
      IVStorage.getEvents(),
      IVStorage.getSearches(),
      IVStorage.getStats(),
    ]);
    const profile = IVPatterns.buildProfile(events, searches, stats);
    await IVStorage.saveProfile(profile);
    return profile;
  } catch (err) {
    console.warn('[IMPULSE VAULT] rebuildProfile failed:', err);
    return null;
  }
}

// ---- Schedule a reminder alarm when an item finishes cooling off ----
function scheduleVaultAlarm(item) {
  try {
    chrome.alarms.create('vault_' + item.id, { when: item.releaseAt });
  } catch (_) {
    /* alarms permission is bundled with the extension; ignore failures */
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('vault_')) return;
  const id = alarm.name.slice('vault_'.length);
  const vault = await IVStorage.getVault();
  const item = vault.find((x) => x.id === id);
  if (!item || item.status !== 'locked') return;
  try { await IVI18n.ready; } catch (_) {}
  try {
    chrome.notifications &&
      chrome.notifications.create(alarm.name, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: IVI18n.pick('Your Vault is open 🔓', '금고가 열렸어요 🔓'),
        message: IVI18n.pick(
          `"${item.item}" has cooled off. Time to decide — buy it, or let it go?`,
          `"${item.item}" 식었어. 이제 결정할 시간 — 살래, 보낼래?`
        ),
      });
  } catch (_) {
    /* notifications permission may not be granted; that's fine */
  }
});

// ============================================================
// Message router — the heart of coordination.
// Returns true from the listener to keep the channel open for async.
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ExtPay uses plain STRING messages ("extpay-*"). Let ExtPay's own
  // background listener handle those — don't intercept or respond here.
  if (typeof msg === 'string') return false;
  (async () => {
    try {
      switch (msg && msg.type) {
        // ---- Content script: a search results page was detected ----
        case 'RECORD_SEARCH': {
          const settings = await IVStorage.getSettings();
          if (settings.paused) return sendResponse({ ok: true, skipped: 'paused' });
          await IVStorage.addSearch({
            keyword: msg.keyword,
            site: msg.site,
            ts: Date.now(),
          });
          await IVStorage.addEvent({
            ts: Date.now(),
            type: 'search',
            price: 0,
            site: msg.site,
            category: msg.category || '',
            keyword: msg.keyword,
          });
          rebuildProfile(); // fire and forget
          return sendResponse({ ok: true });
        }

        // ---- Content script: a product detail page was viewed ----
        case 'RECORD_VIEW': {
          const settings = await IVStorage.getSettings();
          if (settings.paused) return sendResponse({ ok: true, skipped: 'paused' });
          const view = await IVStorage.recordView({
            key: msg.key,
            name: msg.name,
            price: msg.price,
            url: msg.url,
            site: msg.site,
            category: msg.category,
          });
          await IVStorage.addEvent({
            ts: Date.now(),
            type: 'view',
            price: msg.price || 0,
            site: msg.site,
            category: msg.category || '',
            keyword: msg.name || '',
          });
          rebuildProfile();
          return sendResponse({ ok: true, view });
        }

        // ---- Content script: user clicked buy → score the moment ----
        case 'SCORE_SIGNAL': {
          const settings = await IVStorage.getSettings();
          try { await IVI18n.ready; } catch (_) {}

          // Respect global pause / snooze immediately.
          const now = Date.now();
          if (settings.paused)
            return sendResponse({ ok: true, tier: 'none', reason: 'paused' });
          if (settings.snoozeUntil && now < settings.snoozeUntil)
            return sendResponse({ ok: true, tier: 'none', reason: 'snoozed' });

          // "Buy it anyway" earlier on THIS product → never nag about it again.
          if (msg.key && (await IVStorage.isSuppressed(msg.key)))
            return sendResponse({ ok: true, tier: 'none', reason: 'suppressed' });

          const [profile, searches, viewRec] = await Promise.all([
            IVStorage.getProfile(),
            IVStorage.getSearches(),
            msg.key ? IVStorage.getView(msg.key) : Promise.resolve(null),
          ]);

          const similar = IVPatterns.similarSearchCount(
            searches,
            msg.name || '',
            14 * 24 * 3600 * 1000
          );

          const result = IVPatterns.scoreSignal({
            price: msg.price || (viewRec && viewRec.price) || 0,
            viewCount: (viewRec && viewRec.count) || 1,
            similarSearches: similar,
            hour: new Date().getHours(),
            profile,
            strictness: settings.strictness,
            gamePrice: settings.gamePrice,
          });

          // Final tier: "always ask" forces a modal; otherwise the frequency
          // cap can downgrade a blocking modal to a passive toast.
          const FREQ_CAP = settings.strictness === 'strict' ? 6 : 3;
          const recentCount = await IVStorage.interventionsInLastHour();
          let tier = IVPatterns.finalizeTier(result.tier, {
            alwaysAsk: settings.alwaysAsk !== false, // default ON per user request
            recentCount,
            freqCap: FREQ_CAP,
          });
          if (tier !== result.tier && tier === 'low') result.reasons.push('freq_capped');

          // Build the cost-reframing + personalized insight payload.
          const payload = buildInterventionPayload(
            tier,
            result,
            settings,
            profile,
            viewRec,
            similar,
            msg
          );

          // ---- Cold Purchase Analysis scorecard (grounded, free) ----
          // Built for EVERY intervention tier (incl. low) so the supporting
          // evidence is always available — the low toast exposes a "근거 보기".
          if (settings.coldAnalysis) {
            try {
              const details = msg.details || {};
              const ownsSimilar = await likelyOwnsSimilar(viewRec, msg.key);
              payload.scorecard = IVAnalysis.buildScorecard({
                name: msg.name,
                price: msg.price || (viewRec && viewRec.price) || 0,
                itemType: details.itemType || 'product',
                rating: details.rating,
                reviewCount: details.reviewCount,
                specs: details.specs || [],
                reviews: details.reviews || [],
                brand: details.brand,
                originalPrice: details.originalPrice,
                discountPct: details.discountPct,
                freeShipping: details.freeShipping,
                returnInfo: details.returnInfo,
                lowStock: details.lowStock,
                signals: {
                  viewCount: (viewRec && viewRec.count) || 1,
                  similarSearches: similar,
                  category: (viewRec && viewRec.category) || '',
                  ownsSimilar,
                  hourlyWage: settings.hourlyWage,
                  gamePrice: settings.gamePrice,
                  weeklyAllowance: settings.weeklyAllowance,
                },
              });
            } catch (err) {
              console.warn('[IMPULSE VAULT] scorecard build failed:', err);
            }
            // Flags so the overlay knows whether to offer AI / web-search.
            // Managed AI is Pro; BYOK is free — aiAvailability() encodes the rule.
            const aiAvail = await aiAvailability(settings);
            payload.aiEnabled = aiAvail.ok;
            payload.aiProLocked = aiAvail.reason === 'pro_required'; // gentle upsell hint
            payload.webSearchEnabled = !!settings.webSearchEnabled;
            payload.productName = msg.name;
            // Grounded data the overlay passes back for optional AI enrichment.
            if (payload.aiEnabled) {
              const det = msg.details || {};
              // Pass EVERYTHING scraped from the page to the model.
              payload.aiDetails = Object.assign({}, det, {
                name: msg.name,
                price: msg.price || (viewRec && viewRec.price) || 0,
                itemType: det.itemType || 'product',
              });
            }
          }

          if (tier === 'medium' || tier === 'high') {
            await IVStorage.logIntervention(now);
            await IVStorage.bumpStats({ interventions: 1 });
          }

          return sendResponse({ ok: true, tier, payload, score: result.score });
        }

        // ---- Optional AI enrichment for the scorecard (BYOK free · managed = Pro) ----
        case 'ANALYZE_AI': {
          const settings = await IVStorage.getSettings();
          try { await IVI18n.ready; } catch (_) {}
          const avail = await aiAvailability(settings);
          if (!avail.ok) return sendResponse({ ok: false, error: avail.reason });
          try {
            const text = await callAiProvider(settings, msg.details || {});
            return sendResponse({ ok: true, text });
          } catch (err) {
            const code = (err && err.code) || (String(err).includes('pro_required') ? 'pro_required' : '');
            return sendResponse({ ok: false, error: code || String(err) });
          }
        }

        // ---- AI finds real alternative products via live web search ----
        case 'FIND_ALTERNATIVES': {
          const settings = await IVStorage.getSettings();
          try { await IVI18n.ready; } catch (_) {}
          const avail = await aiAvailability(settings);
          if (!avail.ok) return sendResponse({ ok: false, error: avail.reason });
          try {
            const prompt = IVAnalysis.buildAltPrompt(msg.details || {}, msg.kind || 'better');
            // Force web search on so it returns REAL, current products.
            const text = await callAi(settings, prompt, true);
            return sendResponse({ ok: true, text });
          } catch (err) {
            return sendResponse({ ok: false, error: String(err) });
          }
        }

        // ---- User decided after an intervention ----
        case 'DECISION': {
          // msg.decision: 'resisted' | 'proceeded' | 'vaulted'
          if (msg.decision === 'resisted') {
            await IVStorage.bumpStats({ resisted: 1, totalSaved: msg.price || 0 });
          } else if (msg.decision === 'proceeded') {
            await IVStorage.bumpStats({ proceeded: 1 });
            // Remember this exact product so we don't intervene on it again.
            if (msg.key) await IVStorage.addSuppressed(msg.key);
          }
          await IVStorage.addEvent({
            ts: Date.now(),
            type: 'decision_' + msg.decision,
            price: msg.price || 0,
            site: msg.site || '',
            category: msg.category || '',
            keyword: msg.name || '',
          });
          rebuildProfile();
          return sendResponse({ ok: true });
        }

        // ---- Add an item to the Vault (cooling-off) ----
        case 'VAULT_ADD': {
          const item = await IVStorage.addVaultItem({
            item: msg.name,
            price: msg.price,
            url: msg.url,
            site: msg.site,
            coolingHours: msg.coolingHours,
          });
          scheduleVaultAlarm(item);
          await IVStorage.bumpStats({ resisted: 1 });
          return sendResponse({ ok: true, item });
        }

        // ---- Settings changed somewhere → re-sync registration ----
        case 'SETTINGS_CHANGED': {
          await syncContentScripts();
          return sendResponse({ ok: true });
        }

        // ---- Pages can ask us to (re)register content scripts ----
        case 'SYNC_CONTENT_SCRIPTS': {
          await syncContentScripts();
          return sendResponse({ ok: true });
        }

        // ---- Force a profile rebuild (used by dashboard refresh) ----
        case 'REBUILD_PROFILE': {
          const profile = await rebuildProfile();
          return sendResponse({ ok: true, profile });
        }

        // ---- Pro / billing ----
        case 'GET_PRO': {
          const status = await IVPro.getStatus();
          return sendResponse({ ok: true, status, stub: !!self.__EXTPAY_STUB__ });
        }
        case 'REFRESH_PRO': {
          await syncPro();
          const status = await IVPro.getStatus();
          return sendResponse({ ok: true, status, stub: !!self.__EXTPAY_STUB__ });
        }
        case 'OPEN_PAYMENT': {
          // ExtPay opens hosted Stripe checkout (from the real library).
          try { if (extpay) extpay.openPaymentPage(); } catch (_) {}
          return sendResponse({ ok: true, stub: !!self.__EXTPAY_STUB__ });
        }
        case 'OPEN_TRIAL': {
          try { if (extpay) extpay.openTrialPage(msg.period || undefined); } catch (_) {}
          return sendResponse({ ok: true, stub: !!self.__EXTPAY_STUB__ });
        }
        case 'SET_DEV_PRO': {
          // Local-only preview of Pro features (NOT a real payment).
          const status = await IVPro.setStatus({ devOverride: !!msg.on });
          return sendResponse({ ok: true, status });
        }

        default:
          return sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (err) {
      console.warn('[IMPULSE VAULT] message handler error:', err);
      try {
        sendResponse({ ok: false, error: String(err) });
      } catch (_) {}
    }
  })();

  return true; // keep the message channel open for the async response
});

/**
 * Compose the human-facing intervention content (Korean copy) based on
 * tier + the local profile. Pure data; the overlay renders it.
 */
function buildInterventionPayload(tier, result, settings, profile, viewRec, similar, msg) {
  const price = msg.price || (viewRec && viewRec.price) || 0;

  // Cost reframing.
  const wage = settings.hourlyWage || 0;
  const hoursOfWork = wage > 0 && price > 0 ? price / wage : 0;
  const gamePrice = settings.gamePrice || 0;
  const gameUnits = gamePrice > 0 && price > 0 ? price / gamePrice : 0;

  // Reflection questions (rotate a couple based on tier).
  const reflectionPool = [
    IVI18n.pick('Will I still be using this in 30 days?', '30일 뒤에도 이걸 쓰고 있을까?'),
    IVI18n.pick('Do I already have something similar at home?', '이미 비슷한 게 집에 있지 않아?'),
    IVI18n.pick('Is there a real reason I need to buy this right now?', '지금 당장 사야 하는 진짜 이유가 있어?'),
    IVI18n.pick('What actually happens if I don’t buy this?', '이거 안 사면 무슨 일이 생겨?'),
    IVI18n.pick('Would this be just as good if I bought it a week from now?', '일주일 뒤에 사도 똑같이 좋을까?'),
  ];
  const questions =
    tier === 'high'
      ? reflectionPool.slice(0, 3)
      : reflectionPool.slice(0, 2);

  // Personalized insight from the profile (high tier only).
  let insight = '';
  let futureMessage = '';
  if (tier === 'high') {
    const hour = new Date().getHours();
    const mm = String(new Date().getMinutes()).padStart(2, '0');
    if (profile && profile.hasHourSignal && Math.abs(profile.peakHour - hour) <= 1) {
      insight = IVI18n.pick(
        `You usually shop on impulse around ${profile.peakHour}:00. It’s ${hour}:${mm} right now.`,
        `넌 보통 ${profile.peakHour}시쯤 충동구매를 해. 지금 ${hour}:${mm}이야.`
      );
    } else if (IVPatterns.isLateNight(hour)) {
      insight = IVI18n.pick(
        `It’s ${hour}:${mm}. Ever regretted a late-night buy the next morning?`,
        `지금 ${hour}:${mm}. 밤에 산 물건, 아침에 후회한 적 없어?`
      );
    } else if ((viewRec && viewRec.count >= 3) || similar >= 3) {
      const n = Math.max((viewRec && viewRec.count) || 0, similar);
      insight = IVI18n.pick(
        `You’ve looked at something like this ${n} times now. It’s clearly tempting — all the more reason to slow down.`,
        `이번에 비슷한 걸 ${n}번이나 봤어. 진짜 끌리나 봐 — 그래서 더 천천히.`
      );
    } else if (price > 0 && gameUnits >= 1) {
      insight = IVI18n.pick(
        `This is the price of ${gameUnits.toFixed(1)} of the things you save up for.`,
        `이 돈이면 네가 아끼는 것 ${gameUnits.toFixed(1)}개야.`
      );
    }
    futureMessage = IVI18n.pick(
      'Future you: "I’m glad I passed on that. I put the money toward something better." 🙂',
      '미래의 내가: "그때 안 사길 잘했어. 그 돈 더 좋은 데 썼잖아." 🙂'
    );
  }

  return {
    tier,
    title:
      tier === 'high'
        ? IVI18n.pick('Hold on — do you really need this?', '잠깐, 이거 진짜 필요해?')
        : tier === 'medium'
        ? IVI18n.pick('Do you really need this? 🤔', '이거 진짜 필요해? 🤔')
        : IVI18n.pick('Do you really need this? 🤔', '이거 진짜 필요해? 🤔'),
    name: msg.name || IVI18n.pick('this item', '이 상품'),
    price,
    questions,
    insight,
    futureMessage,
    reframing: {
      hoursOfWork: Number(hoursOfWork.toFixed(1)),
      gameUnits: Number(gameUnits.toFixed(1)),
      wage,
      gamePrice,
    },
    thinkingSeconds: IVPatterns.thinkingSeconds(tier, settings.strictness),
    coolingHours: settings.coolingHours || 24,
    reasons: result.reasons,
    score: result.score,
  };
}
