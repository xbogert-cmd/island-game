import { has } from './persona';
import { Person, Pt } from './people';
import { Building } from './buildings';
import type { Group } from './group';

export const HEALTH_WORD = ['Healthy', 'Weak', 'Sick', 'Very sick'];
const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

/**
 * Weak → sick → very sick → dead, one step per dawn at most, so there is always warning.
 * Food, water, rest, the sick bay and a medic bring people back.
 */
export class Health {
  /** the dead, for talk at the fire */
  dead: { name: string; cause: string; day: number }[] = [];
  funeral: { ps: Person[]; grave: Building; t: number; started: boolean } | null = null;
  thirsty = false;

  constructor(private g: Group) {}

  /** A person who is sick enough to stay in bed. */
  bedridden(p: Person) { return p.health >= 2; }
  /** Somewhere to lie down: the sick bay if there is one. */
  restSpot(p: Person): Pt { const sb = this.g.camp.get('sickbay'); return sb ? { x: sb.x + (p.id % 3 - 1) * 1.1, z: sb.z + 1.6 } : this.g.bed(p); }

  /** One step worse, with a warning every time. */
  worsen(p: Person, why: string) {
    if (p.mode === 'dead' || p.health >= 3) return;
    const S = this.g.story, N = p.per.name;
    p.health++;
    if (p.health === 1) { S.toast(`${N} looks weak (${why}).`, 'info', p); S.log(`${N} is getting weak: ${why}.`); }
    if (p.health === 2) { S.toast(`${N} is sick (${why}).`, 'bad', p); S.log(`${N} came down sick: ${why}.`); S.say(p, pickOf(["I don't feel right...", 'My head is spinning.', 'I need to lie down.'])); }
    if (p.health === 3) { S.toast(`${N} is very sick. Get them to the sick bay.`, 'bad', p); S.log(`${N} is very sick. If nothing changes, we could lose them.`); this.g.onAlarm(); this.g.hint('sick', 'Very sick people need rest, food, water, and ideally a sick bay with someone tending it.'); }
  }
  better(p: Person) {
    if (p.health <= 0) return;
    p.health--;
    if (p.health === 0) { this.g.story.toast(`${p.per.name} is feeling better.`, 'good', p); }
  }

  /** At dawn: what yesterday did to everyone. */
  dawn() {
    const g = this.g, C = g.camp, alive = g.people.filter(p => p.mode !== 'dead');
    const sick = alive.filter(p => p.health >= 2 && p.mode === 'camp').length;
    const tended = g.people.some(o => o.job === 'tend' && o.mode === 'camp');
    const medic = g.people.find(o => o.per.skill === 'medic' && o.mode === 'camp' && o.health < 2);
    const careAt = (p: Person) => C.has('sickbay') && (tended || !!medic) && Math.hypot(p.x - C.get('sickbay')!.x, p.z - C.get('sickbay')!.z) < 10;
    // healing plants: a dose for each sick person, while they last
    const herbs = (p: Person) => { if (p.health < 2 || g.stock.herbs <= 0) return false; g.stock.herbs--; return true; };
    for (const p of alive) {
      const dosed = herbs(p);
      // the very sick who weren't looked after
      if (p.health >= 3) {
        const neglect = p.hungry || this.thirsty || !careAt(p);
        if (Math.random() < (neglect ? 0.25 : 0.03) * (dosed ? 0.5 : 1)) { this.die(p, neglect ? 'sickness nobody could treat' : 'sickness', neglect); continue; }
      }
      p.hungerN = p.hungry ? p.hungerN + 1 : 0;
      let worse = '';
      if (p.hungerN >= 2) worse = 'hunger';
      else if (this.thirsty && Math.random() < 0.35) worse = 'no clean water';
      else if (g.stats.spoiled > 3 && !C.has('storage') && Math.random() < 0.06) worse = 'bad food';
      else if (p.hurt && !C.has('sickbay') && !medic && Math.random() < (g.ideas.done('herbs') && g.stock.herbs > 0 ? 0.09 : 0.18)) worse = 'an infected wound';
      else if (p.health < 2 && sick && Math.random() < 0.04 * sick * (C.has('bath') ? 0.5 : 1)) worse = 'caught it from the others';
      if (worse) { this.worsen(p, worse); continue; }
      if (p.health > 0 && !p.hungry && !this.thirsty) {
        const odds = 0.3 + (careAt(p) ? 0.35 : 0) + (medic ? 0.1 : 0) + (g.goals.active('rest') ? 0.15 : 0) + (dosed ? 0.2 : 0);
        if (Math.random() < odds) this.better(p);
      }
    }
    this.thirsty = false;
  }

  /** Someone is gone. A grave, a funeral at dusk, and a camp that remembers. */
  die(p: Person, cause: string, neglect = false) {
    const g = this.g, S = g.story, N = p.per.name;
    if (p.mode === 'dead') return;
    g.leaveParty(p); g.jobs.quit(p);
    if (g.requests.cur?.p === p) g.requests.cur = null;
    g.scouting.trips = g.scouting.trips.filter(t => t.p !== p);
    for (const m of g.disc.markers.filter(m => m.who === p)) g.disc.removeMarker(m);
    p.mode = 'dead'; p.ask = false; p.act = ''; p.path = []; p.hurt = false; p.torch = false; p.carry = 0;
    this.dead.push({ name: N, cause, day: g.clock.day });
    for (const h of g.camp.list) if (h.owners.includes(p.id)) h.owners = h.owners.filter(i => i !== p.id);
    // whoever was closest keeps what they carried from home
    const heir = g.people.filter(o => o !== p && o.mode !== 'dead').sort((a, b) => S.rel(b, p) - S.rel(a, p))[0];
    if (heir && p.keeps.length && (S.rel(heir, p) > 20 || heir.per.pair === p.id)) {
      const own = (k: string) => k.includes("'s ") ? k : `${N}'s ${k.replace(/^(a|an|their) /, '')}`;
      heir.keeps.push(...p.keeps.map(own)); S.log(`${heir.per.name} kept ${own(p.keeps[0])}.`);
    }
    p.keeps = [];
    const gr: Building = g.camp.add('grave') ?? { id: -1, kind: 'grave', x: g.fire.x + 20, z: g.fire.z, progress: 1, paid: 3, owners: [], shaky: false, skilled: true };
    gr.progress = 1; gr.paid = 3; gr.owners = [p.id]; g.camp.queue = g.camp.queue.filter(b => b !== gr);
    S.toast(`${N} is dead.`, 'bad', p);
    S.log(`${N} died of ${cause} on day ${g.clock.day}.`);
    g.onSting(false);
    for (const o of g.people) if (o.mode !== 'dead') { const r = S.rel(o, p); if (r > 30 || o.per.pair === p.id) { S.mood(o, 'sad', 1400); S.say(o, pickOf([`No... ${N}...`, `${N}!`, 'This can\'t be happening.'])); } }
    S.trustAll(neglect ? -6 : -2, g.leader);
    // everyone who died before dusk is buried together
    if (this.funeral && !this.funeral.started) this.funeral.ps.push(p);
    else this.funeral = { ps: [p], grave: gr, t: 0, started: false };
  }

  /** The funeral: everyone gathers at the grave, time slows, a friend says a few words. */
  update(dt: number) {
    const g = this.g, f = this.funeral; if (!f) return;
    const h = g.clock.hour;
    if (!f.started) {
      if (h < 17 || h > 22) return;
      f.started = true;
      g.slowT = 6; g.focus = { x: f.grave.x, z: f.grave.z };
      const crowd = g.people.filter(p => p.mode === 'camp' && p.health < 3);
      crowd.forEach((p, i) => { const a = (i / crowd.length) * 6.283; p.act = 'funeral'; p.job && g.jobs.quit(p); g.bodies.go(p, f.grave.x + Math.cos(a) * 3, f.grave.z + Math.sin(a) * 3); });
      g.story.log(`At dusk we buried ${f.ps.map(p => p.per.name).join(' and ')}.`);
    }
    f.t += dt;
    const S = g.story, mourners = g.people.filter(p => p.act === 'funeral');
    const dead = f.ps[0], names = f.ps.map(p => p.per.name).join(' and ');
    const best = mourners.slice().sort((a, b) => S.rel(b, dead) - S.rel(a, dead))[0];
    if (best && f.t > 6 && f.t - dt <= 6) S.say(best, f.ps.length > 1 ? `${names}. We won't forget any of you.` : pickOf([`${names} would have hated all this fuss.`, `I didn't know ${names} long enough.`, `${names} kept us going. We'll keep going for them.`]), 6);
    if (f.t > 14 && f.t - dt <= 14) { const o = mourners.find(p => p !== best && has(p.per, 'kind')) ?? mourners[1]; if (o) S.say(o, 'Rest easy.', 4); }
    if (f.t > 26) { for (const p of mourners) { p.act = ''; p.actT = 3; } this.funeral = null; }
  }

  /** Movement at the funeral. Called from camp life. */
  drive(p: Person, dt: number) {
    const g = this.g, f = this.funeral;
    if (!f) { p.act = ''; return; }
    if (p.path.length) { g.bodies.advance(p, g.bodies.speed(p), dt); p.pose = 'walk'; return; }
    p.pose = 'slump'; g.bodies.faceToward(p, f.grave.x, f.grave.z);
  }
}
