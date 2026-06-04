/* ============================================================
 * IMPULSE VAULT — dashboard/vault3d.js
 * ------------------------------------------------------------
 * The signature 3D scene: a glowing item on a pedestal beneath a
 * frosted-glass dome. The frost CLEARS as the cooling-off timer
 * counts down (the signature moment); "letting go" shatters it into
 * slowly rising, glowing particles.
 *
 * Art direction: "studio at night" — a soft key light, a cool teal
 * rim, a low fill, gentle scene fog for depth, and faux-bloom via
 * additive glow sprites (Three.js core has no post-processing, and
 * MV3 CSP forbids loading addons, so we fake bloom tastefully).
 * Everything drifts SLOWLY: calm, not energetic.
 *
 * Uses ONLY the Three.js core (local lib/three.min.js — you must
 * download it; see the README). If THREE is missing, init() returns
 * false and the dashboard shows a CSS fallback. No CDN.
 *
 * Public API (window.IVVault3D):
 *    available()         -> boolean
 *    init(canvas)        -> boolean (false if THREE unavailable)
 *    setClarity(0..1)    -> target dome clarity (eased smoothly)
 *    setHasItem(bool)    -> show/hide the locked item
 *    shatter()           -> elegant release-into-particles burst
 *    destroy()
 * ============================================================ */

(function () {
  'use strict';

  // Palette (mirrors tokens.css)
  const COL_TEAL = 0x5eead4;
  const COL_PERI = 0x7c9cff;
  const COL_WARN = 0xffb07c;
  const COL_BG = 0x0a0e14;

  let renderer, scene, camera, dome, item, pedestal, halo;
  let glowItem, glowPedestal;
  let particles = null;
  let raf = null;
  let clarity = 0.25;        // current, eased
  let targetClarity = 0.25;  // requested
  let hasItem = false;
  let shattering = false;
  let shatterT = 0;

  function available() {
    return typeof THREE !== 'undefined';
  }

  // Build a soft radial-gradient sprite texture for faux-bloom glows.
  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function glowSprite(texture, color, scale, opacity) {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale, 1);
    return s;
  }

  function init(canvas) {
    if (!available() || !canvas) return false;
    try {
      const w = canvas.clientWidth || 520;
      const h = canvas.clientHeight || 380;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();
      // Gentle fog gives depth-of-field-like falloff.
      scene.fog = new THREE.FogExp2(COL_BG, 0.085);

      camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.set(0, 1.4, 5.4);
      camera.lookAt(0, 0.6, 0);

      // ---- Studio-night lighting ----
      scene.add(new THREE.AmbientLight(0x6678a0, 0.35)); // low cool fill
      const key = new THREE.DirectionalLight(0xfdf7ff, 0.9); // soft key
      key.position.set(3, 5, 4);
      scene.add(key);
      const rim = new THREE.PointLight(COL_TEAL, 1.5, 24); // cool teal rim
      rim.position.set(-3.5, 1.5, -3);
      scene.add(rim);
      const periFill = new THREE.PointLight(COL_PERI, 0.6, 20);
      periFill.position.set(4, 0.5, 2);
      scene.add(periFill);

      const glowTex = makeGlowTexture();

      // ---- Pedestal ----
      const pedGeo = new THREE.CylinderGeometry(1.05, 1.35, 0.4, 64);
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x121a26,
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x0a1620,
      });
      pedestal = new THREE.Mesh(pedGeo, pedMat);
      pedestal.position.y = -0.25;
      scene.add(pedestal);

      // soft teal bloom from the pedestal base
      glowPedestal = glowSprite(glowTex, COL_TEAL, 3.4, 0.35);
      glowPedestal.position.set(0, -0.1, 0);
      scene.add(glowPedestal);

      // ---- The locked item — a glowing gem ----
      const itemGeo = new THREE.IcosahedronGeometry(0.6, 0);
      const itemMat = new THREE.MeshStandardMaterial({
        color: COL_WARN,
        emissive: COL_WARN,
        emissiveIntensity: 0.6,
        metalness: 0.25,
        roughness: 0.18,
        flatShading: true,
      });
      item = new THREE.Mesh(itemGeo, itemMat);
      item.position.y = 0.72;
      item.visible = hasItem;
      scene.add(item);

      // bloom halo behind the item
      glowItem = glowSprite(glowTex, COL_WARN, 2.2, 0.5);
      glowItem.position.set(0, 0.72, -0.2);
      glowItem.visible = hasItem;
      scene.add(glowItem);

      // a thin additive ring for a little jewellery sparkle
      const haloGeo = new THREE.RingGeometry(0.78, 0.86, 64);
      const haloMat = new THREE.MeshBasicMaterial({
        color: COL_TEAL,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 0.72, -0.1);
      halo.visible = hasItem;
      scene.add(halo);

      // ---- Frosted dome ----
      const domeGeo = new THREE.SphereGeometry(1.25, 64, 48);
      const Mat =
        THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
      const domeMat = new Mat({
        color: 0xc7efe8,
        transparent: true,
        opacity: 0.55,
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      // transmission only exists on MeshPhysicalMaterial
      if ('transmission' in domeMat) {
        domeMat.transmission = 0.5;
        domeMat.thickness = 0.6;
      }
      dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.72;
      scene.add(dome);

      applyClarity();
      window.addEventListener('resize', onResize);
      animate();
      return true;
    } catch (err) {
      console.warn('[IMPULSE VAULT] vault3d init failed:', err);
      return false;
    }
  }

  function onResize() {
    if (!renderer || !camera) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth || 520;
    const h = canvas.clientHeight || 380;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Map the eased clarity to dome frostiness + item glow.
  function applyClarity() {
    if (!dome) return;
    const c = Math.max(0, Math.min(1, clarity));
    dome.material.opacity = 0.6 - c * 0.5;   // 0.6 (frosted) → 0.1 (clear)
    dome.material.roughness = 0.96 - c * 0.85; // 0.96 → 0.11
    if (item) item.material.emissiveIntensity = 0.4 + c * 0.8;
    if (glowItem) glowItem.material.opacity = (hasItem ? 0.4 : 0) + c * 0.4;
  }

  function setClarity(v) {
    targetClarity = Math.max(0, Math.min(1, v));
  }

  function setHasItem(v) {
    hasItem = !!v;
    const vis = hasItem && !shattering;
    if (item) item.visible = vis;
    if (glowItem) glowItem.visible = vis;
    if (halo) halo.visible = vis;
    if (dome) dome.visible = hasItem;
  }

  function spawnParticles() {
    const count = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = 0.72 + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      // Gentle outward + upward drift (slow, slightly slow-motion).
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.7 + 0.35, // bias upward — shards rise
        Math.random() - 0.5
      ).normalize();
      vel.push(dir.multiplyScalar(0.016 + Math.random() * 0.022));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: COL_TEAL,
      size: 0.085,
      map: makeGlowTexture(),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    particles = new THREE.Points(geo, mat);
    particles.userData.vel = vel;
    scene.add(particles);
  }

  function shatter() {
    if (!scene || shattering) return;
    shattering = true;
    shatterT = 0;
    if (item) item.visible = false;
    if (glowItem) glowItem.visible = false;
    if (halo) halo.visible = false;
    if (dome) dome.visible = false;
    spawnParticles();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    // Ease clarity toward its target (smooth frost clearing).
    clarity += (targetClarity - clarity) * 0.05;
    applyClarity();

    // Slow camera "breathing" idle drift.
    if (camera) {
      camera.position.x = Math.sin(t * 0.13) * 0.28;
      camera.position.y = 1.4 + Math.sin(t * 0.19) * 0.07;
      camera.lookAt(0, 0.66, 0);
    }

    if (item && item.visible) {
      item.rotation.y = t * 0.45;
      item.rotation.x = Math.sin(t * 0.4) * 0.18;
      item.position.y = 0.72 + Math.sin(t * 1.1) * 0.05;
    }
    if (glowItem && glowItem.visible) {
      glowItem.position.y = item ? item.position.y : 0.72;
    }
    if (halo && halo.visible) {
      halo.rotation.z = t * 0.2;
      halo.lookAt(camera.position);
    }
    if (dome && dome.visible) {
      dome.rotation.y = t * 0.08;
    }
    if (glowPedestal) {
      // gentle breathing of the base bloom
      const s = 3.4 + Math.sin(t * 0.8) * 0.18;
      glowPedestal.scale.set(s, s, 1);
    }

    if (particles) {
      shatterT += 1;
      const arr = particles.geometry.attributes.position.array;
      const vel = particles.userData.vel;
      for (let i = 0; i < vel.length; i++) {
        vel[i].y -= 0.0006; // very light gravity → slow, floaty
        arr[i * 3] += vel[i].x;
        arr[i * 3 + 1] += vel[i].y;
        arr[i * 3 + 2] += vel[i].z;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.material.opacity = Math.max(0, 1 - shatterT / 150);
      if (shatterT > 150) {
        scene.remove(particles);
        particles.geometry.dispose();
        particles.material.dispose();
        particles = null;
        shattering = false;
      }
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
  }

  window.IVVault3D = {
    available,
    init,
    setClarity,
    setHasItem,
    shatter,
    destroy,
  };
})();
