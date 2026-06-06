/* ============================================================
 * IMPULSE VAULT — landing/i18n.js
 * In-page bilingual layer for the marketing site. ENGLISH is the
 * default (lives in the markup); KOREAN is carried in data-ko and
 * swapped in when the visitor picks it from the language toggle.
 * Preference is remembered in localStorage('iv_lang'), default 'en'.
 * ============================================================ */
(function () {
  'use strict';
  const KEY = 'iv_lang';
  let current = 'en';
  try { current = localStorage.getItem(KEY) === 'ko' ? 'ko' : 'en'; } catch (_) {}

  function apply() {
    document.querySelectorAll('[data-ko]').forEach((el) => {
      if (el.__iv_en === undefined) el.__iv_en = el.innerHTML;
      el.innerHTML = current === 'ko' ? el.getAttribute('data-ko') : el.__iv_en;
    });
    document.querySelectorAll('[data-ko-ph]').forEach((el) => {
      if (el.__iv_enph === undefined) el.__iv_enph = el.getAttribute('placeholder') || '';
      el.setAttribute('placeholder', current === 'ko' ? el.getAttribute('data-ko-ph') : el.__iv_enph);
    });
    document.documentElement.lang = current;
    document.querySelectorAll('[data-lang-btn]').forEach((b) => {
      const on = b.getAttribute('data-lang-btn') === current;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    });
  }
  function set(lang) {
    current = lang === 'ko' ? 'ko' : 'en';
    try { localStorage.setItem(KEY, current); } catch (_) {}
    apply();
  }
  function wire() {
    document.querySelectorAll('[data-lang-btn]').forEach((b) => {
      b.addEventListener('click', (e) => { e.preventDefault(); set(b.getAttribute('data-lang-btn')); });
    });
    apply();
  }
  window.IVLang = { get current() { return current; }, set, apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
