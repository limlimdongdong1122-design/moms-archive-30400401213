/* ============================================================
 * IMPULSE VAULT — onboarding/welcome3d.js   (ONBOARDING's 3D object)
 * ------------------------------------------------------------
 * The welcome screen's distinct centerpiece: a serene REFRACTIVE-GLASS
 * TORUS KNOT that idles, breathes, and follows the cursor with gentle
 * parallax — a calm, confident first impression. Refractive glass +
 * iridescence via utils/iv3d.js.
 *
 * Self-initializes; if THREE is absent, the CSS orb fallback remains.
 * Exposes window.IVWelcome3D.
 * ============================================================ */

(function () {
  'use strict';

  let renderer, scene, camera, knot, glow, raf = null;
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };

  function available() {
    return typeof THREE !== 'undefined' && !!window.IV3D;
  }

  function init() {
    const canvas = document.getElementById('welcomeCanvas');
    const fallback = document.getElementById('welcomeFallback');
    if (!canvas) return false;
    if (!available()) return false; // keep CSS fallback
    try {
      const w = canvas.clientWidth || 220, h = canvas.clientHeight || 180;
      renderer = IV3D.createRenderer(canvas);
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0e14, 0.06);
      scene.environment = IV3D.proceduralEnv(renderer, '#c9b6ff'); // violet-leaning mood

      camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
      camera.position.set(0, 0, 4.4);

      IV3D.studioLights(scene);

      knot = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.86, 0.28, 220, 32, 2, 3),
        IV3D.glassMaterial({ attenuationColor: new THREE.Color(0x9fb0ff), attenuationDistance: 3.4 })
      );
      scene.add(knot);

      glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: IV3D.radialTexture('rgba(142,162,255,0.9)'),
        color: 0x8ea2ff, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(4.2, 4.2, 1);
      glow.position.z = -1;
      scene.add(glow);

      if (fallback) fallback.style.display = 'none';

      window.addEventListener('pointermove', onMove);
      window.addEventListener('resize', onResize);
      animate();
      return true;
    } catch (err) {
      console.warn('[IMPULSE VAULT] welcome3d failed:', err);
      return false;
    }
  }

  function onMove(e) {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  function onResize() {
    if (!renderer || !camera) return;
    const c = renderer.domElement;
    const w = c.clientWidth || 220, h = c.clientHeight || 180;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    if (knot) {
      knot.rotation.y = t * 0.25;
      knot.rotation.z = t * 0.08;
      knot.scale.setScalar(1 + Math.sin(t * 0.8) * 0.02);
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      knot.rotation.x = cur.y * 0.4 + Math.sin(t * 0.3) * 0.1;
    }
    if (renderer) renderer.render(scene, camera);
  }

  window.IVWelcome3D = { available: available, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
