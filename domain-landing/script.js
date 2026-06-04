/* ============================================================
 * VELA — script.js  (ES module)
 * ------------------------------------------------------------
 * Two layers:
 *   1) CORE UI (runs immediately, zero dependencies): live search
 *      demo, TLD pills, FAQ accordion, 3D-tilt cards, scroll reveal,
 *      magnetic buttons. The page is fully usable even if every CDN
 *      below fails to load.
 *   2) ENHANCEMENTS (dynamically imported, each guarded): Lenis smooth
 *      scroll, GSAP ScrollTrigger parallax, and the Three.js refractive-
 *      glass hero. A failed import degrades gracefully — never fatally.
 * ============================================================ */

'use strict';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 768px)').matches;

/* ============================================================
 * 1. CORE UI
 * ============================================================ */

// ---- Scroll reveal (staggered fade-up) ----
function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (prefersReduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          // small stagger based on order within the viewport batch
          e.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  items.forEach((el) => io.observe(el));
}

// ---- Magnetic buttons (gently pull toward the cursor) ----
function initMagnetic() {
  if (prefersReduced || isMobile) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = 0.35;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}

// ---- TLD pills (single-select; also used as the default extension) ----
let activeTld = 'com';
function initTldPills() {
  const row = document.getElementById('tldRow');
  if (!row) return;
  row.addEventListener('click', (e) => {
    const pill = e.target.closest('.tld-pill');
    if (!pill) return;
    row.querySelectorAll('.tld-pill').forEach((p) => p.classList.remove('is-on'));
    pill.classList.add('is-on');
    activeTld = pill.dataset.tld;
    // If there's already a query, re-run the search with the new priority TLD.
    const q = document.getElementById('searchInput').value.trim();
    if (q) runSearch(q);
  });
}

// ---- Deterministic mock availability + pricing (no backend) ----
const TLDS = ['com', 'io', 'ai', 'dev', 'studio', 'co'];
const BASE_PRICE = { com: 12, io: 38, ai: 72, dev: 15, studio: 24, co: 28 };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function mockResult(name, tld) {
  const h = hashStr(name.toLowerCase() + '.' + tld);
  // ~58% available; deterministic per name+tld so it feels "real".
  const available = h % 100 > 42;
  const base = BASE_PRICE[tld] || 20;
  const price = base + (h % 7); // small deterministic variance
  return { available, price };
}
function sanitizeName(raw) {
  // domain-ish: lowercase, strip to [a-z0-9-], collapse dashes
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

// ---- Live search demo ----
function initSearch() {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const glass = document.getElementById('searchGlass');
  if (!form || !input) return;

  // Polished focus state
  input.addEventListener('focus', () => glass.classList.add('is-focused'));
  input.addEventListener('blur', () => glass.classList.remove('is-focused'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(input.value.trim());
    document.getElementById('search').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Debounced live search as you type
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    const val = input.value.trim();
    if (!val) return;
    t = setTimeout(() => runSearch(val), 420);
  });
}

function runSearch(raw) {
  const name = sanitizeName(raw);
  const grid = document.getElementById('resultsGrid');
  const title = document.getElementById('resultsTitle');
  const sub = document.getElementById('resultsSub');
  if (!grid) return;

  if (!name) {
    grid.innerHTML = '<p class="results-empty">Try a name like “aurora” or “studio”.</p>';
    title.textContent = 'Type a name to begin';
    sub.textContent = "We'll check it across every extension, instantly.";
    return;
  }

  title.textContent = `Results for “${name}”`;
  sub.textContent = 'Pricing renews at the same rate — no surprises.';

  // Order TLDs so the currently selected one leads.
  const ordered = [activeTld, ...TLDS.filter((t) => t !== activeTld)];

  grid.innerHTML = '';
  ordered.forEach((tld, i) => {
    const { available, price } = mockResult(name, tld);
    const card = document.createElement('div');
    card.className = 'result-card reveal';
    card.innerHTML = `
      <div class="result-name">${name}<span class="ext">.${tld}</span></div>
      <div class="result-meta">
        <span class="result-price">$${price}/yr</span>
        <span class="pill ${available ? 'pill-available' : 'pill-taken'}">
          ${available ? 'Available' : 'Taken'}
        </span>
      </div>`;
    grid.appendChild(card);
    // Spring/stagger in
    const delay = Math.min(i * 70, 500);
    if (prefersReduced) {
      card.classList.add('in');
    } else {
      requestAnimationFrame(() => {
        card.style.transitionDelay = delay + 'ms';
        requestAnimationFrame(() => card.classList.add('in'));
      });
    }
  });
}

// ---- Extensions grid + 3D tilt-on-hover ----
const EXT_DATA = [
  { tld: 'com', desc: 'The one everyone trusts.', price: 12 },
  { tld: 'io', desc: 'Beloved by builders.', price: 38 },
  { tld: 'ai', desc: 'For what comes next.', price: 72 },
  { tld: 'dev', desc: 'Secure by default.', price: 15 },
  { tld: 'co', desc: 'Short, sharp, global.', price: 28 },
  { tld: 'studio', desc: 'Make it yours.', price: 24 },
];
function initExtensions() {
  const grid = document.getElementById('extGrid');
  if (!grid) return;
  EXT_DATA.forEach((d) => {
    const card = document.createElement('article');
    card.className = 'ext-card reveal';
    card.innerHTML = `
      <div class="ext-tld"><span class="dot">.</span>${d.tld}</div>
      <p class="ext-desc">${d.desc}</p>
      <div class="ext-price">$${d.price}<span> /year</span></div>`;
    grid.appendChild(card);
    if (!prefersReduced && !isMobile) attachTilt(card);
  });
}
function attachTilt(card) {
  const max = 8; // degrees
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(6px)`;
  });
  card.addEventListener('pointerleave', () => {
    card.style.transform = '';
  });
}

// ---- FAQ accordion (spring expand/collapse) ----
function initFaq() {
  const acc = document.getElementById('accordion');
  if (!acc) return;
  acc.querySelectorAll('.acc-item').forEach((item) => {
    const head = item.querySelector('.acc-head');
    const body = item.querySelector('.acc-body');
    head.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close siblings for a calm, single-open accordion
      acc.querySelectorAll('.acc-item.open').forEach((other) => {
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

// ---- Nav: subtle hide-on-scroll-down, show-on-up ----
function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let last = 0;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (y > last && y > 200) nav.style.transform = 'translateX(-50%) translateY(-130%)';
      else nav.style.transform = 'translateX(-50%) translateY(0)';
      last = y;
    },
    { passive: true }
  );
}

// ---- Cursor spotlight (soft glow that follows the pointer) ----
function initCursorGlow() {
  if (prefersReduced || isMobile) return;
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;
  let x = 0, y = 0, raf = null;
  window.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    document.body.classList.add('cursor-on');
    if (raf) return;
    raf = requestAnimationFrame(() => {
      glow.style.setProperty('--mx', x + 'px');
      glow.style.setProperty('--my', y + 'px');
      raf = null;
    });
  });
  window.addEventListener('pointerleave', () => document.body.classList.remove('cursor-on'));
}

// ---- Eased counters (numbers settle, never snap) ----
function initCounters() {
  const els = document.querySelectorAll('.count');
  if (!els.length) return;
  const run = (el) => {
    const to = parseFloat(el.dataset.to) || 0;
    const suffix = el.dataset.suffix || '';
    if (prefersReduced) { el.textContent = to + suffix; return; }
    const dur = 1400;
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4); // quart-out settle
      el.textContent = Math.round(to * eased) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  };
  if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

// ---- Preloader fade-out (no blank flash) ----
function hidePreloader() {
  const pre = document.getElementById('preloader');
  if (!pre) return;
  pre.classList.add('hide');
  setTimeout(() => pre.remove(), 900);
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
  // Seed the results area with a friendly empty state.
  runSearch('');
}

/* ============================================================
 * 2. ENHANCEMENTS (each guarded — never fatal)
 * ============================================================ */

// ---- Lenis smooth scroll ----
async function initLenis() {
  if (prefersReduced) return null;
  try {
    const { default: Lenis } = await import('lenis');
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return lenis;
  } catch (err) {
    console.warn('[VELA] Lenis unavailable — native scroll:', err);
    return null;
  }
}

// ---- GSAP ScrollTrigger parallax on background mesh + chips ----
async function initGsap(lenis) {
  if (prefersReduced) return null;
  try {
    const { default: gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    // Keep ScrollTrigger in sync with Lenis if present.
    if (lenis && lenis.on) {
      lenis.on('scroll', ScrollTrigger.update);
    }

    // Gentle parallax on the drifting mesh blobs.
    gsap.utils.toArray('.mesh').forEach((el, i) => {
      gsap.to(el, {
        yPercent: (i + 1) * 10,
        ease: 'none',
        scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 1 },
      });
    });
    return gsap;
  } catch (err) {
    console.warn('[VELA] GSAP unavailable — static background:', err);
    return null;
  }
}

// ---- Three.js refractive-glass hero ----
async function initHero() {
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  try {
    const THREE = await import('three');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

    // Post-processing is optional; if it fails we render directly.
    let composer = null, EffectComposer, RenderPass, UnrealBloomPass, OutputPass;
    try {
      ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
      ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
      ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
      ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
    } catch (_) {
      /* no bloom — direct render */
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070708, 0.085);

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 6);

    // ---- Procedural environment map (no external HDRI) ----
    // RoomEnvironment + PMREMGenerator gives soft studio reflections that
    // make transmission/iridescence read as luxurious refractive glass.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environment = envTex;

    // ---- Studio lighting: key + cool rim + low fill ----
    scene.add(new THREE.AmbientLight(0x404a6b, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x8ea2ff, 6, 24); // cool periwinkle rim
    rim.position.set(-5, -2, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xc9b6ff, 2.5, 20);
    fill.position.set(5, -3, 3);
    scene.add(fill);

    // ---- The hero centerpiece ----
    const group = new THREE.Group();
    scene.add(group);

    const detail = isMobile ? 160 : 280;
    const geo = new THREE.TorusKnotGeometry(1.05, 0.34, detail, 40, 2, 3);

    // Refractive glass + thin-film iridescence — the luxurious core.
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.04,
      transmission: 1.0,          // see-through refraction
      thickness: 1.6,             // bends light through the volume
      ior: 1.5,                   // glass-like index of refraction
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      iridescence: 1.0,           // soap-bubble thin-film sheen
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 1.5,
      attenuationColor: new THREE.Color(0x9fb0ff),
      attenuationDistance: 4.0,
      transparent: true,
    });
    const knot = new THREE.Mesh(geo, mat);
    group.add(knot);

    // Soft contact shadow (a faint dark radial plane under the object).
    const shadowTex = makeRadialTexture(THREE);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.7;
    scene.add(shadow);

    // ---- Floating glassy domain chips (canvas-textured planes) ----
    const chipLabels = isMobile ? ['vela.com', 'aurora.ai'] : ['studio.io', 'vela.com', 'aurora.ai', 'north.dev'];
    const chips = chipLabels.map((label, i) => {
      const tex = makeChipTexture(THREE, label);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.42),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      const ang = (i / chipLabels.length) * Math.PI * 2;
      m.userData = {
        baseX: Math.cos(ang) * 2.6,
        baseY: Math.sin(ang) * 1.6,
        baseZ: -0.5 + Math.sin(ang) * 0.8,
        phase: i * 1.7,
      };
      m.position.set(m.userData.baseX, m.userData.baseY, m.userData.baseZ);
      scene.add(m);
      return m;
    });

    // ---- Post-processing (subtle bloom) ----
    if (EffectComposer && !isMobile) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.55, // strength — subtle
        0.5,  // radius
        0.85  // threshold — only the brightest iridescent highlights glow
      );
      composer.addPass(bloom);
      if (OutputPass) composer.addPass(new OutputPass());
    }

    // ---- Interaction: smooth mouse parallax ----
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    if (!prefersReduced) {
      window.addEventListener('pointermove', (e) => {
        target.x = (e.clientX / window.innerWidth - 0.5) * 2;
        target.y = (e.clientY / window.innerHeight - 0.5) * 2;
      });
    }

    // Camera drifts slightly with scroll for depth.
    let scrollN = 0;
    window.addEventListener('scroll', () => {
      const max = document.body.scrollHeight - window.innerHeight;
      scrollN = max > 0 ? window.scrollY / max : 0;
    }, { passive: true });

    // ---- Resize ----
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    // ---- Single RAF loop ----
    const clock = new THREE.Clock();
    function tick() {
      const t = clock.getElapsedTime();

      // Idle breathe + slow self-rotation
      knot.rotation.y = t * 0.18;
      knot.rotation.z = t * 0.05;
      const breathe = 1 + Math.sin(t * 0.8) * 0.02;
      group.scale.setScalar(breathe);

      // Smooth parallax toward the cursor
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      group.rotation.x = cur.y * 0.35;
      group.rotation.y += (cur.x * 0.5 - group.rotation.y) * 0.05;

      // Camera eases down a touch as you scroll
      camera.position.y = -scrollN * 1.2;
      camera.position.z = 6 + scrollN * 1.5;
      camera.lookAt(0, 0, 0);

      // Chips drift + gentle depth parallax, always facing camera
      chips.forEach((c) => {
        const u = c.userData;
        c.position.x = u.baseX + Math.sin(t * 0.3 + u.phase) * 0.18 + cur.x * 0.25;
        c.position.y = u.baseY + Math.cos(t * 0.34 + u.phase) * 0.18 - cur.y * 0.25;
        c.position.z = u.baseZ + Math.sin(t * 0.25 + u.phase) * 0.3;
        c.lookAt(camera.position);
      });

      if (composer) composer.render();
      else renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  } catch (err) {
    // No WebGL / CDN blocked → the CSS gradient mesh remains as the backdrop.
    console.warn('[VELA] 3D hero unavailable — atmosphere fallback:', err);
  }
}

// Soft radial gradient texture (contact shadow).
function makeRadialTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// Glassy "domain chip" texture drawn on a canvas.
function makeChipTexture(THREE, label) {
  const w = 512, h = 172;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const pad = 16, r = 64;
  // frosted glass pill
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.stroke();
  // accent dot
  ctx.fillStyle = '#8ea2ff';
  ctx.beginPath();
  ctx.arc(pad + 46, h / 2, 9, 0, Math.PI * 2);
  ctx.fill();
  // label
  ctx.fillStyle = '#f2f4f8';
  ctx.font = '500 52px "Space Grotesk", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pad + 74, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================================================
 * Boot
 * ============================================================ */
function boot() {
  initCore(); // always
  // Enhancements, chained so GSAP can sync with Lenis.
  initLenis().then((lenis) => initGsap(lenis));
  initHero();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Fade the preloader once the page (and ideally the 3D) is ready.
// Hard cap at 2s so a slow CDN never leaves the loader hanging.
window.addEventListener('load', () => setTimeout(hidePreloader, 350));
setTimeout(hidePreloader, 2000);
