/* ============================================================
 * PRICE SCOUT — content/tracker.js
 * ------------------------------------------------------------
 * Runs on supported shopping product pages. It:
 *   1) extracts the product (name/price/image) via PSAdapters,
 *   2) renders a small, premium glass widget (in a Shadow DOM, so the
 *      host page's CSS can't touch it and vice-versa),
 *   3) lets the seller add the product to PRICE SCOUT with one click,
 *   4) if it's already tracked, quietly refreshes the latest price
 *      (visiting a page is the most reliable price reading we get).
 *
 * Fully defensive — must never throw into the host page.
 * Depends on PSPrice + PSAdapters (loaded first via the manifest).
 * ============================================================ */
(function () {
  'use strict';
  if (window.__PS_TRACKER__) return;
  window.__PS_TRACKER__ = true;

  const A = '#2fe0a6';   // mint accent
  const DOWN = '#ff7b6b'; // coral

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res || null); });
      } catch (_) { resolve(null); }
    });
  }
  function fmt(n) { try { return '₩' + Number(n || 0).toLocaleString('ko-KR'); } catch (_) { return '₩' + n; } }

  let host, shadow, product;

  async function boot() {
    // Extract — retry a few times because many shops render price via JS.
    product = readProduct();
    let tries = 0;
    while ((!product.ok || product.price <= 0) && tries < 6) {
      await sleep(900);
      product = readProduct();
      tries++;
    }
    if (!product.ok) return; // not a product page → no widget

    const status = await send({ type: 'PS_PAGE_STATUS', url: product.url });
    if (!status || !status.ok) return;

    // If already tracked, refresh its price silently in the background.
    if (status.tracked && product.price > 0) {
      send({ type: 'PS_UPDATE_PRICE', url: product.url, price: product.price, name: product.name, image: product.image });
    }
    render(status);
  }

  function readProduct() {
    try { return window.PSAdapters.extractFromPage(); }
    catch (_) { return { ok: false }; }
  }

  function render(status) {
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'price-scout-widget';
    host.style.cssText = 'all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483646;';
    shadow = host.attachShadow({ mode: 'open' });
    (document.documentElement || document.body).appendChild(host);

    const tracked = !!status.tracked;
    const atLimit = !!status.atLimit;

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
        .card {
          width: 268px; color: #ecf2ef;
          background: linear-gradient(180deg, rgba(22,26,28,0.92), rgba(12,14,15,0.96));
          border: 1px solid rgba(255,255,255,0.10); border-radius: 18px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.55),
            inset 0 1px 0 0 rgba(255,255,255,0.12), 0 0 50px rgba(47,224,166,0.10);
          backdrop-filter: blur(18px) saturate(120%); -webkit-backdrop-filter: blur(18px) saturate(120%);
          padding: 14px 14px 13px; overflow: hidden; animation: pop .5s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes pop { from { opacity:0; transform: translateY(14px) scale(.96); } to { opacity:1; transform:none; } }
        .top { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
        .mark { width:18px; height:18px; flex:0 0 auto; }
        .brand { font-weight:700; font-size:12px; letter-spacing:.14em; color:#cdd6d2; flex:1; }
        .x { cursor:pointer; color:#828d89; font-size:16px; line-height:1; padding:2px 4px; border-radius:8px; }
        .x:hover { color:#ecf2ef; background:rgba(255,255,255,.06); }
        .name { font-size:12.5px; color:#a4b0ab; line-height:1.4; max-height:2.8em; overflow:hidden; margin-bottom:8px; }
        .price { font-family:'Space Grotesk', system-ui, sans-serif; font-weight:700; font-size:24px; letter-spacing:-.02em; margin-bottom:12px; }
        .price small { font-size:12px; color:#828d89; font-weight:500; }
        button.cta {
          width:100%; padding:11px; border:none; border-radius:12px; cursor:pointer;
          font-family:inherit; font-weight:600; font-size:14px; color:#06120d;
          background: linear-gradient(180deg, #7af0c8, ${A});
          box-shadow: 0 8px 22px rgba(47,224,166,0.30); transition: transform .25s, box-shadow .25s, filter .2s;
        }
        button.cta:hover { transform: translateY(-1px) scale(1.02); box-shadow:0 12px 30px rgba(47,224,166,0.4); }
        button.cta:disabled { cursor:default; filter:saturate(.4) brightness(.8); transform:none; box-shadow:none; }
        .tracked { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; padding:11px; border-radius:12px;
          background: rgba(47,224,166,0.12); border:1px solid rgba(47,224,166,0.35); color:${A}; font-weight:600; font-size:14px; }
        .limit { width:100%; padding:11px; border-radius:12px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
          color:#d8b888; font-weight:600; font-size:13px; cursor:pointer; text-align:center; }
        .hint { margin-top:8px; font-size:11px; color:#828d89; text-align:center; }
        .open { color:${A}; cursor:pointer; text-decoration:none; }
      </style>
      <div class="card">
        <div class="top">
          <span class="mark">${markSvg()}</span>
          <span class="brand">PRICE&nbsp;SCOUT</span>
          <span class="x" id="x" title="닫기">✕</span>
        </div>
        <div class="name">${escapeHtml(product.name)}</div>
        <div class="price">${product.price > 0 ? fmt(product.price) : '<small>가격 감지 중…</small>'}</div>
        <div id="action"></div>
        <div class="hint" id="hint"></div>
      </div>`;

    const action = shadow.getElementById('action');
    const hint = shadow.getElementById('hint');
    shadow.getElementById('x').addEventListener('click', () => host.remove());

    if (tracked) {
      action.innerHTML = `<div class="tracked">✓ 추적 중</div>`;
      hint.innerHTML = `현재가를 방금 업데이트했어요 · <span class="open" id="open">대시보드 열기</span>`;
      bindOpen(hint);
    } else if (atLimit) {
      action.innerHTML = `<div class="limit" id="limit">무료 한도 ${status.limit}개 초과 — Pro로 무제한</div>`;
      shadow.getElementById('limit').addEventListener('click', openDashboard);
      hint.textContent = '기존 상품을 지우거나 Pro로 업그레이드하세요.';
    } else {
      const btn = document.createElement('button');
      btn.className = 'cta';
      btn.textContent = '＋ 정찰 목록에 추가';
      btn.disabled = product.price <= 0;
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = '추가하는 중…';
        const res = await send({ type: 'PS_TRACK_ADD', product: product });
        if (res && res.ok) {
          action.innerHTML = `<div class="tracked">✓ 추적 시작!</div>`;
          hint.innerHTML = `이제 가격 변동을 자동으로 정찰해요 · <span class="open" id="open">대시보드</span>`;
          bindOpen(hint);
        } else if (res && res.error === 'limit') {
          action.innerHTML = `<div class="limit" id="limit">무료 한도 ${res.limit}개 초과 — Pro로 무제한</div>`;
          shadow.getElementById('limit').addEventListener('click', openDashboard);
        } else {
          btn.disabled = false; btn.textContent = '＋ 정찰 목록에 추가';
          hint.textContent = '추가 실패 — 다시 시도해 주세요.';
        }
      });
      action.appendChild(btn);
      hint.textContent = '추가하면 매일 자동으로 가격을 정찰해요.';
    }
  }

  function bindOpen(scope) {
    const o = scope.querySelector('#open');
    if (o) o.addEventListener('click', openDashboard);
  }
  function openDashboard() {
    // Let the background worker open the dashboard tab (single source of truth).
    send({ type: 'PS_OPEN_DASHBOARD' });
  }

  function markSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="${A}" stroke-width="1.8"/>
      <circle cx="11" cy="11" r="2.6" fill="${A}"/>
      <path d="M16 16l5 5" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Defer to idle; never compete with the host page's own load.
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
