import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { B, N, World, heightAt, idx } from '../world/island';
import { hash, vnoise } from '../world/noise';
import { swayMaterial, toon } from './materials';
import { CH } from './terrain';

// ---------- geometry helpers ----------
type Part = { g: THREE.BufferGeometry; c: number | number[]; m?: THREE.Matrix4 };

/** Bake a solid colour (or per-face colour list) into a geometry so many parts can share one material. */
function colored(g: THREE.BufferGeometry, c: number | number[], m?: THREE.Matrix4) {
  g = g.index ? g.toNonIndexed() : g.clone();
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), tmp = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    tmp.set(Array.isArray(c) ? c[(i / 3) % c.length] : c);
    for (let k = 0; k < 3; k++) col.set([tmp.r, tmp.g, tmp.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (parts: Part[]) => mergeGeometries(parts.map(p => colored(p.g, p.c, p.m)));
const M = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** Lumpy leaf blob with smooth (spherical) normals and leaf-clump speckle. */
function blob(seed: number, base: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise(x * 2.2 + 9, y * 2.2 + z * 1.7, seed) - 0.5) * 0.34;
    n.setXYZ(i, x, y, z); p.setXYZ(i, x * k, y * k * 0.88, z * k);
  }
  const c = new THREE.Color(base), cols: number[] = [];
  for (let t = 0; t < p.count / 3; t++) {
    const r = hash(t, seed, 7), f = r < 0.28 ? 0.84 : r > 0.86 ? 1.14 : 1;
    cols.push(c.clone().multiplyScalar(f).getHex());
  }
  return { g, cols };
}
function blobPart(seed: number, base: number, m: THREE.Matrix4, detail = 1): Part { const b = blob(seed, base, detail); return { g: b.g, c: b.cols, m }; }
/** A leafy blob geometry with baked vertex colours (for one-off props like the giant tree). */
export const leafBlob = (seed: number, base: number) => merge([blobPart(seed, base, new THREE.Matrix4(), 2)]);

const TRUNK = 0x6b4a2b, TRUNK_D = 0x4e3420;

function broadleafGeo(v: number) {
  const parts: Part[] = [{ g: new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6), c: TRUNK, m: M(0, 0.8, 0) }];
  const greens = [[0x2f7434, 0x266a35, 0x3a823a], [0x3a7a2a, 0x2e6e2c, 0x4a8a34], [0x24664a, 0x2a6e3e, 0x357a44]][v];
  parts.push(blobPart(10 + v, greens[0], M(0, 2.1, 0, 1.25, 1.05, 1.25)));
  parts.push(blobPart(20 + v, greens[1], M(0.65, 2.75, 0.2, 0.8)));
  parts.push(blobPart(30 + v, greens[2], M(-0.5, 2.85, 0.35, 0.68)));
  if (v !== 1) parts.push(blobPart(40 + v, greens[1], M(0.1, 1.95, -0.7, 0.75)));
  return merge(parts);
}
function meadowTreeGeo() {
  return merge([
    { g: new THREE.CylinderGeometry(0.13, 0.2, 1.3, 6), c: TRUNK, m: M(0, 0.65, 0) },
    blobPart(51, 0x5eae4e, M(0, 1.75, 0, 1.0, 0.9, 1.0)),
    blobPart(52, 0x6dbb57, M(0.3, 2.25, 0.25, 0.6)),
  ]);
}
function palmGeo(v: number) {
  const parts: Part[] = [];
  const lean = 0.18 + v * 0.06; let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    const a = lean * i * 0.32;
    parts.push({ g: new THREE.CylinderGeometry(0.11, 0.13, 0.58, 5), c: i % 2 ? 0x8a6238 : 0x9c7448, m: M(x, y + 0.29, 0, 1, 1, 1, 0, 0, -a) });
    x += Math.sin(a) * 0.56; y += Math.cos(a) * 0.56;
  }
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2;
    const frond = new THREE.BoxGeometry(0.3, 0.05, 1.5);
    parts.push({ g: frond, c: k % 2 ? 0x4c9b43 : 0x5aa84a, m: new THREE.Matrix4().makeTranslation(x, y, 0).multiply(new THREE.Matrix4().makeRotationY(ang)).multiply(M(0, -0.25, 0.68, 1, 1, 1, 0.5)) });
  }
  parts.push({ g: new THREE.SphereGeometry(0.12, 5, 4), c: 0x5a3a1a, m: M(x + 0.12, y - 0.1, 0.05) });
  return merge(parts);
}
function bushGeo(v: number) {
  const g = [0x2f7434, 0x3f8a3c, 0x2a6640][v % 3];
  return merge([blobPart(60 + v, g, M(0, 0.4, 0, 0.75, 0.55, 0.75)), blobPart(70 + v, [0x3f8a3c, 0x4c9b43, 0x357a44][v % 3], M(0.35, 0.5, 0.15, 0.45))]);
}
function bambooGeo() {
  const parts: Part[] = [];
  for (let i = 0; i < 9; i++) {
    const a = hash(i, 1, 80) * 6.28, r = hash(i, 2, 80) * 0.8, h = 3.5 + hash(i, 3, 80) * 2.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    parts.push({ g: new THREE.CylinderGeometry(0.06, 0.07, h, 5), c: i % 2 ? 0x8fbf4a : 0x7aaa3c, m: M(x, h / 2, z, 1, 1, 1, (hash(i, 4, 80) - 0.5) * 0.15, 0, (hash(i, 5, 80) - 0.5) * 0.15) });
    parts.push(blobPart(90 + i, 0x6aa848, M(x, h, z, 0.45, 0.3, 0.45), 0));
  }
  return merge(parts);
}
function mangroveGeo() {
  const parts: Part[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; parts.push({ g: new THREE.CylinderGeometry(0.05, 0.07, 1.3, 4), c: TRUNK_D, m: M(Math.cos(a) * 0.45, 0.5, Math.sin(a) * 0.45, 1, 1, 1, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5) }); }
  parts.push({ g: new THREE.CylinderGeometry(0.12, 0.16, 1.2, 5), c: TRUNK_D, m: M(0, 1.5, 0) });
  parts.push(blobPart(100, 0x2f6a34, M(0, 2.3, 0, 1.1, 0.75, 1.1)), blobPart(101, 0x3c7a3c, M(0.4, 2.6, 0.2, 0.6)));
  return merge(parts);
}
function reedsGeo() {
  const parts: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const a = hash(i, 1, 110) * 6.28, r = hash(i, 2, 110) * 0.5, h = 0.8 + hash(i, 3, 110) * 0.7;
    parts.push({ g: new THREE.ConeGeometry(0.05, h, 3), c: i % 3 ? 0x5a8a3a : 0x7a9a4a, m: M(Math.cos(a) * r, h / 2, Math.sin(a) * r, 1, 1, 1, (hash(i, 4, 110) - 0.5) * 0.4, 0, (hash(i, 5, 110) - 0.5) * 0.4) });
    if (i % 3 === 0) parts.push({ g: new THREE.CylinderGeometry(0.06, 0.06, 0.25, 4), c: 0x6a4a2a, m: M(Math.cos(a) * r, h * 0.9, Math.sin(a) * r) });
  }
  return merge(parts);
}
function grassGeo() {
  const parts: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28, h = 0.45 + hash(i, 3, 120) * 0.35;
    parts.push({ g: new THREE.ConeGeometry(0.07, h, 3), c: i % 2 ? 0x5eae4e : 0x7cc35d, m: M(Math.cos(a) * 0.18, h / 2, Math.sin(a) * 0.18, 1, 1, 1, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35) });
  }
  return merge(parts);
}
function rockGeo(v: number) {
  const g = new THREE.DodecahedronGeometry(0.6, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + hash(Math.round(p.getX(i) * 50), Math.round(p.getZ(i) * 50) + v, 130) * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
  return merge([{ g, c: [0x9a968c, 0x8a867c, 0xa8a498, 0x7c786e], m: M(0, 0.25, 0) }]);
}
function deadTreeGeo() {
  return merge([
    { g: new THREE.CylinderGeometry(0.1, 0.18, 2.2, 5), c: 0x5a4a3a, m: M(0, 1.1, 0) },
    { g: new THREE.CylinderGeometry(0.05, 0.08, 1.0, 4), c: 0x5a4a3a, m: M(0.3, 1.8, 0, 1, 1, 1, 0, 0, -0.8) },
    { g: new THREE.CylinderGeometry(0.04, 0.07, 0.8, 4), c: 0x5a4a3a, m: M(-0.25, 1.5, 0.1, 1, 1, 1, 0.3, 0, 0.9) },
  ]);
}
function stumpGeo() {
  return merge([{ g: new THREE.CylinderGeometry(0.22, 0.28, 0.4, 6), c: TRUNK, m: M(0, 0.2, 0) }, { g: new THREE.CylinderGeometry(0.09, 0.1, 1.6, 4), c: TRUNK_D, m: M(0.6, 0.12, 0.1, 1, 1, 1, 0, 0.3, 1.5) }]);
}

// ---------- kinds ----------
interface Kind { geo: THREE.BufferGeometry; mat: THREE.Material; max: number; shadow: boolean; }
const KINDS = ['broad0', 'broad1', 'broad2', 'meadow', 'palm0', 'palm1', 'bush0', 'bush1', 'bush2', 'bamboo', 'mangrove', 'reeds', 'grass', 'rock0', 'rock1', 'dead', 'stump'] as const;
type KindName = typeof KINDS[number];

export class Vegetation {
  group = new THREE.Group();
  private kinds = new Map<KindName, Kind & { mesh: THREE.InstancedMesh }>();
  private cache = new Map<number, Map<KindName, number[]>>(); // chunk -> kind -> [x,y,z,rot,scale,r,g,b]*
  private lastKey = '';

  constructor(private w: World) {
    const leaf = swayMaterial({ vertexColors: true }, 1, 1.4);
    const low = swayMaterial({ vertexColors: true }, 2.2, 0.1);
    const palmM = swayMaterial({ vertexColors: true }, 1.4, 1.0);
    const still = toon({ vertexColors: true });
    const def: Record<KindName, [THREE.BufferGeometry, THREE.Material, number, boolean]> = {
      broad0: [broadleafGeo(0), leaf, 9000, true], broad1: [broadleafGeo(1), leaf, 9000, true], broad2: [broadleafGeo(2), leaf, 9000, true],
      meadow: [meadowTreeGeo(), leaf, 3000, true], palm0: [palmGeo(0), palmM, 3000, true], palm1: [palmGeo(1), palmM, 3000, true],
      bush0: [bushGeo(0), low, 8000, true], bush1: [bushGeo(1), low, 8000, true], bush2: [bushGeo(2), low, 8000, true],
      bamboo: [bambooGeo(), palmM, 3000, true], mangrove: [mangroveGeo(), leaf, 3000, true], reeds: [reedsGeo(), low, 6000, false],
      grass: [grassGeo(), low, 16000, false], rock0: [rockGeo(0), still, 4000, true], rock1: [rockGeo(1), still, 4000, true],
      dead: [deadTreeGeo(), still, 1000, true], stump: [stumpGeo(), still, 1000, true],
    };
    for (const k of KINDS) {
      const [geo, mat, max, shadow] = def[k];
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
      this.group.add(mesh);
      this.kinds.set(k, { geo, mat, max, shadow, mesh });
    }
  }

  /** Re-fill the instanced meshes with plants from chunks around the camera. */
  update(cx: number, cz: number, radiusUnits: number) {
    const r = Math.ceil(radiusUnits / CH) + 1, ccx = Math.floor(cx / CH), ccz = Math.floor(cz / CH);
    const key = `${ccx},${ccz},${r}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const counts = new Map<KindName, number>(KINDS.map(k => [k, 0]));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (let z = ccz - r; z <= ccz + r; z++) for (let x = ccx - r; x <= ccx + r; x++) {
      if (x < 0 || z < 0 || x >= N / CH || z >= N / CH) continue;
      for (const [k, arr] of this.chunk(x, z)) {
        const K = this.kinds.get(k)!;
        let n = counts.get(k)!;
        for (let i = 0; i < arr.length && n < K.max; i += 8, n++) {
          p.set(arr[i], arr[i + 1], arr[i + 2]); q.setFromAxisAngle(up, arr[i + 3]); s.setScalar(arr[i + 4]);
          K.mesh.setMatrixAt(n, m.compose(p, q, s));
          K.mesh.setColorAt(n, c.setRGB(arr[i + 5], arr[i + 6], arr[i + 7]));
        }
        counts.set(k, n);
      }
    }
    for (const [k, K] of this.kinds) {
      K.mesh.count = counts.get(k)!;
      K.mesh.instanceMatrix.needsUpdate = true;
      if (K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true;
    }
  }

  private chunk(cx: number, cz: number) {
    const key = cz * 1000 + cx;
    let out = this.cache.get(key);
    if (out) return out;
    out = new Map();
    const w = this.w;
    const add = (k: KindName, x: number, z: number, scale: number, tint = 1, tr = 1, tg = 1, tb = 1) => {
      let a = out!.get(k); if (!a) out!.set(k, (a = []));
      const rot = hash(x * 13 | 0, z * 13 | 0, 5) * 6.283;
      a.push(x, heightAt(w, x, z) - 0.08, z, rot, scale, tint * tr, tint * tg, tint * tb);
    };
    const slope = (x: number, z: number) => Math.max(Math.abs(heightAt(w, x + 1, z) - heightAt(w, x - 1, z)), Math.abs(heightAt(w, x, z + 1) - heightAt(w, x, z - 1))) / 2;
    const step = 2.1;
    for (let gz = cz * CH; gz < (cz + 1) * CH; gz += step) for (let gx = cx * CH; gx < (cx + 1) * CH; gx += step) {
      const r1 = hash(gx * 10 | 0, gz * 10 | 0, 1), r2 = hash(gx * 10 | 0, gz * 10 | 0, 2), r3 = hash(gx * 10 | 0, gz * 10 | 0, 3);
      const x = gx + r1 * step, z = gz + r2 * step;
      if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue;
      const i = idx(x, z), b = w.biome[i], h = w.h[i];
      if (h < 0.15 || w.clear[i]) {
        if (w.clear[i] && b === B.Dirt && r3 < 0.06) add('stump', x, z, 0.9 + r1 * 0.4);
        continue;
      }
      const sl = slope(x, z), rd = w.riverDist[i];
      if (rd < 2.6) continue;
      if (rd < 4.5 && r3 < 0.35 && b !== B.Beach) { add('reeds', x, z, 0.9 + r1 * 0.5); continue; }
      if (sl > 0.9) { if (r3 < 0.04) add(r1 < 0.5 ? 'rock0' : 'rock1', x, z, 0.8 + r2); continue; }
      const tint = 0.88 + r2 * 0.24, dens = vnoise(x / 9, z / 9, 77);
      switch (b) {
        case B.Jungle:
          if (r3 < 0.5 + dens * 0.25) add((['broad0', 'broad1', 'broad2'] as const)[(r1 * 3) | 0], x, z, 0.95 + r2 * 0.7 + dens * 0.3, tint);
          else if (r3 < 0.85) add((['bush0', 'bush1', 'bush2'] as const)[(r2 * 3) | 0], x, z, 0.8 + r1 * 0.7, tint);
          else if (h < 3 && r3 < 0.92) add(r1 < 0.5 ? 'palm0' : 'palm1', x, z, 0.95 + r2 * 0.4, tint);
          else if (r3 < 0.95) add('rock0', x, z, 0.5 + r1 * 0.5);
          break;
        case B.Bamboo:
          if (r3 < 0.45) add('bamboo', x, z, 0.85 + r1 * 0.4, tint);
          else if (r3 < 0.6) add('broad1', x, z, 1 + r2 * 0.4, tint);
          else if (r3 < 0.75) add('bush1', x, z, 0.9, tint);
          break;
        case B.Grass: case B.Flowers:
          if (r3 < 0.035 * (0.5 + dens * 2)) add('meadow', x, z, 0.9 + r1 * 0.6, tint);
          else if (r3 < 0.08) add('bush1', x, z, 0.6 + r1 * 0.6, tint, 1.05, 1.1, 1);
          else if (r3 < 0.42) add('grass', x + 0.6, z, 0.8 + r1 * 0.7, tint);
          else if (r3 < 0.44) add('rock1', x, z, 0.4 + r1 * 0.5);
          break;
        case B.Beach:
          if (h > 0.55 && r3 < 0.07) add(r1 < 0.5 ? 'palm0' : 'palm1', x, z, 0.9 + r2 * 0.5, tint);
          else if (r3 < 0.085) add('rock0', x, z, 0.4 + r1 * 0.8);
          break;
        case B.TideRock:
          if (r3 < 0.18) add(r1 < 0.5 ? 'rock0' : 'rock1', x, z, 0.6 + r2 * 1.2, 0.85);
          break;
        case B.Highland:
          if (r3 < 0.06) add(r1 < 0.5 ? 'rock0' : 'rock1', x, z, 0.7 + r2 * 1.4);
          else if (r3 < 0.13) add('bush0', x, z, 0.7 + r1 * 0.5, tint, 1.05, 1.0, 0.85);
          else if (r3 < 0.16) add('meadow', x, z, 0.8 + r1 * 0.4, tint, 1.0, 0.95, 0.85);
          else if (r3 < 0.3) add('grass', x, z, 0.7 + r1 * 0.5, tint, 1.0, 0.92, 0.8);
          break;
        case B.Volcanic:
          if (r3 < 0.07) add(r1 < 0.5 ? 'rock0' : 'rock1', x, z, 0.7 + r2 * 1.5, 0.7);
          else if (r3 < 0.085) add('dead', x, z, 0.8 + r1 * 0.5);
          break;
        case B.Swamp:
          if (r3 < 0.25) add('mangrove', x, z, 0.9 + r1 * 0.5, tint);
          else if (r3 < 0.55) add('reeds', x, z, 0.9 + r1 * 0.5, tint);
          else if (r3 < 0.62) add('bush2', x, z, 0.8, tint);
          break;
      }
    }
    this.cache.set(key, out);
    return out;
  }
}
