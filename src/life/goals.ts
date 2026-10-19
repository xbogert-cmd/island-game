import { has, Trait } from './persona';
import { Person } from './people';
import { BKind, BUILD } from './buildings';
import { PROP_TEXT } from './requests';
import { dirName } from './scouting';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

export type GoalKind = 'explore' | 'food' | 'water' | 'rest' | 'build' | 'salvage' | 'mend' | 'search' | 'hunt' | 'prepare';
export interface GoalOpt { kind: GoalKind; who: Person; title: string; line: string; x?: number; z?: number; prop?: BKind; a?: Person; b?: Person }

/** The group's plan for tomorrow: three people pitch it at the evening meeting, you pick one (or the most trusted wins). It starts at dawn. */
export class Goals {
  opts: GoalOpt[] = [];
  cur: GoalOpt | null = null;
  /** picked at the meeting, starts in the morning */
  next: GoalOpt | null = null;
  private judged = true;
  private day = 0;
  private start = 0;
  private ignored = new Map<number, number>();
  private planned: import('./buildings').Building | null = null;

  constructor(private g: Group) {}

  active(k: GoalKind) { return !!this.cur && !this.judged && this.cur.kind === k; }
  building(k: BKind | 'wreck') { const c = this.cur; return !!c && !this.judged && ((c.kind === 'build' && c.prop === k) || (k === 'wreck' && c.kind === 'salvage')); }

  update() {
    const g = this.g, h = g.clock.hour;
    if (!g.leader) return;
    // the morning: yesterday evening's pick starts
    if (this.next && this.day !== g.clock.day && h >= 6.5 && h < 18) { this.day = g.clock.day; const o = this.next; this.next = null; this.cur = o; this.judged = false; this.start = g.clock.minutes; g.stock.today = { food: 0, water: 0 }; this.begin(o); }
    if (this.opts.length && (h >= 22 || h < 6)) this.autoPick();
    if (this.cur && !this.judged && h >= 18.5) this.judge();
  }

  /** Walk to the fire for the morning huddle. Called from camp life. */
  drive(p: Person, dt: number) {
    const g = this.g, F = g.fire;
    if (!this.opts.length) { p.act = ''; return; }
    if (p.path.length) { g.bodies.advance(p, g.bodies.speed(p) * 1.2, dt); p.pose = 'walk'; return; }
    if (!p.poseO) p.pose = 'idle';
    g.bodies.faceToward(p, F.x, F.z);
  }

  choose(i: number) {
    const g = this.g, S = g.story, o = this.opts[i]; if (!o) return;
    for (const x of this.opts) {
      if (x === o) { this.ignored.set(x.who.id, 0); continue; }
      const n = (this.ignored.get(x.who.id) ?? 0) + 1; this.ignored.set(x.who.id, n);
      if (n >= 3) { this.ignored.set(x.who.id, 0); S.trust(x.who, -2); S.mood(x.who, 'angry', 30); g.requests.gripes.push({ p: x.who, text: 'Three days now. Nobody ever listens to me.' }); }
    }
    this.opts = []; this.next = o; this.day = -1;
    for (const p of g.people) if (p.act === 'huddle') { p.act = ''; p.actT = 1 + Math.random() * 3; if (Math.random() < 0.5) { p.poseO = 'cheer'; p.poseT = 1.2; } }
    S.trust(o.who, 2); S.mood(o.who, 'happy', 20); S.say(o.who, pickOf(["First thing tomorrow, then.", 'Good. We start at sunrise.', 'Right!']));
    S.log(`Tomorrow's plan, ${o.who.per.name}'s idea: ${o.title.toLowerCase()}.`);
    // a storm or a missing person can't wait for morning
    if (o.kind === 'prepare' && g.village.stormIn === 0 || o.kind === 'search') { this.next = null; this.cur = o; this.judged = false; this.start = g.clock.minutes; this.begin(o); }
    g.meeting.picked();
  }

  /** Nobody picked (or you weren't there): the most trusted idea wins. */
  autoPick(away = false) {
    if (!this.opts.length) return;
    let bi = 0; this.opts.forEach((o, i) => { if (o.who.per.trust > this.opts[bi].who.per.trust) bi = i; });
    this.g.story.toast(away ? `The camp met without you and went with ${this.opts[bi].who.per.name}'s plan.` : `Nobody decided, so they went with ${this.opts[bi].who.per.name}'s plan.`, 'info', this.opts[bi].who);
    this.choose(bi);
  }

  // ------------------------------------------------------------------

  offer(): boolean {
    const g = this.g, S = g.story, L = g.leader!, R = g.requests;
    const pool = g.people.filter(p => p !== L && !p.kid && !p.alone && !p.hurt && p.health < 2 && (p.mode === 'camp' || p.mode === 'follow' || p.mode === 'wait'));
    if (pool.length < 3) return false;
    const used = new Set<Person>();
    const pitcher = (likes: Trait[], skill?: string, not: Person[] = []) => {
      const c = pool.filter(p => !used.has(p) && !not.includes(p));
      const best = c.filter(p => (skill && p.per.skill === skill) || likes.some(t => has(p.per, t)));
      const p = pickOf(best.length ? best : c); if (p) used.add(p); return p;
    };
    const cands: (() => GoalOpt | null)[] = [];
    const n = g.people.length, low = (v: number) => v < n * 0.8;
    // a storm on the way beats everything
    if (g.village.stormSoon()) cands.push(() => { const w = pitcher(['calm', 'hardworking'], 'builder'); return w && { kind: 'prepare', who: w, title: 'PREPARE FOR THE STORM', line: g.village.stormIn === 0 ? "It's coming today. Tie everything down, get the food under cover." : "The storm hits tomorrow. Let's tie everything down today." }; });
    // someone missing comes first
    const missing = g.people.find(p => (p.mode === 'lost' || p.mode === 'hurt') && g.disc.markers.some(m => m.who === p));
    if (missing) cands.push(() => { const w = pitcher(['kind', 'brave'], undefined, []); return w && { kind: 'search', who: w, a: missing, title: `FIND ${missing.per.name.toUpperCase()}`, line: `${missing.per.name} is still out there. Nothing else matters today.` }; });
    const food = g.disc.nearestKnown('food', g.fire), water = g.disc.nearestKnown('water', g.fire);
    if (food && low(g.stock.totalFood)) cands.push(() => { const w = pitcher(['hardworking'], 'cook'); return w && { kind: 'food', who: w, title: 'STOCK UP ON FOOD', line: "The pile's almost empty. Everyone gathers food today." }; });
    if (water && low(g.stock.water)) cands.push(() => { const w = pitcher(['hardworking', 'calm']); return w && { kind: 'water', who: w, title: 'FETCH WATER', line: "We're nearly out of water. Let's fill every jug." }; });
    const rest: (() => GoalOpt | null)[] = [];
    if (food && !low(g.stock.totalFood)) rest.push(() => { const w = pitcher(['hardworking'], 'cook'); return w && { kind: 'food', who: w, title: 'STOCK UP ON FOOD', line: "Let's build up the food pile while we can." }; });
    if (water && !low(g.stock.water)) rest.push(() => { const w = pitcher(['calm']); return w && { kind: 'water', who: w, title: 'FETCH WATER', line: 'More water. You can never have too much.' }; });
    rest.push(() => { const w = pitcher(['lazy', 'kind']); return w && { kind: 'rest', who: w, title: 'REST AND RECOVER', line: g.people.some(p => p.hurt) ? 'People are hurt. We should rest today and heal.' : "We're exhausted. One quiet day. Please." }; });
    const mk = g.disc.markers.filter(m => m.kind === '?').sort((a, b) => Math.hypot(a.x - g.fire.x, a.z - g.fire.z) - Math.hypot(b.x - g.fire.x, b.z - g.fire.z))[0];
    const unknown = g.disc.pois.find(q => q.major && !q.known);
    if (mk) rest.push(() => { const w = pitcher(['brave', 'curious']); return w && { kind: 'explore', who: w, x: mk.x, z: mk.z, title: 'CHECK THE RUMOR', line: `Let's send people to see if it's true: "${mk.text}".` }; });
    else if (unknown) rest.push(() => { const w = pitcher(['brave', 'curious']), d = dirName(unknown.x - g.fire.x, unknown.z - g.fire.z); return w && { kind: 'explore', who: w, x: unknown.x, z: unknown.z, title: `EXPLORE ${d.toUpperCase()}`, line: `Nobody has been ${d} yet. Let's send people out.` }; });
    // builds: in the crash, only the simple beach things; once the camp exists, real buildings
    const C = g.camp, wants = C.wanted();
    for (const k of ['signalFire', 'sos', 'rainCatcher'] as BKind[]) if (!C.has(k)) wants.push([k, `If we all pitch in, we can build ${PROP_TEXT[k]} today.`, 'builder']);
    for (const [k, line, sk] of wants.filter(w => !C.planned(w[0]) || w[0] === 'hut').slice(0, 4)) rest.push(() => { const w = pitcher(['hardworking'], sk); return w && { kind: 'build', who: w, prop: k, title: `BUILD ${BUILD[k].label.toUpperCase()}`, line }; });
    if (!R.wreckDone) rest.push(() => { const w = pitcher(['brave'], 'mechanic'); return w && { kind: 'salvage', who: w, title: 'STRIP THE WRECK', line: "There's still stuff in that plane. Let's take it apart, carefully." }; });
    const ra = pool.find(a => pool.some(b => b !== a && S.rel(a, b) < -30));
    const rb = ra && pool.find(b => b !== ra && S.rel(ra, b) < -30);
    if (ra && rb) rest.push(() => { const w = pitcher(['calm', 'kind'], undefined, [ra, rb]); return w && { kind: 'mend', who: w, a: ra, b: rb, title: 'CLEAR THE AIR', line: `${ra.per.name} and ${rb.per.name} need to sort things out before someone gets hurt.` }; });
    if (g.cat.canHunt()) cands.push(() => { const w = pitcher(['brave', 'hothead']); return w && { kind: 'hunt', who: w, title: `HUNT ${g.cat.name.toUpperCase() || 'THE CAT'}`, line: `We have spears now. Let's end this. You lead, we follow.` }; });
    rest.sort(() => Math.random() - 0.5);
    const out: GoalOpt[] = [];
    for (const c of [...cands, ...rest]) {
      if (out.length >= 3) break;
      const o = c(); if (!o || out.some(x => x.kind === o.kind)) { if (o) used.delete(o.who); continue; }
      out.push(o);
    }
    if (out.length < 2) return false;
    this.opts = out; this.cur = null;
    // everyone gathers at the fire; the three make their case
    const F = g.fire, at = g.people.filter(p => p.mode === 'camp' && !p.hurt && p.act !== 'job' && p.act !== 'ask' && p.pose !== 'sleep');
    at.forEach((p, i) => {
      const a = (i / at.length) * 6.28 + 0.4, r = 3 + (i % 2);
      p.act = 'huddle'; p.carry = 0; p.partner = null; g.bodies.go(p, F.x + Math.cos(a) * r, F.z + Math.sin(a) * r);
    });
    const after = g.meeting.reports.length * 2400;      // first how the day went, then the pitches
    out.forEach((o, i) => setTimeout(() => { if (this.opts.includes(o)) { S.say(o.who, o.line, 4.5); o.who.poseO = 'point'; o.who.poseT = 1.5; } }, 1500 + after + i * 2600));
    S.log(`Evening. Everyone gathered at the fire to talk about the day and decide on tomorrow.`);
    g.onAsk();
    g.hint('goal', 'Every evening the camp meets at the fire. Pick tomorrow\'s plan, and set which way the camp is heading. They do the rest.');
    return true;
  }

  /** Things that start the moment a plan is picked. */
  private begin(o: GoalOpt) {
    const g = this.g, S = g.story, R = g.requests, L = g.leader!;
    const crew = (n: number) => [o.who, ...g.people.filter(p => p !== o.who && p !== L && p.mode === 'camp' && !p.hurt && !R.busy(p) && p.act !== 'ask' && has(p.per, 'lazy') === false)].slice(0, n);
    switch (o.kind) {
      case 'explore': {
        const v = g.people.filter(p => p !== L && p.mode === 'camp' && !p.hurt && (has(p.per, 'brave') || has(p.per, 'curious') || p === o.who) && !g.scouting.refusal(p)).slice(0, 2);
        for (const p of v) g.scouting.send(p, o.x!, o.z!);
        if (!v.length) S.say(o.who, "...Nobody wants to go. Typical.");
        break;
      }
      case 'build': {
        // into the build queue, at the front; the jobs system sends builders and gatherers
        const b = g.camp.queue.find(x => x.kind === o.prop) ?? g.camp.add(o.prop!, true);
        if (b) { g.camp.toFront(b); this.planned = b; }
        else S.say(o.who, "...there's nowhere sensible to put it.");
        break;
      }
      case 'salvage': {
        const c = crew(3), good = Math.random() < 0.85;
        R.job(c, R.spot('wreck'), 'search', 50, () => {
          if (good) { R.wreckDone = true; g.stock.add('snacks', 8); g.stock.add('water', 6); g.stock.add('scrap', 8); g.stock.tools.knife++; g.stock.toolKnown.add('knife'); S.toast('We stripped the wreck: snacks, water bottles, a knife.', 'good'); S.log('We took the wreck apart and found snacks and bottled water.'); g.onSting(true); }
          else { const p = pickOf(c); p.hurt = true; g.startHealing(p); S.toast(`${p.per.name} got cut on the wreck. We found nothing.`, 'bad', p); g.onSting(false); }
        });
        break;
      }
      case 'mend': {
        const a = o.a!, b = o.b!;
        if (a.mode === 'camp' && b.mode === 'camp') { a.act = 'talk'; a.partner = b; a.actT = 25; b.act = 'listen'; b.partner = a; b.actT = 25; b.path = []; g.bodies.go(a, b.x + 1.2, b.z); }
        break;
      }
      case 'hunt': g.cat.startHunt(); S.say(o.who, 'Spears, everyone. Stay together.'); break;
      case 'prepare': g.village.prepare(o.who); S.say(o.who, 'Ropes on every roof! Food under cover!'); break;
      case 'search': for (const p of g.people) if (p.mode === 'camp' && Math.random() < 0.4) S.say(p, 'Hang on. We\'re coming.'); break;
    }
  }

  private judge() {
    const g = this.g, S = g.story, o = this.cur!, n = g.people.length;
    this.judged = true;
    let met = true, text = '';
    switch (o.kind) {
      case 'food': met = g.stock.today.food >= n * 0.8; text = met ? 'The food pile is full tonight.' : "We didn't gather nearly enough food."; break;
      case 'water': met = g.stock.today.water >= n * 0.8; text = met ? 'Every jug is full.' : 'Still short on water.'; break;
      case 'rest': text = 'A quiet day. People feel a little better.'; for (const p of g.people) if (p.mode === 'camp') S.mood(p, 'happy', 20); break;
      case 'explore': met = g.lastFind > this.start; text = met ? 'The scouts turned something up.' : 'Nothing new today.'; break;
      case 'build': { const b = this.planned, pr = b ? b.progress : 0; met = pr >= 0.5; const L = PROP_TEXT[o.prop!]; text = pr >= 1 ? `${L.charAt(0).toUpperCase() + L.slice(1)} is standing.` : met ? `${L.charAt(0).toUpperCase() + L.slice(1)} is coming along.` : b && g.camp.waitingFor(b) ? `We ran out of ${g.camp.waitingFor(b)} for ${L}.` : `Barely started on ${L}.`; break; }
      case 'salvage': met = g.requests.wreckDone; text = met ? 'The wreck gave us what it had.' : 'The wreck gave us nothing.'; break;
      case 'mend': { const a = o.a!, b = o.b!; S.addRel(a, b, 15); S.say(a, `Okay, ${b.per.name}. We're good.`); text = `${a.per.name} and ${b.per.name} made peace. For now.`; break; }
      case 'hunt': met = g.cat.phase === 'dead'; text = met ? `${g.cat.name || 'The cat'} is dead.` : `${g.cat.name || 'The cat'} is still out there.`; break;
      case 'prepare': text = 'Everything is tied down. Let it come.'; break;
      case 'search': met = !(o.a!.mode === 'lost' || o.a!.mode === 'hurt'); text = met ? `${o.a!.per.name} is safe.` : `${o.a!.per.name} is still out there.`; break;
    }
    S.toast(`Today's plan: ${text}`, met ? 'good' : 'bad', o.who);
    S.log(text);
    S.trustAll(met ? 2 : -1, g.leader); if (met) S.trust(o.who, 1);
  }
}
