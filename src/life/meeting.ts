import { has } from './persona';
import { Person } from './people';
import { JOB, JobKind } from './jobs';
import { BKind, BUILD } from './buildings';
import type { Choice } from './politics';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

export type Dir = 'steady' | 'food' | 'build' | 'explore' | 'comfort' | 'defend';
export const DIRS: Dir[] = ['steady', 'food', 'build', 'explore', 'comfort', 'defend'];
export const DIR_INFO: Record<Dir, { label: string; icon: string; line: string }> = {
  steady: { label: 'Keep steady', icon: 'scale', line: 'A bit of everything.' },
  food: { label: 'Food & water', icon: 'fish', line: 'More hands gathering, fishing, hunting and fetching water.' },
  build: { label: 'Build', icon: 'hammer', line: 'Builders and haulers first; new buildings start on their own.' },
  explore: { label: 'Explore', icon: 'compass', line: 'Every morning someone heads out to look around.' },
  comfort: { label: 'Comfort', icon: 'heart', line: 'Easier days, cooked meals, care for the sick. Less hauling.' },
  defend: { label: 'Defend', icon: 'shield', line: 'Watch, lookout, traps and walls come first.' },
};
/** Which buildings belong to which direction (the camp starts these without asking). */
const DIR_BUILDS: Partial<Record<Dir, BKind[]>> = {
  food: ['fishTrap', 'dryingRack', 'snares', 'smokeRack', 'storage', 'garden', 'pen', 'coop'],
  comfort: ['hut', 'cooking', 'bath', 'sickbay', 'storage'],
  defend: ['fence', 'watchFire', 'tower', 'traps'],
};
export const dirWants = (d: Dir, k: BKind) => d === 'build' || !!DIR_BUILDS[d]?.includes(k);

/** How many more (or fewer) hands a job gets for the camp's direction. */
export function dirBonus(d: Dir, k: JobKind, needMat: boolean): number {
  switch (d) {
    case 'food': return ['water', 'food', 'fish', 'hunt', 'trap', 'farm'].includes(k) ? 1 : 0;
    case 'build': return k === 'build' || needMat ? 1 : 0;
    case 'comfort': return k === 'cook' || k === 'tend' ? 1 : ['wood', 'bamboo', 'stone', 'vines', 'scrap'].includes(k) ? -1 : 0;
    case 'defend': return k === 'watch' || k === 'lookout' || k === 'trap' ? 1 : 0;
    default: return 0;
  }
}
/** from: when it was made (game minutes); by: the day it's due */
interface Promise_ { id: number; kind: 'hut' | 'job' | 'trip'; from: number; by: number }

/**
 * The evening meeting at the fire: how things went, tomorrow's plan, and now and then a hard choice
 * about something that really happened. Plus the camp's direction, which steers what it does on its own.
 */
export class Meeting {
  dir: Dir = 'steady';
  reports: { who: Person; text: string }[] = [];
  promises: Promise_[] = [];
  /** naps today, for spotting who isn't pulling their weight */
  naps = new Map<number, number>();
  private day = -1;
  private exploreDay = -1;
  private choice: Choice | null = null;
  /** when each kind of hard choice last came up (they don't repeat for a few days) */
  private last: Record<string, number> = {};

  constructor(private g: Group) {}

  setDir(d: Dir) {
    const g = this.g; if (d === this.dir) return;
    this.dir = d;
    g.story.log(d === 'steady' ? 'We stopped pushing in any one direction.' : `From now on the camp puts ${DIR_INFO[d].label.toLowerCase()} first.`);
    const who = g.people.find(p => p.mode === 'camp' && p !== g.leader && p.pose !== 'sleep');
    if (who) g.story.say(who, d === 'food' ? 'Full bellies first. Good.' : d === 'build' ? "Let's get building." : d === 'explore' ? "About time we saw the rest of this place." : d === 'comfort' ? 'Thank you. We needed a breather.' : d === 'defend' ? 'Walls and watchers. I like it.' : 'Okay.', 2.5);
    g.jobs.nudge();
  }

  update() {
    const g = this.g, h = g.clock.hour, L = g.leader, day = g.clock.day;
    if (!L) return;
    // the meeting: once a day, after the plan is judged and no other gathering is on
    if (this.day !== day && h >= 19 && h < 21.5 && !g.village.ev && !g.health.funeral && !g.goals.opts.length) {
      this.day = day;
      this.reports = this.report();
      this.choice = this.hard();
      if (!g.goals.offer()) { this.pushChoice(); return; }
      this.reports.forEach((r, i) => setTimeout(() => g.story.say(r.who, r.text, 4), 400 + i * 2400));
      // you're not here: they decide without you
      if (Math.hypot(L.x - g.fire.x, L.z - g.fire.z) > 45 || g.canoe.apart(L, g.fire)) {
        this.choice = null;           // the hard things wait for a night you're there
        g.goals.autoPick(true);
      }
    }
    // explore: someone heads out each morning to look around
    if (this.dir === 'explore' && h >= 8 && h < 10 && this.exploreDay !== day) { this.exploreDay = day; this.sendScout(); }
  }

  /** The plan was picked: now the hard thing, if there is one. */
  picked() { this.pushChoice(); }
  private pushChoice() { if (this.choice) { this.g.politics.choices.push(this.choice); this.choice = null; } }

  /** How things went, in a few lines from the people who'd say them. */
  private report() {
    const g = this.g, S = g.story, st = g.stock, n = Math.max(1, g.people.filter(p => p.mode !== 'dead').length);
    const at = g.people.filter(p => p.mode === 'camp' && p !== g.leader && !p.kid && p.pose !== 'sleep' && p.health < 2);
    const who = (pref: (p: Person) => boolean) => at.find(p => pref(p) && !out.some(o => o.who === p)) ?? at.find(p => !out.some(o => o.who === p));
    const out: { who: Person; text: string }[] = [];
    const add = (p: Person | undefined, text: string) => { if (p && out.length < 3) out.push({ who: p, text }); };
    const days = st.totalFood / n;
    add(who(p => p.job === 'food' || p.job === 'cook' || p.per.skill === 'cook'), days < 1 ? "Food's nearly gone. We'll be hungry tomorrow." : days < 2 ? "There's food for about a day." : days < 4 ? `Food for ${Math.floor(days)} days or so.` : 'The food pile is in good shape.');
    if (st.water < n) add(who(p => p.job === 'water'), "We're low on water.");
    const sick = g.people.filter(p => p.mode !== 'dead' && p.health >= 2);
    if (sick.length) add(who(p => p.job === 'tend' || p.per.skill === 'medic'), sick.length === 1 ? `${sick[0].per.name} is still sick.` : `${sick.length} people are sick.`);
    if (g.stats.built.length) add(who(p => p.job === 'build'), `The ${g.stats.built[g.stats.built.length - 1]} is finished.`);
    const deed = g.hands.deeds.find(d => !d.told);
    if (deed) { deed.told = true; add(who(p => p.per.skill === 'storyteller' || has(p.per, 'social')), `Did everyone hear? ${g.leader!.per.name} ${deed.text}!`); }
    const gripe = g.requests.gripes.find(x => at.includes(x.p));
    if (gripe) { g.requests.gripes = g.requests.gripes.filter(x => x !== gripe); add(gripe.p, gripe.text); }
    if (!g.stats.hungry && out.length < 3) add(who(p => has(p.per, 'kind') || has(p.per, 'calm')), pickOf(['Nobody went hungry. That counts.', "We're still here. That's something.", 'Good day, all things considered.']));
    void S;
    return out;
  }

  // ------------------------------------------------------------------ hard choices

  /** Only when something real happened. */
  private hard(): Choice | null {
    const day = this.g.clock.day;
    if (this.g.politics.choices.length) return null;
    const fs: [string, number, () => Choice | null][] = [['theft', 4, () => this.theft()], ['fight', 6, () => this.fight()], ['medicine', 2, () => this.medicine()], ['slacker', 6, () => this.slacker()], ['leaving', 5, () => this.leaving()]];
    for (const [k, gap, f] of fs.sort(() => Math.random() - 0.5)) {
      if (day - (this.last[k] ?? -99) < gap) continue;
      const c = f(); if (c) { this.last[k] = day; return c; }
    }
    return null;
  }
  private adults() { return this.g.people.filter(p => p.mode === 'camp' && !p.kid && p !== this.g.leader && !p.alone); }

  private theft(): Choice | null {
    const g = this.g, S = g.story, st = g.stock, n = g.people.length;
    const hoarder = this.adults().find(p => p.per.secret === 'hoarder' && !S.secretKnown.has(p.id));
    let thief: Person | undefined, took = 0;
    if (hoarder && st.stolen >= 3) { thief = hoarder; took = st.stolen; }
    else if (st.totalFood < n * 0.8 && Math.random() < 0.4) { thief = this.adults().find(p => p.hungry && (has(p.per, 'selfish') || has(p.per, 'liar'))); took = Math.min(2, st.totalFood); if (thief) st.takeFood(took); }
    if (!thief || took <= 0) return null;
    const T = thief, W = this.adults().find(p => p !== T && (has(p.per, 'honest') || has(p.per, 'hardworking'))) ?? this.adults().find(p => p !== T);
    if (!W) return null;
    return { title: 'FOOD WENT MISSING', text: `${W.per.name}: "I saw ${T.per.name} at the pile last night, when everyone was asleep. Food is gone."`, options: [
      { label: 'PUNISH THEM', fn: () => {
        T.cut = g.clock.day + 3; S.trust(T, -6); S.mood(T, 'angry', 120); S.addRel(T, W, -15); S.say(T, '...Fine.', 2);
        if (T === hoarder) { S.revealSecret(T); st.add('snacks', st.stolen); st.stolen = 0; }
        for (const o of this.adults()) if (o !== T) S.trust(o, S.rel(o, T) < 10 ? 2 : -1);
        S.log(`${T.per.name} was caught taking food. ${g.leader!.per.name} cut their share for three days.`);
      } },
      { label: 'FORGIVE THEM', fn: () => {
        S.trust(T, 6); S.addRel(T, g.leader!, 15); S.say(T, "Thank you. I was so hungry. It won't happen again.", 3);
        if (T === hoarder) { S.revealSecret(T); st.add('snacks', st.stolen); st.stolen = 0; }
        for (const o of this.adults()) if (o !== T && (o.hungry || has(o.per, 'honest'))) { S.trust(o, -2); S.mood(o, 'angry', 30); }
        S.log(`${T.per.name} took food in the night. ${g.leader!.per.name} let it go.`);
      } },
      { label: 'HALF RATIONS FOR ALL', fn: () => {
        st.ration = 3; S.say(W, 'So we all pay for it?', 2);
        for (const o of this.adults()) { S.mood(o, 'sad', 30); if (has(o.per, 'hardworking')) S.trust(o, -1); }
        S.log(`Food went missing. Instead of naming anyone, ${g.leader!.per.name} put everyone on half portions.`);
      } },
    ] };
  }

  private fight(): Choice | null {
    const g = this.g, S = g.story, ad = this.adults();
    const a = ad.find(x => ad.some(y => y !== x && S.rel(x, y) < -45)); if (!a) return null;
    const b = ad.find(y => y !== a && S.rel(a, y) < -45)!;
    S.mood(a, 'angry', 60); S.mood(b, 'angry', 60);
    const side = (w: Person, l: Person) => {
      S.trust(w, 4); S.trust(l, -6); S.addRel(l, g.leader!, -10); S.say(l, pickOf(['Of course.', 'Unbelievable.', "I won't forget this."]), 2);
      for (const o of ad) if (o !== l && o !== w && S.rel(o, l) > 30) S.trust(o, -2);
      S.log(`${a.per.name} and ${b.per.name} came to blows. ${g.leader!.per.name} sided with ${w.per.name}.`);
    };
    return { title: 'A FIGHT', text: `${a.per.name} and ${b.per.name} came to blows today. Everyone is waiting to see what you do.`, options: [
      { label: `SIDE WITH ${a.per.name}`, fn: () => side(a, b) },
      { label: `SIDE WITH ${b.per.name}`, fn: () => side(b, a) },
      { label: 'MAKE THEM WORK TOGETHER', fn: () => {
        S.log(`${g.leader!.per.name} made ${a.per.name} and ${b.per.name} work side by side.`);
        g.requests.job([a, b], g.requests.spot('wreck'), 'build', 60, () => {
          if (Math.random() < 0.6) { S.addRel(a, b, 25); S.addRel(b, a, 25); S.say(a, `...You're not so bad, ${b.per.name}.`, 3); S.log(`${a.per.name} and ${b.per.name} worked it out.`); }
          else { S.addRel(a, b, -10); S.say(a, "I can't stand them.", 2); S.log(`Making ${a.per.name} and ${b.per.name} work together only made it worse.`); }
        });
      } },
      { label: 'KEEP THEM APART', fn: () => { S.trust(a, -1); S.trust(b, -1); S.log(`${g.leader!.per.name} told ${a.per.name} and ${b.per.name} to stay out of each other's way.`); } },
    ] };
  }

  private medicine(): Choice | null {
    const g = this.g, S = g.story, st = g.stock;
    const sick = g.people.filter(p => p.mode !== 'dead' && p.health >= 2);
    if (!g.ideas.done('herbs') || sick.length < 2 || st.herbs < 1 || st.herbs >= sick.length) return null;
    const care = (p: Person) => g.people.filter(o => o !== p && o.mode !== 'dead' && (S.rel(o, p) > 40 || o.couple === p.id || o.per.pair === p.id));
    return { title: 'NOT ENOUGH MEDICINE', text: `There's medicine for one. ${sick.map(p => p.per.name).join(', ')} are all sick. Who gets it?`, options: sick.slice(0, 3).map(p => ({ label: `GIVE IT TO ${p.per.name}`, fn: () => {
      st.herbs--; g.health.better(p); S.trust(p, 5); S.addRel(p, g.leader!, 10);
      for (const o of sick) if (o !== p) for (const c of care(o)) { S.trust(c, -3); S.mood(c, 'angry', 40); }
      S.log(`There was only enough medicine for one. ${g.leader!.per.name} gave it to ${p.per.name}.`);
    } })) };
  }

  private slacker(): Choice | null {
    const g = this.g, S = g.story, ad = this.adults();
    const s = ad.find(p => (this.naps.get(p.id) ?? 0) >= 2 && (has(p.per, 'lazy') || p.per.trust < 35));
    const H = s && ad.find(p => p !== s && has(p.per, 'hardworking'));
    if (!s || !H) return null;
    return { title: 'NOT PULLING THEIR WEIGHT', text: `${H.per.name}: "${s.per.name} napped half the day again while the rest of us worked."`, options: [
      { label: 'TALK TO THEM', fn: () => {
        const ok = s.per.trust >= 40 || Math.random() < 0.4;
        S.say(s, ok ? "You're right. I'll do better." : 'I work as hard as anyone.', 2.5);
        if (ok) { S.trust(s, 2); s.pin = ''; } else S.trust(H, -1);
        S.log(`${g.leader!.per.name} had a word with ${s.per.name} about pulling their weight.`);
      } },
      { label: 'GIVE THEM WORK THEY LIKE', fn: () => {
        const k = s.love as JobKind; if (g.jobs.visible().includes(k)) s.pin = k;
        S.mood(s, 'happy', 60); S.say(H, 'So being lazy gets you the good jobs.', 2.5); S.trust(H, -1);
        S.log(`${g.leader!.per.name} put ${s.per.name} on ${JOB[k]?.verb ?? 'the work they like'}.`);
      } },
      { label: 'CUT THEIR SHARE', fn: () => {
        s.cut = g.clock.day + 2; S.trust(s, -8); S.mood(s, 'angry', 120);
        for (const o of ad) if (o !== s) S.trust(o, has(o.per, 'hardworking') ? 2 : has(o.per, 'kind') ? -1 : 0);
        S.log(`${s.per.name}'s share was cut for not working.`);
      } },
    ] };
  }

  private leaving(): Choice | null {
    const g = this.g, S = g.story, L = g.leader!;
    const p = this.adults().find(p => p.per.trust < 18 && !g.people.some(k => k.kid && g.families.parents[k.id]?.includes(p.id)) && !this.promises.some(x => x.id === p.id));
    if (!p) return null;
    const homeless = !g.camp.hutOf(p.id) && g.era !== 'crash', hates = p.hate && JOB[p.hate as JobKind];
    const kind: Promise_['kind'] = homeless ? 'hut' : hates && p.job === p.hate ? 'job' : 'trip';
    const words = kind === 'hut' ? 'YOUR OWN ROOF IN FIVE DAYS' : kind === 'job' ? `NO MORE ${JOB[p.hate as JobKind].verb.toUpperCase()}` : 'YOU COME OUT WITH ME NEXT';
    return { title: `${p.per.name.toUpperCase()} WANTS TO LEAVE`, text: `"I can't do this anymore. I'm going to live on my own, away from all of you."`, options: [
      { label: 'LET THEM GO', fn: () => this.goAlone(p) },
      { label: 'ASK THEM TO STAY', fn: () => {
        if (Math.random() < 0.25 + Math.max(0, S.rel(p, L)) / 150 + (has(p.per, 'kind') ? 0.15 : 0)) { S.say(p, '...Okay. For now.', 2.5); S.trust(p, 10); S.log(`${p.per.name} nearly left. ${L.per.name} talked them into staying.`); }
        else { S.say(p, "No. I've made up my mind.", 2.5); this.goAlone(p); S.trust(p, -3); }
      } },
      { label: `PROMISE: ${words}`, fn: () => {
        this.promises.push({ id: p.id, kind, from: g.clock.minutes, by: g.clock.day + (kind === 'trip' ? 4 : 5) });
        if (kind === 'hut' && !g.camp.queue.some(b => b.kind === 'hut')) g.camp.add('hut', true);
        if (kind === 'job') g.jobs.quit(p);
        S.say(p, "I'll hold you to that.", 2.5); S.trust(p, 8);
        S.log(`${p.per.name} was going to leave. ${L.per.name} made them a promise.`);
      } },
    ] };
  }

  /** They move out to the edge of the island for a few days, then (maybe) come back. */
  private goAlone(p: Person) {
    const g = this.g, S = g.story;
    p.alone = g.clock.day + 4; g.jobs.quit(p); g.leaveParty(p); p.crew = false;
    S.toast(`${p.per.name} left camp to live on their own.`, 'bad', p);
    S.log(`${p.per.name} packed what little they had and walked off to live alone. "Don't come looking for me."`);
    for (const o of g.people) if (o.mode !== 'dead' && (S.rel(o, p) > 30 || o.couple === p.id)) S.mood(o, 'sad', 120);
  }

  /** Dawn: promises come due; those living alone may come back. */
  dawn() {
    const g = this.g, S = g.story, day = g.clock.day, L = g.leader;
    this.naps.clear();
    for (const pr of [...this.promises]) {
      const p = g.people[pr.id];
      if (!p || p.mode === 'dead') { this.promises = this.promises.filter(x => x !== pr); continue; }
      const kept = pr.kind === 'hut' ? !!g.camp.hutOf(p.id) : pr.kind === 'trip' ? p.outAt > pr.from : p.job !== p.hate;
      if (kept && (pr.kind !== 'job' || day >= pr.by)) { this.promises = this.promises.filter(x => x !== pr); S.trust(p, 8); S.addRel(p, L!, 10); S.log(`${L?.per.name ?? 'We'} kept the promise to ${p.per.name}.`); S.say(p, 'You kept your word.', 2.5); continue; }
      if (day >= pr.by) {
        this.promises = this.promises.filter(x => x !== pr);
        S.trust(p, -15); S.mood(p, 'angry', 200); S.trustAll(-1, L);
        S.toast(`You broke your promise to ${p.per.name}.`, 'bad', p); S.log(`${L?.per.name ?? 'The leader'} broke their promise to ${p.per.name}. Everyone heard about it.`);
      }
    }
    for (const p of g.people) if (p.alone && day >= p.alone && p.mode !== 'dead') {
      p.alone = 0; p.per.trust = Math.max(p.per.trust, 30); p.act = ''; p.path = [];
      S.toast(`${p.per.name} came back to camp.`, 'info', p); S.log(`${p.per.name} walked back into camp, thinner, and sat down by the fire like they'd never left.`);
    }
    if (this.dir === 'comfort') for (const p of g.people) if (p.mode === 'camp') S.mood(p, 'happy', 40);
    this.autoBuild();
  }

  /** The camp starts buildings that fit its direction, without asking. */
  private autoBuild() {
    const g = this.g, C = g.camp, S = g.story;
    if (g.era === 'crash' || this.dir === 'steady' || this.dir === 'explore' || C.queue.length >= 2) return;
    const w = C.wanted().find(([k]) => dirWants(this.dir, k) && !C.planned(k));
    if (!w) return;
    const b = C.add(w[0], true); if (!b) return;
    const who = g.people.find(p => p.mode === 'camp' && p !== g.leader && (p.per.skill === w[2] || p.per.skill === 'builder')) ?? g.people.find(p => p.mode === 'camp' && p !== g.leader && !p.kid);
    S.toast(`The camp started on ${BUILD[w[0]].label}.`, 'info', who);
    S.log(`${who?.per.name ?? 'Someone'} got the camp started on ${BUILD[w[0]].label}.`);
  }

  /** Explore: one of the curious or brave heads out to look at something nobody has seen. */
  private sendScout() {
    const g = this.g, F = g.fire;
    if (g.scouting.trips.length >= 2) return;
    const D = g.disc, mk = D.markers.filter(m => m.kind === '?').sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z))[0];
    const to = mk ?? D.pois.filter(q => q.major && !q.known).sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z))[0];
    if (!to) return;
    const p = g.people.find(p => p.mode === 'camp' && p !== g.leader && !p.kid && !p.hurt && p.health < 2 && !p.alone && (has(p.per, 'brave') || has(p.per, 'curious')) && !g.scouting.refusal(p));
    if (p) { g.jobs.quit(p); g.scouting.send(p, to.x, to.z); g.story.say(p, "I'll go take a look.", 2); }
  }

  /** Someone takes a nap in the middle of the day (counted for the meeting). */
  napped(p: Person) { this.naps.set(p.id, (this.naps.get(p.id) ?? 0) + 1); }

  state() { return { dir: this.dir, promises: this.promises }; }
  restore(s: ReturnType<Meeting['state']>) { this.dir = s.dir ?? 'steady'; this.promises = s.promises ?? []; }
}
