import '@fontsource/press-start-2p';
import { B, N, World } from '../world/island';
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
#rbtns { top: 240px; right: 14px; display: flex; gap: 6px; }
.page { position: absolute; z-index: 9; left: 50%; top: 50%; transform: translate(-50%, -50%); font-family: 'Press Start 2P', monospace; color: #f4f1e6; background: #121a33f5; border: 3px solid #2b3766; border-radius: 14px; box-shadow: 0 4px 0 #0008; padding: 16px 20px; display: none; }
.page.open { display: block; }
.page h4 { font-size: 11px; margin: 0 0 10px; font-weight: normal; color: #ffd65a; }
.page .x { position: absolute; right: 14px; top: 12px; cursor: pointer; font-size: 12px; }
#help { width: min(760px, 94vw); max-height: 84vh; overflow-y: auto; font-size: 8px; line-height: 2; }
#help h5 { font-size: 9px; color: #ffd65a; margin: 12px 0 4px; font-weight: normal; }
#help .row { display: flex; gap: 12px; } #help .row b { flex: none; width: 210px; font-weight: normal; color: #9fb0ff; }
#bigmap .wrap { position: relative; line-height: 0; }
#bigmap canvas { image-rendering: pixelated; width: min(78vh, 86vw); height: min(78vh, 86vw); border-radius: 8px; cursor: crosshair; }
#bigmap .ml { position: absolute; transform: translate(-50%, -130%); font: 8px 'Press Start 2P', monospace; color: #fff; text-shadow: 0 2px 0 #000, 0 0 3px #000; white-space: nowrap; pointer-events: none; line-height: 1; }
#bigmap .ml.r { color: #ffd65a; font-size: 7px; } #bigmap .ml.c { color: #ffdd55; }
#bigmap .leg { font-size: 7px; opacity: .8; margin-top: 10px; line-height: 1.8; }
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

const row = (a: string, b: string) => `<div class="row"><b>${a}</b><span>${b}</span></div>`;
const HELP = `
<h5>CONTROLS (MOUSE ONLY)</h5>
${row('Click the ground', 'Walk there. Your group follows.')}
${row('Click a survivor', 'Their card: bring them along, send them scouting, find them.')}
${row('Click yourself', 'Your group waits here. Click again to call them.')}
${row('Right-click', 'Whistle: everyone with you comes running.')}
${row('Stand still', 'Your group spreads out and searches around you.')}
${row('Drag', 'Look around. The camera follows you again when you walk.')}
${row('Scroll  or  − / +', 'Zoom in and out.')}
${row('Q / E', 'Turn the view.')}
${row('II  1x  2x  4x', 'Pause and game speed (Space pauses too).')}
<h5>WHAT THE MARKS MEAN</h5>
${row('<span style="color:#ffd65a">❗</span> over someone', 'They want to talk. Click them to answer, or ignore them and they decide alone.')}
${row('<span style="color:#ffd65a">?</span> in a yellow ring', 'A rumor. Walk into the ring to see if it is true. Some people lie.')}
${row('<span style="color:#ff5a4a">!</span> in a red ring', 'Someone is lost or hurt out there. Go and find them.')}
${row('Dotted trail', "A scout's path. Click it to follow them with the camera.")}
${row('Faces', '😊 happy · 😠 angry · 😟 worried · 😢 sad or hungry · 😨 scared · 💤 tired · ❤ fond · 🤕 hurt')}
<h5>HOW THE DAY WORKS</h5>
${row('Morning', 'Three people suggest a plan. Pick one; the camp works on it all day. Time slows while you choose.')}
${row('Daytime', 'People gather food and water on their own, and come to you with ideas. Some ideas are bad: watch how they ask.')}
${row('Evening', 'Everyone eats from the pile by the fire. Not enough food = hungry, unhappy people.')}
${row('Night', 'Everyone sits at the fire and talks. Secrets slip out. Out in the dark, your group gets nervous.')}
<h5>WORDS</h5>
${row('Trust', 'Loyal › Trusts you › Unsure › Doubts you › Against you')}
${row('Food / water', 'Plenty › Enough › Low › Out')}
${row('GOALS box', 'What to do next. Click a goal with ⌖ to look there.')}
`;

const BIOME_RGB: Record<number, number[]> = {
  [B.Ocean]: [28, 82, 145], [B.Beach]: [236, 216, 160], [B.Grass]: [108, 182, 84], [B.Jungle]: [44, 110, 52], [B.Highland]: [150, 150, 112], [B.Volcanic]: [110, 100, 94],
  [B.Swamp]: [70, 96, 64], [B.Bamboo]: [128, 178, 74], [B.Flowers]: [196, 172, 112], [B.TideRock]: [118, 118, 114], [B.Dirt]: [164, 136, 88], [B.Reef]: [96, 210, 200], [B.Lagoon]: [92, 206, 204], [B.Lake]: [70, 150, 220],
};

export class Hud {
  private clockEl: HTMLElement; private wxEl: HTMLElement; private zoomEl: HTMLElement;
  private help: HTMLElement; private big: HTMLElement; private bigBase: ImageData; private bigT = 0;
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
    this.miniBase = mapImage(game.world, 192);
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

    const rb = el('<div id="rbtns" class="hud"><button class="btn" data-b="map">MAP</button><button class="btn" data-b="help">?</button><button id="gear" class="btn">⚙ SETTINGS</button></div>');
    const gear = rb.querySelector('#gear') as HTMLElement;
    this.help = el(`<div id="help" class="page"><div class="x">✕</div><h4>HOW TO PLAY</h4>${HELP}</div>`);
    this.big = el('<div id="bigmap" class="page"><div class="x">✕</div><h4>THE ISLAND — click anywhere to look there</h4><div class="wrap"><canvas width="384" height="384"></canvas></div><div class="leg">◆ PLACE &nbsp; ~ WATER &nbsp; ✱ FOOD &nbsp; <span style="color:#ffd65a">? RUMOR</span> &nbsp; <span style="color:#ff5a4a">! TROUBLE</span> &nbsp; <span style="color:#8af07a">■ YOUR GROUP</span> &nbsp; <span style="color:#ffa040">■ SCOUT</span> &nbsp; □ YOU</div></div>');
    this.bigBase = mapImage(game.world, 384);
    const close = () => { this.help.classList.remove('open'); this.big.classList.remove('open'); };
    for (const pg of [this.help, this.big]) (pg.querySelector('.x') as HTMLElement).onclick = close;
    rb.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
      const pg = (b as HTMLElement).dataset.b === 'map' ? this.big : this.help, o = !pg.classList.contains('open');
      close(); if (o) { pg.classList.add('open'); if (pg === this.big) this.drawBig(); }
    }));
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const bc = this.big.querySelector('canvas')!;
    bc.addEventListener('click', e => {
      const r = bc.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * N, z = ((e.clientY - r.top) / r.height) * N;
      if (game.group.scoutPick) game.group.clickGround(x, z); else { game.rig.jumpTo(x, z); game.rig.followOn = false; }
      close();
    });
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



  update() {
    if (this.big.classList.contains('open') && (this.bigT -= 1 / 60) <= 0) { this.bigT = 0.5; this.drawBig(); }
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

  /** The full island map: what you know, where everyone is, every name. */
  private drawBig() {
    const G = this.game, g = G.group, d = g.disc, S = 384, k = S / N, cv = this.big.querySelector('canvas')!, m = cv.getContext('2d')!;
    const img = new ImageData(new Uint8ClampedArray(this.bigBase.data), S, S), ex = d.explored;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!ex[(y >> 1) * MAP + (x >> 1)]) { const o = (y * S + x) * 4; img.data[o] *= 0.5; img.data[o + 1] *= 0.5; img.data[o + 2] *= 0.55; }
    m.putImageData(img, 0, 0);
    for (const tr of g.scouting.trips) { m.fillStyle = '#ffd08a'; for (const q of tr.trail) m.fillRect(q.x * k - 0.5, q.z * k - 0.5, 1.5, 1.5); }
    for (const mk of d.markers) { m.strokeStyle = mk.kind === '!' ? '#ff5a4a' : '#ffd65a'; m.lineWidth = 2; m.setLineDash([3, 3]); m.beginPath(); m.arc(mk.x * k, mk.z * k, Math.max(5, mk.r * k), 0, 6.283); m.stroke(); m.setLineDash([]); }
    for (const p of d.pois) if (p.known) {
      const x = p.x * k, y = p.z * k;
      if (p.major) { m.fillStyle = '#000'; m.beginPath(); m.moveTo(x, y - 6); m.lineTo(x + 6, y); m.lineTo(x, y + 6); m.lineTo(x - 6, y); m.fill(); m.fillStyle = '#fff'; m.beginPath(); m.moveTo(x, y - 4); m.lineTo(x + 4, y); m.lineTo(x, y + 4); m.lineTo(x - 4, y); m.fill(); }
      else { m.fillStyle = '#000'; m.fillRect(x - 3, y - 3, 6, 6); m.fillStyle = p.kind === 'water' ? '#7fd8ff' : '#8af07a'; m.fillRect(x - 2, y - 2, 4, 4); }
    }
    for (const p of g.people) {
      if (p === g.leader || p.mode === 'asleep') continue;
      m.fillStyle = p.mode === 'scout' ? '#ffa040' : p.mode === 'lost' || p.mode === 'hurt' ? '#ff5a4a' : p.mode === 'camp' ? '#d8d8d8' : '#8af07a';
      m.fillRect(p.x * k - 1.5, p.z * k - 1.5, 3, 3);
    }
    const f = g.fire; m.fillStyle = '#000'; m.fillRect(f.x * k - 4, f.z * k - 4, 8, 8); m.fillStyle = '#ffdd55'; m.fillRect(f.x * k - 3, f.z * k - 3, 6, 6);
    const L = g.leader; if (L) { m.fillStyle = '#000'; m.fillRect(L.x * k - 4, L.z * k - 4, 8, 8); m.fillStyle = '#fff'; m.fillRect(L.x * k - 2, L.z * k - 2, 4, 4); }
    // names as text over the canvas
    const wrap = this.big.querySelector('.wrap') as HTMLElement;
    wrap.querySelectorAll('.ml').forEach(e => e.remove());
    const r = cv.getBoundingClientRect(), sc = r.width / N;
    const lab = (t: string, x: number, z: number, cls = '') => { const e = document.createElement('div'); e.className = 'ml ' + cls; e.textContent = t; e.style.left = `${x * sc}px`; e.style.top = `${z * sc}px`; wrap.appendChild(e); };
    for (const p of d.pois) if (p.known && p.major) { const t = d.display(p); lab(t.charAt(0).toUpperCase() + t.slice(1), p.x, p.z); }
    for (const mk of d.markers) lab(mk.kind === '!' ? mk.text : '? ' + mk.text, mk.x, mk.z, 'r');
    lab('Camp', f.x, f.z, 'c');
  }
}

/** The island as a picture, S×S pixels: biome colors, a little hill shading, rivers. */
export function mapImage(w: World, S: number) {
    const k = N / S, img = new ImageData(S, S);
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
function localStorageGet(k: string) { try { return localStorage.getItem('island.' + k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem('island.' + k, v); } catch { /* private mode */ } }
