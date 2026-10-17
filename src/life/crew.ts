import { heightAt } from '../world/island';
import { has } from './persona';
import { Person, Pt } from './people';
import { JobKind, level } from './jobs';
import type { Group } from './group';

export type CrewMode = 'alone' | 'crew' | 'all';
/** Past this far from the fire you've left camp. */
export const CAMP_R = 24;
const CREW_N = 3;
const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

/**
 * Who comes with you. Walk out of camp and your crew falls in behind you; walk back in and they go back to their lives.
 * Like jobs, it fills itself: the people you asked for first, then whoever fits today's plan,
 * hasn't been out in a while, and likes getting out — friends together, rivals apart.
 */
export class Crew {
  mode: CrewMode = 'crew';
  /** you are outside camp */
  out = false;
  /** where camp ends, marked with little posts */
  edge: Pt[] = [];
  private homeT = 0;

  constructor(private g: Group) {
    for (const p of g.people) p.outLike = has(p.per, 'brave') || has(p.per, 'curious') ? 1 : has(p.per, 'cowardly') || has(p.per, 'lazy') ? -1 : 0;
    const F = g.fire;
    for (let a = 0; a < 6.283; a += 0.42) { const x = F.x + Math.cos(a) * CAMP_R, z = F.z + Math.sin(a) * CAMP_R; if (g.grid.walkable(x, z)) this.edge.push({ x, z }); }
  }

  outside(x: number, z: number, r = CAMP_R) { return Math.hypot(x - this.g.fire.x, z - this.g.fire.z) > r; }

  update(dt: number) {
    const L = this.g.leader; if (!L) return;
    if (!this.out) { if (this.outside(L.x, L.z)) { this.out = true; this.setOff(); } return; }
    // a little slack, so walking along the edge doesn't flip it back and forth
    if (!this.outside(L.x, L.z, CAMP_R - 4)) { if ((this.homeT += dt) > 2) { this.out = false; this.homeT = 0; this.home(); } }
    else this.homeT = 0;
    this.tire();
  }

  setMode(m: CrewMode) {
    this.mode = m;
    if (!this.out) return;
    if (m === 'alone') { for (const p of this.g.party) this.sendHome(p); return; }
    for (const p of this.pick()) if (p.mode === 'camp') this.join(p);
  }

  // ------------------------------------------------------------------ who goes

  /** The people who'd come along right now. */
  pick(): Person[] {
    const g = this.g, S = g.story, h = g.clock.hour, sleep = h >= 22 || h < 5.5;
    if (this.mode === 'alone') return [];
    // nobody gets dragged out of bed unless you asked for them by name
    const ok = g.people.filter(p => g.jobs.available(p) && (!sleep || p.crew));
    if (this.mode === 'all') return ok;
    const out: Person[] = [];
    for (const p of ok) if (p.crew) {
      const rv = out.find(o => S.rel(p, o) < -45);
      if (rv && Math.random() < 0.5) { S.say(p, `Not if ${rv.per.name} is going.`); S.mood(p, 'angry', 10); continue; }
      out.push(p);
    }
    while (out.length < CREW_N) {
      let best: Person | null = null, bs = -3;
      for (const p of ok) { if (out.includes(p) || p.crew) continue; const s = this.score(p, out); if (s > bs) { bs = s; best = p; } }
      if (!best) break;
      out.push(best);
    }
    // a friend left behind sometimes tags along anyway
    if (!sleep && out.length < 5) {
      const f = ok.find(p => !out.includes(p) && p.outLike >= 0 && out.some(o => S.rel(p, o) > 40));
      if (f && Math.random() < 0.3) { const o = out.find(o => S.rel(f, o) > 40)!; out.push(f); setTimeout(() => S.say(f, `Wait up! I'm coming with ${o.per.name}.`), 900); }
    }
    return out;
  }

  /** How right someone is for this trip. */
  score(p: Person, crew: Person[]) {
    const g = this.g, S = g.story, per = p.per, sk = per.skill, cur = g.goals.cur;
    const plan = cur && g.goals.active(cur.kind) ? cur.kind : '';
    let s = Math.min(4.5, (g.clock.minutes - p.outAt) / 360);              // whoever hasn't been out in a while; just back = rest
    s += p.outLike * 2;
    if (per.strength === 'tireless' || per.strength === 'fast walker') s += 0.5;
    if (per.weakness === 'bad knee' || per.weakness === 'gets lost easily') s -= 0.8;
    if (g.clock.night > 0.5) s += (per.strength === 'night owl' ? 1.5 : 0) - (per.weakness === 'afraid of the dark' ? 4 : 0);
    // the right people for today's plan
    if (plan === 'hunt') s += (has(per, 'brave') ? 3 : 0) - (has(per, 'cowardly') ? 4 : 0) + level(p.xp.hunt ?? 0);
    if (plan === 'explore' || plan === 'search') s += (per.strength === 'sharp eyes' || per.strength === 'good sense of direction' ? 2 : 0) + (sk === 'navigator' || sk === 'climber' ? 2.5 : 0) + (has(per, 'curious') ? 1 : 0);
    if (plan === 'salvage') s += (sk === 'mechanic' ? 3 : 0) + (per.strength === 'strong' ? 2 : 0);
    if (plan === 'food') s += (sk === 'fisher' ? 2.5 : 0) + level(p.xp.food ?? 0) * 0.5;
    // a mix of skills beats two of the same; a medic along is always good
    if (sk !== 'none' && !crew.some(o => o.per.skill === sk)) s += sk === 'medic' ? 1.5 : 1;
    // don't strip the camp of what it can't spare
    if (p.job === 'tend' || p.job === 'cook' || p.job === 'watch') s -= 3;
    if (p.job && g.jobs.prio[p.job as JobKind] === 2) s -= 1.5;
    for (const o of crew) { const r = S.rel(p, o); if (r > 30) s += 2.5; else if (r < -30) s -= 4; }
    if (p.pose === 'sleep') s -= 3;
    return s + Math.random() * 0.4;
  }

  /** Someone falls in behind you. */
  join(p: Person) {
    const g = this.g, S = g.story, sleeping = p.pose === 'sleep', again = g.clock.minutes - p.outAt < 1440;
    if (p.job) g.jobs.quit(p);
    p.mode = 'follow'; p.act = 'run'; p.path = []; p.carry = 0; p.bring = ''; p.partner = null;
    p.tripAt = g.clock.minutes; p.tiredN = 0; p.haul = [];
    const say = (t: string) => setTimeout(() => S.say(p, t, 2), 300 + Math.random() * 900);
    if (sleeping) { say('Huh? Now?!'); S.trust(p, -1); }
    else if (p.outLike < 0 && Math.random() < 0.6) { say(again ? 'Me again?' : pickOf(['Do I have to?', "Fine. I'm not happy about it."])); this.reveal(p); S.mood(p, 'angry', 8); }
    else if (p.outLike > 0 && Math.random() < 0.6) { say(pickOf(['Finally, some air!', "Let's see what's out there.", "I was hoping you'd ask."])); this.reveal(p); S.mood(p, 'happy', 10); }
    else if (Math.random() < 0.35) say(pickOf(['Right behind you.', "Let's go.", 'Coming!']));
  }
  private reveal(p: Person) { this.g.jobs.likeKnown.add(p.id + (p.outLike > 0 ? ':out+' : ':out-')); }

  /** Off they go, and whoever stays waves. */
  private setOff() {
    const g = this.g, L = g.leader!, go = this.pick();
    for (const p of go) this.join(p);
    const stay = g.people.filter(p => p.mode === 'camp' && p.pose !== 'sleep' && !p.path.length && Math.hypot(p.x - L.x, p.z - L.z) < 22).slice(0, 2);
    stay.forEach((p, i) => { p.poseO = 'wave'; p.poseT = 1.6; if (!i && Math.random() < 0.6) g.story.say(p, pickOf(['Be careful out there!', 'Bring something back!', "Don't be out too late!"]), 2.2); });
    if (go.length) g.hint('crew', 'Your crew follows you out of camp and goes back to their own things when you return. ALONE / CREW / ALL picks who comes.');
  }

  /** Back in camp: everyone goes back to their own lives (after dropping off what they carried). */
  private home() {
    const g = this.g, L = g.leader!, back = g.party;
    const haul = back.reduce((n, p) => n + p.haul.length, 0);
    for (const p of back) this.sendHome(p);
    const w = g.people.filter(p => p.mode === 'camp' && !back.includes(p) && p.pose !== 'sleep' && Math.hypot(p.x - L.x, p.z - L.z) < 22).slice(0, 2);
    w.forEach((p, i) => { p.poseO = 'wave'; p.poseT = 1.6; if (!i) g.story.say(p, haul ? pickOf(["You're back! What did you bring?", 'Look at all that!']) : pickOf(["You're back!", 'Welcome home.', 'There they are!']), 2.2); });
  }

  sendHome(p: Person) {
    if (p.mode !== 'follow' && p.mode !== 'wait') return;
    p.mode = 'camp'; p.path = []; p.partner = null; p.outAt = this.g.clock.minutes; p.bring = '';
    p.act = p.haul.length ? 'haul' : ''; p.actT = 1 + Math.random() * 2;
  }

  /** Long days out wear people down, and they say so. */
  private tire() {
    const g = this.g, S = g.story;
    for (const p of g.party) {
      const hrs = (g.clock.minutes - p.tripAt) / 60 / (p.per.strength === 'tireless' ? 1.6 : 1);
      if (hrs > 6 && p.tiredN === 0) { p.tiredN = 1; S.say(p, pickOf(['Can we head back soon?', 'My feet are done.', "I'm getting tired."]), 2.5); S.mood(p, 'tired', 40); }
      else if (hrs > 10 && p.tiredN === 1) { p.tiredN = 2; S.say(p, "We've been out all day. I need to go home.", 3); S.mood(p, 'tired', 90); S.trust(p, -2); }
    }
  }

  // ------------------------------------------------------------------ out there

  /** You've stopped: each one does what they're good at. Returns false if there's nothing for them to do but look around. */
  work(p: Person, dt: number): boolean {
    const g = this.g, B = g.bodies, L = g.leader!, S = g.story;
    // the medic patches up whoever's hurt
    if (p.per.skill === 'medic') {
      const h = g.party.find(o => o !== p && o.hurt) ?? (L.hurt ? L : null);
      if (h) {
        if (p.act !== 'patch') { p.act = 'patch'; p.wT = 8; p.path = []; }
        if (Math.hypot(h.x - p.x, h.z - p.z) > 1.4) { B.steer(p, h.x, h.z, B.speed(p), dt); p.pose = 'walk'; return true; }
        p.pose = 'collect'; B.faceToward(p, h.x, h.z);
        if ((p.wT -= dt) <= 0) {
          h.hurt = false; h.heal = 0; p.act = '';
          S.say(p, 'Hold still. There. Good as new.', 2.5); S.toast(`${p.per.name} patched up ${h.per.name}.`, 'good', p);
          S.revealSkill(p, `${p.per.name} cleaned and bound ${h.per.name}'s wound like they'd done it a thousand times. A medic.`);
          S.addRel(h, p, 10);
        }
        return true;
      }
    }
    if (p.haul.length >= 3 && p.act !== 'gather') return false;     // hands full
    if (p.act !== 'gather') {
      const s = this.spotFor(p); if (!s) return false;
      p.act = 'gather'; p.ax = s.x; p.az = s.z; p.wT = s.t; p.bring = s.k; p.path = [];
      if (!g.grid.clear(p.x, p.z, s.x, s.z)) B.go(p, s.x, s.z);
    }
    if (p.path.length) { if (B.advance(p, B.speed(p), dt)) p.path = []; p.pose = 'walk'; return true; }
    if (Math.hypot(p.ax - p.x, p.az - p.z) > 0.6) {
      if (B.steer(p, p.ax, p.az, B.speed(p), dt) && p.stuck > 0.4 && !B.go(p, p.ax, p.az)) { p.act = ''; p.bring = ''; return false; }
      p.pose = 'walk'; return true;
    }
    const k = p.bring;
    p.pose = k === 'fish' ? 'fish' : k in g.stock.mat ? 'build' : 'collect';
    if ((p.wT -= dt) > 0) return true;
    p.haul.push(k); p.bring = ''; p.act = ''; p.carry = Math.min(3, p.haul.length) as 1 | 2 | 3;
    if (k === 'fish') S.revealSkill(p, `${p.per.name} pulled fish out of the surf with their bare hands. They grew up fishing.`);
    if (p.haul.length === 1 && Math.random() < 0.5) S.say(p, pickOf(['Got some!', "I'll carry it.", 'This is coming home with us.']), 1.8);
    return true;
  }

  /** Something worth taking near where you stopped: fish off the shore, a known food or material spot. */
  private spotFor(p: Person): { x: number; z: number; k: string; t: number } | null {
    const g = this.g, L = g.leader!, w = g.w, wet = (x: number, z: number) => heightAt(w, x, z) < 0.3;
    if (p.per.skill === 'fisher' || level(p.xp.fish ?? 0) >= 1) for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283, r = 3 + Math.random() * 9, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if (g.grid.walkable(x, z) && (wet(x + 2.5, z) || wet(x - 2.5, z) || wet(x, z + 2.5) || wet(x, z - 2.5))) return { x, z, k: 'fish', t: 10 };
    }
    const qs = g.disc.pois.filter(q => q.known && (q.kind === 'material' || q.kind === 'food') && Math.hypot(q.x - L.x, q.z - L.z) < 16);
    if (!qs.length) return null;
    // builders, mechanics and the strong go for materials; everyone else for food
    const mats = p.per.skill === 'builder' || p.per.skill === 'mechanic' || p.per.strength === 'strong';
    const pref = qs.filter(q => (q.kind === 'material') === mats);
    const q = pickOf(pref.length ? pref : qs);
    const k = q.kind === 'food' ? (q.sprite === 'coconuts' ? 'coconut' : q.sprite === 'shells' ? 'shell' : 'fruit') : q.mat!;
    const s = g.grid.nearest(q.x + (Math.random() - 0.5) * 3, q.z + (Math.random() - 0.5) * 3) ?? q;
    return { x: s.x, z: s.z, k, t: q.kind === 'food' ? 4 : 6 };
  }

  /** Home with a load: walk it to the pile and drop it off. Called from camp life. */
  unload(p: Person, dt: number) {
    const g = this.g, B = g.bodies, P = g.stock.pile;
    if (p.path.length) { B.advance(p, B.speed(p) * 0.9, dt); p.pose = 'walk'; return; }
    if (Math.hypot(p.x - P.x, p.z - P.z) > 2.5 && B.go(p, P.x + (Math.random() - 0.5) * 3, P.z + 1 + Math.random())) return;
    for (const k of p.haul) { p.bring = k; g.deposit(p); }
    p.haul = []; p.carry = 0; p.bring = ''; p.act = ''; p.actT = 1;
  }
}
