import { B, N, World, heightAt } from '../world/island';

/** Walk grid: one cell = G world units. A cell is walkable if it is dry land, not lake/spring water and not inside a prop. */
export const G = 2;
const M = N / G;
const MAX_CLIMB = 2.2;          // max height change between neighbouring cells (2 units apart)

export class WalkGrid {
  ok = new Uint8Array(M * M);
  h = new Float32Array(M * M);
  cost = new Float32Array(M * M);

  constructor(private w: World) {
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = i * G + G / 2, z = j * G + G / 2, k = j * M + i, wi = (z | 0) * N + (x | 0);
      const h = heightAt(w, x, z);
      this.h[k] = h;
      this.ok[k] = h > 0.4 && w.biome[wi] !== B.Lake && w.biome[wi] !== B.Ocean ? 1 : 0;
      this.cost[k] = 1 + (w.riverDist[wi] < 1.5 ? 3 : 0) + (w.biome[wi] === B.Swamp ? 0.6 : 0);
    }
    for (const l of w.landmarks) {
      if (l.kind === 'hotSpring') this.block(l.x, l.z, l.r * 0.9);
      if (l.kind === 'campfire') this.block(l.x, l.z, 1);
      if (l.kind === 'fuselage') {
        const ax = Math.cos(l.rot), az = Math.sin(l.rot);
        for (let t = -6.5; t <= 8; t += 1) this.block(l.x + ax * t, l.z + az * t, 1.6);
      }
    }
  }

  private block(x: number, z: number, r: number) {
    for (let j = Math.floor((z - r) / G); j <= Math.floor((z + r) / G); j++) for (let i = Math.floor((x - r) / G); i <= Math.floor((x + r) / G); i++)
      if (i >= 0 && j >= 0 && i < M && j < M && Math.hypot(i * G + 1 - x, j * G + 1 - z) <= r + 0.5) this.ok[j * M + i] = 0;
  }

  cell(x: number, z: number) { const i = Math.floor(x / G), j = Math.floor(z / G); return i < 0 || j < 0 || i >= M || j >= M ? -1 : j * M + i; }
  walkable(x: number, z: number) { const c = this.cell(x, z); return c >= 0 && this.ok[c] === 1; }
  /** Can a person step from (ax,az) to (bx,bz) directly (short moves)? */
  canStep(ax: number, az: number, bx: number, bz: number) {
    if (!this.walkable(bx, bz)) return false;
    const d = Math.hypot(bx - ax, bz - az) || 1e-6;
    return Math.abs(heightAt(this.w, bx, bz) - heightAt(this.w, ax, az)) / d < MAX_CLIMB / G * 1.25;
  }

  /** Nearest walkable cell centre to (x,z), searching outward in rings. */
  nearest(x: number, z: number, maxR = 40): { x: number; z: number } | null {
    const ci = Math.floor(x / G), cj = Math.floor(z / G);
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= M || j >= M || !this.ok[j * M + i]) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = j * M + i; }
      }
      if (best >= 0) return { x: (best % M) * G + G / 2, z: Math.floor(best / M) * G + G / 2 };
    }
    return null;
  }

  private gs = new Float32Array(M * M);
  private from = new Int32Array(M * M);
  private stamp = new Uint32Array(M * M);
  private closed = new Uint32Array(M * M);
  private run = 0;

  /**
   * A* from a to b. Returns smoothed world-space waypoints (excluding the start).
   * If b can't be reached, walks to the reachable cell closest to it.
   */
  find(ax: number, az: number, bx: number, bz: number, maxIter = 120000): { x: number; z: number }[] {
    const s0 = this.nearest(ax, az, 6), g0 = this.nearest(bx, bz);
    if (!s0 || !g0) return [];
    const s = this.cell(s0.x, s0.z), goal = this.cell(g0.x, g0.z);
    const run = ++this.run, gs = this.gs, from = this.from, stamp = this.stamp, closed = this.closed;
    const gi = goal % M, gj = (goal / M) | 0;
    const hfn = (c: number) => { const dx = Math.abs((c % M) - gi), dy = Math.abs(((c / M) | 0) - gj); return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)); };
    const heap = new Heap();
    stamp[s] = run; gs[s] = 0; from[s] = -1; heap.push(s, hfn(s));
    let best = s, bestH = hfn(s), it = 0;
    while (heap.size && it++ < maxIter) {
      const c = heap.pop();
      if (closed[c] === run) continue;
      closed[c] = run;
      if (c === goal) { best = c; break; }
      const hc = hfn(c); if (hc < bestH) { bestH = hc; best = c; }
      const ci = c % M, cj = (c / M) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= M || nj >= M) continue;
        const n = nj * M + ni; if (!this.ok[n] || closed[n] === run) continue;
        if (di && dj && (!this.ok[cj * M + ni] || !this.ok[nj * M + ci])) continue;     // no corner cutting
        const dh = Math.abs(this.h[n] - this.h[c]), len = di && dj ? Math.SQRT2 : 1;
        if (dh > MAX_CLIMB * len) continue;
        const ng = gs[c] + len * this.cost[n] + dh * 0.6;
        if (stamp[n] !== run || ng < gs[n]) { stamp[n] = run; gs[n] = ng; from[n] = c; heap.push(n, ng + hfn(n)); }
      }
    }
    const cells: number[] = [];
    for (let c = best; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: (c % M) * G + G / 2, z: ((c / M) | 0) * G + G / 2 }));
    if (best === goal) pts[pts.length - 1] = this.walkable(bx, bz) ? { x: bx, z: bz } : g0;
    return this.smooth([{ x: ax, z: az }, ...pts]).slice(1);
  }

  /** Straight walk check along a segment (used to drop unneeded waypoints). */
  clear(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.7);
    let px = ax, pz = az;
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (!this.walkable(x, z) || Math.abs(heightAt(this.w, x, z) - heightAt(this.w, px, pz)) > 0.9) return false;
      const c = this.cell(x, z); if (this.cost[c] > 2 && this.cost[this.cell(px, pz)] <= 2 && d > 6) return false;   // keep river crossings short
      px = x; pz = z;
    }
    return true;
  }

  private smooth(p: { x: number; z: number }[]) {
    if (p.length < 3) return p;
    const out = [p[0]];
    let a = 0;
    while (a < p.length - 1) {
      let b = Math.min(p.length - 1, a + 24);
      while (b > a + 1 && !this.clear(p[a].x, p[a].z, p[b].x, p[b].z)) b--;
      out.push(p[b]); a = b;
    }
    return out;
  }
}

class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(pri);
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= pri) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = pri;
  }
  pop() {
    const k = this.k, v = this.v, top = k[0], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && v[c + 1] < v[c]) c++; if (v[c] >= lv) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
