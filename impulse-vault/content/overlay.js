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
      shadow.appendChild(wrap);

      // Auto-dismiss with a CSS exit animation.
      const remove = () => {
        wrap.classList.add('iv-toast-out');
        setTimeout(() => wrap.remove(), 400);
      };
      wrap.addEventListener('click', remove);
      setTimeout(remove, 4200);
    } catch (_) {
      /* never throw into host */
    }
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

      // Actions
      const actions = el('div', 'iv-actions');

      // Primary good action: lock in the Vault.
      const vaultBtn = el(
        'button',
        'iv-btn iv-btn-primary',
        `금고에 넣기 · ${payload.coolingHours || 24}시간 식히기`
      );

      // Secondary: walk away (also good — celebrated).
      const resistBtn = el('button', 'iv-btn iv-btn-ghost', '안 살래');

      // Escape hatch: proceed anyway, gated by the thinking timer.
      const seconds = Math.max(0, payload.thinkingSeconds || 0);
      const proceedBtn = el('button', 'iv-btn iv-btn-proceed');
      const proceedLabel = high ? '그래도 살게요' : '그래도 살래요';
      let remaining = seconds;
      function paintProceed() {
        if (remaining > 0) {
          proceedBtn.disabled = true;
          proceedBtn.textContent = `${proceedLabel} (${remaining}s)`;
        } else {
          proceedBtn.disabled = false;
          proceedBtn.textContent = proceedLabel;
        }
      }
      paintProceed();
      let timer = null;
      if (seconds > 0) {
        timer = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0 && timer) {
            clearInterval(timer);
            timer = null;
          }
          paintProceed();
        }, 1000);
      }

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

  window.IVOverlay = { toast, modal };
})();
