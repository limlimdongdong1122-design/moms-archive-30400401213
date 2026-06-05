/* ============================================================
 * PRICE SCOUT — utils/price.js
 * ------------------------------------------------------------
 * Pure price math. NO DOM, NO storage, NO network — just functions
 * over numbers and arrays. This is the brain of the product and the
 * only part with unit tests (test/run.cjs), because it's what
 * decides "did the price move, by how much, and is that good or bad
 * for the seller?".
 *
 * Loaded as a classic script in the service worker, the content
 * script, and extension pages; attaches to the global as PSPrice.
 * ============================================================ */
(function (global) {
  'use strict';

  /**
   * Parse a human price string into an integer KRW amount.
   * Handles "29,900원", "₩29,900", "1,299,000", "$24" (→ 24), "  39900 ".
   * KRW has no decimal places, so we keep it integer: every non-digit is
   * a separator. Returns 0 when nothing price-like is found.
   */
  function parsePrice(input) {
    if (input == null) return 0;
    if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : 0;
    const text = String(input);
    // First run that starts with a digit and may contain separators.
    const m = text.match(/\d[\d.,\s]*\d|\d/);
    if (!m) return 0;
    const digits = m[0].replace(/[^\d]/g, '');
    if (!digits) return 0;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : 0;
  }

  /** Format an amount with a currency symbol and locale grouping. */
  function formatPrice(n, currency) {
    const c = currency || '₩';
    const v = Math.round(Number(n) || 0);
    try {
      return c + v.toLocaleString('ko-KR');
    } catch (_) {
      return c + String(v);
    }
  }

  /** Percentage change from old → new (rounded to 1 decimal). 0 if old is 0. */
  function pctChange(oldP, newP) {
    const o = Number(oldP) || 0;
    const n = Number(newP) || 0;
    if (o === 0) return 0;
    return Math.round(((n - o) / o) * 1000) / 10;
  }

  /**
   * Summarize a price history into headline numbers.
   * history: [{ ts, price }] (oldest → newest). Tolerates empty/bad input.
   * Returns { current, first, lowest, highest, count, changedPct }.
   */
  function summarize(history) {
    const h = (history || []).filter((p) => p && typeof p.price === 'number' && p.price > 0);
    if (!h.length) {
      return { current: 0, first: 0, lowest: 0, highest: 0, count: 0, changedPct: 0 };
    }
    let lowest = Infinity, highest = -Infinity;
    for (const p of h) {
      if (p.price < lowest) lowest = p.price;
      if (p.price > highest) highest = p.price;
    }
    const first = h[0].price;
    const current = h[h.length - 1].price;
    return {
      current,
      first,
      lowest,
      highest,
      count: h.length,
      changedPct: pctChange(first, current),
    };
  }

  /**
   * Classify a price move from the SELLER's point of view.
   *   competitor price DOWN → 'threat'      (they're undercutting you)
   *   competitor price UP   → 'opportunity' (room to win on price / raise yours)
   *   no change             → 'neutral'
   * Returns { dir: 'up'|'down'|'same', kind, pct } (pct is signed).
   */
  function classifyForSeller(prevPrice, currPrice) {
    const prev = Number(prevPrice) || 0;
    const curr = Number(currPrice) || 0;
    const pct = pctChange(prev, curr);
    if (prev === 0 || curr === prev) return { dir: 'same', kind: 'neutral', pct: 0 };
    if (curr < prev) return { dir: 'down', kind: 'threat', pct };
    return { dir: 'up', kind: 'opportunity', pct };
  }

  /**
   * Compare a competitor's price against MY price.
   * Returns { status: 'cheaper'|'pricier'|'equal'|'unknown', diff, pct }.
   *   'cheaper' = competitor is cheaper than me (I'm losing on price).
   */
  function vsMyPrice(myPrice, competitorPrice) {
    const mine = Number(myPrice) || 0;
    const comp = Number(competitorPrice) || 0;
    if (!mine || !comp) return { status: 'unknown', diff: 0, pct: 0 };
    const diff = comp - mine;
    const pct = pctChange(mine, comp);
    if (comp < mine) return { status: 'cheaper', diff, pct };
    if (comp > mine) return { status: 'pricier', diff, pct };
    return { status: 'equal', diff: 0, pct: 0 };
  }

  /**
   * Build an SVG polyline for a price sparkline.
   * history: [{ ts, price }]; w/h/pad in px. Returns { points, min, max, flat }.
   * A flat (single value) series renders a centered horizontal line.
   */
  function sparkline(history, w, h, pad) {
    const width = w || 120, height = h || 32, p = pad == null ? 3 : pad;
    const vals = (history || [])
      .filter((d) => d && typeof d.price === 'number' && d.price > 0)
      .map((d) => d.price);
    if (!vals.length) return { points: '', min: 0, max: 0, flat: true };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;
    const innerW = Math.max(1, width - p * 2);
    const innerH = Math.max(1, height - p * 2);
    const step = vals.length > 1 ? innerW / (vals.length - 1) : 0;
    const pts = vals.map((v, i) => {
      const x = p + (vals.length > 1 ? i * step : innerW / 2);
      // higher price → higher on screen (smaller y)
      const y = span === 0 ? height / 2 : p + innerH - ((v - min) / span) * innerH;
      return Math.round(x * 10) / 10 + ',' + Math.round(y * 10) / 10;
    });
    return { points: pts.join(' '), min, max, flat: span === 0 };
  }

  /** Append a price point to a history array, de-duplicating same-price/same-day
   *  noise and capping length. Returns a NEW array (pure). */
  function appendPoint(history, price, ts, cap) {
    const limit = cap || 180;
    const h = Array.isArray(history) ? history.slice() : [];
    const p = Math.round(Number(price) || 0);
    if (p <= 0) return h;
    const t = ts || Date.now();
    const last = h[h.length - 1];
    // Skip if identical to the last recorded price (no movement to chart).
    if (last && last.price === p) {
      last.ts = t; // just refresh the timestamp
      return h;
    }
    h.push({ ts: t, price: p });
    if (h.length > limit) h.splice(0, h.length - limit);
    return h;
  }

  const API = {
    parsePrice,
    formatPrice,
    pctChange,
    summarize,
    classifyForSeller,
    vsMyPrice,
    sparkline,
    appendPoint,
  };

  global.PSPrice = API;
})(typeof self !== 'undefined' ? self : this);
