import { has } from './persona';
import { Person, Pose, Pt } from './people';
import { BKind, BUILD } from './buildings';
import { rumorError } from './scouting';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface Answer { label: string; cls?: string; fn: () => void }
export interface Req {
  p: Person; kind: string; text: string; answers: Answer[];
  /** what they do if you never answer */
  ignore: () => void;
  /** is it actually a good idea? (hidden) */
  good: boolean;
  /** hesitant asking: shuffles and looks away while waiting */
  shy: boolean;
  t: number; arrived: boolean; repath: number;
}
interface Job { who: Person[]; x: number; z: number; pose: Pose; secs: number; t: number; walkT: number; done: () => void }

export const PROP_TEXT = Object.fromEntries(Object.entries(BUILD).map(([k, d]) => [k, d.label])) as Record<BKind, string>;

/**
 * People coming to you: ideas (some good, some bad), questions, disputes, secrets, pairs.
 * One open request at a time. Ignore it and they decide for themselves.
 * Also runs "jobs": someone walks somewhere, works for a while, and something comes of it.
 */
export class Requests {
  cur: Req | null = null;
  jobs: Job[] = [];
  /** ideas that worked / didn't, per person */
  record = new Map<number, { good: number; bad: number }>();
  /** grudges for the campfire: good ideas you turned down */
  gripes: { p: Person; text: string }[] = [];
  wreckDone = false;
  private nextT = 70;
  private fishDay = -1;
  private lookSpot: Pt | null = null;
  private spots: Partial<Record<BKind, Pt>> = {};

  constructor(private g: Group) {}

  // ------------------------------------------------------------------ public

  answer(i: number) {
    const r = this.cur; if (!r) return;
    this.close();
    r.answers[i]?.fn();
  }

  /** Where each kind of thing gets built (the camp's own spot for it, decided once). */
  spot(kind: BKind | 'wreck'): Pt {
    const g = this.g, F = g.fire, near = (x: number, z: number) => g.grid.nearest(x, z) ?? { x, z };
    if (kind === 'wreck') return near(g.w.crash.x + 3, g.w.crash.z + 3);
    if (kind === 'lookout') {
      if (this.lookSpot) return this.lookSpot;
      let best = { x: F.x, z: F.z }, bh = -1;
      for (let k = 0; k < 400; k++) {
        const a = k * 2.399, r = 12 + (k % 40), x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r;
        const h = g.grid.walkable(x, z) ? g.bodies.ground({ x, z }) : -1;
        if (h > bh) { bh = h; best = { x, z }; }
      }
      return (this.lookSpot = best);
    }
    const b = g.camp.list.find(x => x.kind === kind);
    if (b) return b;
    return (this.spots[kind] ??= g.camp.site(kind) ?? near(F.x + 6, F.z + 6));
  }

  /** Send people to do something. `done` runs when the work is finished. */
  job(who: Person[], at: Pt, pose: Pose, secs: number, done: () => void) {
    who.forEach((p, i) => {
      this.g.leaveParty(p);
      p.mode = 'camp'; p.act = 'job'; p.carry = 0; p.partner = null;
      const a = i * 2.1;
      this.g.bodies.go(p, at.x + (i ? Math.cos(a) * 1.4 : 0), at.z + (i ? Math.sin(a) * 1.4 : 0));
    });
    this.jobs.push({ who, x: at.x, z: at.z, pose, secs, t: 0, walkT: 0, done });
  }
  busy(p: Person) { return this.jobs.some(j => j.who.includes(p)); }

  /** One person's idea worked: it's standing, no materials needed. */
  build(kind: BKind) { this.g.camp.place(kind, true); }

  // ------------------------------------------------------------------ per frame

  update(dt: number) {
    const g = this.g, L = g.leader; if (!L) return;
    const h = g.clock.hour;
    // jobs
    for (const j of [...this.jobs]) {
      j.who = j.who.filter(p => p.act === 'job' && p.mode === 'camp');
      if (!j.who.length) { this.jobs = this.jobs.filter(x => x !== j); continue; }
      const there = j.who.every(p => !p.path.length);
      if (there || (j.walkT += dt) > 120) j.t += dt;
      if (j.t >= j.secs) {
        this.jobs = this.jobs.filter(x => x !== j);
        for (const p of j.who) { p.act = ''; p.actT = 2; p.path = []; }
        j.done();
      }
    }
    // the open request
    const r = this.cur;
    if (r) {
      r.t += dt;
      const p = r.p, far = Math.hypot(p.x - L.x, p.z - L.z);
      const gone = p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt' || p.hurt || (p.mode === 'camp' && p.act !== 'ask');
      if (gone || h >= 20.5) { this.close(); return; }
      if (r.t > (r.arrived ? 75 : 110) || far > 100) { this.close(); g.story.say(p, 'Never mind.'); r.ignore(); return; }
    } else if ((this.nextT -= dt) <= 0 && h > 7 && h < 18.5 && !g.goals.opts.length) {
      this.nextT = 160 + Math.random() * 140;
      this.spawn(L);
    }
  }

  /** Movement for people in a job or walking over to ask something. Called from camp life. */
  drive(p: Person, dt: number) {
    const g = this.g, B_ = g.bodies;
    if (p.act === 'job') {
      const j = this.jobs.find(x => x.who.includes(p));
      if (!j) { p.act = ''; return; }
      if (p.path.length) { B_.advance(p, B_.speed(p) * 1.1, dt); p.pose = p.hurt ? 'limp' : 'walk'; return; }
      p.pose = j.pose; B_.faceToward(p, j.x + (p === j.who[0] ? 1 : 0), j.z);
      if (j.pose === 'build' && Math.random() < dt * 2) g.fx.emit('dot1', j.x + (Math.random() - 0.5), B_.ground(p) + 0.4, j.z + (Math.random() - 0.5), { vy: 1.5, vx: (Math.random() - 0.5) * 2, grav: 6, max: 0.5, r: 0.75, g: 0.6, b: 0.4 });
      return;
    }
    // walking over to ask
    const r = this.cur, L = g.leader!;
    if (!r || r.p !== p) { p.act = ''; p.ask = false; return; }
    const d = Math.hypot(p.x - L.x, p.z - L.z);
    if (d > 3.2) {
      if ((r.repath -= dt) <= 0 || !p.path.length) { r.repath = 1.5; B_.go(p, L.x + 1.6, L.z + 0.6); }
      B_.advance(p, B_.speed(p) * (d > 12 ? 1.5 : 1), dt); p.pose = d > 12 ? 'run' : 'walk';
      return;
    }
    p.path = [];
    if (!r.arrived) { r.arrived = true; r.t = 0; g.onAsk(); g.story.say(p, pickOf([`${L.per.name}? Got a second?`, 'Hey. Can I ask you something?', 'Um, excuse me...']), 2.4); }
    // wave for attention now and then; the hesitant ones shuffle and look away
    const ph = r.t % 5;
    if (r.shy && ph > 2.5) { p.pose = 'slump'; B_.faceToward(p, p.x * 2 - L.x, p.z * 2 - L.z); }
    else { p.pose = ph < 1.2 ? 'wave' : 'idle'; B_.faceToward(p, L.x, L.z); }
  }

  // ------------------------------------------------------------------ making requests

  private close() {
    const r = this.cur; if (!r) return;
    this.cur = null; r.p.ask = false;
    if (r.p.act === 'ask') { r.p.act = ''; r.p.actT = 2; r.p.path = []; }
  }

  private spawn(L: Person) {
    const g = this.g;
    const cands = g.people.filter(p => p !== L && !p.hurt && p.pose !== 'sleep' && !this.busy(p) &&
      (p.mode === 'follow' || p.mode === 'wait' || (p.mode === 'camp' && Math.hypot(p.x - L.x, p.z - L.z) < 70 && p.act !== 'huddle')));
    if (!cands.length) return;
    const makers = [...(this.g.era === 'camp' ? [this.suggestBuild, this.suggestBuild] : []), this.pair, this.hoard, this.dispute, this.ration, this.whyThem, this.fish, this.signal, this.wreck, this.rainCatcher, this.lookout, this.sos, this.rescue]
      .sort(() => Math.random() - 0.5);
    for (const p of [...cands].sort(() => Math.random() - 0.5)) for (const mk of makers) {
      const r = mk.call(this, p);
      if (!r) continue;
      this.cur = r; p.ask = true;
      if (p.mode === 'camp') { p.act = 'ask'; p.path = []; p.carry = 0; p.partner = null; }
      else { r.arrived = true; g.onAsk(); }
      g.hint('ask', 'Someone with a ! wants to talk. Click them to answer, or ignore them and they will decide alone.');
      // someone who knows better pulls a face at a bad idea
      if (!r.good && r.kind === 'idea' && Math.random() < 0.45) {
        const sk = g.people.find(o => o !== p && o !== L && o.mode === 'camp' && Math.hypot(o.x - p.x, o.z - p.z) < 25 && (g.story.rel(o, p) < 10 || has(o.per, 'honest')));
        if (sk) setTimeout(() => g.story.say(sk, pickOf([`${p.per.name}? Really?`, `I wouldn't let ${p.per.name} near that.`, 'Hm. We\'ll see.', 'Oh, this should be good.'])), 5000);
      }
      return;
    }
  }

  private req(p: Person, kind: string, text: string, good: boolean, answers: Answer[], ignore: () => void, shy = false): Req {
    return { p, kind, text, good, answers, ignore, shy, t: 0, arrived: false, repath: 0 };
  }

  /** How an idea is pitched gives it away, sometimes. */
  private pitch(good: boolean, plain: string) {
    const r = Math.random();
    if (!good && r < 0.5) return { text: plain + ' ' + pickOf(["Trust me, it's easy.", "I've done this a hundred times.", 'Easy. Really.', 'What could go wrong?']), shy: false };
    if ((!good && r < 0.85) || (good && r < 0.12)) return { text: pickOf(['Um... ', 'So... maybe... ', 'I was thinking... ']) + lower(plain), shy: true };
    return { text: plain, shy: false };
  }

  private chance(_p: Person, base: number, mods: [boolean, number][]) {
    let q = base; for (const [c, v] of mods) if (c) q = v;     // later rules win
    return Math.random() < Math.max(0.05, Math.min(0.97, q));
  }

  /** The asker's idea gets a yes: send them, then see how it went. */
  private idea(p: Person, good: boolean, crew: Person[], at: Pt, pose: Pose, secs: number, win: () => void, fail: () => void, what: string) {
    const S = this.g.story;
    S.say(p, pickOf(['On it!', "You won't regret it.", 'Right away.']));
    S.log(`${p.per.name} went off to try ${what}.`);
    this.job(crew, at, pose, secs, () => {
      const rec = this.record.get(p.id) ?? { good: 0, bad: 0 };
      if (good) { rec.good++; win(); S.trust(p, 3); S.mood(p, 'happy', 20); p.poseO = 'cheer'; p.poseT = 1.6; this.g.onSting(true); }
      else { rec.bad++; fail(); S.mood(p, 'sad', 25); p.poseO = 'slump'; p.poseT = 2.5; this.g.onSting(false); }
      this.record.set(p.id, rec);
    });
  }
  private declined(p: Person, good: boolean, what: string) {
    const S = this.g.story;
    if (good) { S.trust(p, -2); S.mood(p, 'sad', 15); this.gripes.push({ p, text: `We could have had ${what} by now, if anyone listened.` }); }
    S.say(p, good ? pickOf(['...Fine.', 'Your call.', 'Okay. Forget it.']) : pickOf(['Okay.', 'Fair enough.']));
  }
  private helper(p: Person) {
    return this.g.people.find(o => o !== p && o !== this.g.leader && o.mode === 'camp' && !o.hurt && o.act !== 'ask' && !this.busy(o) && this.g.story.rel(p, o) > 0) ?? null;
  }
  /** Ignoring an idea: the bold do it anyway, the lazy forget it. */
  private ignoreIdea(p: Person, go: () => void) {
    const S = this.g.story;
    if (has(p.per, 'hothead') || has(p.per, 'brave') || has(p.per, 'loner')) { S.say(p, "Forget it, I'll do it myself."); go(); }
    else if (has(p.per, 'kind')) S.say(p, "You're busy. I'll ask another time.");
    else { S.trust(p, -1); S.mood(p, 'sad', 10); }
  }

  // ------------------------------------------------------------------ ideas

  private fish(p: Person) {
    const g = this.g, S = g.story;
    if (this.fishDay === g.clock.day || this.busy(p)) return null;
    if (p.per.skill !== 'fisher' && Math.random() < 0.5) return null;
    const good = this.chance(p, 0.35, [[p.per.skill === 'fisher', 0.95], [has(p.per, 'liar'), 0.15]]);
    const run = () => {
      this.fishDay = g.clock.day;
      this.idea(p, good, [p], g.fishSpot, 'fish', 40, () => {
        const n = g.camp.has('dryingRack') ? 6 : 4;
        g.stock.add('fish', n);
        S.toast(`${p.per.name} caught fish!`, 'good', p); S.log(`${p.per.name} came back from the rocks with fish.`);
        S.revealSkill(p, `${p.per.name} pulled fish out of the surf like it was nothing. They grew up fishing.`);
        if (!g.camp.has('dryingRack')) { this.build('dryingRack'); S.log(`${p.per.name} put up a rack to dry the fish, so it keeps.`); }
      }, () => { S.say(p, 'Nothing bit. Not one.'); S.log(`${p.per.name} sat on the rocks all afternoon and caught nothing.`); }, 'fishing off the rocks');
    };
    const t = this.pitch(good, 'Let me take a line out on the rocks. We could have fish tonight.');
    return this.req(p, 'idea', t.text, good, [{ label: 'GO FOR IT', cls: 'go', fn: run }, { label: 'NOT TODAY', fn: () => this.declined(p, good, 'fish') }], () => this.ignoreIdea(p, run), t.shy);
  }

  private signal(p: Person) {
    const g = this.g, S = g.story;
    if (g.camp.has('signalFire') || g.goals.building('signalFire')) return null;
    const good = this.chance(p, 0.55, [[has(p.per, 'lazy'), 0.3], [has(p.per, 'hardworking'), 0.75], [p.per.skill === 'builder', 0.95]]);
    const run = () => {
      const h = this.helper(p);
      this.idea(p, good, h ? [p, h] : [p], this.spot('signalFire'), 'build', 60, () => {
        this.build('signalFire');
        S.toast('The signal fire is built. It will burn every night.', 'good', p); S.log(`${p.per.name} built a signal fire on the beach. If a ship passes at night, they'll see it.`);
        S.trustAll(2, g.leader); for (const o of g.people) if (o.mode === 'camp') S.mood(o, 'happy', 15);
      }, () => { S.toast(`${p.per.name}'s signal fire collapsed in the wind.`, 'bad', p); S.log(`${p.per.name}'s signal fire fell apart before it was finished. A wasted day.`); }, 'a signal fire');
    };
    const t = this.pitch(good, 'We should build a signal fire on the beach. A big one. Ships might see it.');
    return this.req(p, 'idea', t.text, good, [{ label: 'BUILD IT', cls: 'go', fn: run }, { label: 'NOT NOW', fn: () => this.declined(p, good, 'a signal fire') }], () => this.ignoreIdea(p, run), t.shy);
  }

  private wreck(p: Person) {
    const g = this.g, S = g.story;
    if (this.wreckDone || g.goals.building('wreck')) return null;
    const good = this.chance(p, 0.5, [[has(p.per, 'brave'), 0.6], [p.per.skill === 'mechanic', 0.9], [p.per.weakness === 'clumsy', 0.2]]);
    const run = () => this.idea(p, good, [p], this.spot('wreck'), 'search', 40, () => {
      this.wreckDone = true; g.stock.add('snacks', 8); g.stock.add('water', 6); g.stock.add('scrap', 6);
      S.toast(`${p.per.name} dug snacks and water bottles out of the wreck!`, 'good', p); S.log(`${p.per.name} crawled through the wreck and came out with snacks and water.`);
    }, () => {
      p.hurt = true; S.say(p, 'Argh! Sharp metal!'); g.startHealing(p);
      S.toast(`${p.per.name} cut themselves badly in the wreck.`, 'bad', p); S.log(`${p.per.name} got hurt crawling through the wreck. Found nothing.`);
    }, 'searching the wreck');
    const t = this.pitch(good, 'There might be more supplies in the wreck. Let me dig through it.');
    return this.req(p, 'idea', t.text, good, [{ label: 'CAREFUL', cls: 'go', fn: run }, { label: 'TOO RISKY', fn: () => this.declined(p, good, 'supplies from the wreck') }], () => this.ignoreIdea(p, run), t.shy);
  }

  private rainCatcher(p: Person) {
    const g = this.g, S = g.story;
    if (g.camp.has('rainCatcher') || g.goals.building('rainCatcher')) return null;
    const good = this.chance(p, 0.5, [[has(p.per, 'curious'), 0.7], [p.per.skill === 'builder', 0.92], [p.per.skill === 'mechanic', 0.85]]);
    const run = () => this.idea(p, good, [p], this.spot('rainCatcher'), 'build', 45, () => {
      this.build('rainCatcher');
      S.toast(`${p.per.name} rigged a rain catcher. Free water when it rains.`, 'good', p); S.log(`${p.per.name} stretched a tarp to catch rainwater.`);
    }, () => { S.say(p, 'It leaks everywhere...'); S.log(`${p.per.name}'s rain catcher leaked like a sieve.`); }, 'a rain catcher');
    const t = this.pitch(good, 'If we stretch a tarp between two poles, we could catch rainwater.');
    return this.req(p, 'idea', t.text, good, [{ label: 'TRY IT', cls: 'go', fn: run }, { label: 'NO', fn: () => this.declined(p, good, 'a rain catcher') }], () => this.ignoreIdea(p, run), t.shy);
  }

  private lookout(p: Person) {
    const g = this.g, S = g.story;
    if (g.camp.has('lookout')) return null;
    const s = this.spot('lookout');
    const target = g.disc.pois.filter(q => q.major && !q.known && !g.disc.markers.some(m => m.poi === q)).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (!target) return null;
    const good = this.chance(p, 0.45, [[has(p.per, 'brave'), 0.6], [has(p.per, 'cowardly'), 0.2], [p.per.skill === 'climber', 0.95], [p.per.weakness === 'clumsy', 0.2]]);
    const run = () => this.idea(p, good, [p], s, 'search', 40, () => {
      this.build('lookout');
      const e = rumorError(p.per);
      g.disc.rumor(target, e.off, e.r, `${p.per.name} saw ${target.label} from the hill`, p);
      S.toast(`${p.per.name} spotted ${target.label} from up high!`, 'good', p); S.log(`${p.per.name} climbed the high ground and spotted ${target.label} in the distance. They left a flag up there.`);
      S.revealSkill(p, `${p.per.name} went up the rocks without a second thought. A climber.`);
    }, () => {
      p.hurt = true; S.say(p, 'Whoa-! Ow...'); g.startHealing(p);
      S.toast(`${p.per.name} fell climbing.`, 'bad', p); S.log(`${p.per.name} slipped on the climb and came down hurt.`);
    }, 'climbing for a look');
    const t = this.pitch(good, "I could climb up the high ground and see what's out there.");
    return this.req(p, 'idea', t.text, good, [{ label: 'GO LOOK', cls: 'go', fn: run }, { label: 'STAY DOWN', fn: () => this.declined(p, good, 'a lookout') }], () => this.ignoreIdea(p, run), t.shy);
  }

  private sos(p: Person) {
    const g = this.g, S = g.story;
    if (g.camp.has('sos') || g.goals.building('sos')) return null;
    const good = this.chance(p, 0.8, [[has(p.per, 'lazy'), 0.35]]);
    const run = () => {
      const h = this.helper(p);
      this.idea(p, good, h ? [p, h] : [p], this.spot('sos'), 'collect', 50, () => {
        this.build('sos');
        S.toast('SOS is spelled out on the beach in stones.', 'good', p); S.log(`${p.per.name} laid out SOS on the beach, big enough to see from a plane.`);
        S.trustAll(1, g.leader); for (const o of g.people) if (o.mode === 'camp') S.mood(o, 'happy', 10);
      }, () => { S.say(p, 'The tide took half the rocks...'); S.log(`${p.per.name} built SOS too close to the water. The tide took it.`); }, 'an SOS sign');
    };
    const t = this.pitch(good, "Let's spell SOS on the beach with rocks. Big enough for a plane to see.");
    return this.req(p, 'idea', t.text, good, [{ label: 'DO IT', cls: 'go', fn: run }, { label: 'LATER', fn: () => this.declined(p, good, 'an SOS sign') }], () => this.ignoreIdea(p, run), t.shy);
  }

  /** Camp era: someone wants something built. Yes puts it in the build queue and they throw themselves into it. */
  private suggestBuild(p: Person) {
    const g = this.g, S = g.story, w = g.camp.wanted();
    if (!w.length || p.mode !== 'camp') return null;
    const [kind, line, sk] = w.find(x => x[2] === p.per.skill) ?? w[(Math.random() * w.length) | 0];
    const good = this.chance(p, 0.6, [[has(p.per, 'lazy'), 0.4], [has(p.per, 'liar'), 0.35], [has(p.per, 'hardworking'), 0.75], [p.per.skill === sk || p.per.skill === 'builder', 0.95]]);
    const t = this.pitch(good, line);
    return this.req(p, 'idea', t.text, good, [
      { label: 'BUILD IT', cls: 'go', fn: () => {
        const b = g.camp.add(kind, true); if (!b) { S.say(p, "...there's nowhere to put it."); return; }
        b.doubt = !good; S.say(p, pickOf(["I'll get started.", 'Leave it to me.', 'Right away.']));
        S.log(`${p.per.name} talked us into building ${BUILD[kind].label}.`);
        if (p.mode === 'camp') { p.job = 'build'; p.wph = ''; }
        const rec = this.record.get(p.id) ?? { good: 0, bad: 0 }; if (good) rec.good++; else rec.bad++; this.record.set(p.id, rec);
      } },
      { label: 'NOT YET', fn: () => this.declined(p, good, BUILD[kind].label) },
    ], () => { S.trust(p, -1); }, t.shy);
  }

  // ------------------------------------------------------------------ questions, disputes, secrets, pairs

  private rescue(p: Person) {
    const S = this.g.story, scared = has(p.per, 'cowardly') || p.per.secret === 'hiddenFear', honest = has(p.per, 'honest');
    if (Math.random() < 0.5) return null;
    return this.req(p, 'question', 'Be honest with me. Is anyone actually coming for us?', true, [
      { label: 'YES. HOLD ON.', fn: () => { if (honest) { S.say(p, "...You don't know that."); S.trust(p, -2); } else { S.say(p, 'Okay. Okay. Thank you.'); S.trust(p, 3); S.mood(p, 'happy', 15); } } },
      { label: "I DON'T KNOW", fn: () => { if (honest) { S.say(p, 'Thanks for being straight with me.'); S.trust(p, 4); } else if (scared) { S.say(p, "That's not what I wanted to hear."); S.mood(p, 'scared', 30); S.trust(p, -1); } else { S.say(p, 'Yeah. Me neither.'); S.trust(p, 1); } } },
    ], () => { S.mood(p, 'sad', 15); S.trust(p, -1); }, scared);
  }

  private ration(p: Person) {
    const g = this.g, S = g.story;
    if (g.stock.ration > 0 || g.stock.totalFood > g.people.length * 1.2 || !(has(p.per, 'kind') || has(p.per, 'calm') || has(p.per, 'hardworking'))) return null;
    return this.req(p, 'question', 'The food is running low. Should we cut everyone to half portions for a while?', true, [
      { label: 'HALF PORTIONS', fn: () => {
        g.stock.ration = 3; S.say(p, "It's the right call."); S.trust(p, 2); S.log('We went on half portions.');
        for (const o of g.people) if (has(o.per, 'selfish') || has(o.per, 'hothead')) { S.mood(o, 'angry', 20); S.trust(o, -2); }
      } },
      { label: 'WE EAT', fn: () => { S.say(p, "Okay. I hope you're right."); S.trust(p, -1); for (const o of g.people) if (has(o.per, 'selfish')) S.trust(o, 1); } },
    ], () => {});
  }

  private whyThem(p: Person) {
    const g = this.g, S = g.story, t = g.scouting.trips.find(x => x.p !== p);
    if (!t || !(has(p.per, 'brave') || has(p.per, 'curious')) || p.per.trust < 30) return null;
    const o = t.p;
    return this.req(p, 'question', `Why did you send ${o.per.name} out there and not me?`, true, [
      { label: `${o.per.name.toUpperCase()} IS BETTER`, fn: () => { S.say(p, 'Right. Sure.'); S.trust(p, -2); if (has(p.per, 'hothead')) S.addRel(p, o, -6); } },
      { label: 'I NEED YOU HERE', fn: () => { const ok = has(p.per, 'hardworking') || has(p.per, 'kind'); S.say(p, ok ? 'Okay. That means something.' : 'Doing what, exactly?'); S.trust(p, ok ? 3 : 0); } },
    ], () => S.trust(p, -1));
  }

  private dispute(p: Person) {
    const g = this.g, S = g.story, L = g.leader!;
    if (p.mode !== 'camp') return null;
    const o = g.people.find(x => x !== p && x !== L && x.mode === 'camp' && !x.hurt && S.rel(p, x) < -25);
    if (!o) return null;
    const lie = has(p.per, 'liar') && Math.random() < 0.6, thing = pickOf(['shoes', 'blanket', 'spot under the lean-to', 'water bottle', 'jacket']);
    const N = p.per.name, O = o.per.name;
    const side = (win: Person, lose: Person) => {
      S.trust(win, 4); S.trust(lose, -5); S.addRel(win, lose, -5); S.mood(lose, 'angry', 25);
      S.say(lose, pickOf(['Unbelievable.', 'Of course.', 'Fine. Whatever.']));
      // people who don't trust you take the other side
      for (const x of g.people) if (x !== win && x !== lose && x !== L && x.per.trust < 30 && S.rel(x, lose) > 5) { S.trust(x, -2); S.addRel(x, win, -3); setTimeout(() => S.say(x, "That's not fair."), 1800); }
    };
    return this.req(p, 'dispute', `${O} took my ${thing}! Tell them to give it back.`, !lie, [
      { label: `GIVE IT BACK, ${O.toUpperCase()}`, fn: () => {
        if (lie) {
          side(p, o);
          setTimeout(() => { S.say(o, `I never touched ${N}'s ${thing}!`); S.toast(`Turns out ${N} made it up. ${O} never took anything.`, 'bad', p); S.log(`${N} lied about ${O} taking their ${thing}. You took ${N}'s side.`); for (const x of g.people) if (x !== p) S.addRel(x, p, -4); S.trust(o, -4); }, 6000);
          const rec = this.record.get(p.id) ?? { good: 0, bad: 0 }; rec.bad++; this.record.set(p.id, rec);
        } else { side(p, o); S.say(p, 'Thank you.'); S.log(`${O} took ${N}'s ${thing}. You made them give it back.`); }
      } },
      { label: 'SORT IT OUT', fn: () => {
        S.trust(p, -1); S.say(p, 'Great. Thanks.');
        if (Math.random() < 0.5) { p.act = 'argue'; p.partner = o; p.actT = 5; o.act = 'argue'; o.partner = p; o.actT = 5; o.path = []; S.addRel(p, o, -5); }
        else S.addRel(p, o, 4);
      } },
      { label: `LEAVE ${O.toUpperCase()} ALONE`, fn: () => { side(o, p); if (lie) { S.log(`${N} accused ${O} of taking their ${thing}. You didn't buy it.`); S.trust(p, 2); } } },
    ], () => { S.trust(p, -1); if (Math.random() < 0.5) { p.act = 'argue'; p.partner = o; p.actT = 5; o.act = 'argue'; o.partner = p; o.actT = 5; o.path = []; } });
  }

  private hoard(p: Person) {
    const g = this.g, S = g.story, L = g.leader!;
    const h = g.people.find(x => x.per.secret === 'hoarder' && !S.secretKnown.has(x.id) && x !== p && x !== L);
    if (!h || g.stock.stolen < 4) return null;
    // a liar might point at someone they just don't like
    const lie = has(p.per, 'liar') && Math.random() < 0.5;
    const who = lie ? (g.people.find(x => x !== p && x !== L && x !== h && S.rel(p, x) < 0) ?? h) : h;
    if (!lie && !(has(p.per, 'honest') || has(p.per, 'kind') || has(p.per, 'hardworking') || Math.random() < 0.3)) return null;
    const real = who === h, W = who.per.name;
    return this.req(p, 'secret', `I saw ${W} hiding food under the lean-to. Our food.`, real, [
      { label: 'CONFRONT THEM', fn: () => {
        if (real) { S.say(h, '...'); S.revealSecret(h); g.stock.add('snacks', g.stock.stolen); g.stock.stolen = 0; S.trust(p, 3); }
        else {
          S.say(who, 'What? I never took anything!'); S.trust(who, -8); S.mood(who, 'angry', 30);
          S.toast(`${W} had nothing. ${p.per.name} made it up.`, 'bad', p); S.log(`${p.per.name} accused ${W} of stealing food. There was nothing there.`);
          for (const x of g.people) if (x !== p) S.addRel(x, p, -5);
          const rec = this.record.get(p.id) ?? { good: 0, bad: 0 }; rec.bad++; this.record.set(p.id, rec);
        }
      } },
      { label: 'LET IT GO', fn: () => { S.say(p, real ? 'Fine. Starve, then.' : 'Okay...'); if (real) S.trust(p, -2); } },
    ], () => {});
  }

  private pair(p: Person) {
    const g = this.g, S = g.story;
    if (p.per.pair < 0 || p.mode !== 'camp' || p.apart < 150) return null;
    const o = g.people[p.per.pair];
    if (!(o.mode === 'follow' || o.mode === 'wait' || o === g.leader)) return null;
    const join = () => { p.mode = 'follow'; p.act = ''; p.path = []; p.apart = 0; S.mood(p, 'happy', 15); };
    const slip = () => {
      setTimeout(() => {
        if (p.mode !== 'camp') return;
        join(); S.say(p, `I'm going after ${o.per.name}.`); S.toast(`${p.per.name} slipped away to be with ${o.per.name}.`, 'info', p);
        S.log(`${p.per.name} wouldn't stay apart from ${o.per.name} any longer and followed us out.`);
      }, 30000);
    };
    return this.req(p, 'pair', `Can I come with you? I don't want to be away from ${o.per.name}.`, true, [
      { label: 'COME ALONG', cls: 'go', fn: () => { join(); S.say(p, 'Thank you.'); S.trust(p, 3); } },
      { label: 'STAY HERE', fn: () => { S.trust(p, -3); S.mood(p, 'sad', 30); S.say(p, '...Okay.'); if (p.per.trust < 50 || has(p.per, 'hothead') || has(p.per, 'brave')) slip(); } },
    ], slip);
  }
}

