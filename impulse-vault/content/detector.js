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

  // ---- Buy-button classification ----
  // We delegate the actual text→intent decision to IVPatterns.classifyBuyText
  // (shared, tested logic). It returns 'strong' | 'weak' | 'none':
  //   strong → clearly spending money (결제/구매/checkout/장바구니) → intervene.
  //   weak   → ambiguous (구독/시작하기/subscribe/plan) → intervene ONLY if a
  //            price is visible on the page (skips free trials, newsletters).
  //   none   → login / signup / search / nav (로그인/login/가입/검색) → ignore.
  // This is the core fix for "the prompt pops up when I'm just logging in".
  function classifyButton(el) {
    const txt = safe(() => (el.innerText || el.textContent || '').trim(), '');
    if (!txt) return 'none';
    try {
      if (window.IVPatterns && IVPatterns.classifyBuyText) {
        return IVPatterns.classifyBuyText(txt);
      }
    } catch (_) {}
    // Fallback if patterns.js somehow didn't load: be conservative, treat a
    // couple of unmistakable spend words as strong, everything else as none.
    const low = txt.toLowerCase();
    if (low.length <= 40 && /(결제|구매|장바구니|checkout|add to cart|buy now)/.test(low)) {
      return 'strong';
    }
    return 'none';
  }
  // A genuine file download must NEVER be mistaken for a purchase. This is the
  // most reliable signal: browsers download via <a download> or links whose URL
  // ends in a file extension (or blob:/data: URLs). If we see that, bail out.
  const DOWNLOAD_EXT = /\.(zip|rar|7z|tar|gz|tgz|exe|msi|dmg|pkg|apk|deb|appimage|pdf|hwp|hwpx|doc|docx|xls|xlsx|ppt|pptx|csv|txt|rtf|json|xml|png|jpe?g|gif|webp|svg|bmp|tiff?|heic|mp3|wav|flac|aac|mp4|m4v|mov|avi|mkv|webm|iso|dwg|psd|ai|eps)$/i;
  function isDownloadLink(el) {
    return safe(() => {
      if (el.hasAttribute && el.hasAttribute('download')) return true;
      const a = el.tagName === 'A' ? el : el.closest && el.closest('a');
      if (!a) return false;
      if (a.hasAttribute('download')) return true;
      const href = (a.getAttribute && a.getAttribute('href')) || '';
      if (!href) return false;
      if (/^(blob:|data:)/i.test(href)) return true;
      return DOWNLOAD_EXT.test(href.split(/[?#]/)[0]);
    }, false);
  }

  // Only STRONG buttons get pre-tagged (weak buttons are decided at click
  // time, where we can also check for a visible price).
  function looksLikeBuyButton(el) {
    return classifyButton(el) === 'strong';
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
          // 1) a pre-tagged buy button (from the adapter / MutationObserver)…
          btn = e.target && e.target.closest && e.target.closest('[data-iv-buy="1"]');
          // 2) …or detect one AT CLICK TIME by its text/role. This catches
          //    buttons the tagger missed (SPA timing, lazy DOM, new sites),
          //    which is the main reason the prompt "sometimes didn't appear".
          if (!btn && e.target && e.target.closest) {
            const cand = e.target.closest(
              'button, a, input[type="submit"], input[type="button"], [role="button"]'
            );
            // A real file download is never a purchase — let it through.
            if (cand && isDownloadLink(cand)) return;
            if (cand) {
              const kind = classifyButton(cand);
              // STRONG or WEAK buy text → a candidate. Whether we actually
              // intervene is decided below by the product-evidence gate
              // (needs a price or a product image). NONE (login/search/
              // download/nav…) → never intercept.
              if (kind === 'strong' || kind === 'weak') {
                cand.setAttribute('data-iv-buy', '1');
                btn = cand;
              }
            }
          }
        } catch (_) {
          return;
        }
        if (!btn) return;
        // Final safety net: even a pre-tagged element that turns out to be a
        // file download must not be gated.
        if (isDownloadLink(btn)) return;

        // Product-evidence gate: only intervene when this really looks like a
        // product/checkout — i.e. there's a visible PRICE or a product IMAGE.
        // If there's neither, a "구매"/"buy" word alone isn't enough (it's
        // probably not a genuine purchase), so let the click through.
        if (!(guessPriceOnPage() > 0 || hasProductImage())) return;

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
    const out = { rating: null, reviewCount: null, specs: [], reviews: [], itemType: 'product' };

    // 1) schema.org JSON-LD aggregateRating + @type (product/service/software)
    safe(() => {
      const nodes = document.querySelectorAll('script[type="application/ld+json"]');
      nodes.forEach((n) => {
        const data = safe(() => JSON.parse(n.textContent), null);
        if (!data) return;
        const arr = Array.isArray(data) ? data : data['@graph'] || [data];
        arr.forEach((e) => {
          if (!e) return;
          const ar = e.aggregateRating;
          if (ar) {
            const r = parseFloat(ar.ratingValue);
            if (Number.isFinite(r)) out.rating = r;
            const c = parseInt(ar.reviewCount || ar.ratingCount, 10);
            if (Number.isFinite(c)) out.reviewCount = c;
          }
          const type = String(e['@type'] || (Array.isArray(e['@type']) ? e['@type'].join(' ') : '')).toLowerCase();
          if (type.indexOf('softwareapplication') !== -1 || type.indexOf('webapplication') !== -1) out.itemType = 'software';
          else if (type.indexOf('service') !== -1) out.itemType = 'service';
        });
      });
    });

    // Fallback item-type guess from page signals (subscription/SaaS cues).
    safe(() => {
      if (out.itemType === 'product') {
        const body = (document.body.innerText || '').toLowerCase().slice(0, 4000);
        const t = (document.title || '').toLowerCase();
        const subCue = /구독|월 ?\d|\/(month|mo|월)|per month|monthly|연 ?결제|무료 체험|free trial|플랜|plan|멤버십|membership/.test(body + ' ' + t);
        const swCue = /다운로드|설치|라이선스|license|download|소프트웨어|software|app|앱/.test(t);
        if (subCue) out.itemType = 'service';
        else if (swCue) out.itemType = 'software';
      }
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

    // 2b) spec TABLES as key:value pairs (richest structured data on a page)
    safe(() => {
      const rows = document.querySelectorAll(
        'table tr, .spec_tbl tr, [class*="spec" i] tr, dl > div, .product-info tr'
      );
      const seen = new Set();
      rows.forEach((row) => {
        let k = '', v = '';
        const th = row.querySelector('th, dt, .key, td:first-child');
        const td = row.querySelector('td:last-child, dd, .value');
        if (th && td && th !== td) {
          k = safe(() => th.innerText.trim().replace(/\s+/g, ' '), '');
          v = safe(() => td.innerText.trim().replace(/\s+/g, ' '), '');
        }
        if (k && v && k.length <= 24 && v.length <= 60) {
          const line = k + ': ' + v;
          if (!seen.has(line)) { seen.add(line); out.specs.push(line); }
        }
      });
      out.specs = out.specs.slice(0, 14);
    });

    // 2c) brand / origin / shipping / return / stock hints
    safe(() => {
      const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
      out.brand = safe(() => {
        const b = document.querySelector('[itemprop="brand"], .brand, a[href*="brand" i]');
        return b ? b.innerText.trim().slice(0, 40) : '';
      }, '');
      const orig = txt.match(/정상가|정가|원가/) ? (txt.match(/(?:정상가|정가|원가)\D{0,3}([\d,]{4,})/) || [])[1] : '';
      if (orig) out.originalPrice = parsePrice(orig);
      const disc = (txt.match(/(\d{1,2})\s?%/) || [])[1];
      if (disc) out.discountPct = parseInt(disc, 10);
      out.freeShipping = /무료\s?배송|free shipping/i.test(txt);
      out.returnInfo = /(무료\s?반품|반품 ?불가|교환\/반품|return policy|환불 ?불가)/i.test(txt)
        ? (txt.match(/[^.]{0,30}(무료\s?반품|반품 ?불가|환불 ?불가)[^.]{0,20}/) || [''])[0].trim().slice(0, 50)
        : '';
      out.lowStock = /품절 ?임박|마감 ?임박|few left|only \d+ left|재고 ?\d+개/i.test(txt);
    });

    // 3) review snippets — gather more, classify positive vs negative
    safe(() => {
      const sels = ['[data-hook="review-body"]', '.review-body', '.review_cont', '.sdp-review__article__list__review__content', '[class*="review" i] p', '[class*="comment" i] p'];
      const seen = new Set();
      const all = [];
      for (const sel of sels) {
        const els = safe(() => document.querySelectorAll(sel), []);
        els.forEach((el) => {
          const t = safe(() => (el.innerText || '').trim().replace(/\s+/g, ' '), '');
          if (t && t.length >= 10 && t.length <= 180 && !seen.has(t)) { seen.add(t); all.push(t); }
        });
        if (all.length >= 16) break;
      }
      out.reviews = all.slice(0, 12);
    });

    return out;
  }

  async function handleIntercept(btn, product, host) {
    const name = (product && product.name) || guessNameNearButton(btn) || (window.IVI18n ? IVI18n.pick('this item', '이 상품') : 'this item');
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
          key, // remember this product → don't intervene on it again
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

  // Is there a real PRODUCT IMAGE on the page? Used (together with price) to
  // confirm we're on an actual product/checkout before intervening. We look
  // for structured product images and for a sizeable, genuinely-rendered image
  // — small logos/icons on a login page won't qualify (≥ 160×160, on-screen).
  function hasProductImage() {
    return safe(() => {
      // 1) schema.org product image (strongest signal).
      const nodes = document.querySelectorAll('script[type="application/ld+json"]');
      for (const n of nodes) {
        const data = safe(() => JSON.parse(n.textContent), null);
        if (!data) continue;
        const arr = Array.isArray(data) ? data : data['@graph'] || [data];
        for (const e of arr) {
          if (!e || typeof e !== 'object') continue;
          const type = e['@type'];
          const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
          if (isProduct && e.image) return true;
        }
      }
      // 2) a large, actually-rendered <img> (product photos are big).
      const imgs = document.querySelectorAll('img');
      let checked = 0;
      for (const im of imgs) {
        if (checked++ > 200) break; // stay cheap on huge pages
        const r = safe(() => im.getBoundingClientRect(), null);
        const w = Math.max(im.naturalWidth || 0, (r && r.width) || 0);
        const h = Math.max(im.naturalHeight || 0, (r && r.height) || 0);
        const onScreen = r && r.width > 0 && r.height > 0;
        if (onScreen && w >= 160 && h >= 160) return true;
      }
      return false;
    }, false);
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
