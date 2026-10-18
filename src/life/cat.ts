import { has } from './persona';
import { Person, Pt } from './people';
import type { Group } from './group';

const NAMES = ['Old Smoke', 'The Shadow', 'Ghost', 'Night Eyes', 'The Widow', 'Patch', 'Old Scar'];
const pickOf = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
type Phase = 'none' | 'signs' | 'stalk' | 'dead';

/**
 * The island's one apex predator. A mystery first (tracks, a missing fish, eyes in the dark),
 * then a threat to anyone alone at night. Fire, groups and the night watch drive it off. You can hunt it.
 */
export class Cat {
  phase: Phase = 'none';
  name = '';
  x = 0; z = 0; visible = false; eyes = false; face = 1; moving = false;
  lair: Pt;
  signs = 0;
  bold = 0;                       // gets bolder after a failed hunt
  /** nights it stays away, hurt by a spike pit */
  wounded = 0;
  hunting = false;                // a hunt is on: the lair is marked
  paws: { x: number; z: number; t: number }[] = [];
  private night = -1;
  private signAt = -1;
  private fleeT = 0;
  private thinkT = 0;
  private fight: { t: number; party: Person[] } | null = null;
  private campNights = 0;
  private tgt: Pt = { x: 0, z: 0 }; private spd = 0;

  constructor(private g: Group) {
    // a cave if there is one far enough away, else deep jungle
    const F = g.fire, cave = g.disc.pois.filter(p => p.kind === 'cave' && Math.hypot(p.x - F.x, p.z - F.z) > 70).sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z))[0];
    this.lair = cave ? { x: cave.x, z: cave.z } : g.grid.nearest(F.x + 90, F.z - 60) ?? { x: F.x + 90, z: F.z - 60 };
  }

  update(dt: number) {
    const g = this.g, h = g.clock.hour, dark = h >= 20.5 || h < 5;
    this.paws = this.paws.filter(p => (p.t -= dt) > 0);
    if (this.fight) { this.showdown(dt); return; }
    if (this.phase === 'dead') { this.visible = false; return; }
    if (this.phase === 'none') { if (g.era !== 'crash') this.phase = 'signs'; return; }
    // a new night
    if (dark && this.night !== g.clock.day) { this.night = g.clock.day; this.campNights++; this.signAt = 21 + Math.random() * 5; if (this.signAt >= 24) this.signAt -= 24; this.visible = false; }
    if (this.phase === 'signs') {
      if (dark && this.signAt >= 0 && Math.abs(h - this.signAt) < 0.1) { this.signAt = -1; this.sign(); }
      if (this.campNights > 3 && this.signs >= 2) this.phase = 'stalk';
      return;
    }
    // stalking: only at night; gone by day
    if (!dark) { this.visible = false; this.eyes = false; return; }
    if (!this.visible) { this.appear(); return; }
    if (this.fleeT > 0) { this.fleeT -= dt; this.moveTo(this.lair, 7, dt); if (this.fleeT <= 0) this.visible = false; return; }
    if ((this.thinkT -= dt) > 0) { this.moveTo(this.tgt, this.spd, dt); return; }
    this.thinkT = 1;
    this.think();
  }

  /** The first nights: only signs. */
  private sign() {
    const g = this.g, S = g.story, F = g.fire, a = Math.random() * 6.283;
    this.signs++;
    const kind = this.signs === 1 ? 'paws' : this.signs === 2 ? (g.stock.food.fish > 1 ? 'fish' : 'eyes') : pickOf(['paws', 'eyes', 'claws']);
    const witness = pickOf(g.people.filter(p => p.mode === 'camp' && p.health < 2)) ?? g.leader!;
    if (kind === 'paws') {
      for (let i = 0; i < 9; i++) this.paws.push({ x: F.x + Math.cos(a) * (14 + i * 1.6), z: F.z + Math.sin(a) * (14 + i * 1.6), t: 700 });
      S.toast('Big paw prints at the edge of camp this morning.', 'info'); S.log('Paw prints at the edge of camp. Big ones. Something walked right up to us in the night.');
      g.chatter.rumor(witness, 'a few big paw prints by camp', true);
    } else if (kind === 'fish') {
      g.stock.food.fish = Math.max(0, g.stock.food.fish - 2);
      S.toast('Fish went missing from the pile in the night.', 'info'); S.log('Two fish gone from the pile. Nobody admits to it. There were scratches in the sand.');
      g.chatter.rumor(witness, 'something took fish from the pile', true);
    } else if (kind === 'eyes') {
      const L = g.leader!; this.x = L.x + Math.cos(a) * 14; this.z = L.z + Math.sin(a) * 14; this.eyes = true; this.visible = false;
      setTimeout(() => { this.eyes = false; }, 4000);
      S.say(witness, 'Did you see that? Eyes. In the trees.', 3); S.log('Eyes in the dark, just past the torchlight. Then nothing.');
      g.chatter.rumor(witness, 'eyes watching from the trees', true);
    } else {
      S.toast('Claw marks on a tree near camp. Deep ones.', 'info'); S.log('Claw marks gouged into a tree near camp. Higher than a man can reach.');
      g.chatter.rumor(witness, 'claw marks high up a tree', true);
    }
    if (this.signs === 2 && !this.name) this.nameIt();
  }

  /** Whoever tells the scariest story names it. */
  private nameIt() {
    const g = this.g, teller = g.people.find(p => p.per.skill === 'storyteller' && p.mode === 'camp') ?? g.people.find(p => (has(p.per, 'cowardly') || has(p.per, 'hothead')) && p.mode === 'camp') ?? g.people.find(p => p.mode === 'camp');
    this.name = pickOf(NAMES);
    if (teller) setTimeout(() => g.story.say(teller, `I've seen it. Black as smoke. We should call it ${this.name}.`, 5), 1000);
    g.story.toast(`The camp calls it "${this.name}".`, 'info');
    g.story.log(`${teller?.per.name ?? 'Someone'} told a story about the thing in the jungle. Now everyone calls it ${this.name}.`);
  }

  private appear() {
    const g = this.g, F = g.fire;
    if (this.wounded > 0 || Math.random() > 0.004 * (1 + this.bold)) return;
    const a = Math.random() * 6.283, r = g.camp.has('fence') ? 24 : 20;
    const q = g.grid.nearest(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r); if (!q) return;
    this.x = q.x; this.z = q.z; this.visible = true; this.eyes = true; this.thinkT = 0;
  }

  /** Each second at night: hunt the lonely, flee the fire, raid the pile. */
  private think() {
    const g = this.g, S = g.story, F = g.fire, P = g.stock.pile;
    const alive = g.people.filter(p => p.mode !== 'dead' && p.mode !== 'asleep');
    const near = (p: Person, r: number) => Math.hypot(p.x - this.x, p.z - this.z) < r;
    // a watcher who's awake spots it
    const watcher = alive.find(p => p.job === 'watch' && p.watched && p.pose !== 'sit' && Math.hypot(p.x - this.x, p.z - this.z) < 26);
    if (watcher) {
      S.say(watcher, `${(this.name || 'The cat').toUpperCase()}! IT'S HERE! UP, EVERYONE!`, 3.5);
      for (const p of alive) if (Math.hypot(p.x - F.x, p.z - F.z) < 25 && p.pose === 'sleep') { p.poseO = 'startle'; p.poseT = 0.8; }
      S.log(`${watcher.per.name} spotted ${this.name || 'the cat'} prowling and woke the camp. It ran.`);
      S.trust(watcher, 2); this.flee(); return;
    }
    // fire, torches and crowds scare it off
    const scary = alive.filter(p => near(p, 9) && (p.torch || alive.filter(o => Math.hypot(o.x - p.x, o.z - p.z) < 5).length >= 3));
    if (scary.length || Math.hypot(this.x - F.x, this.z - F.z) < 9 || (g.camp.get('watchFire') && Math.hypot(this.x - g.camp.get('watchFire')!.x, this.z - g.camp.get('watchFire')!.z) < 8)) {
      if (scary[0]) S.say(scary[0], pickOf(['GET OUT OF HERE!', 'Hyah! Go!', 'Back! BACK!']), 2);
      this.flee(); return;
    }
    // someone alone in the dark, away from the fire?
    const lone = alive.filter(p => !p.torch && Math.hypot(p.x - F.x, p.z - F.z) > 16 && !alive.some(o => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 7));
    const prey = lone.sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
    if (prey && near(prey, 45)) {
      if (near(prey, 2.5) && Math.random() < 0.35 + this.bold * 0.1) { this.attack(prey); return; }
      this.tgt = { x: prey.x, z: prey.z }; this.spd = 3.4; return;
    }
    // no fence: the food pile
    if (!g.camp.has('fence') && Math.hypot(this.x - P.x, this.z - P.z) < 4) {
      const took = Math.min(3, g.stock.food.meat + g.stock.food.fish);
      if (took > 0) { const m = Math.min(took, g.stock.food.meat); g.stock.food.meat -= m; g.stock.food.fish -= took - m; S.toast(`${this.name || 'Something'} raided the food pile!`, 'bad'); S.log(`${this.name || 'The cat'} got into the food in the night. A fence would stop that.`); }
      this.flee(); return;
    }
    // prowl: circle the camp, outside the fence if there is one
    const a = Math.atan2(this.z - F.z, this.x - F.x) + 0.25, r = g.camp.has('fence') ? 22 : Math.random() < 0.2 ? 6 : 18;
    this.tgt = { x: F.x + Math.cos(a) * r, z: F.z + Math.sin(a) * r }; this.spd = 2.2;
  }

  private attack(p: Person) {
    const g = this.g, S = g.story, N = p.per.name;
    p.poseO = 'startle'; p.poseT = 1;
    S.say(p, 'AAAH!', 2); g.onAlarm();
    if (p.hurt && p.health >= 2 && Math.random() < 0.5) { g.health.die(p, `${this.name || 'the cat'}`, true); S.log(`${this.name || 'The cat'} took ${N}, alone in the dark.`); }
    else { p.hurt = true; p.heal = 600; S.toast(`${this.name || 'Something'} attacked ${N}!`, 'bad', p); S.log(`${this.name || 'The cat'} went for ${N} out in the dark. ${N} got away, torn up.`); if (p.mode === 'camp') g.health.worsen(p, 'a mauling'); }
    this.flee();
  }

  private flee() { this.fleeT = 6; this.eyes = false; }

  private moveTo(t: Pt, spd: number, dt: number) {
    const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
    this.moving = d > 0.3 && spd > 0;
    if (!this.moving) return;
    const s = Math.min(d, spd * dt), nx = this.x + dx / d * s, nz = this.z + dz / d * s;
    if (this.g.grid.walkable(nx, nz) || this.fleeT > 0) { this.x = nx; this.z = nz; }
    this.face = dx > 0 ? 1 : -1;
  }

  // ------------------------------------------------------------------ the hunt (yours)

  canHunt() { return this.phase === 'stalk' && !this.hunting && this.g.stock.tools.spear >= 2; }
  startHunt() {
    const g = this.g;
    this.hunting = true;
    g.disc.addMarker({ x: this.lair.x, z: this.lair.z, r: 10, kind: '!', text: `${this.name || 'The cat'}'s lair`, poi: null, who: null, fake: false });
    for (let i = 1; i < 10; i++) { const f = i / 10; this.paws.push({ x: g.fire.x + (this.lair.x - g.fire.x) * f, z: g.fire.z + (this.lair.z - g.fire.z) * f, t: 2000 }); }
    g.story.log(`We're going after ${this.name || 'the cat'}. The tracks lead to its lair.`);
    g.hint('hunt', `Take a party with spears to the red ring. Bring at least two people.`);
  }
  /** The leader's party reaches the lair: a fight in slow motion. */
  checkLair(L: Person) {
    if (!this.hunting || this.fight || this.phase === 'dead') return;
    if (Math.hypot(L.x - this.lair.x, L.z - this.lair.z) > 11) return;
    const party = this.g.party;
    if (party.length < 2) { this.g.story.say(L, "Not alone. I need people with me."); return; }
    this.fight = { t: 0, party };
    this.x = this.lair.x + 3; this.z = this.lair.z; this.visible = true; this.eyes = true;
    this.g.slowT = 4; this.g.focus = { x: this.lair.x, z: this.lair.z };
    for (const p of party) { p.poseO = 'argue'; p.poseT = 4; }
    this.g.story.say(party[0], 'THERE! Spears up!', 3);
  }
  private showdown(dt: number) {
    const g = this.g, S = g.story, f = this.fight!, L = g.leader!;
    f.t += dt;
    this.face = L.x > this.x ? 1 : -1; this.moving = f.t % 1 < 0.5;
    if (f.t < 3) return;
    this.fight = null; this.hunting = false;
    for (const m of g.disc.markers.filter(m => m.text.endsWith('lair'))) g.disc.removeMarker(m);
    const spears = Math.min(g.stock.tools.spear, f.party.length + 1);
    const odds = 0.3 + spears * 0.1 + f.party.filter(p => has(p.per, 'brave')).length * 0.06 + f.party.length * 0.04 - this.bold * 0.1 + (this.wounded > 0 ? 0.2 : 0);
    if (Math.random() < odds) {
      this.phase = 'dead'; this.visible = false;
      const hero = f.party.slice().sort((a, b) => (has(b.per, 'brave') ? 1 : 0) - (has(a.per, 'brave') ? 1 : 0))[0];
      g.stock.add('meat', 12); g.stock.hides++;
      S.toast(`${this.name || 'The cat'} is dead! ${hero.per.name} landed the last spear.`, 'good', hero);
      S.log(`We killed ${this.name || 'the cat'}. ${hero.per.name} landed the last spear. Its hide hangs by ${L.per.name}'s hut. People will tell this one for years.`);
      S.trustAll(8, L); S.trust(hero, 10); for (const p of g.people) if (p !== hero && p.mode !== 'dead') S.addRel(p, hero, 8);
      for (const p of f.party) { p.poseO = 'cheer'; p.poseT = 3; S.mood(p, 'happy', 200); }
      g.chatter.legend = `${hero.per.name} killed ${this.name || 'the cat'}`;
      g.onChime(true);
    } else {
      const victim = f.party[(Math.random() * f.party.length) | 0];
      victim.hurt = true; victim.heal = 900; g.health.worsen(victim, 'a mauling'); g.health.worsen(victim, 'a mauling');
      this.bold++; this.visible = false;
      S.toast(`${this.name || 'The cat'} mauled ${victim.per.name} and got away.`, 'bad', victim);
      S.log(`The hunt went wrong. ${this.name || 'The cat'} tore into ${victim.per.name} and vanished. It knows us now.`);
      S.trustAll(-3, L); g.onAlarm();
    }
  }
}
