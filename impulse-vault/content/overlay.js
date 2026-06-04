/* ============================================================
 * IMPULSE VAULT — content/overlay.js
 * ------------------------------------------------------------
 * The injected intervention UI. Exposes a tiny global:
 *
 *   window.IVOverlay.toast(payload)              // gentle, auto-dismiss
 *   window.IVOverlay.modal(payload, handlers)    // blocking glass modal
 *
 * Everything renders inside a Shadow DOM so the host page's styles
 * can't break us and ours can't leak out. All animation is PURE CSS
 * (see overlay.css, loaded into the shadow root). No external libs.
 *
 * It must NEVER throw into the host page — every entry point is
 * wrapped defensively.
 * ============================================================ */

(function () {
  'use strict';
  if (window.__IV_OVERLAY_LOADED__) return;
  window.__IV_OVERLAY_LOADED__ = true;

  let hostEl = null; // the <div> that hosts our shadow root
  let shadow = null; // the shadow root
  let stylesReady = false;

  // Lazily create the shadow host + load overlay.css into it.
  function ensureRoot() {
    if (hostEl && shadow) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        hostEl = document.createElement('div');
        hostEl.id = 'impulse-vault-root';
        // Float above everything; pointer-events toggled per-surface.
        hostEl.style.cssText =
          'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
        shadow = hostEl.attachShadow({ mode: 'open' });
        (document.documentElement || document.body).appendChild(hostEl);

        // Pull overlay.css text and inline it for zero flash-of-unstyled.
        const url = chrome.runtime.getURL('content/overlay.css');
        fetch(url)
          .then((r) => r.text())
          .then((css) => {
            const style = document.createElement('style');
            style.textContent = css;
            shadow.appendChild(style);
            stylesReady = true;
            resolve();
          })
          .catch(() => {
            // Even if CSS fails, continue with minimal inline fallback.
            stylesReady = false;
            resolve();
          });
      } catch (_) {
        resolve();
      }
    });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtKRW(n) {
    try {
      return '₩' + Number(n || 0).toLocaleString('ko-KR');
    } catch (_) {
      return '₩' + (n || 0);
    }
  }

  // ---------------------------------------------------------
  // GENTLE TOAST — low signal. Does not block anything.
  // ---------------------------------------------------------
  async function toast(payload) {
    try {
      await ensureRoot();
      if (!shadow) return;
      const wrap = el('div', 'iv-toast');
      wrap.style.pointerEvents = 'auto';
      const q = el('div', 'iv-toast-q', payload && payload.title ? payload.title : '이거 진짜 필요해? 🤔');
      const sub = el(
        'div',
        'iv-toast-sub',
        payload && payload.price ? `${fmtKRW(payload.price)} · 잠깐만 생각해봐` : '잠깐만 생각해봐'
      );
      wrap.appendChild(q);
      wrap.appendChild(sub);

      // Auto-dismiss with a CSS exit animation.
      const remove = () => {
        wrap.classList.add('iv-toast-out');
        setTimeout(() => wrap.remove(), 400);
      };

      // If we have grounded analysis, expose a "근거 보기" action so the
      // supporting evidence is reachable even for low-signal nudges.
      if (payload && payload.scorecard) {
        const more = el('button', 'iv-toast-more', '근거 보기 →');
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          remove();
          analysisModal(payload);
        });
        wrap.appendChild(more);
        // Don't dismiss on body click (would swallow the button); give more time.
        setTimeout(remove, 9000);
      } else {
        wrap.addEventListener('click', remove);
        setTimeout(remove, 4200);
      }
      shadow.appendChild(wrap);
    } catch (_) {
      /* never throw into host */
    }
  }

  // ---------------------------------------------------------
  // ANALYSIS-ONLY modal (info, non-blocking) — opened from the toast.
  // ---------------------------------------------------------
  async function analysisModal(payload) {
    try {
      await ensureRoot();
      if (!shadow || !payload || !payload.scorecard) return;
      const backdrop = el('div', 'iv-backdrop');
      backdrop.style.pointerEvents = 'auto';
      const card = el('div', 'iv-card');
      card.appendChild(el('div', 'iv-badge', '구매 분석'));
      card.appendChild(el('h2', 'iv-title', '냉정한 분석'));
      if (payload.name) card.appendChild(el('div', 'iv-item', payload.name));
      try { card.appendChild(buildScorecard(payload)); } catch (_) {}
      const close = el('button', 'iv-btn iv-btn-ghost', '닫기');
      const doClose = () => {
        backdrop.classList.add('iv-backdrop-out');
        setTimeout(() => backdrop.remove(), 320);
      };
      close.addEventListener('click', doClose);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) doClose(); });
      card.appendChild(close);
      backdrop.appendChild(card);
      shadow.appendChild(backdrop);
    } catch (_) {}
  }

  // ---------------------------------------------------------
  // BLOCKING MODAL — medium / high signal.
  // handlers: { onProceed, onResist, onVault }
  // ---------------------------------------------------------
  async function modal(payload, handlers) {
    try {
      await ensureRoot();
      if (!shadow) {
        // If we somehow can't render, never trap the user — let them buy.
        handlers && handlers.onProceed && handlers.onProceed();
        return;
      }
      payload = payload || {};
      handlers = handlers || {};
      const high = payload.tier === 'high';

      const backdrop = el('div', 'iv-backdrop');
      backdrop.style.pointerEvents = 'auto';

      const card = el('div', 'iv-card' + (high ? ' iv-card-high' : ''));

      // Header
      const badge = el('div', 'iv-badge', high ? '강한 충동 신호' : '잠깐 멈춤');
      const title = el('h2', 'iv-title', payload.title || '이거 진짜 필요해?');
      const item = el('div', 'iv-item', payload.name || '이 상품');
      card.appendChild(badge);
      card.appendChild(title);
      card.appendChild(item);

      // Cost reframing
      const rf = payload.reframing || {};
      if ((rf.hoursOfWork && rf.hoursOfWork > 0) || (rf.gameUnits && rf.gameUnits > 0)) {
        const reframe = el('div', 'iv-reframe');
        if (payload.price) reframe.appendChild(el('span', 'iv-price', fmtKRW(payload.price)));
        const parts = [];
        if (rf.hoursOfWork > 0) parts.push(`≈ ${rf.hoursOfWork}시간 노동`);
        if (rf.gameUnits > 0) parts.push(`≈ ${rf.gameUnits}개의 아끼는 것`);
        if (parts.length) reframe.appendChild(el('span', 'iv-reframe-sub', parts.join('  ·  ')));
        card.appendChild(reframe);
      }

      // Personalized insight (high tier)
      if (high && payload.insight) {
        const ins = el('div', 'iv-insight');
        ins.appendChild(el('span', 'iv-insight-dot', '●'));
        ins.appendChild(el('span', 'iv-insight-text', payload.insight));
        card.appendChild(ins);
      }

      // Reflection questions
      if (Array.isArray(payload.questions) && payload.questions.length) {
        const qs = el('ul', 'iv-questions');
        payload.questions.forEach((q) => qs.appendChild(el('li', null, q)));
        card.appendChild(qs);
      }

      // "Message from future you" (high tier)
      if (high && payload.futureMessage) {
        card.appendChild(el('div', 'iv-future', payload.futureMessage));
      }

      // ---- Cold Purchase Analysis scorecard (above the buttons) ----
      if (payload.scorecard) {
        try {
          card.appendChild(buildScorecard(payload));
        } catch (_) {
          /* never block on the scorecard */
        }
      }

      // Escape hatch: proceed anyway, gated by the thinking timer.
      const seconds = Math.max(0, payload.thinkingSeconds || 0);

      // Thinking timer — a thin circular ring that fills slowly. While it
      // fills, the "buy anyway" button stays disabled. Building a deliberate
      // pause is the whole point, so the ring is the visual focus here.
      let timer = null;
      let remaining = seconds;
      if (seconds > 0) {
        const R = 20;
        const C = 2 * Math.PI * R;
        const thinking = el('div', 'iv-thinking');
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'iv-ring');
        svg.setAttribute('viewBox', '0 0 46 46');
        const bg = document.createElementNS(svgNS, 'circle');
        bg.setAttribute('class', 'iv-ring-bg');
        bg.setAttribute('cx', '23');
        bg.setAttribute('cy', '23');
        bg.setAttribute('r', String(R));
        const fg = document.createElementNS(svgNS, 'circle');
        fg.setAttribute('class', 'iv-ring-fg');
        fg.setAttribute('cx', '23');
        fg.setAttribute('cy', '23');
        fg.setAttribute('r', String(R));
        fg.setAttribute('stroke-dasharray', String(C));
        fg.setAttribute('stroke-dashoffset', String(C));
        fg.style.setProperty('--iv-secs', seconds + 's');
        svg.appendChild(bg);
        svg.appendChild(fg);
        const label = el('div');
        const num = el('span', 'iv-thinking-num', String(remaining) + 's');
        label.appendChild(document.createTextNode('잠깐만 — 천천히 생각해보자 '));
        label.appendChild(num);
        thinking.appendChild(svg);
        thinking.appendChild(label);
        card.appendChild(thinking);

        timer = setInterval(() => {
          remaining -= 1;
          num.textContent = Math.max(0, remaining) + 's';
          if (remaining <= 0 && timer) {
            clearInterval(timer);
            timer = null;
            proceedBtn.disabled = false;
            thinking.style.opacity = '0.6';
          }
        }, 1000);
      }

      // Actions
      const actions = el('div', 'iv-actions');

      // Primary good action: lock in the Vault (the gentle teal accent).
      const vaultBtn = el(
        'button',
        'iv-btn iv-btn-primary',
        `금고에 넣기 · ${payload.coolingHours || 24}시간 식히기`
      );

      // Secondary: walk away (also good — celebrated).
      const resistBtn = el('button', 'iv-btn iv-btn-ghost', '안 살래');

      // Understated escape hatch (not a tempting CTA).
      const proceedBtn = el('button', 'iv-btn iv-btn-proceed');
      const proceedLabel = high ? '그래도 살게요' : '그래도 살래요';
      proceedBtn.textContent = proceedLabel;
      proceedBtn.disabled = seconds > 0;

      const close = () => {
        if (timer) clearInterval(timer);
        backdrop.classList.add('iv-backdrop-out');
        setTimeout(() => backdrop.remove(), 320);
      };

      // Celebration when the user backs off.
      function celebrate(amount) {
        try {
          const cel = el('div', 'iv-celebrate');
          cel.appendChild(el('div', 'iv-celebrate-emoji', '🌱'));
          cel.appendChild(el('div', 'iv-celebrate-title', '잘 참았어!'));
          if (amount)
            cel.appendChild(
              el('div', 'iv-celebrate-sub', `${fmtKRW(amount)} 아꼈어 · Total Saved에 추가됨`)
            );
          // Confetti dots (pure CSS animated).
          const conf = el('div', 'iv-confetti');
          for (let i = 0; i < 14; i++) {
            const d = el('span', 'iv-conf-dot');
            d.style.setProperty('--i', String(i));
            conf.appendChild(d);
          }
          cel.appendChild(conf);
          card.replaceChildren(cel);
          setTimeout(close, 1900);
        } catch (_) {
          close();
        }
      }

      vaultBtn.addEventListener('click', () => {
        handlers.onVault && handlers.onVault();
        celebrate(payload.price);
      });
      resistBtn.addEventListener('click', () => {
        handlers.onResist && handlers.onResist();
        celebrate(payload.price);
      });
      proceedBtn.addEventListener('click', () => {
        if (proceedBtn.disabled) return;
        handlers.onProceed && handlers.onProceed();
        close();
      });

      // Snooze for the rest of today.
      const snooze = el('button', 'iv-snooze', '오늘은 그만 물어보기');
      snooze.addEventListener('click', () => {
        try {
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          IVStorage.saveSettings({ snoozeUntil: end.getTime() }).then(() => {
            try {
              chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' }, () => void chrome.runtime.lastError);
            } catch (_) {}
          });
        } catch (_) {}
        handlers.onProceed && handlers.onProceed();
        close();
      });

      actions.appendChild(vaultBtn);
      actions.appendChild(resistBtn);
      actions.appendChild(proceedBtn);
      card.appendChild(actions);
      card.appendChild(snooze);

      backdrop.appendChild(card);
      shadow.appendChild(backdrop);
    } catch (_) {
      // Absolute safety: if rendering blew up, let the purchase proceed.
      try {
        handlers && handlers.onProceed && handlers.onProceed();
      } catch (__) {}
    }
  }

  // ---------------------------------------------------------
  // Cold Purchase Analysis scorecard (neutral, grounded)
  // ---------------------------------------------------------
  function ivSend(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function buildScorecard(payload) {
    const sc = payload.scorecard;
    const wrap = el('div', 'iv-analysis');

    // Header: title + "참고용" chip + neutral consideration meter
    const head = el('div', 'iv-an-head');
    const titleText = sc.typeLabel && sc.itemType !== 'product'
      ? '냉정한 분석 · ' + sc.typeLabel
      : '냉정한 구매 분석';
    const title = el('div', 'iv-an-title', titleText);
    const chip = el('span', 'iv-an-chip', sc.note || '참고용');
    head.appendChild(title);
    head.appendChild(chip);
    wrap.appendChild(head);

    // Objective summary
    if (sc.summary) wrap.appendChild(el('div', 'iv-an-summary', sc.summary));

    // Two columns: 장점 | 단점
    const cols = el('div', 'iv-an-cols');
    cols.appendChild(buildColumn('장점', sc.pros, 'pro'));
    cols.appendChild(buildColumn('단점', sc.cons, 'con'));
    wrap.appendChild(cols);

    // Consideration meter (NOT a verdict)
    if (sc.meter) {
      const meter = el('div', 'iv-an-meter');
      const mlabel = el('div', 'iv-an-meter-label');
      mlabel.appendChild(el('span', null, '고려도'));
      mlabel.appendChild(el('span', 'iv-an-meter-val', sc.meter.label));
      const bar = el('div', 'iv-an-meter-bar');
      const fill = el('i');
      fill.style.width = (sc.meter.value || 0) + '%';
      bar.appendChild(fill);
      meter.appendChild(mlabel);
      meter.appendChild(bar);
      meter.appendChild(el('div', 'iv-an-meter-note', '※ 사라/사지마 판정이 아니라, 얼마나 신중할지에 대한 참고예요.'));
      wrap.appendChild(meter);
    }

    // Reflection points (point + "why this matters")
    if (Array.isArray(sc.reflections) && sc.reflections.length) {
      const ref = el('div', 'iv-an-reflect');
      ref.appendChild(el('div', 'iv-an-subhead', '합리적 판단 포인트'));
      sc.reflections.forEach((r) => {
        const item = el('div', 'iv-an-ref-item');
        item.appendChild(el('div', 'iv-an-ref-point', r.point));
        if (r.why) item.appendChild(el('div', 'iv-an-ref-why', r.why));
        ref.appendChild(item);
      });
      wrap.appendChild(ref);
    }

    // Tools row: "is there a better/cheaper alternative?" search (if enabled)
    if (payload.webSearchEnabled && payload.productName) {
      const tools = el('div', 'iv-an-tools');
      const name = payload.productName;
      const altWord = (sc && sc.altWord) || '대안';
      const isProduct = !sc || sc.itemType === 'product' || !sc.itemType;

      // Always: a general "better alternative" comparison search.
      const better = el('button', 'iv-an-tool', '더 나은 ' + altWord + ' 찾기');
      better.addEventListener('click', () => {
        try {
          const q = encodeURIComponent(name + ' 대안 비교 추천 리뷰');
          window.open('https://www.google.com/search?q=' + q, '_blank', 'noopener');
        } catch (_) {}
      });
      tools.appendChild(better);

      // Products also get a cheapest-price search.
      if (isProduct) {
        const cheaper = el('button', 'iv-an-tool', '더 싼 값 찾기');
        cheaper.addEventListener('click', () => {
          try {
            const q = encodeURIComponent(name + ' 최저가');
            window.open('https://search.shopping.naver.com/search/all?query=' + q, '_blank', 'noopener');
          } catch (_) {}
        });
        tools.appendChild(cheaper);
      }
      wrap.appendChild(tools);
    }

    // Optional AI enrichment (BYOK) — instant card already shown; this fills in.
    if (payload.aiEnabled && payload.aiDetails) {
      const ai = el('div', 'iv-an-ai');
      ai.appendChild(el('div', 'iv-an-subhead', 'AI 분석 · 참고용'));
      const body = el('div', 'iv-an-ai-body');
      body.appendChild(el('div', 'iv-an-loading', '불러오는 중…'));
      ai.appendChild(body);
      wrap.appendChild(ai);
      ivSend({ type: 'ANALYZE_AI', details: payload.aiDetails }).then((res) => {
        body.replaceChildren();
        if (res && res.ok && res.text) {
          // Render as plain text lines (never inject HTML).
          String(res.text).split('\n').forEach((line) => {
            if (line.trim()) body.appendChild(el('div', 'iv-an-ai-line', line.trim()));
          });
        } else {
          const msg = (res && res.error) ? String(res.error) : '키·권한·네트워크 확인';
          body.appendChild(el('div', 'iv-an-ai-err', 'AI 분석 실패: ' + msg));
        }
      });
    } else {
      // AI off → tell the user how to get the deeper AI-backed reasoning.
      const hint = el('div', 'iv-an-aihint');
      hint.appendChild(el('span', null, '🔒 더 깊은 AI 근거를 원하면 '));
      const b = el('span', 'iv-an-aihint-b', '대시보드 → 설정 → "AI 분석"');
      hint.appendChild(b);
      hint.appendChild(el('span', null, '을 켜고 내 API 키를 넣으세요. (위 분석은 키 없이 무료로 작동해요.)'));
      wrap.appendChild(hint);
    }

    return wrap;
  }

  function buildColumn(label, items, kind) {
    const col = el('div', 'iv-an-col iv-an-col-' + kind);
    col.appendChild(el('div', 'iv-an-col-head', label));
    const ul = el('ul', 'iv-an-list');
    if (!items || !items.length) {
      ul.appendChild(el('li', 'iv-an-empty', kind === 'pro' ? '뚜렷한 장점 정보가 적어요' : '뚜렷한 단점 정보가 적어요'));
    } else {
      items.forEach((it) => {
        const li = el('li');
        li.appendChild(el('span', 'iv-an-dot', null));
        const txt = el('span', 'iv-an-text', it.text);
        if (it.source) {
          const src = el('span', 'iv-an-src', it.source);
          txt.appendChild(src);
        }
        li.appendChild(txt);
        ul.appendChild(li);
      });
    }
    col.appendChild(ul);
    return col;
  }

  window.IVOverlay = { toast, modal };
})();
