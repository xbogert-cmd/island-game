import * as THREE from 'three';
import { World, heightAt } from '../world/island';
import { hash } from '../world/noise';
import { TEX, toon } from './materials';
import type { Building } from '../life/buildings';
import type { Pt } from '../life/people';

const tex = { thatch: TEX.thatch(), plank: TEX.plank(), stone: TEX.stone() };
const M = {
  thatch: toon({ map: tex.thatch }), plank: toon({ map: tex.plank }), post: toon({ color: 0x5a3c22 }), dark: toon({ color: 0x1e1712 }),
  canvas: toon({ color: 0xe8e2cf, side: THREE.DoubleSide }), red: toon({ color: 0xc23a2e }), rock: toon({ color: 0x4a4640 }),
  mud: toon({ color: 0x8a6a48 }), bed: toon({ color: 0x9a8a6a }),
};
/** Buildings that are real 3D models (the rest stay sprites). */
export const SOLID = new Set(['hut', 'storage', 'sickbay', 'sos', 'lookout']);

const box = (g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o;
};
const post = (g: THREE.Group, h: number, x: number, z: number, r = 0.11, y0 = 0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), M.post); o.position.set(x, y0 + h / 2, z); o.castShadow = true; g.add(o); return o;
};
/** A four-sided thatch roof. */
const roof = (g: THREE.Group, w: number, d: number, h: number, y: number) => {
  const o = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), M.thatch);
  o.rotation.y = Math.PI / 4; o.scale.set(w * 1.02, h, d * 1.02); o.position.y = y + h / 2; o.castShadow = o.receiveShadow = true; g.add(o); return o;
};

/** Each piece knows at what point of the build it appears, so huts go up stakes → frame → walls → roof. */
interface Piece { o: THREE.Object3D; at: number; grow?: boolean }

function hut(g: THREE.Group): Piece[] {
  const W = 3.6, D = 3, H = 2.1, out: Piece[] = [];
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) out.push({ o: post(g, H + 0.2, x, z, 0.13), at: 0 });
  const walls = new THREE.Group(); g.add(walls);
  box(walls, W, H, D, M.plank, 0, H / 2, 0);
  box(walls, 0.9, 1.5, 0.06, M.dark, 0, 0.75, D / 2 + 0.01);                       // door, facing the fire
  box(walls, 0.55, 0.5, 0.06, M.dark, -1.15, 1.35, D / 2 + 0.01); box(walls, 0.55, 0.5, 0.06, M.dark, 1.15, 1.35, D / 2 + 0.01);
  out.push({ o: walls, at: 0.34, grow: true });
  out.push({ o: roof(g, W + 1.1, D + 1.1, 1.9, H), at: 0.67 });
  return out;
}

function storage(g: THREE.Group): Piece[] {
  const W = 3.4, D = 2.8, L = 1.1, H = 1.7, out: Piece[] = [];
  for (const [x, z] of [[-W / 2 + 0.2, -D / 2 + 0.2], [W / 2 - 0.2, -D / 2 + 0.2], [-W / 2 + 0.2, D / 2 - 0.2], [W / 2 - 0.2, D / 2 - 0.2]]) out.push({ o: post(g, L, x, z, 0.14), at: 0 });
  const body = new THREE.Group(); g.add(body);
  box(body, W, 0.15, D, M.post, 0, L + 0.07, 0);
  box(body, W - 0.2, H, D - 0.2, M.plank, 0, L + 0.15 + H / 2, 0);
  box(body, 0.8, 1.1, 0.06, M.dark, 0, L + 0.7, D / 2 - 0.08);
  for (let i = 0; i < 4; i++) box(body, 0.7, 0.06, 0.12, M.post, 0, 0.2 + i * 0.28, D / 2 + 0.35 + (3 - i) * 0.12);   // ladder rungs
  out.push({ o: body, at: 0.34, grow: true });
  out.push({ o: roof(g, W + 0.9, D + 0.9, 1.5, L + 0.15 + H), at: 0.67 });
  return out;
}

function sickbay(g: THREE.Group): Piece[] {
  const W = 3.8, D = 3.2, H = 2.3, out: Piece[] = [];
  out.push({ o: post(g, H + 0.15, 0, -D / 2), at: 0 }, { o: post(g, H + 0.15, 0, D / 2), at: 0 });
  const t = new THREE.Group(); g.add(t);
  // a canvas A-frame made from seat covers and the plane's cabin lining
  const slope = Math.hypot(W / 2, H);
  for (const s of [-1, 1]) {
    const side = new THREE.Group(); side.position.set(s * W / 4, H / 2, 0); side.rotation.z = -s * Math.atan2(H, W / 2); t.add(side);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(slope, D), M.canvas); p.rotation.x = -Math.PI / 2; p.castShadow = p.receiveShadow = true; side.add(p);
  }
  box(t, 0.12, 0.7, 0.04, M.red, W / 4 + 0.05, H / 2 + 0.2, D / 2 + 0.02); box(t, 0.5, 0.12, 0.04, M.red, W / 4 + 0.05, H / 2 + 0.2, D / 2 + 0.02);
  box(t, 0.9, 0.18, 1.8, M.bed, -0.6, 0.09, 0.1); box(t, 0.9, 0.18, 1.8, M.bed, 0.6, 0.09, 0.1);
  out.push({ o: t, at: 0.34, grow: true });
  return out;
}

/** SOS laid out in pale stones, big enough to read from the air. */
function sos(g: THREE.Group): Piece[] {
  const L = ['.####', '#....', '.###.', '....#', '####.'], O = ['.###.', '#...#', '#...#', '#...#', '.###.'];
  const out: Piece[] = [], s = 0.85;
  [L, O, L].forEach((rows, li) => rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c !== '#') return;
    const n = out.length, o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), M.rock);
    o.position.set((li * 6 + x - 8) * s, 0.18, (y - 2) * s * 1.35); o.rotation.set(0, hash(n, 2, 7) * 3, 0); o.scale.y = 0.5; o.castShadow = o.receiveShadow = true;
    g.add(o); out.push({ o, at: n / 70 });
  })));
  return out;
}

/** The lookout: four tall posts, a platform, a ladder and a little roof. */
function lookout(g: THREE.Group): Piece[] {
  const S = 1.5, H = 6.5, out: Piece[] = [];
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) out.push({ o: post(g, H + 1.6, x * 0.85, z * 0.85, 0.15), at: 0 });
  const deck = new THREE.Group(); g.add(deck);
  box(deck, S * 2.2, 0.2, S * 2.2, M.post, 0, H, 0);
  for (const s of [-1, 1]) { box(deck, S * 2.2, 0.5, 0.08, M.plank, 0, H + 0.45, s * S * 1.1); box(deck, 0.08, 0.5, S * 2.2, M.plank, s * S * 1.1, H + 0.45, 0); }
  for (let i = 0; i < 10; i++) box(deck, 0.8, 0.07, 0.1, M.post, 0, 0.4 + i * 0.62, S * 1.05 + 0.2);
  out.push({ o: deck, at: 0.5 });
  out.push({ o: roof(g, S * 2.4, S * 2.4, 1.2, H + 1.6), at: 0.8 });
  return out;
}

const MAKE: Record<string, (g: THREE.Group) => Piece[]> = { hut, storage, sickbay, sos, lookout };
/** People are small: buildings are modelled roomy, then shrunk to sit right next to them. */
const SCALE: Record<string, number> = { hut: 0.66, storage: 0.66, sickbay: 0.7, sos: 1, lookout: 0.72 };

/** Keeps a 3D model in the scene for every solid building, growing as it's built. */
export class Camp3D {
  group = new THREE.Group();
  private built = new Map<number, { g: THREE.Group; parts: Piece[]; p: number }>();

  constructor(private w: World, private fire: Pt) {}

  sync(list: Building[]) {
    const seen = new Set<number>();
    for (const b of list) {
      if (!SOLID.has(b.kind)) continue;
      seen.add(b.id);
      let e = this.built.get(b.id);
      if (!e) {
        const g = new THREE.Group(); g.position.set(b.x, heightAt(this.w, b.x, b.z) - 0.05, b.z);
        // doors face the fire
        g.rotation.y = b.kind === 'sos' ? 0 : Math.atan2(this.fire.x - b.x, this.fire.z - b.z);
        g.scale.setScalar(SCALE[b.kind]);
        e = { g, parts: MAKE[b.kind](g), p: -1 }; this.group.add(g); this.built.set(b.id, e);
      }
      if (e.p === b.progress) continue;
      e.p = b.progress;
      const shaky = b.shaky && b.progress >= 1 ? 0.06 : 0;
      e.g.rotation.z = shaky;
      for (const q of e.parts) {
        q.o.visible = b.progress > q.at || (q.at === 0 && b.progress >= 0);
        if (q.grow && q.o.visible) q.o.scale.y = Math.min(1, 0.15 + (b.progress - q.at) / 0.33);
      }
    }
    for (const [id, e] of this.built) if (!seen.has(id)) { this.group.remove(e.g); this.built.delete(id); }
  }
}
