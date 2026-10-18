import { has } from './persona';
import { Person } from './people';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
export type Reply = 'admit' | 'remind' | 'push';

/** A choice for you to make in front of everyone (the showdown). */
export interface Choice { title: string; text: string; options: { label: string; cls?: string; fn: () => void }[] }

/**
 * Leadership challenges. When the village stops trusting you, someone stands up at the fire.
 * You answer; people pick a side; lose, and you go on as the new leader.
 */
export class Politics {
  low = 0;
  last = -99;
  /** a death the camp blames on you */
  blame = -99;
  pending: number = -1;
  choices: Choice[] = [];

  constructor(private g: Group) {}

  dawn() {
    const g = this.g, L = g.leader, day = g.clock.day;
    if (!L || g.era !== 'village') return;
    this.low = g.story.avgTrust(L) < 40 ? this.low + 1 : 0;
    if (this.pending >= 0 || day - this.last < 8 || !(this.low >= 2 || day - this.blame <= 1)) return;
    const C = this.challenger(); if (!C) return;
    this.pending = C.id;
    g.story.toast(`${C.per.name} has been talking about you behind your back.`, 'bad', C);
    g.story.log(`${C.per.name} has been going hut to hut, talking about who should be in charge. Something is going to happen at the fire tonight.`);
  }

  /** The most liked person who trusts you least. */
  challenger() {
    const g = this.g, S = g.story, L = g.leader!;
    const liked = (p: Person) => g.people.reduce((s, o) => s + (o === p || o.mode === 'dead' ? 0 : S.rel(o, p)), 0) / g.people.length;
    return g.people.filter(p => p !== L && p.mode === 'camp' && !p.kid && p.health < 2 && !p.hurt)
      .sort((a, b) => (liked(b) - b.per.trust) - (liked(a) - a.per.trust))[0] ?? null;
  }

  update() {
    const g = this.g, h = g.clock.hour, V = g.village;
    if (this.pending < 0 || h < 18.5 || h > 21 || V.ev || g.health.funeral) return;
    const C = g.people[this.pending]; this.pending = -1;
    if (!C || C.mode !== 'camp' || !g.leader) return;
    this.showdown(C);
  }

  /** What the challenger says: built from what actually happened. */
  private grievances(): string[] {
    const g = this.g, out: string[] = [];
    const neglect = g.health.dead.filter(d => d.cause.includes('nobody'));
    if (neglect.length) out.push(`We buried ${neglect[neglect.length - 1].name} because nobody looked after them.`);
    if (g.stats.hungry || g.people.some(p => p.hungry)) out.push('People went to bed hungry, again.');
    if (g.requests.gripes.length) out.push('Good ideas get turned down and nobody hears why.');
    out.push("Half of us don't trust where we're being led.");
    return out;
  }

  private showdown(C: Person) {
    const g = this.g, S = g.story, V = g.village, L = g.leader!;
    V.gather('showdown', g.fire, 4, 30, [
      { at: 3, fn: () => S.say(C, `I'll say it, since nobody else will. ${this.grievances()[0]}`, 6) },
      { at: 9, fn: () => S.say(C, `I think it's time someone else led. ${L.per.name}, what do you say?`, 5) },
      { at: 12, fn: () => {
        V.ev!.hold = true;
        this.choices.push({ title: `${C.per.name.toUpperCase()} CHALLENGES YOU`, text: 'Everyone is watching. What do you tell them?', options: [
          { label: 'ADMIT MY MISTAKES', fn: () => this.answer(C, 'admit') },
          { label: 'REMIND THEM WHAT I DID', fn: () => this.answer(C, 'remind') },
          { label: 'PUSH BACK', cls: 'no', fn: () => this.answer(C, 'push') },
        ] });
      } },
    ]);
    g.onAlarm();
  }

  /** How much someone is swayed by your answer. */
  static sway(o: Person, reply: Reply, record: number) {
    const t = (k: Parameters<typeof has>[1]) => has(o.per, k);
    if (reply === 'admit') return (t('kind') || t('honest') || t('calm') ? 14 : 0) - (t('hothead') ? 6 : 0);
    if (reply === 'remind') return Math.min(20, record) * 0.7 - (t('honest') && record < 6 ? 5 : 0);
    return (t('hothead') || t('brave') ? 14 : 0) - (t('kind') || t('calm') || t('cowardly') ? 12 : 4);
  }
  /** Which side someone takes: positive for you. */
  static side(trust: number, relYou: number, relThem: number, sway: number, noise = 0) {
    return trust - 50 + (relYou - relThem) * 0.3 + sway + noise;
  }

  private answer(C: Person, reply: Reply) {
    const g = this.g, S = g.story, V = g.village, L = g.leader!, F = g.fire;
    S.say(L, reply === 'admit' ? "I've made mistakes. I'll own them. But I'm not done." : reply === 'remind' ? 'Remember where we started. Look at what we built.' : "You want to lead? Sit down.", 5);
    const record = g.stats.found.length + g.camp.list.filter(b => b.progress >= 1).length * 0.5 + g.people.filter(p => p.savedBy === L.id).length * 4 + (g.chatter.legend ? 8 : 0);
    // people walk to stand behind one of you
    const a = Math.atan2(C.z - F.z, C.x - F.x);
    let mine = 0, theirs = 0;
    for (const o of g.people) {
      if (o.act !== 'gather' || o === L || o === C || o.kid) continue;
      const s = Politics.side(o.per.trust, S.rel(o, L), S.rel(o, C), Politics.sway(o, reply, record), (Math.random() - 0.5) * 16);
      const behind = s >= 0 ? L : C; if (s >= 0) mine++; else theirs++;
      const side = s >= 0 ? a + Math.PI : a, r = 5 + Math.random() * 2, spread = (Math.random() - 0.5) * 1.4;
      const q = g.grid.nearest(F.x + Math.cos(side + spread) * r, F.z + Math.sin(side + spread) * r) ?? behind;
      g.bodies.go(o, q.x, q.z);
    }
    const q = g.grid.nearest(F.x + Math.cos(a + Math.PI) * 3, F.z + Math.sin(a + Math.PI) * 3); if (q) g.bodies.go(L, q.x, q.z);
    V.ev!.hold = false;
    V.ev!.steps.push({ at: V.ev!.t + 7, fn: () => this.result(C, mine >= theirs) });
    V.ev!.end = V.ev!.t + 16;
  }

  private result(C: Person, won: boolean) {
    const g = this.g, S = g.story, L = g.leader!;
    this.last = g.clock.day;
    if (won) {
      S.toast(`Most of the village stood with you. ${C.per.name} backs down.`, 'good', C);
      S.log(`${C.per.name} tried to take over at the fire tonight. Most of us stood behind ${L.per.name}.`);
      S.trust(C, -10); S.mood(C, 'angry', 120); S.addRel(C, L, -15);
      for (const o of g.people) if (o.act === 'gather' && o !== C) { S.trust(o, 3); if (Math.random() < 0.4) { o.poseO = 'cheer'; o.poseT = 1.5; } }
      return;
    }
    S.toast(`The village chose ${C.per.name}. They lead now.`, 'bad', C);
    S.log(`At the fire tonight the village chose ${C.per.name} over ${L.per.name}. ${C.per.name} leads us now.`);
    this.handOver(C, L);
  }

  /** The leader died: the one the others trust most steps up, and you go on as them. */
  succeed(dead: Person) {
    const g = this.g, S = g.story;
    const live = g.people.filter(p => p !== dead && p.mode !== 'dead' && !p.kid);
    const liked = (p: Person) => live.reduce((s, o) => s + (o === p ? 0 : S.rel(o, p)), 0);
    const c = live.sort((a, b) => (b.per.trust + liked(b) * 0.2) - (a.per.trust + liked(a) * 0.2))[0];
    if (!c) { g.leader = null; g.eraCards.push({ title: 'NOBODY IS LEFT', sub: `Day ${g.clock.day}` }); S.log('Nobody is left.'); return; }
    if (g.canoe.trip) g.canoe.trip = null;
    g.jobs.quit(c); g.leaveParty(c); c.crew = false; c.act = ''; c.path = []; c.up = 0;
    g.leader = c; c.mode = 'leader'; c.actT = 0;
    for (const o of g.people) if (o !== c && o.mode !== 'dead') o.per.trust = Math.max(15, Math.min(90, 50 + S.rel(o, c) * 0.5));
    g.eraCards.push({ title: `${c.per.name.toUpperCase()} LEADS NOW`, sub: `After ${dead.per.name}` });
    S.log(`With ${dead.per.name} gone, everyone looked to ${c.per.name}.`);
  }

  /** A new leader: you play on as them. */
  handOver(C: Person, old: Person) {
    const g = this.g, S = g.story;
    g.jobs.quit(C); C.crew = false; C.act = ''; C.path = []; C.up = 0;
    old.mode = 'camp'; old.act = ''; old.actT = 2; old.path = [];
    g.leader = C; C.mode = 'leader'; C.actT = 0;
    for (const o of g.people) if (o !== C && o.mode !== 'dead') o.per.trust = Math.max(10, Math.min(90, 50 + S.rel(o, C) * 0.5));
    old.per.trust = Math.min(25, old.per.trust); S.addRel(old, C, -20); S.mood(old, 'angry', 300);
    g.eraCards.push({ title: `${C.per.name.toUpperCase()} LEADS NOW`, sub: 'You play on as them' });
    g.onSting(false);
    setTimeout(() => S.say(old, pickOf(["Fine. Let's see you do better.", "This isn't over.", '...'])), 2500);
  }
}
