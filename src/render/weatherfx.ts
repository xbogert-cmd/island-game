import * as THREE from 'three';
import { World, heightAt } from '../world/island';
import { GLSL_COMMON, U } from './shared';

/** Rain streaks, lightning bolts and low valley fog around the camera. */
export class WeatherFx {
  group = new THREE.Group();
  private rainPos: Float32Array;
  private rainGeo = new THREE.BufferGeometry();
  private drops: { x: number; y: number; z: number }[] = [];
  private bolt: THREE.Line | null = null;
  private boltLife = 0;
  private nextBolt = 4;
  flash = 0;
  fogMat: THREE.ShaderMaterial;
  private fog: THREE.Mesh;
  onThunder: (dist: number) => void = () => {};
  static readonly NR = 1500;

  constructor(private w: World) {
    this.rainPos = new Float32Array(WeatherFx.NR * 6);
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xd8e4ff, transparent: true, opacity: 0.55, depthWrite: false }));
    rain.frustumCulled = false;
    this.group.add(rain);
    for (let i = 0; i < WeatherFx.NR; i++) this.drops.push({ x: 0, y: -999, z: 0 });
    this.fogMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uFog: { value: 0 } },
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 p = modelMatrix * vec4(position,1.0); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
      fragmentShader: GLSL_COMMON + /* glsl */ `
        uniform float uFog; varying vec3 vWorld;
        float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
        void main(){
          float th = max(terrainH(vWorld.xz), uTide + 0.4);
          float low = clamp((vWorld.y - th) / 3.0, 0.0, 1.0);
          float n = vn(vWorld.xz * 0.05 + vec2(uTime * 0.02, uTime * 0.011)) * 0.7 + vn(vWorld.xz * 0.13 - uTime * 0.03) * 0.3;
          float a = uFog * low * smoothstep(0.3, 0.7, n) * 0.75;
          a = floor(a * 5.0 + b4(gl_FragCoord.xy) * 0.5) / 5.0;   // banded, pixel-art haze
          if (a <= 0.0) discard;
          gl_FragColor = vec4(mix(vec3(0.95, 0.94, 0.9), vec3(0.45, 0.5, 0.65), uNight) * (0.55 + 0.45 * uAmbient), a);
        }`,
    });
    this.fog = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), this.fogMat);
    this.fog.frustumCulled = false; this.fog.renderOrder = 5;
    this.group.add(this.fog);
  }

  update(dt: number, target: THREE.Vector3, rain: number, wind: number, storm: number, fog: number, viewR: number) {
    // rain: streaks fall in a box around the camera, slanted by the wind
    const nr = Math.round(WeatherFx.NR * rain), wx = U.uWindDir.value.x * wind * 9, wz = U.uWindDir.value.y * wind * 9;
    for (let i = 0; i < nr; i++) {
      const d = this.drops[i];
      d.y -= 30 * dt; d.x += wx * dt; d.z += wz * dt;
      if (d.y < target.y - 6 || d.y < -50) {
        d.x = target.x + (Math.random() - 0.5) * viewR * 2.2; d.z = target.z + (Math.random() - 0.5) * viewR * 2.6;
        d.y = Math.max(heightAt(this.w, d.x, d.z), 0) + 8 + Math.random() * 22;
      }
      const k = i * 6;
      this.rainPos[k] = d.x; this.rainPos[k + 1] = d.y; this.rainPos[k + 2] = d.z;
      this.rainPos[k + 3] = d.x - wx * 0.05; this.rainPos[k + 4] = d.y + 0.9; this.rainPos[k + 5] = d.z - wz * 0.05;
    }
    this.rainGeo.setDrawRange(0, nr * 2);
    this.rainGeo.attributes.position.needsUpdate = true;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.bolt && (this.boltLife -= dt) <= 0) { this.group.remove(this.bolt); this.bolt.geometry.dispose(); this.bolt = null; }
    if (storm > 0.6 && (this.nextBolt -= dt) <= 0) {
      this.nextBolt = 3 + Math.random() * 9;
      const bx = target.x + (Math.random() - 0.5) * viewR * 1.6, bz = target.z - Math.random() * viewR;
      const pts: THREE.Vector3[] = []; let x = bx, z = bz, y = 60;
      const gy = Math.max(0, heightAt(this.w, bx, bz));
      while (y > gy) { pts.push(new THREE.Vector3(x, y, z)); y -= 2 + Math.random() * 3; x += (Math.random() - 0.5) * 3; z += (Math.random() - 0.5) * 1.5; }
      pts.push(new THREE.Vector3(x, gy, z));
      this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff }));
      this.bolt.frustumCulled = false; this.group.add(this.bolt); this.boltLife = 0.22;
      this.flash = 1;
      this.onThunder(Math.hypot(bx - target.x, bz - target.z));
    }
    this.fog.position.set(target.x, target.y + 0.8, target.z);
    this.fogMat.uniforms.uFog.value = fog;
    this.fog.visible = fog > 0.02;
  }
}
