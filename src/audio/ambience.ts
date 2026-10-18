import { B, N, World, heightAt } from '../world/island';

/**
 * Zoned, generated ambience. Beds (waves, wind, rain, river, insects, rumble) fade with where the camera is;
 * creatures (birds, gulls, parrots, frogs, crickets, owls) are one-off randomized calls, never a loop.
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private beds: Record<string, GainNode> = {};
  private zone = { coast: 0, jungle: 0, grass: 0, swamp: 0, high: 0, river: 0, spring: 0, volcano: 0, water: 0 };
  private zoneT = 0;
  private muted = false;
  private waveT = 0;

  constructor(private w: World) {
    const start = () => { this.init(); removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start); addEventListener('keydown', start);
  }

  setMuted(m: boolean) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.2); }

  private init() {
    if (this.ctx) return;
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const bed = (name: string, type: BiquadFilterType, f: number, q = 0.7, f2?: [BiquadFilterType, number]) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = Math.random();
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      let tail: AudioNode = fl;
      if (f2) { const f3 = ctx.createBiquadFilter(); f3.type = f2[0]; f3.frequency.value = f2[1]; fl.connect(f3); tail = f3; }
      const g = ctx.createGain(); g.gain.value = 0; src.connect(fl); tail.connect(g); g.connect(this.master); src.start();
      this.beds[name] = g;
      return fl;
    };
    bed('waves', 'lowpass', 520); bed('wind', 'bandpass', 520, 0.6); bed('rain', 'highpass', 1600, 0.5, ['lowpass', 7000]);
    // river: a lower, burbling rush (filter wobbles) instead of flat hiss
    const rf = bed('river', 'bandpass', 800, 1.1), wob = ctx.createOscillator(), wg = ctx.createGain();
    wob.frequency.value = 0.7; wg.gain.value = 260; wob.connect(wg); wg.connect(rf.frequency); wob.start();
    bed('rumble', 'lowpass', 70); bed('cicada', 'bandpass', 5200, 8);
    // cicada tremolo
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 23; lg.gain.value = 0.5; lfo.connect(lg);
    const trem = ctx.createGain(); this.beds.cicada.disconnect(); this.beds.cicada.connect(trem); trem.connect(this.master); lg.connect(trem.gain); lfo.start();
  }

  /** Called every frame with what is around the camera. */
  update(dt: number, x: number, z: number, viewR: number, hour: number, night: number, rain: number, wind: number, zoomedOut: number) {
    const ctx = this.ctx; if (!ctx) return;
    if ((this.zoneT -= dt) <= 0) { this.zoneT = 0.4; this.sample(x, z, viewR); }
    const Z = this.zone, now = ctx.currentTime, day = 1 - night, near = 1 - zoomedOut * 0.35;
    const set = (k: string, v: number) => this.beds[k].gain.setTargetAtTime(Math.max(0, v), now, 0.6);
    set('wind', (0.04 + Z.high * 0.12 + wind * 0.32) * (0.7 + Z.coast * 0.3));
    set('rain', rain * 0.45);
    set('river', Z.river * 0.3 * near);
    set('rumble', Z.volcano * 0.5 + rain * wind * 0.25);
    set('cicada', Z.jungle * day * 0.05 * (1 - rain) * near);
    set('waves', Z.coast * 0.06);
    // waves come in as swells
    if ((this.waveT -= dt) <= 0) {
      this.waveT = 3.5 + Math.random() * 4;
      const g = this.beds.waves.gain, peak = Z.coast * (0.35 + wind * 0.3) * near;
      g.cancelScheduledValues(now); g.setTargetAtTime(peak, now, 0.8); g.setTargetAtTime(Z.coast * 0.06, now + 1.6, 1.2);
    }
    // creature calls (rates per second, scaled by zone and time of day)
    const ev = (rate: number, fn: () => void) => { if (Math.random() < rate * dt) fn(); };
    const calm = (1 - rain * 0.8) * near;
    ev(day * (Z.jungle * 1.6 + Z.grass * 0.7) * calm, () => this.chirp());
    ev(day * Z.jungle * 0.25 * calm, () => this.parrot());
    ev(day * Z.coast * 0.35 * calm, () => this.gull());
    ev((night * (Z.jungle + Z.grass + Z.swamp) * 2.2 + Z.swamp * 0.3) * calm, () => this.cricket());
    ev((Z.swamp * 1.4 + Z.river * 0.4) * (0.3 + night) * calm, () => this.frog());
    ev(night * Z.jungle * 0.05 * calm, () => this.owl());
    ev(Z.spring * 3, () => this.bubble());
    void hour;
  }

  thunder(dist: number) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + Math.min(3, dist / 40), src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; const g = ctx.createGain();
    const v = 0.9 / (1 + dist / 60);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 3.6);
  }

  private sample(x: number, z: number, viewR: number) {
    const w = this.w, Z = { coast: 0, jungle: 0, grass: 0, swamp: 0, high: 0, river: 0, spring: 0, volcano: 0, water: 0 };
    const n = 25, r = viewR * 0.55;
    let river = 99;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283, rr = i === 0 ? 0 : r * (0.35 + (i % 3) * 0.32);
      const sx = Math.max(0, Math.min(N - 1, x + Math.cos(a) * rr)), sz = Math.max(0, Math.min(N - 1, z + Math.sin(a) * rr));
      const k = (sz | 0) * N + (sx | 0), b = w.biome[k];
      if (b === B.Ocean || b === B.Beach || b === B.Lagoon || b === B.Reef || b === B.TideRock) Z.coast++;
      if (b === B.Jungle || b === B.Bamboo) Z.jungle++;
      if (b === B.Grass || b === B.Flowers) Z.grass++;
      if (b === B.Swamp) Z.swamp++;
      if (b === B.Highland || b === B.Volcanic) Z.high++;
      if (i === 0) river = w.riverDist[k];
    }
    for (const k of ['coast', 'jungle', 'grass', 'swamp', 'high'] as const) Z[k] /= n;
    Z.river = Math.max(0, 1 - river / 14) ** 2;   // only right beside the water
    for (const l of w.landmarks) if (l.kind === 'hotSpring' || l.kind === 'steamVent') Z.spring = Math.max(Z.spring, Math.max(0, 1 - Math.hypot(l.x - x, l.z - z) / 25));
    Z.volcano = Math.max(0, 1 - Math.hypot(w.volcano.x - x, w.volcano.z - z) / (w.volcano.r * 0.45)) * (heightAt(w, x, z) > 15 ? 1 : 0.5);
    this.zone = Z;
  }

  // ---------- people ----------
  whistle() { const t = this.ctx?.currentTime; if (t === undefined) return; this.tone('sine', t, 0.18, 1900, 2300, 0.08, 0); this.tone('sine', t + 0.22, 0.32, 2300, 1700, 0.08, 0); }
  alarm() { const t = this.ctx?.currentTime; if (t === undefined) return; for (let i = 0; i < 3; i++) this.tone('square', t + i * 0.16, 0.12, 660, 640, 0.03, 0); }
  chime(big: boolean) {
    const t = this.ctx?.currentTime; if (t === undefined) return;
    const notes = big ? [392, 494, 587, 784, 988] : [587, 784, 988];
    notes.forEach((f, i) => this.tone('triangle', t + i * (big ? 0.14 : 0.09), big ? 1.6 : 0.5, f, f, big ? 0.05 : 0.04, 0));
    if (big) for (const f of [196, 247, 294]) this.tone('sine', t, 2.8, f, f, 0.035, 0);
  }
  /** Speech: a few murmured blips at the speaker's pitch. */
  /** Someone wants your attention: a little "hey!" */
  attention() { const t = this.ctx?.currentTime; if (t === undefined) return; this.tone('triangle', t, 0.12, 660, 700, 0.05, 0); this.tone('triangle', t + 0.14, 0.2, 880, 940, 0.05, 0); }
  /** How an idea turned out. */
  sting(good: boolean) {
    const t = this.ctx?.currentTime; if (t === undefined) return;
    const n = good ? [523, 659, 784, 1047] : [392, 370, 349, 262];
    n.forEach((f, i) => this.tone(good ? 'triangle' : 'square', t + i * 0.11, good ? 0.35 : 0.22, f, f, good ? 0.045 : 0.025, 0));
  }
  /** Something dropped on the pile. */
  clunk() { const t = this.ctx?.currentTime; if (t === undefined) return; this.tone('sine', t, 0.08, 180, 90, 0.08, 0); this.tone('square', t + 0.02, 0.04, 320, 200, 0.015, 0); }
  blip(voice: number) {
    const t = this.ctx?.currentTime; if (t === undefined) return;
    const n = 3 + ((Math.random() * 4) | 0), pan = (Math.random() - 0.5) * 0.6;
    for (let i = 0; i < n; i++) { const f = 260 * voice * (0.85 + Math.random() * 0.4); this.tone('square', t + i * 0.075, 0.05, f, f * 0.9, 0.012, pan); }
  }
  private lifeT = 0;
  /** Campfire crackle near the fire, torch crackle at night, footsteps while walking. */
  life(fireDist: number, torches: boolean, walking: boolean) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const dt = 1 / 60; this.lifeT += dt;
    const fire = Math.max(0, 1 - fireDist / 30);
    if (Math.random() < dt * (fire * 9 + (torches ? 2.5 : 0))) this.crack(0.03 + fire * 0.05);
    if (walking && this.lifeT > 0.36) { this.lifeT = 0; this.crack(0.018, 500 + Math.random() * 300, 0.05); }
  }
  private crack(vol: number, freq = 2500 + Math.random() * 2500, dur = 0.03) {
    const ctx = this.ctx!, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random() * 2); src.stop(t + dur + 0.01);
  }

  // ---------- creature voices ----------
  private tone(type: OscillatorType, t: number, dur: number, f0: number, f1: number, vol: number, pan = (Math.random() - 0.5) * 1.4) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    p.pan.value = pan; o.connect(g); g.connect(p); p.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private chirp() {
    const t = this.ctx!.currentTime, species = (Math.random() * 4) | 0, n = 2 + ((Math.random() * 5) | 0), base = [2600, 3400, 4200, 1900][species], pan = (Math.random() - 0.5) * 1.6;
    for (let i = 0; i < n; i++) {
      const s = t + i * [0.09, 0.14, 0.07, 0.22][species];
      if (species === 3) this.tone('sine', s, 0.18, base * 1.2, base * 0.9, 0.035, pan);
      else this.tone('sine', s, 0.06, base * (1 + Math.random() * 0.3), base * (species === 1 ? 0.7 : 1.4), 0.03, pan);
    }
  }
  private parrot() { const t = this.ctx!.currentTime, pan = (Math.random() - 0.5) * 1.6; for (let i = 0; i < 2; i++) this.tone('sawtooth', t + i * 0.2, 0.14, 1500, 900, 0.025, pan); }
  private gull() { const t = this.ctx!.currentTime, pan = (Math.random() - 0.5) * 1.6; for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) this.tone('triangle', t + i * 0.32, 0.28, 1300, 700, 0.04, pan); }
  private cricket() { const t = this.ctx!.currentTime, pan = (Math.random() - 0.5) * 1.8, f = 4200 + Math.random() * 900; for (let i = 0; i < 3; i++) this.tone('sine', t + i * 0.055, 0.035, f, f, 0.018, pan); }
  private frog() { const t = this.ctx!.currentTime, pan = (Math.random() - 0.5) * 1.6, f = 140 + Math.random() * 120; for (let i = 0; i < 1 + (Math.random() * 3 | 0); i++) this.tone('sawtooth', t + i * 0.22, 0.13, f, f * 0.8, 0.05, pan); }
  private owl() { const t = this.ctx!.currentTime, pan = (Math.random() - 0.5); this.tone('sine', t, 0.35, 420, 380, 0.05, pan); this.tone('sine', t + 0.5, 0.55, 430, 360, 0.05, pan); }
  private bubble() { const t = this.ctx!.currentTime, f = 250 + Math.random() * 350; this.tone('sine', t, 0.06, f, f * 2.2, 0.025); }
}
