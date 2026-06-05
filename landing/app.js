/* ============================================================
 * IMPULSE VAULT — landing page script
 * Edit CONFIG below: the install link + your donation links.
 * ============================================================ */
'use strict';

var CONFIG = {
  // Where "시작하기 / 브라우저에 추가하기" sends people. Until the Chrome Web
  // Store listing is live, this points at the bundled install guide page
  // (install.html), which has the .zip download + load-unpacked steps.
  // Swap it for your Web Store URL once published.
  INSTALL_URL: 'install.html',

  // Desktop app installer (.exe). Build it with `npm run dist:win` inside
  // desktop/, then upload the generated .exe to a GitHub Release and paste the
  // direct asset URL here. Tip: a permalink like
  //   https://github.com/<owner>/<repo>/releases/latest/download/IMPULSE-VAULT-Setup.exe
  // always points at the newest release, so you never have to edit this again.
  DESKTOP_WIN_URL: 'PASTE_DESKTOP_EXE_URL_HERE',
  // Where the "all releases" / source link points (optional, shown as fallback).
  RELEASES_URL: 'PASTE_RELEASES_URL_HERE',

  // Donation links (hosted platforms — no secrets here). Blank = "준비 중".
  DONATION_LINKS: {
    toss: 'PASTE_URL_HERE', // Korean
    kakaoPay: 'PASTE_URL_HERE', // Korean
    buyMeACoffee: 'PASTE_URL_HERE',
    paypal: 'PASTE_URL_HERE',
  },
  CURRENCY: '₩',
  TIERS: [
    { amount: 1000, link: 'toss', emoji: '☕', label: '커피 한 모금' },
    { amount: 5000, link: 'kakaoPay', emoji: '🧋', label: '커피 한 잔' },
    { amount: 10000, link: 'buyMeACoffee', emoji: '🌟', label: '든든한 응원' },
  ],
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
        alert('설치 링크는 준비 중이에요.\n(app.js의 CONFIG.INSTALL_URL에 스토어/깃허브 주소를 넣으세요.)');
      });
    }
  });

  // ---- Desktop (.exe) download wiring ----
  function ready(v) { return v && v.indexOf('PASTE') !== 0; }
  var desktopUrl = ready(CONFIG.DESKTOP_WIN_URL) ? CONFIG.DESKTOP_WIN_URL : null;
  var releasesUrl = ready(CONFIG.RELEASES_URL) ? CONFIG.RELEASES_URL : null;
  document.querySelectorAll('[data-download-desktop]').forEach(function (a) {
    if (desktopUrl) {
      a.href = desktopUrl;
      a.setAttribute('download', '');
      a.rel = 'noopener';
    } else {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (releasesUrl) { window.open(releasesUrl, '_blank', 'noopener'); return; }
        alert('데스크탑 앱은 곧 공개돼요.\n(app.js의 CONFIG.DESKTOP_WIN_URL에 GitHub Release의 .exe 주소를 넣으세요.)');
      });
    }
  });
  document.querySelectorAll('[data-download-note]').forEach(function (p) {
    if (releasesUrl) {
      p.innerHTML = '모든 버전은 <a href="' + releasesUrl + '" target="_blank" rel="noopener">GitHub Releases</a>에서 받을 수 있어요.';
    }
  });

  // ---- Donation tiers ----
  var grid = document.getElementById('donateTiers');
  if (grid) {
    CONFIG.TIERS.forEach(function (t) {
      var url = CONFIG.DONATION_LINKS[t.link];
      var ready = url && url.indexOf('PASTE') !== 0;
      var card = document.createElement('div');
      card.className = 'tier card';
      card.innerHTML =
        '<div class="tier-emoji">' + t.emoji + '</div>' +
        '<div class="tier-amt">' + CONFIG.CURRENCY + t.amount.toLocaleString('ko-KR') + '</div>' +
        '<div class="tier-label">' + t.label + '</div>';
      var btn = document.createElement('button');
      if (ready) {
        btn.textContent = '후원하기';
        btn.addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
      } else {
        btn.textContent = '준비 중';
        btn.className = 'pending';
        btn.disabled = true;
      }
      card.appendChild(btn);
      grid.appendChild(card);
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
    document.querySelectorAll('.feat, .step, .tier, .desktop-card').forEach(function (card) {
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
