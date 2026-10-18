import { B, LandmarkKind, N, World, heightAt } from '../world/island';
import { mulberry32 } from '../world/noise';
import { WalkGrid } from './path';
import { Person, Pt } from './people';
import type { Mat } from './stock';

export type PoiKind = LandmarkKind | 'water' | 'food' | 'waterfall' | 'crater' | 'clue' | 'material' | 'islet' | 'reef';
export interface Poi {
  id: number; kind: PoiKind; x: number; z: number;
  sight: number;           // how far away it can be noticed
  major: boolean;          // gets a first-sight moment
  label: string;           // how people talk about it before it has a name
  title: string;           // title card
  name: string | null;     // what the player called it
  known: boolean;
  sprite?: string;         // food spots and clues are drawn
  note?: string;           // something found there (journal + next clue)
  next?: number;           // poi id the note points to
  mat?: Mat;               // material sources
  loot?: string;           // islets and the reef: something to bring back, once
}
export interface Marker { id: number; x: number; z: number; r: number; kind: '?' | '!'; text: string; poi: Poi | null; who: Person | null; fake: boolean }

const NAMES: Partial<Record<PoiKind, string[]>> = {
  tail: ['The Tail', 'Broken Tail', 'Tail Hollow'], engine: ['Engine Rest', 'Dead Engine'], ruins: ['The Old Stones', 'Stone Court', 'Temple of Vines'],
  shipwreck: ['Barnacle Hull', "The Captain's Grave", 'Old Bones Wreck'], abandonedCamp: ['Lost Camp', 'The First Camp', 'Ghost Camp'],
  radioTower: ['Rust Tower', 'Signal Hill', 'The Antenna'], giantTree: ['The Elder Tree', 'Grandfather Tree', 'Skyroot'], hotSpring: ['Warm Pools', 'The Kettles', 'Steam Baths'],
  cave: ['Echo Cave', 'The Dark Mouth', 'Bat Hollow'], islet: ['Gull Rock', 'Little Sister', 'Lonely Isle', 'Turtle Key'], reef: ['Clam Gardens', 'The Shallows', 'Pearl Reef'], crater: ['Sky Lake', 'The Bowl', 'Crater Lake'], waterfall: ['{N} Falls', 'Thunder Falls', 'Misty Falls'],
};
const TITLE: Partial<Record<PoiKind, [string, string]>> = {
  tail: ['THE TAIL SECTION', 'the tail section'], engine: ['THE ENGINE', 'the engine'], ruins: ['THE RUINS', 'the ruins'], shipwreck: ['THE SHIPWRECK', 'the old shipwreck'],
  abandonedCamp: ['AN ABANDONED CAMP', 'the abandoned camp'], radioTower: ['THE RADIO TOWER', 'the radio tower'], giantTree: ['THE GIANT TREE', 'the giant tree'],
  hotSpring: ['THE HOT SPRINGS', 'the hot springs'], islet: ['AN ISLET', 'a little island'], reef: ['GIANT CLAMS', 'giant clams on the reef'], cave: ['A CAVE', 'a cave'], crater: ['THE CRATER LAKE', 'the crater lake'], waterfall: ['A WATERFALL', 'the waterfall'],
};
export const MAP = 192;

/** Everything there is to find, what has been seen, rumor markers and the explored map. */
export class Discovery {
  pois: Poi[] = [];
  markers: Marker[] = [];
  explored = new Uint8Array(MAP * MAP);
  exploredVer = 0;
  private mid = 0;

  constructor(w: World, grid: WalkGrid) {
    const rnd = mulberry32(w.seed ^ 0xd15c);
    const add = (kind: PoiKind, x: number, z: number, sight: number, major: boolean, label?: string, extra: Partial<Poi> = {}) => {
      const t = TITLE[kind] ?? ['', kind];
      const p: Poi = { id: this.pois.length, kind, x, z, sight, major, label: label ?? t[1], title: t[0], name: null, known: false, ...extra };
      this.pois.push(p); return p;
    };
    for (const l of w.landmarks) {
      switch (l.kind) {
        case 'fuselage': case 'wing': case 'campfire': case 'steamVent': break;
        case 'giantTree': case 'radioTower': add(l.kind, l.x, l.z, 75, true); break;
        case 'cave': add('cave', l.x, l.z, 18, true); break;
        default: add(l.kind, l.x, l.z, l.kind === 'hotSpring' ? 22 : 30, true);
      }
    }
    add('crater', w.lake.x, w.lake.z, 40, true);
    for (const r of w.rivers) {
      // the biggest waterfall on each river, and the point nearest the crash as a water source
      let best = -1, drop = 2.5;
      for (const k of r.falls) { const d = r.pts[k].y - r.pts[Math.min(r.pts.length - 1, k + 3)].y; if (d > drop) { drop = d; best = k; } }
      if (best >= 0) add('waterfall', r.pts[best].x, r.pts[best].z, 30, true);
      let wp = r.pts[0], wd = 1e9;
      for (const q of r.pts) { const d = Math.hypot(q.x - w.crash.x, q.z - w.crash.z); if (q.y > 0.6 && d < wd && grid.walkable(q.x, q.z)) { wd = d; wp = q; } }
      if (wd < 1e9) add('water', wp.x, wp.z, 12, false, 'fresh water');
    }
    // food spots: fruit in the jungle and grass, coconuts on beaches, shells on the rocks. One is always close to camp.
    const fire = w.landmarks.find(l => l.kind === 'campfire')!;
    const tryFood = (biomes: number[], sprite: string, label: string, near?: [number, number]) => {
      for (let k = 0; k < 4000; k++) {
        const x = 30 + rnd() * (N - 60), z = 30 + rnd() * (N - 60), b = w.biome[(z | 0) * N + (x | 0)];
        if (!biomes.includes(b) || !grid.walkable(x, z) || heightAt(w, x, z) < 0.6) continue;
        const d = Math.hypot(x - fire.x, z - fire.z);
        if (near ? d < near[0] || d > near[1] : d < 50) continue;
        if (this.pois.some(p => Math.hypot(p.x - x, p.z - z) < 35)) continue;
        return add('food', x, z, 9, false, label, { sprite });
      }
    };
    tryFood([B.Jungle, B.Grass, B.Flowers], 'fruitBush', 'a fruit grove', [30, 70]) ?? tryFood([B.Beach], 'coconuts', 'coconut palms', [25, 80]);
    for (let i = 0; i < 3; i++) tryFood([B.Jungle, B.Grass], 'fruitBush', 'a fruit grove');
    for (let i = 0; i < 2; i++) tryFood([B.Beach], 'coconuts', 'coconut palms');
    for (let i = 0; i < 2; i++) tryFood([B.TideRock, B.Beach], 'shells', 'shellfish');
    // material sources: a woodland by camp (known from the start), the wreck for scrap, the rest out there
    const tryMat = (biomes: number[], mat: Mat, sprite: string, label: string, near?: [number, number]) => {
      for (let k = 0; k < 4000; k++) {
        const x = 30 + rnd() * (N - 60), z = 30 + rnd() * (N - 60), b = w.biome[(z | 0) * N + (x | 0)];
        if (!biomes.includes(b) || !grid.walkable(x, z) || heightAt(w, x, z) < 0.6) continue;
        const d = Math.hypot(x - fire.x, z - fire.z);
        if (near ? d < near[0] || d > near[1] : d < 40) continue;
        if (this.pois.some(p => Math.hypot(p.x - x, p.z - z) < 25)) continue;
        return add('material', x, z, 18, false, label, { sprite, mat });
      }
    };
    tryMat([B.Jungle, B.Grass, B.Bamboo], 'wood', 'srcWood', 'a woodland', [14, 45]);
    const wr = grid.nearest(w.crash.x + 4, w.crash.z - 3) ?? { x: w.crash.x, z: w.crash.z };
    add('material', wr.x, wr.z, 10, false, 'the wreck (scrap)', { mat: 'scrap' });
    tryMat([B.Highland, B.TideRock, B.Volcanic], 'stone', 'srcStone', 'a rock outcrop', [30, 110]) ?? tryMat([B.Beach, B.TideRock], 'stone', 'srcStone', 'a stony beach', [30, 110]);
    tryMat([B.Highland, B.TideRock, B.Volcanic], 'stone', 'srcStone', 'a rock outcrop');
    tryMat([B.Bamboo], 'bamboo', 'srcBamboo', 'a bamboo grove', [25, 120]) ?? tryMat([B.Jungle], 'bamboo', 'srcBamboo', 'a bamboo grove');
    tryMat([B.Bamboo], 'bamboo', 'srcBamboo', 'a bamboo grove');
    tryMat([B.Jungle], 'vines', 'srcVines', 'a vine tangle', [25, 110]);
    tryMat([B.Jungle, B.Swamp], 'vines', 'srcVines', 'a vine tangle');
    // clue chains
    const find = (k: PoiKind) => this.pois.find(p => p.kind === k);
    const tail = find('tail');
    if (tail) {
      const along = (f: number) => grid.nearest(w.crash.x + (tail.x - w.crash.x) * f, w.crash.z + (tail.z - w.crash.z) * f) ?? { x: tail.x, z: tail.z };
      const s = along(0.33), t = along(0.66);
      const seat = add('clue', t.x, t.z, 8, false, 'a plane seat', { sprite: 'seat', note: 'A plane seat, torn loose. The tail must be further this way.', next: tail.id });
      add('clue', s.x, s.z, 8, false, 'a suitcase', { sprite: 'suitcase', note: 'A suitcase, far from the wreck. Something fell off the plane before we crashed. More debris that way?', next: seat.id });
      tail.note = 'Inside the tail: a flare gun and a first-aid kit, still sealed.';
    }
    const camp = find('abandonedCamp'), tower = find('radioTower'), ruins = find('ruins'), wreck = find('shipwreck');
    if (camp && tower) { camp.note = 'A note in a rusted tin: "Gone to the tower on the hill to call for help."'; camp.next = tower.id; }
    if (tower && ruins) { tower.note = 'A logbook in the tower hut: "Strange stones deep in the jungle. Someone was here long before us."'; tower.next = ruins.id; }
    if (wreck) {
      let cave: Poi | undefined, cd = 1e9;
      for (const p of this.pois) if (p.kind === 'cave') { const d = Math.hypot(p.x - wreck.x, p.z - wreck.z); if (d < cd) { cd = d; cave = p; } }
      wreck.note = cave ? "A torn captain's map in the hull. It marks a cave in the cliffs." : "A captain's chest, empty but for sand.";
      if (cave) wreck.next = cave.id;
    }
  }

  /** Suggested name for a newly found place. */
  suggest(p: Poi, finder: string) { const l = NAMES[p.kind]; return l ? l[(p.id * 7) % l.length].replace('{N}', finder + "'s") : p.label; }
  display(p: Poi) { return p.name ?? p.label; }

  markExplored(x: number, z: number, r: number) {
    const k = N / MAP, cx = x / k, cz = z / k, cr = r / k;
    for (let j = Math.floor(cz - cr); j <= cz + cr; j++) for (let i = Math.floor(cx - cr); i <= cx + cr; i++) {
      if (i < 0 || j < 0 || i >= MAP || j >= MAP || (i - cx) ** 2 + (j - cz) ** 2 > cr * cr) continue;
      if (!this.explored[j * MAP + i]) { this.explored[j * MAP + i] = 1; this.exploredVer++; }
    }
  }

  /** Unknown places within sight of (x,z). */
  inSight(x: number, z: number, mul: number) { return this.pois.filter(p => !p.known && Math.hypot(p.x - x, p.z - z) < p.sight * mul); }

  addMarker(m: Omit<Marker, 'id'>) { const mk = { ...m, id: this.mid++ }; this.markers.push(mk); return mk; }
  /** A fuzzy rumor marker around the real spot: `off` = how wrong the centre is, `r` = how wide. */
  rumor(p: Poi, off: number, r: number, text: string, who: Person | null, seed = Math.random()) {
    if (p.known || this.markers.some(m => m.poi === p)) return null;
    const a = seed * 6.283, d = off * (0.5 + seed * 0.5);
    return this.addMarker({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, r, kind: '?', text, poi: p, who, fake: false });
  }
  dropMarkersFor(p: Poi) { this.markers = this.markers.filter(m => m.poi !== p); }
  removeMarker(m: Marker) { this.markers = this.markers.filter(x => x !== m); }
  /** Something added after the island was made (islets, the reef). */
  addPoi(kind: PoiKind, x: number, z: number, sight: number, major: boolean, extra: Partial<Poi> = {}) {
    const t = TITLE[kind] ?? ['', kind];
    const p: Poi = { id: this.pois.length, kind, x, z, sight, major, label: t[1], title: t[0], name: null, known: false, ...extra };
    this.pois.push(p); return p;
  }

  nearestKnown(kind: PoiKind, from: Pt) {
    let b: Poi | null = null, bd = 1e9;
    for (const p of this.pois) if (p.known && p.kind === kind) { const d = Math.hypot(p.x - from.x, p.z - from.z); if (d < bd) { bd = d; b = p; } }
    return b;
  }
}
