import { mulberry32 } from '../world/noise';

/** Who each survivor is: generated once from the island seed. Pure data, no rendering. */

export type Trait = 'brave' | 'cowardly' | 'honest' | 'liar' | 'kind' | 'selfish' | 'hardworking' | 'lazy' | 'calm' | 'hothead' | 'curious' | 'loner' | 'social';
export type Skill = 'medic' | 'navigator' | 'climber' | 'fisher' | 'mechanic' | 'cook' | 'storyteller' | 'builder' | 'none';
export type Strength = 'fast walker' | 'sharp eyes' | 'strong' | 'good sense of direction' | 'night owl' | 'tireless';
export type Weakness = 'afraid of the dark' | "can't swim" | 'bad knee' | 'clumsy' | 'poor eyesight' | 'gets lost easily';
export type Secret = 'hoarder' | 'fakeJob' | 'hiddenFear' | 'knowsSomeone' | 'runaway';
export type PairKind = 'siblings' | 'couple' | 'coworkers' | 'parent';

export interface Look { skin: string; hair: string; style: string; shirt: string; pants: string; cap: string }
export interface Persona {
  id: number;
  name: string;
  age: 'teen' | 'adult' | 'elder';
  look: Look;
  backstory: string;
  skill: Skill;
  traits: Trait[];
  strength: Strength;
  weakness: Weakness;
  secret: Secret | null;
  /** For 'knowsSomeone': who they secretly know. */
  secretWith: number;
  pair: number;          // id of the person they arrived with, or -1
  pairKind: PairKind | null;
  trust: number;         // trust in the leader, 0..100
  voice: number;         // pitch for speech blips
}

const NAMES = ['Mia', 'Leo', 'Ava', 'Sam', 'Nora', 'Kai', 'Iris', 'Owen', 'Zoe', 'Eli', 'Ruth', 'Theo', 'Lena', 'Max', 'June', 'Omar', 'Rosa', 'Finn', 'Tess', 'Jude',
  'Maya', 'Hugo', 'Ines', 'Abe', 'Cleo', 'Ravi', 'Gwen', 'Tomas', 'Ada', 'Dev', 'Lucia', 'Ben', 'Hana', 'Marco', 'Faye', 'Kofi', 'Vera', 'Noah', 'Lila', 'Ezra',
  'Pia', 'Joel', 'Amara', 'Seth', 'Yuki', 'Rex', 'Nadia', 'Cal', 'Esme', 'Ivan'];
const SKIN = ['#f1c7a0', '#d9a273', '#a8704a', '#7a4a2e', '#e8b98f'], HAIR = ['#2a1c14', '#5a3820', '#c9a050', '#151515', '#8a4a2a', '#d8d8d8'];
const SHIRT = ['#e2553f', '#f0c040', '#6bc06b', '#c868c0', '#f08a3a', '#3fbfb0', '#ffffff', '#3aa0e0'], PANTS = ['#3a4a6a', '#5a4636', '#2f2f3a', '#6a6a72'];
const STYLES = ['short', 'long', 'cap', 'short', 'bald', 'long'];

const STORIES: Record<Skill, string[]> = {
  medic: ['Flight nurse heading home', 'Retired doctor visiting family', 'Paramedic on vacation'],
  navigator: ['Ex-Navy, never talks about it', 'Sailing instructor', 'Geography teacher'],
  climber: ['Rock-climbing guide', 'Tree surgeon from Oregon'],
  fisher: ['Grew up on a fishing boat', 'Sushi chef'],
  mechanic: ['Airline mechanic flying standby', 'Ran a garage back home'],
  cook: ['Line cook going to a wedding', 'Food truck owner'],
  storyteller: ["Children's book author", 'Late-night radio host'],
  builder: ['Carpenter between jobs', 'Architecture student'],
  none: ['Business class, won\'t say why', 'College student on spring break', 'Accountant on a first holiday in years', 'Influencer with a dead phone', 'Lottery winner, apparently'],
};
const AXES: Trait[][] = [['brave', 'cowardly'], ['honest', 'liar'], ['kind', 'selfish'], ['hardworking', 'lazy'], ['calm', 'hothead'], ['curious'], ['loner'], ['social']];
const STRENGTHS: Strength[] = ['fast walker', 'sharp eyes', 'strong', 'good sense of direction', 'night owl', 'tireless'];
const WEAKNESSES: Weakness[] = ['afraid of the dark', "can't swim", 'bad knee', 'clumsy', 'poor eyesight', 'gets lost easily'];
const SECRETS: Secret[] = ['hoarder', 'fakeJob', 'hiddenFear', 'knowsSomeone', 'runaway'];
const PAIRS: PairKind[] = ['siblings', 'couple', 'coworkers', 'parent'];

export const has = (p: Persona, t: Trait) => p.traits.includes(t);

/** Builds the survivors and their starting relationships (rel[a*n+b], -100..100). */
export function makePeople(seed: number) {
  const rnd = mulberry32(seed ^ 0x5eed);
  const pick = <T,>(a: readonly T[]) => a[(rnd() * a.length) | 0];
  const n = 12 + ((rnd() * 5) | 0);
  const names = [...NAMES].sort(() => rnd() - 0.5);
  const people: Persona[] = [];
  const skills = (Object.keys(STORIES) as Skill[]).filter(s => s !== 'none').sort(() => rnd() - 0.5);
  for (let i = 0; i < n; i++) {
    const skill: Skill = i < skills.length ? skills[i] : 'none';
    const traits: Trait[] = [];
    for (const ax of [...AXES].sort(() => rnd() - 0.5)) {
      if (traits.length >= 2 + (rnd() < 0.4 ? 1 : 0)) break;
      traits.push(pick(ax));
    }
    const strength = pick(STRENGTHS);
    let weakness = pick(WEAKNESSES);
    if (strength === 'night owl' && weakness === 'afraid of the dark') weakness = 'bad knee';
    if (strength === 'good sense of direction' && weakness === 'gets lost easily') weakness = 'clumsy';
    const look: Look = { skin: pick(SKIN), hair: pick(HAIR), style: pick(STYLES), shirt: pick(SHIRT), pants: pick(PANTS), cap: pick(SHIRT) };
    const age = rnd() < 0.12 ? 'teen' : rnd() < 0.15 ? 'elder' : 'adult';
    if (age === 'elder') look.hair = '#d8d8d8';
    let trust = 45 + (rnd() - 0.5) * 20;
    if (traits.includes('kind') || traits.includes('social')) trust += 5;
    if (traits.includes('loner')) trust -= 10;
    if (traits.includes('hothead')) trust -= 5;
    people.push({
      id: i, name: names[i], age, look, backstory: pick(STORIES[skill]), skill, traits, strength, weakness,
      secret: rnd() < 0.34 ? pick(SECRETS) : null, secretWith: -1, pair: -1, pairKind: null,
      trust: Math.round(Math.max(20, Math.min(75, trust))), voice: 0.75 + rnd() * 0.6,
    });
  }
  // a fake job means the backstory claims a skill they don't have
  for (const p of people) if (p.secret === 'fakeJob') { if (p.skill === 'none') p.backstory = pick(STORIES.medic); p.skill = 'none'; }
  // pairs who arrived together
  const free = people.map(p => p.id).sort(() => rnd() - 0.5);
  const nPairs = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let k = 0; k < nPairs; k++) {
    const a = people[free.pop()!], b = people[free.pop()!], kind = pick(PAIRS);
    a.pair = b.id; b.pair = a.id; a.pairKind = b.pairKind = kind;
    if (kind === 'parent') { a.age = 'adult'; b.age = 'teen'; }
    if (kind === 'siblings') b.look.skin = a.look.skin;
  }
  for (const p of people) if (p.secret === 'knowsSomeone') {
    let o = (rnd() * n) | 0; if (o === p.id || o === p.pair) o = (o + 1) % n; if (o === p.id) o = (o + 1) % n;
    p.secretWith = o;
  }
  const rel = new Float32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = people[a], B = people[b];
    let r = -15 + rnd() * 40;
    const both = (x: Trait, y: Trait) => (has(A, x) && has(B, y)) || (has(A, y) && has(B, x));
    if (both('hothead', 'calm')) r -= 10;
    if (both('liar', 'honest')) r -= 10;
    if (both('hothead', 'hothead')) r -= 15;
    if (has(A, 'social') && has(B, 'social')) r += 10;
    if (has(A, 'kind') || has(B, 'kind')) r += 5;
    if (has(A, 'selfish') || has(B, 'selfish')) r -= 5;
    if (A.pair === b) r = 60 + rnd() * 20;
    rel[a * n + b] = rel[b * n + a] = Math.round(r);
  }
  return { people, rel };
}

/** Short label for a trust value, shown instead of a number. */
export function trustWord(t: number) {
  return t >= 80 ? 'Loyal' : t >= 60 ? 'Trusts you' : t >= 40 ? 'Unsure' : t >= 20 ? 'Doubts you' : 'Against you';
}

export const SKILL_LABEL: Record<Skill, string> = {
  medic: 'Medic', navigator: 'Navigator', climber: 'Climber', fisher: 'Fisher', mechanic: 'Mechanic', cook: 'Cook', storyteller: 'Storyteller', builder: 'Builder', none: '',
};
export const SECRET_LABEL: Record<Secret, string> = {
  hoarder: 'Hoards food', fakeJob: 'Lied about their job', hiddenFear: 'Hides a fear', knowsSomeone: 'Knew someone on the flight', runaway: 'Running from something',
};
