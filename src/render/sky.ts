import * as THREE from 'three';
import { U } from './shared';

type Key = { h: number; sun: number[]; si: number; sky: number[]; gnd: number[]; hi: number; amb: number[] };
// colour script for a day; interpolated by hour
const KEYS: Key[] = [
  { h: 0, sun: [0.55, 0.62, 0.95], si: 0.9, sky: [0.3, 0.36, 0.62], gnd: [0.1, 0.1, 0.18], hi: 0.55, amb: [0.3, 0.35, 0.58] },
  { h: 4.8, sun: [0.55, 0.62, 0.95], si: 0.8, sky: [0.32, 0.36, 0.62], gnd: [0.1, 0.1, 0.18], hi: 0.55, amb: [0.32, 0.36, 0.58] },
  { h: 6.2, sun: [1.0, 0.62, 0.45], si: 1.8, sky: [0.8, 0.62, 0.68], gnd: [0.3, 0.25, 0.25], hi: 0.8, amb: [0.88, 0.7, 0.68] },
  { h: 8.5, sun: [1.0, 0.92, 0.8], si: 2.7, sky: [0.75, 0.85, 1.0], gnd: [0.42, 0.45, 0.32], hi: 1.05, amb: [1.0, 0.97, 0.94] },
  { h: 15.5, sun: [1.0, 0.95, 0.84], si: 2.7, sky: [0.75, 0.85, 1.0], gnd: [0.42, 0.45, 0.32], hi: 1.05, amb: [1.0, 0.98, 0.95] },
  { h: 18.0, sun: [1.0, 0.58, 0.4], si: 2.0, sky: [0.85, 0.6, 0.62], gnd: [0.35, 0.25, 0.22], hi: 0.85, amb: [0.98, 0.72, 0.62] },
  { h: 19.6, sun: [0.62, 0.5, 0.85], si: 1.0, sky: [0.45, 0.4, 0.7], gnd: [0.15, 0.12, 0.2], hi: 0.6, amb: [0.48, 0.42, 0.68] },
  { h: 21, sun: [0.55, 0.62, 0.95], si: 0.9, sky: [0.3, 0.36, 0.62], gnd: [0.1, 0.1, 0.18], hi: 0.55, amb: [0.3, 0.35, 0.58] },
  { h: 24, sun: [0.55, 0.62, 0.95], si: 0.9, sky: [0.3, 0.36, 0.62], gnd: [0.1, 0.1, 0.18], hi: 0.55, amb: [0.3, 0.35, 0.58] },
];
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export class Sky {
  sun = new THREE.DirectionalLight(0xffffff, 2.5);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  constructor(scene: THREE.Scene) {
    const s = this.sun; s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    Object.assign(s.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    s.shadow.bias = -0.0008; s.shadow.normalBias = 0.02;
    scene.add(s, s.target, this.hemi);
  }

  /** dim: 0..1 extra darkening from clouds/storm. flash: lightning. */
  update(hour: number, night: number, target: THREE.Vector3, dim: number, flash: number) {
    let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1].h <= hour) k++;
    const a = KEYS[k], b = KEYS[k + 1], t = (hour - a.h) / (b.h - a.h);
    const day = 1 - dim * 0.55;
    this.sun.color.setRGB(...(lerp3(a.sun, b.sun, t) as [number, number, number]));
    this.sun.intensity = 1.08 * (a.si + (b.si - a.si) * t) * (1 - dim * 0.75);
    this.hemi.color.setRGB(...(lerp3(a.sky, b.sky, t) as [number, number, number]));
    this.hemi.groundColor.setRGB(...(lerp3(a.gnd, b.gnd, t) as [number, number, number]));
    this.hemi.intensity = 1.1 * (a.hi + (b.hi - a.hi) * t) * day + flash * 2.5;
    const amb = lerp3(a.amb, b.amb, t).map((v, i) => v * (1 - dim * (i === 2 ? 0.28 : 0.38)) + flash * 0.8);
    U.uAmbient.value.setRGB(amb[0], amb[1], amb[2]);
    U.uNight.value = night;
    // sun by day, moon by night: both arc over the island so shadows sweep across the day
    const ang = night > 0.5 ? ((hour + 12 - 6) / 12) * Math.PI : ((hour - 6) / 12) * Math.PI;
    const el = Math.max(0.35, Math.sin(Math.min(Math.PI - 0.2, Math.max(0.2, ang))));
    const dir = new THREE.Vector3(-Math.cos(ang) * 0.9, el * 1.2, 0.45).normalize();
    this.sun.position.copy(target).addScaledVector(dir, 150);
    this.sun.target.position.copy(target);
    U.uSunDir.value.copy(dir);
  }
}
