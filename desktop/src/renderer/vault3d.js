/* ============================================================
 * IMPULSE VAULT desktop — vault3d.js   (DESKTOP's 3D object)
 * ------------------------------------------------------------
 * The desktop hub's distinct centerpiece — different from the
 * extension dashboard's smooth dome: here a FACETED CRYSTAL VAULT
 * (a dodecahedron glass shell) rotates around a glowing core. The
 * shell's frost CLEARS as the cooling-off timer counts down; "letting
 * go" shatters it into slowly rising glowing particles.
 *
 * Refractive glass + iridescence + procedural PMREM env come from
 * iv3d.js. Same public API as the extension's IVVault3D so the
 * renderer can drive it: available, init, setClarity, setHasItem,
 * shatter, destroy.
 * ============================================================ */

(function () {
  'use strict';

  let renderer, scene, camera, shell, core, coreHalo, glow;
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
      scene.fog = new THREE.FogExp2(0x0a0e14, 0.075);
      scene.environment = IV3D.proceduralEnv(renderer, '#b9c4ff');

      camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.set(0, 0.6, 5.2);
      camera.lookAt(0, 0.2, 0);

      IV3D.studioLights(scene);

      glow = sprite(IV3D.radialTexture('rgba(94,234,212,0.9)'), 0x5eead4, 4.0, 0.32);
      glow.position.set(0, -0.2, -0.5);
      scene.add(glow);

      // Glowing inner core (the "item")
      core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.52, 0),
        IV3D.glassMaterial({
          transmission: 0.15, thickness: 0.7, roughness: 0.14,
          color: 0xffd9b0, attenuationColor: new THREE.Color(0xffb07c),
          iridescenceThicknessRange: [220, 600], flatShading: true,
        })
      );
      core.position.y = 0.2;
      core.visible = hasItem;
      scene.add(core);

      coreHalo = sprite(IV3D.radialTexture('rgba(255,176,124,0.9)'), 0xffb07c, 2.2, 0.45);
      coreHalo.position.set(0, 0.2, -0.2);
      coreHalo.visible = hasItem;
      scene.add(coreHalo);

      // Faceted crystal shell (the distinct silhouette).
      shell = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.25, 0),
        IV3D.glassMaterial({
          color: 0xc9d4ff, thickness: 1.1, flatShading: true,
          attenuationColor: new THREE.Color(0xbfeee6), side: THREE.DoubleSide, depthWrite: false,
        })
      );
      shell.position.y = 0.2;
      scene.add(shell);

      applyClarity();
      window.addEventListener('resize', onResize);
      animate();
      return true;
    } catch (err) {
      console.warn('[IMPULSE VAULT] desktop vault3d init failed:', err);
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
    const c = renderer.domElement;
    const w = c.clientWidth || 520, h = c.clientHeight || 380;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function applyClarity() {
    if (!shell) return;
    const c = Math.max(0, Math.min(1, clarity));
    shell.material.roughness = 0.9 - c * 0.82;
    shell.material.transmission = 0.2 + c * 0.75;
    shell.material.opacity = 0.94;
    if (core) core.material.emissiveIntensity = 0.3 + c * 0.7;
    if (coreHalo) coreHalo.material.opacity = (hasItem ? 0.3 : 0) + c * 0.35;
  }

  function setClarity(v) { targetClarity = Math.max(0, Math.min(1, v)); }
  function setHasItem(v) {
    hasItem = !!v;
    const vis = hasItem && !shattering;
    if (core) core.visible = vis;
    if (coreHalo) coreHalo.visible = vis;
    if (shell) shell.visible = hasItem;
  }

  function spawnParticles() {
    const count = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = 0.2 + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.35, Math.random() - 0.5).normalize();
      vel.push(dir.multiplyScalar(0.016 + Math.random() * 0.022));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x5eead4, size: 0.09, map: IV3D.radialTexture('rgba(255,255,255,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    particles.userData.vel = vel;
    scene.add(particles);
  }

  function shatter() {
    if (!scene || shattering) return;
    shattering = true;
    shatterT = 0;
    if (core) core.visible = false;
    if (coreHalo) coreHalo.visible = false;
    if (shell) shell.visible = false;
    spawnParticles();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    clarity += (targetClarity - clarity) * 0.05;
    applyClarity();

    if (camera) {
      camera.position.x = Math.sin(t * 0.12) * 0.3;
      camera.position.y = 0.6 + Math.sin(t * 0.18) * 0.08;
      camera.lookAt(0, 0.2, 0);
    }
    if (shell && shell.visible) { shell.rotation.y = t * 0.16; shell.rotation.x = Math.sin(t * 0.3) * 0.12; }
    if (core && core.visible) {
      core.rotation.y = -t * 0.5;
      core.position.y = 0.2 + Math.sin(t * 1.1) * 0.05;
      if (coreHalo) coreHalo.position.y = core.position.y;
    }
    if (glow) { const s = 4.0 + Math.sin(t * 0.8) * 0.22; glow.scale.set(s, s, 1); }

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
