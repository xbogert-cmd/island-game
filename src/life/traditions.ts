import { has } from './persona';
import { Person, Pt } from './people';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
export type TradKind = 'dead' | 'cat' | 'landing' | 'founding' | 'harvest';
export interface Tradition { kind: TradKind; name: string; day0: number; held: number }

const EVERY = 10;

/**
 * Days the village keeps. They come out of what happened: a death, the cat, the crash, the founding, a harvest.
 * Someone suggests it; if you agree, the village gathers for it every tenth day.
 */
export class Traditions {
  list: Tradition[] = [];
  asked: TradKind[] = [];
  private nextAsk = 0;

  constructor(private g: Group) {}

  has(k: TradKind) { return this.list.some(t => t.kind === k); }
  /** Coming up today? */
  today(): Tradition | null { const d = this.g.clock.day; return this.list.find(t => d > t.day0 && (d - t.day0) % EVERY === 0 && t.held !== d) ?? null; }

  dawn() {
    const g = this.g, day = g.clock.day;
    if (g.era !== 'village' || day < this.nextAsk) return;
    const C = g.cat, V = g.village;
    const cands: [TradKind, () => boolean][] = [
      ['dead', () => g.health.dead.length > 0],
      ['cat', () => C.phase === 'dead'],
      ['founding', () => V.founded > 0 && day - V.founded >= 3],
      ['landing', () => day >= 10],
      ['harvest', () => g.ideas.harvests > 0],
    ];
    const k = cands.find(([k, ok]) => !this.asked.includes(k) && ok());
    if (k) { this.asked.push(k[0]); this.nextAsk = day + 2; this.propose(k[0]); }
  }

  private propose(k: TradKind) {
    const g = this.g, S = g.story, C = g.cat, V = g.village;
    const who = g.people.filter(p => p.mode === 'camp' && !p.kid && p !== g.leader).sort((a, b) => Number(has(b.per, 'kind') || b.per.skill === 'storyteller') - Number(has(a.per, 'kind') || a.per.skill === 'storyteller'))[0];
    if (!who) return;
    const first = g.health.dead[0]?.name ?? '';
    const info: Record<TradKind, [string, string]> = {
      dead: ['Night of the Dead', `Every tenth night, let's go to the graves and say their names. ${first} would want to be remembered.`],
      cat: [`${C.name || 'The Cat'}'s Night`, `The night we killed ${C.name || 'the cat'}. Let's never forget it. A feast every tenth night, and the story told again.`],
      founding: ['Founding Day', `${V.name} needs a birthday. Every tenth day, a feast, and we say the name out loud.`],
      landing: ['Landing Day', "Every tenth day since the crash. We should walk to the wreck together and remember we made it."],
      harvest: ['First Harvest', "We grew our own food. Every tenth day, let's eat from the garden together and give thanks."],
    };
    const [name, text] = info[k];
    g.requests.urgent(who, 'tradition', text, [
      { label: 'MAKE IT A TRADITION', cls: 'go', fn: () => { this.list.push({ kind: k, name, day0: g.clock.day, held: -1 }); S.say(who, 'Then it starts tonight.', 3); S.log(`We decided to keep ${name} every tenth day, starting tonight.`); this.list[this.list.length - 1].day0 = g.clock.day - EVERY; S.trust(who, 2); } },
      { label: 'LET IT GO', fn: () => { S.say(who, 'Okay.', 2); S.mood(who, 'sad', 15); } },
    ], () => {});
  }

  /** Dusk on a tradition day: everyone gathers. */
  update() {
    const g = this.g, h = g.clock.hour, V = g.village;
    if (h < 18 || h > 20.5 || V.ev || g.health.funeral) return;
    const t = this.today(); if (!t) return;
    t.held = g.clock.day;
    this.hold(t);
  }

  private hold(t: Tradition) {
    const g = this.g, S = g.story, V = g.village, C = g.cat;
    const grave = g.camp.list.find(b => b.kind === 'grave');
    const at: Pt = t.kind === 'dead' && grave ? grave : t.kind === 'landing' ? (g.grid.nearest(g.w.crash.x + 4, g.w.crash.z + 4) ?? g.fire) : t.kind === 'harvest' ? (g.camp.get('garden') ?? g.fire) : g.fire;
    const crowd = () => g.people.filter(p => p.act === 'gather');
    const say = (p: Person | undefined, text: string, s = 4.5) => { if (p) S.say(p, text, s); };
    g.eraCards.push({ title: t.name.toUpperCase(), sub: `${V.name || 'The camp'} remembers` });
    const lines: Record<TradKind, [number, () => void][]> = {
      dead: [[4, () => say(crowd()[0], g.health.dead.map(d => d.name).join('. ') + '.')], [10, () => say(crowd()[1], 'We remember you.')]],
      cat: [[4, () => { const s = crowd().find(p => p.per.skill === 'storyteller') ?? crowd()[0]; say(s, `Tell it again: how ${g.chatter.legend || `we brought down ${C.name || 'the cat'}`}!`, 5); }], [11, () => { for (const p of crowd()) { p.poseO = 'cheer'; p.poseT = 2.5; } }]],
      founding: [[4, () => say(crowd()[0], `${V.name}!`, 3)], [6, () => { for (const p of crowd()) { p.poseO = 'cheer'; p.poseT = 2; } say(crowd()[1], `${V.name}!`, 3); }]],
      landing: [[4, () => say(crowd()[0], `Day ${g.clock.day}. We're still here.`)], [10, () => say(crowd()[1], pickOf(['Still here.', 'Every one of these days counts.', 'I still dream about the fall.']))]],
      harvest: [[4, () => say(crowd()[0], 'Eat! We grew this!')], [8, () => { for (const p of crowd()) { p.poseO = 'eat'; p.poseT = 5; } }]],
    };
    V.gather(t.kind === 'dead' ? 'mourn' : 'feast', at, t.kind === 'dead' ? 3 : 4, 22, lines[t.kind].map(([at, fn]) => ({ at, fn })), () => {
      for (const p of g.people) if (p.mode === 'camp') S.mood(p, t.kind === 'dead' ? 'fond' : 'happy', 90);
      S.trustAll(1, g.leader);
      S.log(`${t.name} tonight. ${t.kind === 'dead' ? 'We said their names at the graves.' : t.kind === 'landing' ? 'We stood at the wreck together for a while.' : 'Everyone ate and sang until late.'}`);
    });
    if (t.kind !== 'dead') g.stock.takeFood(Math.ceil(g.people.length / 4));
  }
}
