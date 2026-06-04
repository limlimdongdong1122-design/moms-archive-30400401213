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

importScripts('utils/storage.js', 'utils/patterns.js', 'utils/analysis.js');

const CONTENT_SCRIPT_ID = 'iv-dynamic-content';
const CONTENT_FILES = {
  js: ['utils/storage.js', 'content/detector.js', 'content/overlay.js'],
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
});

chrome.runtime.onStartup.addListener(syncContentScripts);

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
  const prompt = IVAnalysis.buildAiPrompt(details);
  // Helper: extract a short human-readable error from a failed API response.
  async function errText(res) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    let msg = body;
    try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error.type)) || body; } catch (_) {}
    return 'HTTP ' + res.status + (msg ? ' · ' + String(msg).slice(0, 180) : '');
  }

  if (settings.aiProvider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.aiKey },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error('OpenAI ' + (await errText(res)));
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message.content) || '';
  }
  // default: Claude (Anthropic)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.aiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.aiModel || 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic ' + (await errText(res)));
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
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
  try {
    chrome.notifications &&
      chrome.notifications.create(alarm.name, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '금고가 열렸어요 🔓',
        message: `"${item.item}" 식었어. 이제 결정할 시간 — 살래, 보낼래?`,
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

          // Respect global pause / snooze immediately.
          const now = Date.now();
          if (settings.paused)
            return sendResponse({ ok: true, tier: 'none', reason: 'paused' });
          if (settings.snoozeUntil && now < settings.snoozeUntil)
            return sendResponse({ ok: true, tier: 'none', reason: 'snoozed' });

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

          // Frequency cap: if we've already shown too many blocking modals
          // this hour, downgrade to a passive toast instead.
          const FREQ_CAP = settings.strictness === 'strict' ? 6 : 3;
          const recentCount = await IVStorage.interventionsInLastHour();
          let tier = result.tier;
          if ((tier === 'medium' || tier === 'high') && recentCount >= FREQ_CAP) {
            tier = 'low';
            result.reasons.push('freq_capped');
          }

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
            payload.aiEnabled = !!(settings.aiEnabled && settings.aiKey);
            payload.webSearchEnabled = !!settings.webSearchEnabled;
            payload.productName = msg.name;
            // Grounded data the overlay passes back for optional AI enrichment.
            if (payload.aiEnabled) {
              const det = msg.details || {};
              payload.aiDetails = {
                name: msg.name,
                price: msg.price || (viewRec && viewRec.price) || 0,
                itemType: det.itemType || 'product',
                rating: det.rating,
                reviewCount: det.reviewCount,
                specs: det.specs || [],
                reviews: det.reviews || [],
              };
            }
          }

          if (tier === 'medium' || tier === 'high') {
            await IVStorage.logIntervention(now);
            await IVStorage.bumpStats({ interventions: 1 });
          }

          return sendResponse({ ok: true, tier, payload, score: result.score });
        }

        // ---- Optional BYOK AI enrichment for the scorecard ----
        case 'ANALYZE_AI': {
          const settings = await IVStorage.getSettings();
          if (!settings.aiEnabled || !settings.aiKey) {
            return sendResponse({ ok: false, error: 'ai_disabled' });
          }
          try {
            const text = await callAiProvider(settings, msg.details || {});
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
    '30일 뒤에도 이걸 쓰고 있을까?',
    '이미 비슷한 게 집에 있지 않아?',
    '지금 당장 사야 하는 진짜 이유가 있어?',
    '이거 안 사면 무슨 일이 생겨?',
    '일주일 뒤에 사도 똑같이 좋을까?',
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
      insight = `넌 보통 ${profile.peakHour}시쯤 충동구매를 해. 지금 ${hour}:${mm}이야.`;
    } else if (IVPatterns.isLateNight(hour)) {
      insight = `지금 ${hour}:${mm}. 밤에 산 물건, 아침에 후회한 적 없어?`;
    } else if ((viewRec && viewRec.count >= 3) || similar >= 3) {
      const n = Math.max((viewRec && viewRec.count) || 0, similar);
      insight = `이번에 비슷한 걸 ${n}번이나 봤어. 진짜 끌리나 봐 — 그래서 더 천천히.`;
    } else if (price > 0 && gameUnits >= 1) {
      insight = `이 돈이면 네가 아끼는 것 ${gameUnits.toFixed(1)}개야.`;
    }
    futureMessage = '미래의 내가: "그때 안 사길 잘했어. 그 돈 더 좋은 데 썼잖아." 🙂';
  }

  return {
    tier,
    title:
      tier === 'high'
        ? '잠깐, 이거 진짜 필요해?'
        : tier === 'medium'
        ? '이거 진짜 필요해? 🤔'
        : '이거 진짜 필요해? 🤔',
    name: msg.name || '이 상품',
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
