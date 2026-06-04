/* ============================================================
 * IMPULSE VAULT — utils/patterns.js
 * ------------------------------------------------------------
 * Pure functions that turn raw on-device events into a local
 * "impulse profile", plus the logic that scores how strong a
 * given purchase signal is. No storage, no network — just math
 * over arrays you pass in. This keeps it easy to reason about
 * and trivially testable.
 *
 * Loaded as a classic script in the service worker and in
 * extension pages; attaches to the global as IVPatterns.
 * ============================================================ */

(function (global) {
  'use strict';

  // Cheap-and-cheerful keyword normalization for similarity checks.
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim();
  }

  // Token-overlap (Jaccard) similarity between two search strings.
  // Good enough to catch "에어팟 프로" vs "에어팟 프로 2세대".
  function similarity(a, b) {
    const ta = new Set(normalize(a).split(' ').filter(Boolean));
    const tb = new Set(normalize(b).split(' ').filter(Boolean));
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    return inter / union;
  }

  // Count how many recent searches are "similar" to a given keyword.
  function similarSearchCount(searches, keyword, withinMs) {
    const now = Date.now();
    let count = 0;
    for (const s of searches) {
      if (withinMs && now - s.ts > withinMs) continue;
      if (similarity(s.keyword, keyword) >= 0.5) count++;
    }
    return count;
  }

  /**
   * Build the aggregate impulse profile from raw events + searches.
   * events: [{ts, type, price, site, category, keyword}]
   * Returns a plain object safe to persist to chrome.storage.
   */
  function buildProfile(events, searches, stats) {
    const byHour = new Array(24).fill(0);
    const byWeekday = new Array(7).fill(0); // 0 = Sunday
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
      if (e.category)
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      if (typeof e.price === 'number' && e.price > 0) {
        intendedTotal += e.price;
        intendedN += 1;
      }
    }

    for (const s of searches || []) {
      const k = normalize(s.keyword);
      if (k) keywordCounts[k] = (keywordCounts[k] || 0) + 1;
    }

    const peakHour = byHour.reduce(
      (best, v, i) => (v > byHour[best] ? i : best),
      0
    );
    const peakWeekday = byWeekday.reduce(
      (best, v, i) => (v > byWeekday[best] ? i : best),
      0
    );

    const resisted = (stats && stats.resisted) || 0;
    const proceeded = (stats && stats.proceeded) || 0;
    const decisions = resisted + proceeded;
    const resistRate = decisions > 0 ? resisted / decisions : 0;

    return {
      updatedAt: Date.now(),
      byHour,
      byWeekday,
      peakHour,
      peakWeekday,
      hasHourSignal: byHour[peakHour] >= 3,
      topSites: topEntries(siteCounts, 5),
      topKeywords: topEntries(keywordCounts, 8),
      topCategories: topEntries(categoryCounts, 5),
      avgSpend: intendedN > 0 ? Math.round(intendedTotal / intendedN) : 0,
      intendedTotal,
      resistRate,
    };
  }

  function topEntries(obj, n) {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, value]) => ({ key, value }));
  }

  // Is `hour` within a "late night" window (used for personalized insight)?
  function isLateNight(hour) {
    return hour >= 23 || hour <= 3;
  }

  /**
   * Score the current purchase signal from 0..100 and pick a tier.
   * Inputs are intentionally simple so the content script can call this
   * with whatever it managed to detect (all fields optional).
   *
   *   ctx = {
   *     price,            // detected price (KRW), 0 if unknown
   *     viewCount,        // how many times this product was viewed
   *     similarSearches,  // recent similar search count
   *     hour,             // current hour 0..23
   *     profile,          // the persisted impulse profile (or null)
   *     strictness,       // 'gentle' | 'balanced' | 'strict'
   *     gamePrice,        // reference "valued item" price
   *   }
   *
   * Returns { score, tier: 'low'|'medium'|'high', reasons: [...] }
   */
  function scoreSignal(ctx) {
    const c = ctx || {};
    let score = 0;
    const reasons = [];

    // 1) Price weight — relative to something the user values.
    const gamePrice = c.gamePrice || 60000;
    const price = c.price || 0;
    if (price > 0) {
      const ratio = price / gamePrice;
      if (ratio >= 2) {
        score += 40;
        reasons.push('high_price');
      } else if (ratio >= 1) {
        score += 28;
        reasons.push('notable_price');
      } else if (ratio >= 0.4) {
        score += 16;
      } else {
        score += 6;
      }
    }

    // 2) Repeat-view weight — strong impulse tell.
    const views = c.viewCount || 0;
    if (views >= 4) {
      score += 28;
      reasons.push('repeat_views');
    } else if (views >= 2) {
      score += 16;
      reasons.push('viewed_again');
    }

    // 3) Repeated similar searches.
    const sims = c.similarSearches || 0;
    if (sims >= 3) {
      score += 20;
      reasons.push('repeat_searches');
    } else if (sims >= 2) {
      score += 10;
    }

    // 4) Time-of-day: matches the user's known late-night impulse window.
    const hour = typeof c.hour === 'number' ? c.hour : new Date().getHours();
    const profile = c.profile;
    if (profile && profile.hasHourSignal && Math.abs(profile.peakHour - hour) <= 1) {
      score += 14;
      reasons.push('matches_time_pattern');
    } else if (isLateNight(hour)) {
      score += 8;
      reasons.push('late_night');
    }

    // 5) Strictness raises the baseline sensitivity.
    if (c.strictness === 'strict') score += 12;
    else if (c.strictness === 'gentle') score -= 10;

    score = Math.max(0, Math.min(100, score));

    // Thresholds shift with strictness so "strict" trips the modal sooner.
    let medThreshold = 30;
    let highThreshold = 60;
    if (c.strictness === 'strict') {
      medThreshold = 20;
      highThreshold = 50;
    } else if (c.strictness === 'gentle') {
      medThreshold = 40;
      highThreshold = 70;
    }

    let tier = 'low';
    if (score >= highThreshold) tier = 'high';
    else if (score >= medThreshold) tier = 'medium';

    return { score, tier, reasons };
  }

  // The "thinking timer" length (seconds) before the proceed button enables.
  function thinkingSeconds(tier, strictness) {
    const base = { low: 0, medium: 20, high: 40 }[tier] || 0;
    const mult = strictness === 'strict' ? 1.5 : strictness === 'gentle' ? 0.6 : 1;
    return Math.round(base * mult);
  }

  // Decide the FINAL intervention tier from the raw score tier + options.
  //  - alwaysAsk: force at least a blocking modal on every buy click.
  //  - otherwise apply the frequency cap (downgrade to a passive toast).
  function finalizeTier(tier, opts) {
    const o = opts || {};
    if (o.alwaysAsk) return tier === 'high' ? 'high' : 'medium';
    if ((tier === 'medium' || tier === 'high') && (o.recentCount || 0) >= (o.freqCap || 3)) {
      return 'low';
    }
    return tier;
  }

  const API = {
    normalize,
    similarity,
    similarSearchCount,
    buildProfile,
    isLateNight,
    scoreSignal,
    thinkingSeconds,
    finalizeTier,
  };

  global.IVPatterns = API;
})(typeof self !== 'undefined' ? self : this);
