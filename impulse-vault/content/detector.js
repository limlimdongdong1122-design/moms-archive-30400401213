/* ============================================================
 * IMPULSE VAULT — content/detector.js
 * ------------------------------------------------------------
 * The intent-detection engine that runs inside shopping/search
 * pages. It does FOUR things, all best-effort and fully defensive
 * (it must NEVER throw into the host page):
 *
 *   1) Search-query tracking — parse the query from search results.
 *   2) Product-page detection — schema.org JSON-LD + per-site
 *      adapters + generic heuristics.
 *   3) Repeat-view detection — record each product view; the
 *      background tallies counts across hours/days.
 *   4) Buy-button interception — a CAPTURE-phase listener at the
 *      document level intercepts the genuine high-intent click,
 *      shows the intervention, then either lets the original
 *      action proceed or cancels it.
 *
 * Architecture: a generic schema.org detector is the fallback,
 * with specific adapters for Coupang, Naver and Amazon. Adding a
 * new adapter is just pushing one object into ADAPTERS.
 *
 * IMPORTANT: on-site detection is inherently brittle. Selectors
 * change; sites differ. Everything here degrades silently.
 * ============================================================ */

(function () {
  'use strict';

  // Guard against double-injection (dynamic + any static registration).
  if (window.__IV_DETECTOR_LOADED__) return;
  window.__IV_DETECTOR_LOADED__ = true;

  // -------- tiny safe helpers --------
  const log = (...a) => {
    /* comment out to silence */ console.debug('[IV detector]', ...a);
  };
  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }
  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          // Swallow "receiving end does not exist" etc.
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  // Parse a price out of arbitrary text like "₩1,299,000" or "$24.99".
  function parsePrice(text) {
    if (!text) return 0;
    const t = String(text).replace(/[^\d.,]/g, '');
    if (!t) return 0;
    // If it looks like "1,299,000" (KRW, comma thousands, no decimal cents)
    // strip commas. If "24.99" keep the dot. Heuristic but adequate.
    let cleaned;
    if (/,\d{3}(\D|$)/.test(t) || !t.includes('.')) {
      cleaned = t.replace(/,/g, '');
    } else {
      cleaned = t.replace(/,/g, '');
    }
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function currentDomain() {
    return safe(() => location.hostname.replace(/^www\./, ''), '');
  }

  // Build a stable product key from URL (ignore tracking params).
  function productKeyFromUrl(idHint) {
    const host = currentDomain();
    if (idHint) return host + '#' + idHint;
    const path = safe(() => location.pathname, location.href);
    return host + path;
  }

  // ========================================================
  // SCHEMA.ORG generic extractor (fallback for any site)
  // ========================================================
  function readJsonLdProducts() {
    const out = [];
    const nodes = safe(
      () => document.querySelectorAll('script[type="application/ld+json"]'),
      []
    );
    nodes.forEach((node) => {
      const data = safe(() => JSON.parse(node.textContent), null);
      if (!data) return;
      const arr = Array.isArray(data) ? data : data['@graph'] || [data];
      arr.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const type = entry['@type'];
        const isProduct =
          type === 'Product' ||
          (Array.isArray(type) && type.includes('Product'));
        if (!isProduct) return;
        const offers = Array.isArray(entry.offers)
          ? entry.offers[0]
          : entry.offers || {};
        const price = parsePrice(offers && (offers.price || offers.lowPrice));
        out.push({
          name: entry.name || '',
          price,
          category: entry.category || '',
        });
      });
    });
    return out;
  }

  // Generic buy-button finder by visible text + roles.
  const BUY_TEXTS = [
    '장바구니',
    '구매하기',
    '바로구매',
    '바로 구매',
    '구매',
    '결제',
    '주문하기',
    'add to cart',
    'add to bag',
    'buy now',
    'buy it now',
    'checkout',
    'place order',
    'proceed to checkout',
  ];
  function looksLikeBuyButton(el) {
    const txt = safe(() => (el.innerText || el.textContent || '').trim().toLowerCase(), '');
    if (!txt || txt.length > 40) return false;
    return BUY_TEXTS.some((t) => txt.includes(t));
  }
  function genericFindBuyButtons() {
    const candidates = safe(
      () =>
        Array.from(
          document.querySelectorAll(
            'button, a, input[type="submit"], [role="button"], [class*="cart" i], [class*="buy" i], [id*="buy" i]'
          )
        ),
      []
    );
    return candidates.filter(looksLikeBuyButton).slice(0, 12);
  }

  // ========================================================
  // PER-SITE ADAPTERS
  // Each adapter is best-effort; missing pieces fall back to generic.
  // ========================================================
  const ADAPTERS = [
    // -------- Coupang --------
    {
      name: 'coupang',
      match: (host) => /coupang\.com$/.test(host),
      parseSearch: (url) => {
        const q = url.searchParams.get('q') || url.searchParams.get('keyword');
        return q ? { keyword: q } : null;
      },
      isProductPage: () => /\/vp\/products\//.test(location.pathname),
      extractProduct: () => {
        const idMatch = location.pathname.match(/products\/(\d+)/);
        const name = safe(
          () => document.querySelector('.prod-buy-header__title')?.innerText,
          ''
        );
        const priceEl = safe(
          () =>
            document.querySelector(
              '.total-price strong, .prod-price .total-price, .prod-sale-price'
            ),
          null
        );
        return {
          key: productKeyFromUrl(idMatch && idMatch[1]),
          name,
          price: parsePrice(priceEl && priceEl.innerText),
        };
      },
      findBuyButtons: () => {
        const sels = [
          '.prod-buy .prod-cart-btn',
          '.prod-buy .prod-buy-btn',
          'button.prod-cart-btn',
          'button.prod-buy-btn',
        ];
        const found = [];
        sels.forEach((s) =>
          safe(() => document.querySelectorAll(s), []).forEach((e) => found.push(e))
        );
        return found.length ? found : genericFindBuyButtons();
      },
    },

    // -------- Naver (shopping / smartstore) --------
    {
      name: 'naver',
      match: (host) => /naver\.com$/.test(host),
      parseSearch: (url) => {
        const q = url.searchParams.get('query') || url.searchParams.get('q');
        return q ? { keyword: q } : null;
      },
      isProductPage: () =>
        /smartstore\.naver\.com/.test(location.hostname) &&
        /\/products\//.test(location.pathname),
      extractProduct: () => {
        const idMatch = location.pathname.match(/products\/(\d+)/);
        const name = safe(
          () =>
            document.querySelector('h3._22kNQuEXmb, ._22kNQuEXmb, h3[class*="title" i]')
              ?.innerText,
          document.title
        );
        const priceEl = safe(
          () =>
            document.querySelector(
              '._1LY7DqCnwR, span[class*="price" i] .blind, strong[class*="price" i]'
            ),
          null
        );
        return {
          key: productKeyFromUrl(idMatch && idMatch[1]),
          name,
          price: parsePrice(priceEl && priceEl.innerText),
        };
      },
      findBuyButtons: () => genericFindBuyButtons(),
    },

    // -------- Amazon --------
    {
      name: 'amazon',
      match: (host) => /amazon\.[a-z.]+$/.test(host),
      parseSearch: (url) => {
        const q = url.searchParams.get('k') || url.searchParams.get('field-keywords');
        return q ? { keyword: q } : null;
      },
      isProductPage: () => /\/(dp|gp\/product)\//.test(location.pathname),
      extractProduct: () => {
        const idMatch = location.pathname.match(/\/(?:dp|product)\/([A-Z0-9]{10})/);
        const name = safe(() => document.getElementById('productTitle')?.innerText, '');
        const whole = safe(
          () => document.querySelector('.a-price .a-price-whole')?.innerText,
          ''
        );
        const frac = safe(
          () => document.querySelector('.a-price .a-price-fraction')?.innerText,
          ''
        );
        let price = 0;
        if (whole) price = parsePrice(whole + (frac ? '.' + frac : ''));
        return {
          key: productKeyFromUrl(idMatch && idMatch[1]),
          name: (name || '').trim(),
          price,
        };
      },
      findBuyButtons: () => {
        const ids = ['#add-to-cart-button', '#buy-now-button', '#submit.add-to-cart'];
        const found = [];
        ids.forEach((s) =>
          safe(() => document.querySelectorAll(s), []).forEach((e) => found.push(e))
        );
        return found.length ? found : genericFindBuyButtons();
      },
    },
  ];

  // Generic fallback adapter — used on any other watched domain.
  const GENERIC_ADAPTER = {
    name: 'generic',
    match: () => true,
    parseSearch: (url) => {
      const q =
        url.searchParams.get('q') ||
        url.searchParams.get('query') ||
        url.searchParams.get('keyword') ||
        url.searchParams.get('k') ||
        url.searchParams.get('search');
      return q ? { keyword: q } : null;
    },
    isProductPage: () => readJsonLdProducts().length > 0,
    extractProduct: () => {
      const p = readJsonLdProducts()[0] || {};
      return {
        key: productKeyFromUrl(),
        name: p.name || document.title || '',
        price: p.price || 0,
        category: p.category || '',
      };
    },
    findBuyButtons: genericFindBuyButtons,
  };

  function pickAdapter(host) {
    return ADAPTERS.find((a) => safe(() => a.match(host), false)) || GENERIC_ADAPTER;
  }

  // ========================================================
  // MAIN — kicks off only after confirming the user opted in.
  // ========================================================
  async function main() {
    // The extension does NOTHING until onboarding granted permissions.
    const settings = await new Promise((resolve) => {
      try {
        IVStorage.getSettings().then(resolve, () => resolve(null));
      } catch (_) {
        resolve(null);
      }
    });
    if (!settings || !settings.granted || settings.paused) return;

    const host = currentDomain();
    const adapter = pickAdapter(host);
    log('active on', host, 'adapter:', adapter.name);

    // ---- 1) Search-query tracking ----
    safe(() => {
      const url = new URL(location.href);
      const parsed = adapter.parseSearch(url) || GENERIC_ADAPTER.parseSearch(url);
      if (parsed && parsed.keyword && parsed.keyword.length <= 80) {
        send({
          type: 'RECORD_SEARCH',
          keyword: parsed.keyword,
          site: host,
        });
      }
    });

    // ---- 2 & 3) Product-page detection + repeat-view recording ----
    let product = null;
    safe(() => {
      const isProduct =
        adapter.isProductPage() || GENERIC_ADAPTER.isProductPage();
      if (isProduct) {
        product = adapter.extractProduct() || GENERIC_ADAPTER.extractProduct();
        if (product && product.key) {
          send({
            type: 'RECORD_VIEW',
            key: product.key,
            name: product.name,
            price: product.price,
            url: location.href,
            site: host,
            category: product.category || '',
          });
        }
      }
    });

    // ---- 4) Buy-button interception (the high-intent moment) ----
    installBuyInterception(adapter, () => product, host);
  }

  // Elements the user has explicitly chosen to proceed through.
  const allowed = new WeakSet();
  // Re-entrancy guard so we don't show two overlays for one click.
  let handling = false;

  function tagBuyButtons(adapter) {
    safe(() => {
      const btns = adapter.findBuyButtons() || [];
      btns.forEach((b) => {
        if (b && b.setAttribute) b.setAttribute('data-iv-buy', '1');
      });
    });
  }

  function installBuyInterception(adapter, getProduct, host) {
    tagBuyButtons(adapter);

    // SPA sites mutate the DOM; re-tag on changes, throttled.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        tagBuyButtons(adapter);
      }, 800);
    });
    safe(() =>
      observer.observe(document.documentElement, { childList: true, subtree: true })
    );

    // Single capture-phase listener at the document — fires BEFORE the
    // site's own handlers, so we can truly gate the action.
    document.addEventListener(
      'click',
      function (e) {
        let btn = null;
        try {
          btn = e.target && e.target.closest && e.target.closest('[data-iv-buy="1"]');
        } catch (_) {
          return;
        }
        if (!btn) return;

        // Previously approved → let this genuine click sail through.
        if (allowed.has(btn)) {
          allowed.delete(btn);
          return;
        }
        if (handling) {
          // Already deciding on a prior click; block extras quietly.
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        // INTERCEPT.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handling = true;

        handleIntercept(btn, getProduct(), host).finally(() => {
          handling = false;
        });
      },
      true // capture
    );
  }

  /**
   * Best-effort extraction of richer product detail for the Cold Purchase
   * Analysis: rating, review count, key specs/bullets, and a few review
   * snippets. ALWAYS defensive — wrapped in safe(), never throws, returns
   * partial data. On-page extraction is heuristic and may need per-site tuning.
   */
  function extractDetails() {
    const out = { rating: null, reviewCount: null, specs: [], reviews: [] };

    // 1) schema.org JSON-LD aggregateRating (most reliable when present)
    safe(() => {
      const nodes = document.querySelectorAll('script[type="application/ld+json"]');
      nodes.forEach((n) => {
        const data = safe(() => JSON.parse(n.textContent), null);
        if (!data) return;
        const arr = Array.isArray(data) ? data : data['@graph'] || [data];
        arr.forEach((e) => {
          const ar = e && e.aggregateRating;
          if (ar) {
            const r = parseFloat(ar.ratingValue);
            if (Number.isFinite(r)) out.rating = r;
            const c = parseInt(ar.reviewCount || ar.ratingCount, 10);
            if (Number.isFinite(c)) out.reviewCount = c;
          }
        });
      });
    });

    // 2) specs / feature bullets — common list patterns, kept short & clean
    safe(() => {
      const sels = [
        '#feature-bullets li', '.a-unordered-list .a-list-item', // Amazon
        '.prod-description li', '.product-spec li', '.spec li', '[class*="spec" i] li',
        '.detail_info li', 'ul li',
      ];
      const seen = new Set();
      for (const sel of sels) {
        const els = safe(() => document.querySelectorAll(sel), []);
        els.forEach((el) => {
          const t = safe(() => (el.innerText || '').trim().replace(/\s+/g, ' '), '');
          if (t && t.length >= 6 && t.length <= 90 && !seen.has(t)) {
            seen.add(t);
            out.specs.push(t);
          }
        });
        if (out.specs.length >= 6) break;
      }
      out.specs = out.specs.slice(0, 6);
    });

    // 3) a few review snippets (best-effort; many sites lazy-load these)
    safe(() => {
      const sels = ['[data-hook="review-body"]', '.review-body', '.review_cont', '[class*="review" i] p'];
      const seen = new Set();
      for (const sel of sels) {
        const els = safe(() => document.querySelectorAll(sel), []);
        els.forEach((el) => {
          const t = safe(() => (el.innerText || '').trim().replace(/\s+/g, ' '), '');
          if (t && t.length >= 12 && t.length <= 160 && !seen.has(t)) {
            seen.add(t);
            out.reviews.push(t);
          }
        });
        if (out.reviews.length >= 6) break;
      }
      out.reviews = out.reviews.slice(0, 6);
    });

    return out;
  }

  async function handleIntercept(btn, product, host) {
    const name = (product && product.name) || guessNameNearButton(btn) || '이 상품';
    const price = (product && product.price) || guessPriceOnPage() || 0;
    const key = (product && product.key) || productKeyFromUrl();
    const details = safe(() => extractDetails(), {}) || {};

    // Ask the background to score this exact moment + build the scorecard.
    const res = await send({
      type: 'SCORE_SIGNAL',
      name,
      price,
      key,
      site: host,
      details,
    });

    const tier = (res && res.tier) || 'none';

    // Paused / snoozed / freq-capped-to-none → just proceed silently.
    if (tier === 'none') {
      return proceed(btn);
    }

    const payload = (res && res.payload) || {};
    payload.name = payload.name || name;
    payload.price = payload.price || price;

    // Hand off to the overlay (defined in overlay.js).
    if (!window.IVOverlay) {
      // Overlay missing for some reason → never block the user.
      return proceed(btn);
    }

    if (tier === 'low') {
      // Gentle, non-blocking toast. Purchase continues immediately.
      window.IVOverlay.toast(payload);
      return proceed(btn);
    }

    // Medium / High → blocking glass modal with a decision.
    window.IVOverlay.modal(payload, {
      onProceed: () => {
        send({
          type: 'DECISION',
          decision: 'proceeded',
          name,
          price,
          site: host,
        });
        proceed(btn);
      },
      onResist: () => {
        send({ type: 'DECISION', decision: 'resisted', name, price, site: host });
        // Do nothing else — the purchase is simply abandoned.
      },
      onVault: () => {
        send({
          type: 'VAULT_ADD',
          name,
          price,
          url: location.href,
          site: host,
          coolingHours: payload.coolingHours,
        });
        send({ type: 'DECISION', decision: 'vaulted', name, price, site: host });
      },
    });
  }

  // Re-fire the original action by replaying a trusted-ish click.
  function proceed(btn) {
    try {
      allowed.add(btn);
      // For links, also honor href if click() doesn't navigate.
      btn.click();
    } catch (_) {
      try {
        if (btn.href) location.href = btn.href;
      } catch (__) {}
    }
  }

  // Last-resort name/price guesses if the adapter found nothing.
  function guessNameNearButton(btn) {
    return safe(() => {
      const h = document.querySelector('h1, h1 *');
      return (h && h.innerText && h.innerText.trim()) || document.title;
    }, '');
  }
  function guessPriceOnPage() {
    return safe(() => {
      const ld = readJsonLdProducts()[0];
      if (ld && ld.price) return ld.price;
      // Find the most prominent price-looking text.
      const m = document.body.innerText.match(/[₩$]\s?[\d.,]{3,}/);
      return m ? parsePrice(m[0]) : 0;
    }, 0);
  }

  // Defer to idle so we never compete with the host page's own load.
  safe(() => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      main();
    } else {
      window.addEventListener('DOMContentLoaded', main, { once: true });
    }
  });
})();
