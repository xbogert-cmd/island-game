import * as THREE from 'three';
import { Landmark, World, heightAt } from '../world/island';
import { hash } from '../world/noise';
import { TEX, toon } from './materials';
import { leafBlob } from './vegetation';

type Mat = THREE.Material;
const tex = { metal: TEX.metal(), rust: TEX.rust(), stone: TEX.stone(), plank: TEX.plank(), thatch: TEX.thatch(), tarpO: TEX.tarp('#e07a3a', '#c05a2a'), tarpB: TEX.tarp('#3a6fb0', '#2a5590'), tarpOld: TEX.tarp('#8a8a6a', '#6a6a50') };
const MAT = {
  white: toon({ map: tex.metal }), whiteBare: toon({ color: 0xe9edf2 }), dark: new THREE.MeshBasicMaterial({ color: 0x14161c }),
  inner: toon({ color: 0x2a2d36, side: THREE.BackSide }), win: toon({ color: 0x26334d }), blue: toon({ color: 0x2a5aa8 }), red: toon({ color: 0xc8453a }),
  grey: toon({ color: 0x9aa0a8, map: tex.metal }), rust: toon({ map: tex.rust }), stone: toon({ map: tex.stone }), stoneD: toon({ map: tex.stone, color: 0xb8b0a0 }),
  moss: toon({ color: 0x4f7a34 }), plank: toon({ map: tex.plank }), plankD: toon({ map: tex.plank, color: 0x8a7a68 }), wood: toon({ color: 0x6b4a2b }),
  woodD: toon({ color: 0x4e3420 }), bark: toon({ color: 0x8a6440 }), rock: toon({ color: 0x8d8a80 }), rockD: toon({ color: 0x6a665e }), char: toon({ color: 0x2a2420 }),
  tarpO: toon({ map: tex.tarpO, side: THREE.DoubleSide }), tarpB: toon({ map: tex.tarpB, side: THREE.DoubleSide }), tarpOld: toon({ map: tex.tarpOld, side: THREE.DoubleSide }),
  sail: toon({ color: 0xcfc3a0, side: THREE.DoubleSide }), black: toon({ color: 0x1a1a1a }), seat: toon({ color: 0x34508a }),
  leafV: toon({ vertexColors: true }), vine: toon({ color: 0x2e5a2a }),
  bags: [0x7a4a2a, 0x3a5fa0, 0xa03a3a, 0x3a7a4a, 0xd0a040, 0x5a3a6a, 0x2a2a2a].map(c => toon({ color: c })),
};

/** Builds meshes with a tiny fluent helper so landmark code reads like a recipe. */
class Kit {
  constructor(public g: THREE.Object3D) {}
  add(geo: THREE.BufferGeometry, mat: Mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
    m.castShadow = m.receiveShadow = true; this.g.add(m); return m;
  }
  box(w: number, h: number, d: number, mat: Mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  cyl(rt: number, rb: number, h: number, mat: Mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz); }
  rock(r: number, x: number, y: number, z: number, mat: Mat = MAT.rock, seed = 0) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), mat, x, y, z, hash(seed, 1, 3) * 3, hash(seed, 2, 3) * 3, 0, [1, 0.7 + hash(seed, 3, 3) * 0.3, 1]);
  }
}

export interface PropsOut { group: THREE.Group; fires: { x: number; y: number; z: number; light: THREE.PointLight; flames: THREE.Mesh[] }[]; steam: { x: number; y: number; z: number; rate: number }[] }

export function buildProps(w: World): PropsOut {
  const group = new THREE.Group();
  const out: PropsOut = { group, fires: [], steam: [] };
  const at = (l: Landmark, fn: (k: Kit, l: Landmark) => void, yOff = 0) => {
    const g = new THREE.Group(); g.position.set(l.x, heightAt(w, l.x, l.z) + yOff, l.z); g.rotation.y = -l.rot;
    fn(new Kit(g), l); group.add(g); return g;
  };
  for (const l of w.landmarks) {
    switch (l.kind) {
      case 'fuselage': at(l, fuselage, 0); scatterDebris(w, group, l); break;
      case 'wing': at(l, (k) => { k.box(10, 0.28, 2.8, MAT.grey, 0, 0.05, 0, 0.08, 0.2, 0.06); k.box(1.2, 0.6, 2.2, MAT.grey, -4, 0.3, 0); k.cyl(0.25, 0.25, 0.5, MAT.red, 4.8, 0.3, 0.8); }, -0.1); break;
      case 'tail': at(l, tailSection, 0); break;
      case 'engine': at(l, engine, 0); break;
      case 'campfire': { const g = at(l, campCamp, 0); const light = new THREE.PointLight(0xff9040, 0, 22, 1.4); light.position.set(0, 1.4, 0); g.add(light);
        out.fires.push({ x: l.x, y: g.position.y, z: l.z, light, flames: g.userData.flames }); break; }
      case 'ruins': at(l, ruins, 0); break;
      case 'shipwreck': at(l, shipwreck, -0.4); break;
      case 'abandonedCamp': at(l, abandonedCamp, 0); break;
      case 'radioTower': at(l, radioTower, 0); break;
      case 'giantTree': at(l, giantTree, 0); break;
      case 'hotSpring': at(l, (k, l) => { for (let i = 0; i < 11; i++) { const a = (i / 11) * 6.28; k.rock(0.5 + hash(i, 1, 9) * 0.4, Math.cos(a) * l.r * 0.95, 0.1, Math.sin(a) * l.r * 0.95, MAT.rockD, i); } }); out.steam.push({ x: l.x, y: heightAt(w, l.x, l.z) + 0.2, z: l.z, rate: 3 }); break;
      case 'steamVent': at(l, (k) => { for (let i = 0; i < 5; i++) k.rock(0.4 + hash(i, 4, 9) * 0.5, (hash(i, 5, 9) - 0.5) * 1.6, 0.1, (hash(i, 6, 9) - 0.5) * 1.6, MAT.rockD, i + 20); }); out.steam.push({ x: l.x, y: heightAt(w, l.x, l.z) + 0.5, z: l.z, rate: 2 }); break;
      case 'cave': {
        // walk outward from the cliff top to its foot, then set the mouth into the face
        let x = l.x, z = l.z; const dx = Math.cos(l.rot), dz = Math.sin(l.rot);
        for (let k = 0; k < 40 && heightAt(w, x, z) > 1.2; k++) { x += dx * 0.5; z += dz * 0.5; }
        at({ ...l, x: x - dx * 1.2, z: z - dz * 1.2 }, cave, 0); break;
      }
    }
  }
  return out;
}

// ---------- recipes (local +x is "along", local +z faces the camera side at rot 0) ----------
function fuselage(k: Kit) {
  const body = new THREE.Group(); body.rotation.set(0.06, 0, 0.05); body.position.y = 1.15; k.g.add(body);
  const b = new Kit(body);
  b.cyl(1.6, 1.6, 13, MAT.whiteBare, 0, 0, 0, 0, 0, Math.PI / 2, 16);
  b.add(new THREE.CylinderGeometry(1.55, 1.55, 12.9, 16, 1, true), MAT.inner, 0, 0, 0, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(1.63, 1.63, 13, 16, 1, true, Math.PI * 0.62, Math.PI * 0.12), MAT.blue, 0, 0, 0, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(1.63, 1.63, 13, 16, 1, true, Math.PI * 1.26, Math.PI * 0.12), MAT.blue, 0, 0, 0, 0, 0, Math.PI / 2);
  const nose = b.add(new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.whiteBare, 6.5, 0, 0, 0, 0, -Math.PI / 2); nose.scale.set(1, 1.7, 1);
  for (const s of [1, -1]) {
    for (let i = 0; i < 11; i++) b.box(0.42, 0.42, 0.1, MAT.win, -5 + i * 1.0, 0.45, s * 1.57);
    b.box(0.7, 0.4, 0.1, MAT.win, 7.6, 0.6, s * 0.75, 0, s * 0.5, 0);
    b.box(0.8, 1.6, 0.06, MAT.grey, 4.6, -0.1, s * 1.6);
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; b.box(0.5, 0.5 + hash(i, 1, 4) * 0.9, 0.12, MAT.whiteBare, -6.6, Math.sin(a) * 1.55, Math.cos(a) * 1.55, a, 0, (hash(i, 2, 4) - 0.5) * 0.6); }
  b.box(2.4, 0.3, 1.2, MAT.grey, 0.5, -1.0, 1.9, 0.1, 0, 0);
}

function scatterDebris(w: World, group: THREE.Group, l: Landmark) {
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1, 40) * 6.28, r = 4 + hash(i, 2, 40) * 16;
    const x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r, y = heightAt(w, x, z);
    if (y < 0.1) continue;
    const kind = hash(i, 3, 40), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = hash(i, 4, 40) * 6.28; group.add(g);
    const k = new Kit(g);
    if (kind < 0.45) { const bag = MAT.bags[(hash(i, 5, 40) * MAT.bags.length) | 0]; k.box(0.75, 0.5, 0.28, bag, 0, 0.25, 0, 0, 0, hash(i, 6, 40) < 0.3 ? Math.PI / 2 : 0); }
    else if (kind < 0.65) { k.box(0.6, 0.12, 0.6, MAT.seat, 0, 0.3, 0); k.box(0.6, 0.7, 0.12, MAT.seat, 0, 0.6, -0.3, -0.2); k.box(0.08, 0.3, 0.5, MAT.grey, -0.3, 0.12, 0); k.box(0.08, 0.3, 0.5, MAT.grey, 0.3, 0.12, 0); }
    else k.box(0.8 + hash(i, 7, 40), 0.06, 0.6 + hash(i, 8, 40), MAT.grey, 0, 0.08, 0, (hash(i, 9, 40) - 0.5) * 0.4, 0, (hash(i, 10, 40) - 0.5) * 0.4);
  }
}

function tailSection(k: Kit) {
  const g = new THREE.Group(); g.rotation.set(0, 0, 0.35); g.position.y = 1.1; k.g.add(g);
  const t = new Kit(g);
  t.cyl(1.2, 1.5, 5, MAT.whiteBare, 0, 0, 0, 0, 0, Math.PI / 2, 14);
  t.add(new THREE.CylinderGeometry(1.45, 1.45, 4.9, 14, 1, true), MAT.inner, 0, 0, 0, 0, 0, Math.PI / 2);
  const fin = t.box(3.0, 3.6, 0.22, MAT.whiteBare, 1.4, 2.6, 0, 0, 0, -0.35); fin.scale.set(1, 1, 1);
  t.box(2.0, 1.2, 0.24, MAT.blue, 1.7, 3.3, 0, 0, 0, -0.35);
  t.box(2.4, 0.18, 5.2, MAT.whiteBare, 2.0, 0.5, 0, 0, 0, 0.05);
  for (let i = 0; i < 4; i++) k.cyl(0.18, 0.2, 3 + i, MAT.wood, -3 - i * 1.4, 0.3, 2 + hash(i, 1, 8) * 3, Math.PI / 2, hash(i, 2, 8) * 3, 0, 5);
}

function engine(k: Kit) {
  const g = new THREE.Group(); g.position.y = 0.75; g.rotation.set(0.15, 0, 0.1); k.g.add(g);
  const e = new Kit(g);
  e.cyl(0.95, 0.85, 2.6, MAT.grey, 0, 0, 0, 0, 0, Math.PI / 2, 14);
  e.add(new THREE.CircleGeometry(0.85, 14), MAT.dark, 1.31, 0, 0, 0, Math.PI / 2, 0);
  e.cyl(0.4, 0.2, 0.8, MAT.char, -1.6, 0, 0, 0, 0, Math.PI / 2, 10);
  for (let i = 0; i < 6; i++) e.box(0.3, 0.2, 0.3, MAT.grey, -0.5 + hash(i, 1, 12) * 3, -0.6, 1.2 + hash(i, 2, 12) * 2);
}

function campCamp(k: Kit) {
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; k.rock(0.32, Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8, MAT.rockD, i + 50); }
  for (let i = 0; i < 3; i++) k.cyl(0.09, 0.09, 1.1, MAT.wood, 0, 0.15, 0, Math.PI / 2, i * 1.05, 0, 5);
  const flames = [0xffd84a, 0xf7931e, 0xe0452a].map((c, i) => k.add(new THREE.ConeGeometry(0.32 - i * 0.04, 1.0, 5), new THREE.MeshBasicMaterial({ color: c }), (i - 1) * 0.16, 0.5, i === 1 ? 0.1 : -0.05));
  k.g.userData.flames = flames;
  for (const [x, z, r] of [[0, -2.4, 0], [2.4, 0.4, 1.4], [-2.2, 0.8, -1.2]]) k.cyl(0.24, 0.24, 2, MAT.wood, x, 0.24, z, 0, r, Math.PI / 2, 7);
  // lean-to shelters made from tarps and plane panels
  for (const [x, z, ry, m] of [[-5, -4, 0.6, MAT.tarpO], [4.5, -5, -0.5, MAT.tarpB]] as [number, number, number, Mat][]) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; k.g.add(s); const q = new Kit(s);
    // poles hold up the tarp's high edge, with a crossbar under it, so nothing pokes through
    q.cyl(0.07, 0.07, 1.86, MAT.wood, -1.35, 0.93, -1.62); q.cyl(0.07, 0.07, 1.86, MAT.wood, 1.35, 0.93, -1.62);
    q.cyl(0.06, 0.06, 2.8, MAT.wood, 0, 1.8, -1.6, 0, 0, Math.PI / 2);
    q.add(new THREE.PlaneGeometry(2.9, 2.6), m, 0, 1.1, -0.6, -0.95);
    q.box(1.6, 0.15, 0.8, MAT.bags[1], 0, 0.1, -0.7);
  }
}

function ruins(k: Kit, l: Landmark) {
  k.box(9, 0.6, 9, MAT.stone, 0, 0.3, 0); k.box(6, 0.6, 6, MAT.stone, 0, 0.9, 0); k.box(3.2, 0.5, 3.2, MAT.stoneD, 0, 1.45, 0);
  for (let i = 0; i < 4; i++) k.box(1.6, 0.3, 0.6, MAT.stone, 0, 0.3 + i * 0.3, 4.8 + i * 0.0 - i * 0.5);
  // broken walls around the platform
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * 6.28;
    for (let i = -4; i <= 4; i++) {
      if (hash(i, s, 21) < 0.3) continue;
      const hgt = 1 + Math.floor(hash(i, s, 22) * 3);
      for (let j = 0; j < hgt; j++) {
        const x = Math.cos(a) * 11 - Math.sin(a) * i * 1.3, z = Math.sin(a) * 11 + Math.cos(a) * i * 1.3;
        k.box(1.25, 0.8, 0.9, j % 2 ? MAT.stoneD : MAT.stone, x, 0.4 + j * 0.8, z, 0, -a + (hash(i, j, 23) - 0.5) * 0.1, 0);
      }
      if (hash(i, s, 24) < 0.35) k.box(1.3, 0.25, 1.0, MAT.moss, Math.cos(a) * 11 - Math.sin(a) * i * 1.3, 0.8 * hgt + 0.1, Math.sin(a) * 11 + Math.cos(a) * i * 1.3, 0, -a, 0);
    }
  }
  // pillars, some fallen
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + 0.3, x = Math.cos(a) * 6.5, z = Math.sin(a) * 6.5;
    if (hash(i, 1, 25) < 0.4) k.cyl(0.45, 0.5, 3.6, MAT.stone, x, 0.45, z, Math.PI / 2, a, 0, 8);
    else { k.cyl(0.45, 0.5, 3.2 + hash(i, 2, 25) * 1.6, MAT.stone, x, 1.6, z, 0, 0, 0, 8); k.box(1.1, 0.3, 1.1, MAT.stoneD, x, 3.3 + hash(i, 2, 25) * 1.6, z); }
  }
  // weathered statue heads
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 0.7, x = Math.cos(a) * 9, z = Math.sin(a) * 9, ry = -a - Math.PI / 2;
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.set(hash(i, 1, 26) * 0.15, ry, (hash(i, 2, 26) - 0.5) * 0.2); k.g.add(s); const q = new Kit(s);
    q.box(1.6, 1.0, 1.4, MAT.stoneD, 0, 0.5, 0); q.box(1.4, 2.6, 1.2, MAT.stone, 0, 2.3, 0); q.box(1.5, 0.4, 1.3, MAT.stoneD, 0, 3.7, 0);
    q.box(0.35, 0.2, 0.1, MAT.black, -0.32, 2.9, 0.62); q.box(0.35, 0.2, 0.1, MAT.black, 0.32, 2.9, 0.62);
    q.box(0.3, 0.7, 0.35, MAT.stoneD, 0, 2.4, 0.7); q.box(0.7, 0.15, 0.1, MAT.black, 0, 1.75, 0.62);
    q.box(1.5, 0.3, 1.3, MAT.moss, 0, 3.95, 0);
  }
  void l;
}

function shipwreck(k: Kit) {
  const g = new THREE.Group(); g.rotation.set(0.05, 0, 0.32); k.g.add(g); const s = new Kit(g);
  for (let i = 0; i < 9; i++) {
    const x = -5 + i * 1.2, w = 1.6 + Math.sin((i / 8) * Math.PI) * 1.4;
    if (i < 7) { s.box(1.25, 2.2, 0.16, MAT.plankD, x, 1.1, w, 0.2, 0, 0); }
    s.box(1.25, 2.2, 0.16, MAT.plankD, x, 1.1, -w, -0.2, 0, 0);
    s.box(1.25, 0.18, w * 2, MAT.plankD, x, 0.05, 0);
    s.box(0.2, 2.6, 0.2, MAT.woodD, x, 1.3, w + 0.05); // ribs
  }
  s.box(2, 0.2, 2.6, MAT.plank, 2, 2.0, 0);
  const mast = s.cyl(0.18, 0.22, 7, MAT.wood, 0.5, 4, 0, 0, 0, 0.5, 7);
  s.add(new THREE.PlaneGeometry(2.2, 2.6), MAT.sail, -0.6, 4.5, 0.2, 0.1, 0.3, 0.45);
  void mast;
  s.cyl(0.15, 0.18, 4, MAT.wood, -3, 1.8, -1.2, 0.3, 0, -1.2, 6);
}

function abandonedCamp(k: Kit) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; k.rock(0.3, Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75, MAT.rockD, i + 70); }
  k.cyl(0.6, 0.6, 0.05, MAT.char, 0, 0.03, 0, 0, 0, 0, 10);
  for (const [x, z, ry, fallen] of [[-4, -3, 0.4, 0], [3.5, -3.5, -0.6, 1]] as number[][]) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; k.g.add(s); const q = new Kit(s);
    q.cyl(0.07, 0.07, 2.2, MAT.woodD, -1.2, 1.0, 0, 0, 0, fallen ? 1.2 : 0.1); q.cyl(0.07, 0.07, 2.2, MAT.woodD, 1.2, 1.0, 0, 0, 0, -0.15);
    q.add(new THREE.PlaneGeometry(2.6, 2.4), MAT.tarpOld, 0, fallen ? 0.4 : 0.9, -0.5, fallen ? -1.4 : -1.05, 0, fallen ? 0.3 : 0);
  }
  for (let i = 0; i < 3; i++) k.box(0.8, 0.6, 0.6, MAT.plankD, 2 + i * 0.4, 0.3 + (i === 2 ? 0.6 : 0), 2 - (i === 2 ? 0.4 : i * 0.7), 0, hash(i, 1, 30), i === 1 ? 0.5 : 0);
  k.cyl(0.25, 0.2, 0.4, MAT.char, -1.4, 0.2, 1.4);
  k.cyl(0.12, 0.12, 2.4, MAT.woodD, -3, 1.2, 2.5);
  for (let i = 0; i < 5; i++) k.box(0.04, 0.3, 0.03, MAT.black, -3 + 0.12, 0.9 + (i % 5) * 0.0, 2.5 + 0.13, 0, 0, i === 4 ? 0.9 : 0).position.x += i * 0.05;
}

function radioTower(k: Kit) {
  const H = 16, base = 2.2, top = 0.6;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Vector3(sx * (base - top), H, sz * (base - top));
    const m = k.box(0.18, leg.length(), 0.18, MAT.rust, sx * (base + top) / 2, H / 2, sz * (base + top) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), leg.clone().multiplyScalar(-1).normalize().multiply(new THREE.Vector3(1, -1, 1)));
  }
  for (let y = 1.5; y < H; y += 2) {
    const r = base + (top - base) * (y / H);
    for (const [a, b] of [[[r, r], [r, -r]], [[r, -r], [-r, -r]], [[-r, -r], [-r, r]], [[-r, r], [r, r]]]) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      k.box(len, 0.1, 0.1, MAT.rust, mx, y, mz, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0);
      k.box(len * 1.1, 0.07, 0.07, MAT.rust, mx, y + 1, mz, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0.75);
    }
  }
  k.box(1.6, 0.15, 1.6, MAT.rust, 0, H, 0);
  k.cyl(0.05, 0.08, 4, MAT.grey, 0, H + 2, 0, 0, 0, 0, 5);
  k.box(0.5, 0.5, 0.15, MAT.grey, 0.3, H + 1.2, 0.1);
  k.cyl(0.12, 0.12, 0.2, MAT.red, 0, H + 4.1, 0, 0, 0, 0, 6);
  // shed
  k.box(2.4, 1.8, 2, MAT.plankD, 3.6, 0.9, 1.5); k.box(2.8, 0.12, 2.4, MAT.rust, 3.6, 1.9, 1.5, 0.12, 0, 0); k.box(0.7, 1.3, 0.05, MAT.dark, 3.6, 0.65, 2.52);
}

function giantTree(k: Kit) {
  k.cyl(1.3, 2.2, 13, MAT.bark, 0, 6.5, 0, 0, 0, 0, 10);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; k.box(0.5, 2.2, 2.6, MAT.wood, Math.cos(a) * 2.2, 0.9, Math.sin(a) * 2.2, 0, -a, 0); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28 + 0.4; k.cyl(0.35, 0.6, 6, MAT.wood, Math.cos(a) * 2.6, 11.5, Math.sin(a) * 2.6, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, 6); }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.28 + hash(i, 1, 33), r = i < 4 ? 2.5 : 6 + hash(i, 2, 33) * 3, y = 13 + hash(i, 3, 33) * 3.5 - (r > 6 ? 1.5 : -1.5);
    k.add(leafBlob(300 + i, [0x2f7434, 0x3a823a, 0x266a35][i % 3]), MAT.leafV, Math.cos(a) * r, y, Math.sin(a) * r, 0, hash(i, 4, 33) * 6, 0, [4 + hash(i, 5, 33) * 1.8, 3 + hash(i, 6, 33), 4 + hash(i, 5, 33) * 1.8]);
  }
  for (let i = 0; i < 10; i++) { const a = hash(i, 7, 33) * 6.28, r = 4 + hash(i, 8, 33) * 5, l = 3 + hash(i, 9, 33) * 4; k.cyl(0.05, 0.05, l, MAT.vine, Math.cos(a) * r, 11 - l / 2, Math.sin(a) * r, 0, 0, 0, 4); }
}

function cave(k: Kit) {
  k.add(new THREE.CircleGeometry(1.9, 12, 0, Math.PI), MAT.dark, 0, 0.05, 0.3, 0, Math.PI / 2, 0);
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; k.rock(0.7 + hash(i, 1, 34) * 0.4, 0.4, Math.sin(a) * 2.1, Math.cos(a) * 2.1 + 0.3, MAT.rockD, i + 90); }
  k.rock(1.6, -1.2, 2.8, 0.3, MAT.rock, 99);
}
