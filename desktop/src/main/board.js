/* ============================================================
 * IMPULSE VAULT desktop — board.js
 * ------------------------------------------------------------
 * The supporter message board ("응원 게시판") data adapter.
 *
 * Swappable by config:
 *   - Supabase configured  → real multi-user board via REST.
 *   - Placeholders left     → local PREVIEW mode with sample data,
 *                             so the board renders during development.
 *
 * The Supabase anon key is publishable, but the board's safety depends
 * on Row Level Security (see README): public SELECT only of approved
 * rows; public INSERT limited to (name, message, badge); NO public
 * update/delete. New posts arrive with approved=false → "검토 중".
 * ============================================================ */

'use strict';

const config = require('./config');

// ---- Input safety ----
const PROFANITY = ['fuck', 'shit', 'bitch', 'asshole', '씨발', '시발', '개새끼', '병신', '좆'];

function sanitizeText(s) {
  // Render as PLAIN TEXT only — strip anything HTML-ish, collapse whitespace.
  return String(s || '')
    .replace(/[<>]/g, '') // never allow tag characters through
    .replace(/\s+/g, ' ')
    .trim();
}

function maskProfanity(s) {
  let out = s;
  for (const w of PROFANITY) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '*'.repeat(w.length));
  }
  return out;
}

function cleanIncoming({ name, message, badge }) {
  const max = config.BOARD.maxMessageLength;
  const cleanMsg = maskProfanity(sanitizeText(message)).slice(0, max);
  const cleanName = maskProfanity(sanitizeText(name)).slice(0, 40);
  const allowedBadges = ['', 'coffee', 'cup', 'star', 'heart'];
  const cleanBadge = allowedBadges.includes(badge) ? badge : '';
  return { name: cleanName, message: cleanMsg, badge: cleanBadge };
}

// ---- Sample data for preview mode ----
const SAMPLE = [
  { id: 's1', name: '익명의 절약러', message: '덕분에 새벽 충동구매 3번 참았어요 🙏', badge: 'star', created_at: Date.now() - 3600e3, approved: true },
  { id: 's2', name: 'mina', message: '금고 기능 최고… 24시간 뒤엔 사고 싶은 마음이 사라져요', badge: 'coffee', created_at: Date.now() - 7 * 3600e3, approved: true },
  { id: 's3', name: '', message: '돈 모으는 데 진짜 도움돼요. 커피 한 잔 보탤게요 ☕', badge: 'cup', created_at: Date.now() - 26 * 3600e3, approved: true },
  { id: 's4', name: '지출방어선', message: '"30일 뒤에도 쓸까?" 이 질문이 신의 한 수', badge: 'heart', created_at: Date.now() - 50 * 3600e3, approved: true },
];

function isPreview() {
  return !config.supabaseConfigured();
}

async function sbFetch(path, opts) {
  const url = config.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1' + path;
  const headers = Object.assign(
    {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    (opts && opts.headers) || {}
  );
  return fetch(url, Object.assign({}, opts, { headers }));
}

/** Fetch recent APPROVED messages (newest first). */
async function fetchMessages() {
  if (isPreview()) {
    return { mode: 'preview', messages: SAMPLE.slice() };
  }
  try {
    const limit = config.BOARD.fetchLimit;
    const res = await sbFetch(
      `/messages?select=id,name,message,badge,created_at&approved=eq.true&order=created_at.desc&limit=${limit}`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    return { mode: 'live', messages: rows };
  } catch (err) {
    console.warn('[board] fetch failed, falling back to preview:', err);
    return { mode: 'error', messages: SAMPLE.slice(), error: String(err) };
  }
}

/**
 * Post a supporter message. Always starts unapproved (RLS + table default),
 * so the poster sees "검토 중" until the developer approves it.
 */
async function postMessage(raw) {
  const clean = cleanIncoming(raw || {});
  if (!clean.message) return { ok: false, error: 'empty' };

  if (isPreview()) {
    // Local preview: pretend it was accepted and is pending review.
    return { ok: true, pending: true, mode: 'preview', message: clean };
  }
  try {
    const res = await sbFetch('/messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      // Only the allowed columns are sent; approved defaults to false in the DB.
      body: JSON.stringify({ name: clean.name, message: clean.message, badge: clean.badge }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { ok: true, pending: true, mode: 'live', message: clean };
  } catch (err) {
    console.warn('[board] post failed:', err);
    return { ok: false, error: String(err) };
  }
}

module.exports = { fetchMessages, postMessage, isPreview, cleanIncoming };
