/* ============================================================
 * IMPULSE VAULT — landing page script
 * Edit CONFIG below: the install link + your donation links.
 * ============================================================ */
'use strict';

// Tiny i18n helper: returns the Korean string only when the visitor has the
// site set to Korean (via window.IVLang from i18n.js); English otherwise.
var L = function (en, ko) {
  return (window.IVLang && window.IVLang.current === 'ko') ? ko : en;
};

var CONFIG = {
  // Where "시작하기 / 브라우저에 추가하기" sends people. Until the Chrome Web
  // Store / Edge Add-ons listings are live, this points at the bundled install
  // guide page (install.html) with per-browser load-unpacked steps.
  // Swap it for your Web Store URL once published.
  INSTALL_URL: 'install.html',

  // 후원 계좌 — 판매/인수 시 구매자가 본인 계좌로 교체하세요.
  // (index.html 의 #bankAccount 텍스트도 같은 값으로 바꾸면 끝)
  BANK: { name: '은행명', account: '000-0000-000000' },
};

(function () {
  // ---- Install CTA wiring ----
  var installUrl = CONFIG.INSTALL_URL && CONFIG.INSTALL_URL.indexOf('PASTE') !== 0 ? CONFIG.INSTALL_URL : null;
  document.querySelectorAll('[data-install]').forEach(function (a) {
    if (installUrl) {
      a.href = installUrl;
      a.target = '_blank';
      a.rel = 'noopener';
    } else {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        alert(L(
          'The install link is being prepared.\n(Add your store/GitHub URL to CONFIG.INSTALL_URL in app.js.)',
          '설치 링크는 준비 중이에요.\n(app.js의 CONFIG.INSTALL_URL에 스토어/깃허브 주소를 넣으세요.)'
        ));
      });
    }
  });

  // ---- Donation account: one-tap copy of the bank account number ----
  var copyBtn = document.getElementById('copyAccount');
  var acct = document.getElementById('bankAccount');
  if (copyBtn && acct) {
    var fallbackCopy = function (text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      } catch (_) {}
    };
    copyBtn.addEventListener('click', function () {
      var num = (acct.textContent || '').trim();
      var done = function () {
        copyBtn.textContent = L('Copied!', '복사됨!');
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.textContent = L('Copy', '복사'); copyBtn.classList.remove('copied'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(done, function () { fallbackCopy(num); done(); });
      } else {
        fallbackCopy(num); done();
      }
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll('#faq .acc-item').forEach(function (item) {
    var head = item.querySelector('.acc-head');
    var body = item.querySelector('.acc-body');
    head.addEventListener('click', function () {
      var open = item.classList.contains('open');
      document.querySelectorAll('#faq .acc-item.open').forEach(function (o) {
        if (o !== item) { o.classList.remove('open'); o.querySelector('.acc-body').style.maxHeight = ''; }
      });
      item.classList.toggle('open', !open);
      body.style.maxHeight = !open ? body.scrollHeight + 'px' : '';
    });
  });

  // ---- Scroll reveal ----
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.section, .card, .band');
  targets.forEach(function (el) { el.classList.add('reveal'); });
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  // ============================================================
  // PREMIUM INTERACTIONS — cursor light, 3D tilt, magnetic, scroll bar
  // All optional polish: skipped on touch devices and when the user
  // prefers reduced motion. Never blocks core functionality.
  // ============================================================
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---- Scroll progress bar (cheap, always on) ----
  var bar = document.querySelector('.scroll-progress i');
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      bar.style.width = Math.min(100, (h.scrollTop / max) * 100) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (fine && !reduce) {
    // ---- Cursor light: a soft glow + a precise dot that ease toward the pointer ----
    var glow = document.querySelector('.cursor-glow');
    var dot = document.querySelector('.cursor-dot');
    if (glow && dot) {
      var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
      var gx = tx, gy = ty, dx = tx, dy = ty, raf = null;
      var render = function () {
        gx = lerp(gx, tx, 0.12); gy = lerp(gy, ty, 0.12);   // glow trails softly
        dx = lerp(dx, tx, 0.35); dy = lerp(dy, ty, 0.35);   // dot is snappier
        glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0) translate(-50%,-50%)';
        dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)';
        raf = (Math.abs(gx - tx) > 0.5 || Math.abs(gy - ty) > 0.5 || Math.abs(dx - tx) > 0.5)
          ? requestAnimationFrame(render) : null;
      };
      var kick = function () { if (!raf) raf = requestAnimationFrame(render); };
      window.addEventListener('mousemove', function (e) {
        tx = e.clientX; ty = e.clientY; document.body.classList.add('cursor-on'); kick();
      }, { passive: true });
      document.addEventListener('mouseleave', function () { document.body.classList.remove('cursor-on'); });
      // The dot fattens over clickable things.
      var hot = 'a,button,[role="button"],input,.acc-head';
      document.addEventListener('mouseover', function (e) {
        if (e.target.closest && e.target.closest(hot)) dot.classList.add('hot');
      }, { passive: true });
      document.addEventListener('mouseout', function (e) {
        if (e.target.closest && e.target.closest(hot)) dot.classList.remove('hot');
      }, { passive: true });
    }

    // ---- 3D tilt + cursor-following sheen on the interactive cards ----
    document.querySelectorAll('.feat, .step, .tier, .desktop-card, .g-item').forEach(function (card) {
      var rect = null;
      card.addEventListener('mouseenter', function () { rect = card.getBoundingClientRect(); });
      card.addEventListener('mousemove', function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;   // 0..1
        var py = (e.clientY - rect.top) / rect.height;   // 0..1
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        var rx = (0.5 - py) * 7;  // tilt up/down
        var ry = (px - 0.5) * 9;  // tilt left/right
        card.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-4px) scale(1.025)';
      });
      card.addEventListener('mouseleave', function () { rect = null; card.style.transform = ''; });
    });

    // ---- Magnetic primary buttons: gently pull toward the cursor ----
    document.querySelectorAll('.btn-primary').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        b.style.transform = 'translate(' + mx * 0.22 + 'px,' + my * 0.30 + 'px) scale(1.06)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }
})();
