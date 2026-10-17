import * as THREE from 'three';
import { N, World } from '../world/island';
import { GLSL_COMMON, U } from './shared';
import { toonRamp } from './materials';

export const CH = 32; // chunk size in world units

/** Height + biome data uploaded once for every shader that needs to know about the ground. */
export function uploadWorldTextures(w: World) {
  const ht = new THREE.DataTexture(w.h, N, N, THREE.RedFormat, THREE.FloatType);
  ht.magFilter = ht.minFilter = THREE.NearestFilter; ht.needsUpdate = true;
  const bd = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    bd[i * 4] = w.biome[i]; bd[i * 4 + 1] = Math.min(255, w.moist[i] * 255);
    bd[i * 4 + 2] = Math.min(255, w.riverDist[i] * 8); bd[i * 4 + 3] = w.clear[i] * 255;
  }
  const bt = new THREE.DataTexture(bd, N, N, THREE.RGBAFormat);
  bt.magFilter = bt.minFilter = THREE.NearestFilter; bt.needsUpdate = true;
  U.uHeight.value = ht; U.uBiome.value = bt;
}

const GROUND = /* glsl */ `
vec3 P = vWorld; vec2 pc = pixCoord(P);
float r = h21(pc), G = uGrain;
float cl = vn(pc * 0.4);                         // soft 2-3px clumps instead of single-pixel noise
vec2 jit = (vec2(h21(pc + 3.1), h21(pc + 7.7)) - 0.5) * (0.35 + G * 1.25);
vec4 bd = texture2D(uBiome, (P.xz + jit + 0.5) / uN);
float bio = floor(bd.r * 255.0 + 0.5);
float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
float patchv = vn(P.xz * 0.22) * 0.7 + vn(P.xz * 0.9) * 0.3 + (mix(cl, r, G) - 0.5) * 0.1;
vec3 col; float tuftDens = 0.0, flowerDens = 0.0; vec3 tuftCol = vec3(0.18, 0.43, 0.2), tipCol = vec3(0.44, 0.75, 0.33);
if (bio < 0.5 || bio > 10.5) {                      // sea / lake / lagoon bed
  col = mix(vec3(0.86, 0.78, 0.56), vec3(0.55, 0.62, 0.5), step(0.6, patchv));
} else if (bio < 1.5) {                              // beach
  col = cl > 0.74 - G * 0.1 ? vec3(0.9, 0.8, 0.58) : vec3(0.937, 0.863, 0.651);
  if (r > 1.0 - 0.007 * G) col = vec3(0.98, 0.965, 0.91);
  if (P.y - uTide < 0.13 + (cl - 0.5) * 0.06) col = vec3(0.80, 0.69, 0.48);
} else if (bio < 2.5 || (bio > 7.5 && bio < 8.5)) { // grass + flower fields
  col = patchv > 0.6 ? vec3(0.49, 0.77, 0.36) : patchv > 0.48 ? vec3(0.42, 0.72, 0.32) : patchv > 0.36 ? vec3(0.37, 0.66, 0.3) : vec3(0.31, 0.59, 0.27);
  if (r < 0.035 * G) col = vec3(0.27, 0.53, 0.24); else if (r > 1.0 - 0.018 * G) col = vec3(0.6, 0.83, 0.42);
  tuftDens = 0.022; flowerDens = bio > 7.5 ? 0.09 : 0.006;
  tuftCol = vec3(0.26, 0.52, 0.22); tipCol = vec3(0.6, 0.84, 0.42);
} else if (bio < 3.5 || (bio > 6.5 && bio < 7.5)) { // jungle + bamboo floor
  col = patchv > 0.6 ? vec3(0.27, 0.55, 0.25) : patchv > 0.46 ? vec3(0.22, 0.48, 0.21) : patchv > 0.34 ? vec3(0.19, 0.42, 0.19) : vec3(0.16, 0.36, 0.17);
  if (bio > 6.5) col = mix(col, vec3(0.45, 0.6, 0.25), 0.35);
  if (cl > 0.8 - G * 0.06) col = mix(col, vec3(0.36, 0.33, 0.17), 0.6); else if (r > 1.0 - 0.015 * G) col = vec3(0.4, 0.62, 0.3);
  tuftDens = 0.03; tuftCol = vec3(0.12, 0.3, 0.13); tipCol = vec3(0.32, 0.6, 0.28); flowerDens = 0.0015;
} else if (bio < 4.5) {                              // highland: rocky grass
  float rocky = step(0.55, vn(P.xz * 0.35) + (mix(cl, r, G) - 0.5) * 0.2);
  col = mix(patchv > 0.5 ? vec3(0.47, 0.62, 0.33) : vec3(0.41, 0.56, 0.3), cl < 0.5 ? vec3(0.6, 0.56, 0.48) : vec3(0.53, 0.49, 0.42), rocky);
  tuftDens = 0.012 * (1.0 - rocky); tuftCol = vec3(0.3, 0.45, 0.22); tipCol = vec3(0.62, 0.72, 0.4);
} else if (bio < 5.5) {                              // volcanic rock + ash
  col = patchv > 0.55 ? vec3(0.44, 0.41, 0.39) : patchv > 0.42 ? vec3(0.37, 0.34, 0.33) : vec3(0.31, 0.29, 0.28);
  if (r < 0.06 * G) col = vec3(0.24, 0.22, 0.21); else if (r > 1.0 - 0.03 * G) col = vec3(0.55, 0.52, 0.49);
} else if (bio < 6.5) {                              // swamp
  col = patchv > 0.55 ? vec3(0.3, 0.38, 0.2) : patchv > 0.42 ? vec3(0.26, 0.33, 0.18) : vec3(0.22, 0.37, 0.35);
  if (vn(P.xz * 0.5) > 0.68) col = vec3(0.23, 0.38, 0.38) + step(1.0 - 0.03 * G, r) * 0.2;
  tuftDens = 0.035; tuftCol = vec3(0.2, 0.3, 0.14); tipCol = vec3(0.45, 0.55, 0.25);
} else if (bio < 9.5) {                              // tide-pool rocks
  col = cl < 0.5 ? vec3(0.42, 0.42, 0.41) : vec3(0.5, 0.49, 0.47);
  if (vn(P.xz * 0.6) > 0.64) col = vec3(0.25, 0.62, 0.68) + step(1.0 - 0.05 * G, r) * 0.25;
} else {                                             // dirt (camp, crash scar)
  float dv = mix(cl, r, G);
  col = dv < 0.55 ? vec3(0.64, 0.53, 0.35) : dv < 0.75 ? vec3(0.55, 0.45, 0.29) : vec3(0.47, 0.38, 0.25);
}
// rock faces
if (slope > 0.42 && bio > 0.5 && bio < 10.5) {
  float band = mod(floor(P.y * 1.6 + vn(P.xz * 0.35) * 1.3), 3.0);
  vec3 rc = band < 0.5 ? vec3(0.63, 0.56, 0.44) : band < 1.5 ? vec3(0.53, 0.47, 0.38) : vec3(0.44, 0.38, 0.3);
  if (bio > 4.5 && bio < 5.5) rc *= vec3(0.75, 0.74, 0.76);
  if (r < 0.07 * G) rc *= 0.8;
  if (h21(floor(pc / vec2(1.0, 4.0)) + 9.0) < 0.06) rc *= 0.62;
  col = rc; tuftDens = 0.0; flowerDens = 0.0;
} else if (slope > 0.26 && tuftDens > 0.0) { col *= 0.72; }
// tufts (5-pixel sprouts) and flowers, drawn on the screen-pixel grid
if (tuftDens > 0.0) {
  float d = tuftDens * (0.6 + patchv);
  #define TC(o) step(h21((pc - o) * 1.37 + 11.0), d)
  float body = max(max(TC(vec2(0.0)), TC(vec2(-1.0, 0.0))), max(TC(vec2(1.0, 0.0)), TC(vec2(0.0, 1.0))));
  float tip = max(max(TC(vec2(-1.0, 1.0)), TC(vec2(1.0, 1.0))), TC(vec2(0.0, 2.0)));
  if (tip > 0.5) col = tipCol; else if (body > 0.5) col = tuftCol;
}
if (flowerDens > 0.0 && step(h21(pc * 0.71 + 5.0), flowerDens) > 0.5) {
  float fc = h21(pc + 2.0);
  col = fc < 0.25 ? vec3(0.96, 0.88, 0.42) : fc < 0.5 ? vec3(0.94, 0.54, 0.63) : fc < 0.75 ? vec3(1.0) : vec3(0.71, 0.55, 0.94);
}
// contact shadow at cliff bases
float hc = P.y;
float ao = max(max(terrainH(P.xz + vec2(1.6, 0.0)), terrainH(P.xz - vec2(1.6, 0.0))), max(terrainH(P.xz + vec2(0.0, 1.6)), terrainH(P.xz - vec2(0.0, 1.6)))) - hc;
if (ao > 1.1 && slope < 0.42) col *= 0.78;
col *= mix(1.0, 0.74, cloudShade(P.xz));
col *= 1.0 - uWet * 0.22;
diffuseColor.rgb = col;
`;

export function makeGroundMaterial() {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonRamp() });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN;\n' + GLSL_COMMON)
      .replace('#include <map_fragment>', GROUND);
  };
  return m;
}

export class Terrain {
  group = new THREE.Group();
  constructor(w: World) {
    const mat = makeGroundMaterial();
    const n = N / CH;
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
      let maxH = -99;
      for (let z = cz * CH; z <= Math.min(N - 1, (cz + 1) * CH); z++) for (let x = cx * CH; x <= Math.min(N - 1, (cx + 1) * CH); x++) maxH = Math.max(maxH, w.h[z * N + x]);
      if (maxH < -3) continue;
      const m = new THREE.Mesh(chunkGeometry(w, cx, cz), mat);
      m.receiveShadow = m.castShadow = true;
      this.group.add(m);
    }
  }
}

function chunkGeometry(w: World, cx: number, cz: number) {
  const V = CH + 1, pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3);
  const H = (x: number, z: number) => w.h[Math.min(N - 1, Math.max(0, z)) * N + Math.min(N - 1, Math.max(0, x))];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = cx * CH + i, z = cz * CH + j, k = (j * V + i) * 3;
    pos[k] = x; pos[k + 1] = H(x, z); pos[k + 2] = z;
    const nx = H(x - 1, z) - H(x + 1, z), nz = H(x, z - 1) - H(x, z + 1), l = Math.hypot(nx, 2, nz);
    nor[k] = nx / l; nor[k + 1] = 2 / l; nor[k + 2] = nz / l;
  }
  const ind = new Uint16Array(CH * CH * 6);
  let t = 0;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    // split along the diagonal that best follows the terrain
    if (Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]) < Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) { ind.set([a, c, d, a, d, b], t); }
    else { ind.set([a, c, b, b, c, d], t); }
    t += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

