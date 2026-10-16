import * as THREE from 'three';
import { hash } from '../world/noise';
import { GLSL_COMMON, U } from './shared';

let ramp: THREE.DataTexture | null = null;
/** 4-step lighting ramp: gives hand-drawn banded shading instead of smooth gradients. */
export function toonRamp() {
  if (!ramp) {
    const d = new Uint8Array([105, 105, 105, 255, 160, 160, 160, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    ramp = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
    ramp.magFilter = ramp.minFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  }
  return ramp;
}

export const toon = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...o });

/** Small pixel texture painted by a per-pixel function. */
export function pixTex(w: number, h: number, fn: (x: number, y: number) => string) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = fn(x, y); g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const TEX = {
  thatch: () => pixTex(12, 12, (x, y) => {
    if (y >= 10) return (x + y) % 2 ? '#7d5d24' : '#9c7a34'; if (y === 0) return '#f0d68a';
    const s = hash(x, 0, 91); if (s < 0.25) return '#a07a32'; if (s > 0.85) return '#e8c870';
    return hash(x, y, 90) < 0.15 ? '#b88f3e' : '#d4ac58';
  }),
  plank: () => pixTex(8, 24, (x, y) => {
    if (x === 0) return '#4a3020'; if (x === 7) return '#6b4729';
    if ((y === 8 || y === 17) && x > 2 && x < 5) return '#5a3a20';
    return hash(x, y, 92) < 0.2 ? '#8a5c34' : x === 1 ? '#b07c4a' : '#9a6a3e';
  }),
  stone: () => pixTex(16, 16, (x, y) => {
    const mortar = y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0;
    if (mortar) return '#4e4a40';
    const r = hash(x, y, 93); if (r < 0.12) return '#5f6a48'; // moss
    return r < 0.5 ? '#8f8a7a' : r < 0.85 ? '#9d9886' : '#7c776a';
  }),
  metal: () => pixTex(16, 16, (x, y) => {
    const r = hash(x, y, 94); if (y % 8 === 0) return '#9aa2ac';
    return r < 0.06 ? '#8a6a4a' : r < 0.5 ? '#dfe4ea' : '#cfd5dc';
  }),
  rust: () => pixTex(8, 8, (x, y) => { const r = hash(x, y, 95); return r < 0.3 ? '#7a3e22' : r < 0.7 ? '#9a5230' : '#b8683a'; }),
  tarp: (c1: string, c2: string) => pixTex(8, 8, (x, y) => (hash(x, y, 96) < 0.2 ? c2 : (x + y) % 7 === 0 ? c2 : c1)),
};

/**
 * Toon material whose vertices bend in the wind above `pivot` (local y). Used for trees, palms, grass.
 * Pattern is driven from instance position so each plant sways on its own phase.
 */
export function swayMaterial(o: THREE.MeshToonMaterialParameters, strength = 1, pivot = 0.5) {
  const m = toon(o);
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          ip = instanceMatrix[3].xyz;
        #endif
        {
          float k = max(0.0, position.y - ${pivot.toFixed(2)}) * ${(0.06 * strength).toFixed(3)};
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float gust = 0.5 + 0.5 * sin(uTime * 0.7 + ip.x * 0.05);
          float sway = sin(uTime * (1.3 + uWind) + ph) * (0.25 + uWind * 1.2) + uWind * gust * 1.6;
          mvPosition.xz += uWindDir * sway * k;
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}
