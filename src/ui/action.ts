import { heightAt } from '../world/island';
import { RANGE, DRAW, Ring, judgeRing } from '../life/hands';
import { level } from '../life/jobs';
import type { Game } from '../game';
import type { Input } from './input';

const GOLD = '#c9a24a', INK = '#ebe7de', BAD = '#e08a70', OK = '#a8c98e';

/**
 * The leader's hands on screen: the throw arc while you hold a spear back, and timing rings
 * (click or Space when the closing ring meets the mark). Rings run on real time, so slow motion is fair.
 */
export class Action {
  private cv = document.createElement('canvas');
  private cx = this.cv.getContext('2d')!;
  private cur: { r: Ring; i: number; t: number; hits: number; perfect: number; res: string; resT: number } | null = null;

  constructor(private game: Game, private input: Input) {
    Object.assign(this.cv.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '6' });
    document.body.appendChild(this.cv);
    // while a ring is up, any click or Space is your move (and nothing else)
    addEventListener('pointerdown', e => { if (!this.cur) return; e.stopPropagation(); e.preventDefault(); this.hit(); }, true);
    addEventListener('keydown', e => {
      if (this.cur && (e.key === ' ' || e.key === 'Enter')) { e.stopImmediatePropagation(); e.preventDefault(); this.hit(); }
      else if (e.key === 'Escape' && game.group.hands.aim) { e.stopImmediatePropagation(); game.group.hands.cancel(); }
    }, true);
    game.every(dt => this.frame(dt));
  }

  /** How long a ring takes to close, and how wide the mark is. */
  private spec(r: Ring) {
    const lvl = level(this.game.group.hands.xp[r.skill]);
    return { D: 1.35 - r.hard * 0.5, w: 13 * (1 - r.hard * 0.45) * (1 + lvl * 0.15), R0: 120, Rt: 38 };
  }

  private hit() {
    const c = this.cur; if (!c || c.resT > 0) return;
    const { D, w, R0, Rt } = this.spec(c.r), rad = R0 * (1 - c.t / D), off = Math.abs(rad - Rt);
    this.judge(judgeRing(off, w));
  }
  private judge(res: string) {
    const c = this.cur!, ok = res !== 'MISS';
    if (ok) c.hits++; if (res === 'PERFECT') c.perfect++;
    c.res = res; c.resT = 0.45;
    c.r.beat?.(c.i, ok);
  }

  private frame(dt: number) {
    const g = this.game.group, H = g.hands, cv = this.cv, x = this.cx;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    x.clearRect(0, 0, cv.width, cv.height);
    if (!this.cur && H.rings.length) { this.cur = { r: H.rings.shift()!, i: 0, t: 0, hits: 0, perfect: 0, res: '', resT: 0 }; H.ring = true; }
    H.ring = !!this.cur;
    if (this.cur) this.drawRing(dt);
    if (H.aim) this.drawAim();
  }

  private drawRing(dt: number) {
    const c = this.cur!, x = this.cx, { D, w, R0, Rt } = this.spec(c.r);
    if (c.resT > 0) {
      if ((c.resT -= dt) <= 0) {
        c.i++; c.t = 0; c.res = '';
        if (c.i >= c.r.beats.length) { const r = c.r, h = c.hits, p = c.perfect; this.cur = null; this.game.group.hands.ring = false; r.done(h, p); return; }
      }
    } else if ((c.t += dt) > D * (1 - (Rt - w) / R0)) this.judge('MISS');   // the ring went past the mark
    // beside you (the camera keeps you in the middle), so you can watch yourself climb or fight
    const X = innerWidth / 2 + Math.min(240, innerWidth * 0.22), Y = innerHeight * 0.5;
    // the card behind it
    x.fillStyle = 'rgba(32,35,33,.7)'; x.beginPath(); x.arc(X, Y, R0 + 26, 0, 6.283); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const plate = (t: string, y: number, font: string, col: string) => {
      x.font = font; const tw = x.measureText(t).width + 28;
      x.fillStyle = 'rgba(32,35,33,.93)'; x.fillRect(X - tw / 2, y - 15, tw, 30); x.fillStyle = GOLD; x.fillRect(X - tw / 2, y - 15, 3, 30);
      x.fillStyle = col; x.fillText(t, X, y + 1);
    };
    plate(c.r.title, Y - R0 - 48, '500 18px Oswald, sans-serif', GOLD);
    plate(c.r.beats.map((_, i) => i < c.i ? '●' : i === c.i ? '◉' : '○').join('  ') + '   CLICK OR SPACE', Y + R0 + 48, '13px Oswald, sans-serif', '#9a9c97');
    // the mark: a band you want to click inside
    x.lineWidth = w * 2; x.strokeStyle = 'rgba(201,162,74,.28)'; x.beginPath(); x.arc(X, Y, Rt, 0, 6.283); x.stroke();
    x.lineWidth = 2; x.strokeStyle = GOLD; x.beginPath(); x.arc(X, Y, Rt, 0, 6.283); x.stroke();
    if (c.res) {
      x.font = '500 22px Oswald, sans-serif'; x.fillStyle = c.res === 'MISS' ? BAD : c.res === 'PERFECT' ? GOLD : OK; x.fillText(c.res, X, Y);
      return;
    }
    const rad = Math.max(0, R0 * (1 - c.t / D));
    x.lineWidth = 3; x.strokeStyle = Math.abs(rad - Rt) < w ? OK : INK; x.beginPath(); x.arc(X, Y, rad, 0, 6.283); x.stroke();
    x.font = '500 17px Oswald, sans-serif'; x.fillStyle = INK; x.fillText(c.r.beats[c.i], X, Y);
  }

  /** A dotted arc from you to where the spear will come down; red at the end if it's out of reach. */
  private drawAim() {
    const g = this.game.group, A = g.hands.aim!, L = g.leader!, w = this.game.world, x = this.cx;
    const power = Math.min(1, A.t / DRAW), reach = 4 + (RANGE - 4) * power;
    const dx = A.x - L.x, dz = A.z - L.z, want = Math.hypot(dx, dz) || 1, d = Math.min(want, reach);
    const ex = L.x + dx / want * d, ez = L.z + dz / want * d, y0 = heightAt(w, L.x, L.z) + 1.3, y1 = Math.max(0, heightAt(w, ex, ez)) + 0.2;
    x.fillStyle = want > reach ? BAD : INK;
    for (let i = 1; i <= 16; i++) {
      const s = i / 16, p = this.input.screen(L.x + (ex - L.x) * s, y0 + (y1 - y0) * s + Math.sin(Math.PI * s) * d * 0.22, L.z + (ez - L.z) * s);
      x.globalAlpha = 0.35 + 0.65 * s; x.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    x.globalAlpha = 1;
    const e = this.input.screen(ex, y1, ez); x.strokeStyle = want > reach ? BAD : GOLD; x.lineWidth = 2; x.beginPath(); x.arc(e.x, e.y, 7 + (1 - power) * 10, 0, 6.283); x.stroke();
    // how far back the spear is drawn
    const me = this.input.screen(L.x, heightAt(w, L.x, L.z), L.z), z = this.game.rig.zoom;
    x.fillStyle = 'rgba(32,35,33,.85)'; x.fillRect(me.x - 22, me.y + 6 * z, 44, 6);
    x.fillStyle = power >= 1 ? GOLD : INK; x.fillRect(me.x - 21, me.y + 6 * z + 1, 42 * power, 4);
  }
}
