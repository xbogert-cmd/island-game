import { Persona, has } from './persona';
import { Person, Pt } from './people';
import { Poi } from './discovery';
import type { Group } from './group';

export interface Trip {
  p: Person; dir: Pt; dest: Pt; phase: 'out' | 'look' | 'home';
  found: Poi[]; trouble: 'lost' | 'hurt' | null; troubleAt: number; went: number;
  trail: Pt[]; lookT: number; torch: boolean; troubleT: number; alerted: boolean; at: Pt; climbSave: boolean;
}

/** How wrong (centre offset) and how vague (radius) a scout's rumors are. */
export function rumorError(per: Persona) {
  if (per.skill === 'navigator') return { off: 0, r: 8 };
  if (has(per, 'cowardly')) return { off: 22, r: 32 };
  if (has(per, 'brave') || has(per, 'honest')) return { off: 5, r: 14 };
  return { off: 12, r: 22 };
}

export function dirName(dx: number, dz: number) {
  const a = Math.atan2(-dz, dx), k = Math.round(a / (Math.PI / 4));
  return ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][((k % 8) + 8) % 8];
}

const FAKES = ['smoke from another camp', 'a golden statue', 'a second plane', 'a huge cat', 'a fresh-water lake', 'a hut with a radio'];

/** Sending people out, what they find, how they report it, and what goes wrong. */
export class Scouting {
  trips: Trip[] = [];
  nothingStreak = 0;
  constructor(private g: Group) {}

  tripOf(p: Person) { return this.trips.find(t => t.p === p) ?? null; }

  /** Will they go? Returns a refusal line, or null. */
  refusal(p: Person): string | null {
    const t = p.per.trust, night = this.g.clock.night > 0.5;
    if (p.kid) return "I'm not allowed that far!";
    if (p.hurt) return "I can't, not like this.";
    if (t < 25) return 'Go yourself.';
    if (night && p.per.weakness === 'afraid of the dark' && t < 75) return 'Out there? In the dark? No.';
    if (night && p.per.secret === 'hiddenFear' && !this.g.story.secretKnown.has(p.id)) { this.g.story.revealSecret(p); return 'I... I can\'t go out in the dark.'; }
    if (has(p.per, 'cowardly') && t < 55 && Math.random() < 0.5) return 'Alone? No way.';
    if (has(p.per, 'lazy') && t < 45 && Math.random() < 0.4) return 'Maybe tomorrow.';
    return null;
  }

  /** Send p toward (tx,tz). They decide how far to go. */
  send(p: Person, tx: number, tz: number) {
    const g = this.g, per = p.per;
    let dx = tx - p.x, dz = tz - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let range = 110 + (has(per, 'brave') ? 50 : 0) - (has(per, 'cowardly') ? 50 : 0) + (has(per, 'curious') ? 20 : 0) + (per.strength === 'tireless' ? 40 : 0) - (has(per, 'lazy') ? 20 : 0);
    const night = g.clock.night > 0.5;
    if (night) range -= 30;
    let dest = { x: p.x, z: p.z }, wet = 0;
    for (let d = 4; d < range; d += 4) {
      const x = p.x + dx * d, z = p.z + dz * d;
      if (g.grid.walkable(x, z)) { dest = { x, z }; wet = 0; } else if ((wet += 4) > 16) break;
    }
    if (Math.hypot(dest.x - p.x, dest.z - p.z) < 15 || !g.bodies.go(p, dest.x, dest.z)) { g.story.say(p, "There's nowhere to go that way."); return false; }
    let lost = 0.06, hurt = 0.06;
    if (per.weakness === 'gets lost easily') lost += 0.15;
    if (per.strength === 'good sense of direction' || per.skill === 'navigator') lost = 0;
    if (per.weakness === 'clumsy') hurt += 0.12;
    if (per.weakness === 'bad knee') hurt += 0.05;
    if (has(per, 'brave')) hurt += 0.04;
    if (night) lost += 0.12;
    const roll = Math.random();
    let trouble: Trip['trouble'] = roll < lost ? 'lost' : roll < lost + hurt ? 'hurt' : null, climbSave = false;
    if (trouble === 'hurt' && per.skill === 'climber') { trouble = null; climbSave = true; }
    const trip: Trip = { p, dir: { x: dx, z: dz }, dest, phase: 'out', found: [], trouble, troubleAt: range * (0.45 + Math.random() * 0.5), went: 0,
      trail: [{ x: p.x, z: p.z }], lookT: 3 + (has(per, 'curious') ? 5 : 0), torch: night, troubleT: 0, alerted: false, at: { x: p.x, z: p.z }, climbSave };
    this.trips.push(trip);
    p.mode = 'scout'; p.poseO = 'wave'; p.poseT = 0.8;
    g.leaveParty(p);
    g.story.say(p, has(per, 'cowardly') ? "F-fine. I'll be quick." : has(per, 'brave') ? 'On it!' : `Heading ${dirName(dx, dz)}.`);
    if (has(per, 'cowardly')) { g.story.trust(p, -3); g.story.mood(p, 'scared', 10); }
    g.story.log(`${per.name} went scouting to the ${dirName(dx, dz)}.`);
    if (per.pair >= 0) g.story.mood(g.people[per.pair], 'worried', 20);
    return true;
  }

  update(dt: number) {
    const g = this.g;
    for (const t of [...this.trips]) {
      const p = t.p, night = g.clock.night > 0.5;
      p.torch = night && t.torch;
      if (p.mode === 'lost' || p.mode === 'hurt') {
        t.troubleT += dt;
        if (!t.alerted && t.troubleT > 25) {
          t.alerted = true;
          const a = Math.random() * 6.28;
          g.disc.addMarker({ x: p.x + Math.cos(a) * 5, z: p.z + Math.sin(a) * 5, r: 12, kind: '!', text: `${p.per.name} ${p.mode === 'lost' ? 'is lost' : 'is hurt'}`, poi: null, who: p, fake: false });
          g.story.toast(`${p.per.name} hasn't come back from the ${dirName(t.dir.x, t.dir.z)}.`, 'bad', p);
          g.story.log(`${p.per.name} didn't come back. Something went wrong out there.`);
          g.onAlarm();
          g.hint('rescue', "A red ! means someone needs help. Go and find them.");
          for (const o of g.people) if (o !== p && (g.story.rel(o, p) > 35 || o.per.pair === p.id)) g.story.mood(o, 'worried', 60);
        }
        if (p.mode === 'lost') {
          p.mood = 'scared';
          if ((p.actT -= dt) <= 0 || g.bodies.steer(p, p.ax, p.az, g.bodies.speed(p) * 0.5, dt)) {
            p.actT = 2 + Math.random() * 3; const a = Math.random() * 6.28;
            p.ax = t.at.x + Math.cos(a) * 10; p.az = t.at.z + Math.sin(a) * 10;
          }
          p.pose = p.moving ? 'walk' : 'idle';
        } else { p.pose = 'slump'; p.moving = false; }
        // nobody came: after a whole day they make their own way back
        if (t.troubleT > 720) {
          g.story.toast(`${p.per.name} made it back alone. Nobody came.`, 'bad', p);
          g.story.log(`${p.per.name} found the way back alone after a night out there. People noticed nobody went looking.`);
          g.story.trustAll(-6, g.leader); g.story.trust(p, -15);
          for (const m of g.disc.markers.filter(m => m.who === p)) g.disc.removeMarker(m);
          p.mode = 'scout'; t.phase = 'home'; g.bodies.go(p, g.fire.x, g.fire.z);
        }
        continue;
      }
      if (p.mode !== 'scout') continue;
      const spd = g.bodies.speed(p) * (night && !t.torch ? 0.7 : 1);
      if (t.phase === 'out' || t.phase === 'home') {
        const ox = p.x, oz = p.z;
        const done = g.bodies.advance(p, spd, dt);
        t.went += Math.hypot(p.x - ox, p.z - oz);
        const last = t.trail[t.trail.length - 1];
        if (Math.hypot(p.x - last.x, p.z - last.z) > 3) t.trail.push({ x: p.x, z: p.z });
        p.pose = p.hurt ? 'limp' : 'walk';
        if (t.phase === 'out') {
          for (const poi of g.disc.inSight(p.x, p.z, this.sightMul(p))) if (!t.found.includes(poi)) t.found.push(poi);
          if (t.trouble && t.went > t.troubleAt) { this.trouble(t); continue; }
          if (done) { t.phase = 'look'; p.actT = 0; }
        } else if (done || Math.hypot(p.x - g.fire.x, p.z - g.fire.z) < 9) this.report(t);
      } else if (t.phase === 'look') {
        // look around at the far point before turning back
        t.lookT -= dt; p.pose = 'search';
        for (const poi of g.disc.inSight(p.x, p.z, this.sightMul(p) * 1.3)) if (!t.found.includes(poi)) t.found.push(poi);
        if (t.lookT <= 0) { t.phase = 'home'; g.bodies.go(p, g.fire.x, g.fire.z); }
      }
      g.disc.markExplored(p.x, p.z, 14);
    }
  }

  sightMul(p: Person) { return (p.per.strength === 'sharp eyes' ? 1.4 : p.per.weakness === 'poor eyesight' ? 0.7 : 1) * (p.per.skill === 'climber' || p.per.skill === 'navigator' ? 1.25 : 1); }

  private trouble(t: Trip) {
    const p = t.p, g = this.g;
    t.at = { x: p.x, z: p.z }; p.ax = p.x; p.az = p.z; p.path = [];
    if (t.trouble === 'lost') { p.mode = 'lost'; g.story.say(p, 'Which way was camp...?'); }
    else { p.mode = 'hurt'; p.hurt = true; p.poseO = 'startle'; p.poseT = 0.6; g.story.say(p, pickOf(['Argh! My ankle!', 'Ow... I fell.', 'That boar came out of nowhere!'])); }
  }

  /** Home again: tell everyone what they found. */
  private report(t: Trip) {
    const p = t.p, g = this.g, per = p.per, dn = dirName(t.dir.x, t.dir.z);
    this.trips = this.trips.filter(x => x !== t);
    p.mode = 'camp'; p.act = ''; p.torch = false; p.path = [];
    const res = t.found.filter(q => (q.kind === 'water' || q.kind === 'food' || q.kind === 'material') && !q.known);
    const places = t.found.filter(q => q.kind !== 'water' && q.kind !== 'food' && q.kind !== 'material' && q.kind !== 'clue' && !q.known);
    const err = rumorError(per);
    let lines: string[] = [];
    for (const q of res) g.know(q, p, false);
    for (const q of places) {
      const scary = has(per, 'cowardly') ? pickOf([' Something big was moving in there!', ' I heard growling!', '']) : '';
      const m = g.disc.rumor(q, err.off, err.r, `${per.name}: ${q.label}${scary ? '?!' : ''}`, p);
      if (m) lines.push(`I saw ${q.label} to the ${dn}.${scary}`);
    }
    if (has(per, 'liar') && Math.random() < 0.5) {
      const a = Math.random() * 6.28, fake = pickOf(FAKES);
      g.disc.addMarker({ x: t.dest.x + Math.cos(a) * 20, z: t.dest.z + Math.sin(a) * 20, r: 22, kind: '?', text: `${per.name}: ${fake}`, poi: null, who: p, fake: true });
      lines.push(`I saw ${fake}! To the ${dn}!`);
    }
    if (res.length) lines = [`I found ${res.map(q => q.label).join(' and ')}!`, ...lines];
    if (!lines.length) {
      lines.push(has(per, 'cowardly') ? 'I heard something huge out there. I came back.' : 'Nothing out there but trees.');
      if (++this.nothingStreak >= 3) { this.nothingStreak = 0; g.story.trustAll(-3, g.leader); g.story.toast('People are grumbling. The scouting keeps coming up empty.', 'bad'); g.story.log('Another empty trip. People are starting to wonder if you know what you are doing.'); }
    } else { this.nothingStreak = 0; g.story.trust(p, 5); g.story.mood(p, 'happy', 15); p.poseO = 'cheer'; p.poseT = 1.5; g.lastFind = g.clock.minutes; }
    g.story.say(p, lines.join(' '), 5);
    g.story.toast(`${per.name} is back from the ${dn}: ${lines[0]}`, res.length || places.length ? 'good' : 'info', p);
    g.story.log(`${per.name} came back from the ${dn}. "${lines.join(' ')}"`);
    if (places.length) g.hint('rumor', "A ? is a rumor. Walk there to see if it's true.");
    if (per.skill === 'navigator') g.story.revealSkill(p, `${per.name} drew the whole route in the sand, every turn exact. A navigator!`);
    if (t.climbSave) g.story.revealSkill(p, `${per.name} came back down a cliff face like it was a staircase. A climber.`);
    if (per.pair >= 0) { const pr = g.people[per.pair]; pr.apart = 0; pr.apartHit = false; g.story.mood(pr, 'happy', 10); }
    if (p.hurt) this.g.startHealing(p);
  }
}

function pickOf<T>(a: T[]) { return a[(Math.random() * a.length) | 0]; }
