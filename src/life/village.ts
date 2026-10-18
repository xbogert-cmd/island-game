import { has } from './persona';
import { Person, Pt } from './people';
import { BUILD } from './buildings';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everyone walking to one place for a moment: the founding, a tradition, a showdown. */
export interface Gathering {
  kind: string; at: Pt; r: number; t: number; end: number;
  steps: { at: number; fn: () => void; done?: boolean }[];
  /** pause the script here until something (a name, a choice) comes back */
  hold?: boolean;
  onEnd?: () => void;
}
/** Something to name: shown with the name box. */
export interface Naming { title: string; sugg: string[]; done: (name: string) => void }

/**
 * The Village era and what comes with it: the founding and its name, storm season,
 * the volcano waking, the tower's long view and the spike traps.
 */
export class Village {
  name = '';
  founded = 0;
  /** dawns in a row the camp has been settled */
  settled = 0;
  state: 'none' | 'asked' | 'tonight' | 'done' = 'none';
  private back = 0;
  ev: Gathering | null = null;
  namings: Naming[] = [];
  // storm season
  stormIn = -1; warned = false; prepared = false; storming = false;
  // the volcano
  rumble = 0; private quakeAt = -1; private quaked = false;
  // the tower
  private watchedToday = 0; private watchedYesterday = 0; private watchedAll = 0; private spotT = 4; private catDay = -1;

  constructor(private g: Group) {}

  // ------------------------------------------------------------------ the founding

  /** Is the camp settled enough to call itself a village? */
  ready() {
    const g = this.g, n = g.people.filter(p => p.mode !== 'dead').length;
    const roofless = g.people.filter(p => p.mode !== 'dead' && !p.kid && !g.camp.hutOf(p.id)).length;
    const catOk = g.cat.phase !== 'stalk' || g.camp.has('fence') || g.camp.has('watchFire');
    return roofless === 0 && g.stock.totalFood >= n * 0.6 && !g.people.some(p => p.health >= 3 && p.mode !== 'dead') && catOk;
  }

  dawn() {
    const g = this.g, S = g.story;
    if (g.era === 'camp') {
      this.settled = this.ready() ? this.settled + 1 : 0;
      if (this.settled >= 2 && this.state === 'none' && g.clock.day >= this.back) this.propose();
    }
    if (g.era !== 'village') return;
    // storm season
    if (this.stormIn > 0) {
      this.stormIn--;
      if (this.stormIn === 1 && this.watchedYesterday > 20) {
        this.warned = true;
        const w = g.people.find(p => p.xp.lookout && p.mode === 'camp') ?? null;
        S.toast('From the tower: storm clouds to the east. It hits tomorrow.', 'bad', w ?? undefined);
        S.log('Whoever was on the tower saw the storm coming a day out. We have time to get ready.');
      }
      if (this.stormIn === 0 && !this.warned) {
        this.warned = true;
        const w = g.people.find(p => p.mode === 'camp' && (has(p.per, 'cowardly') || has(p.per, 'curious')) && p !== g.leader);
        if (w) setTimeout(() => S.say(w, "The birds are all gone. Something's coming.", 4), 4000);
        S.log('The birds went quiet this morning. The sky to the east is the wrong color.');
      }
    }
    // the volcano stirs, a little more each day
    this.rumble = Math.min(10, this.rumble + 1);
    this.quakeAt = Math.random() < 0.3 + this.rumble * 0.03 ? 8 + Math.random() * 12 : -1;
    // the tower's day
    this.watchedYesterday = this.watchedToday; this.watchedToday = 0;
    // spike traps
    this.traps();
  }

  private propose() {
    const g = this.g, S = g.story, L = g.leader!;
    const avg = (p: Person) => g.people.reduce((s, o) => s + (o === p ? 0 : S.rel(o, p)), 0);
    const p = g.people.filter(o => o !== L && o.mode === 'camp' && !o.kid && o.per.trust >= 40).sort((a, b) => avg(b) - avg(a))[0];
    if (!p) return;
    this.state = 'asked';
    g.requests.urgent(p, 'village', "Look at this place. Huts, food, a fire. We're not a camp anymore, we're a village. Let's make it official tonight.", [
      { label: 'TONIGHT', cls: 'go', fn: () => { this.state = 'tonight'; S.say(p, "I'll tell everyone!"); S.mood(p, 'happy', 30); } },
      { label: 'NOT YET', fn: () => { this.state = 'none'; this.back = g.clock.day + 3; S.say(p, 'Soon, then.'); } },
    ], () => { this.state = 'tonight'; S.log(`${p.per.name} told everyone to meet at the fire tonight.`); });
  }

  /** The naming at the fire. */
  private ceremony() {
    const g = this.g, S = g.story, L = g.leader!, F = g.fire;
    const crowd = () => g.people.filter(p => p.act === 'gather');
    const friend = () => crowd().filter(p => p !== L).sort((a, b) => S.rel(b, L) - S.rel(a, L))[0];
    this.gather('founding', F, 4.2, 40, [
      { at: 3, fn: () => { const p = friend(); if (p) S.say(p, 'Everyone. Look around. We made this, with our own hands.', 5); } },
      { at: 9, fn: () => { const p = crowd().filter(x => x !== L)[2] ?? friend(); if (p) S.say(p, g.health.dead.length ? `For ${g.health.dead.map(d => d.name).join(', ')}. They should be here.` : 'To all of us. Every one.', 5); } },
      { at: 14, fn: () => {
        this.ev!.hold = true;
        this.namings.push({ title: 'NAME THE VILLAGE', sugg: this.names(), done: n => { this.found(n); if (this.ev) this.ev.hold = false; } });
      } },
      { at: 22, fn: () => { for (const p of crowd()) { p.poseO = 'cheer'; p.poseT = 2.5; } } },
    ]);
  }

  private names() {
    const g = this.g, L = g.leader!, dead = g.health.dead[0];
    const big = g.disc.pois.find(q => q.known && q.major && q.name);
    return [`${L.per.name}'s Landing`, 'Second Chance', dead ? `${dead.name}'s Hope` : 'Driftwood', big ? `${big.name} Village` : 'Haven'];
  }

  private found(name: string) {
    const g = this.g, S = g.story, n = g.people.filter(p => p.mode !== 'dead').length;
    this.name = name.trim().slice(0, 28) || 'Haven'; this.founded = g.clock.day; this.state = 'done';
    g.era = 'village';
    g.eraCards.push({ title: `THE VILLAGE OF ${this.name.toUpperCase()}`, sub: `Founded on day ${g.clock.day}` });
    g.stock.takeFood(Math.ceil(n / 2));
    for (const p of g.people) if (p.mode !== 'dead') { S.mood(p, 'happy', 180); if (p.act === 'gather') { p.poseO = 'cheer'; p.poseT = 2; } }
    S.trustAll(4, g.leader);
    S.log(`We named our home ${this.name} tonight and ate like it was a holiday. We're a village now.`);
    g.onChime(true);
    this.stormIn = 6 + ((Math.random() * 3) | 0);
    g.hint('village', 'You are a village now. New builds (a lookout tower, spike traps), and the island has more in store.');
  }

  // ------------------------------------------------------------------ gatherings

  gather(kind: string, at: Pt, r: number, end: number, steps: Gathering['steps'], onEnd?: () => void) {
    const g = this.g;
    const crowd = g.people.filter(p => p.mode === 'camp' && p.health < 3 && p.act !== 'ask' && p.act !== 'funeral');
    crowd.forEach((p, i) => {
      const a = (i / crowd.length) * 6.283, q = g.grid.nearest(at.x + Math.cos(a) * r, at.z + Math.sin(a) * r) ?? at;
      if (p.job) g.jobs.quit(p);
      p.act = 'gather'; p.partner = null; p.carry = 0; p.up = 0; g.bodies.go(p, q.x, q.z);
    });
    this.ev = { kind, at, r, t: 0, end, steps, onEnd };
    g.slowT = Math.max(g.slowT, 8); g.focus = { x: at.x, z: at.z };
  }

  /** Movement for people at a gathering. Called from camp life. */
  drive(p: Person, dt: number) {
    const g = this.g, e = this.ev;
    if (!e) { p.act = ''; p.actT = 1; return; }
    if (p.path.length) { g.bodies.advance(p, g.bodies.speed(p) * 1.15, dt); p.pose = 'walk'; return; }
    if (!p.poseO) p.pose = e.kind === 'mourn' ? 'slump' : 'idle';
    g.bodies.faceToward(p, e.at.x, e.at.z);
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number) {
    const g = this.g, h = g.clock.hour, e = this.ev;
    if (this.state === 'tonight' && !e && !g.health.funeral && h >= 19 && h < 21.5) this.ceremony();
    if (e) {
      if (!e.hold) e.t += dt;
      for (const s of e.steps) if (!s.done && e.t >= s.at) { s.done = true; s.fn(); }
      if (e.t >= e.end) { this.ev = null; for (const p of g.people) if (p.act === 'gather') { p.act = ''; p.actT = 2; } e.onEnd?.(); }
    }
    // storm day
    if (g.era === 'village' && this.stormIn === 0 && !this.storming && h >= 11 && h < 12) this.storm();
    if (this.storming && h >= 17) this.calm();
    // the ground shakes
    if (this.quakeAt >= 0 && h >= this.quakeAt) { this.quakeAt = -1; this.quake(); }
  }

  // ------------------------------------------------------------------ storm season

  /** A storm is coming today or tomorrow, and we know it. */
  stormSoon() { return this.g.era === 'village' && this.warned && this.stormIn >= 0 && this.stormIn <= 1 && !this.prepared; }

  /** The morning plan: tie everything down. */
  prepare(who: Person) {
    const g = this.g, S = g.story;
    this.prepared = true;
    const fixed = g.camp.list.filter(b => b.shaky && b.progress >= 1);
    for (const b of fixed) b.shaky = false;
    S.log(`${who.per.name} had everyone tie down the roofs${fixed.length ? ` and brace ${fixed.length === 1 ? 'the shaky ' + BUILD[fixed[0].kind].label.replace(/^an? /, '') : 'every shaky building'}` : ''}, and the food went under cover.`);
  }

  private storm() {
    const g = this.g, S = g.story;
    this.storming = true; g.weather.forced = 'storm';
    S.toast('The storm is here!', 'bad'); S.log(this.prepared ? 'The storm hit. We were ready for it.' : 'The storm hit, and we were not ready.');
    g.onAlarm();
  }

  private calm() {
    const g = this.g, S = g.story, C = g.camp;
    this.storming = false; g.weather.forced = null;
    if (this.prepared) { S.trustAll(2, g.leader); S.toast('The storm passed. Everything held.', 'good'); S.log('The storm passed and everything held. People were proud of that.'); }
    else {
      if (!C.has('storage')) {
        let lost = 0; for (const f of ['fruit', 'fish', 'shell', 'meat'] as const) { const k = Math.floor(g.stock.food[f] * 0.35); g.stock.food[f] -= k; lost += k; }
        if (lost) { S.toast('The storm soaked a lot of the food.', 'bad'); S.log('Half the fresh food was ruined by the storm.'); }
      }
      const hit = C.list.filter(b => b.progress >= 1 && !['grave', 'sos', 'garden', 'fence', 'traps', 'bath'].includes(b.kind));
      if (hit.length && Math.random() < 0.5) {
        const b = pickOf(hit); b.progress = 0.67; b.paid = 2; C.queue.unshift(b);
        S.toast(`The storm tore up ${BUILD[b.kind].label}.`, 'bad'); S.log(`The storm tore the roof off ${BUILD[b.kind].label}. We'll have to fix it.`);
      }
    }
    this.stormIn = 8 + ((Math.random() * 3) | 0); this.warned = false; this.prepared = false;
  }

  // ------------------------------------------------------------------ the volcano

  private quake() {
    const g = this.g, S = g.story;
    g.onQuake(0.35 + this.rumble * 0.05);
    for (const p of g.people) if (p.mode !== 'dead' && p.pose !== 'sleep') { p.poseO = 'startle'; p.poseT = 0.8; if (Math.random() < 0.15) S.mood(p, 'scared', 20); }
    S.toast(this.rumble > 6 ? 'The ground shook hard. The mountain is smoking.' : 'The ground shook.', 'bad');
    const w = g.people.find(p => p.mode === 'camp' && p !== g.leader && p.pose !== 'sleep');
    if (w) setTimeout(() => S.say(w, pickOf(['Did you feel that?!', 'The mountain...', "That's not normal, is it?"]), 3), 1200);
    if (!this.quaked) {
      this.quaked = true;
      S.log('The ground shook today. A thin line of smoke is coming off the mountain.');
      const cr = g.disc.pois.find(q => q.kind === 'crater');
      if (cr) g.disc.rumor(cr, 0, 26, 'Smoke from the mountain', null, 0.5);
    }
  }

  // ------------------------------------------------------------------ the tower and the traps

  /** Someone is up on the tower. Called from the Lookout job. */
  watch(dt: number, p: Person) {
    const g = this.g, S = g.story, tw = g.camp.get('tower'); if (!tw) return;
    this.watchedToday += dt; this.watchedAll += dt;
    const R = Math.min(100, 40 + this.watchedAll * 0.06);
    if ((this.spotT -= dt) <= 0) {
      this.spotT = 10;
      g.disc.markExplored(tw.x, tw.z, R * 0.8);
      const q = g.disc.pois.filter(q => !q.known && Math.hypot(q.x - tw.x, q.z - tw.z) < R * g.scouting.sightMul(p) && !g.disc.markers.some(m => m.poi === q))
        .sort((a, b) => Math.hypot(a.x - tw.x, a.z - tw.z) - Math.hypot(b.x - tw.x, b.z - tw.z))[0];
      if (q) {
        if (q.major) { g.disc.rumor(q, 6, 16, `${p.per.name} saw ${q.label} from the tower`, p); S.toast(`From the tower, ${p.per.name} spotted ${q.label}.`, 'info', p); }
        else g.know(q, p, false);
      }
    }
    // the cat moving at dusk
    const h = g.clock.hour;
    if (g.cat.phase === 'stalk' && h > 17.4 && h < 18.4 && this.catDay !== g.clock.day) {
      this.catDay = g.clock.day;
      S.say(p, 'Something big in the trees! Everyone in!', 4); S.toast(`From the tower: ${g.cat.name || 'the cat'} is moving in the trees.`, 'bad', p);
      for (const o of g.people) if (o.mode === 'camp' && Math.random() < 0.5) S.mood(o, 'scared', 20);
    }
  }

  private traps() {
    const g = this.g, S = g.story, C = g.cat;
    if (!g.camp.has('traps')) return;
    if (Math.random() < 0.3) { g.stock.add('meat', 4); g.stock.hides++; S.toast('A boar fell in one of the spike pits overnight.', 'good'); S.log('A boar in the spike pit this morning. Meat for days.'); }
    if (C.phase === 'stalk' && C.wounded <= 0 && Math.random() < 0.22) {
      C.wounded = 3; C.bold = Math.max(0, C.bold - 1);
      S.toast(`Blood by the spike pits. ${cap(C.name || 'the cat')} is limping.`, 'good'); S.log(`${cap(C.name || 'the cat')} stepped in a spike pit in the night. It's hurt. It won't come back for a while, and it'll be easier to hunt.`);
    }
    // your own pits are easy to forget in the dark
    const out = g.people.filter(p => p.mode === 'camp' && !p.kid && ['hunt', 'trap', 'food', 'wood', 'herbs'].includes(p.job));
    if (out.length && Math.random() < 0.05) {
      const p = out.find(o => o.per.weakness === 'clumsy') ?? pickOf(out);
      p.hurt = true; g.startHealing(p); S.toast(`${p.per.name} stepped in one of our own spike pits.`, 'bad', p); S.log(`${p.per.name} forgot where the pits were and stepped in one. Ugly cut.`);
    }
  }
}
