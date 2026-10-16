import { fbm, hash, mulberry32, smoothstep } from './noise';

/** Grid cells per side. 1 cell = 1 world unit; a person is ~1.7 units tall. */
export const N = 768;

export const B = {
  Ocean: 0, Beach: 1, Grass: 2, Jungle: 3, Highland: 4, Volcanic: 5, Swamp: 6, Bamboo: 7,
  Flowers: 8, TideRock: 9, Dirt: 10, Reef: 11, Lagoon: 12, Lake: 13,
} as const;

export type LandmarkKind =
  | 'fuselage' | 'wing' | 'tail' | 'engine' | 'campfire' | 'ruins' | 'shipwreck'
  | 'abandonedCamp' | 'radioTower' | 'giantTree' | 'hotSpring' | 'steamVent' | 'cave';

export interface Landmark { kind: LandmarkKind; x: number; z: number; rot: number; r: number }
export interface RiverPt { x: number; z: number; y: number; w: number }
export interface River { pts: RiverPt[]; falls: number[] }

export interface World {
  seed: number;
  h: Float32Array;       // terrain height (sea level = 0)
  biome: Uint8Array;
  moist: Float32Array;
  clear: Uint8Array;     // 1 = no trees (landmarks, crash scar, camp)
  riverDist: Float32Array;
  rivers: River[];
  landmarks: Landmark[];
  volcano: { x: number; z: number; r: number };
  lake: { x: number; z: number; level: number };
  crash: { x: number; z: number; rot: number };
  islandCenter: { x: number; z: number };
}

export const idx = (x: number, z: number) => (z | 0) * N + (x | 0);
const inb = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;

export function heightAt(w: World, x: number, z: number): number {
  x = Math.max(0, Math.min(N - 1.001, x)); z = Math.max(0, Math.min(N - 1.001, z));
  const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi, i = zi * N + xi;
  const a = w.h[i], b = w.h[i + 1], c = w.h[i + N], d = w.h[i + N + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export const biomeAt = (w: World, x: number, z: number) => (inb(x, z) ? w.biome[idx(x, z)] : B.Ocean);

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

export function generate(seed: number): World {
  const rnd = mulberry32(seed);
  const S = (k: number) => (seed * 31 + k * 1013) | 0;
  const C = N / 2, R = 285;
  const aCliff = rnd() * TAU, aLag = aCliff + Math.PI * (0.7 + rnd() * 0.6);
  const vol = { x: C + (rnd() - 0.5) * 50, z: C + (rnd() - 0.5) * 50, r: 125 };

  const h = new Float32Array(N * N), base = new Float32Array(N * N), base0 = new Float32Array(N * N);
  const cliffW = new Float32Array(N * N), lagW = new Float32Array(N * N);
  const biome = new Uint8Array(N * N);

  // ---- 1. shape + height
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    const wx = x + (fbm(x / 140, z / 140, S(1)) - 0.47) * 120, wz = z + (fbm(x / 140, z / 140, S(2)) - 0.47) * 120;
    const dx = wx - C, dz = wz - C, a = Math.atan2(dz, dx);
    const rr = 1 + (fbm(Math.cos(a) * 1.8 + 5, Math.sin(a) * 1.8 + 5, S(3)) - 0.47) * 0.75;
    const b0 = 1 - Math.hypot(dx, dz) / (R * rr) + (fbm(x / 45, z / 45, S(4)) - 0.47) * 0.2;
    const cw = 1 - smoothstep(0.35, 0.7, angDiff(a, aCliff)), lw = 1 - smoothstep(0.3, 0.6, angDiff(a, aLag));
    const b = b0 - 0.12 * lw;
    base[i] = b; base0[i] = b0; cliffW[i] = cw; lagW[i] = lw;
    let hh: number;
    if (b > 0) {
      hh = 0.12 + b * 7 + (fbm(x / 70, z / 70, S(5)) - 0.5) * 5 * smoothstep(0.05, 0.22, b);
      const p = fbm(x / 110, z / 110, S(6)), tg = smoothstep(0.1, 0.22, b);
      hh += tg * (smoothstep(0.54, 0.565, p) + smoothstep(0.62, 0.645, p) + smoothstep(0.7, 0.725, p)) * 2.6;
      hh += cw * smoothstep(0, 0.025, b) * (6 + fbm(x / 30, z / 30, S(7)) * 6);
      const d = Math.hypot(x - vol.x, z - vol.z) / vol.r;
      if (d < 1) {
        const c = Math.pow(1 - d, 1.55), va = Math.atan2(z - vol.z, x - vol.x);
        hh += c * 44 + (fbm(x / 22, z / 22, S(8)) - 0.5) * 8 * c;
        hh += Math.sin(va * 13 + fbm(x / 30, z / 30, S(18)) * 7) * 1.8 * c * smoothstep(0.14, 0.35, d);   // radial gullies
        hh += 3.5 * Math.exp(-(((d - 0.16) / 0.03) ** 2));   // crater rim
        if (d < 0.15) hh -= Math.pow(1 - d / 0.15, 0.7) * 13;
      }
    } else {
      hh = Math.max(-14, b * (cw > 0.5 ? 140 : 45));
      if (lw > 0.15 && b0 > -0.022) {
        if (Math.abs(b0 + 0.013) < 0.0055) { hh = -0.12 - hash(x, z, S(9)) * 0.08; biome[i] = B.Reef; }
        else if (b0 > -0.013) { hh = -0.35 - (fbm(x / 20, z / 20, S(10)) - 0.3) * 0.9; biome[i] = B.Lagoon; }
      }
    }
    h[i] = hh;
  }

  // ---- 2. islets
  for (let k = 0; k < 4; k++) {
    const a = rnd() * TAU, dist = R * (1.13 + rnd() * 0.17), ri = 9 + rnd() * 14;
    const ix = C + Math.cos(a) * dist, iz = C + Math.sin(a) * dist;
    for (let z = Math.max(0, iz - ri - 6 | 0); z < Math.min(N, iz + ri + 6); z++) for (let x = Math.max(0, ix - ri - 6 | 0); x < Math.min(N, ix + ri + 6); x++) {
      const ib = 1 - Math.hypot(x - ix, z - iz) / (ri * (0.8 + fbm(x / 9, z / 9, S(11 + k)) * 0.5));
      const i = z * N + x;
      if (ib > -0.25) { const hi = ib > 0 ? 0.15 + ib * 5 : ib * 8; if (hi > h[i]) { h[i] = hi; base[i] = Math.max(base[i], ib * 0.05); } }
    }
  }

  // ---- 3. crater lake + notch
  let craterMin = 1e9, rimMin = 1e9;
  for (let z = vol.z - 26 | 0; z < vol.z + 26; z++) for (let x = vol.x - 26 | 0; x < vol.x + 26; x++) {
    const d = Math.hypot(x - vol.x, z - vol.z) / vol.r;
    if (d < 0.15) craterMin = Math.min(craterMin, h[idx(x, z)]);
    else if (d < 0.18) rimMin = Math.min(rimMin, h[idx(x, z)]);
  }
  const lake = { x: vol.x, z: vol.z, level: craterMin + Math.max(1.5, Math.min(4.5, (rimMin - craterMin) * 0.6)) };
  const aNotch = rnd() * TAU;

  // ---- 4. rivers
  const rivMask = new Uint8Array(N * N), rivers: River[] = [];
  const traceRiver = (sx: number, sz: number, ox: number, oz: number, startY?: number, pre: RiverPt[] = []) => {
    let x = sx | 0, z = sz | 0;
    const path: [number, number][] = [], seen = new Set<number>();
    for (let step = 0; step < 2500; step++) {
      const i = idx(x, z);
      path.push([x, z]); seen.add(i);
      if (h[i] < -0.25) break;
      if (rivMask[i] && step > 4) break;
      let best = -1, bh = 1e9;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (!inb(nx, nz)) continue;
        const ni = idx(nx, nz); if (seen.has(ni)) continue;
        if (h[ni] < bh) { bh = h[ni]; best = ni; }
      }
      if (best < 0) break;
      if (bh > h[i] + 0.005) {
        // pit: breach straight out to the nearest lower ground (the channel carve cuts through the rim)
        let tx = -1, tz = -1;
        const ol = Math.hypot(x - ox, z - oz) || 1;
        for (let r = 2; r < 90 && tx < 0; r++) {
          let bestOut = -2;
          for (let k = 0, n = r * 6; k < n; k++) {
            const a = (k / n) * TAU, cx = Math.round(x + Math.cos(a) * r), cz = Math.round(z + Math.sin(a) * r);
            if (!inb(cx, cz) || seen.has(idx(cx, cz)) || h[idx(cx, cz)] >= h[i] - 0.05) continue;
            const o = ((cx - x) * (x - ox) + (cz - z) * (z - oz)) / (ol * r);
            if (o > bestOut) { bestOut = o; tx = cx; tz = cz; }
          }
        }
        if (tx < 0) break;
        const steps = Math.ceil(Math.hypot(tx - x, tz - z));
        for (let s = 1; s < steps; s++) {
          const px = Math.round(x + (tx - x) * s / steps), pz = Math.round(z + (tz - z) * s / steps), pi = idx(px, pz);
          if (!seen.has(pi)) { path.push([px, pz]); seen.add(pi); }
        }
        x = tx; z = tz; continue;
      }
      x = best % N; z = (best / N) | 0;
    }
    if (path.length < 25 || h[idx(path[path.length - 1][0], path[path.length - 1][1])] > 0.5 && !rivMask[idx(path[path.length - 1][0], path[path.length - 1][1])]) return;
    // surface profile: never flows uphill
    const pts: RiverPt[] = [...pre];
    let y = startY ?? h[idx(path[0][0], path[0][1])] - 0.1;
    path.forEach(([px, pz], k) => {
      y = Math.min(y, Math.max(h[idx(px, pz)] - 0.1, -0.1));
      pts.push({ x: px + 0.5, z: pz + 0.5, y, w: Math.min(3.6, 1.1 + k * 0.006) });
    });
    // smooth the 8-direction staircase (keep y monotonic)
    for (let pass = 0; pass < 3; pass++) for (let k = 1; k < pts.length - 1; k++) {
      pts[k].x = (pts[k - 1].x + pts[k].x * 2 + pts[k + 1].x) / 4; pts[k].z = (pts[k - 1].z + pts[k].z * 2 + pts[k + 1].z) / 4;
    }
    // carve channel
    for (const p of pts) {
      const r = p.w + 2.5;
      for (let z = p.z - r | 0; z <= p.z + r; z++) for (let x = p.x - r | 0; x <= p.x + r; x++) {
        if (!inb(x, z)) continue; const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z), i = idx(x, z);
        if (d < p.w) { h[i] = Math.min(h[i], p.y - 0.55 * (1 - (d / p.w) ** 2) - 0.05); rivMask[i] = 1; }
        else if (d < r) h[i] = Math.min(h[i], p.y + (d - p.w) * 0.7);
      }
    }
    const falls: number[] = [];
    for (let k = 1; k < pts.length; k++) if (pts[k - 1].y - pts[k].y > 0.9 && (!falls.length || k - falls[falls.length - 1] > 4)) falls.push(k);
    rivers.push({ pts, falls });
  };
  // crater outlet first
  {
    const rimD = vol.r * 0.19, sx = vol.x + Math.cos(aNotch) * rimD, sz = vol.z + Math.sin(aNotch) * rimD;
    const pre: RiverPt[] = [];
    for (let t = 0.11; t < 0.19; t += 0.01) {
      const px = vol.x + Math.cos(aNotch) * vol.r * t, pz = vol.z + Math.sin(aNotch) * vol.r * t;
      pre.push({ x: px, z: pz, y: lake.level - 0.12, w: 1.6 });
      for (let z = pz - 3 | 0; z <= pz + 3; z++) for (let x = px - 3 | 0; x <= px + 3; x++) {
        const d = Math.hypot(x - px, z - pz); if (d < 3) h[idx(x, z)] = Math.min(h[idx(x, z)], lake.level - 0.6 + d * 0.5);
      }
    }
    traceRiver(sx, sz, vol.x, vol.z, lake.level - 0.12, pre);
  }
  const sources: [number, number][] = [];
  for (let t = 0; t < 4000 && sources.length < 6; t++) {
    const x = 40 + rnd() * (N - 80), z = 40 + rnd() * (N - 80), hh = h[idx(x, z)];
    const vd = Math.hypot(x - vol.x, z - vol.z) / vol.r;
    if (hh > 6 && hh < 16 && vd > 0.3 && sources.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > 110)) sources.push([x, z]);
  }
  for (const [sx, sz] of sources) traceRiver(sx, sz, C, C);

  // ---- 5. moisture + biomes
  const riverDist = new Float32Array(N * N).fill(99);
  for (const rv of rivers) for (const p of rv.pts) {
    for (let z = p.z - 14 | 0; z <= p.z + 14; z++) for (let x = p.x - 14 | 0; x <= p.x + 14; x++) {
      if (!inb(x, z)) continue; const i = idx(x, z); riverDist[i] = Math.min(riverDist[i], Math.hypot(x - p.x, z - p.z));
    }
  }
  const swampAt = (() => {
    const mouths = rivers.slice(1).map(r => r.pts[r.pts.length - 1]).filter(p => cliffW[idx(p.x, p.z)] < 0.3 && lagW[idx(p.x, p.z)] < 0.3);
    return mouths.length ? mouths[(rnd() * mouths.length) | 0] : null;
  })();
  const moist = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, hh = h[i];
    const m = fbm(x / 100, z / 100, S(20)) + 0.25 * (1 - smoothstep(0, 12, riverDist[i]));
    moist[i] = m;
    if (biome[i] === B.Reef || biome[i] === B.Lagoon) continue;
    const vd = Math.hypot(x - vol.x, z - vol.z) / vol.r;
    if (vd < 0.15 && hh < lake.level) { biome[i] = B.Lake; continue; }
    if (hh <= 0) { biome[i] = B.Ocean; continue; }
    const n = fbm(x / 26, z / 26, S(21));
    if (hh < 1.25 && base[i] < 0.08 && cliffW[i] < 0.5) biome[i] = fbm(x / 18, z / 18, S(22)) > 0.67 ? B.TideRock : B.Beach;
    else if (vd < 0.25 + (n - 0.5) * 0.1) biome[i] = B.Volcanic;
    else if (vd < 0.42 + (n - 0.5) * 0.18) biome[i] = B.Highland;
    else if (hh > 10 && n > 0.45) biome[i] = B.Highland;
    else if (swampAt && hh < 3 && Math.hypot(x - swampAt.x, z - swampAt.z) < 42 + (n - 0.5) * 40) biome[i] = B.Swamp;
    else if (m < 0.45) biome[i] = fbm(x / 35, z / 35, S(23)) > 0.67 ? B.Flowers : B.Grass;
    else biome[i] = fbm(x / 30, z / 30, S(24)) > 0.69 ? B.Bamboo : B.Jungle;
  }

  // ---- 6. landmarks
  const clear = new Uint8Array(N * N);
  const landmarks: Landmark[] = [];
  const flatten = (cx: number, cz: number, r: number, blend = 6, clearR = r + 2) => {
    let sum = 0, n = 0;
    for (let z = cz - r | 0; z <= cz + r; z++) for (let x = cx - r | 0; x <= cx + r; x++) if (inb(x, z) && Math.hypot(x - cx, z - cz) <= r) { sum += h[idx(x, z)]; n++; }
    const avg = sum / Math.max(1, n), R2 = r + blend;
    for (let z = cz - R2 | 0; z <= cz + R2; z++) for (let x = cx - R2 | 0; x <= cx + R2; x++) {
      if (!inb(x, z)) continue; const d = Math.hypot(x - cx, z - cz), i = idx(x, z);
      if (d < R2) h[i] += (avg - h[i]) * smoothstep(R2, r, d);
      if (d < clearR) clear[i] = 1;
    }
  };
  const slopeAt = (x: number, z: number, r = 3) => {
    const c = h[idx(x, z)]; let m = 0;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (inb(x + dx, z + dz)) m = Math.max(m, Math.abs(h[idx(x + dx, z + dz)] - c));
    return m;
  };
  const find = (pred: (x: number, z: number, i: number) => boolean, tries = 20000) => {
    for (let t = 0; t < tries; t++) {
      const x = 20 + rnd() * (N - 40), z = 20 + rnd() * (N - 40);
      if (pred(x, z, idx(x, z))) return { x, z };
    }
    return null;
  };
  const far = (x: number, z: number, d: number) => landmarks.every(l => Math.hypot(l.x - x, l.z - z) > d);
  const outward = (x: number, z: number) => Math.atan2(z - C, x - C);

  // crash site on an open beach (not the lagoon or cliff coast)
  const cs = find((x, z, i) => biome[i] === B.Beach && cliffW[i] < 0.1 && lagW[i] < 0.1 && slopeAt(x, z, 4) < 0.6 && riverDist[i] > 25)
    ?? find((x, z, i) => biome[i] === B.Beach)!;
  const out = outward(cs.x, cs.z), inX = -Math.cos(out), inZ = -Math.sin(out);
  const crash = { x: cs.x, z: cs.z, rot: out + Math.PI / 2 };
  flatten(cs.x, cs.z, 9, 6, 30);
  landmarks.push({ kind: 'fuselage', x: cs.x, z: cs.z, rot: crash.rot, r: 9 });
  {
    let wx = cs.x, wz = cs.z;
    for (let k = 0; k < 40; k++) { wx += Math.cos(out); wz += Math.sin(out); if (h[idx(wx, wz)] < -0.35) break; }
    landmarks.push({ kind: 'wing', x: wx, z: wz, rot: crash.rot + 0.5, r: 6 });
  }
  const fx = cs.x + inX * 14, fz = cs.z + inZ * 14;
  landmarks.push({ kind: 'campfire', x: fx, z: fz, rot: 0, r: 2 });
  // scar of broken trees: the plane came in from inland
  for (let k = 0; k < 90; k++) {
    const sx = cs.x + inX * k + Math.cos(out + Math.PI / 2) * Math.sin(k * 0.08) * 4, sz = cs.z + inZ * k + Math.sin(out + Math.PI / 2) * Math.sin(k * 0.08) * 4;
    const w = 4 + k * 0.03;
    for (let z = sz - w | 0; z <= sz + w; z++) for (let x = sx - w | 0; x <= sx + w; x++) if (inb(x, z) && Math.hypot(x - sx, z - sz) < w) {
      const i = idx(x, z); clear[i] = 1; if (biome[i] !== B.Beach && hash(x, z, 77) < 0.55) biome[i] = B.Dirt;
    }
  }
  for (let z = fz - 10 | 0; z <= fz + 10; z++) for (let x = fx - 10 | 0; x <= fx + 10; x++) {
    const d = Math.hypot(x - fx, z - fz); if (inb(x, z) && d < 7 + fbm(x / 3, z / 3, 5) * 4 && biome[idx(x, z)] !== B.Beach) biome[idx(x, z)] = B.Dirt;
  }
  const isLand = (i: number) => h[i] > 1 && biome[i] !== B.Lake && biome[i] !== B.Ocean;
  const jungleish = (b: number) => b === B.Jungle || b === B.Bamboo;
  const place = (kind: LandmarkKind, r: number, pred: (x: number, z: number, i: number) => boolean, flat = true, minSep = 60) => {
    const p = find((x, z, i) => pred(x, z, i) && far(x, z, minSep) && riverDist[i] > r + 4 && slopeAt(x, z, Math.min(6, r)) < 1.6);
    if (!p) return;
    if (flat) flatten(p.x, p.z, r, 6);
    landmarks.push({ kind, x: p.x, z: p.z, rot: rnd() * TAU, r });
  };
  place('tail', 6, (x, z, i) => jungleish(biome[i]) && Math.hypot(x - cs.x, z - cs.z) > 200);
  place('engine', 3, (x, z, i) => isLand(i) && (biome[i] === B.Jungle || biome[i] === B.Grass) && Math.hypot(x - cs.x, z - cs.z) > 90 && Math.hypot(x - cs.x, z - cs.z) < 170);
  place('ruins', 13, (x, z, i) => biome[i] === B.Jungle && Math.hypot(x - cs.x, z - cs.z) > 140, true, 90);
  place('abandonedCamp', 8, (x, z, i) => (biome[i] === B.Grass || biome[i] === B.Jungle) && Math.hypot(x - cs.x, z - cs.z) > 160, true, 90);
  place('radioTower', 5, (x, z, i) => isLand(i) && h[i] > 7 && Math.hypot(x - vol.x, z - vol.z) > vol.r * 0.55, true, 80);
  place('giantTree', 6, (x, z, i) => biome[i] === B.Jungle && Math.hypot(x - cs.x, z - cs.z) > 100, true, 90);
  {
    const sw = find((x, z, i) => biome[i] === B.Reef && hash(x, z, 3) < 0.5) ?? find((x, z, i) => biome[i] === B.Beach && lagW[i] > 0.2);
    if (sw) landmarks.push({ kind: 'shipwreck', x: sw.x, z: sw.z, rot: rnd() * TAU, r: 8 });
  }
  for (let k = 0; k < 3; k++) place('hotSpring', 3, (x, z, i) => { const d = Math.hypot(x - vol.x, z - vol.z) / vol.r; return d > 0.28 && d < 0.5 && isLand(i); }, true, 25);
  for (let k = 0; k < 5; k++) place('steamVent', 1.5, (x, z, i) => { const d = Math.hypot(x - vol.x, z - vol.z) / vol.r; return d > 0.2 && d < 0.45 && isLand(i); }, false, 18);
  for (let k = 0; k < 3; k++) {
    const p = find((x, z, i) => cliffW[i] > 0.75 && h[i] > 4 && base[i] > 0.004 && base[i] < 0.03 && far(x, z, 50), 40000);
    if (p) landmarks.push({ kind: 'cave', x: p.x, z: p.z, rot: outward(p.x, p.z), r: 3 });
  }
  for (const l of landmarks) if (l.kind === 'hotSpring') {
    const R0 = l.r * 0.85;
    for (let z = l.z - R0 | 0; z <= l.z + R0 + 1; z++) for (let x = l.x - R0 | 0; x <= l.x + R0 + 1; x++) {
      const d = Math.hypot(x - l.x, z - l.z); if (d < R0) h[idx(x, z)] -= 0.7 * (1 - (d / R0) ** 2);
    }
  }
  for (const l of landmarks) if (l.kind !== 'cave' && l.kind !== 'wing') {
    for (let z = l.z - l.r - 3 | 0; z <= l.z + l.r + 3; z++) for (let x = l.x - l.r - 3 | 0; x <= l.x + l.r + 3; x++) if (inb(x, z) && Math.hypot(x - l.x, z - l.z) < l.r + 3) clear[idx(x, z)] = 1;
  }

  return { seed, h, biome, moist, clear, riverDist, rivers, landmarks, volcano: vol, lake, crash, islandCenter: { x: C, z: C } };
}
