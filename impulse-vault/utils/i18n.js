/* ============================================================
 * IMPULSE VAULT — utils/i18n.js
 * ------------------------------------------------------------
 * Lightweight in-app bilingual layer. ENGLISH is the default and lives
 * directly in the markup; KOREAN is carried alongside in attributes and
 * swapped in on demand:
 *
 *   <h2 data-ko="금고">Vault</h2>                  (text)
 *   <input data-ko-ph="이름" placeholder="Name" />  (placeholder)
 *   <button data-ko-title="닫기" title="Close">     (title/aria)
 *
 * For strings built in JS, use IVI18n.pick('English', '한국어').
 *
 * The chosen language is stored in chrome.storage.local under 'iv_lang'
 * (default 'en'), so it's independent of the browser UI locale — the
 * user picks it from a toggle. Attaches to the global as IVI18n.
 * ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'iv_lang';
  let current = 'en';
  const listeners = [];

  function load() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (r) => {
          void chrome.runtime.lastError;
          current = (r && r[KEY] === 'ko') ? 'ko' : 'en';
          resolve(current);
        });
      } catch (_) { resolve(current); }
    });
  }
  function save(lang) {
    try { chrome.storage.local.set({ [KEY]: lang }, () => void chrome.runtime.lastError); } catch (_) {}
  }

  function pick(en, ko) { return current === 'ko' ? ko : en; }

  function apply(root) {
    const scope = root || document;
    // text content (innerHTML so inline <b>/<br> in our own copy survive)
    scope.querySelectorAll('[data-ko]').forEach((el) => {
      if (el.__iv_en === undefined) el.__iv_en = el.innerHTML;
      el.innerHTML = current === 'ko' ? el.getAttribute('data-ko') : el.__iv_en;
    });
    scope.querySelectorAll('[data-ko-ph]').forEach((el) => {
      if (el.__iv_enph === undefined) el.__iv_enph = el.getAttribute('placeholder') || '';
      el.setAttribute('placeholder', current === 'ko' ? el.getAttribute('data-ko-ph') : el.__iv_enph);
    });
    scope.querySelectorAll('[data-ko-title]').forEach((el) => {
      if (el.__iv_entitle === undefined) el.__iv_entitle = el.getAttribute('title') || '';
      el.setAttribute('title', current === 'ko' ? el.getAttribute('data-ko-title') : el.__iv_entitle);
    });
    try { document.documentElement.lang = current; } catch (_) {}
    // reflect on any language toggle controls
    scope.querySelectorAll('[data-lang-btn]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-btn') === current));
      b.classList.toggle('on', b.getAttribute('data-lang-btn') === current);
    });
  }

  async function setLang(lang) {
    current = lang === 'ko' ? 'ko' : 'en';
    save(current);
    apply();
    listeners.forEach((cb) => { try { cb(current); } catch (_) {} });
  }

  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

  // Boot: load the stored language, then apply once the DOM is ready.
  const ready = load().then(() => {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
      } else {
        apply();
      }
    }
    return current;
  });

  global.IVI18n = {
    KEY,
    get current() { return current; },
    pick,
    apply,
    setLang,
    onChange,
    ready,
  };
})(typeof self !== 'undefined' ? self : this);
