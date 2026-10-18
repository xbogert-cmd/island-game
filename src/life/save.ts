import type { Game } from '../game';
import type { Group } from './group';
import type { Mode } from './people';
import type { Trip } from './scouting';

/** One save per island, in localStorage. Autosaved at dawn, every minute, and when the tab closes. */
const KEY = (seed: number) => `island.save.${seed}`;
export const LAST = 'island.lastSeed';

export interface SaveInfo { day: number; leader: string }

export function saveInfo(seed: number): SaveInfo | null {
  try { const s = JSON.parse(localStorage.getItem(KEY(seed)) ?? 'null'); return s ? { day: s.day, leader: s.leaderName } : null; } catch { return null; }
}
export function clearSave(seed: number) { try { localStorage.removeItem(KEY(seed)); } catch { /* ignore */ } }

const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string, out: Uint8Array) => { const t = atob(s); for (let i = 0; i < t.length && i < out.length; i++) out[i] = t.charCodeAt(i); };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let off = false;
/** Starting over: don't let the closing tab write the old game back. */
export function stopSaving() { off = true; }

export function save(game: Game) {
  const g = game.group, L = g.leader; if (!L || off) return;
  const G = g.goals as Any;
  const data = {
    v: 1, day: game.clock.day, leaderName: L.per.name, minutes: game.clock.minutes,
    leader: L.id, era: g.era, gday: (g as Any).day, lastFind: g.lastFind, firstAid: g.firstAid, mealDay: (g as Any).mealDay, recap: g.recap, stats: g.stats,
    people: g.people.map(p => ({
      x: p.x, z: p.z, mode: p.mode, face: p.face, trust: p.per.trust, weakness: p.per.weakness, hurt: p.hurt, heal: p.heal, hungry: p.hungry,
      xp: p.xp, pin: p.pin, sleepIn: p.sleepIn, savedBy: p.savedBy, apart: p.apart, hateT: p.hateT, health: p.health, hungerN: p.hungerN,
      crew: p.crew, outAt: p.outAt, tripAt: p.tripAt, tiredN: p.tiredN, haul: p.haul, keeps: p.keeps,
      troubleT: g.scouting.tripOf(p)?.troubleT ?? 0,
    })),
    rel: Array.from(g.story.relM), journal: g.story.journal, skillKnown: [...g.story.skillKnown], secretKnown: [...g.story.secretKnown],
    pois: g.disc.pois.map(q => [q.known ? 1 : 0, q.name]),
    markers: g.disc.markers.map(m => ({ x: m.x, z: m.z, r: m.r, kind: m.kind, text: m.text, fake: m.fake, poi: m.poi ? m.poi.id : -1, who: m.who ? m.who.id : -1 })),
    explored: b64(g.disc.explored),
    stock: { food: g.stock.food, water: g.stock.water, stolen: g.stock.stolen, ration: g.stock.ration, mat: g.stock.mat, today: g.stock.today, tools: g.stock.tools, toolKnown: [...g.stock.toolKnown], hides: g.stock.hides, cured: g.stock.cured },
    dead: g.health.dead, legend: g.chatter.legend, crewMode: g.crew.mode,
    ideas: { s: g.ideas.s, seen: g.ideas.seen, tended: g.ideas.tended, gardenDays: g.ideas.gardenDays, harvests: g.ideas.harvests },
    village: (({ name, founded, settled, state, stormIn, warned, prepared, storming, rumble }) => ({ name, founded, settled, state: state === 'tonight' ? 'tonight' : state === 'asked' ? 'none' : state, stormIn, warned, prepared, storming, rumble }))(g.village),
    looted: g.disc.pois.filter(q => q.loot === '').map(q => q.id), herbs: g.stock.herbs, wounded: g.cat.wounded,
    cat: { phase: g.cat.phase, name: g.cat.name, signs: g.cat.signs, bold: g.cat.bold, hunting: g.cat.hunting, nights: (g.cat as Any).campNights },
    wear: b64(Uint8Array.from(g.bodies.wear, v => Math.min(255, v))),
    camp: { list: g.camp.list, queue: g.camp.queue.map(b => b.id), nid: (g.camp as Any).nid },
    jobs: { prio: g.jobs.prio, seen: [...g.jobs.seen], likeKnown: [...g.jobs.likeKnown] },
    requests: { record: [...g.requests.record], wreckDone: g.requests.wreckDone, gripes: g.requests.gripes.map(x => ({ p: x.p.id, text: x.text })) },
    goals: { day: G.day, judged: G.judged, start: G.start, ignored: [...G.ignored], cur: G.cur ? { ...G.cur, who: G.cur.who.id, a: G.cur.a?.id, b: G.cur.b?.id } : null, planned: G.planned?.id ?? -1 },
  };
  try { localStorage.setItem(KEY(game.world.seed), JSON.stringify(data)); localStorage.setItem(LAST, String(game.world.seed)); } catch { /* full or private */ }
}

/** Put a saved game back. Returns false if there is nothing (usable) to load. */
export function load(game: Game): boolean {
  let s: Any;
  try { s = JSON.parse(localStorage.getItem(KEY(game.world.seed)) ?? 'null'); } catch { return false; }
  if (!s || s.v !== 1 || s.people.length !== game.group.people.length) return false;
  const g: Group = game.group, P = g.people;
  game.clock.minutes = s.minutes;
  g.era = s.era; (g as Any).day = s.gday; g.lastFind = s.lastFind; g.firstAid = s.firstAid; (g as Any).mealDay = s.mealDay; g.recap = s.recap ?? ''; g.stats = s.stats ?? g.stats;
  g.story.relM.set(s.rel); g.story.journal = s.journal;
  g.story.skillKnown = new Set(s.skillKnown); g.story.secretKnown = new Set(s.secretKnown);
  s.pois.forEach((v: [number, string | null], i: number) => { const q = g.disc.pois[i]; if (q) { q.known = !!v[0]; q.name = v[1]; } });
  unb64(s.explored, g.disc.explored); g.disc.exploredVer++;
  Object.assign(g.stock, { food: { ...g.stock.food, ...s.stock.food }, water: s.stock.water, stolen: s.stock.stolen, ration: s.stock.ration, mat: s.stock.mat, today: s.stock.today });
  if (s.stock.tools) { g.stock.tools = s.stock.tools; g.stock.toolKnown = new Set(s.stock.toolKnown); g.stock.hides = s.stock.hides; g.stock.cured = s.stock.cured; }
  if (s.dead) g.health.dead = s.dead; g.chatter.legend = s.legend ?? '';
  if (s.cat) { Object.assign(g.cat, { phase: s.cat.phase, name: s.cat.name, signs: s.cat.signs, bold: s.cat.bold, hunting: s.cat.hunting }); (g.cat as Any).campNights = s.cat.nights; }
  if (s.wear) { const u = new Uint8Array(g.bodies.wear.length); unb64(s.wear, u); u.forEach((v, i) => { g.bodies.wear[i] = v; }); }
  g.camp.list = s.camp.list; g.camp.queue = s.camp.queue.map((id: number) => g.camp.list.find(b => b.id === id)).filter(Boolean); (g.camp as Any).nid = s.camp.nid;
  g.jobs.prio = s.jobs.prio; g.jobs.seen = new Set(s.jobs.seen); g.jobs.likeKnown = new Set(s.jobs.likeKnown);
  g.requests.record = new Map(s.requests.record); g.requests.wreckDone = s.requests.wreckDone;
  g.requests.gripes = s.requests.gripes.map((x: Any) => ({ p: P[x.p], text: x.text }));
  const G = g.goals as Any;
  G.day = s.goals.day; G.judged = s.goals.judged; G.start = s.goals.start; G.ignored = new Map(s.goals.ignored);
  G.cur = s.goals.cur ? { ...s.goals.cur, who: P[s.goals.cur.who], a: s.goals.cur.a !== undefined ? P[s.goals.cur.a] : undefined, b: s.goals.cur.b !== undefined ? P[s.goals.cur.b] : undefined } : null;
  G.planned = g.camp.list.find(b => b.id === s.goals.planned) ?? null;
  // people: scouts made it home while you were away; the lost and hurt are still out there
  s.people.forEach((d: Any, i: number) => {
    const p = P[i];
    Object.assign(p, { x: d.x, z: d.z, face: d.face, hurt: d.hurt, heal: d.heal, hungry: d.hungry, xp: d.xp, pin: d.pin, sleepIn: d.sleepIn, savedBy: d.savedBy, apart: d.apart, hateT: d.hateT, health: d.health ?? 0, hungerN: d.hungerN ?? 0 });
    if (d.keeps) Object.assign(p, { crew: d.crew, outAt: d.outAt, tripAt: d.tripAt, tiredN: d.tiredN, haul: d.haul, keeps: d.keeps });
    p.per.trust = d.trust; p.per.weakness = d.weakness;
    let mode: Mode = d.mode;
    if (mode === 'scout') { mode = 'camp'; const q = g.grid.nearest(g.fire.x + Math.random() * 6 - 3, g.fire.z + Math.random() * 6 - 3); if (q) { p.x = q.x; p.z = q.z; } }
    if (mode === 'asleep') mode = 'camp';
    if (mode === 'rescued') mode = 'follow';
    p.mode = mode; p.act = ''; p.path = []; p.pose = 'idle'; p.key = '';
    if (mode === 'lost' || mode === 'hurt') {
      const t: Trip = { p, dir: { x: 1, z: 0 }, dest: { x: p.x, z: p.z }, phase: 'out', found: [], trouble: mode, troubleAt: 0, went: 0,
        trail: [{ x: p.x, z: p.z }], lookT: 0, torch: false, troubleT: d.troubleT, alerted: true, at: { x: p.x, z: p.z }, climbSave: false };
      p.ax = p.x; p.az = p.z; g.scouting.trips.push(t);
    }
  });
  g.disc.markers = [];
  for (const m of s.markers) g.disc.addMarker({ x: m.x, z: m.z, r: m.r, kind: m.kind, text: m.text, fake: m.fake, poi: m.poi >= 0 ? g.disc.pois[m.poi] : null, who: m.who >= 0 ? P[m.who] : null });
  g.leader = P[s.leader]; g.leader.mode = 'leader'; g.leader.actT = 0;
  if (s.crewMode) g.crew.mode = s.crewMode;
  if (s.ideas) Object.assign(g.ideas, s.ideas);
  if (s.village) { Object.assign(g.village, s.village); if (g.village.storming) g.weather.forced = 'storm'; }
  for (const id of s.looted ?? []) if (g.disc.pois[id]) g.disc.pois[id].loot = '';
  g.stock.herbs = s.herbs ?? 0; g.cat.wounded = s.wounded ?? 0;
  // nobody wakes up at sea
  for (const p of P) if (p.mode !== 'dead' && !g.grid.walkable(p.x, p.z)) { const q = g.grid.nearest(p.x, p.z); if (q) { p.x = q.x; p.z = q.z; } }
  g.crew.out = g.crew.outside(g.leader.x, g.leader.z);
  game.rig.jumpTo(g.leader.x, g.leader.z);
  g.story.log(`(Picked up again on day ${game.clock.day}.)`);
  return true;
}

/** Autosave: every minute of play, at dawn, and whenever the tab is hidden or closed. */
export function autosave(game: Game) {
  let t = 0, day = 0;
  game.every(dt => {
    if (!game.group.leader) return;
    t += dt;
    if (t > 60 || day !== game.clock.day) { t = 0; day = game.clock.day; save(game); }
  });
  const now = () => save(game);
  addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => { if (document.hidden) now(); });
}
