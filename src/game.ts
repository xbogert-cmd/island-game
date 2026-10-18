import * as THREE from 'three';
import { World, heightAt } from './world/island';
import { CameraRig } from './render/camera';
import { Post } from './render/post';
import { Sky } from './render/sky';
import { Terrain, uploadWorldTextures } from './render/terrain';
import { Water } from './render/water';
import { Vegetation } from './render/vegetation';
import { buildProps, PropsOut } from './render/props';
import { Camp3D, SOLID } from './render/camp3d';
import { WeatherFx } from './render/weatherfx';
import { SpriteBatch, buildAtlas } from './render/sprites';
import { PITCH, PX, U } from './render/shared';
import { Clock } from './sim/clock';
import { Weather } from './sim/weather';
import { Group } from './life/group';
import { BUILD } from './life/buildings';
import { ATLAS } from './render/sprites';
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
  camp3d: Camp3D;
  fx: WeatherFx;
  group: Group;
  /** person the camera follows instead of the leader (set from the UI) */
  camWho: import('./life/people').Person | null = null;
  wildlife: Wildlife;
  particles: Particles;
  private batch: SpriteBatch;
  private falls: { x: number; y: number; z: number }[] = [];
  private starT = 20;
  private star = { x: 0, y: 0, p: -1 };
  private last = performance.now();
  private onFrame: ((dt: number) => void)[] = [];
  viewR = 60;
  private tally: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; days: number };

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
    this.group = new Group(world, this.clock, this.weather, this.particles);
    this.camp3d = new Camp3D(world, this.group.fire);
    this.scene.add(new Terrain(world).group, new Water(world).group, this.veg.group, this.props.group, this.camp3d.group, this.fx.group, this.batch.mesh, this.group.bodies.batch.mesh, this.group.bodies.batch.silhouette(), ...this.group.bodies.lights);
    for (const r of world.rivers) for (const k of r.falls) { const p = r.pts[Math.min(r.pts.length - 1, k + 1)]; this.falls.push({ x: p.x, y: p.y, z: p.z }); }
    this.sky = new Sky(this.scene);
    this.tally = this.makeTally();
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
    // the scene renders at low res; the final pass runs at screen res so outlines can be 1 px thin
    this.renderer.setSize(W * z, H * z, false);
    Object.assign(this.canvas.style, { width: W * z + 'px', height: H * z + 'px' });
    this.post.setSize(W, H, W * z, H * z);
    this.rig.W = W; this.rig.H = H;
  }

  step(rdt: number) {
    const clock = this.clock, wx = this.weather;
    const g = this.group, live = !!g.leader, ts = g.timeScale;
    const dt = rdt * (clock.speed || 0) * ts;     // world time (pauses with the clock, slows for first sightings)
    if (live) clock.tick(rdt * ts);
    const who = this.camWho && this.camWho.mode !== 'camp' ? this.camWho : g.leader;
    if (!this.camWho || who !== this.camWho) this.camWho = null;
    this.rig.follow = g.focus && g.leader ? { x: (g.focus.x + g.leader.x * 0.2) / 1.2, z: (g.focus.z + g.leader.z * 0.2) / 1.2 } : who;
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
    g.update(dt);
    if (live) this.drawTally(clock.day);
    this.batch.begin();
    g.bodies.draw(this.batch, night, { ...g.fire, lit: Math.max(0, 1 - wx.rain * 0.8) }, t);
    this.drawLife(t);
    this.wildlife.update(dt, t, this.viewR, night, g.people, wx.rain);
    this.particles.draw();
    this.batch.end();
    for (const f of this.onFrame) f(rdt);
  }

  private ambientParticles(dt: number, t: THREE.Vector3) {
    const wx = this.weather, P = this.particles, near = (x: number, z: number) => Math.abs(x - t.x) < this.viewR * 1.2 && Math.abs(z - t.z) < this.viewR * 1.4;
    for (const s of this.props.steam) if (near(s.x, s.z) && Math.random() < dt * s.rate) {
      P.emit(Math.random() < 0.5 ? 'puff' : 'puff6', s.x + (Math.random() - 0.5) * 1.5, s.y, s.z + (Math.random() - 0.5) * 1.5, { vy: 1 + Math.random(), vx: U.uWindDir.value.x * (0.3 + wx.wind * 2), vz: U.uWindDir.value.y * (0.3 + wx.wind * 2), max: 3 + Math.random() * 2, r: 0.95, g: 0.97, b: 1, a: 0.55 });
    }
    // the volcano waking: a smoke plume that thickens day by day
    const rum = this.group.village.rumble, V = this.world.volcano;
    if (rum > 0 && Math.abs(V.x - t.x) < this.viewR * 2.5 && Math.abs(V.z - t.z) < this.viewR * 2.5 && Math.random() < dt * rum * 0.6) {
      P.emit(Math.random() < 0.5 ? 'puff' : 'puff6', V.x + (Math.random() - 0.5) * 4, heightAt(this.world, V.x, V.z) + 3, V.z + (Math.random() - 0.5) * 4, { vy: 2 + Math.random() * 2, vx: U.uWindDir.value.x * (0.6 + wx.wind * 3), vz: U.uWindDir.value.y * (0.6 + wx.wind * 3), max: 6 + Math.random() * 4, r: 0.55, g: 0.55, b: 0.58, a: 0.6 });
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

  /** Scratches on the side of the fuselage, one per day. */
  private makeTally() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const f = this.world.landmarks.find(l => l.kind === 'fuselage')!;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    const g = new THREE.Group(); g.position.set(f.x, heightAt(this.world, f.x, f.z), f.z); g.rotation.y = -f.rot;
    m.position.set(-1, 2.1, 1.33); m.rotation.x = -0.62; g.add(m); this.scene.add(g);    // tangent to the upper side of the hull
    const back = m.clone(); back.position.z = -1.33; back.rotation.set(0.62, Math.PI, 0); g.add(back);
    return { ctx: c.getContext('2d')!, tex, days: 0 };
  }
  private drawTally(days: number) {
    const t = this.tally; if (t.days === days) return;
    t.days = days; const g = t.ctx; g.clearRect(0, 0, 64, 8); g.fillStyle = '#3a2a22';
    for (let d = 0; d < Math.min(days, 30); d++) {
      const grp = Math.floor(d / 5), k = d % 5, x = 2 + grp * 10 + k * 2;
      if (k === 4) { for (let i = 0; i < 8; i++) g.fillRect(x - 8 + i, 7 - i, 1, 1); } else g.fillRect(x, 1, 1, 6);
    }
    t.tex.needsUpdate = true;
  }

  /** Food spots, clues, rumor markers and scout trails. */
  private drawLife(t: THREE.Vector3) {
    const g = this.group, b = this.batch, R = this.viewR * 1.3, w = this.world, tt = U.uTime.value;
    const near = (x: number, z: number, m = 0) => Math.abs(x - t.x) < R + m && Math.abs(z - t.z) < R * 1.2 + m;
    for (const p of g.disc.pois) if (p.sprite && near(p.x, p.z)) {
      if (p.kind === 'clue' && p.known) continue;
      b.push(p.x, heightAt(w, p.x, p.z) - 0.05, p.z, ATLAS[p.sprite][0]);
    }
    for (const m of g.disc.markers) {
      if (!near(m.x, m.z, m.r)) continue;
      const red = m.kind === '!', n = Math.max(10, Math.round(m.r * 1.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + tt * 0.05, x = m.x + Math.cos(a) * m.r, z = m.z + Math.sin(a) * m.r;
        b.push(x, Math.max(heightAt(w, x, z), U.uTide.value) + 0.05, z, ATLAS.dot2[0], false, red ? 1 : 1, red ? 0.35 : 0.9, red ? 0.3 : 0.4, 2, true);
      }
      const y = Math.max(heightAt(w, m.x, m.z), U.uTide.value) + 2.5 + Math.sin(tt * 2.5) * 0.25;
      b.push(m.x, y, m.z, ATLAS[red ? 'xMark' : 'qMark'][0], false, 1, 1, 1, 2);
    }
    this.drawPaths(t);
    this.camp3d.sync(g.camp.list);
    this.drawCamp(near);
    this.drawCat(near);
    for (const tr of g.scouting.trips) for (let i = 0; i < tr.trail.length; i += 1) {
      const q = tr.trail[i]; if (!near(q.x, q.z)) continue;
      b.push(q.x, heightAt(w, q.x, q.z) + 0.06, q.z, ATLAS.dot2[0], false, 1, 0.95, 0.75, 2, true);
    }
  }

  /** The food and water pile by the fire (one heap per kind, size = how much), and what people built. */
  private drawCamp(near: (x: number, z: number) => boolean) {
    const g = this.group, st = g.stock, b = this.batch, w = this.world, rr = U.uCamRight.value, yUp = g.bodies.yUp, tt = U.uTime.value;
    const P = st.pile;
    if (near(P.x, P.z)) {
      const heaps = ([['pSnack', st.food.snacks], ['pFruit', st.food.fruit], ['pCoco', st.food.coconut], ['pShell', st.food.shell], ['pFish', st.food.fish], ['pJug', st.water]] as [string, number][]).filter(h => h[1] > 0);
      const gy = heightAt(w, P.x, P.z);
      heaps.forEach(([spr, n], hi) => {
        const cx = (hi - (heaps.length - 1) / 2) * 1.75;
        let k = Math.min(10, Math.ceil(n / 2)), row = 0;
        while (k > 0) {
          const len = Math.min(k, 4 - row);
          for (let j = 0; j < len; j++) {
            const dx = cx + (j - (len - 1) / 2) * 0.42;
            b.push(P.x + rr.x * dx, gy + row * 3 * yUp, P.z + rr.z * dx, ATLAS[spr][0]);
          }
          k -= len; row++;
          if (row > 3) break;
        }
      });
    }
    // building materials in their own yard, a few steps further from the fire
    const F = g.fire, ml = Math.hypot(P.x - F.x, P.z - F.z) || 1, M = { x: P.x + (P.x - F.x) / ml * 4, z: P.z + (P.z - F.z) / ml * 4 };
    if (near(M.x, M.z)) {
      const heaps = ([['hLog', st.mat.wood], ['hBamboo', st.mat.bamboo], ['hStone', st.mat.stone], ['hVine', st.mat.vines], ['hScrap', st.mat.scrap]] as [string, number][]).filter(h => h[1] > 0);
      const gy = heightAt(w, M.x, M.z);
      heaps.forEach(([spr, n], hi) => {
        const cx = (hi - (heaps.length - 1) / 2) * 1.75;
        let k = Math.min(10, Math.ceil(n / 2)), row = 0;
        while (k > 0 && row < 4) {
          const len = Math.min(k, 4 - row);
          for (let j = 0; j < len; j++) { const dx = cx + (j - (len - 1) / 2) * 0.5; b.push(M.x + rr.x * dx, gy + row * 2.5 * yUp, M.z + rr.z * dx, ATLAS[spr][0]); }
          k -= len; row++;
        }
      });
    }
    const night = this.clock.night, lit = night > 0.3 && this.weather.rain < 0.5;
    const flames = (x: number, y: number, z: number, n: number, spread: number) => {
      for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * spread * PX; b.push(x + rr.x * dx, y + (i % 2 ? 2 : 0) * yUp, z + rr.z * dx, ATLAS.flame[Math.floor(tt * 9 + i) % 3], false, 1, 1, 1, 2); }
      if (Math.random() < 0.12) this.particles.emit('dot1', x + (Math.random() - 0.5) * 0.6, y + 0.4, z, { vy: 2.5, vx: (Math.random() - 0.5), max: 1, r: 1, g: 0.65, b: 0.25, emissive: true, fade: false });
      if (Math.random() < 0.06) this.particles.emit('puff', x, y + 1, z, { vy: 1.4, vx: U.uWindDir.value.x * 2, vz: U.uWindDir.value.y * 2, max: 3, r: 0.6, g: 0.6, b: 0.62, a: 0.6 });
    };
    for (const q of g.crew.edge) if (near(q.x, q.z)) b.push(q.x, heightAt(w, q.x, q.z) - 0.05, q.z, ATLAS.edgePost[0]);
    for (const bd of g.camp.list) {
      if (!near(bd.x, bd.z)) continue;
      const gy = heightAt(w, bd.x, bd.z);
      if (bd.kind === 'traps') {
        for (const q of bd.posts ?? []) if (bd.progress >= 1) b.push(q.x, heightAt(w, q.x, q.z) + 0.04, q.z, ATLAS.pit[0], false, 1, 1, 1, 1, true); else b.push(q.x, heightAt(w, q.x, q.z) - 0.05, q.z, ATLAS.stakes[0]);
        continue;
      }
      if (bd.kind === 'fence') {
        const posts = bd.posts ?? [], n = Math.floor(bd.progress * posts.length);
        posts.forEach((q, i) => { if (i < n) b.push(q.x, heightAt(w, q.x, q.z) - 0.05, q.z, ATLAS.fencePost[0]); else if (i < n + 3 && bd.progress > 0) b.push(q.x, heightAt(w, q.x, q.z) - 0.05, q.z, ATLAS.stakes[0]); });
        continue;
      }
      if (SOLID.has(bd.kind)) continue;
      const flat = BUILD[bd.kind].flat, fr = ATLAS[bd.kind], R0 = fr[Math.floor(tt * 2) % fr.length];
      if (bd.progress >= 1) b.push(bd.x, gy + (flat ? 0.04 : -0.05), bd.z, R0, false, 1, 1, 1, 1, flat);
      else {
        // going up: stakes first, then it rises out of the ground
        b.push(bd.x, gy - 0.05, bd.z, ATLAS.stakes[0]);
        if (bd.progress > 0.05) { const hh = Math.max(1, Math.round(R0.h * Math.min(1, 0.15 + bd.progress))); b.push(bd.x, gy + (flat ? 0.04 : -0.05), bd.z, { x: R0.x, y: R0.y + R0.h - hh, w: R0.w, h: hh }, false, 1, 1, 1, 1, flat); }
        continue;
      }
      if (lit && (bd.kind === 'signalFire' || bd.kind === 'watchFire')) flames(bd.x, gy + (bd.kind === 'watchFire' ? 16 : 3) * yUp, bd.z, 3, 2.5);
      if (lit && bd.kind === 'beacon') flames(bd.x, gy + 29 * yUp, bd.z, 5, 2.5);
    }
  }

  /** Worn paths: dirt where people walk every day. */
  private drawPaths(t: THREE.Vector3) {
    const wear = this.group.bodies.wear, b = this.batch, w = this.world, R = this.viewR * 1.2;
    const x0 = Math.max(0, Math.floor((t.x - R) / 4)), x1 = Math.min(191, Math.floor((t.x + R) / 4)), z0 = Math.max(0, Math.floor((t.z - R * 1.2) / 4)), z1 = Math.min(191, Math.floor((t.z + R * 1.2) / 4));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const v = wear[j * 192 + i]; if (v < 12) continue;
      const x = i * 4 + 2, z = j * 4 + 2;
      b.push(x, heightAt(w, x, z) + 0.03, z, ATLAS.pathTile[0], false, 0.8, 0.68, 0.5, Math.min(0.85, (v - 12) / 30), true);
    }
  }

  /** The cat, its eyes in the dark, its tracks. Flags on huts, the trophy, graves. */
  private drawCat(near: (x: number, z: number) => boolean) {
    const g = this.group, C = g.cat, b = this.batch, w = this.world, tt = U.uTime.value, yUp = g.bodies.yUp, rr = U.uCamRight.value;
    C.paws.forEach((p, i) => { if (near(p.x, p.z)) b.push(p.x + (i % 2 ? 0.3 : -0.3), heightAt(w, p.x, p.z) + 0.03, p.z, ATLAS.paw[0], false, 1, 1, 1, Math.min(1, p.t / 60), true); });
    if ((C.visible || C.eyes) && near(C.x, C.z)) {
      const gy = heightAt(w, C.x, C.z);
      if (C.visible) b.push(C.x, gy - 0.05, C.z, ATLAS.cat[C.moving ? Math.floor(tt * 8) % 2 : 0], C.face < 0);
      if (C.eyes && this.clock.night > 0.4 && Math.sin(tt * 1.3) > -0.85) b.push(C.x + rr.x * C.face * 6 * PX, gy + 6 * yUp, C.z + rr.z * C.face * 6 * PX, ATLAS.eyes[0], false, 1, 1, 0.6, 2);
    }
    for (const h of g.camp.list) {
      if (h.kind !== 'hut' || h.progress < 1 || !h.owners.length || !near(h.x, h.z)) continue;
      const o = g.people[h.owners[0]], c = o.per.look.shirt, gy = heightAt(w, h.x, h.z);
      b.push(h.x, gy + 2.75, h.z, ATLAS.flag[Math.floor(tt * 2 + h.id) % 2], false, parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255, 1);
    }
    // the camp's animals
    const A = g.animals, d = A.dog;
    if (d.phase !== 'none' && d.x >= 0 && near(d.x, d.z)) b.push(d.x, heightAt(w, d.x, d.z) - 0.05, d.z, d.moving ? ATLAS.dog[Math.floor(tt * 8) % 2] : ATLAS.dogSit[0], d.face < 0);
    for (const [list, spr] of [[A.goats, 'goat'], [A.chickens, 'chicken']] as const) for (const a of list) if (near(a.x, a.z)) b.push(a.x, heightAt(w, a.x, a.z) - 0.05, a.z, ATLAS[spr][a.moving ? Math.floor(tt * 6) % 2 : 0], a.face < 0);
    if (A.parrot && near(A.parrot.x, A.parrot.z)) { const P = A.parrot, gy = heightAt(w, P.x, P.z); b.push(P.x, gy - 0.05, P.z, ATLAS.fencePost[0]); b.push(P.x, gy + 12 * yUp, P.z, ATLAS.pet[Math.floor(tt * 1.5) % 2]); }
    if (C.phase === 'dead' && g.leader) {
      const h = g.camp.hutOf(g.leader.id), at = h ? { x: h.x + rr.x * 2.6, z: h.z + rr.z * 2.6 } : { x: g.fire.x + 4, z: g.fire.z - 4 };
      if (near(at.x, at.z)) b.push(at.x, heightAt(w, at.x, at.z) - 0.05, at.z, ATLAS.catHide[0]);
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
