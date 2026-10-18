import { has, Skill, Trait } from './persona';
import { Person, Pt } from './people';
import { BKind } from './buildings';
import type { Group } from './group';

export type IdeaKind = 'pottery' | 'farming' | 'canoe' | 'herbs';
export const IDEAS: IdeaKind[] = ['pottery', 'farming', 'canoe', 'herbs'];
type State = 'none' | 'clue' | 'asked' | 'shelved' | 'trying' | 'done';
export interface Idea { state: State; prog: number; who: number; back: number }

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
/** How long it takes to work something out, in seconds of one person's work. */
const WORK = 420;

interface Info {
  title: string; skills: Skill[]; traits: Trait[];
  clue: (n: string) => string; pitch: string;
  fails: [string, string]; done: (n: string) => string;
  unlock: BKind | null; what: string;
}
export const INFO: Record<IdeaKind, Info> = {
  pottery: {
    title: 'POTTERY', skills: ['cook'], traits: ['curious', 'hardworking'],
    clue: n => `${n} came back from the river with grey clay on their hands and a strange look on their face.`,
    pitch: 'The clay by the river... if we shaped it and fired it, we could make pots. Real ones.',
    fails: ['The first pot cracked in the fire.', 'Another pot, another crack. The clay needs sand in it.'],
    done: n => `${n} pulled a whole, ringing pot out of the ashes. We can make pots now.`,
    unlock: 'kiln', what: 'Stews stretch the food, rain catchers fill faster, food keeps longer.',
  },
  farming: {
    title: 'FARMING', skills: [], traits: ['hardworking', 'kind', 'curious'],
    clue: n => `${n} found green shoots coming up where we dropped fruit by the pile.`,
    pitch: 'Things grow here if you just drop them. What if we planted them on purpose? A garden.',
    fails: ['The first plot wilted. Too much sun.', 'Something dug up the seedlings overnight.'],
    done: n => `${n}'s little plot is green and growing. We know how to farm now.`,
    unlock: 'garden', what: 'A garden near camp gives a harvest every few days.',
  },
  canoe: {
    title: 'THE CANOE', skills: ['fisher', 'builder'], traits: ['curious', 'brave'],
    clue: n => `${n} watched a log float past the reef and didn't say a word for a long time.`,
    pitch: 'That log floated right out past the reef. If we hollowed one out, we could go where the big fish are.',
    fails: ['The first raft sank with someone on it. They swam back laughing.', 'It floated! Then it rolled over.'],
    done: n => `${n} paddled out past the breakers and came back. We have a canoe.`,
    unlock: 'canoe', what: 'Fishers bring more back. You can paddle to the reef and islets.',
  },
  herbs: {
    title: 'HERBAL MEDICINE', skills: ['medic'], traits: ['kind', 'curious'],
    clue: n => `${n} chewed a bitter jungle leaf for the fever, and woke up better.`,
    pitch: 'That leaf helped. There must be others. Let me work out which plants heal.',
    fails: ['One of the leaves made the tester throw up all afternoon.', 'A whole basket of plants, and none of them did anything.'],
    done: n => `${n} knows the healing plants now. The sick have a better chance.`,
    unlock: null, what: 'An Herbs job; the sick recover more often and die less.',
  },
};

/**
 * Discoveries by experimenting. Something in the world gives someone an idea; they ask you;
 * if you say yes, the camp works on it (failing a couple of times, out loud) until it clicks.
 */
export class Ideas {
  s: Record<IdeaKind, Idea> = Object.fromEntries(IDEAS.map(k => [k, { state: 'none', prog: 0, who: -1, back: 0 }])) as Record<IdeaKind, Idea>;
  /** deliveries that might give someone an idea */
  seen: Record<string, number> = {};
  /** the garden got some care today */
  tended = false;
  gardenDays = 0;
  harvests = 0;

  constructor(private g: Group) {}

  done(k: IdeaKind) { return this.s[k].state === 'done'; }
  trying(): IdeaKind | null { return IDEAS.find(k => this.s[k].state === 'trying') ?? null; }
  slow() { const k = this.trying(); return !!k && this.s[k].prog < 0.5; }
  /** A word for how far along it is. */
  stage(k: IdeaKind) { const p = this.s[k].prog; return p < 0.34 ? 'Trying' : p < 0.67 ? 'Getting closer' : 'Almost'; }

  /** How well someone suits the current experiment (job scoring). */
  fit(p: Person) {
    const k = this.trying(); if (!k) return 0;
    const I = INFO[k];
    return (I.skills.includes(p.per.skill) ? 4 : 0) + I.traits.filter(t => has(p.per, t)).length * 1.2 + (this.s[k].who === p.id ? 2 : 0);
  }

  /** Where the experimenting happens. */
  spot(): Pt | null {
    const k = this.trying(), g = this.g, F = g.fire; if (!k) return null;
    if (k === 'canoe') return g.fishSpot;
    if (k === 'farming') { const P = g.stock.pile; return g.grid.nearest(P.x + (P.x - F.x) * 1.2, P.z + (P.z - F.z) * 1.2) ?? P; }
    if (k === 'herbs') { const v = g.disc.pois.find(q => q.known && q.kind === 'material' && q.mat === 'vines'); return v ? (g.grid.nearest(v.x + 2, v.z + 2) ?? v) : (g.grid.nearest(F.x + 18, F.z - 10) ?? F); }
    return g.camp.get('workbench') ?? g.grid.nearest(F.x + 3, F.z + 2) ?? F;
  }

  /** Someone dropped something on the pile: watching the water, the fish and the logs gives people ideas. */
  noted(p: Person, k: string) {
    const g = this.g; if (g.era === 'crash') return;
    this.seen[k] = (this.seen[k] ?? 0) + 1;
    const need = g.era === 'village' ? 6 : 10;
    if (k === 'water' && this.seen.water >= need) this.clue('pottery', p);
    if ((k === 'fish' || k === 'wood') && (this.seen.fish ?? 0) + (this.seen.wood ?? 0) >= need + 4) this.clue('canoe', p);
  }

  /** At dawn: sprouts by the pile, a sick person and a bitter leaf, the garden's harvest, shelved ideas coming back. */
  dawn() {
    const g = this.g, S = g.story, live = g.people.filter(p => p.mode === 'camp' && p.health < 2 && p !== g.leader);
    if (g.era !== 'crash') {
      const boost = g.era === 'village' ? 2 : 1;
      if (Math.random() < 0.18 * boost && g.stock.food.fruit > 0) this.clue('farming', this.best(live, INFO.farming));
      const sick = g.people.find(p => p.health >= 2 && p.mode !== 'dead');
      if (sick && Math.random() < 0.45 * boost) this.clue('herbs', g.people.find(p => p.per.skill === 'medic' && p.mode === 'camp') ?? sick);
    }
    for (const k of IDEAS) { const I = this.s[k]; if (I.state === 'shelved' && g.clock.day >= I.back) { I.state = 'clue'; this.ask(k); } }
    // the garden: tended days add up to a harvest
    if (g.camp.has('garden')) {
      if (this.tended) this.gardenDays++;
      this.tended = false;
      if (this.gardenDays >= 3) {
        this.gardenDays = 0; this.harvests++;
        const n = 6 + (g.weather.wet > 0.3 ? 3 : 0);
        g.stock.add('fruit', n);
        S.toast(this.harvests === 1 ? 'The first harvest from the garden!' : 'Harvest day in the garden.', 'good');
        S.log(this.harvests === 1 ? 'We ate food we grew ourselves today. Nobody could stop smiling.' : 'Another harvest came in from the garden.');
        if (this.harvests === 1) for (const p of g.people) if (p.mode === 'camp') S.mood(p, 'happy', 60);
      }
    }
  }

  /** One frame of experimenting. Failures at a third and two thirds, out loud; then it works. */
  work(amount: number, p: Person) {
    const k = this.trying(); if (!k) return;
    const I = this.s[k], g = this.g, S = g.story, before = I.prog;
    I.prog = Math.min(1, I.prog + amount / WORK);
    for (const [at, i] of [[0.33, 0], [0.66, 1]] as [number, number][]) if (before < at && I.prog >= at) {
      const line = INFO[k].fails[i];
      S.toast(line, 'bad', p); S.log(line);
      p.poseO = k === 'canoe' ? 'startle' : 'slump'; p.poseT = 2.5;
      if (k === 'herbs' && i === 0) S.mood(p, 'sick', 40);
      for (let j = 0; j < 8; j++) g.fx.emit('puff', p.x + (Math.random() - 0.5) * 2, g.bodies.ground(p) + 0.5, p.z + (Math.random() - 0.5) * 2, { vy: 1, max: 1, r: 0.6, g: 0.55, b: 0.5, a: 0.6 });
    }
    if (I.prog >= 1) this.finish(k, p);
  }

  private finish(k: IdeaKind, p: Person) {
    const g = this.g, S = g.story, I = INFO[k];
    this.s[k].state = 'done';
    g.eraCards.push({ title: `DISCOVERY: ${I.title}`, sub: `${p.per.name} worked it out` });
    S.log(I.done(p.per.name)); S.toast(`Discovery: ${I.title.toLowerCase()}! ${I.what}`, 'good', p);
    S.trust(p, 5); S.trustAll(2, g.leader);
    for (const o of g.people) if (o.mode === 'camp' && Math.hypot(o.x - p.x, o.z - p.z) < 30) { o.poseO = 'cheer'; o.poseT = 1.6; }
    g.onChime(true);
    if (I.unlock) g.camp.add(I.unlock, true);
    const rec = g.requests.record.get(p.id) ?? { good: 0, bad: 0 }; rec.good++; g.requests.record.set(p.id, rec);
  }

  /** Something gives someone an idea. */
  private clue(k: IdeaKind, p: Person | null) {
    const I = this.s[k]; if (!p || I.state !== 'none' || p.mode === 'dead') return;
    I.state = 'clue'; I.who = p.id;
    this.g.story.log(INFO[k].clue(p.per.name));
    this.ask(k);
  }

  /** They come and ask you. Yes starts the experiments; no shelves it for a few days. */
  private ask(k: IdeaKind) {
    const g = this.g, S = g.story, I = this.s[k], p = g.people[I.who];
    if (!p || p.mode === 'dead') { I.state = 'none'; return; }
    I.state = 'asked';
    const yes = () => { I.state = 'trying'; S.say(p, pickOf(["Let's find out.", 'I knew you would say yes.', 'Give me a few days.'])); S.log(`${p.per.name} started experimenting: ${INFO[k].title.toLowerCase()}.`); S.mood(p, 'happy', 20); };
    const no = () => { I.state = 'shelved'; I.back = g.clock.day + 3; S.say(p, pickOf(['Okay. Maybe later.', "I'll keep thinking about it."])); };
    g.requests.urgent(p, 'discovery', INFO[k].pitch, [{ label: 'TRY IT', cls: 'go', fn: yes }, { label: 'NOT NOW', fn: no }],
      () => { if (has(p.per, 'curious') || has(p.per, 'hardworking') || has(p.per, 'hothead')) { yes(); S.log(`Nobody said no, so ${p.per.name} just started.`); } else no(); });
  }

  private best(ps: Person[], I: Info) {
    return ps.slice().sort((a, b) => (I.skills.includes(b.per.skill) ? 3 : 0) + I.traits.filter(t => has(b.per, t)).length - (I.skills.includes(a.per.skill) ? 3 : 0) - I.traits.filter(t => has(a.per, t)).length)[0] ?? null;
  }
}
