import { has } from './persona';
import { Person } from './people';
import { dirName } from './scouting';
import type { Group } from './group';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const KEEP_LINE: Record<string, string> = {
  'a photo of their kids': 'I look at this photo every night. They must think I\'m dead.', 'a wedding ring': 'Somebody out there is still waiting for me.',
  'a wristwatch, stopped at the crash': 'My watch stopped the minute we hit. I can\'t take it off.', 'a paperback with the ending torn out': "I'll never know how this book ends.",
  'a lucky coin': 'Heads, we get rescued tomorrow.', 'a postcard they never sent': 'I wrote this postcard on the plane. Never got to mail it.',
  "a child's drawing": "My kid drew this. It's a plane. Funny, huh.", 'a rosary': '(quietly prays over a rosary)',
  'a lighter that still works': "Still works. Don't tell anyone or they'll all want it.", 'their boarding pass': 'Seat 14C. I keep reading it like it might change.',
  'a cassette tape': 'No player. I just like holding it.',
  'a deck of cards': 'Anyone for cards? I promise I won\'t cheat this time.', 'a sketchbook': "I've been drawing the island. Want to see?",
  'reading glasses with one lens': 'Half my world is blurry now. The good half.', 'a seashell necklace': 'Bought this at the airport. Now I live on the beach it came from.',
  'a tiny teddy bear': "It was my son's. He made me take it for luck.",
};
interface Rumor { text: string; from: Person; scary: boolean; told: number; day: number }

/** Small things people notice while working, and how stories change as they're retold. */
export class Chatter {
  rumors: Rumor[] = [];
  legend = '';

  constructor(private g: Group) {}

  rumor(from: Person, text: string, scary: boolean) {
    this.rumors.push({ text, from, scary, told: 0, day: this.g.clock.day });
    if (this.rumors.length > 10) this.rumors.shift();
  }

  /** Out gathering, people sometimes notice something small nearby. Liars sometimes make it up. */
  notice(p: Person) {
    const g = this.g, S = g.story;
    if (Math.random() > 0.06 || g.era === 'crash') return;
    if (has(p.per, 'liar') && Math.random() < 0.3) {
      const what = pickOf(['wild figs', 'a clear spring', 'turtle eggs', 'a cave full of bats', 'a banana grove']), a = Math.random() * 6.283;
      g.disc.addMarker({ x: p.x + Math.cos(a) * 25, z: p.z + Math.sin(a) * 25, r: 14, kind: '?', text: `${p.per.name}: ${what}`, poi: null, who: p, fake: true });
      S.say(p, `I saw ${what} out there. I swear.`, 3);
      this.rumor(p, what, false);
      return;
    }
    const F = g.fire;
    const q = g.disc.pois.filter(o => !o.known && (o.kind === 'material' || o.kind === 'food') && Math.hypot(o.x - p.x, o.z - p.z) < 75)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!q) return;
    const where = dirName(q.x - F.x, q.z - F.z);
    S.say(p, pickOf([`There's ${q.label} out to the ${where}.`, `I spotted ${q.label} past where I was working.`, `Did anyone know there's ${q.label} ${where} of camp?`]), 3.5);
    g.know(q, p, false);
    this.rumor(p, `${q.label} to the ${where}`, false);
  }

  /** Someone retells what they heard, and it grows in the telling. */
  retell(sp: Person): string | null {
    const r = this.rumors.filter(x => x.from !== sp && this.g.clock.day - x.day < 4 && x.told < 4).pop();
    if (!r) return null;
    r.told++;
    const F = r.from.per.name, scared = has(sp.per, 'cowardly') || has(sp.per, 'hothead') || sp.per.skill === 'storyteller';
    if (r.scary && scared) {
      const big = r.text.includes('paw') ? 'the cat was IN camp last night!' : r.text.includes('fish') ? "it's stealing our food right under our noses!" : r.text.includes('eyes') ? 'there were dozens of eyes out there!' : 'those claw marks were higher than my head!';
      return `${F} said ${big} ${r.told > 2 ? 'Everybody knows it.' : ''}`;
    }
    if (has(sp.per, 'liar')) return `${F} found ${r.text}. Bigger than you'd believe.`;
    if (has(sp.per, 'honest') || has(sp.per, 'calm')) return `${F} says there's ${r.text}. That's all we know.`;
    return `Heard from ${F}: ${r.text}.`;
  }

  /** Something they carried from home. A harmonica gets played. */
  keepsake(sp: Person): string | null {
    const k = pickOf(sp.keeps); if (!k) return null;
    if (k.includes('harmonica')) { return pickOf(['(plays a slow tune on the harmonica)', '(plays something everyone knows the words to)']); }
    if (k.includes("'s ")) return pickOf([`I still carry ${k}. Feels like they're still with us.`, `I hold ${k} sometimes. Is that strange?`]);
    return KEEP_LINE[k] ?? null;
  }

  /** Talk about what's going on: builds, the hungry, the dead, the cat, legends. */
  topical(sp: Person): string | null {
    const g = this.g, H = g.health, C = g.cat, out: string[] = [];
    const recent = H.dead.filter(d => g.clock.day - d.day < 6);
    if (recent.length) { const d = pickOf(recent); out.push(`I keep thinking about ${d.name}.`, `${d.name} would have laughed at this.`); }
    if (g.stats.built.some(b => b.includes('hut')) || g.camp.count('hut') === 1) out.push('Finally, a roof over our heads.', 'Sleeping in a real hut. I almost cried.');
    if (g.people.some(p => p.health >= 2 && p.mode === 'camp')) out.push('Is anyone checking on the sick?', "I don't want to catch whatever they've got.");
    if (C.phase === 'stalk' && C.name) out.push(`${C.name} was out there again last night.`, `I won't go past the fire after dark. Not with ${C.name} around.`);
    if (C.phase === 'signs' && C.signs > 0) out.push('Something has been circling the camp at night.');
    if (this.legend) out.push(`Tell it again, how ${this.legend}.`);
    if (g.stock.tools.axe > 0) out.push('That axe changed everything.');
    if (!out.length) return null;
    const t = pickOf(out);
    if (t.includes('cat') || (C.name && t.includes(C.name))) g.story.mood(sp, 'scared', 10);
    return t;
  }
}
