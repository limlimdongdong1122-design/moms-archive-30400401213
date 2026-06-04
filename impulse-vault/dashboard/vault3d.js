/* ============================================================
 * IMPULSE VAULT — dashboard/vault3d.js   (DASHBOARD's 3D object)
 * ------------------------------------------------------------
 * The dashboard's distinct centerpiece: a glowing gem on a pedestal
 * beneath a REFRACTIVE-GLASS dome. The dome's frost CLEARS as the
 * cooling-off timer counts down (the signature moment); "letting go"
 * shatters it into slowly rising glowing particles.
 *
 * Materials/lighting/env come from utils/iv3d.js (refractive glass +
 * iridescence + procedural PMREM studio env). Loaded AFTER three.min.js
 * and iv3d.js. If THREE is absent, init() returns false → CSS fallback.
 *
 * Public API (window.IVVault3D): available, init, setClarity,
 * setHasItem, shatter, destroy.
 * ============================================================ */

(function () {
  'use strict';

  let renderer, scene, camera, dome, gem, pedestal, glow, halo;
  let particles = null, raf = null;
  let clarity = 0.25, targetClarity = 0.25;
  let hasItem = false, shattering = false, shatterT = 0;

  function available() {
    return typeof THREE !== 'undefined' && !!window.IV3D;
  }

  function init(canvas) {
    if (!available() || !canvas) return false;
    try {
      const w = canvas.clientWidth || 520, h = canvas.clientHeight || 380;
      renderer = IV3D.createRenderer(canvas);
      renderer.setSize(w, h, false);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0e14, 0.08);
      scene.environment = IV3D.proceduralEnv(renderer, '#aeb9ff');

      camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.set(0, 1.4, 5.4);
      camera.lookAt(0, 0.6, 0);

      IV3D.studioLights(scene);

      // Pedestal
      pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.35, 0.4, 64),
        new THREE.MeshStandardMaterial({ color: 0x121a26, metalness: 0.85, roughness: 0.3, emissive: 0x0a1620 })
      );
      pedestal.position.y = -0.25;
      scene.add(pedestal);

      // base bloom-ish glow
      glow = sprite(IV3D.radialTexture('rgba(94,234,212,0.9)'), 0x5eead4, 3.4, 0.35);
      glow.position.set(0, -0.1, 0);
      scene.add(glow);

      // The locked gem — iridescent solid that catches the env light.
      gem = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.6, 0),
        IV3D.glassMaterial({
          transmission: 0.2, thickness: 0.8, roughness: 0.12,
          color: 0xffd9b0, attenuationColor: new THREE.Color(0xffb07c),
          iridescenceThicknessRange: [200, 560], flatShading: true,
        })
      );
      gem.position.y = 0.72;
      gem.visible = hasItem;
      scene.add(gem);

      halo = sprite(IV3D.radialTexture('rgba(255,176,124,0.9)'), 0xffb07c, 2.0, 0.45);
      halo.position.set(0, 0.72, -0.2);
      halo.visible = hasItem;
      scene.add(halo);

      // Refractive-glass dome (frost driven by clarity).
      dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.25, 64, 48),
        IV3D.glassMaterial({ color: 0xc7efe8, thickness: 0.9, attenuationColor: new THREE.Color(0xbfeee6), side: THREE.DoubleSide, depthWrite: false })
      );
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

  function sprite(tex, color, scale, opacity) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.set(scale, scale, 1);
    return m;
  }

  function onResize() {
    if (!renderer || !camera) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth || 520, h = canvas.clientHeight || 380;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Map clarity → dome frost (roughness/opacity) + gem glow.
  function applyClarity() {
    if (!dome) return;
    const c = Math.max(0, Math.min(1, clarity));
    dome.material.roughness = 0.92 - c * 0.85; // frosted → clear
    dome.material.opacity = 0.92;
    dome.material.transmission = 0.2 + c * 0.75; // see-through as it clears
    if (gem) gem.material.emissiveIntensity = 0.3 + c * 0.7;
    if (halo) halo.material.opacity = (hasItem ? 0.3 : 0) + c * 0.35;
  }

  function setClarity(v) { targetClarity = Math.max(0, Math.min(1, v)); }
  function setHasItem(v) {
    hasItem = !!v;
    const vis = hasItem && !shattering;
    if (gem) gem.visible = vis;
    if (halo) halo.visible = vis;
    if (dome) dome.visible = hasItem;
  }

  function spawnParticles() {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = 0.72 + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.35, Math.random() - 0.5).normalize();
      vel.push(dir.multiplyScalar(0.016 + Math.random() * 0.022));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x5eead4, size: 0.085, map: IV3D.radialTexture('rgba(255,255,255,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    particles.userData.vel = vel;
    scene.add(particles);
  }

  function shatter() {
    if (!scene || shattering) return;
    shattering = true;
    shatterT = 0;
    if (gem) gem.visible = false;
    if (halo) halo.visible = false;
    if (dome) dome.visible = false;
    spawnParticles();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    clarity += (targetClarity - clarity) * 0.05;
    applyClarity();

    if (camera) {
      camera.position.x = Math.sin(t * 0.13) * 0.28;
      camera.position.y = 1.4 + Math.sin(t * 0.19) * 0.07;
      camera.lookAt(0, 0.66, 0);
    }
    if (gem && gem.visible) {
      gem.rotation.y = t * 0.45;
      gem.rotation.x = Math.sin(t * 0.4) * 0.18;
      gem.position.y = 0.72 + Math.sin(t * 1.1) * 0.05;
      if (halo) halo.position.y = gem.position.y;
    }
    if (dome && dome.visible) dome.rotation.y = t * 0.08;
    if (glow) { const s = 3.4 + Math.sin(t * 0.8) * 0.18; glow.scale.set(s, s, 1); }

    if (particles) {
      shatterT += 1;
      const arr = particles.geometry.attributes.position.array;
      const vel = particles.userData.vel;
      for (let i = 0; i < vel.length; i++) {
        vel[i].y -= 0.0006;
        arr[i * 3] += vel[i].x; arr[i * 3 + 1] += vel[i].y; arr[i * 3 + 2] += vel[i].z;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.material.opacity = Math.max(0, 1 - shatterT / 150);
      if (shatterT > 150) { scene.remove(particles); particles.geometry.dispose(); particles.material.dispose(); particles = null; shattering = false; }
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
  }

  window.IVVault3D = { available: available, init: init, setClarity: setClarity, setHasItem: setHasItem, shatter: shatter, destroy: destroy };
})();
