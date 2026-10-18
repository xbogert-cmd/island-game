import { BABY_NAMES, makeChild } from './persona';
import { MAXP, Person } from './people';
import { JOB, JOB_KINDS, JobKind } from './jobs';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
/** Days from birth until a kid is old enough to work. */
export const GROW_UP = 25;
const BABY = 5;

/**
 * Love, babies and kids. Couples who came together, and new ones who grow close;
 * in the village a couple might have a baby, who grows up over the next weeks.
 */
export class Families {
  expecting: { a: number; b: number; due: number }[] = [];
  lastBirth = -99;
  /** kid id → parents */
  parents: Record<number, number[]> = {};
  /** pairs growing close: "a:b" → dawns in a row */
  private close: Record<string, number> = {};

  constructor(private g: Group) {
    for (const p of g.people) if (p.per.pairKind === 'couple') p.couple = p.per.pair;
  }

  ageOf(p: Person) { return p.born < 0 ? 99 : this.g.clock.day - p.born; }
  baby(p: Person) { return p.kid && this.ageOf(p) < BABY; }

  dawn() {
    this.love();
    this.babies();
    this.growUp();
  }

  // ------------------------------------------------------------------ love

  private love() {
    const g = this.g, S = g.story, free = g.people.filter(p => p.mode !== 'dead' && !p.kid && p.couple < 0 && p.per.age !== 'teen');
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j], k = `${a.id}:${b.id}`;
      if (a.couple >= 0 || b.couple >= 0 || a.per.pairKind === 'parent' && a.per.pair === b.id || a.per.pairKind === 'siblings' && a.per.pair === b.id) continue;
      if (S.rel(a, b) > 60) this.close[k] = (this.close[k] ?? 0) + 1; else delete this.close[k];
      if ((this.close[k] ?? 0) >= 3) { delete this.close[k]; this.bond(a, b); }
    }
  }

  private bond(a: Person, b: Person) {
    const g = this.g, S = g.story, C = g.camp;
    a.couple = b.id; b.couple = a.id; S.addRel(a, b, 10);
    S.toast(`${a.per.name} and ${b.per.name} are together now.`, 'good', a);
    S.log(`Everyone saw it coming: ${a.per.name} and ${b.per.name} are a couple now.`);
    S.mood(a, 'fond', 120); S.mood(b, 'fond', 120);
    // they move in together if one of their huts has room
    const ha = C.hutOf(a.id), hb = C.hutOf(b.id);
    if (ha && ha === hb) return;
    const into = ha && ha.owners.length < 2 ? [ha, b] as const : hb && hb.owners.length < 2 ? [hb, a] as const : null;
    if (into) {
      const [h, mover] = into;
      for (const o of C.list) if (o.kind === 'hut') o.owners = o.owners.filter(i => i !== mover.id);
      h.owners.push(mover.id);
      S.log(`${mover.per.name} moved into ${g.people[h.owners[0]].per.name}'s hut.`);
    }
  }

  // ------------------------------------------------------------------ babies

  private babies() {
    const g = this.g, S = g.story, day = g.clock.day, n = g.people.filter(p => p.mode !== 'dead').length;
    // births
    for (const e of [...this.expecting]) if (day >= e.due) { this.expecting = this.expecting.filter(x => x !== e); this.birth(g.people[e.a], g.people[e.b]); }
    if (g.era !== 'village' || this.expecting.length || day - this.lastBirth < 12 || g.people.length >= MAXP) return;
    if (g.stock.totalFood < n * 0.6 || g.people.some(p => p.health >= 3 && p.mode !== 'dead')) return;
    for (const a of g.people) {
      const b = a.couple >= 0 ? g.people[a.couple] : null;
      if (!b || a.id > b.id || a.mode === 'dead' || b.mode === 'dead' || a.per.age !== 'adult' || b.per.age !== 'adult') continue;
      if (!g.camp.hutOf(a.id) && !g.camp.hutOf(b.id)) continue;
      if (Math.random() > 0.08) continue;
      this.expecting.push({ a: a.id, b: b.id, due: day + 6 });
      S.toast(`${a.per.name} and ${b.per.name} are expecting a baby!`, 'good', a);
      S.log(`${a.per.name} and ${b.per.name} told everyone at breakfast: there's a baby on the way.`);
      for (const o of g.people) if (o.mode === 'camp') S.mood(o, 'happy', 40);
      return;
    }
  }

  private birth(a: Person, b: Person) {
    const g = this.g, S = g.story, day = g.clock.day;
    if (!a || !b || g.people.length >= MAXP) return;
    const per = makeChild(g.people.length, a.per, b.per, day);
    const home = g.camp.hutOf(a.id) ?? g.camp.hutOf(b.id), at = home ? { x: home.x + 0.5, z: home.z + 1 } : { x: g.fire.x + 2, z: g.fire.z + 2 };
    const p = g.addPerson(per, at.x, at.z, [a, b]);
    p.kid = true; p.born = day;
    this.parents[p.id] = [a.id, b.id];
    this.lastBirth = day;
    if (home && home.owners.length < 3) home.owners.push(p.id);
    g.eraCards.push({ title: 'A NEW LIFE', sub: `Born to ${a.per.name} and ${b.per.name}` });
    S.toast(`A baby was born to ${a.per.name} and ${b.per.name}!`, 'good', a);
    S.log(`A baby was born today, to ${a.per.name} and ${b.per.name}. The first of us who never saw the plane.`);
    for (const o of g.people) if (o.mode !== 'dead') S.mood(o, 'happy', 150);
    S.trustAll(3, g.leader); g.onChime(true);
    const used = new Set(g.people.map(o => o.per.name));
    const sugg = [...g.health.dead.map(d => d.name), ...BABY_NAMES.sort(() => Math.random() - 0.5)].filter(x => !used.has(x)).slice(0, 4);
    g.village.namings.push({ title: 'NAME THE BABY', sugg, done: name => { per.name = name.trim().slice(0, 16) || sugg[0]; S.log(`We named the baby ${per.name}.`); } });
  }

  // ------------------------------------------------------------------ kids

  private growUp() {
    const g = this.g, S = g.story;
    for (const p of g.people) {
      if (!p.kid || p.mode === 'dead' || this.ageOf(p) < GROW_UP) continue;
      p.kid = false; p.up = 0; p.per.age = 'teen';
      // good at whatever the parent who raised them does best
      const ps = (this.parents[p.id] ?? []).map(i => g.people[i]).filter(Boolean);
      let best: JobKind | null = null, bx = 0;
      for (const o of ps) for (const k of JOB_KINDS) if ((o.xp[k] ?? 0) > bx) { bx = o.xp[k]!; best = k; }
      if (best) { p.xp[best] = 8; p.love = best; }
      S.toast(`${p.per.name} is old enough to help now.`, 'good', p);
      S.log(`${p.per.name} is grown enough to pull their weight.${best ? ` They learned ${JOB[best].verb} from watching their parents.` : ''}`);
    }
  }

  /** A baby: in a parent's arms, or asleep beside them. Called from camp life. */
  carry(p: Person) {
    const g = this.g, ps = (this.parents[p.id] ?? []).map(i => g.people[i]).filter(o => o && o.mode !== 'dead');
    const par = ps.find(o => o.mode === 'camp' || o.mode === 'leader');
    const sleeping = !par || par.pose === 'sleep';
    if (!par) { const b = g.bed(p); p.x = b.x; p.z = b.z; p.up = 0; p.pose = 'sleep'; return; }
    p.x = par.x + par.face * 0.45; p.z = par.z + 0.05; p.face = par.face;
    p.up = sleeping ? 0 : 1.0; p.pose = sleeping ? 'sleep' : 'idle'; p.moving = par.moving;
  }

  /** A kid tagging along after a parent at work. */
  tag(p: Person, dt: number) {
    const g = this.g, o = p.partner;
    if (!o || o.mode !== 'camp' || (p.actT -= dt) <= 0) { p.act = ''; p.partner = null; p.actT = 3 + Math.random() * 4; return; }
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d > 2.2) { if (!p.path.length || (p.repath -= dt) <= 0) { p.repath = 1.5; g.bodies.go(p, o.x + 1, o.z + 0.6); } g.bodies.advance(p, g.bodies.speed(p) * 1.1, dt); p.pose = d > 6 ? 'run' : 'walk'; return; }
    p.path = []; p.pose = o.pose === 'collect' || o.pose === 'build' || o.pose === 'search' ? 'collect' : 'idle'; g.bodies.faceToward(p, o.x, o.z);
    if (Math.random() < dt * 0.04) g.story.say(p, pickOf(['Can I help?', 'Look what I found!', 'Why?', "I'm helping!", 'Watch this!']), 2);
  }

  /** A parent the kid could follow around right now. */
  parentFor(p: Person) {
    const g = this.g;
    return (this.parents[p.id] ?? []).map(i => g.people[i]).find(o => o && o.mode === 'camp' && !o.hurt) ?? null;
  }
}
