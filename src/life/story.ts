import { Clock } from '../sim/clock';
import { Person } from './people';
import { SKILL_LABEL, Skill, has } from './persona';

export interface Bubble { p: Person; text: string; t: number; max: number }
export interface Toast { text: string; kind: 'good' | 'bad' | 'info'; who?: Person }
export interface Entry { day: number; time: string; text: string }

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

/** Relationships, trust, the journal, toasts and speech. Everything social goes through here. */
export class Story {
  journal: Entry[] = [];
  toasts: Toast[] = [];
  bubbles: Bubble[] = [];
  skillKnown = new Set<number>();
  secretKnown = new Set<number>();
  onSay: (p: Person, text: string) => void = () => {};
  private n: number;

  constructor(public people: Person[], public relM: Float32Array, private clock: Clock) { this.n = people.length; }

  rel(a: Person, b: Person) { return this.relM[a.id * this.n + b.id]; }
  addRel(a: Person, b: Person, d: number) {
    if (a === b) return;
    const v = Math.max(-100, Math.min(100, this.rel(a, b) + d));
    this.relM[a.id * this.n + b.id] = this.relM[b.id * this.n + a.id] = v;
  }
  trust(p: Person, d: number) { p.per.trust = Math.max(0, Math.min(100, p.per.trust + d)); }
  trustAll(d: number, leader: Person | null) { for (const p of this.people) if (p !== leader) this.trust(p, d); }
  avgTrust(leader: Person | null) { const o = this.people.filter(p => p !== leader); return o.reduce((s, p) => s + p.per.trust, 0) / Math.max(1, o.length); }

  friend(p: Person) { let b: Person | null = null, v = 30; for (const o of this.people) if (o !== p && this.rel(p, o) > v) { v = this.rel(p, o); b = o; } return b; }
  rival(p: Person) { let b: Person | null = null, v = -30; for (const o of this.people) if (o !== p && this.rel(p, o) < v) { v = this.rel(p, o); b = o; } return b; }

  say(p: Person, text: string, max = 3.4) {
    this.bubbles = this.bubbles.filter(b => b.p !== p);
    this.bubbles.push({ p, text, t: 0, max });
    this.onSay(p, text);
  }
  log(text: string) { this.journal.push({ day: this.clock.day, time: this.clock.label, text }); }
  toast(text: string, kind: Toast['kind'] = 'info', who?: Person) { this.toasts.push({ text, kind, who }); }
  mood(p: Person, m: Person['tmood'], secs = 8) { p.tmood = m; p.moodT = secs; }

  update(dt: number) {
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter(b => b.t < b.max);
  }

  /** Reveal a hidden skill the first time it matters. */
  revealSkill(p: Person, how: string) {
    if (this.skillKnown.has(p.id) || p.per.skill === 'none') return;
    this.skillKnown.add(p.id);
    this.toast(`${p.per.name} is a ${SKILL_LABEL[p.per.skill].toLowerCase()}!`, 'good', p);
    this.log(how);
  }
  hasSkill(p: Person, s: Skill) { return p.per.skill === s; }

  /** A secret comes out. Changes how everyone feels about them. */
  revealSecret(p: Person, how?: string) {
    const s = p.per.secret; if (!s || this.secretKnown.has(p.id)) return;
    this.secretKnown.add(p.id);
    const N = p.per.name, others = this.people.filter(o => o !== p);
    let text = '';
    switch (s) {
      case 'hoarder': text = `${N} was caught hiding food from the group.`; for (const o of others) this.addRel(p, o, has(o.per, 'kind') ? -6 : -14); break;
      case 'fakeJob': text = `${N} admits the story was a lie. "${p.per.backstory}"? Never.`; for (const o of others) this.addRel(p, o, has(o.per, 'honest') ? -15 : -7); break;
      case 'hiddenFear': text = `${N} confesses they are terrified of the dark.`; p.per.weakness = 'afraid of the dark'; for (const o of others) if (has(o.per, 'kind')) this.addRel(p, o, 6); break;
      case 'knowsSomeone': {
        const m = this.people[p.per.secretWith];
        text = `${N} and ${m.per.name} knew each other before the flight. Neither said a word.`;
        this.addRel(p, m, 20); for (const o of others) if (o !== m) { this.addRel(p, o, -4); this.addRel(m, o, -4); }
        this.secretKnown.add(m.id); break;
      }
      case 'runaway': text = `${N} says they were running from something back home. They won't say what.`; for (const o of others) this.addRel(p, o, has(o.per, 'honest') ? -6 : has(o.per, 'kind') ? 5 : 0); break;
    }
    this.toast(how ?? text, 'bad', p);
    this.log(how ?? text);
    this.mood(p, 'sad', 30);
  }

  private talkT = 4;
  /**
   * Talk around the campfire at night. Lines come from relationships, recent events and trust.
   * `ctx` gives what the talk can be about.
   */
  campfire(dt: number, sitting: Person[], ctx: { leader: Person | null; away: Person[]; places: string[]; food: boolean; nights: number; hungry: Person[]; gripes: { p: Person; text: string }[]; signal: boolean }) {
    if (sitting.length < 2 || (this.talkT -= dt) > 0) return;
    this.talkT = 3 + Math.random() * 4;
    const sp = pickOf(sitting), L = ctx.leader, N = sp.per.name;
    const others = sitting.filter(o => o !== sp), o = pickOf(others), fr = others.find(x => this.rel(sp, x) > 35), rv = others.find(x => this.rel(sp, x) < -30);
    const roll = Math.random();
    // a secret slips out now and then
    if (sp.per.secret && !this.secretKnown.has(sp.id) && roll < 0.06) { this.say(sp, pickOf(['...', 'I have to tell you something.', 'Fine. You want the truth?'])); this.revealSecret(sp); return; }
    // hidden skills come out in stories
    if (!this.skillKnown.has(sp.id) && roll < 0.2) {
      const sk = sp.per.skill;
      if (sk === 'storyteller') { this.say(sp, 'Gather round. Once, on a dark sea...', 5); for (const x of others) this.mood(x, 'happy', 15); this.revealSkill(sp, `${N} told a story by the fire. Everyone forgot where we were for a while.`); return; }
      if (sk === 'cook' && ctx.food) { this.say(sp, 'Give me that. I know how to cook this.'); this.revealSkill(sp, `${N} turned what we found into a real meal.`); for (const x of others) this.mood(x, 'happy', 10); return; }
      if (sk === 'builder') { this.say(sp, 'Bamboo and rope. I could build us a real roof.'); this.revealSkill(sp, `${N} sketched a shelter in the sand. They used to build houses.`); return; }
    }
    const lines: [number, () => void][] = [];
    if (ctx.away.length) { const a = pickOf(ctx.away); lines.push([3, () => this.say(sp, this.rel(sp, a) > 40 || sp.per.pair === a.id ? `${a.per.name} should be back by now...` : `Where is ${a.per.name}? It's dark out there.`)]); lines.push([1, () => this.mood(sp, 'worried', 20)]); }
    if (fr) lines.push([3, () => { this.say(sp, pickOf([`${fr.per.name}, remember the airline food? I miss it.`, `Ha! ${fr.per.name} snores like an engine.`, 'At least the stars are nice.', `Glad you're here, ${fr.per.name}.`])); this.mood(sp, 'fond', 8); this.mood(fr, 'happy', 8); this.addRel(sp, fr, 1); }]);
    if (rv) lines.push([3, () => { this.say(sp, pickOf([`${rv.per.name} hasn't lifted a finger all day.`, `Stay out of my spot, ${rv.per.name}.`, `Nobody asked you, ${rv.per.name}.`])); this.mood(sp, 'angry', 8); this.mood(rv, 'angry', 8); this.addRel(sp, rv, -2); setTimeout(() => this.say(rv, pickOf(['Say that again.', 'Whatever.', 'Unbelievable.'])), 1600); }]);
    if (L && sp !== L) {
      const t = sp.per.trust;
      if (t > 65) lines.push([2, () => this.say(sp, pickOf([`We're lucky ${L.per.name} is leading.`, `${L.per.name} will get us through this.`]))]);
      if (t < 35) lines.push([2 + (35 - t) / 10, () => { this.say(sp, pickOf([`Why are we following ${L.per.name} anyway?`, `${L.per.name} is going to get us killed.`, 'We should be doing more than this.'])); this.mood(sp, 'angry', 6); }]);
    }
    const gi = ctx.gripes.findIndex(x => x.p === sp);
    if (gi >= 0) { const gr = ctx.gripes.splice(gi, 1)[0]; this.say(sp, gr.text); this.mood(sp, 'angry', 10); return; }
    if (ctx.hungry.includes(sp)) lines.push([3, () => { this.say(sp, pickOf(["My stomach won't stop growling.", "I can't sleep this hungry.", 'Is there really nothing left?'])); this.mood(sp, 'sad', 10); }]);
    if (ctx.signal) lines.push([0.8, () => this.say(sp, pickOf(['Look at the signal fire. Somebody has to see that.', 'Every night I watch the signal fire and hope.']))]);
    if (ctx.places.length) { const pl = pickOf(ctx.places); lines.push([2, () => this.say(sp, pickOf([`Did you see ${pl}? Who made that?`, `I keep thinking about ${pl}.`]))]); }
    lines.push([1.5, () => this.say(sp, pickOf(['Back home I was ' + sp.per.backstory.toLowerCase() + '.', 'I keep hearing engines in the waves.', `How many days now? ${ctx.nights}?`, 'Somebody will come for us. Right?', `${o.per.name}, you okay?`]))]);
    if (sp.per.pair >= 0) lines.push([1, () => { const pr = this.people[sp.per.pair]; if (sitting.includes(pr)) { this.say(sp, `At least we're together, ${pr.per.name}.`); this.mood(sp, 'fond', 8); } }]);
    let tot = 0; for (const l of lines) tot += l[0];
    let k = Math.random() * tot;
    for (const l of lines) if ((k -= l[0]) <= 0) { l[1](); break; }
  }
}
