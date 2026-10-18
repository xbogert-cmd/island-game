import type { Group } from './group';

export interface Objective { key: string; text: string; x?: number; z?: number }

/**
 * "What should I be doing?" — the 3 most useful things for the leader right now, worked out from the situation.
 * Nothing is scripted; the list changes as the island changes.
 */
export function objectives(g: Group): Objective[] {
  const out: Objective[] = [], L = g.leader, d = g.disc;
  if (!L) return out;
  const known = (k: string) => d.pois.some(p => p.known && p.kind === k);
  const n = g.people.length;
  // someone in trouble beats everything
  for (const m of d.markers) if (m.kind === '!' && m.who) out.push({ key: 'rescue' + m.who.id, text: `Find ${m.who.per.name} (red !)`, x: m.x, z: m.z });
  for (const p of g.people) if (p.mode !== 'dead' && p.health >= 2) out.push({ key: 'sick' + p.id, text: p.health >= 3 ? `${p.per.name} is very sick: sick bay, food and water now` : `${p.per.name} is sick: keep them fed and resting`, x: p.x, z: p.z });
  if (g.cat.hunting) out.push({ key: 'hunt', text: `Hunt ${g.cat.name || 'the cat'}: take a party to its lair (red ring)`, x: g.cat.lair.x, z: g.cat.lair.z });
  const r = g.requests.cur;
  if (r) out.push({ key: 'ask', text: `${r.p.per.name} wants to talk`, x: r.p.x, z: r.p.z });
  if (g.goals.opts.length) out.push({ key: 'plan', text: 'Pick a plan for today' });
  // the camp's own problems: things to fix
  for (const pr of g.jobs.problems().slice(0, 2)) out.push(pr);
  for (const p of g.people) if (p.hurt && p.mode === 'camp' && !g.camp.has('sickbay') && g.era !== 'crash' && !g.camp.planned('sickbay')) { out.push({ key: 'hurt' + p.id, text: `${p.per.name} is hurt: a sick bay would help` }); break; }
  if (!g.party.length && !g.crew.out && g.clock.day <= 2) out.push({ key: 'party', text: 'Walk out of camp: your crew comes with you' });
  if (!known('water')) out.push({ key: 'water', text: 'Find fresh water (try following a river)' });
  if (!known('food')) out.push({ key: 'food', text: 'Find food near camp' });
  else if (g.stock.totalFood < n * 0.6) out.push({ key: 'lowfood', text: 'Food is low: find more, or plan a gathering day' });
  // the nearest rumor, then the debris trail, then the unexplored rest
  const rum = d.markers.filter(m => m.kind === '?').sort((a, b) => Math.hypot(a.x - L.x, a.z - L.z) - Math.hypot(b.x - L.x, b.z - L.z))[0];
  if (rum) out.push({ key: 'rumor' + rum.id, text: `Check the rumor: ${rum.text}`, x: rum.x, z: rum.z });
  if (!known('tail')) out.push({ key: 'tail', text: 'Follow the debris to the tail section' });
  const found = d.pois.filter(p => p.major && p.known).length, all = d.pois.filter(p => p.major).length;
  out.push({ key: 'explore', text: `Explore the island (${found}/${all} places found)` });
  return out.slice(0, 3);
}
