import { ATLAS, SpriteBatch } from '../render/sprites';

interface P { s: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; l: number; max: number; r: number; g: number; b: number; a: number; grav: number; emissive: boolean; fade: boolean; flat: boolean }

/** Tiny pixel particles: steam, smoke, sparks, splashes, blown leaves. */
export class Particles {
  list: P[] = [];
  constructor(private batch: SpriteBatch) {}

  emit(s: string, x: number, y: number, z: number, o: Partial<P> = {}) {
    if (this.list.length > 2500) return;
    this.list.push({ s, x, y, z, vx: 0, vy: 0, vz: 0, l: 0, max: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, emissive: false, fade: true, flat: false, ...o });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.l += dt;
      if (p.l >= p.max) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }

  draw() {
    for (const p of this.list) {
      const fr = ATLAS[p.s]; if (!fr) continue;
      const k = p.l / p.max, a = p.fade ? p.a * (1 - k) : p.a;
      this.batch.push(p.x, p.y, p.z, fr[0], false, p.r, p.g, p.b, p.emissive ? 2 : Math.max(0.01, a), p.flat);
    }
  }
}
