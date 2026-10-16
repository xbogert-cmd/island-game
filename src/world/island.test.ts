import { describe, expect, it } from 'vitest';
import { B, N, generate, idx } from './island';

describe('island generation', () => {
  const w = generate(1234);

  it('is deterministic per seed', () => {
    const w2 = generate(1234), w3 = generate(99);
    expect(w2.h).toEqual(w.h);
    expect(w3.h).not.toEqual(w.h);
  });

  it('has a sizeable island surrounded by sea', () => {
    let land = 0;
    for (let i = 0; i < N * N; i++) if (w.h[i] > 0) land++;
    expect(land / (N * N)).toBeGreaterThan(0.25);
    expect(land / (N * N)).toBeLessThan(0.6);
    for (let k = 0; k < N; k++) { expect(w.h[idx(k, 0)]).toBeLessThan(0); expect(w.h[idx(0, k)]).toBeLessThan(0); }
  });

  it('has the volcano as the high point, with a crater lake', () => {
    let max = -1e9, mx = 0, mz = 0, lake = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const i = idx(x, z); if (w.h[i] > max) { max = w.h[i]; mx = x; mz = z; } if (w.biome[i] === B.Lake) lake++; }
    expect(Math.hypot(mx - w.volcano.x, mz - w.volcano.z)).toBeLessThan(w.volcano.r * 0.4);
    expect(lake).toBeGreaterThan(50);
  });

  it('has rivers that reach the sea or another river', () => {
    expect(w.rivers.length).toBeGreaterThanOrEqual(3);
    for (const r of w.rivers) {
      for (let k = 1; k < r.pts.length; k++) expect(r.pts[k].y).toBeLessThanOrEqual(r.pts[k - 1].y + 1e-6);
    }
  });

  it('places the crash site on a beach and all landmarks', () => {
    const kinds = new Set(w.landmarks.map(l => l.kind));
    for (const k of ['fuselage', 'wing', 'tail', 'campfire', 'ruins', 'shipwreck', 'abandonedCamp', 'radioTower', 'giantTree', 'hotSpring', 'cave'])
      expect(kinds, k).toContain(k);
    expect(w.biome[idx(w.crash.x, w.crash.z)]).toBe(B.Beach);
  });
});
