/* ============================================================
 * IMPULSE VAULT — popup/popup3d.js   (POPUP's 3D object)
 * ------------------------------------------------------------
 * The popup's distinct centerpiece: a small REFRACTIVE-GLASS COIN
 * (a thick disc) that slowly spins and bobs — a calm little symbol of
 * "saved money". Refractive glass + iridescence via utils/iv3d.js.
 *
 * Self-initializes on DOMContentLoaded. If THREE isn't present, it
 * leaves the CSS coin fallback visible. Exposes window.IVPopup3D.
 * ============================================================ */

(function () {
  'use strict';

  let renderer, scene, camera, coin, glow, raf = null;

  function available() {
    return typeof THREE !== 'undefined' && !!window.IV3D;
  }

  function init() {
    const canvas = document.getElementById('coinCanvas');
    const fallback = document.getElementById('coinFallback');
    if (!canvas) return false;
    if (!available()) return false; // keep CSS fallback
    try {
      const w = canvas.clientWidth || 120, h = canvas.clientHeight || 120;
      renderer = IV3D.createRenderer(canvas);
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();
      scene.environment = IV3D.proceduralEnv(renderer, '#9fe9dd');

      camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
      camera.position.set(0, 0, 3.4);

      IV3D.studioLights(scene);

      // A thick glass disc = the coin. Iridescent, mint-tinted attenuation.
      coin = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.0, 0.22, 64),
        IV3D.glassMaterial({
          thickness: 1.1,
          attenuationColor: new THREE.Color(0x5eead4),
          attenuationDistance: 2.4,
          iridescenceThicknessRange: [140, 480],
        })
      );
      coin.rotation.x = Math.PI / 2.3; // tilt so we see the face + rim
      scene.add(coin);

      glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: IV3D.radialTexture('rgba(94,234,212,0.9)'),
        color: 0x5eead4, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(3.4, 3.4, 1);
      glow.position.z = -0.6;
      scene.add(glow);

      if (fallback) fallback.style.display = 'none';
      window.addEventListener('resize', onResize);
      animate();
      return true;
    } catch (err) {
      console.warn('[IMPULSE VAULT] popup3d failed:', err);
      return false;
    }
  }

  function onResize() {
    if (!renderer || !camera) return;
    const c = renderer.domElement;
    const w = c.clientWidth || 120, h = c.clientHeight || 120;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    if (coin) {
      coin.rotation.z = t * 0.7;            // spin
      coin.position.y = Math.sin(t * 1.2) * 0.07; // gentle bob
    }
    if (glow) glow.scale.setScalar(3.4 + Math.sin(t * 0.9) * 0.2);
    if (renderer) renderer.render(scene, camera);
  }

  window.IVPopup3D = { available: available, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
