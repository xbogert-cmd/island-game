import * as THREE from 'three';
import { B, World, biomeAt, heightAt } from '../world/island';
import { ATLAS, SpriteBatch } from '../render/sprites';
import { PITCH, PX, U } from '../render/shared';
import { Persona } from './persona';
import { WalkGrid } from './path';
import { Particles } from './particles';

export const SW = 20, SH = 26, FEET = 24;
/** Room for everyone who could ever live here, babies included. */
export const MAXP = 48;
const shade = (h: string, f: number) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) * f | 0); return `rgb(${c[0]},${c[1]},${c[2]})`; };

export type Pose = 'idle' | 'walk' | 'run' | 'limp' | 'sit' | 'sleep' | 'cover' | 'search' | 'collect' | 'point' | 'wave' | 'whistle' | 'cheer' | 'argue' | 'slump' | 'startle' | 'fish' | 'eat' | 'build';
export type Mode = 'asleep' | 'camp' | 'leader' | 'follow' | 'wait' | 'scout' | 'lost' | 'hurt' | 'rescued' | 'dead';
export type Mood = 'none' | 'happy' | 'angry' | 'worried' | 'sad' | 'scared' | 'tired' | 'fond' | 'pain' | 'sick';
export interface Pt { x: number; z: number }

export interface Person {
  id: number; per: Persona;
  x: number; z: number; face: number; pose: Pose; anim: number; key: string;
  mode: Mode;
  path: Pt[]; repath: number; stuck: number; moving: boolean;
  /** what they are doing at camp (or while searching) and a timer for it */
  act: string; actT: number; ax: number; az: number; partner: Person | null;
  /** short pose override (point, cheer, startle…) */
  poseO: Pose | null; poseT: number;
  torch: boolean; carry: 0 | 1 | 2 | 3; hurt: boolean; heal: number;
  mood: Mood; tmood: Mood; moodT: number; why: string;
  apart: number; apartHit: boolean;
  /** wants to ask the leader something (shows a ❗) */
  ask: boolean;
  /** what they are carrying to the pile */
  bring: string;
  hungry: boolean;
  /** jobs: current job, work phase/timer, experience per job, loved/hated job, favorite (pinned) job */
  job: string; wph: string; wT: number; xp: Record<string, number>; love: string; hate: string; pin: string; hateT: number;
  /** stood night watch: sleeps in the next morning */
  sleepIn: boolean; watched: boolean;
  /** who rescued them (-1 = nobody) */
  savedBy: number;
  /** 0 healthy, 1 weak, 2 sick, 3 very sick */
  health: number; hungerN: number;
  /** trips out: picked for your crew, when they last went out / this trip started, how they feel about going (-1..1), what they gathered */
  crew: boolean; outAt: number; tripAt: number; outLike: number; tiredN: number; haul: string[];
  /** things from home they carry; the first is their own, the rest were left to them */
  keeps: string[];
  /** standing on something (the tower platform) */
  up: number;
  /** still a child (born on the island) */
  kid: boolean;
  /** day they were born on the island (-1: came on the plane) */
  born: number;
  /** who they're with (-1: nobody) */
  couple: number;
  step: number;
}

const MOOD_ICON: Record<Mood, string> = { none: '', happy: 'mHappy', angry: 'mAngry', worried: 'mWorry', sad: 'mSad', scared: 'mScared', tired: 'mSleep', fond: 'mFond', pain: 'mPain', sick: 'mSick' };
const FRAME_RATE: Partial<Record<Pose, number>> = { walk: 9, run: 13, limp: 6, wave: 4, argue: 5, cheer: 5, collect: 3, search: 1.5, startle: 0, fish: 0.5, eat: 2, build: 4 };

type Arm = 'down' | 'fwd' | 'up' | 'out' | 'mouth' | 'torch' | 'bucket' | 'carry' | 'log' | 'reach' | 'fist' | 'rod' | 'hamUp' | 'hamDown' | 'food';

/** A child: smaller everything. A baby is a bundle in someone's arms. */
function kidRects(p: Person, baby: boolean) {
  const R: [number, number, number, number, string][] = [];
  const f = p.face, L = p.per.look, pose = p.pose, ph = Math.floor(p.anim * (FRAME_RATE[pose] ?? 0)) % 4;
  const r = (dx: number, dy: number, w: number, h: number, c: string) => R.push([f < 0 ? -dx - w + 1 : dx, dy, w, h, c]);
  const eye = '#1a1420', shoe = '#2a2018';
  if (baby) { r(-2, -5, 5, 4, '#ece6d4'); r(-2, -2, 5, 1, '#c8c0a8'); r(-1, -7, 3, 3, L.skin); r(0, -6, 1, 1, eye); r(-1, -7, 3, 1, L.hair); return R; }
  if (pose === 'sleep') { r(0, -2, 4, 2, L.pants); r(-3, -3, 4, 2, L.shirt); r(-6, -4, 3, 3, L.skin); r(-6, -4, 1, 3, L.hair); return R; }
  const walk = pose === 'walk' || pose === 'run', sit = pose === 'sit' || pose === 'eat';
  const t = sit ? 2 : walk && ph % 2 ? -1 : 0;
  if (sit) { r(-1, -1, 4, 1, L.pants); } else { r(-1, -2 + (walk && ph === 1 ? 1 : 0), 1, 2, L.pants); r(1, -2 + (walk && ph === 3 ? 1 : 0), 1, 2, L.pants); r(-1, -1, 1, 1, shoe); r(1, -1, 1, 1, shoe); }
  r(-1, -5 + t, 4, 3, L.shirt);
  const up = pose === 'cheer' || pose === 'wave';
  if (up) { r(-2, -8 + t, 1, 3, L.shirt); r(3, -8 + t, 1, 3, L.shirt); } else { r(-2, -5 + t, 1, 2, L.shirt); r(3, -5 + t, 1, 2, L.shirt); r(3, -3 + t, 1, 1, L.skin); }
  r(-1, -9 + t, 4, 4, L.skin); r(1, -7 + t, 1, 1, eye); r(2, -7 + t, 1, 1, eye);
  r(-1, -9 + t, 4, 1, L.hair); r(-1, -8 + t, 1, 2, L.hair);
  return R;
}

/** Pixel rectangles for one survivor frame, built facing right then mirrored. */
export function personRects(p: Person) {
  if (p.kid) return kidRects(p, p.up > 0.5);
  const R: [number, number, number, number, string][] = [];
  const f = p.face, L = p.per.look, pose = p.pose, ph = Math.floor(p.anim * (FRAME_RATE[pose] ?? 0)) % 4;
  const shirtD = shade(L.shirt, 0.72), shoe = '#2a2018', eye = '#1a1420';
  const r = (dx: number, dy: number, w: number, h: number, c: string) => R.push([f < 0 ? -dx - w + 1 : dx, dy, w, h, c]);

  if (pose === 'sleep') {
    r(1, -3, 5, 2, L.pants); r(6, -3, 1, 2, shoe); r(-4, -4, 5, 3, L.shirt); r(-4, -2, 5, 1, shirtD); r(-3, -2, 4, 1, L.skin);
    r(-8, -5, 4, 4, L.skin); if (L.style !== 'bald') r(-9, -5, 2, 4, L.hair); r(-6, -4, 1, 1, eye);
    return R;
  }
  let t = 0, hx = 0, la = 0, lb = 0, sw = 0, crouch = false, sit = false;
  let fa: Arm = 'down', ba: Arm = 'down';
  const moving = pose === 'walk' || pose === 'run' || pose === 'limp';
  if (moving) {
    t = ph % 2 ? -1 : 0; la = ph === 1 ? 1 : 0; lb = ph === 3 ? 1 : 0; sw = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    if (pose === 'run') { hx = 1; t -= 0; }
    if (pose === 'limp') { t = ph === 1 ? 1 : 0; lb = 0; }
  }
  switch (pose) {
    case 'sit': sit = true; t = 2; break;
    case 'search': crouch = true; t = 3; hx = 1; fa = ph % 2 ? 'reach' : 'down'; break;
    case 'collect': crouch = true; t = 3; hx = 1; fa = ph % 2 ? 'reach' : 'carry'; break;
    case 'point': fa = 'fwd'; break;
    case 'wave': fa = ph % 2 ? 'up' : 'out'; break;
    case 'whistle': fa = 'mouth'; break;
    case 'cheer': fa = 'up'; ba = 'up'; t = -(ph % 2); break;
    case 'argue': hx = 1; fa = ph % 2 ? 'fwd' : 'fist'; ba = 'fist'; t = ph % 2; break;
    case 'slump': t = 1; hx = 1; break;
    case 'startle': t = -2; fa = 'out'; ba = 'out'; break;
    case 'fish': fa = 'rod'; break;
    case 'eat': sit = true; t = 2; fa = ph % 2 ? 'mouth' : 'food'; break;
    case 'build': crouch = true; t = 2; hx = 1; fa = ph % 2 ? 'hamUp' : 'hamDown'; break;
  }
  if (p.carry === 1 && fa === 'down') fa = 'bucket';
  if (p.carry === 2 && fa === 'down') fa = 'carry';
  if (p.carry === 3 && fa === 'down') fa = 'log';
  if (p.torch && (fa === 'down' || fa === 'bucket')) fa = 'torch';
  if (p.per.age === 'teen') t += 1;

  // legs
  if (sit) { r(-2, -2, 6, 2, L.pants); r(4, -2, 1, 2, shoe); }
  else if (crouch) { r(-2, -2, 2, 2, L.pants); r(-2, -1, 2, 1, shoe); r(1, -3, 3, 1, L.pants); r(3, -2, 1, 2, L.pants); r(3, -1, 2, 1, shoe); }
  else { r(-2, -3 + la, 2, 3 - la, L.pants); r(-2, -1, 2, 1, shoe); r(1, -3 + lb, 2, 3 - lb, L.pants); r(1, -1, 2, 1, shoe); }
  if (p.per.age === 'teen' && !sit && !crouch) { r(-2, -4 + t, 2, 1, L.pants); r(1, -4 + t, 2, 1, L.pants); }
  // body
  r(-2, -4 + t, 5, 1, L.pants); r(-2, -8 + t, 5, 4, L.shirt); r(-2, -8 + t, 1, 4, shirtD);
  const arm = (x: number, a: Arm, c: string, s: number) => {
    const d = x > 0 ? 1 : -1;
    switch (a) {
      case 'down': r(x, -8 + s + t, 1, 3, c); r(x, -5 + s + t, 1, 1, L.skin); break;
      case 'fwd': r(x, -8 + t, 4, 1, c); r(x + 4 * d, -8 + t, 1, 1, L.skin); break;
      case 'up': r(x, -12 + t, 1, 4, c); r(x, -13 + t, 1, 1, L.skin); break;
      case 'out': r(x + d, -11 + t, 1, 3, c); r(x, -8 + t, 1, 1, c); r(x + d, -12 + t, 1, 1, L.skin); break;
      case 'mouth': r(x, -9 + t, 1, 2, c); r(x - 1, -10 + t, 1, 1, L.skin); break;
      case 'torch': r(x, -10 + t, 1, 3, c); r(x, -11 + t, 1, 1, L.skin); r(x, -15 + t, 1, 4, '#6a4a2e'); break;
      case 'bucket': r(x, -8 + t, 1, 3, c); r(x, -5 + t, 3, 3, '#8a8a90'); r(x, -5 + t, 3, 1, '#5a5a60'); break;
      case 'log': r(x, -9 + t, 1, 2, c); r(x - 4 * d, -11 + t, 7, 2, '#8a5a30'); r(x - 4 * d, -11 + t, 1, 2, '#c8a070'); break;
      case 'carry': r(x, -7 + t, 1, 2, c); r(x, -8 + t, 3, 2, '#e0a030'); r(x + 1, -9 + t, 1, 1, '#6bc06b'); break;
      case 'reach': r(x, -7 + t, 1, 2, c); r(x + d, -5 + t, 1, 2, c); r(x + d, -3 + t, 1, 1, L.skin); break;
      case 'fist': r(x, -11 + t, 1, 3, c); r(x, -12 + t, 1, 1, L.skin); break;
      case 'hamUp': r(x, -12 + t, 1, 4, c); r(x, -13 + t, 1, 1, L.skin); r(x - d, -15 + t, 3, 2, '#8a8a90'); break;
      case 'hamDown': r(x, -8 + t, 3, 1, c); r(x + 3 * d, -8 + t, 1, 1, L.skin); r(x + 3 * d, -10 + t, 2, 3, '#8a8a90'); break;
      case 'food': r(x, -7 + t, 1, 2, c); r(x, -8 + t, 2, 2, '#e0503a'); break;
      case 'rod': r(x, -8 + t, 2, 1, c); for (let k = 0; k < 5; k++) r(x + 1 + k, -9 - k + t, 1, 1, '#8a6a4a'); r(x + 6, -13 + t, 1, 9, '#cfd8e0'); break;
    }
  };
  if (pose === 'cover') { r(-3, -12 + t, 1, 5, shirtD); r(3, -12 + t, 1, 5, L.shirt); r(-3, -13 + t, 1, 1, L.skin); r(3, -13 + t, 1, 1, L.skin); r(-2, -14 + t, 5, 1, L.skin); }
  else { arm(-3, ba, shirtD, -sw); arm(3, fa, L.shirt, sw); }
  // head
  const hy = -13 + t + (pose === 'slump' ? 1 : 0);
  r(-2 + hx, hy, 5, 5, L.skin);
  if (pose === 'slump') r(1 + hx, hy + 2, 2, 1, eye); else { r(0 + hx, hy + 2, 1, 1, eye); r(2 + hx, hy + 2, 1, 1, eye); }
  if (L.style === 'short') { r(-2 + hx, hy, 5, 1, L.hair); r(-2 + hx, hy + 1, 2, 2, L.hair); }
  else if (L.style === 'long') { r(-2 + hx, hy, 5, 1, L.hair); r(-2 + hx, hy + 1, 2, 5, L.hair); r(-3 + hx, hy + 1, 1, 4, L.hair); }
  else if (L.style === 'cap') { r(-2 + hx, hy - 1, 5, 2, L.cap); r(3 + hx, hy, 2, 1, L.cap); r(-2 + hx, hy + 1, 1, 2, L.hair); }
  return R;
}

/** Bodies: movement, sprites, torches, footprints. Behaviour lives in brain.ts / group.ts. */
export class Survivors {
  batch: SpriteBatch;
  people: Person[] = [];
  lights: THREE.PointLight[] = [];
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  readonly yUp = PX / Math.cos(PITCH);       // world-y per screen pixel, for things drawn above a sprite
  /** footfall per 4×4 cell: busy routes wear into paths */
  wear = new Float32Array(192 * 192);

  constructor(private w: World, private grid: WalkGrid, pers: Persona[], private fx: Particles) {
    const c = document.createElement('canvas'); c.width = SW * MAXP; c.height = SH;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.batch = new SpriteBatch(this.tex, MAXP);
    for (let i = 0; i < 4; i++) this.lights.push(new THREE.PointLight(0xffa050, 0, 16, 1.4));
    const cr = w.crash, ax = Math.cos(cr.rot), az = Math.sin(cr.rot);
    for (const per of pers) {
      // everyone starts out cold on the sand beside the wreck
      const i = per.id, side = i % 2 ? 1 : -1, along = -5 + (i >> 1) * 1.6;
      let x = cr.x + ax * along - az * side * (3.4 + (i % 3) * 0.6), z = cr.z + az * along + ax * side * (3.4 + (i % 3) * 0.6);
      if (!grid.walkable(x, z)) { const q = grid.nearest(x, z)!; x = q.x + Math.random() - 0.5; z = q.z + Math.random() - 0.5; }
      const p = this.spawn(per, x, z); p.face = side; p.pose = 'sleep'; p.mode = 'asleep';
    }
  }

  /** A new body in the world (the crash survivors, and later anyone born here). */
  spawn(per: Persona, x: number, z: number): Person {
    const p: Person = {
      id: per.id, per, x, z, face: 1, pose: 'idle', anim: Math.random() * 9, key: '', mode: 'camp',
      path: [], repath: 0, stuck: 0, moving: false, act: '', actT: Math.random() * 3, ax: x, az: z, partner: null,
      poseO: null, poseT: 0, torch: false, carry: 0, hurt: false, heal: 0, mood: 'none', tmood: 'none', moodT: 0, why: '', apart: 0, apartHit: false, step: 0, ask: false, bring: '', hungry: false,
      job: '', wph: '', wT: 0, xp: {}, love: '', hate: '', pin: '', hateT: 0, sleepIn: false, watched: false, savedBy: -1, health: 0, hungerN: 0,
      crew: false, outAt: -1e9, tripAt: 0, outLike: 0, tiredN: 0, haul: [], keeps: [], up: 0, kid: false, born: -1, couple: -1,
    };
    this.people.push(p);
    return p;
  }

  speed(p: Person) {
    const s = p.per.strength, k = p.per.weakness;
    return 2.3 * (s === 'fast walker' ? 1.2 : 1) * (k === 'bad knee' ? 0.85 : 1) * (p.per.age === 'elder' ? 0.88 : 1) * (p.hurt ? 0.5 : 1) * (p.health >= 1 ? 0.8 : 1);
  }

  /** Plan a path to (x,z). */
  go(p: Person, x: number, z: number) { p.path = this.grid.find(p.x, p.z, x, z); p.stuck = 0; return p.path.length > 0; }

  /** Walk along the current path. Returns true when there is nothing left to walk. */
  advance(p: Person, spd: number, dt: number) {
    while (p.path.length) {
      const q = p.path[0];
      if (Math.hypot(q.x - p.x, q.z - p.z) < 0.35) { p.path.shift(); continue; }
      if (!this.steer(p, q.x, q.z, spd, dt, true)) return false;
      p.path.shift();
    }
    return true;
  }

  /** Move straight toward (tx,tz). Returns true on arrival (or when blocked and `force` is off). */
  steer(p: Person, tx: number, tz: number, spd: number, dt: number, force = false) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { p.moving = false; return true; }
    const s = Math.min(d, spd * dt), nx = p.x + dx / d * s, nz = p.z + dz / d * s;
    if (force || this.grid.canStep(p.x, p.z, nx, nz)) { p.x = nx; p.z = nz; p.stuck = 0; }
    else { p.stuck += dt; p.moving = false; return true; }
    p.moving = true;
    const rr = U.uCamRight.value, sx = dx * rr.x + dz * rr.z;
    if (Math.abs(sx) > 0.02 * d) p.face = sx > 0 ? 1 : -1;
    // footprints in sand and mud
    if ((p.step += s) > 0.55) {
      p.step = 0;
      const ci = Math.floor(p.z / 4) * 192 + Math.floor(p.x / 4); if (ci >= 0 && ci < this.wear.length && this.wear[ci] < 200) this.wear[ci] += 0.25;
      const b = biomeAt(this.w, p.x, p.z);
      if (b === B.Beach || b === B.Swamp || b === B.Dirt) {
        const side = (Math.floor(p.anim * 4) % 2 ? 0.12 : -0.12);
        this.fx.emit('dot1', p.x - dz / d * side, heightAt(this.w, p.x, p.z) + 0.03, p.z + dx / d * side, { flat: true, max: 30, r: 0.55, g: 0.45, b: 0.33, a: 0.75 });
      }
    }
    return false;
  }

  faceToward(p: Person, x: number, z: number) { const rr = U.uCamRight.value, sx = (x - p.x) * rr.x + (z - p.z) * rr.z; if (Math.abs(sx) > 0.05) p.face = sx > 0 ? 1 : -1; }
  ground(p: Pt) { return heightAt(this.w, p.x, p.z); }

  /** Draw people into their own atlas + batch; flames and mood icons go into the shared batch. */
  draw(main: SpriteBatch, night: number, fire: { x: number; z: number; lit: number }, camT: THREE.Vector3) {
    let dirty = false;
    this.batch.begin();
    const torches: Person[] = [];
    for (const p of this.people) {
      if (p.mode === 'dead') continue;
      const fr = Math.floor(p.anim * (FRAME_RATE[p.pose] ?? 0)) % 4, key = `${p.pose}${p.face}${fr}${p.torch ? 1 : 0}${p.carry}`;
      if (key !== p.key) {
        p.key = key; dirty = true;
        const ox = p.id * SW, g = this.g;
        g.clearRect(ox, 0, SW, SH);
        const R = personRects(p), cx = ox + (SW >> 1);
        g.fillStyle = '#1c1626'; for (const q of R) g.fillRect(cx + q[0] - 1, FEET + q[1] - 1, q[2] + 2, q[3] + 2);
        for (const q of R) { g.fillStyle = q[4]; g.fillRect(cx + q[0], FEET + q[1], q[2], q[3]); }
      }
      const h = heightAt(this.w, p.x, p.z) + p.up, y = h - (SH - FEET) * PX;
      // warm light from the fire and nearby torches
      let fl = night * fire.lit * Math.max(0, 1 - Math.hypot(p.x - fire.x, p.z - fire.z) / 9);
      if (p.torch) { fl = Math.max(fl, night * 0.8); torches.push(p); }
      this.batch.push(p.x, y, p.z, { x: p.id * SW, y: 0, w: SW, h: SH }, false, 1 + fl * 2.4, 1 + fl * 1.3, 1 + fl * 0.5, 1);
      const lift = p.per.age === 'teen' ? 1 : 0;
      if (p.torch && p.pose !== 'sleep') {
        const rr = U.uCamRight.value, ff = ATLAS.flame[Math.floor(p.anim * 10) % 3], dx = 3 * p.face * PX;
        main.push(p.x + rr.x * dx, y + (SH - FEET + 15 - lift) * this.yUp, p.z + rr.z * dx, ff, false, 1, 1, 1, 2);
        if (Math.random() < 0.05) this.fx.emit('dot1', p.x + rr.x * dx, h + 2.1, p.z + rr.z * dx, { vy: 1.5, vx: (Math.random() - 0.5) * 0.6, max: 0.7, r: 1, g: 0.65, b: 0.25, emissive: true, fade: false });
      }
      const icon = MOOD_ICON[p.mood];
      if (p.ask) {
        // big, glowing, pulsing: hard to miss
        const bob = Math.round(Math.abs(Math.sin(p.anim * 4)) * 3), fr = Math.floor(p.anim * 3) % 2;
        main.push(p.x, y + (SH - FEET + 16 + bob - lift) * this.yUp, p.z, ATLAS.askMark[fr], false, 1, 1, 1, 2);
      } else if (icon && p.pose !== 'sleep') {
        const bob = Math.sin(p.anim * 3) > 0 ? 1 : 0, fr2 = ATLAS[icon][Math.floor(p.anim * 2) % ATLAS[icon].length];
        main.push(p.x, y + (SH - FEET + 16 + bob - lift + (p.pose === 'sit' ? -2 : p.pose === 'search' || p.pose === 'collect' ? -3 : 0)) * this.yUp, p.z, fr2, false, 1, 1, 1, 2);
      } else if (icon && p.pose === 'sleep') {
        main.push(p.x - 0.3, y + (SH - FEET + 6) * this.yUp, p.z, ATLAS.mSleep[Math.floor(p.anim * 1.5) % 2], false, 1, 1, 1, 2);
      }
    }
    if (dirty) this.tex.needsUpdate = true;
    this.batch.end();
    // the closest torch-bearers to the view get a real light
    torches.sort((a, b) => Math.hypot(a.x - camT.x, a.z - camT.z) - Math.hypot(b.x - camT.x, b.z - camT.z));
    this.lights.forEach((l, i) => {
      const p = torches[i];
      if (p) { l.position.set(p.x, heightAt(this.w, p.x, p.z) + 2.2, p.z); l.intensity = night * (3.2 + Math.sin(p.anim * 17) * 0.4 + Math.random() * 0.3); }
      else l.intensity = 0;
    });
  }
}
