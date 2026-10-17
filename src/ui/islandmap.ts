import { N } from '../world/island';
import { MAP } from '../life/discovery';
import type { Game } from '../game';

/** The full island map: what you know, where everyone is, every name. `wrap` holds the canvas and gets the name labels. */
export function drawIslandMap(G: Game, cv: HTMLCanvasElement, wrap: HTMLElement, base: ImageData) {
  const g = G.group, d = g.disc, S = 384, k = S / N, m = cv.getContext('2d')!;
  const img = new ImageData(new Uint8ClampedArray(base.data), S, S), ex = d.explored;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!ex[(y >> 1) * MAP + (x >> 1)]) { const o = (y * S + x) * 4; img.data[o] *= 0.5; img.data[o + 1] *= 0.5; img.data[o + 2] *= 0.55; }
  m.putImageData(img, 0, 0);
  for (const tr of g.scouting.trips) { m.fillStyle = '#ffd08a'; for (const q of tr.trail) m.fillRect(q.x * k - 0.5, q.z * k - 0.5, 1.5, 1.5); }
  for (const mk of d.markers) { m.strokeStyle = mk.kind === '!' ? '#ff5a4a' : '#ffd65a'; m.lineWidth = 2; m.setLineDash([3, 3]); m.beginPath(); m.arc(mk.x * k, mk.z * k, Math.max(5, mk.r * k), 0, 6.283); m.stroke(); m.setLineDash([]); }
  for (const p of d.pois) if (p.known) {
    const x = p.x * k, y = p.z * k;
    if (p.major) { m.fillStyle = '#000'; m.beginPath(); m.moveTo(x, y - 6); m.lineTo(x + 6, y); m.lineTo(x, y + 6); m.lineTo(x - 6, y); m.fill(); m.fillStyle = '#fff'; m.beginPath(); m.moveTo(x, y - 4); m.lineTo(x + 4, y); m.lineTo(x, y + 4); m.lineTo(x - 4, y); m.fill(); }
    else { m.fillStyle = '#000'; m.fillRect(x - 3, y - 3, 6, 6); m.fillStyle = p.kind === 'water' ? '#7fd8ff' : p.kind === 'material' ? '#d8a060' : '#8af07a'; m.fillRect(x - 2, y - 2, 4, 4); }
  }
  for (const p of g.people) {
    if (p === g.leader || p.mode === 'asleep') continue;
    m.fillStyle = p.mode === 'scout' ? '#ffa040' : p.mode === 'lost' || p.mode === 'hurt' ? '#ff5a4a' : p.mode === 'camp' ? '#d8d8d8' : '#8af07a';
    m.fillRect(p.x * k - 1.5, p.z * k - 1.5, 3, 3);
  }
  for (const b of g.camp.list) { if (b.kind === 'fence') continue; m.fillStyle = '#000'; m.fillRect(b.x * k - 2.5, b.z * k - 2.5, 5, 5); m.fillStyle = b.progress >= 1 ? '#c8905a' : '#7a6a5a'; m.fillRect(b.x * k - 1.5, b.z * k - 1.5, 3, 3); }
  const f = g.fire; m.fillStyle = '#000'; m.fillRect(f.x * k - 4, f.z * k - 4, 8, 8); m.fillStyle = '#ffdd55'; m.fillRect(f.x * k - 3, f.z * k - 3, 6, 6);
  const L = g.leader; if (L) { m.fillStyle = '#000'; m.fillRect(L.x * k - 4, L.z * k - 4, 8, 8); m.fillStyle = '#fff'; m.fillRect(L.x * k - 2, L.z * k - 2, 4, 4); }
  // names as text over the canvas
  wrap.querySelectorAll('.ml').forEach(e => e.remove());
  const r = cv.getBoundingClientRect(), sc = r.width / N;
  const lab = (t: string, x: number, z: number, cls = '') => { const e = document.createElement('div'); e.className = 'ml ' + cls; e.textContent = t; e.style.left = `${x * sc}px`; e.style.top = `${z * sc}px`; wrap.appendChild(e); };
  for (const p of d.pois) if (p.known && p.major) { const t = d.display(p); lab(t.charAt(0).toUpperCase() + t.slice(1), p.x, p.z); }
  for (const mk of d.markers) lab(mk.kind === '!' ? mk.text : '? ' + mk.text, mk.x, mk.z, 'r');
  lab('Camp', f.x, f.z, 'c');
}
