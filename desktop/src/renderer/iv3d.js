/* ============================================================
 * IMPULSE VAULT — utils/iv3d.js
 * ------------------------------------------------------------
 * Shared Three.js helpers so every surface (dashboard / popup /
 * onboarding) can render its OWN distinct 3D object while sharing
 * the same luxurious look: refractive glass + thin-film iridescence,
 * lit by a PROCEDURAL environment map (an equirect gradient "studio"
 * run through PMREM — no external HDRI files), studio lights, ACES
 * tone mapping.
 *
 * Loaded as a classic script AFTER lib/three.min.js. If THREE isn't
 * present (the placeholder lib hasn't been replaced yet), IV3D.available()
 * returns false and each scene falls back to its CSS visual.
 *
 * Attaches to window.IV3D.
 * ============================================================ */

(function (global) {
  'use strict';

  function available() {
    return typeof THREE !== 'undefined';
  }

  // A premium WebGLRenderer wired for the glass look.
  function createRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    if ('outputEncoding' in r && THREE.sRGBEncoding) r.outputEncoding = THREE.sRGBEncoding;
    return r;
  }

  // Procedural equirect "studio" → PMREM. `tint` shifts the key spot hue so
  // each surface can have a subtly different reflection mood.
  function proceduralEnv(renderer, tint) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#11131c');
    g.addColorStop(0.45, '#1b2540');
    g.addColorStop(0.5, '#2a3666');
    g.addColorStop(0.55, '#1b2540');
    g.addColorStop(1, '#0a0b10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
    function spot(x, y, r, color, a) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    spot(300, 150, 200, '#ffffff', 0.9);
    spot(780, 180, 160, tint || '#aeb9ff', 0.7);
    spot(520, 430, 240, '#ffd9c0', 0.2);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  // The signature refractive-glass + iridescent material.
  function glassMaterial(opts) {
    const base = {
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: 1.0,
      thickness: 1.5,
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      iridescence: 1.0,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 1.45,
      attenuationColor: new THREE.Color(0x9fb0ff),
      attenuationDistance: 4.0,
      transparent: true,
    };
    return new THREE.MeshPhysicalMaterial(Object.assign(base, opts || {}));
  }

  // Soft studio lights: cool ambient + warm key + periwinkle rim + violet fill.
  function studioLights(scene) {
    scene.add(new THREE.AmbientLight(0x404a6b, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x8ea2ff, 5.5, 24);
    rim.position.set(-5, -2, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xc9b6ff, 2.2, 20);
    fill.position.set(5, -3, 3);
    scene.add(fill);
    return { key: key, rim: rim, fill: fill };
  }

  // Soft radial sprite texture (contact shadow / glow).
  function radialTexture(inner) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner || 'rgba(0,0,0,0.8)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  global.IV3D = {
    available: available,
    createRenderer: createRenderer,
    proceduralEnv: proceduralEnv,
    glassMaterial: glassMaterial,
    studioLights: studioLights,
    radialTexture: radialTexture,
  };
})(typeof self !== 'undefined' ? self : this);
