import { heightAt } from '../world/island';
import { Pt } from './people';
import { Mat, MATS } from './stock';
import type { Group } from './group';

export type BKind = 'hut' | 'storage' | 'workbench' | 'sickbay' | 'cooking' | 'fishTrap' | 'fence' | 'watchFire'
  | 'dryingRack' | 'rainCatcher' | 'signalFire' | 'beacon' | 'sos' | 'lookout' | 'bath' | 'snares' | 'smokeRack' | 'hideRack' | 'grave';

interface Def { label: string; cost: Partial<Record<Mat, number>>; work: number; desc: string; flat?: boolean; needs?: BKind; many?: boolean }

/** Everything the camp can put up in the Camp era. Cost is paid in three stages (stakes, frame, walls/roof). */
export const BUILD: Record<BKind, Def> = {
  // huts and storage can be made from what's at hand (wood, plane panels and tarps); the rest needs exploring
  hut: { label: 'a hut', cost: { wood: 8, scrap: 3 }, work: 80, desc: 'Sleeps two. Dry when it rains.', many: true },
  storage: { label: 'a storage hut', cost: { wood: 9, scrap: 3 }, work: 90, desc: 'Food spoils half as fast.' },
  workbench: { label: 'a workbench', cost: { wood: 4, stone: 2, scrap: 2 }, work: 50, desc: 'Where tools get made and things get fixed.' },
  sickbay: { label: 'a sick bay', cost: { bamboo: 4, vines: 2, scrap: 2 }, work: 60, desc: 'The hurt and sick heal twice as fast.' },
  cooking: { label: 'a cooking spot', cost: { stone: 6, scrap: 1 }, work: 45, desc: 'Meals cheer everyone up. A cook stretches food.' },
  fishTrap: { label: 'a fish trap', cost: { bamboo: 3, vines: 3 }, work: 40, desc: 'Catches fish by itself every day.' },
  fence: { label: 'a fence', cost: { bamboo: 12, vines: 4 }, work: 140, desc: 'Keeps animals out of camp.' },
  watchFire: { label: 'a watch fire', cost: { wood: 5, stone: 3 }, work: 40, desc: 'Someone keeps watch here at night.' },
  dryingRack: { label: 'a fish drying rack', cost: { wood: 3, vines: 1 }, work: 30, desc: 'Fish keeps instead of rotting.' },
  rainCatcher: { label: 'a rain catcher', cost: { bamboo: 2, scrap: 2 }, work: 30, desc: 'Free water whenever it rains.' },
  signalFire: { label: 'a signal fire', cost: { wood: 6 }, work: 45, desc: 'Burns every night. Ships might see it.' },
  beacon: { label: 'a beacon', cost: { wood: 10, stone: 4 }, work: 90, desc: 'A towering beacon fire, seen for miles.', needs: 'signalFire' },
  sos: { label: 'SOS on the beach', cost: { stone: 6 }, work: 40, desc: 'Big enough for a plane to see.', flat: true },
  lookout: { label: 'a lookout flag', cost: { wood: 1 }, work: 20, desc: 'Marks the high ground.' },
  bath: { label: 'a bathing spot', cost: { stone: 4 }, work: 35, desc: 'Somewhere to wash. Lifts moods, keeps sickness down.', flat: true },
  snares: { label: 'snares', cost: { bamboo: 2, vines: 3 }, work: 30, desc: 'Small traps in the jungle. Someone checks them for game.' },
  smokeRack: { label: 'a smoke rack', cost: { wood: 4, vines: 2 }, work: 35, desc: 'Smoked meat keeps for days.' },
  hideRack: { label: 'a hide rack', cost: { wood: 3, vines: 2 }, work: 30, desc: 'Cures hides into bedding. Hut owners sleep better.' },
  grave: { label: 'a grave', cost: {}, work: 1, desc: 'We remember them.', many: true },
};

export interface Building {
  id: number; kind: BKind; x: number; z: number;
  progress: number;          // 0..1
  paid: number;              // stages paid for (0..3)
  owners: number[];          // huts
  shaky: boolean;            // built without anyone who knew how
  doubt?: boolean;           // a bad idea: comes out shaky unless someone skilled builds it
  skilled: boolean;          // someone skilled worked on it
  posts?: Pt[];              // fence
}

const STAGES = 3;
export const stageCost = (k: BKind) => { const c = BUILD[k].cost, o: Partial<Record<Mat, number>> = {}; for (const m of MATS) if (c[m]) o[m] = Math.ceil(c[m]! / STAGES); return o; };

/** The camp's buildings, the build queue, and where things go. */
export class Camp {
  list: Building[] = [];
  queue: Building[] = [];
  private nid = 0;

  constructor(private g: Group) {}

  has(k: BKind) { return this.list.some(b => b.kind === k && b.progress >= 1); }
  count(k: BKind) { return this.list.filter(b => b.kind === k && b.progress >= 1).length; }
  planned(k: BKind) { return this.queue.some(b => b.kind === k); }
  get(k: BKind) { return this.list.find(b => b.kind === k && b.progress >= 1) ?? null; }

  /** Queue something to build. The camp picks the spot. */
  add(kind: BKind, front = false) {
    if (!BUILD[kind].many && (this.has(kind) || this.planned(kind))) return null;
    const s = this.site(kind); if (!s) return null;
    const b: Building = { id: this.nid++, kind, x: s.x, z: s.z, progress: 0, paid: 0, owners: [], shaky: false, skilled: false };
    if (kind === 'fence') b.posts = this.fencePosts();
    this.list.push(b);
    if (front) this.queue.unshift(b); else this.queue.push(b);
    return b;
  }
  /** Built on the spot (2b ideas worked out by one person). */
  place(kind: BKind, quiet = false) {
    if (this.has(kind)) return null;
    const q = this.queue.find(b => b.kind === kind);
    const b = q ?? this.add(kind); if (!b) return null;
    b.progress = 1; b.paid = STAGES; b.skilled = true; this.queue = this.queue.filter(x => x !== b);
    this.finish(b, quiet);
    return b;
  }
  toFront(b: Building) { this.queue = [b, ...this.queue.filter(x => x !== b)]; }

  /** What the builders should work on: the first thing in the queue that isn't stuck. */
  target(): Building | null {
    for (const b of this.queue) if (b.paid > Math.floor(b.progress * STAGES) || this.canPay(b)) return b;
    return null;
  }
  canPay(b: Building) { const c = stageCost(b.kind); return MATS.every(m => (c[m] ?? 0) <= this.g.stock.mat[m]); }
  /** The material holding a build up, if any. */
  waitingFor(b: Building): Mat | null {
    if (b.paid > Math.floor(b.progress * STAGES)) return null;
    const c = stageCost(b.kind); return MATS.find(m => (c[m] ?? 0) > this.g.stock.mat[m]) ?? null;
  }
  /** Materials the next two builds still need, minus what's already in the heaps. */
  need(): Record<Mat, number> {
    const o: Record<Mat, number> = { wood: 0, bamboo: 0, stone: 0, vines: 0, scrap: 0 };
    for (const b of this.queue.slice(0, 2)) { const c = stageCost(b.kind); for (const m of MATS) o[m] += (c[m] ?? 0) * (STAGES - b.paid); }
    for (const m of MATS) o[m] = Math.max(0, o[m] - this.g.stock.mat[m]);
    return o;
  }

  /** Builders put in `amount` seconds of work. Returns false when stuck waiting for materials. */
  work(b: Building, amount: number, skilled: boolean) {
    const stage = Math.min(STAGES - 1, Math.floor(b.progress * STAGES));
    if (b.paid <= stage) { if (!this.g.stock.pay(stageCost(b.kind))) return false; b.paid++; }
    if (skilled) b.skilled = true;
    b.progress = Math.min(1, b.progress + amount / BUILD[b.kind].work);
    if (b.progress >= 1) { this.queue = this.queue.filter(x => x !== b); this.finish(b); }
    return true;
  }

  private finish(b: Building, quiet = false) {
    const g = this.g, S = g.story;
    b.shaky = !b.skilled && (b.doubt || Math.random() < 0.35) && b.kind !== 'sos' && b.kind !== 'bath';
    if (b.kind === 'hut') this.ownHut(b);
    // nobody wants to sleep in the sand: while people are without a roof, the next hut gets started by itself
    if (b.kind === 'hut' && !this.planned('hut') && g.people.filter(p => p.mode !== 'dead' && !this.hutOf(p.id)).length > 2 && this.add('hut')) g.story.log('Another hut, then. Nobody wants to sleep in the sand.');
    for (let i = 0; i < 12; i++) g.fx.emit('puff', b.x + (Math.random() - 0.5) * 3, g.bodies.ground(b) + 0.3, b.z + (Math.random() - 0.5) * 3, { vy: 1 + Math.random(), max: 1.2, r: 0.85, g: 0.8, b: 0.7, a: 0.7 });
    g.stats.built.push(BUILD[b.kind].label);
    if (quiet) { g.onChime(false); return; }
    const owners = b.owners.map(i => g.people[i].per.name).join(' and ');
    S.toast(b.kind === 'hut' && owners ? `A new hut is up. ${owners} move in.` : `${cap(BUILD[b.kind].label)} is finished!`, 'good');
    S.log(`We finished ${BUILD[b.kind].label}${owners ? ` (${owners}'s)` : ''}.${b.shaky ? ' Nobody really knew what they were doing. It creaks.' : ''}`);
    for (const p of g.people) if (p.mode === 'camp' && Math.hypot(p.x - b.x, p.z - b.z) < 20 && Math.random() < 0.5) { p.poseO = 'cheer'; p.poseT = 1.4; }
    g.onSting(true);
  }

  /** Huts go to pairs and family first, then friends, never rivals. Two to a hut. */
  private ownHut(b: Building) {
    const g = this.g, S = g.story, L = g.leader;
    const housed = new Set(this.list.flatMap(h => h.owners));
    const free = g.people.filter(p => !housed.has(p.id) && p.mode !== 'dead');
    if (L && !housed.has(L.id) && this.count('hut') === 1) { b.owners = [L.id]; }
    else {
      const a = free.find(p => p.per.pair >= 0 && !housed.has(p.per.pair)) ?? free.sort((x, y) => (y.hurt ? 1 : 0) - (x.hurt ? 1 : 0))[0];
      if (!a) return;
      b.owners = [a.id];
    }
    const a = g.people[b.owners[0]];
    const mate = a.per.pair >= 0 && !housed.has(a.per.pair) ? g.people[a.per.pair]
      : free.filter(p => p !== a && !b.owners.includes(p.id) && S.rel(a, p) > 0).sort((x, y) => S.rel(a, y) - S.rel(a, x))[0];
    if (mate && mate !== a) b.owners.push(mate.id);
  }

  /** What the camp could use next, with the reason someone would give and the skill that cares most. */
  wanted(): [BKind, string, string][] {
    const g = this.g, w: [BKind, string, string][] = [];
    if (g.era === 'crash') return w;
    const homeless = g.people.filter(p => p.mode !== 'dead' && !this.hutOf(p.id)).length - 2 * this.queue.filter(b => b.kind === 'hut').length;
    if (homeless > 2) w.push(['hut', "We need roofs. Let's get a hut up.", 'builder']);
    if (!this.has('storage') && g.stats.spoiled > 2) w.push(['storage', 'The food is rotting. We need a storage hut.', 'cook']);
    if (!this.has('cooking')) w.push(['cooking', 'A proper cooking spot. Hot meals, finally.', 'cook']);
    if (!this.has('workbench')) w.push(['workbench', 'A workbench. Then we can start making tools.', 'mechanic']);
    if (!this.has('sickbay') && (g.people.some(p => p.hurt) || g.story.skillKnown.has(g.people.find(p => p.per.skill === 'medic')?.id ?? -1))) w.push(['sickbay', 'Somewhere for the hurt to rest and heal.', 'medic']);
    if (!this.has('fence')) w.push(['fence', 'Something moves around camp at night. A fence.', 'builder']);
    if (!this.has('watchFire')) w.push(['watchFire', 'A watch fire. Someone should keep an eye out at night.', 'builder']);
    if (!this.has('fishTrap') && this.has('dryingRack')) w.push(['fishTrap', 'A fish trap would catch fish while we sleep.', 'fisher']);
    if (this.has('signalFire') && !this.has('beacon')) w.push(['beacon', 'Make the signal fire a real beacon. Taller.', 'builder']);
    if (!this.has('bath') && g.disc.nearestKnown('water', g.fire)) w.push(['bath', 'A spot to wash. We all smell like the wreck.', 'builder']);
    const vines = g.disc.pois.some(q => q.known && q.kind === 'material' && q.mat === 'vines');
    if (!this.has('snares') && vines) w.push(['snares', 'Snares in the jungle. Meat without chasing it.', 'none']);
    if (!this.has('smokeRack') && (g.stock.tools.spear > 0 || g.stock.food.meat > 0)) w.push(['smokeRack', "Meat rots in a day. A smoke rack would keep it.", 'cook']);
    if (!this.has('hideRack') && g.stock.hides > 0) w.push(['hideRack', 'We have hides. Stretch them on a rack and we can sleep on them.', 'none']);
    return w.filter(x => !this.planned(x[0]) || x[0] === 'hut');
  }

  hutOf(id: number) { return this.list.find(b => b.kind === 'hut' && b.progress >= 1 && b.owners.includes(id)) ?? null; }

  /** Heavy weather knocks shaky things down. */
  storm(dt: number, rain: number, wind: number) {
    if (rain < 0.75 && wind < 0.8) return;
    for (const b of this.list) if (b.shaky && b.progress >= 1 && Math.random() < dt * 0.0015) {
      b.progress = 0.4; b.paid = 1; b.shaky = false; b.skilled = false; b.owners = b.kind === 'hut' ? b.owners : [];
      this.queue.unshift(b);
      this.g.story.toast(`${cap(BUILD[b.kind].label)} came down in the storm!`, 'bad');
      this.g.story.log(`The storm brought down ${BUILD[b.kind].label}. It was never built right.`);
      this.g.onSting(false);
    }
  }

  // ------------------------------------------------------------------ where things go

  private clear(x: number, z: number, r: number) {
    const g = this.g, F = g.fire;
    if (!g.grid.walkable(x, z)) return false;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!g.grid.walkable(x + dx, z + dz)) return false;
    if (Math.abs(heightAt(g.w, x + r, z) - heightAt(g.w, x - r, z)) > 2.2 || Math.abs(heightAt(g.w, x, z + r) - heightAt(g.w, x, z - r)) > 2.2) return false;
    const avoid: [number, number, number][] = [[F.x, F.z, 5], [F.x - 5, F.z - 4, 3], [F.x + 4.5, F.z - 5, 3], [g.stock.pile.x, g.stock.pile.z, 4.5], [g.w.crash.x, g.w.crash.z, 9]];
    for (const [ax, az, ar] of avoid) if (Math.hypot(x - ax, z - az) < ar + r) return false;
    for (const b of this.list) if (b.kind !== 'fence' && Math.hypot(x - b.x, z - b.z) < r + 2.6) return false;
    return true;
  }
  /** First clear spot on rings around (cx,cz), starting from angle a0. */
  private ring(cx: number, cz: number, rmin: number, rmax: number, size: number, a0 = 0): Pt | null {
    for (let r = rmin; r <= rmax; r += 1) for (let k = 0; k < 24; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (6.283 / 24), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.clear(x, z, size)) return { x, z };
    }
    return null;
  }
  /** Angle from the fire toward the sea (the gate side) — inland is the opposite. */
  private seaAngle() { const g = this.g; return Math.atan2(g.fishSpot.z - g.fire.z, g.fishSpot.x - g.fire.x); }

  site(kind: BKind): Pt | null {
    const g = this.g, F = g.fire, P = g.stock.pile, sea = this.seaAngle(), land = sea + Math.PI;
    switch (kind) {
      case 'hut': return this.ring(F.x, F.z, 9, 14, 1.6, land + this.count('hut') * 0.9);
      case 'storage': return this.ring(P.x, P.z, 4, 9, 1.8, Math.atan2(P.z - F.z, P.x - F.x));
      case 'workbench': return this.ring(F.x, F.z, 10, 15, 1.4, land + 1.3);
      case 'sickbay': return this.ring(F.x, F.z, 10, 15, 1.6, land - 1.3);
      case 'cooking': return this.ring(F.x, F.z, 6, 10, 0.8, sea + 0.8);
      case 'dryingRack': return this.ring(P.x, P.z, 3, 7, 1.0, sea);
      case 'rainCatcher': return this.ring(F.x, F.z, 6, 11, 1.0, land - 2.4);
      case 'watchFire': return this.ring(F.x, F.z, 15, 18, 0.8, land);
      case 'fence': return { x: F.x, z: F.z };
      case 'fishTrap': return g.shore(16, [g.fishSpot]);
      case 'signalFire': return g.shore(18, [g.fishSpot]);
      case 'beacon': { const s = this.get('signalFire'); return s ? { x: s.x, z: s.z } : g.shore(18, [g.fishSpot]); }
      case 'sos': return g.shore(22, [g.fishSpot, this.get('signalFire') ?? g.fishSpot]);
      case 'snares': { const j = g.disc.pois.filter(q => q.known && q.kind === 'material' && q.mat === 'vines')[0]; return j ? (g.grid.nearest(j.x + 4, j.z - 3) ?? j) : this.ring(F.x, F.z, 24, 34, 1.0, land); }
      case 'smokeRack': case 'hideRack': return this.ring(P.x, P.z, 4, 9, 1.0, land);
      case 'grave': return this.ring(F.x, F.z, 21, 27, 0.8, land + 2.2 + this.count('grave') * 0.25);
      case 'bath': { const wtr = g.disc.nearestKnown('water', F); return wtr && Math.hypot(wtr.x - F.x, wtr.z - F.z) < 90 ? (g.grid.nearest(wtr.x + 2, wtr.z + 2) ?? wtr) : this.ring(F.x, F.z, 12, 20, 1.2, land); }
      case 'lookout': return g.requests.spot('lookout');
    }
  }

  /** Fence posts on a ring round camp, with a gate toward the sea. */
  private fencePosts(): Pt[] {
    const g = this.g, F = g.fire, sea = this.seaAngle(), out: Pt[] = [], R = 18.5;
    for (let a = 0; a < 6.283; a += 1.2 / R) {
      let d = Math.abs(((a - sea) % 6.283 + 6.283) % 6.283); d = Math.min(d, 6.283 - d);
      if (d < 0.22) continue;                                 // the gate
      const x = F.x + Math.cos(a) * R, z = F.z + Math.sin(a) * R;
      if (g.grid.walkable(x, z)) out.push({ x, z });
    }
    return out;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
