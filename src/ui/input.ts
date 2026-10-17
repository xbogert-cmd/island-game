import * as THREE from 'three';
import { heightAt } from '../world/island';
import { U } from '../render/shared';
import type { Game } from '../game';
import type { Person } from '../life/people';

/**
 * The whole control scheme: left-click = go / pick a person, right-click = whistle.
 * Dragging still pans (handled by the camera rig); a drag is never a click.
 */
export class Input {
  hover: Person | null = null;
  mx = -1e4; my = -1e4;
  onPerson: (p: Person) => void = () => {};
  private v = new THREE.Vector3();

  constructor(private game: Game, el: HTMLCanvasElement) {
    el.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || game.rig.dragged) return;
      const g = game.group; if (!g.leader) return;
      const p = this.pick(e.clientX, e.clientY);
      if (p && !g.scoutPick) { if (p === g.leader) g.toggleWait(); else this.onPerson(p); return; }
      const sc = g.scoutPick ? null : this.trailAt(e.clientX, e.clientY);
      if (sc) { game.camWho = sc; game.rig.followOn = true; return; }
      const q = this.ground(e.clientX, e.clientY);
      if (q) { g.clickGround(q.x, q.z); game.rig.followOn = true; this.ping(q.x, q.z); }
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); game.group.whistle(); });
    el.addEventListener('pointermove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      this.hover = game.group.leader ? this.pick(e.clientX, e.clientY) : null;
      el.style.cursor = game.group.scoutPick ? 'crosshair' : this.hover || this.trailAt(e.clientX, e.clientY) ? 'pointer' : 'default';
    });
  }

  /** A scout whose dotted trail is under the cursor: clicking it follows them. */
  private trailAt(cx: number, cy: number): Person | null {
    const w = this.game.world;
    for (const t of this.game.group.scouting.trips) for (const q of t.trail) {
      const s = this.screen(q.x, heightAt(w, q.x, q.z), q.z);
      if (Math.abs(s.x - cx) < 8 && Math.abs(s.y - cy) < 8) return t.p;
    }
    return null;
  }

  /** Little ring where you clicked. */
  private ping(x: number, z: number) {
    const y = Math.max(heightAt(this.game.world, x, z), U.uTide.value) + 0.05;
    this.game.particles.emit('ring', x, y, z, { flat: true, max: 0.5, emissive: true, r: 1, g: 1, b: 0.8 });
  }

  /** Screen position (CSS px) of a world point. */
  screen(x: number, y: number, z: number) {
    const c = this.game.canvas.getBoundingClientRect();
    this.v.set(x, y, z).project(this.game.rig.cam);
    return { x: c.left + (this.v.x + 1) / 2 * c.width, y: c.top + (1 - this.v.y) / 2 * c.height };
  }

  pick(cx: number, cy: number): Person | null {
    const z = this.game.rig.zoom, w = this.game.world;
    let best: Person | null = null, bd = 1e9;
    for (const p of this.game.group.people) {
      const s = this.screen(p.x, heightAt(w, p.x, p.z), p.z);
      const dx = cx - s.x, dy = s.y - cy;
      if (Math.abs(dx) < 6 * z && dy > -3 * z && dy < 18 * z) { const d = Math.abs(dx) + Math.abs(dy - 8 * z); if (d < bd) { bd = d; best = p; } }
    }
    return best;
  }

  /** Where a screen point hits the ground. */
  ground(cx: number, cy: number): { x: number; z: number } | null {
    const c = this.game.canvas.getBoundingClientRect(), cam = this.game.rig.cam, w = this.game.world;
    const o = new THREE.Vector3((cx - c.left) / c.width * 2 - 1, 1 - (cy - c.top) / c.height * 2, -1).unproject(cam);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const below = (t: number) => { const y = o.y + d.y * t; return y <= Math.max(heightAt(w, o.x + d.x * t, o.z + d.z * t), U.uTide.value); };
    let a = 0, b = 0;
    for (let t = 0; t < 900; t += 0.5) if (below(t)) { b = t; a = t - 0.5; break; }
    if (!b) return null;
    for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; }
    return { x: o.x + d.x * b, z: o.z + d.z * b };
  }
}
