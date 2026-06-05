/* ============================================================
 * VELA — script.js  (classic script — works by double-clicking)
 * ------------------------------------------------------------
 * Loaded as a normal <script defer> (NOT an ES module) so the page
 * runs straight from a file:// double-click. Libraries arrive as UMD
 * globals: THREE (r149), gsap, ScrollTrigger, Lenis.
 *
 * Two layers:
 *   1) CORE UI — zero-dependency: live search demo, TLD pills, FAQ,
 *      3D-tilt cards, scroll reveal, magnetic buttons, counters,
 *      cursor glow. Works even if every CDN below fails.
 *   2) ENHANCEMENTS — Lenis smooth scroll, GSAP parallax, and the
 *      Three.js refractive-glass hero. Each guarded; never fatal.
 * ============================================================ */

(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia('(max-width: 768px)').matches;

  /* ===================== 1. CORE UI ===================== */

  // ---- Scroll reveal (staggered fade-up) ----
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (prefersReduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---- Magnetic buttons ----
  function initMagnetic() {
    if (prefersReduced || isMobile) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var strength = 0.35;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + mx * strength + 'px,' + my * strength + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  // ---- TLD pills ----
  var activeTld = 'com';
  function initTldPills() {
    var row = document.getElementById('tldRow');
    if (!row) return;
    row.addEventListener('click', function (e) {
      var pill = e.target.closest('.tld-pill');
      if (!pill) return;
      row.querySelectorAll('.tld-pill').forEach(function (p) { p.classList.remove('is-on'); });
      pill.classList.add('is-on');
      activeTld = pill.dataset.tld;
      var q = document.getElementById('searchInput').value.trim();
      if (q) runSearch(q);
    });
  }

  // ---- Deterministic mock availability + pricing ----
  var TLDS = ['com', 'io', 'ai', 'dev', 'studio', 'co'];
  var BASE_PRICE = { com: 12, io: 38, ai: 72, dev: 15, studio: 24, co: 28 };
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }
  function mockResult(name, tld) {
    var h = hashStr(name.toLowerCase() + '.' + tld);
    var available = h % 100 > 42;     // ~58% available, deterministic
    var price = (BASE_PRICE[tld] || 20) + (h % 7);
    return { available: available, price: price };
  }
  function sanitizeName(raw) {
    return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  }

  // ---- Live search demo ----
  function initSearch() {
    var form = document.getElementById('searchForm');
    var input = document.getElementById('searchInput');
    var glass = document.getElementById('searchGlass');
    if (!form || !input) return;
    input.addEventListener('focus', function () { glass.classList.add('is-focused'); });
    input.addEventListener('blur', function () { glass.classList.remove('is-focused'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runSearch(input.value.trim());
      document.getElementById('search').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    var t = null;
    input.addEventListener('input', function () {
      clearTimeout(t);
      var val = input.value.trim();
      if (!val) return;
      t = setTimeout(function () { runSearch(val); }, 420);
    });
  }

  function runSearch(raw) {
    var name = sanitizeName(raw || '');
    var grid = document.getElementById('resultsGrid');
    var title = document.getElementById('resultsTitle');
    var sub = document.getElementById('resultsSub');
    if (!grid) return;
    if (!name) {
      grid.innerHTML = '<p class="results-empty">Try a name like “aurora” or “studio”.</p>';
      title.textContent = 'Type a name to begin';
      sub.textContent = "We'll check it across every extension, instantly.";
      return;
    }
    title.textContent = 'Results for “' + name + '”';
    sub.textContent = 'Pricing renews at the same rate — no surprises.';
    var ordered = [activeTld].concat(TLDS.filter(function (t) { return t !== activeTld; }));
    grid.innerHTML = '';
    ordered.forEach(function (tld, i) {
      var r = mockResult(name, tld);
      var card = document.createElement('div');
      card.className = 'result-card reveal';
      card.innerHTML =
        '<div class="result-name">' + name + '<span class="ext">.' + tld + '</span></div>' +
        '<div class="result-meta"><span class="result-price">$' + r.price + '/yr</span>' +
        '<span class="pill ' + (r.available ? 'pill-available' : 'pill-taken') + '">' +
        (r.available ? 'Available' : 'Taken') + '</span></div>';
      grid.appendChild(card);
      var delay = Math.min(i * 70, 500);
      if (prefersReduced) {
        card.classList.add('in');
      } else {
        requestAnimationFrame(function () {
          card.style.transitionDelay = delay + 'ms';
          requestAnimationFrame(function () { card.classList.add('in'); });
        });
      }
    });
  }

  // ---- Extensions grid + 3D tilt ----
  var EXT_DATA = [
    { tld: 'com', desc: 'The one everyone trusts.', price: 12 },
    { tld: 'io', desc: 'Beloved by builders.', price: 38 },
    { tld: 'ai', desc: 'For what comes next.', price: 72 },
    { tld: 'dev', desc: 'Secure by default.', price: 15 },
    { tld: 'co', desc: 'Short, sharp, global.', price: 28 },
    { tld: 'studio', desc: 'Make it yours.', price: 24 }
  ];
  function initExtensions() {
    var grid = document.getElementById('extGrid');
    if (!grid) return;
    EXT_DATA.forEach(function (d) {
      var card = document.createElement('article');
      card.className = 'ext-card reveal';
      card.innerHTML =
        '<div class="ext-tld"><span class="dot">.</span>' + d.tld + '</div>' +
        '<p class="ext-desc">' + d.desc + '</p>' +
        '<div class="ext-price">$' + d.price + '<span> /year</span></div>';
      grid.appendChild(card);
      if (!prefersReduced && !isMobile) attachTilt(card);
    });
  }
  function attachTilt(card) {
    var max = 8;
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'rotateY(' + px * max + 'deg) rotateX(' + (-py * max) + 'deg) translateZ(6px)';
    });
    card.addEventListener('pointerleave', function () { card.style.transform = ''; });
  }

  // ---- FAQ accordion ----
  function initFaq() {
    var acc = document.getElementById('accordion');
    if (!acc) return;
    acc.querySelectorAll('.acc-item').forEach(function (item) {
      var head = item.querySelector('.acc-head');
      var body = item.querySelector('.acc-body');
      head.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        acc.querySelectorAll('.acc-item.open').forEach(function (other) {
          if (other !== item) {
            other.classList.remove('open');
            other.querySelector('.acc-head').setAttribute('aria-expanded', 'false');
            other.querySelector('.acc-body').style.maxHeight = '';
          }
        });
        item.classList.toggle('open', !isOpen);
        head.setAttribute('aria-expanded', String(!isOpen));
        body.style.maxHeight = !isOpen ? body.scrollHeight + 'px' : '';
      });
    });
  }

  // ---- Nav hide-on-scroll ----
  function initNav() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    var last = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      nav.style.transform = (y > last && y > 200)
        ? 'translateX(-50%) translateY(-130%)'
        : 'translateX(-50%) translateY(0)';
      last = y;
    }, { passive: true });
  }

  // ---- Cursor spotlight ----
  function initCursorGlow() {
    if (prefersReduced || isMobile) return;
    var glow = document.getElementById('cursorGlow');
    if (!glow) return;
    var x = 0, y = 0, raf = null;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      document.body.classList.add('cursor-on');
      if (raf) return;
      raf = requestAnimationFrame(function () {
        glow.style.setProperty('--mx', x + 'px');
        glow.style.setProperty('--my', y + 'px');
        raf = null;
      });
    });
    window.addEventListener('pointerleave', function () { document.body.classList.remove('cursor-on'); });
  }

  // ---- Eased counters ----
  function initCounters() {
    var els = document.querySelectorAll('.count');
    if (!els.length) return;
    function run(el) {
      var to = parseFloat(el.dataset.to) || 0;
      var suffix = el.dataset.suffix || '';
      if (prefersReduced) { el.textContent = to + suffix; return; }
      var dur = 1400, start = performance.now();
      (function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 4);
        el.textContent = Math.round(to * eased) + suffix;
        if (t < 1) requestAnimationFrame(frame);
      })(performance.now());
    }
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  function hidePreloader() {
    var pre = document.getElementById('preloader');
    if (!pre) return;
    pre.classList.add('hide');
    setTimeout(function () { if (pre.parentNode) pre.remove(); }, 900);
  }

  function initCore() {
    initReveal();
    initMagnetic();
    initTldPills();
    initSearch();
    initExtensions();
    initFaq();
    initNav();
    initCursorGlow();
    initCounters();
    runSearch('');
  }

  /* ===================== 2. ENHANCEMENTS ===================== */

  // ---- Lenis smooth scroll (global UMD) ----
  function initLenis() {
    if (prefersReduced || typeof Lenis === 'undefined') return null;
    try {
      var lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
      return lenis;
    } catch (err) { console.warn('[VELA] Lenis unavailable:', err); return null; }
  }

  // ---- GSAP ScrollTrigger parallax ----
  function initGsap(lenis) {
    if (prefersReduced || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    try {
      gsap.registerPlugin(ScrollTrigger);
      if (lenis && lenis.on) lenis.on('scroll', ScrollTrigger.update);
      gsap.utils.toArray('.mesh').forEach(function (el, i) {
        gsap.to(el, {
          yPercent: (i + 1) * 10, ease: 'none',
          scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 1 }
        });
      });
    } catch (err) { console.warn('[VELA] GSAP unavailable:', err); }
  }

  // ---- Three.js refractive-glass hero (global THREE r149) ----
  function initHero() {
    var canvas = document.getElementById('scene');
    if (!canvas) return;
    if (typeof THREE === 'undefined') {
      // CDN blocked / offline → show the small notice; CSS atmosphere remains.
      var n = document.getElementById('serveNotice');
      if (n) n.hidden = false;
      return;
    }
    try {
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

      var scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x070708, 0.085);

      var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 6);

      // Procedural environment map (no HDRI): an equirect gradient "studio"
      // with a few soft light spots, run through PMREM for smooth reflections.
      scene.environment = buildEnv(renderer);

      // Studio lighting
      scene.add(new THREE.AmbientLight(0x404a6b, 0.5));
      var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 5); scene.add(key);
      var rim = new THREE.PointLight(0x8ea2ff, 6, 24); rim.position.set(-5, -2, -4); scene.add(rim);
      var fill = new THREE.PointLight(0xc9b6ff, 2.5, 20); fill.position.set(5, -3, 3); scene.add(fill);

      // Centerpiece
      var group = new THREE.Group(); scene.add(group);
      var detail = isMobile ? 160 : 260;
      var geo = new THREE.TorusKnotGeometry(1.05, 0.34, detail, 36, 2, 3);
      var mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.04,
        transmission: 1.0, thickness: 1.6, ior: 1.5,
        clearcoat: 1.0, clearcoatRoughness: 0.08,
        iridescence: 1.0, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 420],
        envMapIntensity: 1.5,
        attenuationColor: new THREE.Color(0x9fb0ff), attenuationDistance: 4.0,
        transparent: true
      });
      var knot = new THREE.Mesh(geo, mat); group.add(knot);

      // Soft contact shadow
      var shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 5),
        new THREE.MeshBasicMaterial({ map: makeRadialTexture(), transparent: true, opacity: 0.5, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.7; scene.add(shadow);

      // Floating glass domain chips
      var chipLabels = isMobile ? ['vela.com', 'aurora.ai'] : ['studio.io', 'vela.com', 'aurora.ai', 'north.dev'];
      var chips = chipLabels.map(function (label, i) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(1.25, 0.42),
          new THREE.MeshBasicMaterial({ map: makeChipTexture(label), transparent: true, depthWrite: false })
        );
        var ang = (i / chipLabels.length) * Math.PI * 2;
        m.userData = { baseX: Math.cos(ang) * 2.6, baseY: Math.sin(ang) * 1.6, baseZ: -0.5 + Math.sin(ang) * 0.8, phase: i * 1.7 };
        m.position.set(m.userData.baseX, m.userData.baseY, m.userData.baseZ);
        scene.add(m);
        return m;
      });

      // Mouse parallax + scroll
      var target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
      if (!prefersReduced) {
        window.addEventListener('pointermove', function (e) {
          target.x = (e.clientX / window.innerWidth - 0.5) * 2;
          target.y = (e.clientY / window.innerHeight - 0.5) * 2;
        });
      }
      var scrollN = 0;
      window.addEventListener('scroll', function () {
        var max = document.body.scrollHeight - window.innerHeight;
        scrollN = max > 0 ? window.scrollY / max : 0;
      }, { passive: true });

      function onResize() {
        var w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
      }
      window.addEventListener('resize', onResize);

      var clock = new THREE.Clock();
      (function tick() {
        var t = clock.getElapsedTime();
        knot.rotation.y = t * 0.18; knot.rotation.z = t * 0.05;
        group.scale.setScalar(1 + Math.sin(t * 0.8) * 0.02);
        cur.x += (target.x - cur.x) * 0.04; cur.y += (target.y - cur.y) * 0.04;
        group.rotation.x = cur.y * 0.35;
        group.rotation.y += (cur.x * 0.5 - group.rotation.y) * 0.05;
        camera.position.y = -scrollN * 1.2; camera.position.z = 6 + scrollN * 1.5; camera.lookAt(0, 0, 0);
        chips.forEach(function (c) {
          var u = c.userData;
          c.position.x = u.baseX + Math.sin(t * 0.3 + u.phase) * 0.18 + cur.x * 0.25;
          c.position.y = u.baseY + Math.cos(t * 0.34 + u.phase) * 0.18 - cur.y * 0.25;
          c.position.z = u.baseZ + Math.sin(t * 0.25 + u.phase) * 0.3;
          c.lookAt(camera.position);
        });
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      })();
    } catch (err) {
      console.warn('[VELA] 3D hero unavailable:', err);
    }
  }

  // Procedural equirect "studio" environment → PMREM.
  function buildEnv(renderer) {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#11131c'); g.addColorStop(0.45, '#1b2540');
    g.addColorStop(0.5, '#2a3666'); g.addColorStop(0.55, '#1b2540'); g.addColorStop(1, '#0a0b10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
    function spot(x, y, r, color, a) {
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    spot(300, 150, 190, '#ffffff', 0.9);
    spot(780, 180, 150, '#aeb9ff', 0.7);
    spot(520, 430, 230, '#ffd9c0', 0.22);
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose(); pmrem.dispose();
    return env;
  }

  function makeRadialTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  function makeChipTexture(label) {
    var w = 512, h = 172, c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); var pad = 16, r = 64;
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r); ctx.stroke();
    ctx.fillStyle = '#8ea2ff'; ctx.beginPath(); ctx.arc(pad + 46, h / 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2f4f8'; ctx.font = '500 52px "Space Grotesk", system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(label, pad + 74, h / 2 + 2);
    var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ===================== Boot ===================== */
  function boot() {
    initCore();
    var lenis = initLenis();
    initGsap(lenis);
    initHero();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Fade the preloader once ready (hard cap so it never hangs).
  window.addEventListener('load', function () { setTimeout(hidePreloader, 350); });
  setTimeout(hidePreloader, 2200);
})();
