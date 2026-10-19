import { B, biomeAt, heightAt } from '../world/island';
import { has } from './persona';
import { Person, Pt } from './people';
import { JOB, JobKind, level } from './jobs';
import type { A, Wildlife } from './wildlife';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

export type HandSkill = 'throw' | 'climb' | 'fight';
/** A run of timing rings for the UI: click as each ring closes on the mark. */
export interface Ring { title: string; beats: string[]; hard: number; skill: HandSkill; at: Pt; done: (hits: number, perfect: number) => void; beat?: (i: number, ok: boolean) => void }
export interface Spot { x: number; z: number; kind: 'tree' | 'cliff' | 'falls'; holds: number; climbed: boolean }
interface Spear { x: number; z: number; fx: number; fz: number; tx: number; tz: number; t: number; T: number; power: number }
type Taught = 'fish' | 'hunt' | 'climb';

/** How far a full-strength throw goes, and how long it takes to draw the spear all the way back. */
export const RANGE = 14, DRAW = 1.1;
/** Where a throw lands: hold longer for range and a straighter line. Exported for tests. */
export function landing(fx: number, fz: number, tx: number, tz: number, held: number, lvl: number, rnd = Math.random) {
  const power = Math.min(1, held / DRAW), want = Math.hypot(tx - fx, tz - fz) || 1;
  const reach = 4 + (RANGE - 4) * power, d = Math.min(want, reach);
  const shake = held > 2.6 ? Math.min(0.3, (held - 2.6) * 0.15) : 0;           // arm gets tired
  const err = ((1 - power) * 0.32 + shake) * (1 - lvl * 0.15) * (rnd() - 0.5) * 2;
  const a = Math.atan2(tz - fz, tx - fx) + err, dd = d * (1 + (rnd() - 0.5) * (1 - power) * 0.3);
  return { x: fx + Math.cos(a) * dd, z: fz + Math.sin(a) * dd, short: want > reach, power };
}

/** A timing ring: how far the closing ring was from the mark when you clicked, against the band's half-width. */
export function judgeRing(off: number, w: number) { return off < w * 0.45 ? 'PERFECT' : off < w ? 'GOOD' : 'MISS'; }

/**
 * Things only the leader does with their own hands: spear fishing and hunting, fights, climbing, caves,
 * finding people who didn't come back, and working beside the camp. The camp runs itself; this is your part.
 */
export class Hands {
  xp: Record<HandSkill, number> = { throw: 0, climb: 0, fight: 0 };
  rings: Ring[] = [];
  /** a ring is on screen (the world runs in slow motion) */
  ring = false;
  aim: { a: A; t: number; x: number; z: number } | null = null;
  spears: Spear[] = [];
  /** a kill being carried home */
  kill: { kind: 'boar' | 'deer'; young: boolean; by: Person } | null = null;
  deeds: { day: number; text: string; told: boolean }[] = [];
  trophies: ('boar' | 'deer')[] = [];
  taught: Record<number, Partial<Record<Taught, number>>> = {};
  spots: Spot[] = [];
  caves = new Set<number>();
  /** someone who didn't come back from work */
  missing: { id: number; day: number; tracks: Pt[] } | null = null;
  running = false;
  /** walking to an animal to throw at it / to a spot or cave to climb or go in */
  going: { kind: 'aim'; a: A } | { kind: 'climb'; s: Spot } | { kind: 'cave'; id: number } | null = null;
  private wild!: Wildlife;
  private speedWas = 0;
  private flank: { who: Person[]; t: number; herd: A } | null = null;
  private lostCheck = -1; private lastLost = -99;
  private sneaking = false;
  private beside: Person | null = null;

  constructor(private g: Group) {
    const w = g.w;
    for (const l of w.landmarks) if (l.kind === 'giantTree') { const q = g.grid.nearest(l.x + 3, l.z + 3); if (q) this.spots.push({ x: q.x, z: q.z, kind: 'tree', holds: 5, climbed: false }); }
    for (const r of w.rivers) for (const k of r.falls) { const p = r.pts[Math.min(r.pts.length - 1, k + 2)], q = g.grid.nearest(p.x + 2, p.z + 2); if (q && !this.spots.some(s => Math.hypot(s.x - q.x, s.z - q.z) < 30)) this.spots.push({ x: q.x, z: q.z, kind: 'falls', holds: 4, climbed: false }); }
    // cliffs: walkable ground at the foot of a wall
    const N = Math.sqrt(w.h.length);
    for (let z = 20; z < N - 20 && this.spots.length < 14; z += 7) for (let x = 20; x < N - 20; x += 7) {
      if (!g.grid.walkable(x, z) || biomeAt(w, x, z) === B.Beach) continue;
      const h0 = heightAt(w, x, z);
      let up = 0; for (let a = 0; a < 6.28; a += 0.8) up = Math.max(up, heightAt(w, x + Math.cos(a) * 3.5, z + Math.sin(a) * 3.5) - h0);
      if (up > 5 && !this.spots.some(s => Math.hypot(s.x - x, s.z - z) < 45)) this.spots.push({ x, z, kind: 'cliff', holds: 4 + (up > 9 ? 1 : 0), climbed: false });
    }
  }

  setWild(w: Wildlife) { this.wild = w; }
  lvl(k: HandSkill) { return level(this.xp[k]); }
  busy() { return !!this.aim || this.ring || this.rings.length > 0; }

  /** How fast the leader walks right now. */
  pace() { return this.kill?.by === this.g.leader ? 0.65 : this.running ? 1.55 : this.sneaking ? 0.6 : 1; }

  // ------------------------------------------------------------------ input

  /** Pressed on the world at (x, z). True if it was an animal (aim) instead of a walk. */
  press(x: number, z: number): boolean {
    const g = this.g, L = g.leader;
    if (!L || L.actT > 0 || g.canoe.riding(L) || !this.wild || this.busy()) return false;
    const a = this.wild.gameAt(x, z, 2.2);
    if (!a) return false;
    if (g.stock.tools.spear <= 0) { g.story.say(L, a.k === 'fish' ? "If only I had a spear..." : 'With my bare hands? I need a spear.', 2); return true; }
    const d = Math.hypot(a.x - L.x, a.z - L.z);
    if (d > RANGE - 1) {        // walk into range first
      const k = (d - (RANGE - 4)) / d, q = g.grid.nearest(L.x + (a.x - L.x) * k, L.z + (a.z - L.z) * k) ?? a;
      g.bodies.go(L, q.x, q.z); this.going = { kind: 'aim', a }; g.helping = null;
      g.hint('stalk', 'Walk up slowly: near animals you sneak on your own. Double-click to run, but running scares them off.');
      return true;
    }
    this.startAim(a, x, z);
    return true;
  }
  gameNear(x: number, z: number) { return this.wild?.gameAt(x, z, 2.2) ?? null; }
  move(x: number, z: number) { if (this.aim) { this.aim.x = x; this.aim.z = z; } }
  release() { if (this.aim) this.throwSpear(); }
  cancel() { if (this.aim) { this.aim = null; this.restoreSpeed(); } }

  /** A click on the ground: a carcass, a climb spot or a cave mouth means doing that. */
  click(x: number, z: number): boolean {
    const g = this.g, L = g.leader!; this.going = null;
    const s = this.spots.find(s => Math.hypot(s.x - x, s.z - z) < 3.5 && Math.hypot(s.x - L.x, s.z - L.z) < 60);
    if (s) { g.bodies.go(L, s.x, s.z); this.going = { kind: 'climb', s }; return true; }
    const cave = g.disc.pois.find(q => q.kind === 'cave' && q.known && Math.hypot(q.x - x, q.z - z) < 5);
    if (cave) { const q = g.grid.nearest(cave.x, cave.z + 3) ?? cave; g.bodies.go(L, q.x, q.z); this.going = { kind: 'cave', id: cave.id }; return true; }
    return false;
  }

  private startAim(a: A, x: number, z: number) {
    const g = this.g, L = g.leader!;
    L.path = []; this.going = null;
    this.aim = { a, t: 0, x, z };
    if (g.clock.speed > 1) { this.speedWas = g.clock.speed; g.clock.speed = 1; }
    // your crew goes round the far side, so the herd runs your way
    const party = g.party.filter(p => p.mode === 'follow' && !p.hurt && !p.kid).slice(0, 2);
    if (a.k !== 'fish' && party.length && !this.flank) {
      const dx = a.x - L.x, dz = a.z - L.z, l = Math.hypot(dx, dz) || 1;
      party.forEach((p, i) => { const s = (i ? 1 : -1) * 0.6, fx = a.x + (dx / l * Math.cos(s) - dz / l * Math.sin(s)) * 10, fz = a.z + (dx / l * Math.sin(s) + dz / l * Math.cos(s)) * 10; p.mode = 'wait'; g.bodies.go(p, fx, fz); });
      this.flank = { who: party, t: 25, herd: a };
      g.story.say(party[0], pickOf(["I'll go round!", 'Drive them to you!', 'Flanking!']), 2);
    }
    g.hint('aim', 'Hold to draw the spear back, let go to throw. Longer holds go farther and straighter. Moving targets: aim ahead of them.');
  }

  private throwSpear() {
    const g = this.g, L = g.leader!, A_ = this.aim!; this.aim = null;
    const l = landing(L.x, L.z, A_.x, A_.z, A_.t, this.lvl('throw'));
    const T = 0.15 + Math.hypot(l.x - L.x, l.z - L.z) / 16;
    this.spears.push({ x: L.x, z: L.z, fx: L.x, fz: L.z, tx: l.x, tz: l.z, t: 0, T, power: l.power });
    L.poseO = 'point'; L.poseT = 0.5; g.bodies.faceToward(L, l.x, l.z);
    if (l.short) g.story.say(L, 'Too far...', 1.5);
  }

  /** A spear comes down. */
  private land(s: Spear) {
    const g = this.g, S = g.story, L = g.leader!, W = this.wild;
    const r = 0.85 + this.lvl('throw') * 0.15, a = W.gameAt(s.tx, s.tz, r);
    const y = Math.max(heightAt(g.w, s.tx, s.tz), 0);
    if (!a) {
      this.xp.throw += 0.3;
      g.fx.emit('splash', s.tx, y + 0.05, s.tz, { max: 0.4 });
      W.spook(s.tx, s.tz, 7);
      if (Math.random() < 0.35) S.say(L, pickOf(['Missed!', 'Argh.', 'So close.']), 1.4);
      this.restoreSpeed(); return;
    }
    const d = Math.hypot(a.x - s.tx, a.z - s.tz), clean = d < r * 0.45 || s.power >= 1 && d < r * 0.7;
    this.xp.throw += 1;
    if (a.k === 'fish') {
      W.strike(a, true);
      const bi = biomeAt(g.w, a.x, a.z), big = bi === B.Lagoon || bi === B.Reef;
      g.stock.add('fish', big ? 2 : 1); g.onClunk();
      S.say(L, big ? pickOf(['A big one!', 'Look at the size of it!']) : pickOf(['Got one!', 'Fish!', 'Ha!']), 1.6);
      this.learn('fish'); this.restoreSpeed();
      g.hint('fished', 'Speared fish go straight on the pile. The lagoon and the reef have the big ones.');
      return;
    }
    const was = a.bleed !== undefined;
    W.strike(a, clean);
    if (a.state === 4) S.say(L, a.k === 'deer' ? 'Got it!' : pickOf(['Down!', 'Got it!']), 1.8);
    else { S.say(L, was ? 'Again!' : "It's hit! Follow the blood!", 2); g.hint('blood', 'A wounded animal runs, but not far. Follow the blood trail.'); }
    // a big boar might turn and come for you
    if (a.k === 'boar' && !a.young && a.state !== 4 && Math.hypot(a.x - L.x, a.z - L.z) < 11 && Math.random() < 0.35) this.fight('boar', null, a);
    else this.restoreSpeed();
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number) {
    const g = this.g, L = g.leader, S = g.story; if (!L || !this.wild) return;
    if (this.aim) {
      this.aim.t += dt;
      L.path = []; L.poseO = 'point'; L.poseT = 0.2; g.bodies.faceToward(L, this.aim.x, this.aim.z);
      if (!this.wild.alive(this.aim.a)) this.cancel();
    }
    for (const s of [...this.spears]) {
      s.t += dt; const k = Math.min(1, s.t / s.T);
      s.x = s.fx + (s.tx - s.fx) * k; s.z = s.fz + (s.tz - s.fz) * k;
      if (k >= 1) { this.spears = this.spears.filter(x => x !== s); this.land(s); }
    }
    // walking up to something
    const go = this.going;
    if (go && !L.path.length) {
      this.going = null;
      if (go.kind === 'aim' && this.wild.alive(go.a) && Math.hypot(go.a.x - L.x, go.a.z - L.z) < RANGE) S.say(L, 'Easy... easy...', 1.5);
      if (go.kind === 'climb' && Math.hypot(go.s.x - L.x, go.s.z - L.z) < 3) this.climb(go.s);
      if (go.kind === 'cave') { const c = g.disc.pois.find(q => q.id === go.id); if (c && Math.hypot(c.x - L.x, c.z - L.z) < 7) this.cave(c.id); }
    }
    // the sneak: near a herd you creep; running sends it off
    let near = 99; for (const a of this.wild.list) if ((a.k === 'boar' || a.k === 'deer') && a.state !== 4) near = Math.min(near, Math.hypot(a.x - L.x, a.z - L.z));
    if (!L.moving) this.running = false;
    this.sneaking = near < 18 && !this.running && !this.kill;
    if (near < 25) this.wild.spook(L.x, L.z, this.running ? 16 : L.moving ? (this.sneaking ? 4.5 : 9) : 3);
    if (this.running && L.moving) L.pose = 'run';
    // the flankers come round and drive the herd
    if (this.flank) {
      const f = this.flank;
      f.t -= dt;
      for (const p of f.who) if (p.mode === 'wait' && Math.hypot(p.x - f.herd.x, p.z - f.herd.z) < 7) { this.wild.spook(p.x, p.z, 9); if (Math.random() < dt) S.say(p, pickOf(['Hyah!', 'GO!', 'This way!']), 1.2); }
      if (f.t <= 0) { for (const p of f.who) if (p.mode === 'wait') { p.mode = 'follow'; p.act = ''; } this.flank = null; }
    }
    // picking up a kill: someone strong carries it, or you do
    if (!this.kill) {
      const c = this.wild.carcassAt(L.x, L.z, 1.8);
      if (c) {
        const by = g.party.filter(p => !p.hurt && !p.kid && Math.hypot(p.x - L.x, p.z - L.z) < 15).sort((a, b) => Number(has(b.per, 'hardworking')) - Number(has(a.per, 'hardworking')))[0] ?? L;
        this.kill = { kind: c.k as 'boar' | 'deer', young: !!c.young, by }; this.wild.remove(c);
        by.carry = 3; S.say(by, by === L ? "Heavy. Let's get it home." : "I've got it. Lead the way.", 2);
        g.hint('carry', 'Bring it back to camp. Heavy kills slow you down unless someone in your crew carries them.');
      }
    } else {
      const k = this.kill, by = k.by;
      if (by.mode === 'dead') this.kill = null;
      else { by.carry = 3; if (Math.hypot(by.x - g.stock.pile.x, by.z - g.stock.pile.z) < 10) this.homeWith(k); }
    }
    this.leaderHeal(dt);
    this.besideThem(L, dt);
    this.lostOnes(L);
    if (this.speedWas) this.restoreSpeed();
  }

  private restoreSpeed() { if (this.speedWas && !this.busy() && !this.spears.length) { if (this.g.clock.speed === 1) this.g.clock.speed = this.speedWas; this.speedWas = 0; } }

  /** You bring a kill into camp: meat, a hide, a cheer. The first of each kind hangs by the fire. */
  private homeWith(k: NonNullable<Hands['kill']>) {
    const g = this.g, S = g.story, L = g.leader!;
    this.kill = null; k.by.carry = 0;
    g.stock.add('meat', k.young ? 2 : k.kind === 'deer' ? 8 : 6); if (!k.young) g.stock.hides++;
    g.onClunk();
    for (const p of g.people) if (p.mode === 'camp' && Math.hypot(p.x - g.fire.x, p.z - g.fire.z) < 25 && p.pose !== 'sleep') { p.poseO = 'cheer'; p.poseT = 1.8; }
    const what = k.young ? 'a piglet' : k.kind === 'deer' ? 'a deer' : 'a wild boar';
    S.toast(`You brought home ${what}!`, 'good'); S.log(`${L.per.name} came back with ${what}${k.by !== L ? `, ${k.by.per.name} carrying it` : ''}. Meat tonight.`);
    if (!k.young) { S.trustAll(2, L); for (const p of g.people) if (p.mode === 'camp') S.mood(p, 'happy', 30); }
    this.learn('hunt');
    if (!k.young && !this.trophies.includes(k.kind)) {
      this.trophies.push(k.kind);
      this.deed(k.kind === 'deer' ? 'brought down the first deer' : 'speared the first wild boar', true);
      const by = g.people.find(p => p.mode === 'camp' && p !== L && p.pose !== 'sleep');
      if (by) setTimeout(() => S.say(by, k.kind === 'deer' ? "We'll hang the antlers by the fire." : "Those tusks go by the fire. So everyone remembers.", 3), 1500);
    }
  }

  /** Stand beside someone working and you work too: faster, happier, and they learn quicker. */
  private besideThem(L: Person, dt: number) {
    const g = this.g;
    if (L.path.length || L.moving || this.busy() || g.helping || L.actT > 0 || g.canoe.riding(L)) { this.beside = null; return; }
    const p = g.people.find(o => o.mode === 'camp' && o.job && g.jobs.on(o) && !o.path.length && Math.hypot(o.x - L.x, o.z - L.z) < 3.2);
    if (!p) { this.beside = null; return; }
    if (this.beside !== p) { this.beside = p; g.hint('beside', `You work beside ${p.per.name}. Jobs go faster with you there, and people learn quicker.`); if (Math.random() < 0.5) g.story.say(p, pickOf(['Grab the other end.', 'Thanks for the hand.', 'Here, like this.']), 2); }
    L.pose = p.pose; g.bodies.faceToward(L, p.x + p.face, p.z);
    const k = p.job as JobKind; p.xp[k] = (p.xp[k] ?? 0) + dt * 0.02;
    if (Math.random() < dt * 0.02) { g.story.mood(p, 'fond', 20); g.story.addRel(p, L, 1); }
    if (Math.random() < dt * 0.004 && JOB[k]) g.story.log(`${L.per.name} spent a while ${JOB[k].verb} with ${p.per.name}.`);
  }

  // ------------------------------------------------------------------ fights

  /** Something comes at you (or someone near you): dodge and strike. */
  fight(kind: 'cat' | 'boar', victim: Person | null, a: A | null) {
    const g = this.g, S = g.story, L = g.leader!, C = g.cat, name = C.name || 'the cat';
    if (g.clock.speed > 1) { this.speedWas = this.speedWas || g.clock.speed; g.clock.speed = 1; }
    L.path = []; this.aim = null;
    g.onAlarm();
    if (kind === 'boar') {
      S.say(L, 'It\'s coming at me!', 1.6);
      this.rings.push({ title: 'THE BOAR CHARGES', beats: ['DODGE', 'STRIKE'], hard: 0.45, skill: 'fight', at: { x: L.x, z: L.z }, done: (hits) => {
        this.xp.fight += 1 + hits;
        if (hits >= 2 && a) { this.wild.strike(a, true); S.say(L, 'Not today.', 2); this.deed('faced down a charging boar', false); }
        else if (hits === 1) { if (a) this.wild.flee(a, L.x, L.z); S.say(L, 'Whoa! It ran off.', 2); }
        else { if (a) this.wild.flee(a, L.x, L.z); this.hurtLeader('a boar\'s tusks'); }
        this.restoreSpeed();
      } });
      return;
    }
    const saving = victim && victim !== L;
    if (saving) S.say(L, `${victim!.per.name}! Get behind me!`, 2);
    this.rings.push({ title: `${name.toUpperCase()} ATTACKS`, beats: ['DODGE', 'STRIKE', 'STRIKE'], hard: 0.7, skill: 'fight', at: { x: C.x, z: C.z }, done: (hits, perfect) => {
      this.xp.fight += 1 + hits * 2;
      if (hits >= 2) {
        C.scare(); C.wounded = Math.max(C.wounded, perfect >= 3 ? 3 : 2);
        S.toast(`You drove ${name} off${saving ? ` and saved ${victim!.per.name}` : ''}!`, 'good');
        S.log(`${name} came out of the dark at ${saving ? victim!.per.name : L.per.name}. ${L.per.name} fought it off with a spear. It ran, bleeding.`);
        if (saving) { S.trust(victim!, 12); S.addRel(victim!, L, 20); victim!.savedBy = L.id; }
        this.deed(`drove off ${name}${saving ? ` to save ${victim!.per.name}` : ''}`, true);
      } else {
        C.scare();
        this.hurtLeader(`${name}'s claws`);
        if (saving && hits === 0) { victim!.hurt = true; victim!.heal = 600; if (victim!.mode === 'camp') g.health.worsen(victim!, 'a mauling'); }
        S.log(`${name} got the better of ${L.per.name}. They're lucky to be alive.`);
      }
      this.restoreSpeed();
    } });
  }

  /** Hurt: slower, and it needs rest. Hurt again while badly hurt, and it could be the end. */
  hurtLeader(why: string) {
    const g = this.g, S = g.story, L = g.leader!;
    L.poseO = 'startle'; L.poseT = 1;
    if (L.hurt && L.health >= 2) { S.log(`${L.per.name} was hurt too many times. ${why} was the last of it.`); g.health.die(L, why); return; }
    if (L.hurt) { g.health.worsen(L, why); L.heal = Math.max(L.heal, 700); S.toast(`You're hurt again. Get to the sick bay and rest.`, 'bad'); return; }
    L.hurt = true; L.heal = 500;
    S.toast(`You're hurt (${why}). Rest by the fire or in the sick bay.`, 'bad'); S.say(L, 'Argh...!', 1.6);
    S.trustAll(-1, L);
    g.hint('hurtL', 'You limp while you are hurt. Resting at camp heals you faster, the sick bay fastest. Another injury now could be serious.');
  }

  private leaderHeal(dt: number) {
    const g = this.g, L = g.leader!;
    if (!L.hurt) return;
    const sb = g.camp.get('sickbay'), atCamp = Math.hypot(L.x - g.fire.x, L.z - g.fire.z) < 15;
    const r = (sb && Math.hypot(L.x - sb.x, L.z - sb.z) < 6 ? 3 : atCamp && !L.moving ? 1.8 : 0.6);
    if ((L.heal -= dt * r) <= 0) { L.hurt = false; g.story.toast("You're back on your feet.", 'good'); }
  }

  // ------------------------------------------------------------------ climbing and caves

  private climb(s: Spot) {
    const g = this.g, S = g.story, L = g.leader!;
    if (L.hurt) { S.say(L, 'Not with this leg.', 2); return; }
    const what = s.kind === 'tree' ? 'the giant tree' : s.kind === 'falls' ? 'the rocks by the falls' : 'the cliff';
    const h = s.kind === 'tree' ? 5 : 3.5;
    const beats = Array.from({ length: s.holds }, (_, i) => i === s.holds - 1 ? 'PULL UP' : pickOf(['REACH', 'GRAB', 'STEP', 'HOLD']));
    L.path = []; g.bodies.faceToward(L, L.x, L.z - 1);
    this.rings.push({ title: `CLIMBING ${what.toUpperCase()}`, beats, hard: 0.35 + s.holds * 0.05, skill: 'climb', at: s,
      // each hold you make takes you higher; a miss is a slip
      beat: (_i, ok) => { L.up = Math.max(0, L.up + (ok ? h / s.holds : -0.3)); L.poseO = ok ? 'cheer' : 'startle'; L.poseT = 0.6; if (!ok) S.say(L, 'Whoa-!', 1); },
      done: (hits) => {
      const miss = s.holds - hits;
      this.xp.climb += 1 + hits * 0.5;
      if (miss >= 2) { L.up = 0; S.say(L, 'Aaah-!', 1.2); this.hurtLeader('a fall'); return; }
      L.up = h; L.poseO = 'point'; L.poseT = 4;
      if (miss === 1) S.say(L, 'Whoa... nearly. Okay.', 2);
      setTimeout(() => { L.up = 0; }, 5000);
      this.top(s);
    } });
  }

  /** From up high you can see far; first time up, there's something worth having. */
  private top(s: Spot) {
    const g = this.g, S = g.story, L = g.leader!, D = g.disc;
    D.markExplored(s.x, s.z, 70);
    for (const poi of D.inSight(s.x, s.z, 3.2)) g.know(poi, L, true);
    const far = D.pois.filter(q => q.major && !q.known && !D.markers.some(m => m.poi === q)).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (far && Math.random() < 0.6) D.rumor(far, 10, 24, 'Seen from up high', L);
    this.learn('climb');
    if (s.climbed) { S.say(L, pickOf(['Still a great view.', 'I can see camp from here.']), 2.5); return; }
    s.climbed = true;
    const find = s.kind === 'tree' ? pickOf(['coconuts', 'eggs']) : s.kind === 'cliff' ? pickOf(['eggs', 'crate', 'view']) : pickOf(['view', 'eggs']);
    if (find === 'coconuts') { g.stock.add('coconut', 4); S.toast('Coconuts from the top of the tree!', 'good'); }
    if (find === 'eggs') { g.stock.add('snacks', 3); S.toast("A nest up top. Eggs!", 'good'); }
    if (find === 'crate') { g.stock.add('scrap', 4); g.stock.add('snacks', 3); S.toast('A crate from the plane, stuck on a ledge!', 'good'); }
    if (find === 'view') S.toast('You can see half the island from up here.', 'good');
    this.deed(`climbed ${s.kind === 'tree' ? 'the giant tree' : s.kind === 'falls' ? 'up beside the falls' : 'a cliff nobody else would try'}`, s.kind === 'tree');
  }

  /** Into a cave with a torch: a squeeze, a drop, a dark turn. Something at the end (or something waiting). */
  private cave(id: number) {
    const g = this.g, S = g.story, L = g.leader!, C = g.cat, poi = g.disc.pois.find(q => q.id === id)!;
    if (L.hurt) { S.say(L, 'Not like this. I need to heal first.', 2); return; }
    const lair = C.phase === 'stalk' && Math.hypot(C.lair.x - poi.x, C.lair.z - poi.z) < 12;
    if (this.caves.has(id) && !lair) { S.say(L, "We've been through this one.", 2); return; }
    const night = g.clock.night > 0.5;
    if (!night) { if (g.stock.mat.wood < 1) { S.say(L, "It's pitch black in there. I need wood for a torch.", 2.5); return; } g.stock.mat.wood--; }
    L.torch = true;
    if (lair) { S.say(L, 'Bones... this is its den.', 2); setTimeout(() => this.fight('cat', L, null), 1200); return; }
    this.rings.push({ title: `INTO ${g.disc.display(poi).toUpperCase()}`, beats: ['SQUEEZE THROUGH', 'CLIMB DOWN', 'FEEL YOUR WAY', 'DIG'], hard: 0.5, skill: 'climb', at: poi, done: (hits) => {
      this.xp.climb += hits * 0.5;
      if (hits <= 1) { this.hurtLeader('a fall in the dark'); return; }
      if (hits === 2) { S.say(L, 'My torch went out. Back the way I came...', 2.5); return; }
      this.caves.add(id);
      const r = Math.random();
      if (r < 0.4) { g.stock.add('scrap', 5); g.stock.tools.rope++; g.stock.toolKnown.add('rope'); S.toast('An old castaway camp deep inside: rope, tins, a rusted knife.', 'good'); S.log(`Deep in ${g.disc.display(poi)}, ${L.per.name} found an old castaway camp. Someone lived in there, years ago.`); }
      else if (r < 0.75) { g.stock.add('stone', 5); g.stock.add('snacks', 2); S.toast('A dry chamber full of good stone, and a stash of nuts some animal hid.', 'good'); }
      else { g.stock.herbs += 3; S.toast('Strange pale plants growing in the dark. They smell like medicine.', 'good'); }
      this.deed(`went to the bottom of ${g.disc.display(poi)}`, false);
    } });
  }

  // ------------------------------------------------------------------ the lost

  /** At dusk, someone working far out sometimes doesn't come back. Find them before the cat does. */
  private lostOnes(L: Person) {
    const g = this.g, S = g.story, h = g.clock.hour, day = g.clock.day;
    const m = this.missing;
    if (m) {
      const p = g.people[m.id];
      if (p.mode === 'dead') { this.missing = null; return; }
      p.pose = p.hurt ? 'sit' : 'idle';
      if (Math.hypot(p.x - L.x, p.z - L.z) < 7 && (p.mode === 'lost' || p.mode === 'hurt')) {
        this.missing = null;
        for (const mk of g.disc.markers.filter(mk => mk.who === p)) g.disc.removeMarker(mk);
        p.mode = 'rescued'; p.path = []; p.act = 'run';
        S.say(p, pickOf(['You came for me!', 'I thought nobody would come...', "I couldn't find the way back."]), 3.5);
        S.toast(`You found ${p.per.name}!`, 'good', p);
        S.trust(p, 15); S.trustAll(3, L); p.savedBy = L.id; S.addRel(p, L, 25);
        for (const o of g.people) if (S.rel(o, p) > 30 || o.per.pair === p.id || o.couple === p.id) S.mood(o, 'happy', 30);
        this.deed(`went out ${h > 19 || h < 5 ? 'in the dark ' : ''}and found ${p.per.name}`, true);
        g.onChime(false);
      }
      return;
    }
    if (h < 17.5 || h > 18 || this.lostCheck === day) return;
    this.lostCheck = day;
    if (g.era === 'crash' || day - this.lastLost < 5 || Math.random() > 0.3) return;
    const far = g.people.filter(p => p.mode === 'camp' && p.job && JOB[p.job as JobKind]?.outdoor && !p.kid && Math.hypot(p.x - g.fire.x, p.z - g.fire.z) > 35);
    const p = pickOf(far); if (!p) return;
    this.lastLost = day;
    this.lose(p, Math.random() < 0.5);
  }

  lose(p: Person, hurt: boolean) {
    const g = this.g, S = g.story, F = g.fire;
    g.jobs.quit(p);
    const dx = p.x - F.x, dz = p.z - F.z, l = Math.hypot(dx, dz) || 1;
    const q = g.grid.nearest(p.x + dx / l * 12 + (Math.random() - 0.5) * 8, p.z + dz / l * 12 + (Math.random() - 0.5) * 8) ?? p;
    const tracks: Pt[] = []; for (let i = 1; i <= 10; i++) tracks.push({ x: p.x + (q.x - p.x) * i / 10 + (Math.random() - 0.5), z: p.z + (q.z - p.z) * i / 10 + (Math.random() - 0.5) });
    p.x = q.x; p.z = q.z; p.path = []; p.act = ''; p.carry = 0; p.mode = hurt ? 'hurt' : 'lost'; p.hurt = hurt; p.torch = false;
    this.missing = { id: p.id, day: g.clock.day, tracks };
    const seen = tracks[0];
    g.disc.addMarker({ x: seen.x, z: seen.z, r: 8, kind: '!', text: `Last seen: ${p.per.name}`, poi: null, who: p, fake: false });
    S.toast(`${p.per.name} didn't come back from ${JOB[p.job as JobKind]?.verb ?? 'work'}.`, 'bad', p);
    S.log(`${p.per.name} didn't come back tonight. They were last seen out ${JOB[p.job as JobKind]?.verb ?? 'working'}. Their tracks lead off into the trees.`);
    for (const o of g.people) if (o.mode === 'camp' && (S.rel(o, p) > 30 || o.couple === p.id)) S.mood(o, 'worried', 200);
    g.onAlarm();
    g.hint('lost', 'Someone is missing. Go to where they were last seen and follow their tracks. The cat hunts at night.');
  }

  /** Dawn: nobody went. Some find their own way back; some don't. */
  dawn() {
    const g = this.g, S = g.story, m = this.missing; if (!m) return;
    const p = g.people[m.id]; if (p.mode !== 'lost' && p.mode !== 'hurt') { this.missing = null; return; }
    const nights = g.clock.day - m.day, r = Math.random();
    if (r < 0.55 || nights >= 2 && r < 0.8) {
      this.missing = null;
      for (const mk of g.disc.markers.filter(mk => mk.who === p)) g.disc.removeMarker(mk);
      p.mode = 'camp'; p.act = ''; p.hurt = true; p.heal = 600; g.bodies.go(p, g.fire.x + 2, g.fire.z + 2);
      S.toast(`${p.per.name} limped back into camp at dawn.`, 'info', p); S.log(`${p.per.name} found their own way back at dawn, scratched up and shaking. Nobody had come.`);
      S.trust(p, -8); S.trustAll(-1, g.leader);
    } else if (r > 0.85 && g.cat.phase === 'stalk') {
      this.missing = null;
      g.health.die(p, 'the jungle, alone at night');
      S.log(`We never saw ${p.per.name} again. ${g.cat.name || 'The cat'} was heard that night.`);
      S.trustAll(-3, g.leader);
    }
  }

  // ------------------------------------------------------------------ what people remember

  /** Something you did that people will talk about. */
  deed(text: string, big: boolean) {
    const g = this.g, S = g.story, L = g.leader!;
    this.deeds.push({ day: g.clock.day, text, told: false });
    S.log(`${L.per.name} ${text}.`);
    S.trustAll(big ? 3 : 1, L);
    if (big) { g.chatter.legend = `${L.per.name} ${text}`; g.onChime(true); }
  }

  /** Anyone with you while you do it picks it up; three times and they can do it themselves. */
  private learn(k: Taught) {
    const g = this.g, S = g.story, L = g.leader!;
    for (const p of g.party) {
      if (p.kid || Math.hypot(p.x - L.x, p.z - L.z) > 20) continue;
      const t = (this.taught[p.id] ??= {}), n = (t[k] = (t[k] ?? 0) + 1);
      if (n !== 3) continue;
      const job = k === 'climb' ? 'lookout' : k;
      p.xp[job] = (p.xp[job] ?? 0) + 15;
      const what = k === 'fish' ? 'to spear fish' : k === 'hunt' ? 'to hunt' : 'to climb';
      S.toast(`${p.per.name} learned ${what}, watching you.`, 'good', p);
      S.log(`${p.per.name} has been watching ${L.per.name}. They know how ${what} now.`);
      S.addRel(p, L, 8); S.mood(p, 'happy', 30);
    }
  }
  climber(p: Person) { return (this.taught[p.id]?.climb ?? 0) >= 3; }

  state() { return { xp: this.xp, deeds: this.deeds, trophies: this.trophies, taught: this.taught, climbed: this.spots.map(s => s.climbed), caves: [...this.caves], lastLost: this.lastLost }; }
  restore(s: ReturnType<Hands['state']>) {
    Object.assign(this.xp, s.xp); this.deeds = s.deeds ?? []; this.trophies = s.trophies ?? []; this.taught = s.taught ?? {};
    (s.climbed ?? []).forEach((c, i) => { if (this.spots[i]) this.spots[i].climbed = c; });
    this.caves = new Set(s.caves ?? []); this.lastLost = s.lastLost ?? -99;
  }
}
