import * as THREE from 'three';
import { N, World, heightAt } from '../world/island';
import { PITCH, PX, U } from './shared';

export const ZOOMS = [1, 2, 3, 4];

/** Orthographic pixel-art camera: fixed tilt, 90° rotation steps, fixed zoom levels, snapped to the pixel grid. */
export class CameraRig {
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 400);
  target = new THREE.Vector3();
  yaw = 0; yawT = 0;
  zoomI = 1;
  W = 1; H = 1;
  private y = 0;
  private keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  onResize = () => {};

  constructor(private world: World, el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase(); this.keys.add(k);
      if (k === 'q') this.yawT -= Math.PI / 2;
      if (k === 'e') this.yawT += Math.PI / 2;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoomI + (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
    el.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const z = ZOOMS[this.zoomI], dx = (e.clientX - this.drag.x) / z * PX, dy = (e.clientY - this.drag.y) / z * PX / Math.sin(PITCH);
      this.drag = { x: e.clientX, y: e.clientY };
      this.pan(-dx, -dy);
    });
    el.addEventListener('pointerup', () => (this.drag = null));
  }

  get zoom() { return ZOOMS[this.zoomI]; }
  setZoom(i: number) { this.zoomI = Math.max(0, Math.min(ZOOMS.length - 1, i)); this.onResize(); }

  /** Pan in screen directions (right, down) by world units. */
  pan(right: number, down: number) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.target.x += right * c + down * s;
    this.target.z += -right * s + down * c;
    this.target.x = Math.max(20, Math.min(N - 20, this.target.x));
    this.target.z = Math.max(20, Math.min(N - 20, this.target.z));
  }

  jumpTo(x: number, z: number) { this.target.set(x, 0, z); this.y = heightAt(this.world, x, z); }

  update(dt: number) {
    const sp = 40 * dt * (4 / this.zoom);
    let r = 0, d = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) r -= sp;
    if (this.keys.has('arrowright') || this.keys.has('d')) r += sp;
    if (this.keys.has('arrowup') || this.keys.has('w')) d -= sp;
    if (this.keys.has('arrowdown') || this.keys.has('s')) d += sp;
    if (r || d) this.pan(r, d);
    this.yaw += (this.yawT - this.yaw) * Math.min(1, dt * 7);
    if (Math.abs(this.yawT - this.yaw) < 1e-3) this.yaw = this.yawT;
    // follow the ground height (sampled over an area so it does not jitter)
    let hs = 0; for (const [ox, oz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) hs += Math.max(0, heightAt(this.world, this.target.x + ox, this.target.z + oz));
    this.y += (hs / 5 - this.y) * Math.min(1, dt * 3);
    this.target.y = this.y;

    const w = this.W * PX / 2, h = this.H * PX / 2;
    const cam = this.cam;
    cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h; cam.updateProjectionMatrix();
    const t = this.target;
    cam.position.set(t.x + Math.sin(this.yaw) * Math.cos(PITCH) * 150, t.y + Math.sin(PITCH) * 150, t.z + Math.cos(this.yaw) * Math.cos(PITCH) * 150);
    cam.lookAt(t); cam.updateMatrixWorld();
    // snap to the pixel grid so the world does not shimmer while panning
    const e = cam.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2], ux = e[4], uy = e[5], uz = e[6];
    const pr = cam.position.x * rx + cam.position.y * ry + cam.position.z * rz, pu = cam.position.x * ux + cam.position.y * uy + cam.position.z * uz;
    const dr = Math.round(pr / PX) * PX - pr, du = Math.round(pu / PX) * PX - pu;
    cam.position.x += rx * dr + ux * du; cam.position.y += ry * dr + uy * du; cam.position.z += rz * dr + uz * du;
    cam.updateMatrixWorld();
    U.uCamRight.value.set(rx, ry, rz); U.uCamUp.value.set(ux, uy, uz);
  }
}
