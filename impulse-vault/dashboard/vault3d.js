/* ============================================================
 * IMPULSE VAULT — dashboard/vault3d.js
 * ------------------------------------------------------------
 * A self-contained Three.js scene: a glowing item on a pedestal
 * behind a frosted dome. The dome becomes CLEARER as a cooling-off
 * timer counts down; "letting go" shatters the item into particles.
 *
 * Uses ONLY the Three.js core (bundled locally as lib/three.min.js,
 * which you must download — see the README / lib note). If THREE is
 * missing, init() returns false and the dashboard shows a CSS
 * fallback instead. No CDN, no postprocessing addons → CSP-clean.
 *
 * Public API (window.IVVault3D):
 *    init(canvas)        -> boolean (false if THREE unavailable)
 *    setClarity(0..1)    -> dome frostiness (0 frosted, 1 clear)
 *    setHasItem(bool)    -> show/hide the locked item
 *    shatter()           -> play the release-into-particles burst
 * ============================================================ */

(function () {
  'use strict';

  let renderer, scene, camera, dome, item, pedestal, halo;
  let particles = null;
  let raf = null;
  let clarity = 0.25;
  let hasItem = false;
  let shattering = false;
  let shatterT = 0;

  function available() {
    return typeof THREE !== 'undefined';
  }

  function init(canvas) {
    if (!available() || !canvas) return false;
    try {
      const w = canvas.clientWidth || 520;
      const h = canvas.clientHeight || 360;

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 1.4, 5.2);
      camera.lookAt(0, 0.6, 0);

      // Lights — teal key, violet rim, soft ambient.
      scene.add(new THREE.AmbientLight(0x8090b0, 0.6));
      const key = new THREE.PointLight(0x3ddc97, 1.4, 30);
      key.position.set(3, 4, 4);
      scene.add(key);
      const rim = new THREE.PointLight(0x8b7bf0, 1.1, 30);
      rim.position.set(-4, 2, -2);
      scene.add(rim);

      // Pedestal.
      const pedGeo = new THREE.CylinderGeometry(1.1, 1.35, 0.4, 48);
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x161d29,
        metalness: 0.7,
        roughness: 0.35,
        emissive: 0x0c1620,
      });
      pedestal = new THREE.Mesh(pedGeo, pedMat);
      pedestal.position.y = -0.2;
      scene.add(pedestal);

      // The locked item — a glowing gem.
      const itemGeo = new THREE.IcosahedronGeometry(0.62, 0);
      const itemMat = new THREE.MeshStandardMaterial({
        color: 0xffb547,
        emissive: 0xff9a2e,
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.2,
        flatShading: true,
      });
      item = new THREE.Mesh(itemGeo, itemMat);
      item.position.y = 0.7;
      item.visible = hasItem;
      scene.add(item);

      // Soft halo behind the item (additive sprite-like ring).
      const haloGeo = new THREE.RingGeometry(0.75, 1.15, 48);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x3ddc97,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 0.7, -0.4);
      scene.add(halo);

      // Frosted dome.
      const domeGeo = new THREE.SphereGeometry(1.25, 48, 32);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: 0xbfeee6,
        transparent: true,
        opacity: 0.55,
        roughness: 0.9,
        metalness: 0,
        transmission: 0.4,
        thickness: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.7;
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
    const h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function applyClarity() {
    if (!dome) return;
    // Clearer dome = lower opacity + lower roughness.
    const c = Math.max(0, Math.min(1, clarity));
    dome.material.opacity = 0.62 - c * 0.5; // 0.62 → 0.12
    dome.material.roughness = 0.95 - c * 0.8; // 0.95 → 0.15
    if (item) item.material.emissiveIntensity = 0.4 + c * 0.7;
  }

  function setClarity(v) {
    clarity = v;
    applyClarity();
  }

  function setHasItem(v) {
    hasItem = !!v;
    if (item) item.visible = hasItem && !shattering;
    if (halo) halo.visible = hasItem && !shattering;
    if (dome) dome.visible = hasItem;
  }

  function spawnParticles() {
    const count = 140;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0.7;
      pos[i * 3 + 2] = 0;
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.9 + 0.1,
        Math.random() - 0.5
      ).normalize();
      vel.push(dir.multiplyScalar(0.04 + Math.random() * 0.05));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x3ddc97,
      size: 0.09,
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
    if (halo) halo.visible = false;
    if (dome) dome.visible = false;
    spawnParticles();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    if (item && item.visible) {
      item.rotation.y = t * 0.6;
      item.rotation.x = Math.sin(t * 0.5) * 0.2;
      item.position.y = 0.7 + Math.sin(t * 1.4) * 0.06;
    }
    if (halo && halo.visible) {
      halo.rotation.z = t * 0.3;
      halo.lookAt(camera.position);
    }
    if (dome && dome.visible) {
      dome.rotation.y = t * 0.1;
    }

    if (particles) {
      shatterT += 1;
      const arr = particles.geometry.attributes.position.array;
      const vel = particles.userData.vel;
      for (let i = 0; i < vel.length; i++) {
        vel[i].y -= 0.0014; // gravity
        arr[i * 3] += vel[i].x;
        arr[i * 3 + 1] += vel[i].y;
        arr[i * 3 + 2] += vel[i].z;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.material.opacity = Math.max(0, 1 - shatterT / 90);
      if (shatterT > 90) {
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
