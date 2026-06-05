/* ============================================================
 * PRICE SCOUT — utils/adapters.js
 * ------------------------------------------------------------
 * Pulls a product's { name, price, image } out of a page.
 *
 * TWO extraction paths, because they run in two very different places:
 *   1) DOM path  — runs in the content script on the live page. Uses
 *      per-site selectors + schema.org JSON-LD + Open Graph meta.
 *   2) HTML path — runs in the background service worker, which has NO
 *      DOM (MV3 workers can't use DOMParser). So re-checks parse the
 *      fetched HTML string with regex: JSON-LD, <meta> price tags, and
 *      embedded-JSON price keys, with a last-resort ₩/원 text scan.
 *
 * Everything is best-effort and defensive — on-site markup changes, so
 * the generic fallback is always the safety net. Attaches to the global
 * as PSAdapters. Depends on PSPrice (load price.js first).
 * ============================================================ */
(function (global) {
  'use strict';

  const P = global.PSPrice || { parsePrice: (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0 };

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }
  function hostOf(url) {
    return safe(() => new URL(url || location.href).hostname.replace(/^www\./, ''), '');
  }
  function clean(s) {
    return safe(() => String(s || '').replace(/\s+/g, ' ').trim(), '');
  }

  /* ---------------- DOM helpers (content script) ---------------- */
  function jsonLdProductsDOM() {
    const out = [];
    safe(() => {
      document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
        const data = safe(() => JSON.parse(node.textContent), null);
        if (!data) return;
        const arr = Array.isArray(data) ? data : data['@graph'] || [data];
        arr.forEach((e) => {
          if (!e || typeof e !== 'object') return;
          const type = e['@type'];
          const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
          if (!isProduct) return;
          const offers = Array.isArray(e.offers) ? e.offers[0] : e.offers || {};
          const price = P.parsePrice(offers && (offers.price || offers.lowPrice || offers.highPrice));
          const image = Array.isArray(e.image) ? e.image[0] : e.image;
          out.push({ name: clean(e.name), price, image: typeof image === 'string' ? image : '' });
        });
      });
    });
    return out;
  }
  function metaDOM(names) {
    return safe(() => {
      for (const n of names) {
        const el = document.querySelector(
          'meta[property="' + n + '"], meta[name="' + n + '"]'
        );
        if (el && el.content) return el.content;
      }
      return '';
    }, '');
  }
  function textOfDOM(selectors) {
    return safe(() => {
      for (const s of selectors) {
        const el = document.querySelector(s);
        const t = el && clean(el.innerText || el.textContent);
        if (t) return t;
      }
      return '';
    }, '');
  }
  function genericDOM() {
    const ld = jsonLdProductsDOM()[0] || {};
    const name = ld.name || clean(metaDOM(['og:title', 'twitter:title'])) || clean(document.title);
    let price = ld.price || P.parsePrice(metaDOM([
      'product:price:amount', 'og:price:amount', 'twitter:data1',
    ]));
    if (!price) {
      // last resort: most prominent ₩/원 figure in the body
      const m = safe(() => document.body.innerText.match(/[₩]\s?[\d,]{3,}|[\d,]{4,}\s?원/), null);
      if (m) price = P.parsePrice(m[0]);
    }
    const image = ld.image || metaDOM(['og:image', 'twitter:image']) ||
      safe(() => { const i = document.querySelector('img'); return i ? i.src : ''; }, '');
    return { name, price, image };
  }

  /* ---------------- Per-site adapters ---------------- */
  const ADAPTERS = [
    {
      name: 'coupang',
      match: (h) => /coupang\.com$/.test(h),
      isProduct: () => /\/vp\/products\//.test(location.pathname),
      extract: () => ({
        name: textOfDOM(['.prod-buy-header__title', 'h1.prod-buy-header__title']) || genericDOM().name,
        price: P.parsePrice(textOfDOM(['.total-price strong', '.prod-sale-price .total-price', '.prod-price__total'])) || genericDOM().price,
        image: safe(() => document.querySelector('.prod-image__detail')?.src, '') || genericDOM().image,
      }),
    },
    {
      name: 'naver',
      match: (h) => /naver\.com$/.test(h),
      isProduct: () => /smartstore\.naver\.com/.test(location.hostname) && /\/products\//.test(location.pathname),
      extract: () => genericDOM(),
    },
    {
      name: '11st',
      match: (h) => /11st\.co\.kr$/.test(h),
      isProduct: () => /\/products\//.test(location.pathname),
      extract: () => ({
        name: textOfDOM(['.c_product_info_title h1', 'h1']) || genericDOM().name,
        price: P.parsePrice(textOfDOM(['.price .value', '.sale_price', 'dd.price'])) || genericDOM().price,
        image: genericDOM().image,
      }),
    },
    {
      name: 'gmarket',
      match: (h) => /gmarket\.co\.kr$/.test(h),
      isProduct: () => /goods/.test(location.pathname) || /goodscode=/.test(location.search),
      extract: () => genericDOM(),
    },
    {
      name: 'auction',
      match: (h) => /auction\.co\.kr$/.test(h),
      isProduct: () => /itemno=/.test(location.search.toLowerCase()) || /\/item\//.test(location.pathname),
      extract: () => genericDOM(),
    },
    {
      name: 'musinsa',
      match: (h) => /musinsa\.com$/.test(h),
      isProduct: () => /\/(app\/)?goods\//.test(location.pathname) || /\/products\//.test(location.pathname),
      extract: () => genericDOM(),
    },
    {
      name: 'aliexpress',
      match: (h) => /aliexpress\.com$/.test(h),
      isProduct: () => /\/item\//.test(location.pathname),
      extract: () => genericDOM(),
    },
    {
      name: 'amazon',
      match: (h) => /amazon\./.test(h),
      isProduct: () => /\/(dp|gp\/product)\//.test(location.pathname),
      extract: () => {
        const whole = textOfDOM(['.a-price .a-price-whole']);
        const frac = textOfDOM(['.a-price .a-price-fraction']);
        let price = whole ? P.parsePrice(whole + (frac ? frac : '')) : 0;
        if (!price) price = genericDOM().price;
        return {
          name: textOfDOM(['#productTitle']) || genericDOM().name,
          price,
          image: safe(() => document.getElementById('landingImage')?.src, '') || genericDOM().image,
        };
      },
    },
  ];

  const GENERIC = { name: 'generic', match: () => true, isProduct: () => jsonLdProductsDOM().length > 0, extract: genericDOM };

  function pick(host) {
    return ADAPTERS.find((a) => safe(() => a.match(host), false)) || GENERIC;
  }

  /** Live-page extraction. Returns { ok, name, price, image, site, url, key }. */
  function extractFromPage() {
    const host = hostOf();
    const a = pick(host);
    const isProduct = safe(() => a.isProduct(), false) || GENERIC.isProduct();
    const data = safe(() => a.extract(), {}) || {};
    const g = (!data.name || !data.price) ? genericDOM() : {};
    const name = clean(data.name || g.name);
    const price = data.price || g.price || 0;
    const image = data.image || g.image || '';
    const url = safe(() => location.href.split('#')[0], location.href);
    return {
      ok: !!(isProduct && (price > 0 || name)),
      name: name || '(이름 없음)',
      price,
      image,
      site: host,
      url,
      key: url,
    };
  }

  /* ---------------- HTML helpers (background, no DOM) ---------------- */
  function metaFromHtml(html, names) {
    for (const n of names) {
      const re = new RegExp(
        '<meta[^>]+(?:property|name)=["\']' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '["\'][^>]*content=["\']([^"\']+)["\']', 'i'
      );
      const m = html.match(re);
      if (m && m[1]) return m[1];
      // also handle content-before-property ordering
      const re2 = new RegExp(
        '<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' +
        n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'i'
      );
      const m2 = html.match(re2);
      if (m2 && m2[1]) return m2[1];
    }
    return '';
  }
  function jsonLdPriceFromHtml(html) {
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const b of blocks) {
      const body = b.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const data = safe(() => JSON.parse(body), null);
      if (!data) continue;
      const arr = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const offers = Array.isArray(e.offers) ? e.offers[0] : e.offers;
        if (offers && (offers.price || offers.lowPrice)) {
          return { price: P.parsePrice(offers.price || offers.lowPrice), name: clean(e.name) };
        }
      }
    }
    return { price: 0, name: '' };
  }
  function embeddedJsonPrice(html) {
    // Common price keys in inline JSON state (Coupang/Naver/etc.)
    const keys = ['salePrice', 'finalPrice', 'discountedSalePrice', 'sellPrice', 'price'];
    for (const k of keys) {
      const re = new RegExp('"' + k + '"\\s*:\\s*"?([0-9][0-9,\\.]{2,})"?', 'i');
      const m = html.match(re);
      if (m && m[1]) {
        const v = P.parsePrice(m[1]);
        if (v >= 100) return v; // ignore tiny noise
      }
    }
    return 0;
  }

  /**
   * Re-check parsing from fetched HTML (background). Returns
   * { price, name, image }. price is 0 when nothing reliable found
   * (caller then marks the product "needs a visit").
   */
  function extractFromHtml(html) {
    if (!html || typeof html !== 'string') return { price: 0, name: '', image: '' };
    const ld = jsonLdPriceFromHtml(html);
    let price = ld.price;
    if (!price) price = P.parsePrice(metaFromHtml(html, ['product:price:amount', 'og:price:amount']));
    if (!price) price = embeddedJsonPrice(html);
    if (!price) {
      const m = html.match(/[₩]\s?[\d,]{3,}|[\d,]{4,}\s?원/);
      if (m) price = P.parsePrice(m[0]);
    }
    const name = ld.name || clean(metaFromHtml(html, ['og:title', 'twitter:title']));
    const image = metaFromHtml(html, ['og:image', 'twitter:image']);
    return { price: price || 0, name, image };
  }

  const API = { extractFromPage, extractFromHtml, hostOf, pick };
  global.PSAdapters = API;
})(typeof self !== 'undefined' ? self : this);
