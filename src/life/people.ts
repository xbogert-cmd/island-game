import * as THREE from 'three';
import { World, heightAt } from '../world/island';
import { SpriteBatch } from '../render/sprites';
import { U } from '../render/shared';

const SW = 20, SH = 26, FEET = 24;
const SKIN = ['#f1c7a0', '#d9a273', '#a8704a', '#7a4a2e', '#e8b98f'], HAIR = ['#2a1c14', '#5a3820', '#c9a050', '#151515', '#8a4a2a', '#d8d8d8'];
const SHIRT = ['#e2553f', '#f0c040', '#6bc06b', '#c868c0', '#f08a3a', '#3fbfb0', '#ffffff', '#3aa0e0'], PANTS = ['#3a4a6a', '#5a4636', '#2f2f3a', '#6a6a72'];
const shade = (h: string, f: number) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) * f | 0); return `rgb(${c[0]},${c[1]},${c[2]})`; };

type Pose = 'idle' | 'walk' | 'sit' | 'cover';
interface Pal { skin: string; hair: string; style: string; shirt: string; shirtD: string; pants: string; cap: string }
interface Person { x: number; z: number; tx: number; tz: number; face: number; pose: Pose; anim: number; wait: number; pal: Pal; key: string; slot: number }

/** Pixel rectangles for one survivor frame, built facing right then mirrored. Same art as the look-tests. */
function personRects(p: Person) {
  const R: [number, number, number, number, string][] = [];
  const f = p.face, pal = p.pal, ph = Math.floor(p.anim * 9) % 4;
  const r = (dx: number, dy: number, w: number, h: number, c: string) => R.push([f < 0 ? -dx - w + 1 : dx, dy, w, h, c]);
  let by = 0, la = 0, lb = 0, aA = 0, aB = 0;
  if (p.pose === 'walk') { by = ph % 2 ? -1 : 0; la = ph === 1 ? 1 : 0; lb = ph === 3 ? 1 : 0; aA = ph === 1 ? 1 : ph === 3 ? -1 : 0; aB = -aA; }
  if (p.pose === 'idle') by = Math.floor(p.anim * 1.2) % 3 === 0 ? 0 : 0;
  if (p.pose === 'sit') { by = 2; r(-2, -2, 6, 2, pal.pants); r(4, -2, 1, 2, '#2a2018'); }
  else { r(-2, -3 + la, 2, 3 - la, pal.pants); r(-2, -1, 2, 1, '#2a2018'); r(1, -3 + lb, 2, 3 - lb, pal.pants); r(1, -1, 2, 1, '#2a2018'); }
  const t = by;
  r(-2, -4 + t, 5, 1, pal.pants); r(-2, -8 + t, 5, 4, pal.shirt); r(-2, -8 + t, 1, 4, pal.shirtD);
  if (p.pose === 'cover') { r(-3, -12 + t, 1, 5, pal.shirtD); r(3, -12 + t, 1, 5, pal.shirt); r(-3, -13 + t, 1, 1, pal.skin); r(3, -13 + t, 1, 1, pal.skin); r(-2, -14 + t, 5, 1, pal.skin); }
  else { r(-3, -8 + aB + t, 1, 3, pal.shirtD); r(-3, -5 + aB + t, 1, 1, pal.skin); r(3, -8 + aA + t, 1, 3, pal.shirt); r(3, -5 + aA + t, 1, 1, pal.skin); }
  r(-2, -13 + t, 5, 5, pal.skin); r(0, -11 + t, 1, 1, '#1a1420'); r(2, -11 + t, 1, 1, '#1a1420');
  if (pal.style === 'short') { r(-2, -13 + t, 5, 1, pal.hair); r(-2, -12 + t, 2, 2, pal.hair); }
  else if (pal.style === 'long') { r(-2, -13 + t, 5, 1, pal.hair); r(-2, -12 + t, 2, 5, pal.hair); r(-3, -12 + t, 1, 4, pal.hair); }
  else if (pal.style === 'cap') { r(-2, -14 + t, 5, 2, pal.cap); r(3, -13 + t, 2, 1, pal.cap); r(-2, -12 + t, 1, 2, pal.hair); }
  return R;
}

/** The crash survivors. In Layer 1 they just live around the camp: wander, sit by the fire at night, shelter from rain. */
export class Survivors {
  batch: SpriteBatch;
  people: Person[] = [];
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private camp: { x: number; z: number };
  private shelters: { x: number; z: number }[];

  constructor(private w: World, count = 14) {
    const c = document.createElement('canvas'); c.width = SW * count; c.height = SH;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.batch = new SpriteBatch(this.tex, count);
    const fire = w.landmarks.find(l => l.kind === 'campfire')!;
    this.camp = { x: fire.x, z: fire.z };
    this.shelters = [{ x: fire.x - 5, z: fire.z - 3.3 }, { x: fire.x + 4.5, z: fire.z - 4.3 }];
    for (let i = 0; i < count; i++) {
      const pal: Pal = { skin: SKIN[i % 5], hair: HAIR[(i * 3) % 6], style: ['short', 'long', 'cap', 'short', 'bald', 'long', 'short'][i % 7], shirt: SHIRT[i % 8], pants: PANTS[i % 4], cap: SHIRT[(i + 3) % 8], shirtD: '' };
      pal.shirtD = shade(pal.shirt, 0.72);
      const a = (i / count) * 6.28, x = fire.x + Math.cos(a) * (4 + (i % 3) * 2), z = fire.z + Math.sin(a) * (4 + (i % 3) * 2);
      this.people.push({ x, z, tx: x, tz: z, face: 1, pose: 'idle', anim: Math.random() * 9, wait: Math.random() * 3, pal, key: '', slot: i });
    }
  }

  private walkable(x: number, z: number) {
    const h = heightAt(this.w, x, z);
    return h > 0.2 && Math.hypot(x - this.camp.x, z - this.camp.z) > 1.4 && Math.hypot(x - this.w.crash.x, z - this.w.crash.z) > 3.2;
  }

  private step(p: Person, tx: number, tz: number, spd: number, dt: number) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const s = Math.min(d, spd * dt), nx = p.x + dx / d * s, nz = p.z + dz / d * s;
    if (this.walkable(nx, nz)) { p.x = nx; p.z = nz; } else return true;
    const r = U.uCamRight.value, sx = dx * r.x + dz * r.z;
    if (Math.abs(sx) > 0.02) p.face = sx > 0 ? 1 : -1;
    return false;
  }

  update(dt: number, night: number, rain: number, fireLight: number) {
    const n = this.people.length;
    for (const p of this.people) {
      p.anim += dt;
      let pose: Pose = 'idle';
      if (rain > 0.5) {
        const s = this.shelters[p.slot % 2], k = Math.floor(p.slot / 2), tx = s.x + (k % 4 - 1.5) * 0.7, tz = s.z + (k > 3 ? 0.8 : 0);
        pose = this.step(p, tx, tz, 2.6, dt) ? 'cover' : 'walk';
      } else if (night > 0.5) {
        const a = (p.slot / n) * 6.28 + 0.3, rr = 2.4 + (p.slot % 2) * 0.9;
        if (this.step(p, this.camp.x + Math.cos(a) * rr, this.camp.z + Math.sin(a) * rr, 1.6, dt)) {
          pose = 'sit'; const r = U.uCamRight.value; p.face = (this.camp.x - p.x) * r.x + (this.camp.z - p.z) * r.z > 0 ? 1 : -1;
        } else pose = 'walk';
      } else if (p.wait > 0) p.wait -= dt;
      else if (this.step(p, p.tx, p.tz, 1.4, dt)) {
        p.wait = 1.5 + Math.random() * 5;
        const a = Math.random() * 6.28, rr = 2.5 + Math.random() * 12;
        const x = this.camp.x + Math.cos(a) * rr, z = this.camp.z + Math.sin(a) * rr;
        if (this.walkable(x, z)) { p.tx = x; p.tz = z; }
      } else pose = 'walk';
      p.pose = pose;
    }
    // draw changed frames into the atlas, then emit quads
    let dirty = false;
    this.batch.begin();
    for (const p of this.people) {
      const fr = p.pose === 'walk' ? Math.floor(p.anim * 9) % 4 : 0, key = `${p.pose}${p.face}${fr}`;
      if (key !== p.key) {
        p.key = key; dirty = true;
        const ox = p.slot * SW, g = this.g;
        g.clearRect(ox, 0, SW, SH);
        const R = personRects(p), cx = ox + (SW >> 1);
        g.fillStyle = '#1c1626'; for (const q of R) g.fillRect(cx + q[0] - 1, FEET + q[1] - 1, q[2] + 2, q[3] + 2);
        for (const q of R) { g.fillStyle = q[4]; g.fillRect(cx + q[0], FEET + q[1], q[2], q[3]); }
      }
      const fd = Math.hypot(p.x - this.camp.x, p.z - this.camp.z), fl = night * fireLight * Math.max(0, 1 - fd / 9);
      this.batch.push(p.x, heightAt(this.w, p.x, p.z) - (SH - FEET) * 0.125, p.z, { x: p.slot * SW, y: 0, w: SW, h: SH }, false, 1 + fl * 2.4, 1 + fl * 1.3, 1 + fl * 0.5, 1);
    }
    if (dirty) this.tex.needsUpdate = true;
    this.batch.end();
  }
}
