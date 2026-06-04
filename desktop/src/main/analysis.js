/* ============================================================
 * IMPULSE VAULT desktop — analysis.js
 * ------------------------------------------------------------
 * The pattern-analysis + signal-scoring brain, ported from the
 * extension's utils/patterns.js so the DESKTOP APP now owns the
 * decision logic centrally. Pure functions over plain data —
 * no storage, no network.
 * ============================================================ */

'use strict';

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

function similarity(a, b) {
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function similarSearchCount(searches, keyword, withinMs) {
  const now = Date.now();
  let count = 0;
  for (const s of searches) {
    if (withinMs && now - s.ts > withinMs) continue;
    if (similarity(s.keyword, keyword) >= 0.5) count++;
  }
  return count;
}

function topEntries(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, value }));
}

function buildProfile(events, searches, stats) {
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const siteCounts = {};
  const keywordCounts = {};
  const categoryCounts = {};
  let intendedTotal = 0;
  let intendedN = 0;

  for (const e of events || []) {
    const d = new Date(e.ts);
    byHour[d.getHours()] += 1;
    byWeekday[d.getDay()] += 1;
    if (e.site) siteCounts[e.site] = (siteCounts[e.site] || 0) + 1;
    if (e.category) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    if (typeof e.price === 'number' && e.price > 0) {
      intendedTotal += e.price;
      intendedN += 1;
    }
  }
  for (const s of searches || []) {
    const k = normalize(s.keyword);
    if (k) keywordCounts[k] = (keywordCounts[k] || 0) + 1;
  }

  const peakHour = byHour.reduce((best, v, i) => (v > byHour[best] ? i : best), 0);
  const peakWeekday = byWeekday.reduce((best, v, i) => (v > byWeekday[best] ? i : best), 0);
  const resisted = (stats && stats.resisted) || 0;
  const proceeded = (stats && stats.proceeded) || 0;
  const decisions = resisted + proceeded;

  return {
    updatedAt: Date.now(),
    byHour, byWeekday, peakHour, peakWeekday,
    hasHourSignal: byHour[peakHour] >= 3,
    topSites: topEntries(siteCounts, 5),
    topKeywords: topEntries(keywordCounts, 8),
    topCategories: topEntries(categoryCounts, 5),
    avgSpend: intendedN > 0 ? Math.round(intendedTotal / intendedN) : 0,
    intendedTotal,
    resistRate: decisions > 0 ? resisted / decisions : 0,
  };
}

function isLateNight(hour) {
  return hour >= 23 || hour <= 3;
}

function scoreSignal(ctx) {
  const c = ctx || {};
  let score = 0;
  const reasons = [];
  const gamePrice = c.gamePrice || 60000;
  const price = c.price || 0;

  if (price > 0) {
    const ratio = price / gamePrice;
    if (ratio >= 2) { score += 40; reasons.push('high_price'); }
    else if (ratio >= 1) { score += 28; reasons.push('notable_price'); }
    else if (ratio >= 0.4) { score += 16; }
    else { score += 6; }
  }

  const views = c.viewCount || 0;
  if (views >= 4) { score += 28; reasons.push('repeat_views'); }
  else if (views >= 2) { score += 16; reasons.push('viewed_again'); }

  const sims = c.similarSearches || 0;
  if (sims >= 3) { score += 20; reasons.push('repeat_searches'); }
  else if (sims >= 2) { score += 10; }

  const hour = typeof c.hour === 'number' ? c.hour : new Date().getHours();
  const profile = c.profile;
  if (profile && profile.hasHourSignal && Math.abs(profile.peakHour - hour) <= 1) {
    score += 14; reasons.push('matches_time_pattern');
  } else if (isLateNight(hour)) {
    score += 8; reasons.push('late_night');
  }

  if (c.strictness === 'strict') score += 12;
  else if (c.strictness === 'gentle') score -= 10;

  score = Math.max(0, Math.min(100, score));

  let medThreshold = 30, highThreshold = 60;
  if (c.strictness === 'strict') { medThreshold = 20; highThreshold = 50; }
  else if (c.strictness === 'gentle') { medThreshold = 40; highThreshold = 70; }

  let tier = 'low';
  if (score >= highThreshold) tier = 'high';
  else if (score >= medThreshold) tier = 'medium';

  return { score, tier, reasons };
}

function thinkingSeconds(tier, strictness) {
  const base = { low: 0, medium: 20, high: 40 }[tier] || 0;
  const mult = strictness === 'strict' ? 1.5 : strictness === 'gentle' ? 0.6 : 1;
  return Math.round(base * mult);
}

// ---- Buy-text classification (kept in sync with the extension) ----
// STRONG: clearly spending money → always a purchase.
// WEAK:   ambiguous (구독/시작하기/subscribe) → purchase only if a price shows.
// EXCLUDE: login / signup / search / nav → NEVER a purchase. This is the
// fix for "the nudge appeared while I was just logging in".
const STRONG_BUY = [
  '결제', '결제하기', '결제 진행', '바로결제', '구매', '구매하기', '바로구매', '바로 구매',
  '주문', '주문하기', '장바구니', '담기', '카트',
  'buy now', 'buy it now', 'checkout', 'check out', 'place order', 'order now',
  'proceed to checkout', 'proceed to payment', 'continue to payment',
  'complete purchase', 'complete order', 'confirm order', 'pay now', 'pay ',
  'add to cart', 'add to bag', 'add to basket',
];
const WEAK_BUY = [
  '구독', '구독하기', '멤버십', '업그레이드', '플랜', '예약', '대여',
  'subscribe', 'upgrade', 'choose plan', 'select plan', 'get plan', 'buy plan',
  'membership', 'start free', 'get started', 'start now', 'book now', 'reserve',
  'enroll', '시작하기', '무료로 시작', '신청하기',
];
const EXCLUDE_BUY = [
  '로그인', '로그인하기', 'login', 'log in', 'sign in', 'signin', '로그아웃', 'logout',
  '회원가입', 'sign up', 'signup', 'register', '가입', '아이디', '비밀번호', 'password',
  '검색', 'search', '취소', 'cancel', '닫기', 'close', '뒤로', 'back', '더보기',
  '찜', '관심', 'wishlist', '공유', 'share', '문의', '고객센터', '메뉴', 'menu',
  '필터', 'filter', '정렬', 'sort', '쿠폰', '적립',
  // downloads / file & save actions — never a purchase
  '다운로드', '다운받기', '내려받기', '받기', 'download', '설치', 'install',
  '저장', 'save', '내보내기', 'export', '첨부', 'attachment', 'pdf', 'csv',
];

function classifyBuyText(text) {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40) return 'none';
  for (const k of STRONG_BUY) if (t.indexOf(k) !== -1) return 'strong';
  for (const k of EXCLUDE_BUY) if (t.indexOf(k) !== -1) return 'none';
  for (const k of WEAK_BUY) if (t.indexOf(k) !== -1) return 'weak';
  return 'none';
}

/**
 * Compose the human-facing intervention payload (Korean copy) — the same
 * shape the extension overlay expects, so the app can drive it remotely.
 */
function buildInterventionPayload(tier, result, settings, profile, viewRec, similar, evt) {
  const price = evt.price || (viewRec && viewRec.price) || 0;
  const wage = settings.hourlyWage || 0;
  const hoursOfWork = wage > 0 && price > 0 ? price / wage : 0;
  const gamePrice = settings.gamePrice || 0;
  const gameUnits = gamePrice > 0 && price > 0 ? price / gamePrice : 0;

  const reflectionPool = [
    '30일 뒤에도 이걸 쓰고 있을까?',
    '이미 비슷한 게 집에 있지 않아?',
    '지금 당장 사야 하는 진짜 이유가 있어?',
    '이거 안 사면 무슨 일이 생겨?',
    '일주일 뒤에 사도 똑같이 좋을까?',
  ];
  const questions = tier === 'high' ? reflectionPool.slice(0, 3) : reflectionPool.slice(0, 2);

  let insight = '';
  let futureMessage = '';
  if (tier === 'high') {
    const hour = new Date().getHours();
    const mm = String(new Date().getMinutes()).padStart(2, '0');
    if (profile && profile.hasHourSignal && Math.abs(profile.peakHour - hour) <= 1) {
      insight = `넌 보통 ${profile.peakHour}시쯤 충동구매를 해. 지금 ${hour}:${mm}이야.`;
    } else if (isLateNight(hour)) {
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
    title: tier === 'high' ? '잠깐, 이거 진짜 필요해?' : '이거 진짜 필요해? 🤔',
    name: evt.name || '이 상품',
    price,
    questions,
    insight,
    futureMessage,
    reframing: {
      hoursOfWork: Number(hoursOfWork.toFixed(1)),
      gameUnits: Number(gameUnits.toFixed(1)),
      wage, gamePrice,
    },
    thinkingSeconds: thinkingSeconds(tier, settings.strictness),
    coolingHours: settings.coolingHours || 24,
    reasons: result.reasons,
    score: result.score,
  };
}

module.exports = {
  normalize, similarity, similarSearchCount, buildProfile,
  isLateNight, scoreSignal, thinkingSeconds, buildInterventionPayload,
  classifyBuyText,
};
