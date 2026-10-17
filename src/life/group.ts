import { B, World, biomeAt, heightAt } from '../world/island';
import { Clock } from '../sim/clock';
import { Weather } from '../sim/weather';
import { Particles } from './particles';
import { WalkGrid } from './path';
import { has, makePeople } from './persona';
import { Person, Pt, Survivors } from './people';
import { Story } from './story';
import { Discovery, Poi } from './discovery';
import { Scouting } from './scouting';

const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
export const PARTY_MAX = 5;

/**
 * The group: you (the leader), your party, the camp and the scouts.
 * Survivors live on their own; the player only steers through the few commands at the bottom.
 */
export class Group {
  grid: WalkGrid;
  bodies: Survivors;
  people: Person[];
  story: Story;
  disc: Discovery;
  scouting: Scouting;
  fire: Pt;
  leader: Person | null = null;
  choices: Person[] = [];
  /** set while the player is choosing where a scout should go */
  scoutPick: Person | null = null;
  /** first-sight moments waiting for the UI (title card + naming) */
  moments: { poi: Poi; finder: Person }[] = [];
  hints: string[] = [];
  timeScale = 1;
  slowT = 0;
  focus: Pt | null = null;
  lastFind = 0;
  firstAid = false;
  private trail: Pt[] = [];
  private heading = { x: 1, z: 0 };
  private still = 0;
  private seeT = 0;
  private hazardT = 12;
  private nightT = 60;
  private day = 1;
  private sleepSpots: Pt[] = [];
  private fishSpot: Pt;
  private shownHints = new Set<string>();
  onAlarm = () => {};
  onWhistle = () => {};
  onChime = (_big: boolean) => {};

  constructor(public w: World, public clock: Clock, private weather: Weather, fx: Particles) {
    this.grid = new WalkGrid(w);
    const { people: pers, rel } = makePeople(w.seed);
    this.bodies = new Survivors(w, this.grid, pers, fx);
    this.people = this.bodies.people;
    this.story = new Story(this.people, rel, clock);
    this.disc = new Discovery(w, this.grid);
    this.scouting = new Scouting(this);
    const f = w.landmarks.find(l => l.kind === 'campfire')!;
    this.fire = { x: f.x, z: f.z };
    // where people sleep: under the two lean-tos, then around the fire
    for (const [sx, sz] of [[-5, -4], [4.5, -5]]) for (let k = 0; k < 4; k++) this.sleepSpots.push({ x: f.x + sx + (k - 1.5) * 0.9, z: f.z + sz + 0.4 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28 + 0.2; this.sleepSpots.push({ x: f.x + Math.cos(a) * 4.2, z: f.z + Math.sin(a) * 4.2 }); }
    // a spot on the shore for fishing, toward the sea past the wreck
    let fs = { x: w.crash.x, z: w.crash.z }; const dx = w.crash.x - f.x, dz = w.crash.z - f.z, dl = Math.hypot(dx, dz) || 1;
    for (let d = 0; d < 60; d += 1) { const x = w.crash.x + (dx / dl) * d + (-dz / dl) * 8, z = w.crash.z + (dz / dl) * d + (dx / dl) * 8; if (this.grid.walkable(x, z)) fs = { x, z }; else if (d > 4) break; }
    this.fishSpot = fs;
    const order = [...this.people].sort(() => Math.random() - 0.5);
    this.choices = order.slice(0, 3);
    try { for (const k of JSON.parse(localStorage.getItem('island.hints') ?? '[]')) this.shownHints.add(k); } catch { /* ignore */ }
  }

  get party() { return this.people.filter(p => p.mode === 'follow' || p.mode === 'wait'); }
  get scouts() { return this.people.filter(p => p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt'); }

  hint(id: string, text: string) {
    if (this.shownHints.has(id)) return;
    this.shownHints.add(id); this.hints.push(text);
    try { localStorage.setItem('island.hints', JSON.stringify([...this.shownHints])); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ commands

  chooseLeader(p: Person) {
    this.leader = p; p.mode = 'leader'; p.actT = 0.3;
    for (const o of this.people) if (o !== p) { o.actT = 0.8 + Math.random() * 3.5; this.story.trust(o, this.story.rel(o, p) / 5); }
    this.story.log(`The plane went down. ${this.people.length} of us made it to the beach.`);
    this.story.log(`Everyone looked to ${p.per.name}. I guess that makes them the leader.`);
    const suit = this.disc.pois.find(q => q.sprite === 'suitcase');
    if (suit) this.disc.rumor(suit, 8, 22, 'Debris fell off before we crashed', null, 0.3);
    this.story.log('The tail broke off before we hit. It must be inland somewhere.');
    this.lastFind = this.clock.minutes;
    this.hint('start', 'Click the ground to walk. Click a survivor to bring them along.');
  }

  clickGround(x: number, z: number) {
    const L = this.leader; if (!L) return;
    if (this.scoutPick) { const p = this.scoutPick; this.scoutPick = null; this.scouting.send(p, x, z); return; }
    this.bodies.go(L, x, z);
    for (const p of this.party) if (p.act === 'search') { p.act = ''; p.path = []; }
    this.still = 0;
    // clicking near a lost or hurt person heads to them
  }

  invite(p: Person) {
    const L = this.leader; if (!L || p === L) return;
    if (p.mode === 'follow' || p.mode === 'wait') return;
    if (p.mode !== 'camp') return;
    if (p.hurt) { this.story.say(p, 'I need to rest.'); return; }
    if (this.party.length >= PARTY_MAX) { this.story.say(p, `Your group is full. (${PARTY_MAX} max)`); return; }
    if (p.per.trust < 20) { this.story.say(p, 'Go without me.'); this.story.mood(p, 'angry', 6); return; }
    const sleeping = p.pose === 'sleep';
    p.mode = 'follow'; p.act = ''; p.path = []; p.carry = 0;
    if (sleeping) { this.story.say(p, 'Huh? Now?!'); this.story.trust(p, -1); }
    else if (p.per.trust < 35) { this.story.say(p, '...fine.'); p.poseO = 'idle'; p.poseT = 1.5; }
    else this.story.say(p, pickOf(['Right behind you.', "Let's go.", 'Okay!', 'Lead the way.']));
    this.hint('party', 'Walk somewhere. Stop, and your group searches around you. Right-click whistles them back.');
  }

  leaveParty(p: Person) { if (p.mode === 'follow' || p.mode === 'wait') { p.mode = 'camp'; p.act = ''; p.path = []; } }
  dismiss(p: Person) { if (p.mode === 'follow' || p.mode === 'wait') { this.leaveParty(p); this.story.say(p, 'Heading back to camp.'); } }

  askScout(p: Person) {
    if (p === this.leader || !(p.mode === 'camp' || p.mode === 'follow' || p.mode === 'wait')) return;
    const no = this.scouting.refusal(p);
    if (no) { this.story.say(p, no); return; }
    this.scoutPick = p;
  }

  whistle() {
    const L = this.leader; if (!L) return;
    if (this.scoutPick) { this.scoutPick = null; return; }
    L.poseO = 'whistle'; L.poseT = 0.9; this.onWhistle();
    for (const p of this.people) if ((p.mode === 'follow' || p.mode === 'wait' || p.mode === 'rescued') && Math.hypot(p.x - L.x, p.z - L.z) < 90) {
      p.mode = p.mode === 'rescued' ? 'rescued' : 'follow'; p.act = 'run'; p.path = [];
      if (Math.random() < 0.4) this.story.say(p, pickOf(['Coming!', 'On my way!', '!']), 1.5);
    }
  }

  /** Click on yourself: the group waits here / follows again. */
  toggleWait() {
    const f = this.people.filter(p => p.mode === 'follow'), w = this.people.filter(p => p.mode === 'wait');
    if (f.length) { for (const p of f) { p.mode = 'wait'; p.path = []; p.act = ''; } this.story.say(f[0], "We'll wait here."); this.hint('wait', 'Click yourself again to call them.'); }
    else if (w.length) { for (const p of w) { p.mode = 'follow'; p.act = ''; } this.story.say(w[0], 'Coming!'); }
  }

  nameIt(poi: Poi, name: string) {
    const n = name.trim().slice(0, 28); if (!n) return;
    poi.name = n;
    this.story.log(`We named ${poi.label} "${n}".`);
  }

  // ------------------------------------------------------------------ discovery

  /** Something becomes known. `byYou` = seen by you or your party (gets the first-sight moment). */
  know(poi: Poi, finder: Person, byYou: boolean) {
    if (poi.known) return;
    poi.known = true;
    this.disc.dropMarkersFor(poi);
    this.lastFind = this.clock.minutes;
    const N = finder.per.name, S = this.story, L = this.leader;
    if (poi.kind === 'water' || poi.kind === 'food') {
      const first = !this.disc.pois.some(q => q !== poi && q.known && q.kind === poi.kind);
      S.toast(`${N} found ${poi.label}!`, 'good', finder);
      S.log(first ? `${N} found ${poi.label}. ${poi.kind === 'water' ? 'Fresh water. People cried.' : 'Food, finally.'}` : `${N} found ${poi.label}.`);
      S.trustAll(first ? (poi.kind === 'water' ? 6 : 4) : 2, L); S.trust(finder, 3); S.mood(finder, 'happy', 12);
      for (const p of this.people) if (p.mode === 'camp' && first) S.mood(p, 'happy', 20);
      this.onChime(false);
      return;
    }
    if (poi.kind === 'clue') {
      S.toast(poi.note!, 'info', finder); S.log(`${N} found ${poi.label}. ${poi.note}`);
      if (poi.next !== undefined) this.disc.rumor(this.disc.pois[poi.next], 10, 26, poi.kind === 'clue' && this.disc.pois[poi.next].kind === 'tail' ? 'The tail?' : 'More debris?', finder);
      this.onChime(false);
      return;
    }
    const repeat = (poi.kind === 'hotSpring' || poi.kind === 'cave' || poi.kind === 'waterfall') && this.disc.pois.some(q => q !== poi && q.known && q.kind === poi.kind);
    if (!byYou || repeat) {
      S.toast(`${N} found ${poi.label}.`, 'info', finder); S.log(`${N} found ${poi.label}.`);
      if (repeat) { poi.name = null; }
      this.onChime(false);
    } else {
      this.moments.push({ poi, finder });
      S.log(`${N} spotted ${poi.label}.`);
      this.slowT = 2.6; this.focus = { x: poi.x, z: poi.z };
      for (const p of this.party) S.say(p, pickOf(['Whoa...', 'Look at that.', 'No way.', 'What IS that?']), 2.6);
      S.trustAll(2, L); for (const p of this.party) S.trust(p, 3);
      this.onChime(true);
    }
    if (poi.note) {
      S.log(poi.note);
      setTimeout(() => S.toast(poi.note!, 'info'), byYou ? 3500 : 0);
      if (poi.next !== undefined) this.disc.rumor(this.disc.pois[poi.next], 12, 30, `Clue from ${poi.label}`, finder);
      if (poi.kind === 'tail') this.firstAid = true;
    }
    if (poi.kind === 'tail' || poi.kind === 'engine' || poi.kind === 'radioTower') {
      const mech = [L, ...this.party].find(p => p && p.per.skill === 'mechanic');
      if (mech) { S.say(mech, poi.kind === 'radioTower' ? 'I could get that radio working... maybe.' : 'I know engines. Some of this is salvageable.', 4); S.revealSkill(mech, `${mech.per.name} took one look at ${poi.label} and started naming parts. A mechanic.`); }
    }
  }

  startHealing(p: Person) {
    const medic = this.people.find(o => o !== p && o.per.skill === 'medic' && o.mode === 'camp');
    p.heal = 720 * (medic ? 0.3 : 1) * (this.firstAid ? 0.5 : 1);
    if (medic) { this.story.say(medic, 'Sit down. Let me see that.'); this.story.revealSkill(medic, `${medic.per.name} splinted ${p.per.name}'s leg like they'd done it a thousand times. A medic.`); }
    else {
      const fake = this.people.find(o => o.per.secret === 'fakeJob' && o.mode === 'camp' && !this.story.secretKnown.has(o.id));
      if (fake) { this.story.say(fake, "I... don't actually know how to fix that."); this.story.revealSecret(fake); }
    }
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    const L = this.leader;
    if (this.slowT > 0) { this.slowT -= dt / Math.max(0.05, this.timeScale); if (this.slowT <= 0) this.focus = null; }
    this.timeScale = this.slowT > 0 ? 0.3 : 1;
    const night = this.clock.night > 0.5, rain = this.weather.rain;
    for (const p of this.people) { p.anim += dt; if (p.moodT > 0) p.moodT -= dt; if (p.poseT > 0 && (p.poseT -= dt) <= 0) p.poseO = null; }
    if (!L) { for (const p of this.people) p.pose = 'sleep'; this.story.update(dt); return; }

    // the leader
    const lx = L.x, lz = L.z;
    if (L.actT > 0) { L.actT -= dt; L.pose = 'sleep'; }
    else {
      const done = this.bodies.advance(L, this.bodies.speed(L) * 1.1, dt);
      L.pose = done ? 'idle' : L.hurt ? 'limp' : 'walk';
      L.torch = night;
    }
    const mv = Math.hypot(L.x - lx, L.z - lz);
    if (mv > 0.001) { this.heading = { x: (L.x - lx) / mv, z: (L.z - lz) / mv }; this.still = 0; } else this.still += dt;
    const tl = this.trail[this.trail.length - 1];
    if (!tl || Math.hypot(L.x - tl.x, L.z - tl.z) > 1) { this.trail.push({ x: L.x, z: L.z }); if (this.trail.length > 60) this.trail.shift(); }

    let idx = 0;
    for (const p of this.people) {
      if (p === L) continue;
      if (p.mode === 'asleep') { if ((p.actT -= dt) <= 0) { p.mode = 'camp'; p.poseO = 'startle'; p.poseT = 0.7; p.act = ''; p.actT = 1 + Math.random() * 2; } else p.pose = 'sleep'; continue; }
      if (p.mode === 'follow' || p.mode === 'rescued') this.follow(p, idx++, dt, night);
      else if (p.mode === 'wait') this.waitHere(p, dt);
      else if (p.mode === 'camp') this.campLife(p, dt, night, rain);
      if (p.mode === 'rescued' && Math.hypot(p.x - this.fire.x, p.z - this.fire.z) < 12) {
        p.mode = 'camp'; p.act = ''; this.story.say(p, 'Home. Thank you.');
        if (p.hurt) this.startHealing(p);
      }
      if (p.hurt && p.heal > 0 && p.mode === 'camp' && (p.heal -= dt) <= 0) { p.hurt = false; this.story.toast(`${p.per.name} is back on their feet.`, 'good', p); }
    }
    this.scouting.update(dt);

    // what you and your party can see
    if ((this.seeT -= dt) <= 0) {
      this.seeT = 0.35;
      const viewers = [L, ...this.people.filter(p => p.mode === 'follow' || p.mode === 'wait' || p.mode === 'rescued')];
      for (const v of viewers) {
        this.disc.markExplored(v.x, v.z, 16);
        const mul = this.scouting.sightMul(v) * (v.act === 'search' ? 1.5 : 1);
        for (const poi of this.disc.inSight(v.x, v.z, mul)) this.know(poi, v, true);
      }
      this.markers(L);
    }
    this.social(dt, night, L);
    for (const p of this.people) {
      if (p.poseO) p.pose = p.poseO;
      p.mood = this.moodOf(p, night);
    }
    if (this.clock.day !== this.day) this.newDay();
    this.story.update(dt);
  }

  /** Party members: walk in a loose group behind you; when you stop, spread out and search. */
  private follow(p: Person, i: number, dt: number, night: boolean) {
    const L = this.leader!, B_ = this.bodies, d = Math.hypot(p.x - L.x, p.z - L.z);
    p.torch = night;
    const sp = B_.speed(p) * (p.act === 'run' || d > 10 ? 1.55 : 1.1);
    if (d > 12) {
      if ((p.repath -= dt) <= 0 || !p.path.length) { p.repath = 1.2; B_.go(p, L.x, L.z); }
      B_.advance(p, sp, dt); p.pose = p.hurt ? 'limp' : 'run';
      if (p.act === 'search') p.act = '';
      return;
    }
    if (p.act === 'run' && d < 5) p.act = '';
    if (this.still > 2 && L.path.length === 0 && p.mode === 'follow' && !p.hurt) { this.search(p, dt); return; }
    if (p.act === 'search') { p.act = ''; p.path = []; }
    const back = 1.8 + Math.floor(i / 2) * 1.4, side = (i % 2 ? 1 : -1) * (0.9 + (i >> 2) * 0.5);
    const tx = L.x - this.heading.x * back - this.heading.z * side, tz = L.z - this.heading.z * back + this.heading.x * side;
    if (p.path.length) { if (B_.advance(p, sp, dt)) p.path = []; p.pose = 'walk'; return; }
    if (Math.hypot(tx - p.x, tz - p.z) > 0.5) {
      const arrived = B_.steer(p, tx, tz, sp * (Math.hypot(tx - p.x, tz - p.z) > 3 ? 1.2 : 0.9), dt);
      if (arrived && p.stuck > 0.4) B_.go(p, tx, tz);
      p.pose = p.moving ? (p.hurt ? 'limp' : 'walk') : 'idle';
    } else { p.pose = 'idle'; B_.faceToward(p, L.x, L.z); }
  }

  private search(p: Person, dt: number) {
    const L = this.leader!, B_ = this.bodies;
    if (p.act !== 'search') { p.act = 'search'; p.actT = 0; p.ax = p.x; p.az = p.z; }
    if (p.path.length || Math.hypot(p.ax - p.x, p.az - p.z) > 0.3) {
      const done = p.path.length ? B_.advance(p, B_.speed(p), dt) : B_.steer(p, p.ax, p.az, B_.speed(p), dt);
      p.pose = 'walk';
      if (done) { p.path = []; p.ax = p.x; p.az = p.z; p.actT = 2 + Math.random() * 2; }
      return;
    }
    p.pose = 'search';
    if ((p.actT -= dt) <= 0) {
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * 6.28, r = 3 + Math.random() * 9, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
        if (this.grid.walkable(x, z)) { p.ax = x; p.az = z; if (!this.grid.clear(p.x, p.z, x, z)) B_.go(p, x, z); break; }
      }
      p.actT = 2;
    }
  }

  private waitHere(p: Person, dt: number) {
    p.torch = this.clock.night > 0.5;
    if (p.path.length) { this.bodies.advance(p, this.bodies.speed(p), dt); p.pose = 'walk'; return; }
    p.actT += dt; p.pose = p.actT > 2.5 ? 'sit' : 'idle';
  }

  /** Life at camp. Nobody needs orders for any of this. */
  private campLife(p: Person, dt: number, night: boolean, rain: number) {
    const B_ = this.bodies, F = this.fire, S = this.story, h = this.clock.hour;
    p.torch = false;
    const goTo = (x: number, z: number) => { p.ax = x; p.az = z; if (!B_.go(p, x, z)) p.path = []; };
    const walking = () => { if (p.path.length) { const done = B_.advance(p, B_.speed(p) * (p.act === 'shelter' ? 1.5 : 1), dt); p.pose = p.hurt ? 'limp' : p.act === 'shelter' ? 'run' : 'walk'; return !done; } return false; };
    // overriding needs: rain, night, sleep, injury
    const sleepTime = h >= 22 || h < 5.5;
    let want = rain > 0.5 ? 'shelter' : sleepTime ? 'sleep' : night ? 'fire' : p.hurt ? 'rest' : '';
    if (want && p.act !== want) {
      p.act = want; p.carry = 0; p.partner = null;
      const s = this.sleepSpots[p.id % this.sleepSpots.length];
      if (want === 'fire') { const a = (p.id / this.people.length) * 6.28 + 0.3, rr = 2.4 + (p.id % 2) * 0.9; goTo(F.x + Math.cos(a) * rr, F.z + Math.sin(a) * rr); }
      else if (want === 'shelter') { const s2 = this.sleepSpots[p.id % 8]; goTo(s2.x, s2.z); }
      else if (want === 'rest') goTo(F.x + 3, F.z + 2.5);
      else goTo(s.x, s.z);
      return;
    }
    if (!want && (p.act === 'shelter' || p.act === 'sleep' || p.act === 'fire' || p.act === 'rest')) { p.act = ''; p.actT = Math.random() * 2; }
    if (walking()) return;
    switch (p.act) {
      case 'fire': p.pose = 'sit'; B_.faceToward(p, F.x, F.z); return;
      case 'sleep': p.pose = 'sleep'; return;
      case 'shelter': p.pose = 'cover'; return;
      case 'rest': p.pose = 'sit'; return;
      case 'fetch': case 'collect': {
        if (p.carry === 0 && (p.actT -= dt) > 0) { p.pose = 'collect'; return; }
        if (p.carry === 0) { p.carry = p.act === 'fetch' ? 1 : 2; goTo(F.x + (Math.random() - 0.5) * 4, F.z + 2 + Math.random() * 2); return; }
        p.carry = 0; p.act = ''; p.actT = 2;
        if (p.per.secret === 'hoarder' && Math.random() < 0.12) S.revealSecret(p);
        return;
      }
      case 'fish': p.pose = 'fish'; B_.faceToward(p, this.w.crash.x * 2 - F.x, this.w.crash.z * 2 - F.z);
        if ((p.actT -= dt) <= 0) { p.act = ''; p.actT = 3; p.carry = 2; S.revealSkill(p, `${p.per.name} came back from the shore with fish. They grew up fishing.`); goTo(F.x + 2, F.z + 2); }
        return;
      case 'nap': p.pose = 'sleep'; if ((p.actT -= dt) <= 0) { p.act = ''; p.actT = 1; } return;
      case 'talk': case 'listen': {
        const o = p.partner;
        if (!o || o.mode !== 'camp' || (p.actT -= dt) <= 0) { p.act = ''; p.partner = null; p.actT = 2 + Math.random() * 3; return; }
        p.pose = 'idle'; B_.faceToward(p, o.x, o.z);
        if (p.act === 'talk' && Math.random() < dt * 0.35) { S.say(p, pickOf(['Did you hear that last night?', 'How are you holding up?', 'I miss coffee.', 'What do you think is inland?', 'My feet are killing me.', 'Nice day, at least.']), 2.6); S.addRel(p, o, 1); }
        else if (p.act === 'listen' && Math.random() < dt * 0.25) S.say(p, pickOf(['Ha!', 'Same.', 'Yeah...', 'Really?', 'Mm.']), 1.6);
        if (S.rel(p, o) > 40) p.tmood = 'fond';
        return;
      }
      case 'argue': {
        const o = p.partner;
        if (!o || (p.actT -= dt) <= 0) { p.act = ''; p.partner = null; p.actT = 4; return; }
        p.pose = 'argue'; B_.faceToward(p, o.x, o.z);
        if (Math.random() < dt * 0.5) S.say(p, pickOf(['That was MY spot!', 'You never help!', 'Back off!', 'Unbelievable.', 'Say that again!']), 2);
        return;
      }
    }
    // idle: pick something to do
    p.pose = 'idle'; p.carry = 0;
    if ((p.actT -= dt) > 0) return;
    const opts: [number, () => void][] = [];
    const wander = () => { p.act = ''; p.actT = 2 + Math.random() * 5; for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28, r = 4 + Math.random() * 12, x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r; if (this.grid.walkable(x, z)) { goTo(x, z); break; } } };
    opts.push([3, wander]);
    const camp = this.people.filter(o => o !== p && o.mode === 'camp' && o.act === '' && !o.path.length);
    const fr = camp.find(o => S.rel(p, o) > 15), rv = camp.find(o => S.rel(p, o) < -35 && Math.hypot(o.x - p.x, o.z - p.z) < 20);
    if (fr) opts.push([has(p.per, 'loner') ? 0.3 : has(p.per, 'social') ? 4 : 2, () => {
      p.act = 'talk'; p.partner = fr; p.actT = 9; fr.act = 'listen'; fr.partner = p; fr.actT = 9; fr.path = [];
      const a = Math.random() * 6.28; goTo(fr.x + Math.cos(a) * 1.3, fr.z + Math.sin(a) * 1.3);
    }]);
    if (rv && (has(p.per, 'hothead') || Math.random() < 0.3)) opts.push([1.2, () => {
      p.act = 'argue'; p.partner = rv; p.actT = 5; rv.act = 'argue'; rv.partner = p; rv.actT = 5; rv.path = [];
      goTo(rv.x + 1.2, rv.z); S.addRel(p, rv, -4); S.mood(p, 'angry', 15); S.mood(rv, 'angry', 15);
      const calm = camp.find(o => has(o.per, 'calm') && o !== rv);
      if (calm) setTimeout(() => S.say(calm, 'Hey! Both of you, enough.'), 2500);
    }]);
    const work = has(p.per, 'hardworking') ? 3 : has(p.per, 'lazy') ? 0.5 : 1.5;
    const water = this.disc.nearestKnown('water', F), food = this.disc.nearestKnown('food', F);
    const busy = (a: string) => this.people.filter(o => o.act === a).length;
    if (water && busy('fetch') < 2 && Math.hypot(water.x - F.x, water.z - F.z) < 170) opts.push([work, () => { p.act = 'fetch'; p.actT = 2; goTo(water.x, water.z); }]);
    if (food && busy('collect') < 3 && Math.hypot(food.x - F.x, food.z - F.z) < 170) opts.push([work, () => { p.act = 'collect'; p.actT = 3; goTo(food.x + Math.random() * 2 - 1, food.z + Math.random() * 2 - 1); }]);
    if (p.per.skill === 'fisher' && busy('fish') < 1) opts.push([2, () => { p.act = 'fish'; p.actT = 14; goTo(this.fishSpot.x, this.fishSpot.z); }]);
    if (h > 11.5 && h < 14.5) opts.push([has(p.per, 'lazy') ? 4 : 1, () => { p.act = 'nap'; p.actT = 15 + Math.random() * 15; const s = this.sleepSpots[p.id % 8]; goTo(s.x, s.z); }]);
    let tot = 0; for (const o of opts) tot += o[0];
    let k = Math.random() * tot;
    for (const o of opts) if ((k -= o[0]) <= 0) { o[1](); break; }
  }

  /** Markers resolve as you reach them; lost and hurt scouts are found. */
  private markers(L: Person) {
    const S = this.story;
    for (const m of [...this.disc.markers]) {
      const d = Math.hypot(m.x - L.x, m.z - L.z);
      if (m.fake && d < 8) {
        this.disc.removeMarker(m);
        const who = m.who;
        S.toast(who ? `Nothing here. Did ${who.per.name} make it up?` : 'Nothing here.', 'bad', who ?? undefined);
        S.log(who ? `We went looking for "${m.text.split(': ')[1]}". There was nothing. ${who.per.name} won't look anyone in the eye.` : 'Nothing there.');
        if (who) { for (const o of this.people) if (o !== who) S.addRel(o, who, -6); S.mood(who, 'sad', 20); }
      }
    }
    for (const t of [...this.scouting.trips]) {
      const p = t.p;
      if ((p.mode === 'lost' || p.mode === 'hurt') && Math.hypot(p.x - L.x, p.z - L.z) < 7) {
        this.scouting.trips = this.scouting.trips.filter(x => x !== t);
        for (const m of this.disc.markers.filter(m => m.who === p && m.kind === '!')) this.disc.removeMarker(m);
        p.mode = 'rescued'; p.path = []; p.act = 'run';
        S.say(p, pickOf(['You came for me!', 'I thought nobody would come...', 'Thank you. Thank you.']), 3.5);
        S.toast(`You found ${p.per.name}!`, 'good', p);
        S.log(`${L.per.name} found ${p.per.name} ${p.hurt ? 'hurt' : 'lost'} out there and brought them home.`);
        S.trust(p, 20); S.trustAll(4, L);
        for (const o of this.people) if (S.rel(o, p) > 30 || o.per.pair === p.id) { S.trust(o, 6); S.mood(o, 'happy', 20); }
        this.onChime(false);
      }
    }
  }

  /** Pairs apart, nights out, stumbles in the dark, campfire talk. */
  private social(dt: number, night: boolean, L: Person) {
    const S = this.story;
    for (const p of this.people) {
      if (p.per.pair < 0 || p === L) continue;
      const o = this.people[p.per.pair];
      if (Math.hypot(o.x - p.x, o.z - p.z) < 25 || o === L) { p.apart = 0; p.apartHit = false; continue; }
      p.apart += dt;
      if (p.apart > 360 && !p.apartHit && p.mode === 'camp' && o.mode !== 'camp') {
        p.apartHit = true; S.trust(p, -4);
        S.toast(`${p.per.name} is upset you kept ${o.per.name} away so long.`, 'bad', p);
      }
    }
    const away = this.party.filter(p => Math.hypot(p.x - this.fire.x, p.z - this.fire.z) > 40);
    if (night && away.length && L.moving) {
      if ((this.hazardT -= dt) <= 0) {
        this.hazardT = 12;
        for (const p of away) if (!p.hurt && Math.random() < (p.per.weakness === 'clumsy' ? 0.05 : 0.02)) {
          p.hurt = true; p.poseO = 'startle'; p.poseT = 0.6;
          S.say(p, 'Ow! My ankle!'); S.toast(`${p.per.name} twisted an ankle in the dark.`, 'bad', p);
          S.log(`${p.per.name} got hurt following ${L.per.name} through the dark.`);
          S.trust(p, -6); S.trustAll(-2, L);
        }
      }
      if ((this.nightT -= dt) <= 0) {
        this.nightT = 60;
        for (const p of away) { S.trust(p, p.per.weakness === 'afraid of the dark' ? -3 : -1); if (p.per.weakness === 'afraid of the dark') S.mood(p, 'scared', 30); }
      }
    }
    if (night) this.hint('night', 'Night falls. Your group carries torches, but people get nervous out in the dark.');
    const sitting = this.people.filter(p => p.mode === 'camp' && p.act === 'fire' && p.pose === 'sit');
    this.story.campfire(dt, sitting, {
      leader: L, away: this.people.filter(p => p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt'),
      places: this.disc.pois.filter(q => q.known && q.major).map(q => this.disc.display(q)),
      food: this.disc.pois.some(q => q.known && q.kind === 'food'), nights: this.clock.day,
    });
  }

  private newDay() {
    this.day = this.clock.day;
    this.story.log(`Day ${this.day}. Another mark on the wreck.`);
    if (this.clock.minutes - this.lastFind > 2 * 1440) {
      this.lastFind = this.clock.minutes - 1440;
      this.story.trustAll(-2, this.leader);
      this.story.toast("Two days and nothing new. People are starting to doubt you.", 'bad');
      this.story.log('People are starting to doubt us. We need to find something.');
    }
  }

  moodOf(p: Person, night: boolean): Person['mood'] {
    p.why = '';
    if (p.hurt) { p.why = 'Hurt and in pain'; return 'pain'; }
    if (p.mode === 'lost') { p.why = 'Lost, and scared'; return 'scared'; }
    if (p.pose === 'sleep') { p.why = 'Asleep'; return 'tired'; }
    if (p.moodT > 0 && p.tmood !== 'none') { p.why = WHY[p.tmood]; return p.tmood; }
    const outside = Math.hypot(p.x - this.fire.x, p.z - this.fire.z) > 25;
    if (night && outside && !p.torch && p.per.weakness === 'afraid of the dark') { p.why = 'Afraid of the dark'; return 'scared'; }
    if (p.per.pair >= 0 && p.apart > 180) { p.why = `Worried about ${this.people[p.per.pair].per.name}`; return 'worried'; }
    if (p !== this.leader && p.per.trust < 20) { p.why = "Doesn't trust you"; return 'angry'; }
    p.why = biomeAt(this.w, p.x, p.z) === B.Beach && heightAt(this.w, p.x, p.z) < 2 ? 'Watching the sea' : 'Getting by';
    return 'none';
  }
}

const WHY: Record<string, string> = { happy: 'Happy right now', angry: 'Angry', worried: 'Worried', sad: 'Upset', scared: 'Scared', fond: 'Enjoying the company', tired: 'Tired', pain: 'In pain', none: '' };
