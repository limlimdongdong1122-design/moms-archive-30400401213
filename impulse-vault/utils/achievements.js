/* ============================================================
 * IMPULSE VAULT — utils/achievements.js
 * ------------------------------------------------------------
 * Pure, dependency-free logic that turns the running stats into
 * unlocked "badges". Loaded as a classic script (service worker
 * via importScripts, dashboard via <script src>); attaches to the
 * global as IVAchievements. No storage, no network — just maps
 * stats → which milestone ids are earned, so it's trivially testable.
 *
 * Display strings are kept as en/ko pairs here (not run through
 * IVI18n) so this stays a pure function the test harness can call
 * headless; the UI picks the language when it renders.
 * ============================================================ */
(function (global) {
  'use strict';

  // Each badge: id, icon, en/ko label + blurb, and a test(stats)->bool.
  const ALL = [
    { id: 'first_save', icon: '🌱',
      en: 'First save', ko: '첫 절약',
      enDesc: 'You resisted your first impulse.', koDesc: '첫 충동을 참았어요.',
      test: (s) => (s.resisted || 0) >= 1 },
    { id: 'resist_5', icon: '🛡️',
      en: 'Guarded', ko: '방패',
      enDesc: 'Resisted 5 impulse buys.', koDesc: '충동구매 5번 참기.',
      test: (s) => (s.resisted || 0) >= 5 },
    { id: 'resist_25', icon: '🏅',
      en: 'Disciplined', ko: '단단함',
      enDesc: 'Resisted 25 impulse buys.', koDesc: '충동구매 25번 참기.',
      test: (s) => (s.resisted || 0) >= 25 },
    { id: 'resist_100', icon: '👑',
      en: 'Iron will', ko: '강철 의지',
      enDesc: 'Resisted 100 impulse buys.', koDesc: '충동구매 100번 참기.',
      test: (s) => (s.resisted || 0) >= 100 },
    { id: 'streak_3', icon: '🔥',
      en: 'On a roll', ko: '연속 3회',
      enDesc: '3 resists in a row.', koDesc: '연속 3번 참기.',
      test: (s) => (s.bestStreak || 0) >= 3 },
    { id: 'streak_7', icon: '⚡',
      en: 'Unstoppable', ko: '연속 7회',
      enDesc: '7 resists in a row.', koDesc: '연속 7번 참기.',
      test: (s) => (s.bestStreak || 0) >= 7 },
    { id: 'streak_30', icon: '🌟',
      en: 'Legend', ko: '연속 30회',
      enDesc: '30 resists in a row.', koDesc: '연속 30번 참기.',
      test: (s) => (s.bestStreak || 0) >= 30 },
    { id: 'vault_first', icon: '🧊',
      en: 'Cooled off', ko: '첫 금고',
      enDesc: 'Sent your first item to the Vault.', koDesc: '첫 항목을 금고에 넣었어요.',
      test: (s) => (s.vaulted || 0) >= 1 },
    { id: 'saved_big', icon: '💎',
      en: 'Big saver', ko: '큰 절약가',
      enDesc: 'Saved a serious amount.', koDesc: '꽤 큰 금액을 아꼈어요.',
      test: (s) => (s.totalSaved || 0) >= 500000 },
  ];

  // Return the list of badge ids that the given stats have earned.
  function evaluate(stats) {
    const s = stats || {};
    const out = [];
    for (const a of ALL) {
      try { if (a.test(s)) out.push(a.id); } catch (_) { /* ignore */ }
    }
    return out;
  }

  // Look up a badge's metadata by id (for rendering).
  function meta(id) {
    for (const a of ALL) if (a.id === id) return a;
    return null;
  }

  global.IVAchievements = { ALL, evaluate, meta };
})(typeof self !== 'undefined' ? self : this);
