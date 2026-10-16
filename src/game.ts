import * as THREE from 'three';
import { World, heightAt } from './world/island';
import { CameraRig } from './render/camera';
import { Post } from './render/post';
import { Sky } from './render/sky';
import { Terrain, uploadWorldTextures } from './render/terrain';
import { Water } from './render/water';
import { Vegetation } from './render/vegetation';
import { buildProps, PropsOut } from './render/props';
import { WeatherFx } from './render/weatherfx';
import { SpriteBatch, buildAtlas } from './render/sprites';
import { PITCH, PX, U } from './render/shared';
import { Clock } from './sim/clock';
import { Weather } from './sim/weather';
import { Survivors } from './life/people';
import { Wildlife } from './life/wildlife';
import { Particles } from './life/particles';

THREE.ColorManagement.enabled = false;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  rig: CameraRig;
  post = new Post();
  sky: Sky;
  clock = new Clock();
  weather = new Weather();
  veg: Vegetation;
  props: PropsOut;
  fx: WeatherFx;
  survivors: Survivors;
  wildlife: Wildlife;
  particles: Particles;
  private batch: SpriteBatch;
  private falls: { x: number; y: number; z: number }[] = [];
  private starT = 20;
  private star = { x: 0, y: 0, p: -1 };
  private last = performance.now();
  private onFrame: ((dt: number) => void)[] = [];
  viewR = 60;

  constructor(public world: World, public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.scene.background = new THREE.Color(0x1c4672);
    uploadWorldTextures(world);
    this.veg = new Vegetation(world);
    this.props = buildProps(world);
    this.fx = new WeatherFx(world);
    this.batch = new SpriteBatch(buildAtlas(), 5000);
    this.particles = new Particles(this.batch);
    this.wildlife = new Wildlife(world, this.batch, this.particles);
    this.survivors = new Survivors(world);
    this.scene.add(new Terrain(world).group, new Water(world).group, this.veg.group, this.props.group, this.fx.group, this.batch.mesh, this.survivors.batch.mesh);
    for (const r of world.rivers) for (const k of r.falls) { const p = r.pts[Math.min(r.pts.length - 1, k + 1)]; this.falls.push({ x: p.x, y: p.y, z: p.z }); }
    this.sky = new Sky(this.scene);
    this.rig = new CameraRig(world, canvas);
    this.rig.onResize = () => this.resize();
    this.rig.jumpTo(world.crash.x, world.crash.z);
    addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(this.loop);
  }

  every(fn: (dt: number) => void) { this.onFrame.push(fn); }

  /** Debug/dev: jump the camera to a landmark. */
  goto(kind: string, n = 0) { const l = this.world.landmarks.filter(l => l.kind === kind)[n]; if (l) this.rig.jumpTo(l.x, l.z); }

  resize() {
    const z = this.rig.zoom, W = Math.ceil(innerWidth / z), H = Math.ceil(innerHeight / z);
    this.renderer.setSize(W, H, false);
    Object.assign(this.canvas.style, { width: W * z + 'px', height: H * z + 'px' });
    this.post.setSize(W, H);
    this.rig.W = W; this.rig.H = H;
  }

  step(rdt: number) {
    const clock = this.clock, wx = this.weather;
    const dt = rdt * (clock.speed || 0);          // world time (pauses with the clock)
    clock.tick(rdt);
    U.uTime.value += dt;
    this.rig.update(rdt);
    const t = this.rig.target, hour = clock.hour, night = clock.night;
    this.viewR = Math.hypot(this.rig.W, this.rig.H / Math.sin(PITCH)) * PX / 2 + 8;

    // weather + sky
    wx.update(dt, hour);
    U.uWind.value = wx.wind; U.uCloud.value = wx.cloud; U.uWet.value = wx.wet;
    const wa = 0.35 + Math.sin(U.uTime.value * 0.01) * 0.6; U.uWindDir.value.set(Math.cos(wa), Math.sin(wa));
    U.uCloudOff.value.addScaledVector(U.uWindDir.value, dt * (0.02 + wx.wind * 0.05));
    U.uTide.value = Math.sin((clock.minutes / 60 / 12.42) * Math.PI * 2) * 0.3;
    this.fx.update(dt, t, wx.rain, wx.wind, wx.storm, wx.fog, this.viewR);
    this.sky.update(hour, night, t, Math.min(1, wx.cloud * 0.3 + wx.rain * 0.45 + wx.storm * 0.25), this.fx.flash);
    (this.scene.background as THREE.Color).setRGB(0.11 * (1 - night * 0.7), 0.27 * (1 - night * 0.7), 0.45 * (1 - night * 0.6));
    const pu = this.post.mat.uniforms;
    pu.flash.value = this.fx.flash * 0.35; pu.rainbow.value = wx.rainbow;
    this.shootingStars(rdt, night, wx.cloud);

    // world
    this.veg.update(t.x, t.z, this.viewR);
    const sc = this.sky.sun.shadow.camera; if (sc.right !== this.viewR) { sc.left = sc.bottom = -this.viewR; sc.right = sc.top = this.viewR; sc.updateProjectionMatrix(); }
    for (const f of this.props.fires) {
      const tt = U.uTime.value, lit = Math.max(0, 1 - wx.rain * 0.8);
      f.flames.forEach((m, i) => { const k = (0.85 + Math.sin(tt * 13 + i * 2) * 0.12 + Math.random() * 0.1) * lit; m.scale.set(k, k * (1.1 + i * 0.15), k); m.visible = lit > 0.1; });
      f.light.intensity = (0.4 + night * 9) * lit * (1 + Math.sin(tt * 11) * 0.08);
      if (Math.random() < dt * 4) this.particles.emit('puff', f.x + (Math.random() - 0.5) * 0.4, f.y + 1.2, f.z, { vy: 1.2, vx: U.uWindDir.value.x * wx.wind * 2, vz: U.uWindDir.value.y * wx.wind * 2, max: 2.5, r: 0.75, g: 0.75, b: 0.78, a: 0.7 });
      if (lit > 0.2 && Math.random() < dt * 5) this.particles.emit('dot1', f.x, f.y + 0.8, f.z, { vy: 2 + Math.random() * 2, vx: (Math.random() - 0.5), grav: 1, max: 0.8, r: 1, g: 0.7, b: 0.3, emissive: true, fade: false });
    }
    this.ambientParticles(dt, t);
    this.particles.update(dt);
    this.survivors.update(dt, night, wx.rain, Math.max(0, 1 - wx.rain * 0.8));
    this.batch.begin();
    this.wildlife.update(dt, t, this.viewR, night, this.survivors.people, wx.rain);
    this.particles.draw();
    this.batch.end();
    for (const f of this.onFrame) f(rdt);
  }

  private ambientParticles(dt: number, t: THREE.Vector3) {
    const wx = this.weather, P = this.particles, near = (x: number, z: number) => Math.abs(x - t.x) < this.viewR * 1.2 && Math.abs(z - t.z) < this.viewR * 1.4;
    for (const s of this.props.steam) if (near(s.x, s.z) && Math.random() < dt * s.rate) {
      P.emit(Math.random() < 0.5 ? 'puff' : 'puff6', s.x + (Math.random() - 0.5) * 1.5, s.y, s.z + (Math.random() - 0.5) * 1.5, { vy: 1 + Math.random(), vx: U.uWindDir.value.x * (0.3 + wx.wind * 2), vz: U.uWindDir.value.y * (0.3 + wx.wind * 2), max: 3 + Math.random() * 2, r: 0.95, g: 0.97, b: 1, a: 0.55 });
    }
    for (const f of this.falls) if (near(f.x, f.z) && Math.random() < dt * 14) {
      P.emit('dot2', f.x + (Math.random() - 0.5) * 2, f.y + 0.1, f.z + (Math.random() - 0.5) * 2, { vy: 1.5 + Math.random() * 2, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, grav: 7, max: 0.6, r: 0.92, g: 0.97, b: 1 });
      if (Math.random() < 0.3) P.emit('puff', f.x, f.y + 0.4, f.z, { vy: 0.6, max: 1.5, a: 0.4 });
    }
    const n = wx.rain * dt * 140;
    for (let i = 0; i < n; i++) {
      const x = t.x + (Math.random() - 0.5) * this.viewR * 2, z = t.z + (Math.random() - 0.5) * this.viewR * 2.4;
      P.emit('splash', x, Math.max(heightAt(this.world, x, z), U.uTide.value) + 0.05, z, { max: 0.18, r: 0.85, g: 0.9, b: 1, fade: false });
    }
    if (wx.wind > 0.55 && Math.random() < dt * 25 * (wx.wind - 0.5)) {
      const x = t.x - U.uWindDir.value.x * this.viewR + (Math.random() - 0.5) * this.viewR * 2, z = t.z - U.uWindDir.value.y * this.viewR + (Math.random() - 0.5) * this.viewR * 2;
      P.emit('leaf', x, heightAt(this.world, x, z) + 2 + Math.random() * 4, z, { vx: U.uWindDir.value.x * 14, vz: U.uWindDir.value.y * 14, vy: (Math.random() - 0.5) * 2, max: 6, r: 0.35, g: 0.65, b: 0.3, fade: false });
    }
  }

  private shootingStars(dt: number, night: number, cloud: number) {
    const s = this.star, u = this.post.mat.uniforms.star.value as THREE.Vector4;
    if (s.p >= 0) { s.p += dt * 1.6; if (s.p > 1) s.p = -1; }
    else if (night > 0.8 && cloud < 0.5 && (this.starT -= dt) <= 0) { this.starT = 15 + Math.random() * 40; s.x = 0.3 + Math.random() * 0.6; s.y = 0.5 + Math.random() * 0.45; s.p = 0; }
    if (s.p >= 0) u.set(s.x - s.p * 0.25, s.y - s.p * 0.11, 0, Math.sin(s.p * Math.PI)); else u.w = 0;
  }

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.step(dt);
    this.post.render(this.renderer, this.scene, this.rig.cam);
    requestAnimationFrame(this.loop);
  };
}
