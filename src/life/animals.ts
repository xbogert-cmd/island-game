import { has } from './persona';
import { Person, Pt } from './people';
import { CAMP_R } from './crew';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
export interface Beast { x: number; z: number; tx: number; tz: number; t: number; face: number; moving: boolean }

/**
 * Animals the camp takes in: a stray dog that becomes the camp dog, goats in a pen, chickens in a coop,
 * and a parrot that learns what people say.
 */
export class Animals {
  dog = { phase: 'none' as 'none' | 'wild' | 'asked' | 'feeding' | 'tame', fed: 0, name: '', back: 0, x: -1, z: -1, face: 1, moving: false, seen: false };
  goats: Beast[] = [];
  chickens: Beast[] = [];
  parrot: { name: string; owner: number; x: number; z: number; t: number } | null = null;
  asked = { goats: 0, chickens: 0 };
  private barkNight = -1; private sniffT = 40; private goatDays = 0;
  /** stands in for the parrot when it talks */
  private bird = { x: 0, z: 0, per: { voice: 1.9, name: 'the parrot' } } as unknown as Person;

  constructor(private g: Group) {}

  // ------------------------------------------------------------------ dawn

  dawn() {
    const g = this.g, S = g.story, day = g.clock.day, d = this.dog;
    if (g.era === 'crash') return;
    // the stray
    if (d.phase === 'none' && day >= 6) d.phase = 'wild';
    if (d.phase === 'wild' && d.seen && day >= d.back) this.askDog();
    if (d.phase === 'feeding') {
      if (g.stock.takeFood(1)) d.fed++;
      if (d.fed >= 3) {
        d.phase = 'tame';
        S.toast('The dog walked right into camp this morning and lay down by the fire.', 'good');
        S.log('The stray dog ate from our hands last night. This morning it was asleep by the fire. It is ours now.');
        g.village.namings.push({ title: 'NAME THE DOG', sugg: ['Scraps', 'Lucky', 'Biscuit', 'Wreck', 'Captain'], done: n => { d.name = n.trim().slice(0, 16) || 'Scraps'; S.log(`We named the dog ${d.name}.`); } });
      }
    }
    // goats and chickens: somebody spots them and asks
    if (day >= 8 && !this.asked.goats && Math.random() < 0.15) this.askPen('goats');
    else if (day >= 8 && !this.asked.chickens && Math.random() < 0.15) this.askPen('chickens');
    const pen = g.camp.get('pen'), coop = g.camp.get('coop');
    if (pen && !this.goats.length) { for (let i = 0; i < 2; i++) this.goats.push(this.beast(pen)); S.toast('Two wild goats in the pen! Milk tomorrow.', 'good'); S.log('The hunters roped two wild goats and walked them into the pen.'); }
    if (coop && !this.chickens.length) { for (let i = 0; i < 4; i++) this.chickens.push(this.beast(coop)); S.toast('Jungle fowl in the coop. Eggs every morning now.', 'good'); S.log('We caught four jungle fowl for the coop.'); }
    if (pen && this.goats.length) {
      g.stock.add('snacks', Math.floor(this.goats.length / 2) * 2);
      if (++this.goatDays % 5 === 0 && this.goats.length < 6) { this.goats.push(this.beast(pen)); S.log('A kid goat was born in the pen.'); }
      if (g.stock.totalFood <= 0 && this.goats.length > 2) { this.goats.pop(); g.stock.add('meat', 6); S.toast('With nothing left to eat, we butchered a goat.', 'bad'); S.log('Hard morning. We had to kill one of the goats.'); }
    }
    if (coop && this.chickens.length) g.stock.add('shell', 3);
    // a parrot drops in
    if (!this.parrot && g.era === 'village' && Math.random() < 0.05) {
      const o = g.people.find(p => p.mode === 'camp' && !p.kid && (has(p.per, 'kind') || has(p.per, 'curious')));
      if (o) {
        this.parrot = { name: '', owner: o.id, x: g.fire.x + 1.8, z: g.fire.z - 1.4, t: 60 };
        S.toast(`A parrot landed in camp and took to ${o.per.name}.`, 'good', o); S.log(`A big green parrot landed on ${o.per.name}'s shoulder this morning and won't leave.`);
        g.village.namings.push({ title: 'NAME THE PARROT', sugg: ['Captain', 'Pilot', 'Mango', 'Mayday'], done: n => { this.parrot!.name = n.trim().slice(0, 16) || 'Captain'; } });
      }
    }
  }

  private askDog() {
    const g = this.g, S = g.story, d = this.dog;
    const p = g.people.find(o => o.mode === 'camp' && !o.kid && has(o.per, 'kind')) ?? g.people.find(o => o.mode === 'camp' && !o.kid && o !== g.leader);
    if (!p) return;
    d.phase = 'asked';
    g.requests.urgent(p, 'dog', 'That skinny dog keeps coming round at dusk. Can we give it some scraps?', [
      { label: 'FEED IT', cls: 'go', fn: () => { d.phase = 'feeding'; S.say(p, "Here, boy. Easy..."); S.mood(p, 'happy', 30); S.log(`${p.per.name} started leaving scraps out for the stray dog.`); } },
      { label: 'NO', fn: () => { d.phase = 'wild'; d.back = g.clock.day + 3; S.say(p, 'Poor thing.'); } },
    ], () => { if (has(p.per, 'kind')) { d.phase = 'feeding'; S.log(`${p.per.name} fed the stray anyway.`); } else { d.phase = 'wild'; d.back = g.clock.day + 3; } });
  }

  private askPen(kind: 'goats' | 'chickens') {
    const g = this.g, S = g.story, k = kind === 'goats' ? 'pen' : 'coop';
    const p = g.people.find(o => o.mode === 'camp' && !o.kid && o !== g.leader && (o.job === 'hunt' || has(o.per, 'curious') || has(o.per, 'hardworking')));
    if (!p) return;
    this.asked[kind] = 1;
    const text = kind === 'goats' ? "There are wild goats up in the hills. Build a pen and we could keep some. Milk, every day." : 'Jungle fowl in the undergrowth. Build a coop and we would have eggs every morning.';
    g.requests.urgent(p, kind, text, [
      { label: 'BUILD IT', cls: 'go', fn: () => { g.camp.add(k, true); S.say(p, "I'll start on it."); } },
      { label: 'NOT NOW', fn: () => { this.asked[kind] = 0; S.say(p, 'Okay.'); } },
    ], () => { this.asked[kind] = 0; });
  }

  /** For saving: just what matters. */
  state() { const d = this.dog; return { dog: { phase: d.phase === 'asked' ? 'wild' : d.phase, fed: d.fed, name: d.name, back: d.back, seen: d.seen }, goats: this.goats.length, chickens: this.chickens.length, parrot: this.parrot, asked: this.asked }; }
  restore(s: ReturnType<Animals['state']>) {
    Object.assign(this.dog, s.dog); this.parrot = s.parrot; this.asked = s.asked;
    const pen = this.g.camp.get('pen'), coop = this.g.camp.get('coop');
    if (pen) for (let i = 0; i < s.goats; i++) this.goats.push(this.beast(pen));
    if (coop) for (let i = 0; i < s.chickens; i++) this.chickens.push(this.beast(coop));
  }

  private beast(at: Pt): Beast { return { x: at.x + (Math.random() - 0.5) * 2, z: at.z + (Math.random() - 0.5), tx: at.x, tz: at.z, t: 0, face: 1, moving: false }; }

  // ------------------------------------------------------------------ every frame

  update(dt: number) {
    const g = this.g, S = g.story, h = g.clock.hour, F = g.fire, d = this.dog, L = g.leader;
    // the stray hangs about the edge of camp at dusk, closer each night it's fed
    if (d.phase === 'wild' || d.phase === 'asked' || d.phase === 'feeding') {
      if (h > 18 && h < 21.5) {
        const r = d.phase === 'feeding' ? CAMP_R - d.fed * 6 : CAMP_R + 2;
        if (d.x < 0) { const a = Math.random() * 6.283, q = g.grid.nearest(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r); if (q) { d.x = q.x; d.z = q.z; } d.seen = true; }
        if (L && Math.hypot(L.x - d.x, L.z - d.z) < 5) this.step(d, d.x + (d.x - L.x), d.z + (d.z - L.z), 4, dt);     // shy
        else if (Math.random() < dt * 0.3) { const a = Math.atan2(d.z - F.z, d.x - F.x) + (Math.random() - 0.5) * 0.6; this.step(d, F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, 1.4, dt); }
        else d.moving = false;
      } else d.x = -1;
    }
    if (d.phase === 'tame') this.camp(dt);
    // goats and chickens potter about
    const pen = g.camp.get('pen'), coop = g.camp.get('coop');
    if (pen) for (const b of this.goats) this.potter(b, pen, 1.6, 0.8, 0.8, dt);
    if (coop) for (const b of this.chickens) this.potter(b, coop, 2.8, 2.2, 1.4, dt);
    // the parrot says what it hears
    const P = this.parrot;
    if (P && h > 7 && h < 21 && (P.t -= dt) <= 0) {
      P.t = 50 + Math.random() * 50;
      this.bird.x = P.x; this.bird.z = P.z;
      const dead = g.health.dead;
      if (dead.length && Math.random() < 0.3) {
        const n = pickOf(dead).name; S.say(this.bird, `${n}! ${n}!`, 3);
        const o = g.people.find(p => p.mode === 'camp' && !p.kid && Math.hypot(p.x - F.x, p.z - F.z) < 25);
        if (o) { setTimeout(() => S.say(o, pickOf(['...Where did it learn that?', `Don't. Please don't.`, 'It misses them too.']), 3), 1500); S.mood(o, 'sad', 20); }
      } else {
        const lines = S.heard.filter(t => t.length <= 26 && !t.startsWith('('));
        const count = new Map<string, number>(); for (const t of lines) count.set(t, (count.get(t) ?? 0) + 1);
        const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) S.say(this.bird, best[0] + (Math.random() < 0.4 ? ' Squawk!' : ''), 3);
      }
    }
  }

  /** The camp dog: at your heels outside camp, by the fire at night, and the cat's worst enemy. */
  private camp(dt: number) {
    const g = this.g, S = g.story, d = this.dog, L = g.leader, F = g.fire, h = g.clock.hour, night = h >= 21 || h < 6;
    if (d.x < 0) { d.x = F.x + 2; d.z = F.z + 2; }
    if (L && g.crew.out && !g.canoe.trip) {
      const k = Math.hypot(L.x - d.x, L.z - d.z);
      if (k > 30) { d.x = L.x - 2; d.z = L.z - 2; }
      else if (k > 3) this.step(d, L.x - 1.5, L.z - 1, k > 8 ? 7 : 3.2, dt); else d.moving = false;
      // a nose for things
      if ((this.sniffT -= dt) <= 0) {
        this.sniffT = 40;
        const q = g.disc.pois.find(q => !q.known && (q.kind === 'food' || q.kind === 'material') && Math.hypot(q.x - L.x, q.z - L.z) < 60);
        if (q && Math.random() < 0.15) { g.know(q, L, false); S.toast(`${d.name || 'The dog'} sniffed out ${q.label}.`, 'good'); }
      }
    } else if (night) this.step(d, F.x + 2.4, F.z + 1.6, 2, dt);
    else if (L && Math.hypot(L.x - F.x, L.z - F.z) < CAMP_R && Math.hypot(L.x - d.x, L.z - d.z) > 4) this.step(d, L.x + 1.2, L.z + 0.8, 3.5, dt);
    else d.moving = false;
    // the cat comes near: the dog goes off
    const C = g.cat;
    if (C.visible && Math.hypot(C.x - d.x, C.z - d.z) < 22 && this.barkNight !== g.clock.day) {
      this.barkNight = g.clock.day; C.scare();
      S.toast(`${d.name || 'The dog'} barked at ${C.name || 'the cat'} until it slunk off.`, 'good');
      S.log(`${d.name || 'The dog'} chased ${C.name || 'the cat'} off in the night. Good dog.`);
    }
  }

  private step(b: { x: number; z: number; face: number; moving: boolean }, tx: number, tz: number, sp: number, dt: number) {
    const dx = tx - b.x, dz = tz - b.z, k = Math.hypot(dx, dz);
    if (k < 0.3) { b.moving = false; return; }
    const nx = b.x + dx / k * Math.min(k, sp * dt), nz = b.z + dz / k * Math.min(k, sp * dt);
    if (!this.g.grid.walkable(nx, nz)) { b.moving = false; return; }
    b.x = nx; b.z = nz; b.moving = true;
    const rr = this.g.bodies; rr.faceToward(b as unknown as Person, tx, tz);
  }

  private potter(b: Beast, at: Pt, rx: number, rz: number, sp: number, dt: number) {
    if ((b.t -= dt) <= 0) { b.t = 2 + Math.random() * 5; b.tx = at.x + (Math.random() - 0.5) * rx * 2; b.tz = at.z + (Math.random() - 0.5) * rz * 2; }
    const dx = b.tx - b.x, dz = b.tz - b.z, k = Math.hypot(dx, dz);
    if (k < 0.1) { b.moving = false; return; }
    b.x += dx / k * Math.min(k, sp * dt); b.z += dz / k * Math.min(k, sp * dt); b.moving = true;
    this.g.bodies.faceToward(b as unknown as Person, b.tx, b.tz);
  }
}
