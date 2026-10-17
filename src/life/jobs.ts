import { mulberry32 } from '../world/noise';
import { has, Skill } from './persona';
import { Person, Pose, Pt } from './people';
import { Mat, MATS, TOOLS, TOOL_COST, Tool } from './stock';
import { Building } from './buildings';
import type { Group } from './group';

export type JobKind = 'water' | 'food' | 'fish' | 'hunt' | 'trap' | 'wood' | 'bamboo' | 'stone' | 'vines' | 'scrap' | 'build' | 'craft' | 'cook' | 'watch' | 'tend';
export const JOB_KINDS: JobKind[] = ['water', 'food', 'fish', 'hunt', 'trap', 'wood', 'bamboo', 'stone', 'vines', 'scrap', 'build', 'craft', 'cook', 'watch', 'tend'];
type Shift = 'day' | 'evening' | 'night';
interface JobDef { label: string; verb: string; shift: Shift; skill?: Skill; pose: Pose; outdoor: boolean }

export const JOB: Record<JobKind, JobDef> = {
  water: { label: 'Water', verb: 'fetching water', shift: 'day', pose: 'collect', outdoor: true },
  food: { label: 'Gathering food', verb: 'gathering food', shift: 'day', pose: 'collect', outdoor: true },
  fish: { label: 'Fishing', verb: 'fishing', shift: 'day', skill: 'fisher', pose: 'fish', outdoor: true },
  wood: { label: 'Wood', verb: 'cutting wood', shift: 'day', pose: 'build', outdoor: true },
  bamboo: { label: 'Bamboo', verb: 'cutting bamboo', shift: 'day', pose: 'build', outdoor: true },
  stone: { label: 'Stone', verb: 'hauling stone', shift: 'day', pose: 'build', outdoor: true },
  vines: { label: 'Vines', verb: 'pulling vines', shift: 'day', pose: 'collect', outdoor: true },
  scrap: { label: 'Scrap', verb: 'stripping the wreck', shift: 'day', skill: 'mechanic', pose: 'search', outdoor: true },
  build: { label: 'Building', verb: 'building', shift: 'day', skill: 'builder', pose: 'build', outdoor: true },
  craft: { label: 'Making tools', verb: 'making tools', shift: 'day', skill: 'mechanic', pose: 'build', outdoor: false },
  hunt: { label: 'Hunting', verb: 'hunting', shift: 'day', pose: 'search', outdoor: true },
  trap: { label: 'Checking snares', verb: 'checking the snares', shift: 'day', pose: 'collect', outdoor: true },
  cook: { label: 'Cooking', verb: 'cooking', shift: 'evening', skill: 'cook', pose: 'build', outdoor: false },
  watch: { label: 'Night watch', verb: 'on night watch', shift: 'night', pose: 'idle', outdoor: false },
  tend: { label: 'Tending the sick', verb: 'tending the sick', shift: 'day', skill: 'medic', pose: 'collect', outdoor: false },
};
const MAT_JOBS: Mat[] = ['wood', 'bamboo', 'stone', 'vines', 'scrap'];
export const PRIO_WORD = ['LOW', 'NORMAL', 'HIGH'];
export const LEVEL_WORD = ['Novice', 'Handy', 'Skilled', 'Expert'];
export const level = (xp: number) => xp < 6 ? 0 : xp < 18 ? 1 : xp < 40 ? 2 : 3;
const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const TOOL_LINE: Record<Tool, string> = { knife: 'Stripping the wreck just got easier.', axe: 'Wood comes in twice as fast now.', spear: 'Now we can hunt.', basket: 'Gatherers carry more.', rope: 'Building goes quicker with proper rope.' };

/**
 * Who does what. Fully automatic: the camp staffs each job from what is needed.
 * The player only (optionally) sets a priority per job and a favorite job per person.
 */
export class Jobs {
  prio: Record<JobKind, number> = Object.fromEntries(JOB_KINDS.map(k => [k, 1])) as Record<JobKind, number>;
  want: Record<JobKind, number> = Object.fromEntries(JOB_KINDS.map(k => [k, 0])) as Record<JobKind, number>;
  seen = new Set<JobKind>();
  fresh = false;                  // a new job appeared (NEW tag)
  cooked = false;                 // someone cooked tonight
  likeKnown = new Set<string>();  // `${id}:love` / `${id}:hate`
  private t = 0;
  snareCheck = -1e9;

  constructor(private g: Group) {
    const rnd = mulberry32(g.w.seed ^ 0x10b5);
    for (const p of g.people) {
      const pool = JOB_KINDS.filter(k => k !== 'build' && k !== 'tend');
      p.love = pool[(rnd() * pool.length) | 0];
      do p.hate = pool[(rnd() * pool.length) | 0]; while (p.hate === p.love);
      if (p.per.skill !== 'none') for (const k of JOB_KINDS) if (JOB[k].skill === p.per.skill) { p.xp[k] = 40; p.love = k; if (p.hate === k) p.hate = 'watch'; }
    }
  }

  // ------------------------------------------------------------------ which jobs exist

  visible(): JobKind[] {
    const g = this.g, d = g.disc, C = g.camp, known = (k: string) => d.pois.some(p => p.known && p.kind === k);
    const src = (m: Mat) => d.pois.some(p => p.known && p.kind === 'material' && p.mat === m);
    const out: JobKind[] = [];
    if (known('water')) out.push('water');
    if (known('food')) out.push('food');
    if (g.story.skillKnown.has(g.people.find(p => p.per.skill === 'fisher')?.id ?? -1) || C.has('dryingRack') || C.has('fishTrap')) out.push('fish');
    if (g.era !== 'crash') for (const m of MAT_JOBS) if (src(m)) out.push(m);
    if (C.queue.length) out.push('build');
    if (C.has('cooking')) out.push('cook');
    if (C.has('watchFire')) out.push('watch');
    if (C.has('sickbay')) out.push('tend');
    const st = g.stock;
    if (C.has('workbench') && TOOLS.some(t => st.toolKnown.has(t))) out.push('craft');
    if (st.tools.spear > 0) out.push('hunt');
    if (C.has('snares')) out.push('trap');
    for (const k of out) if (!this.seen.has(k)) { this.seen.add(k); if (this.seen.size > 2) { this.fresh = true; g.story.toast(`New job: ${JOB[k].label}.`, 'info'); } }
    return out;
  }

  inShift(k: JobKind) {
    const h = this.g.clock.hour, s = JOB[k].shift;
    return s === 'day' ? h >= 6.5 && h < 18.5 : s === 'evening' ? h >= 17 && h < 20.5 : h >= 20.5 || h < 5.5;
  }
  /** Is this person working right now (as opposed to free time)? */
  on(p: Person) {
    const k = p.job as JobKind; if (!k || !this.inShift(k)) return false;
    return !(JOB[k].outdoor && this.g.weather.rain > 0.78);
  }
  speed(p: Person) {
    const k = p.job as JobKind, L = this.g.leader;
    let s = 0.8 + level(p.xp[k] ?? 0) * 0.15;
    if (L && Math.hypot(L.x - p.x, L.z - p.z) < 8) s *= 1.3;                              // lead by example
    const mates = this.g.people.filter(o => o !== p && o.job === k && Math.hypot(o.x - p.x, o.z - p.z) < 6);
    if (mates.some(o => this.g.story.rel(p, o) > 30)) s *= 1.12;
    if (mates.some(o => this.g.story.rel(p, o) < -30)) s *= 0.8;
    if (JOB[k].outdoor && this.g.weather.rain > 0.3) s *= 0.7;
    const T = this.g.stock.tools;
    if ((k === 'wood' || k === 'bamboo') && T.axe > 0) s *= 1.6;          // an axe makes all the difference
    if (k === 'scrap' && T.knife > 0) s *= 1.4;
    if (k === 'build' && T.rope > 0) s *= 1.25;
    return s;
  }

  // ------------------------------------------------------------------ how many, and who

  private demand(k: JobKind): number {
    const g = this.g, st = g.stock, n = g.people.length, C = g.camp;
    const lvl = (v: number, out: number[]) => v <= 0 ? out[0] : v < n * 0.6 ? out[1] : v < n * 1.5 ? out[2] : v < n * 3 ? out[3] : 0;
    switch (k) {
      case 'water': return lvl(st.water, [4, 3, 2, 1]);
      case 'food': return lvl(st.totalFood, [5, 4, 2, 1]);
      case 'fish': return st.totalFood < n * 1.5 ? 2 : st.totalFood < n * 3 ? 1 : 0;
      case 'build': return C.target() ? Math.min(3, 1 + C.queue.length) : 0;
      case 'cook': return 1;
      case 'watch': return 1;
      case 'tend': return g.people.some(p => (p.hurt || p.health >= 2) && p.mode === 'camp') ? 1 : 0;
      case 'craft': return this.nextTool() ? 1 : 0;
      case 'hunt': return Math.min(st.tools.spear, st.totalFood < n * 1.5 ? 3 : st.totalFood < n * 3 ? 2 : 0);
      case 'trap': return 1;
      default: { const need = C.need()[k as Mat]; return need > 0 ? Math.min(4, Math.ceil(need / 2)) : st.mat[k as Mat] < 3 && C.queue.length ? 1 : 0; }
    }
  }

  /** Re-staff every few seconds. Sticky: people keep their job unless it's no longer needed. */
  update(dt: number) {
    if ((this.t -= dt) > 0) return;
    this.t = 5;
    const g = this.g, S = g.story;
    // anyone can twist vines into rope or weave a basket once there are vines
    if (g.disc.pois.some(q => q.known && q.kind === 'material' && q.mat === 'vines')) { g.stock.toolKnown.add('basket'); g.stock.toolKnown.add('rope'); }
    const vis = this.visible(), plan = g.goals.cur && g.goals.active(g.goals.cur.kind) ? g.goals.cur : null;
    for (const k of JOB_KINDS) {
      let w = vis.includes(k) ? this.demand(k) : 0;
      if (vis.includes(k) && plan && ((plan.kind === 'food' && (k === 'food' || k === 'fish')) || (plan.kind === 'water' && k === 'water') || (plan.kind === 'build' && ((k === 'build' && g.camp.target()) || g.camp.need()[k as Mat] > 0)))) w += 2;
      if (vis.includes(k)) w = this.prio[k] === 2 ? Math.max(2, Math.ceil(w * 1.5) + 1) : this.prio[k] === 0 ? Math.floor(w * 0.5) : w;
      this.want[k] = w;
    }
    const free = g.people.filter(p => this.available(p));
    for (const p of g.people) if (!free.includes(p) && p.job) this.quit(p);
    const order = vis.filter(k => this.inShift(k)).sort((a, b) => this.prio[b] - this.prio[a] || this.urgency(b) - this.urgency(a));
    const taken = new Set<Person>();
    // pinned people first
    for (const p of free) if (p.pin && vis.includes(p.pin as JobKind)) { this.give(p, p.pin as JobKind); taken.add(p); }
    for (const k of order) {
      const crew = free.filter(p => taken.has(p) && p.job === k);
      while (crew.length < this.want[k]) {
        let best: Person | null = null, bs = -1e9;
        for (const p of free) { if (taken.has(p)) continue; const s = this.score(p, k, crew); if (s > bs) { bs = s; best = p; } }
        if (!best) break;
        taken.add(best); crew.push(best); this.give(best, k);
      }
    }
    for (const p of free) if (!taken.has(p) && p.job && this.inShift(p.job as JobKind)) this.quit(p);
    // a hated job wears on people
    for (const p of g.people) if (p.job && p.job === p.hate && this.on(p)) {
      p.hateT += 5;
      if (p.hateT > 240 && !this.likeKnown.has(p.id + ':hate')) { this.likeKnown.add(p.id + ':hate'); S.say(p, pickOf([`I hate ${JOB[p.hate as JobKind].verb}.`, `Not ${JOB[p.hate as JobKind].verb} again...`])); S.mood(p, 'angry', 15); }
      if (p.hateT > 500) { p.hateT = 0; g.requests.gripes.push({ p, text: `All day ${JOB[p.hate as JobKind].verb}. Every day. Somebody else's turn.` }); S.trust(p, -1); }
    }
  }

  private urgency(k: JobKind) { return k === 'water' ? 5 : k === 'food' ? 4 : k === 'watch' ? 4 : k === 'tend' ? 3 : k === 'build' ? 2 : 1; }

  available(p: Person) {
    const g = this.g;
    return p !== g.leader && p.mode === 'camp' && !p.hurt && p.health < 2 && p.act !== 'ask' && p.act !== 'job' && p.act !== 'huddle' && p.act !== 'funeral' && !p.sleepIn && !g.requests.busy(p);
  }

  private score(p: Person, k: JobKind, crew: Person[]) {
    const S = this.g.story;
    let s = (p.job === k ? 3 : 0) + (JOB[k].skill && p.per.skill === JOB[k].skill ? 4 : 0) + level(p.xp[k] ?? 0) * 0.8;
    if (p.love === k) s += 1.5; if (p.hate === k) s -= 2;
    // friends work together before rivals do
    for (const o of crew) { const r = S.rel(p, o); if (r > 30) s += 2.5; else if (r < -30) s -= 4; }
    if (k === 'watch') s += (has(p.per, 'brave') ? 1.5 : 0) + (p.per.strength === 'night owl' ? 2 : 0) - (p.per.weakness === 'afraid of the dark' ? 5 : 0);
    if (k === 'tend' && has(p.per, 'kind')) s += 1.5;
    if (has(p.per, 'hardworking')) s += 0.5;
    return s + Math.random() * 0.3;
  }

  private give(p: Person, k: JobKind) {
    if (p.job === k) return;
    p.job = k; p.wph = ''; p.carry = 0; p.bring = ''; p.path = []; p.partner = null;
    if (p.act && p.act !== 'fire' && p.act !== 'sleep') p.act = '';
  }
  quit(p: Person) { p.job = ''; p.wph = ''; p.carry = 0; p.bring = ''; p.torch = false; }

  /** NORMAL → HIGH → LOW → NORMAL */
  cyclePrio(k: JobKind) { this.prio[k] = [1, 2, 0][this.prio[k]]; this.t = 0; }

  /** The tool the camp needs most right now (and knows how to make). */
  nextTool(): Tool | null {
    const g = this.g, st = g.stock, T = st.tools, n = (k: string) => g.people.filter(p => p.job === k).length;
    const want: [Tool, number][] = [['axe', Math.max(1, Math.min(2, n('wood') + n('bamboo')))], ['spear', 3], ['basket', 2], ['knife', 1], ['rope', 2]];
    for (const [t, c] of want) if (st.toolKnown.has(t) && T[t] < c && MATS.every(m => (TOOL_COST[t][m] ?? 0) <= st.mat[m])) return t;
    return null;
  }

  // ------------------------------------------------------------------ doing the work

  private source(k: JobKind, p: Person): Pt | null {
    const g = this.g, F = g.fire, d = g.disc;
    if (k === 'fish') return g.camp.get('fishTrap') && Math.random() < 0.3 ? g.camp.get('fishTrap') : g.fishSpot;
    const kind = k === 'water' ? 'water' : k === 'food' ? 'food' : 'material';
    const c = d.pois.filter(q => q.known && q.kind === kind && (kind !== 'material' || q.mat === k) && Math.hypot(q.x - F.x, q.z - F.z) < 190);
    if (!c.length) return null;
    c.sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z));
    const q = k === 'food' ? pickOf(c.slice(0, 3)) : c[0];
    if (k === 'food') p.bring = q.sprite === 'coconuts' ? 'coconut' : q.sprite === 'shells' ? 'shell' : 'fruit';
    return { x: q.x + (Math.random() - 0.5) * 2.5, z: q.z + (Math.random() - 0.5) * 2.5 };
  }

  /** One frame of work. Called from camp life while the person is on shift. */
  drive(p: Person, dt: number) {
    const g = this.g, B_ = g.bodies, k = p.job as JobKind, F = g.fire;
    const walk = () => { if (!p.path.length) return false; B_.advance(p, B_.speed(p) * (p.carry ? 0.9 : 1), dt); p.pose = p.hurt ? 'limp' : 'walk'; return true; };
    const goTo = (x: number, z: number) => { p.ax = x; p.az = z; if (!B_.go(p, x, z)) p.path = []; };
    p.torch = g.clock.night > 0.5 && k !== 'watch' && k !== 'cook';
    if (p.job !== 'craft' && TOOLS.includes(p.bring as Tool)) p.bring = '';
    switch (k) {
      case 'build': {
        const b = g.camp.target();
        if (!b) { this.idleNear(p, dt, F.x + 3, F.z + 3); return; }
        const slot = this.slot(p, b);
        if (p.wph !== 'site' + b.id) { p.wph = 'site' + b.id; goTo(slot.x, slot.z); return; }
        if (walk()) return;
        B_.faceToward(p, b.x, b.z);
        const ok = g.camp.work(b, dt * this.speed(p), p.per.skill === 'builder' || level(p.xp.build ?? 0) >= 3);
        p.pose = ok ? 'build' : 'idle';
        if (ok) { this.gainXp(p, k, dt / 12); if (Math.random() < dt * 2) g.fx.emit('dot1', b.x + (Math.random() - 0.5) * 2, B_.ground(b) + 0.6, b.z + (Math.random() - 0.5) * 2, { vy: 1.5, vx: (Math.random() - 0.5) * 2, grav: 6, max: 0.5, r: 0.75, g: 0.6, b: 0.4 }); }
        else if (Math.random() < dt * 0.05) g.story.say(p, `We're out of ${g.camp.waitingFor(b) ?? 'stuff'}.`, 2);
        return;
      }
      case 'cook': {
        const c = g.camp.get('cooking'); if (!c) return;
        if (p.wph !== 'c') { p.wph = 'c'; goTo(c.x + 1.2, c.z + 0.4); return; }
        if (walk()) return;
        p.pose = 'build'; B_.faceToward(p, c.x, c.z); this.cooked = true; this.gainXp(p, k, dt / 20);
        if (Math.random() < dt * 1.5) g.fx.emit('puff', c.x, B_.ground(c) + 1, c.z, { vy: 1.2, max: 1.6, r: 0.8, g: 0.8, b: 0.8, a: 0.5 });
        return;
      }
      case 'watch': {
        const wf = g.camp.get('watchFire'); if (!wf) return;
        if (p.wph !== 'w') { p.wph = 'w'; const ox = wf.x - F.x, oz = wf.z - F.z, l = Math.hypot(ox, oz) || 1; goTo(wf.x - ox / l * 1.4, wf.z - oz / l * 1.4); p.sleepIn = false; return; }
        if (walk()) return;
        p.torch = false;
        // a lazy watcher nods off; a brave one keeps looking out
        const dozing = has(p.per, 'lazy') && (g.clock.hour > 1 && g.clock.hour < 4);
        p.pose = dozing ? 'sit' : 'idle'; p.watched = true;
        B_.faceToward(p, wf.x * 2 - F.x, wf.z * 2 - F.z);
        this.gainXp(p, k, dt / 40);
        return;
      }
      case 'craft': {
        const wb = g.camp.get('workbench'); if (!wb) return;
        if (p.wph !== 'k') { p.wph = 'k'; p.wT = 0; goTo(wb.x + 1.4, wb.z + 0.6); return; }
        if (walk()) return;
        B_.faceToward(p, wb.x, wb.z);
        const t = this.nextTool(); if (!t && p.wT <= 0) { p.pose = 'idle'; return; }
        if (p.wT <= 0) { if (!t || !g.stock.pay(TOOL_COST[t])) { p.pose = 'idle'; return; } p.wT = 0.01; p.bring = t; }
        p.pose = 'build'; p.wT += dt * this.speed(p);
        if (p.wT >= 25) {
          const made = p.bring as Tool; p.wT = 0; p.bring = '';
          g.stock.tools[made]++; this.gainXp(p, k, 2);
          if (g.stock.tools[made] === 1) { g.story.toast(`${p.per.name} made the camp's first ${made}.`, 'good', p); g.story.log(`${p.per.name} made our first ${made}. ${TOOL_LINE[made]}`); g.onSting(true); }
        }
        return;
      }
      case 'hunt': {
        // into the jungle, track, chase, and (maybe) home with meat
        if (p.wph === '' || p.wph.startsWith('site')) {
          const F2 = g.fire; let s: Pt | null = null;
          for (let i = 0; i < 12 && !s; i++) { const a = Math.random() * 6.283, r = 40 + Math.random() * 50, x = F2.x + Math.cos(a) * r, z = F2.z + Math.sin(a) * r; if (g.grid.walkable(x, z)) s = { x, z }; }
          if (!s) return; p.wph = 'go'; goTo(s.x, s.z); return;
        }
        if (walk()) return;
        if (p.wph === 'go') { p.wph = 'track'; p.wT = 6 + Math.random() * 4; }
        if (p.wph === 'track') { p.pose = (p.wT % 3) < 1.5 ? 'search' : 'point'; if ((p.wT -= dt * this.speed(p)) > 0) return; p.wph = 'chase'; p.wT = 3; }
        if (p.wph === 'chase') {
          p.pose = 'run'; p.moving = true; p.face = Math.sin(p.anim * 2) > 0 ? 1 : -1;
          if ((p.wT -= dt) > 0) return;
          const odds = 0.4 + level(p.xp.hunt ?? 0) * 0.1 + (has(p.per, 'brave') ? 0.1 : 0) - (has(p.per, 'cowardly') ? 0.15 : 0);
          if (Math.random() < odds) { p.carry = 3; p.bring = 'meat'; p.poseO = 'cheer'; p.poseT = 1.2; if (Math.random() < 0.5) g.stock.hides++; }
          else if (Math.random() < 0.08) { p.hurt = true; p.heal = 300; g.story.say(p, 'The boar got me!'); g.story.toast(`${p.per.name} was gored by a boar.`, 'bad', p); this.quit(p); return; }
          else g.story.say(p, pickOf(['Got away...', 'Too fast.', 'Next time.']), 2);
          p.wph = p.carry ? 'back' : ''; if (p.carry) { const P = g.stock.pile; goTo(P.x + 1, P.z + 1); }
          return;
        }
        if (p.wph === 'back') { g.deposit(p); p.carry = 0; p.wph = ''; this.gainXp(p, k, 1); }
        return;
      }
      case 'trap': {
        const sn = g.camp.get('snares'); if (!sn) return;
        if (p.wph === '' || p.wph.startsWith('site')) { p.wph = 'go'; goTo(sn.x, sn.z); return; }
        if (walk()) return;
        if (p.wph === 'go') { p.wph = 'work'; p.wT = 3; }
        if (p.wph === 'work') {
          p.pose = 'collect'; if ((p.wT -= dt) > 0) return;
          const ready = g.clock.minutes - this.snareCheck > 240;
          if (ready) { this.snareCheck = g.clock.minutes; p.carry = 2; p.bring = 'meat'; p.wph = 'back'; const P = g.stock.pile; goTo(P.x, P.z + 1); }
          else { p.wph = 'wait'; p.wT = 30; }
          return;
        }
        if (p.wph === 'wait') { p.pose = 'idle'; if ((p.wT -= dt) <= 0) p.wph = 'go'; return; }
        if (p.wph === 'back') { g.deposit(p); p.carry = 0; p.wph = ''; this.gainXp(p, k, 1); }
        return;
      }
      case 'tend': {
        const sb = g.camp.get('sickbay'); if (!sb) return;
        if (p.wph !== 't') { p.wph = 't'; goTo(sb.x + 1.5, sb.z + 1); return; }
        if (walk()) return;
        p.pose = g.people.some(o => o.hurt && o.mode === 'camp' && Math.hypot(o.x - sb.x, o.z - sb.z) < 5) ? 'collect' : 'idle';
        this.gainXp(p, k, dt / 30);
        return;
      }
    }
    // gathering: walk out, work, carry it home, drop it on the pile
    if (p.wph === '' || p.wph.startsWith('site')) {
      const s = this.source(k, p); if (!s) { this.idleNear(p, dt, F.x, F.z); return; }
      p.wph = 'go'; goTo(s.x, s.z); return;
    }
    if (walk()) return;
    if (p.wph === 'go') { p.wph = 'work'; p.wT = (k === 'fish' ? 12 : 4) + Math.random() * 2; }
    if (p.wph === 'work') {
      // stuck on a hated job, they slack off now and then
      if (p.hate === k && Math.random() < dt * 0.04) { p.wT += 4; p.poseO = 'slump'; p.poseT = 3; }
      p.pose = JOB[k].pose; if (k === 'fish') B_.faceToward(p, g.w.crash.x * 2 - F.x, g.w.crash.z * 2 - F.z);
      if ((p.wT -= dt * this.speed(p)) > 0) return;
      p.carry = k === 'water' ? 1 : k === 'food' || k === 'fish' ? 2 : 3;
      if (k !== 'food') p.bring = k === 'water' ? 'water' : k;
      p.wph = 'back'; const P = g.stock.pile; goTo(P.x + (Math.random() - 0.5) * 3, P.z + 1 + Math.random());
      return;
    }
    if (p.wph === 'back') {
      g.deposit(p); p.carry = 0; p.wph = '';
      this.gainXp(p, k, 1);
      g.chatter.notice(p);
      if (p.love === k && !this.likeKnown.has(p.id + ':love') && (p.xp[k] ?? 0) > 8) { this.likeKnown.add(p.id + ':love'); g.story.say(p, pickOf([`I could do ${JOB[k].verb} all day.`, `I love ${JOB[k].verb}.`])); g.story.mood(p, 'happy', 15); }
    }
  }

  /** Experience; twice as fast next to an expert at the same job. */
  private gainXp(p: Person, k: JobKind, n: number) {
    // a hidden skill shows the moment they do the work
    if (JOB[k].skill === p.per.skill && !this.g.story.skillKnown.has(p.id)) this.g.story.revealSkill(p, `${p.per.name} took one look at the ${JOB[k].verb} and showed everyone how it's done. A ${JOB[k].skill}.`);
    const teacher = this.g.people.some(o => o !== p && o.job === k && level(o.xp[k] ?? 0) === 3 && Math.hypot(o.x - p.x, o.z - p.z) < 10);
    const before = level(p.xp[k] ?? 0);
    p.xp[k] = (p.xp[k] ?? 0) + n * (teacher && before < 3 ? 2 : 1);
    if (level(p.xp[k]) > before && level(p.xp[k]) >= 2) this.g.story.log(`${p.per.name} is getting good at ${JOB[k].verb} (${LEVEL_WORD[level(p.xp[k])]}).`);
  }

  private slot(p: Person, b: Building): Pt {
    const crew = this.g.people.filter(o => o.job === 'build'), i = Math.max(0, crew.indexOf(p)), a = i * 2.1 + 0.4;
    if (b.kind === 'fence' && b.posts?.length) { const q = b.posts[Math.floor(b.progress * (b.posts.length - 1) + i * 3) % b.posts.length]; return this.g.grid.nearest(q.x, q.z) ?? q; }
    const r = b.kind === 'hut' || b.kind === 'storage' ? 2.6 : 1.8;
    return this.g.grid.nearest(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r) ?? b;
  }

  private idleNear(p: Person, _dt: number, x: number, z: number) {
    if (Math.hypot(p.x - x, p.z - z) > 6 && !p.path.length) this.g.bodies.go(p, x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4);
    if (p.path.length) { this.g.bodies.advance(p, this.g.bodies.speed(p), _dt); p.pose = 'walk'; } else p.pose = 'idle';
  }

  // ------------------------------------------------------------------ telling the player things

  status(k: JobKind): string {
    const g = this.g, crew = g.people.filter(p => p.job === k).length;
    if (!this.inShift(k)) return JOB[k].shift === 'night' ? 'Starts at dusk' : JOB[k].shift === 'evening' ? 'Evenings' : 'Done for the day';
    if (k === 'build') { const b = g.camp.queue[0]; if (b && !g.camp.target()) { const m = g.camp.waitingFor(b); return m ? `Waiting for ${m}` : 'Waiting'; } }
    if (this.want[k] === 0) return 'Not needed';
    if (JOB[k].outdoor && g.weather.rain > 0.78) return 'Raining';
    if (crew < this.want[k]) return 'Short-handed';
    return 'Covered';
  }

  /** The camp's biggest problems, for the GOALS box. */
  problems(): { key: string; text: string }[] {
    const g = this.g, out: { key: string; text: string }[] = [], C = g.camp;
    const where: Record<Mat, string> = { wood: 'a woodland', bamboo: 'a bamboo grove', stone: 'rocks in the hills or on the shore', vines: 'vines in the jungle', scrap: 'the wreck' };
    for (const b of C.queue.slice(0, 2)) {
      const m = C.waitingFor(b); if (!m) continue;
      if (out.some(o => o.key === 'mat' + m)) continue;
      const known = g.disc.pois.some(q => q.known && q.kind === 'material' && q.mat === m);
      out.push({ key: 'mat' + m, text: known ? `Camp needs ${m} for ${b.kind === 'hut' ? 'the hut' : 'it'} — people are on it` : `Camp needs ${m}: find ${where[m]}` });
    }
    if (g.era !== 'crash' && !C.has('storage') && !C.planned('storage') && g.stats.spoiled > 3) out.push({ key: 'spoil', text: 'Food is going bad: a storage hut would help' });
    for (const k of this.visible()) if (this.prio[k] === 2 && this.status(k) === 'Short-handed') out.push({ key: 'short' + k, text: `Not enough hands for ${JOB[k].label.toLowerCase()}` });
    const homeless = g.people.filter(p => !C.hutOf(p.id)).length;
    if (g.era !== 'crash' && g.weather.rain > 0.5 && homeless > 4 && !C.planned('hut')) out.push({ key: 'huts', text: `${homeless} people have no roof: build huts` });
    return out;
  }
}
