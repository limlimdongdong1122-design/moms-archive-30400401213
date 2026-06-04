/* ============================================================
 * IMPULSE VAULT desktop — support.js
 * ------------------------------------------------------------
 * The Support view: optional donation tiers (open hosted links in
 * the external browser via main) + the supporter board ("응원 게시판").
 *
 * The board talks to a swappable backend through window.iv.board.*
 * (Supabase in main, or local preview). All rendering is plain-text
 * (textContent) — never innerHTML with user data — and posting has a
 * client-side cooldown on top of the server/RLS protections.
 * ============================================================ */

(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const BADGE_EMOJI = { coffee: '☕', cup: '🧋', star: '🌟', heart: '💝' };

  let cfg = null;
  const COOLDOWN_KEY = 'iv_last_post_ts';

  function relTime(ts) {
    const diff = Date.now() - Number(ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    return `${d}일 전`;
  }

  // ---- Donation tiers ----
  function renderTiers(config) {
    cfg = config;
    const grid = $('#tierGrid');
    if (!grid) return;
    grid.innerHTML = '';
    config.tiers.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'tier glass';

      const emoji = document.createElement('div');
      emoji.className = 'tier-emoji';
      emoji.textContent = t.emoji || '💝';

      const amount = document.createElement('div');
      amount.className = 'tier-amount';
      amount.textContent = t.custom ? '자유' : `${config.currency}${t.amount.toLocaleString('ko-KR')}`;

      const label = document.createElement('div');
      label.className = 'tier-label';
      label.textContent = t.label || '';

      const btn = document.createElement('button');
      if (t.ready) {
        btn.textContent = '후원하기';
        btn.addEventListener('click', () => openDonation(t.linkKey));
      } else {
        btn.textContent = '준비 중';
        btn.classList.add('pending');
        btn.disabled = true;
      }

      card.appendChild(emoji);
      card.appendChild(amount);
      card.appendChild(label);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  async function openDonation(linkKey) {
    // The raw URL stays in main (it's public, but there's no reason to ship
    // it to the renderer). main resolves the key, validates http(s), opens it.
    try {
      await window.iv.openDonation(linkKey);
    } catch (_) {}
  }

  // ---- Board ----
  async function renderBoard() {
    const list = $('#boardList');
    const modeEl = $('#boardMode');
    if (!list) return;
    list.innerHTML = '';
    let res = null;
    try {
      res = await window.iv.board.fetch();
    } catch (_) {
      res = { mode: 'error', messages: [] };
    }
    if (modeEl) {
      modeEl.textContent =
        res.mode === 'preview'
          ? '미리보기 모드 (샘플)'
          : res.mode === 'error'
          ? '연결 오류 — 샘플 표시 중'
          : '';
    }
    (res.messages || []).forEach((m, i) => list.appendChild(msgCard(m, i)));
    if (!res.messages || res.messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = '아직 응원이 없어요. 첫 응원을 남겨줄래요? 🌱';
      list.appendChild(empty);
    }
  }

  function msgCard(m, i) {
    const card = document.createElement('div');
    card.className = 'msg-card' + (m.pending ? ' pending' : '');
    card.style.setProperty('--iv-delay', i * 45 + 'ms');

    const top = document.createElement('div');
    top.className = 'msg-top';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = m.name && m.name.trim() ? m.name : '익명';
    top.appendChild(name);
    if (m.badge && BADGE_EMOJI[m.badge]) {
      const badge = document.createElement('span');
      badge.className = 'msg-badge';
      badge.textContent = BADGE_EMOJI[m.badge];
      top.appendChild(badge);
    }
    const when = document.createElement('span');
    when.className = 'msg-when';
    when.textContent = m.created_at ? relTime(m.created_at) : '';
    top.appendChild(when);

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = m.message || ''; // plain text — never innerHTML

    card.appendChild(top);
    card.appendChild(body);

    if (m.pending) {
      const tag = document.createElement('span');
      tag.className = 'msg-pending-tag';
      tag.textContent = '검토 중';
      card.appendChild(tag);
    }
    return card;
  }

  function initCompose(config) {
    const msg = $('#composeMsg');
    const count = $('#charCount');
    const postBtn = $('#postBtn');
    const note = $('#composeNote');
    const max = (config && config.maxMessageLength) || 200;
    const cooldown = (config && config.postCooldownMs) || 180000;

    if (msg && count) {
      const update = () => (count.textContent = `${msg.value.length} / ${max}`);
      msg.addEventListener('input', update);
      update();
    }

    if (postBtn) {
      postBtn.addEventListener('click', async () => {
        const text = ($('#composeMsg').value || '').trim();
        if (!text) {
          showNote('한마디를 입력해줘 🙂', true);
          return;
        }
        // Client-side rate limit (server/RLS still applies on top).
        const last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
        const remaining = cooldown - (Date.now() - last);
        if (remaining > 0) {
          showNote(`잠깐 쉬었다 올려줘 — ${Math.ceil(remaining / 60000)}분 뒤에 가능해요.`, true);
          return;
        }
        postBtn.disabled = true;
        const res = await window.iv.board.post({
          name: $('#composeName').value || '',
          message: text,
          badge: $('#composeBadge').value || '',
        });
        postBtn.disabled = false;
        if (res && res.ok) {
          localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
          $('#composeMsg').value = '';
          if (count) count.textContent = `0 / ${max}`;
          showNote('고마워요! 응원은 검토 후 게시돼요 (검토 중) 💚', false);
          renderBoard();
        } else {
          showNote('전송에 실패했어요. 잠시 후 다시 시도해줘.', true);
        }
      });
    }

    function showNote(text, warn) {
      if (!note) return;
      note.hidden = false;
      note.textContent = text;
      note.style.color = warn ? 'var(--accent-warn)' : 'var(--accent-good)';
    }
  }

  // Public entry point called by renderer.js when the Support view opens.
  function init(config) {
    renderTiers(config);
    initCompose(config);
    renderBoard();
  }

  window.IVSupport = { init, renderBoard };
})();
