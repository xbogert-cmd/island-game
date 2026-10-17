import { describe, expect, it } from 'vitest';
import { makePeople } from './persona';
import { WalkGrid } from './path';
import { B, N, World, generate } from '../world/island';
import { rumorError } from './scouting';
import { Stock } from './stock';
import { Jobs, level } from './jobs';
import { BUILD, BKind, stageCost } from './buildings';
import type { Person } from './people';
import { Health } from './health';

function flatWorld(): World {
  const h = new Float32Array(N * N).fill(2), biome = new Uint8Array(N * N).fill(B.Grass);
  // a cliff wall at x=300 with a gap at z 400..410; a lake at x 100..140
  for (let z = 0; z < N; z++) {
    for (let x = 300; x < 304; x++) if (z < 400 || z > 410) h[z * N + x] = 30;
    for (let x = 100; x < 140; x++) if (z > 200 && z < 600) { h[z * N + x] = -2; biome[z * N + x] = B.Ocean; }
  }
  return { seed: 1, h, biome, moist: new Float32Array(N * N), clear: new Uint8Array(N * N), riverDist: new Float32Array(N * N).fill(99), rivers: [], landmarks: [],
    volcano: { x: 0, z: 0, r: 1 }, lake: { x: 0, z: 0, level: 0 }, crash: { x: 0, z: 0, rot: 0 }, islandCenter: { x: 384, z: 384 } };
}

describe('people', () => {
  it('are the same for the same seed', () => {
    expect(makePeople(42)).toEqual(makePeople(42));
    expect(makePeople(42).people.map(p => p.name)).not.toEqual(makePeople(43).people.map(p => p.name));
  });
  it('has 12-16 people, pairs are mutual, relationships symmetric', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const { people, rel } = makePeople(s), n = people.length;
      expect(n).toBeGreaterThanOrEqual(12); expect(n).toBeLessThanOrEqual(16);
      for (const p of people) if (p.pair >= 0) expect(people[p.pair].pair).toBe(p.id);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) expect(rel[a * n + b]).toBe(rel[b * n + a]);
    }
  });
});

describe('pathfinding', () => {
  it('goes through the gap in a cliff and never into water', () => {
    const w = flatWorld(), g = new WalkGrid(w);
    const p = g.find(250, 300, 360, 300);
    const last = p[p.length - 1];
    expect(Math.hypot(last.x - 360, last.z - 300)).toBeLessThan(1);
    expect(p.some(q => q.z > 395 && q.z < 415 && q.x > 290 && q.x < 312)).toBe(true);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      for (let t = 0; t <= 1; t += 0.05) expect(g.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)).toBe(true);
    }
    // the lake is crossed by going around it
    const q = g.find(80, 400, 160, 400);
    for (const s of q) expect(s.x < 100 || s.x >= 140 || s.z < 200 || s.z > 600).toBe(true);
  });
  it('walks from the crash to a far landmark on a real island', () => {
    const w = generate(7), g = new WalkGrid(w);
    const tail = w.landmarks.find(l => l.kind === 'tail')!;
    const p = g.find(w.crash.x + 10, w.crash.z, tail.x, tail.z);
    const last = p[p.length - 1];
    expect(Math.hypot(last.x - tail.x, last.z - tail.z)).toBeLessThan(12);
    for (const s of p) expect(g.walkable(s.x, s.z)).toBe(true);
  });
});

describe('rumors', () => {
  it('are accurate from brave and honest scouts, vague from cowards', () => {
    const { people } = makePeople(9);
    const p = people[0];
    p.traits = ['brave', 'honest']; p.skill = 'none';
    const brave = rumorError(p);
    p.traits = ['cowardly']; const coward = rumorError(p);
    p.skill = 'navigator'; const nav = rumorError(p);
    expect(brave.r).toBeLessThan(coward.r);
    expect(nav.off).toBe(0);
    expect(coward.off).toBeGreaterThan(brave.off);
  });
});

describe('stockpile', () => {
  const grid = { walkable: () => true } as unknown as WalkGrid;
  it('never goes negative and reports who went hungry', () => {
    const s = new Stock({ x: 100, z: 100 }, grid);
    expect(s.meal(10)).toBe(0);                      // 16 snacks, 16 water
    expect(s.meal(10)).toBe(4);                      // 6 left of each
    expect(s.totalFood).toBe(0); expect(s.water).toBe(0);
    expect(s.meal(5)).toBe(5);
    expect(s.takeFood(3)).toBe(0); expect(s.totalFood).toBe(0);
  });
  it('half rations stretch food twice as far', () => {
    const s = new Stock({ x: 100, z: 100 }, grid);
    s.ration = 2;
    expect(s.meal(20)).toBe(0); expect(s.totalFood).toBe(6);
  });
  it('counts what came in today', () => {
    const s = new Stock({ x: 100, z: 100 }, grid);
    s.add('fruit', 2); s.add('water', 3); s.add('fish', 4);
    expect(s.today).toEqual({ food: 6, water: 3 });
  });
});

describe('jobs', () => {
  const mk = (id: number, extra: Partial<Person> = {}) => ({ id, per: { traits: [], skill: 'none', strength: 'strong', weakness: 'clumsy' }, xp: {}, job: '', love: '', hate: '', ...extra }) as unknown as Person;
  it('puts friends together before rivals', () => {
    const a = mk(0), friend = mk(1), rival = mk(2);
    const rel = (x: Person, y: Person) => { const k = [x.id, y.id].sort().join(); return k === '0,1' ? 60 : k === '0,2' ? -60 : 0; };
    const J = Object.create(Jobs.prototype) as Jobs;
    (J as unknown as { g: unknown }).g = { story: { rel } };
    const score = (p: Person, crew: Person[]) => (J as unknown as { score: (p: Person, k: string, c: Person[]) => number }).score(p, 'wood', crew);
    expect(score(friend, [a])).toBeGreaterThan(score(rival, [a]));
  });
  it('priority cycles NORMAL → HIGH → LOW → NORMAL', () => {
    const J = Object.create(Jobs.prototype) as Jobs;
    J.prio = { wood: 1 } as Jobs['prio'];
    J.cyclePrio('wood'); expect(J.prio.wood).toBe(2);
    J.cyclePrio('wood'); expect(J.prio.wood).toBe(0);
    J.cyclePrio('wood'); expect(J.prio.wood).toBe(1);
  });
  it('experience words go Novice → Expert', () => {
    expect([0, 6, 18, 40].map(level)).toEqual([0, 1, 2, 3]);
  });
  it('buildings are paid for in three stages that cover the full cost', () => {
    for (const k of Object.keys(BUILD) as BKind[]) {
      const st = stageCost(k), c = BUILD[k].cost;
      for (const m of Object.keys(c) as (keyof typeof c)[]) expect(st[m]! * 3).toBeGreaterThanOrEqual(c[m]!);
    }
  });
});

describe('health', () => {
  it('never skips the warning stages: one step per dawn, death only from very sick', () => {
    const noop = () => {};
    const p = { id: 0, per: { name: 'Test', skill: 'none', traits: [] }, mode: 'camp', health: 0, hungerN: 0, hungry: true, hurt: false, x: 0, z: 0 } as unknown as Person;
    const g = { people: [p], camp: { has: () => false, get: () => null }, stats: { spoiled: 0 }, goals: { active: () => false },
      story: { toast: noop, log: noop, say: noop, mood: noop, trustAll: noop, rel: () => 0 }, onAlarm: noop, hint: noop, onSting: noop };
    const H = new Health(g as unknown as ConstructorParameters<typeof Health>[0]);
    const seen: number[] = [];
    let diedAt = -1;
    H.die = (q: Person) => { diedAt = q.health; q.mode = 'dead'; };
    for (let d = 0; d < 40 && p.mode !== 'dead'; d++) { const before = p.health; H.dawn(); seen.push(p.health); expect(p.health - before).toBeLessThanOrEqual(1); }
    expect(seen).toContain(1); expect(seen).toContain(2); expect(seen).toContain(3);
    if (diedAt >= 0) expect(diedAt).toBe(3);
  });
});
