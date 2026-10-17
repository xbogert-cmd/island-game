import { Pt } from './people';
import type { WalkGrid } from './path';

export type Food = 'snacks' | 'fruit' | 'coconut' | 'shell' | 'fish';
export const FOODS: Food[] = ['snacks', 'fruit', 'coconut', 'shell', 'fish'];
export type PropKind = 'signalFire' | 'dryingRack' | 'rainCatcher' | 'lookout' | 'sos';
export interface CampProp { kind: PropKind; x: number; z: number; t: number }

/** What the camp has: the food and water pile by the fire, and the things people built. No numbers on screen, only piles. */
export class Stock {
  food: Record<Food, number> = { snacks: 16, fruit: 0, coconut: 0, shell: 0, fish: 0 };
  water = 16;            // the plane's bottles, then jugs from the river
  stolen = 0;            // hidden away by a hoarder
  ration = 0;            // days of half portions left
  today = { food: 0, water: 0 };
  props: CampProp[] = [];
  pile: Pt;

  constructor(fire: Pt, grid: WalkGrid) {
    // a free spot beside the fire, clear of the lean-tos and the sleeping ring
    this.pile = { x: fire.x, z: fire.z + 6 };
    for (const [dx, dz] of [[0, 6], [6, 1], [-6, 1], [1, -7], [6, 5]]) if (grid.walkable(fire.x + dx, fire.z + dz)) { this.pile = { x: fire.x + dx, z: fire.z + dz }; break; }
  }

  get totalFood() { let n = 0; for (const f of FOODS) n += this.food[f]; return n; }

  add(kind: Food | 'water', n: number) {
    if (kind === 'water') { this.water += n; this.today.water += n; }
    else { this.food[kind] += n; this.today.food += n; }
  }

  /** Take up to n food, oldest-spoiling first. Returns how much was taken. */
  takeFood(n: number) {
    let got = 0;
    for (const f of ['fish', 'shell', 'fruit', 'coconut', 'snacks'] as Food[]) { const k = Math.min(this.food[f], n - got); this.food[f] -= k; got += k; if (got >= n) break; }
    return got;
  }
  takeWater(n: number) { const k = Math.min(this.water, n); this.water -= k; return k; }

  /** Evening meal for `eaters` people. Returns how many went without. */
  meal(eaters: number) {
    const each = this.ration > 0 ? 0.5 : 1, need = Math.ceil(eaters * each);
    const f = this.takeFood(need), w = this.takeWater(need);
    if (this.ration > 0) this.ration--;
    return Math.ceil((need - Math.min(f, w)) / each);
  }

  has(kind: PropKind) { return this.props.some(p => p.kind === kind); }
  build(kind: PropKind, x: number, z: number) { if (!this.has(kind)) this.props.push({ kind, x, z, t: 0 }); }

  /** A word, not a number. */
  word(n: number, people: number) { return n <= 0 ? 'OUT' : n < people * 0.6 ? 'LOW' : n < people * 1.5 ? 'ENOUGH' : 'PLENTY'; }
}
