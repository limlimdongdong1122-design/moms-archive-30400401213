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
})();
