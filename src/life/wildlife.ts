import * as THREE from 'three';
import { B, World, biomeAt, heightAt } from '../world/island';
import { ATLAS, Rect, SpriteBatch } from '../render/sprites';
import { U } from '../render/shared';
import { Particles } from './particles';

export type Kind = 'crab' | 'gull' | 'turtle' | 'fish' | 'jumpFish' | 'dolphin' | 'whale' | 'parrot' | 'bird' | 'monkey' | 'frog' | 'boar' | 'deer' | 'butterfly' | 'dragonfly' | 'firefly' | 'bat' | 'owl';

export interface A {
  k: Kind; x: number; y: number; z: number; tx: number; tz: number; vx: number; vz: number;
  /** state: 0 idle, 1 walking, 2 fleeing, 4 dead (a carcass) */
  t: number; state: number; wait: number; flip: boolean; alt: number; ph: number; tint: [number, number, number]; life: number;
  cx?: number; cz?: number; r?: number;
  /** herd / school / troop it belongs to; young = a piglet */
  herd?: number; young?: boolean;
  /** speared: seconds of running left before it drops */
  bleed?: number;
}
/** Animals that live in groups, and how many to a group (a boar sounder has piglets). Everything else is on its own. */
const HERD: Partial<Record<Kind, [number, number]>> = { boar: [3, 6], deer: [4, 8], monkey: [4, 8], crab: [3, 5], fish: [5, 8] };
/** What you can bring down with a spear. */
export const GAME: Kind[] = ['boar', 'deer', 'fish'];

const rnd = Math.random;
/** How many of each animal we try to keep around the view, and when they are about. */
const QUOTA: Record<Kind, { n: number; day?: boolean; night?: boolean }> = {
  crab: { n: 16 }, gull: { n: 7, day: true }, turtle: { n: 2 }, fish: { n: 40 }, jumpFish: { n: 0 }, dolphin: { n: 0 }, whale: { n: 0 },
  parrot: { n: 0, day: true }, bird: { n: 10, day: true }, monkey: { n: 10, day: true }, frog: { n: 10 }, boar: { n: 10 }, deer: { n: 12 },
  butterfly: { n: 18, day: true }, dragonfly: { n: 10, day: true }, firefly: { n: 70, night: true }, bat: { n: 7, night: true }, owl: { n: 2, night: true },
};

export class Wildlife {
  list: A[] = [];
  private spawnT = 0;
  private herdN = 0;
  private heads = new Map<number, A>();
  private eventT = 6;
  private lastTarget = new THREE.Vector3();

  constructor(private w: World, private batch: SpriteBatch, private fx: Particles) {}

  private depth(x: number, z: number) { return U.uTide.value - heightAt(this.w, x, z); }
  private ground(x: number, z: number) { return Math.max(heightAt(this.w, x, z), U.uTide.value); }
  /** River surface over its bed, if this is river. */
  private river(x: number, z: number) { const i = (z | 0) * 768 + (x | 0), r = this.w.riverY[i] ?? -99; return r - heightAt(this.w, x, z) > 0.3 ? r : null; }

  /** Where each animal is allowed to be. */
  private fits(k: Kind, x: number, z: number) {
    const b = biomeAt(this.w, x, z), d = this.depth(x, z), rd = this.w.riverDist[(z | 0) * 768 + (x | 0)] ?? 99;
    switch (k) {
      case 'crab': case 'turtle': return (b === B.Beach || b === B.TideRock) && d < -0.05;
      case 'fish': return (d > 0.25 && d < 3.5) || this.river(x, z) !== null;
      case 'monkey': return (b === B.Jungle || b === B.Bamboo) && d < -0.3;
      case 'frog': return (rd < 6 || b === B.Swamp) && d < -0.1;
      case 'boar': return (b === B.Grass || b === B.Jungle) && d < -0.5;
      case 'deer': return (b === B.Grass || b === B.Flowers || b === B.Highland) && d < -0.5;
      case 'butterfly': return b === B.Flowers || b === B.Grass;
      case 'dragonfly': return b === B.Swamp || rd < 5;
      case 'firefly': return (b === B.Jungle || b === B.Grass || b === B.Swamp || b === B.Bamboo || b === B.Flowers) && d < 0;
      case 'gull': return b === B.Beach || b === B.Ocean || b === B.Lagoon || b === B.Reef;
      case 'owl': return b === B.Jungle && d < -0.5;
      case 'bat': case 'bird': return d < 0;
      default: return true;
    }
  }

  private spawn(k: Kind, x: number, z: number, extra: Partial<A> = {}) {
    const a: A = { k, x, y: this.ground(x, z), z, tx: x, tz: z, vx: 0, vz: 0, t: rnd() * 10, state: 0, wait: rnd() * 2, flip: rnd() < 0.5, alt: 0, ph: rnd() * 6.28, tint: [1, 1, 1], life: 0, ...extra };
    if (k === 'butterfly') { const c = [[1, 0.6, 0.2], [0.4, 0.6, 1], [1, 0.95, 0.4], [1, 1, 1], [0.95, 0.5, 0.9]][(rnd() * 5) | 0]; a.tint = c as [number, number, number]; }
    if (k === 'gull') { a.cx = x; a.cz = z; a.r = 6 + rnd() * 10; a.alt = 6 + rnd() * 5; }
    if (k === 'bird' || k === 'bat') { a.alt = 3 + rnd() * 5; const ang = rnd() * 6.28; a.vx = Math.cos(ang) * (k === 'bat' ? 5 : 7); a.vz = Math.sin(ang) * 6; }
    if (k === 'firefly') a.alt = 0.4 + rnd() * 1.6;
    if (k === 'butterfly' || k === 'dragonfly') a.alt = 0.6 + rnd() * 1.2;
    this.list.push(a);
    return a;
  }

  update(dt: number, target: THREE.Vector3, viewR: number, night: number, people: { x: number; z: number }[], rain: number) {
    const moved = Math.hypot(target.x - this.lastTarget.x, target.z - this.lastTarget.z);
    this.lastTarget.copy(target);
    // despawn far animals, top up quotas near the view
    this.list = this.list.filter(a => Math.hypot(a.x - target.x, a.z - target.z) < viewR * (a.state === 4 || a.bleed !== undefined ? 4 : 1.7) && a.life >= 0);   // kills and wounded game stick around
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = 0.25;
      const counts = new Map<Kind, number>();
      for (const a of this.list) counts.set(a.k, (counts.get(a.k) ?? 0) + 1);
      for (const [k, q] of Object.entries(QUOTA) as [Kind, typeof QUOTA[Kind]][]) {
        if (!q.n || (q.day && night > 0.6) || (q.night && night < 0.4)) continue;
        if (rain > 0.5 && (k === 'butterfly' || k === 'dragonfly' || k === 'firefly')) continue;
        if ((counts.get(k) ?? 0) >= q.n) continue;
        for (let t = 0; t < 6; t++) {
          const ang = rnd() * 6.28, r = viewR * (0.2 + rnd() * 1.25), x = target.x + Math.cos(ang) * r, z = target.z + Math.sin(ang) * r;
          if (!this.fits(k, x, z)) continue;
          const hs = HERD[k];
          if (!hs) { this.spawn(k, x, z); break; }
          const n = hs[0] + ((rnd() * (hs[1] - hs[0] + 1)) | 0), id = ++this.herdN;
          for (let i = 0; i < n; i++) {
            const hx = x + (rnd() - 0.5) * 5, hz = z + (rnd() - 0.5) * 5;
            if (i === 0 || this.fits(k, hx, hz)) this.spawn(k, i ? hx : x, i ? hz : z, { herd: id, young: k === 'boar' && i > 1 && rnd() < 0.5 });
          }
          break;
        }
      }
    }
    // occasional events: parrot bursts as you pass over jungle, fish jumps, dolphin pods, a rare whale
    if ((this.eventT -= dt * (1 + Math.min(4, moved * 3))) <= 0) {
      this.eventT = 3 + rnd() * 4;
      const ang = rnd() * 6.28, r = viewR * rnd() * 0.9, x = target.x + Math.cos(ang) * r, z = target.z + Math.sin(ang) * r;
      const b = biomeAt(this.w, x, z), d = this.depth(x, z);
      if ((b === B.Jungle || b === B.Bamboo) && night < 0.5) {
        const dir = rnd() * 6.28, n = 4 + (rnd() * 4 | 0), kind: Kind = rnd() < 0.6 ? 'parrot' : 'bird';
        for (let i = 0; i < n; i++) this.spawn(kind, x + rnd() * 2, z + rnd() * 2, { alt: 3.5, vx: Math.cos(dir) * 7, vz: Math.sin(dir) * 7, state: 1, t: rnd() });
      } else if (d > 0.4 && d < 6) {
        this.spawn('jumpFish', x, z, { state: 0, t: 0, flip: rnd() < 0.5 });
        this.fx.emit('splash', x, U.uTide.value + 0.05, z, { max: 0.5 });
      } else if (d > 5 && rnd() < 0.5) {
        const dir = rnd() < 0.5 ? 1 : -1;
        for (let i = 0; i < 2 + (rnd() * 3 | 0); i++) this.spawn('dolphin', x + i * 2.5 * dir, z + (rnd() - 0.5) * 3, { vx: 5 * dir, t: -i * 0.35, flip: dir < 0 });
      }
      if (d > 7 && rnd() < 0.06) this.spawn('whale', x, z, { t: 0, flip: rnd() < 0.5 });
    }

    // behaviour
    this.heads.clear();
    for (const a of this.list) if (a.herd && a.state !== 4 && !this.heads.has(a.herd)) this.heads.set(a.herd, a);
    for (const a of this.list) {
      a.t += dt;
      if (a.state === 4) { a.y = this.ground(a.x, a.z); continue; }
      const near = people.some(p => Math.hypot(p.x - a.x, p.z - a.z) < 4);
      switch (a.k) {
        case 'crab': case 'turtle': case 'boar': case 'deer': case 'frog': case 'monkey': this.walker(a, dt, near); break;
        case 'gull': {
          const ang = a.t * (9 / (a.r! * 1.0)) + a.ph;
          a.x = a.cx! + Math.cos(ang) * a.r!; a.z = a.cz! + Math.sin(ang) * a.r! * 0.7; a.y = this.ground(a.x, a.z) + a.alt + Math.sin(a.t) * 0.4;
          a.flip = -Math.sin(ang) * U.uCamRight.value.x + Math.cos(ang) * U.uCamRight.value.z < 0; break;
        }
        case 'parrot': case 'bird': case 'bat': {
          if (a.k === 'bat') { a.vx += (rnd() - 0.5) * 30 * dt; a.vz += (rnd() - 0.5) * 30 * dt; }
          a.x += a.vx * dt; a.z += a.vz * dt;
          if (a.state === 1) a.alt += dt * 2.2;
          a.y = Math.max(this.ground(a.x, a.z) + a.alt, a.y - dt * 4);
          a.flip = a.vx * U.uCamRight.value.x + a.vz * U.uCamRight.value.z < 0;
          if (a.k === 'parrot' && a.t > 9) a.life = -1;
          break;
        }
        case 'butterfly': case 'dragonfly': case 'firefly': {
          const sp = a.k === 'dragonfly' ? 3 : a.k === 'firefly' ? 0.4 : 1.2;
          if ((a.wait -= dt) <= 0) { a.wait = a.k === 'dragonfly' ? 0.4 + rnd() : 1 + rnd() * 2; const ang = rnd() * 6.28; a.vx = Math.cos(ang) * sp; a.vz = Math.sin(ang) * sp; if (a.k === 'dragonfly' && rnd() < 0.4) { a.vx = a.vz = 0; } }
          a.x += a.vx * dt; a.z += a.vz * dt;
          a.y = this.ground(a.x, a.z) + a.alt + Math.sin(a.t * (a.k === 'butterfly' ? 6 : 2) + a.ph) * 0.25;
          if (Math.abs(a.vx) > 0.05) a.flip = a.vx * U.uCamRight.value.x + a.vz * U.uCamRight.value.z < 0;
          break;
        }
        case 'owl': a.y = this.ground(a.x, a.z); break;
        case 'fish': {
          // a school drifts together; darting fish (state 2) slow back down
          const hd = a.herd ? this.heads.get(a.herd) : null;
          if ((a.wait -= dt) <= 0) {
            a.wait = 1 + rnd() * 3; const ang = rnd() * 6.28;
            if (hd && hd !== a) { const dx = hd.x - a.x + Math.cos(ang) * 1.5, dz = hd.z - a.z + Math.sin(ang) * 1.5, l = Math.hypot(dx, dz) || 1; a.vx = dx / l * 1.3; a.vz = dz / l * 1.3; }
            else { a.vx = Math.cos(ang) * 1.2; a.vz = Math.sin(ang) * 1.2; }
            if (a.state === 2) a.state = 0;
          }
          const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
          if (this.fits('fish', nx, nz)) { a.x = nx; a.z = nz; } else { a.vx *= -1; a.vz *= -1; }
          if (near) { a.vx *= 1.05; a.vz *= 1.05; }
          a.y = (this.river(a.x, a.z) ?? U.uTide.value) + 0.02; a.flip = a.vx * U.uCamRight.value.x + a.vz * U.uCamRight.value.z < 0; break;
        }
        case 'jumpFish': {
          const T = 0.9; a.y = U.uTide.value + Math.sin(Math.min(1, a.t / T) * Math.PI) * 1.4; a.x += (a.flip ? -2 : 2) * dt;
          if (a.t > T) { a.life = -1; this.fx.emit('splash', a.x, U.uTide.value + 0.05, a.z, { max: 0.45 }); }
          break;
        }
        case 'dolphin': {
          const T = 1.3, ph = a.t % 2.4; a.x += a.vx * dt;
          a.y = ph >= 0 && ph < T ? U.uTide.value + Math.sin((ph / T) * Math.PI) * 1.8 - 0.3 : -99;
          a.state = ph < T / 2 ? 0 : 1;
          if (ph >= 0 && Math.abs(ph - T) < dt * 1.5) for (let i = 0; i < 4; i++) this.fx.emit('dot2', a.x, U.uTide.value + 0.1, a.z, { vy: 1.5 + rnd() * 1.5, vx: (rnd() - 0.5) * 2, grav: 6, max: 0.5 });
          if (a.t > 12) a.life = -1;
          break;
        }
        case 'whale': {
          const T = 3.4; a.y = U.uTide.value + Math.sin(Math.min(1, a.t / T) * Math.PI) * 4 - 1.5;
          if (a.t > T) {
            a.life = -1;
            for (let i = 0; i < 30; i++) this.fx.emit(rnd() < 0.5 ? 'dot2' : 'puff', a.x + (rnd() - 0.5) * 3, U.uTide.value + 0.2, a.z, { vy: 3 + rnd() * 4, vx: (rnd() - 0.5) * 4, vz: (rnd() - 0.5) * 2, grav: 7, max: 1.2 });
          }
          break;
        }
      }
    }
    this.draw(night);
  }

  private walker(a: A, dt: number, near: boolean) {
    const spd = ({ crab: 2.2, turtle: 0.5, boar: 2.4, deer: 2.6, frog: 2.5, monkey: 3 }[a.k as 'crab'] ?? 1) * (a.young ? 1.1 : 1);
    if (near && a.state !== 2) this.flee(a, a.x + (rnd() - 0.5), a.z + (rnd() - 0.5));   // flee from people
    if (a.bleed !== undefined) {                       // speared: runs, leaves a blood trail, drops
      if (rnd() < dt * 6) this.fx.emit('dot1', a.x, this.ground(a.x, a.z) + 0.03, a.z, { flat: true, max: 40, r: 0.55, g: 0.1, b: 0.08, fade: false });
      if ((a.bleed -= dt) <= 0) { this.drop(a); return; }
    }
    if (a.state === 0) {                               // idle / grazing; the herd keeps near whoever leads it
      if ((a.wait -= dt) <= 0) {
        const hd = a.herd ? this.heads.get(a.herd) : null;
        const ang = rnd() * 6.28, r = a.k === 'turtle' ? 3 : a.k === 'crab' ? 1 + rnd() * 3 : 2 + rnd() * 7;
        const tx = hd && hd !== a ? hd.tx + Math.cos(ang) * (1.5 + rnd() * 2.5) : a.x + Math.cos(ang) * r, tz = hd && hd !== a ? hd.tz + Math.sin(ang) * (1.5 + rnd() * 2.5) : a.z + Math.sin(ang) * r;
        if (this.fits(a.k, tx, tz)) { a.tx = tx; a.tz = tz; a.state = 1; } else a.wait = 0.5;
      }
    } else {
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz), s = spd * (a.state === 2 ? (a.bleed !== undefined ? 1.3 : 1.8) : 1) * dt;
      if (d < s + 0.05) { a.state = 0; a.wait = a.k === 'crab' ? 0.3 + rnd() * 1.5 : 1.5 + rnd() * 4; if (a.bleed !== undefined) this.flee(a, a.x - dx, a.z - dz); }
      else {
        const nx = a.x + dx / d * s, nz = a.z + dz / d * s;
        if (this.fits(a.k, nx, nz) || a.state === 2) { a.x = nx; a.z = nz; } else { a.state = 0; a.wait = 0.5; }
        const sx = dx * U.uCamRight.value.x + dz * U.uCamRight.value.z;
        if (a.k !== 'crab' && Math.abs(sx) > 0.02) a.flip = sx < 0;
      }
    }
    const hop = (a.k === 'frog' || a.k === 'monkey') && a.state !== 0 ? Math.abs(Math.sin(a.t * 9)) * 0.4 : 0;
    a.y = this.ground(a.x, a.z) + hop;
  }

  // ---------------------------------------------------------------- hunting

  /** Run the whole herd (or school) away from a point. */
  flee(a: A, fx: number, fz: number) {
    const mates = a.herd ? this.list.filter(o => o.herd === a.herd && o.state !== 4) : [a];
    for (const o of mates) {
      const dx = o.x - fx, dz = o.z - fz, l = Math.hypot(dx, dz) || 1, j = (rnd() - 0.5) * 0.6;
      const ux = dx / l * Math.cos(j) - dz / l * Math.sin(j), uz = dx / l * Math.sin(j) + dz / l * Math.cos(j);
      if (o.k === 'fish') { o.vx = ux * 4; o.vz = uz * 4; o.wait = 1.2; o.state = 2; continue; }
      o.state = 2; o.tx = o.x + ux * 16; o.tz = o.z + uz * 16;
    }
  }
  /** Something scary at (x, z): any group within r of it bolts. */
  spook(x: number, z: number, r: number) {
    const hit = new Set<number>();
    for (const a of this.list) if ((a.k === 'boar' || a.k === 'deer' || a.k === 'monkey' || a.k === 'fish') && a.state !== 2 && a.state !== 4 && !hit.has(a.herd ?? -1) && Math.hypot(a.x - x, a.z - z) < r) { hit.add(a.herd ?? -1); this.flee(a, x, z); }
  }
  /** The closest animal you could spear near a point (screen picks pass a world point). */
  gameAt(x: number, z: number, r: number): A | null {
    let best: A | null = null, bd = r;
    for (const a of this.list) { if (!GAME.includes(a.k) || a.state === 4 || a.y < -50) continue; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  carcassAt(x: number, z: number, r: number) { return this.list.find(a => a.state === 4 && Math.hypot(a.x - x, a.z - z) < r) ?? null; }
  /** A spear lands. Clean hits drop it, grazes send it off bleeding; fish are just caught. */
  strike(a: A, clean: boolean) {
    if (a.k === 'fish') { a.life = -1; this.fx.emit('splash', a.x, a.y + 0.05, a.z, { max: 0.5 }); return; }
    if (clean || a.young || a.bleed !== undefined) { this.flee(a, a.x, a.z); this.drop(a); return; }   // the rest of the herd bolts
    a.bleed = 5 + rnd() * 5; this.flee(a, a.x - (rnd() - 0.5), a.z - (rnd() - 0.5));
  }
  private drop(a: A) { a.state = 4; a.bleed = undefined; a.herd = undefined; a.life = 0; }
  remove(a: A) { a.life = -1; }
  alive(a: A) { return this.list.includes(a) && a.life >= 0; }

  private draw(night: number) {
    const b = this.batch;
    for (const a of this.list) {
      if (a.y < -50) continue;
      const fr = (n: string, rate = 6): Rect => { const f = ATLAS[n]; return f[Math.floor(a.t * rate) % f.length]; };
      const moving = a.state !== 0;
      if (a.state === 4) { b.push(a.x, a.y + 0.04, a.z, ATLAS[a.k === 'deer' ? 'deer' : a.young ? 'piglet' : 'boar'][0], a.flip, 0.85, 0.8, 0.8, 1, true); continue; }
      switch (a.k) {
        case 'crab': b.push(a.x, a.y, a.z, moving ? fr('crab', 10) : ATLAS.crab[0], a.flip); break;
        case 'turtle': b.push(a.x, a.y, a.z, moving ? fr('turtle', 2) : ATLAS.turtle[0], a.flip); break;
        case 'boar': { const n = a.young ? 'piglet' : 'boar'; b.push(a.x, a.y, a.z, moving ? fr(n, 7) : ATLAS[n][0], a.flip); break; }
        case 'deer': b.push(a.x, a.y, a.z, moving ? fr('deer', 7) : ATLAS.deer[a.ph > 3 ? 2 : 0], a.flip); break;
        case 'frog': b.push(a.x, a.y, a.z, ATLAS.frog[moving ? 1 : 0], a.flip); break;
        case 'monkey': b.push(a.x, a.y, a.z, ATLAS.monkey[moving ? 1 : 0], a.flip); break;
        case 'gull': b.push(a.x, a.y, a.z, fr('gullFly', 3), a.flip); break;
        case 'parrot': b.push(a.x, a.y, a.z, fr('parrot', 9), a.flip); break;
        case 'bird': b.push(a.x, a.y, a.z, fr('bird', 8), a.flip, 1, 1, 1); break;
        case 'bat': b.push(a.x, a.y, a.z, fr('bat', 10), a.flip, 1, 1, 1); break;
        case 'butterfly': b.push(a.x, a.y, a.z, fr('butterfly', 8), a.flip, ...a.tint); break;
        case 'dragonfly': b.push(a.x, a.y, a.z, fr('dragonfly', 14), a.flip); break;
        case 'owl': b.push(a.x, a.y, a.z, ATLAS.owl[0], a.flip); break;
        case 'firefly': { const on = Math.sin(a.t * 2.4 + a.ph) > 0.2; if (on && night > 0.3) b.push(a.x, a.y, a.z, ATLAS.firefly[0], false, 1, 1, 0.6, 2); break; }
        case 'fish': b.push(a.x, a.y, a.z, ATLAS.fishShadow[0], a.flip, 0.35, 0.45, 0.5, 0.55, true); break;
        case 'jumpFish': b.push(a.x, a.y, a.z, ATLAS.fishJump[0], a.flip); break;
        case 'dolphin': b.push(a.x, a.y, a.z, ATLAS.dolphin[a.state], a.flip); break;
        case 'whale': b.push(a.x, a.y, a.z, ATLAS.whale[0], a.flip); break;
      }
    }
  }
}
