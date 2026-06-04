/* ============================================================
 * IMPULSE VAULT desktop — config.js
 * ------------------------------------------------------------
 * The ONE place the developer edits. Nothing here is a secret:
 *   - donation links are public URLs,
 *   - the Supabase anon key is publishable (safe to ship) PROVIDED
 *     you enable Row Level Security as described in the README.
 * No payment API secret keys ever live in this app.
 * ============================================================ */

'use strict';

// Fixed localhost port shared with the browser extension bridge.
// The extension connects to ws://127.0.0.1:47615. Keep both in sync.
const BRIDGE_PORT = 47615;

// ---- Donation links (hosted platforms — open in external browser) ----
// Paste your real URLs here. While a value is the placeholder string,
// its tier button shows "준비 중" instead of opening anything.
const DONATION_LINKS = {
  buyMeACoffee: 'PASTE_URL_HERE',
  koFi: 'PASTE_URL_HERE',
  toss: 'PASTE_URL_HERE', // Korean
  paypal: 'PASTE_URL_HERE',
  kakaoPay: 'PASTE_URL_HERE', // Korean
};

// Currency symbol used in the donation tier labels.
const CURRENCY = '₩';

// Donation tiers. `link` names a key in DONATION_LINKS above.
const DONATION_TIERS = [
  { amount: 1000, link: 'toss', label: '커피 한 모금', emoji: '☕' },
  { amount: 5000, link: 'kakaoPay', label: '커피 한 잔', emoji: '🧋' },
  { amount: 10000, link: 'buyMeACoffee', label: '든든한 응원', emoji: '🌟' },
  { amount: 0, link: 'paypal', label: '자유 후원', emoji: '💝', custom: true },
];

// ---- Supabase (supporter board backend) ----
// Leave as placeholders to run the board in local PREVIEW mode with
// sample data. Fill both in (and set up RLS per the README) to go live.
const SUPABASE_URL = 'PASTE_SUPABASE_URL_HERE'; // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'PASTE_SUPABASE_ANON_KEY_HERE';

// Board safety knobs.
const BOARD = {
  maxMessageLength: 200,
  postCooldownMs: 3 * 60 * 1000, // one post per 3 minutes (client-side)
  fetchLimit: 50,
};

function isPlaceholder(v) {
  return !v || typeof v !== 'string' || v.startsWith('PASTE_');
}

function supabaseConfigured() {
  return !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);
}

module.exports = {
  BRIDGE_PORT,
  DONATION_LINKS,
  DONATION_TIERS,
  CURRENCY,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BOARD,
  isPlaceholder,
  supabaseConfigured,
};
