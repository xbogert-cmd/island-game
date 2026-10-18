import { Pt } from './people';
import type { WalkGrid } from './path';

export type Food = 'snacks' | 'fruit' | 'coconut' | 'shell' | 'fish' | 'meat';
export const FOODS: Food[] = ['snacks', 'fruit', 'coconut', 'shell', 'fish', 'meat'];
export type Tool = 'knife' | 'axe' | 'spear' | 'basket' | 'rope';
export const TOOLS: Tool[] = ['knife', 'axe', 'spear', 'basket', 'rope'];
export const TOOL_COST: Record<Tool, Partial<Record<Mat, number>>> = { knife: { scrap: 1, wood: 1 }, axe: { stone: 2, wood: 2, vines: 1 }, spear: { wood: 2, stone: 1, vines: 1 }, basket: { vines: 3 }, rope: { vines: 2 } };
export type Mat = 'wood' | 'bamboo' | 'stone' | 'vines' | 'scrap';
export const MATS: Mat[] = ['wood', 'bamboo', 'stone', 'vines', 'scrap'];

/** What the camp has: the food, water and material heaps by the fire. No numbers on screen, only piles and words. */
export class Stock {
  food: Record<Food, number> = { snacks: 16, fruit: 0, coconut: 0, shell: 0, fish: 0, meat: 0 };
  tools: Record<Tool, number> = { knife: 0, axe: 0, spear: 0, basket: 0, rope: 0 };
  toolKnown = new Set<Tool>();
  hides = 0; cured = 0;
  /** healing plants from the jungle */
  herbs = 0;
  water = 16;            // the plane's bottles, then jugs from the river
  stolen = 0;            // hidden away by a hoarder
  ration = 0;            // days of half portions left
  mat: Record<Mat, number> = { wood: 0, bamboo: 0, stone: 0, vines: 0, scrap: 0 };
  today = { food: 0, water: 0 };
  pile: Pt;

  constructor(fire: Pt, grid: WalkGrid) {
    // a free spot beside the fire, clear of the lean-tos and the sleeping ring
    this.pile = { x: fire.x, z: fire.z + 6 };
    for (const [dx, dz] of [[0, 6], [6, 1], [-6, 1], [1, -7], [6, 5]]) if (grid.walkable(fire.x + dx, fire.z + dz)) { this.pile = { x: fire.x + dx, z: fire.z + dz }; break; }
  }

  get totalFood() { let n = 0; for (const f of FOODS) n += this.food[f]; return n; }

  add(kind: Food | 'water' | Mat | 'herbs', n: number) {
    if (kind === 'herbs') this.herbs += n;
    else if (kind === 'water') { this.water += n; this.today.water += n; }
    else if (kind in this.mat) this.mat[kind as Mat] += n;
    else { this.food[kind as Food] += n; this.today.food += n; }
  }

  /** Take up to n food, oldest-spoiling first. Returns how much was taken. */
  takeFood(n: number) {
    let got = 0;
    for (const f of ['meat', 'fish', 'shell', 'fruit', 'coconut', 'snacks'] as Food[]) { const k = Math.min(this.food[f], n - got); this.food[f] -= k; got += k; if (got >= n) break; }
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

  /** Take materials if all are there. */
  pay(cost: Partial<Record<Mat, number>>) {
    for (const m of MATS) if ((cost[m] ?? 0) > this.mat[m]) return false;
    for (const m of MATS) this.mat[m] -= cost[m] ?? 0;
    return true;
  }

  /** Each dawn fresh food goes off a little. Storage halves it; a drying rack keeps fish. */
  spoil(storage: boolean, rack: boolean, smoke = false, pots = false) {
    const k = (storage ? 0.5 : 1) * (pots ? 0.6 : 1); let lost = 0;
    for (const [f, r] of [['fruit', 0.25], ['shell', 0.3], ['fish', rack ? 0.06 : 0.35], ['meat', smoke ? 0.05 : 0.4]] as [Food, number][]) { const n = Math.floor(this.food[f] * r * k); this.food[f] -= n; lost += n; }
    return lost;
  }

  /** A word, not a number. */
  word(n: number, people: number) { return n <= 0 ? 'OUT' : n < people * 0.6 ? 'LOW' : n < people * 1.5 ? 'ENOUGH' : 'PLENTY'; }
}
