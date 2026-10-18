import { B, N, heightAt } from '../world/island';
import { G, WalkGrid } from './path';
import { Person, Pt } from './people';
import type { Building } from './buildings';
import type { Group } from './group';

const M = N / G;
const SEATS = 3;
const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

/**
 * The canoe. Click the sea and you walk to it, your crew climbs in, and you paddle there along the water.
 * Click land while paddling and you come ashore on the nearest beach. Islets and the reef hold things
 * you can only get to this way.
 */
export class Canoe {
  /** paddling: who's aboard and where to */
  trip: { phase: 'board' | 'paddle'; riders: Person[]; path: Pt[]; land: Pt | null; dest: Pt } | null = null;
  heading = 0;
  private water: WalkGrid | null = null;
  private main: Uint8Array;
  private lootT = 0;

  constructor(private g: Group) {
    // islets: land you can't walk to from camp
    this.main = g.grid.reach(g.fire.x, g.fire.z);
    const seen = new Uint8Array(M * M), loot = ['eggs', 'crate', 'castaway', 'eggs'];
    let k = 0;
    for (let c = 0; c < M * M; c++) {
      if (seen[c] || !g.grid.ok[c] || this.main[c]) continue;
      const q = [c], cells: number[] = []; seen[c] = 1;
      while (q.length) {
        const x = q.pop()!; cells.push(x);
        const xi = x % M, xj = (x / M) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = xi + di, nj = xj + dj; if (ni < 0 || nj < 0 || ni >= M || nj >= M) continue;
          const n = nj * M + ni; if (!seen[n] && g.grid.ok[n] && !this.main[n]) { seen[n] = 1; q.push(n); }
        }
      }
      if (cells.length < 18) continue;
      const cx = cells.reduce((s, x) => s + (x % M), 0) / cells.length * G + 1, cz = cells.reduce((s, x) => s + ((x / M) | 0), 0) / cells.length * G + 1;
      const at = g.grid.nearest(cx, cz) ?? { x: cx, z: cz };
      if (Math.hypot(at.x - g.fire.x, at.z - g.fire.z) < 60) continue;
      g.disc.addPoi('islet', at.x, at.z, 34, true, { loot: loot[k++ % loot.length] });
    }
    // giant clams on the reef, out past the beach
    const w = g.w, F = g.fire; let best: Pt | null = null, bd = 1e9;
    for (let z = 4; z < N - 4; z += 3) for (let x = 4; x < N - 4; x += 3) {
      if (w.biome[(z | 0) * N + (x | 0)] !== B.Reef) continue;
      const d = Math.hypot(x - F.x, z - F.z); if (d > 50 && d < bd) { bd = d; best = { x, z }; }
    }
    if (best) g.disc.addPoi('reef', best.x, best.z, 16, true, { loot: 'clams' });
  }

  get boat(): Building | null { return this.g.camp.get('canoe'); }
  riding(p: Person) { return !!this.trip && this.trip.phase === 'paddle' && this.trip.riders.includes(p); }
  private grid() { return (this.water ??= new WalkGrid(this.g.w, true)); }
  /** Can you walk from where you stand to there? */
  private onFoot(x: number, z: number) {
    const g = this.g, L = g.leader!, q = g.grid.nearest(x, z, 3); if (!q) return false;
    return !!g.grid.reach(L.x, L.z)[g.grid.cell(q.x, q.z)];
  }

  /** A click on the ground. Returns true if it's a canoe trip (the click is handled). */
  click(x: number, z: number): boolean {
    const g = this.g, L = g.leader!, b = this.boat;
    if (!b) return false;
    const sea = heightAt(g.w, x, z) < 0.15 && !g.grid.walkable(x, z);
    if (this.trip?.phase === 'paddle') { this.route(x, z, !sea); return true; }
    // already ashore: only the sea, or land you can't walk to, means the canoe
    if (!sea && this.onFoot(x, z)) { this.trip = null; return false; }
    if (!sea && !this.g.grid.nearest(x, z, 12)) return false;
    const party = g.party.filter(p => Math.hypot(p.x - L.x, p.z - L.z) < 25 && !p.kid);
    this.trip = { phase: 'board', riders: [L, ...party.slice(0, SEATS)], path: [], land: null, dest: { x, z } };
    g.bodies.go(L, b.x, b.z);
    g.hint('canoe', 'Click the sea to paddle somewhere. Click land to come ashore there.');
    return true;
  }

  /** Plot a course on the water; if it's to land, come ashore at the end. */
  private route(x: number, z: number, land: boolean) {
    const t = this.trip!, b = this.boat!, W = this.grid();
    const end = land ? this.landing(x, z) : W.nearest(x, z, 30);
    if (!end) return;
    t.path = W.find(b.x, b.z, end.x, end.z, 200000);
    t.land = land ? this.g.grid.nearest(x, z, 12) : null;
    t.dest = end;
  }
  /** The water cell nearest to a piece of land, to paddle up to. */
  private landing(x: number, z: number): Pt | null {
    const W = this.grid(), L = this.g.grid.nearest(x, z, 12); if (!L) return W.nearest(x, z, 30);
    return W.nearest(L.x, L.z, 12);
  }

  update(dt: number) {
    const g = this.g, t = this.trip, L = g.leader, b = this.boat;
    if (L && (this.lootT -= dt) <= 0) { this.lootT = 0.5; this.loot(); }
    if (!t || !L || !b) { if (t && !b) this.trip = null; return; }
    if (t.phase === 'board') {
      if (L.path.length && Math.hypot(L.x - b.x, L.z - b.z) > 2.5) return;
      if (Math.hypot(L.x - b.x, L.z - b.z) > 3.5) { this.trip = null; return; }
      // in we get; whoever doesn't fit waits on the beach
      t.phase = 'paddle'; t.riders = t.riders.filter(p => p === L || Math.hypot(p.x - L.x, p.z - L.z) < 30);
      for (const p of g.party) if (!t.riders.includes(p)) { p.mode = 'wait'; p.path = []; p.act = ''; }
      for (const p of t.riders) { p.path = []; p.act = ''; }
      const W = this.grid(), from = W.nearest(b.x, b.z, 8); if (from) { b.x = from.x; b.z = from.z; }
      this.route(t.dest.x, t.dest.z, !(heightAt(g.w, t.dest.x, t.dest.z) < 0.15 && !g.grid.walkable(t.dest.x, t.dest.z)));
      if (t.riders.length > 1) g.story.say(pickOf(t.riders.slice(1)), pickOf(['Everyone in!', "Don't tip it.", 'Paddle together!']), 2);
      return;
    }
    // paddling
    const sp = 4.2 + t.riders.length * 0.6;
    let move = sp * dt;
    while (move > 0 && t.path.length) {
      const q = t.path[0], dx = q.x - b.x, dz = q.z - b.z, d = Math.hypot(dx, dz);
      if (d <= move) { b.x = q.x; b.z = q.z; t.path.shift(); move -= d; } else { b.x += dx / d * move; b.z += dz / d * move; this.heading = Math.atan2(dx, dz); move = 0; }
    }
    b.rot = this.heading;
    t.riders.forEach((p, i) => {
      const off = (i - (t.riders.length - 1) / 2) * 0.9;
      p.x = b.x + Math.sin(this.heading) * off; p.z = b.z + Math.cos(this.heading) * off; p.up = 0.15 - heightAt(g.w, p.x, p.z) + Math.max(0, heightAt(g.w, p.x, p.z));
      p.pose = 'sit'; p.moving = true; p.torch = g.clock.night > 0.5;
    });
    if (!t.path.length && t.land) this.ashore(t.land);
  }

  /** Step out onto the beach; the canoe stays where it's pulled up. */
  private ashore(at: Pt) {
    const g = this.g, t = this.trip!;
    t.riders.forEach((p, i) => { const q = g.grid.nearest(at.x + (i % 2 ? 1 : -1) * (i * 0.6), at.z + i * 0.4, 6) ?? at; p.x = q.x; p.z = q.z; p.up = 0; p.path = []; p.pose = 'idle'; });
    this.trip = null;
    if (t.riders.length > 1) g.story.say(t.riders[1], pickOf(['Land!', 'Solid ground.', 'Where are we?']), 2);
  }

  /** Islets and the reef: what they hold comes back with you, once. */
  private loot() {
    const g = this.g, L = g.leader!, S = g.story;
    for (const q of g.disc.pois) {
      if (!q.loot || Math.hypot(q.x - L.x, q.z - L.z) > (q.kind === 'reef' ? 8 : 10)) continue;
      const what = q.loot; q.loot = '';
      if (what === 'eggs') { g.stock.add('shell', 8); S.toast('Seabird eggs, hundreds of them. We filled the canoe.', 'good'); S.log('The islet is covered in nesting seabirds. We brought back eggs.'); }
      if (what === 'clams') { g.stock.add('shell', 10); S.toast('Giant clams on the reef! Food for days.', 'good'); S.log('We pried giant clams off the reef. Some were as big as a hubcap.'); }
      if (what === 'crate') { g.stock.add('scrap', 8); g.stock.tools.knife++; g.stock.tools.rope++; S.toast('A sealed cargo crate washed up here: scrap, a knife, rope.', 'good'); S.log("A crate from the plane's cargo had washed up on the islet. Still sealed."); }
      if (what === 'castaway') { g.stock.tools.axe++; g.stock.toolKnown.add('axe'); S.toast('Someone lived here once. A rusty axe, and a logbook.', 'good'); S.log('An old camp on the islet. A tin box with a logbook inside. The last page reads: "Day 300. No ship. Still here." We took the axe.'); }
      g.onSting(true);
    }
  }
}
