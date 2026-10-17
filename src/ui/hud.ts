import '@fontsource/press-start-2p';
import { B, N } from '../world/island';
import type { Game } from '../game';
import type { WeatherKind } from '../sim/weather';
import type { Ambience } from '../audio/ambience';
import { U } from '../render/shared';
import { MAP } from '../life/discovery';
import { ZOOMS } from '../render/camera';

const CSS = `
.hud { position: absolute; font-family: 'Press Start 2P', monospace; color: #f4f1e6; user-select: none; z-index: 5; }
.pill { background: #121a33e6; border: 3px solid #2b3766; border-radius: 22px; padding: 12px 18px; display: inline-flex; align-items: center; gap: 12px; box-shadow: 0 3px 0 #0007; }
#clock { top: 14px; left: 14px; font-size: 18px; }
#clock .ic { font-size: 20px; width: 22px; text-align: center; }
#wx { top: 72px; left: 14px; font-size: 11px; padding: 9px 14px; }
#speed { top: 116px; left: 14px; display: flex; gap: 6px; }
#speed button, .btn { font: 10px 'Press Start 2P', monospace; color: #f4f1e6; background: #121a33e6; border: 3px solid #2b3766; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
#speed button.on, .btn.on { background: #3b4f9a; border-color: #7d92e0; }
#mini { top: 14px; right: 14px; border: 3px solid #2b3766; border-radius: 12px; background: #1c4672; box-shadow: 0 3px 0 #0007; cursor: pointer; overflow: hidden; line-height: 0; }
#mini canvas { image-rendering: pixelated; width: 210px; height: 210px; }
#gear { top: 240px; right: 14px; }
#zoom { top: 116px; left: 222px; display: flex; gap: 6px; align-items: center; }
#zoom button { font: 10px 'Press Start 2P', monospace; color: #f4f1e6; background: #121a33e6; border: 3px solid #2b3766; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
#zoom .dots { font-size: 10px; letter-spacing: 2px; text-shadow: 0 2px 0 #000; }
#panel { top: 286px; right: 14px; width: 260px; display: none; flex-direction: column; gap: 12px; font-size: 10px; line-height: 1.6; background: #121a33f2; border: 3px solid #2b3766; border-radius: 14px; padding: 14px; }
#panel.open { display: flex; }
#panel label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#panel input[type=text], #panel select { font: 10px 'Press Start 2P', monospace; background: #0b1020; color: #f4f1e6; border: 2px solid #2b3766; border-radius: 6px; padding: 6px; width: 110px; }
#hint { bottom: 12px; right: 14px; font-size: 8px; opacity: 0.8; padding: 8px 12px; }
@media (max-width: 1180px) { #hint { display: none; } }
`;

const BIOME_RGB: Record<number, number[]> = {
  [B.Ocean]: [28, 82, 145], [B.Beach]: [236, 216, 160], [B.Grass]: [108, 182, 84], [B.Jungle]: [44, 110, 52], [B.Highland]: [150, 150, 112], [B.Volcanic]: [110, 100, 94],
  [B.Swamp]: [70, 96, 64], [B.Bamboo]: [128, 178, 74], [B.Flowers]: [196, 172, 112], [B.TideRock]: [118, 118, 114], [B.Dirt]: [164, 136, 88], [B.Reef]: [96, 210, 200], [B.Lagoon]: [92, 206, 204], [B.Lake]: [70, 150, 220],
};

export class Hud {
  private clockEl: HTMLElement; private wxEl: HTMLElement; private zoomEl: HTMLElement;
  private mini: HTMLCanvasElement; private miniBase: ImageData; private miniDim: ImageData; private dimVer = -1; private dimT = 0;
  constructor(private game: Game, audio: Ambience) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild as HTMLElement; document.body.appendChild(e); return e; };
    this.clockEl = el('<div id="clock" class="hud pill"><span class="ic">☀</span><span class="t">DAY 1 - 06:00</span></div>');
    this.wxEl = el('<div id="wx" class="hud pill">CLEAR</div>');
    const speed = el('<div id="speed" class="hud"><button data-s="0">II</button><button data-s="1" class="on">1x</button><button data-s="2">2x</button><button data-s="4">4x</button></div>');
    speed.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      game.clock.speed = Number(b.dataset.s); speed.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    addEventListener('keydown', e => { if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); (speed.querySelector(game.clock.speed ? '[data-s="0"]' : '[data-s="1"]') as HTMLButtonElement).click(); } });

    // zoom: one click per level, so the middle view is always easy to get back to
    this.zoomEl = el('<div id="zoom" class="hud"><button data-z="-1">−</button><span class="dots"></span><button data-z="1">+</button></div>');
    this.zoomEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => game.rig.setZoom(game.rig.zoomI + Number((b as HTMLElement).dataset.z))));

    const miniWrap = el('<div id="mini" class="hud"><canvas width="192" height="192"></canvas></div>');
    this.mini = miniWrap.querySelector('canvas')!;
    this.miniBase = this.buildMinimap();
    this.miniDim = new ImageData(new Uint8ClampedArray(this.miniBase.data), 192, 192);
    miniWrap.addEventListener('pointerdown', e => {
      const r = this.mini.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * N, z = ((e.clientY - r.top) / r.height) * N;
      if (game.group.scoutPick) game.group.clickGround(x, z);
      else { game.rig.jumpTo(x, z); game.rig.followOn = false; }
      e.stopPropagation();
    });

    // hover a dot on the minimap to see what it is
    miniWrap.addEventListener('pointermove', e => {
      const r = this.mini.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * N, z = ((e.clientY - r.top) / r.height) * N, d = game.group.disc;
      let best = '', bd = 10;
      for (const p of d.pois) if (p.known) { const dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; best = d.display(p); } }
      for (const m of d.markers) { const dd = Math.hypot(m.x - x, m.z - z); if (dd < bd) { bd = dd; best = m.text; } }
      if (Math.hypot(game.group.fire.x - x, game.group.fire.z - z) < bd) best = 'Camp';
      miniWrap.title = best;
    });

    const gear = el('<button id="gear" class="hud btn">⚙ SETTINGS</button>');
    const panel = el(`<div id="panel" class="hud">
      <label>Outlines <input id="o-filter" type="checkbox"></label>
      <label>Texture grain <select id="o-grain"><option value="0">Smooth</option><option value="0.35">Soft</option><option value="0.65">Medium</option><option value="1">Classic</option></select></label>
      <label>Sound <input id="o-sound" type="checkbox" checked></label>
      <label>Weather <select id="o-wx"><option value="auto">Auto</option><option>clear</option><option>cloudy</option><option>rain</option><option>storm</option></select></label>
      <label>Seed <input id="o-seed" type="text" value="${game.world.seed}"></label>
      <button class="btn" id="o-go">NEW ISLAND</button>
      <button class="btn" id="o-rand">RANDOM ISLAND</button>
    </div>`);
    gear.addEventListener('click', () => { panel.classList.toggle('open'); gear.classList.toggle('on'); });
    const filt = panel.querySelector('#o-filter') as HTMLInputElement;
    filt.checked = localStorageGet('outlines') !== '0';      // thin outlines: on unless turned off
    const applyFilter = () => { game.post.mat.uniforms.uFilter.value = filt.checked ? 1 : 0; localStorageSet('outlines', filt.checked ? '1' : '0'); };
    filt.addEventListener('change', applyFilter); applyFilter();
    const grain = panel.querySelector('#o-grain') as HTMLSelectElement;
    grain.value = localStorageGet('grain3') ?? '1';
    const applyGrain = () => { U.uGrain.value = Number(grain.value); localStorageSet('grain3', grain.value); };
    grain.addEventListener('change', applyGrain); applyGrain();
    const snd = panel.querySelector('#o-sound') as HTMLInputElement;
    snd.checked = localStorageGet('sound') !== '0';
    const applySound = () => { audio.setMuted(!snd.checked); localStorageSet('sound', snd.checked ? '1' : '0'); };
    snd.addEventListener('change', applySound); applySound();
    (panel.querySelector('#o-wx') as HTMLSelectElement).addEventListener('change', e => {
      const v = (e.target as HTMLSelectElement).value; game.weather.locked = v === 'auto' ? null : v as WeatherKind;
    });
    const go = (seed: string | number) => { location.search = `?seed=${seed}`; };
    panel.querySelector('#o-go')!.addEventListener('click', () => go((panel.querySelector('#o-seed') as HTMLInputElement).value || 1));
    panel.querySelector('#o-rand')!.addEventListener('click', () => go((Math.random() * 1e9) | 0));
    el('<div id="hint" class="hud pill">CLICK: GO &nbsp; RIGHT-CLICK: WHISTLE &nbsp; DRAG: LOOK &nbsp; SCROLL: ZOOM &nbsp; Q/E: TURN</div>');
    document.querySelectorAll('.hud').forEach(e => e.addEventListener('pointerdown', (ev: Event) => ev.stopPropagation()));
  }

  private buildMinimap() {
    const w = this.game.world, S = 192, k = N / S, g = this.mini.getContext('2d')!, img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = Math.floor(y * k + k / 2) * N + Math.floor(x * k + k / 2), h = w.h[i], b = w.biome[i];
      let c = BIOME_RGB[b] ?? [255, 0, 255];
      if (b === B.Ocean) c = h > -1.5 ? [58, 150, 190] : h > -5 ? [36, 108, 168] : c;
      const hn = w.h[Math.max(0, i - N * 2 - 2)], sh = b === B.Ocean || b === B.Lagoon || b === B.Reef ? 1 : Math.max(0.7, Math.min(1.25, 1 + (h - hn) * 0.12));
      const o = (y * S + x) * 4; img.data[o] = c[0] * sh; img.data[o + 1] = c[1] * sh; img.data[o + 2] = c[2] * sh; img.data[o + 3] = 255;
    }
    for (const r of w.rivers) for (const p of r.pts) { const o = ((p.z / k | 0) * S + (p.x / k | 0)) * 4; img.data[o] = 80; img.data[o + 1] = 170; img.data[o + 2] = 230; }
    return img;
  }

  update() {
    const g = this.game, c = g.clock, wx = g.weather;
    const night = c.night > 0.5, h = c.hour;
    const dots = ZOOMS.map((_, i) => i === g.rig.zoomI ? '●' : '○').join('');
    const de = this.zoomEl.querySelector('.dots') as HTMLElement; if (de.textContent !== dots) de.textContent = dots;
    (this.clockEl.querySelector('.ic') as HTMLElement).textContent = night ? '☾' : h < 7 || h > 18 ? '◐' : '☀';
    const tally = ('||||| '.repeat(Math.floor(c.day / 5)) + '|'.repeat(c.day % 5)).trim();
    (this.clockEl.querySelector('.t') as HTMLElement).innerHTML = `DAY ${c.day} <span style="font-size:11px;opacity:.75;letter-spacing:-2px">${tally}</span> - ${c.label}`;
    const label = wx.storm > 0.6 ? '⛈ STORM' : wx.rain > 0.3 ? '☂ RAIN' : wx.cloud > 0.5 ? '☁ CLOUDY' : night ? '✦ CLEAR NIGHT' : '☀ CLEAR';
    if (this.wxEl.textContent !== label) this.wxEl.textContent = label;
    // minimap + camera footprint
    const m = this.mini.getContext('2d')!, k = 192 / N, r = g.rig, t = r.target;
    const disc = g.group.disc;
    if (disc.exploredVer !== this.dimVer && (this.dimT -= 1 / 60) <= 0) {
      this.dimT = 0.5; this.dimVer = disc.exploredVer;
      const a = this.miniBase.data, o = this.miniDim.data, ex = disc.explored;
      for (let i = 0; i < MAP * MAP; i++) { const f = ex[i] ? 1 : 0.55; o[i * 4] = a[i * 4] * f; o[i * 4 + 1] = a[i * 4 + 1] * f; o[i * 4 + 2] = a[i * 4 + 2] * f; }
    }
    m.putImageData(this.miniDim, 0, 0);
    for (const p of disc.pois) if (p.known) {
      m.fillStyle = p.kind === 'water' ? '#7fd8ff' : p.kind === 'food' ? '#8af07a' : '#ffffff';
      const x = p.x * k, y = p.z * k;
      if (p.major) { m.beginPath(); m.moveTo(x, y - 3); m.lineTo(x + 3, y); m.lineTo(x, y + 3); m.lineTo(x - 3, y); m.fill(); } else m.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const tr of g.group.scouting.trips) { m.fillStyle = '#ffd08a'; for (let i = 0; i < tr.trail.length; i += 2) m.fillRect(tr.trail[i].x * k - 0.5, tr.trail[i].z * k - 0.5, 1, 1); }
    for (const mk of disc.markers) {
      m.strokeStyle = mk.kind === '!' ? '#ff5a4a' : '#ffd65a'; m.lineWidth = 1.5;
      m.beginPath(); m.arc(mk.x * k, mk.z * k, Math.max(3, mk.r * k), 0, 6.283); m.stroke();
      m.fillStyle = m.strokeStyle; m.font = '7px monospace'; m.fillText(mk.kind, mk.x * k - 2, mk.z * k + 3);
    }
    for (const p of g.group.people) {
      if (p === g.group.leader || !(p.mode === 'follow' || p.mode === 'wait' || p.mode === 'rescued' || p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt')) continue;
      m.fillStyle = p.mode === 'scout' ? '#ffa040' : p.mode === 'lost' || p.mode === 'hurt' ? '#ff5a4a' : '#8af07a'; m.fillRect(p.x * k - 1, p.z * k - 1, 2, 2);
    }
    const ld = g.group.leader;
    if (ld) { m.fillStyle = '#000'; m.fillRect(ld.x * k - 2, ld.z * k - 2, 4, 4); m.fillStyle = '#fff'; m.fillRect(ld.x * k - 1, ld.z * k - 1, 2, 2); }
    const hw = (r.W * 0.125) / 2, hh = (r.H * 0.125) / 2 / Math.sin(0.82), cs = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    const pt = (a: number, b: number) => [(t.x + a * cs + b * sn) * k, (t.z - a * sn + b * cs) * k];
    m.strokeStyle = '#fff'; m.lineWidth = 1; m.beginPath();
    const ps = [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
    m.moveTo(ps[0][0], ps[0][1]); for (const p of ps.slice(1)) m.lineTo(p[0], p[1]); m.closePath(); m.stroke();
    const cr = g.world.crash; m.fillStyle = '#ffdd55'; m.fillRect(cr.x * k - 1.5, cr.z * k - 1.5, 3, 3);
  }
}

function localStorageGet(k: string) { try { return localStorage.getItem('island.' + k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem('island.' + k, v); } catch { /* private mode */ } }
