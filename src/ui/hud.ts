import '@fontsource/press-start-2p';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/500.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { B, N, World } from '../world/island';
import type { Game } from '../game';
import type { WeatherKind } from '../sim/weather';
import type { Ambience } from '../audio/ambience';
import { U } from '../render/shared';
import { MAP } from '../life/discovery';
import { ZOOMS } from '../render/camera';
import { clearSave, stopSaving } from '../life/save';

const CSS = `
:root { --sl: rgba(32,35,33,.93); --sl2: #2f3331; --sl3: #3b3f3c; --ln: #4a4e4b; --ink: #ebe7de; --dim: #9a9c97; --gold: #c9a24a; --sea: #9fc3c9; --ok: #a8c98e; --bad: #e08a70;
  --hd: 'Oswald', sans-serif; --tx: 'Alegreya Sans', sans-serif; }
.hud { position: absolute; font-family: var(--tx); color: var(--ink); user-select: none; z-index: 5; }
.pill { background: var(--sl); border-radius: 3px; padding: 9px 14px; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 2px 10px #0005; }
.ti { font-size: 1.15em; vertical-align: -0.12em; }
#clock { top: 14px; left: 14px; font: 500 20px var(--hd); letter-spacing: 2px; border-left: 3px solid var(--gold); }
#clock .ic { color: var(--gold); font-size: 22px; }
#clock .tal { font: 400 14px var(--tx); color: var(--dim); letter-spacing: 0; }
#wx { top: 66px; left: 14px; font: 400 13px var(--hd); letter-spacing: 2px; color: var(--sea); }
#speed { top: 106px; left: 14px; display: flex; gap: 0; }
#speed button, .btn, #zoom button { font: 500 13px var(--hd); letter-spacing: 1.5px; color: var(--ink); background: var(--sl); border: 0; border-bottom: 2px solid transparent; border-radius: 2px; padding: 7px 11px; cursor: pointer; }
#speed button + button, #zoom button + button { border-left: 1px solid var(--ln); }
#speed button:hover, .btn:hover, #zoom button:hover { background: var(--sl3); }
#speed button.on, .btn.on { color: var(--gold); border-bottom-color: var(--gold); }
#mini { top: 14px; right: 14px; border-radius: 3px; background: #1c4672; box-shadow: 0 2px 10px #0006; cursor: pointer; overflow: hidden; line-height: 0; outline: 3px solid var(--sl); }
#mini canvas { image-rendering: pixelated; width: 210px; height: 210px; }
#rbtns { top: 236px; right: 14px; display: flex; gap: 6px; }
.page { position: absolute; z-index: 9; left: 50%; top: 50%; transform: translate(-50%, -50%); font-family: var(--tx); color: var(--ink); background: var(--sl); border-left: 3px solid var(--gold); border-radius: 3px; box-shadow: 0 6px 30px #0008; padding: 18px 22px; display: none; }
.page.open { display: block; animation: pgin .18s ease-out; }
@keyframes pgin { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
.page h4 { font: 500 15px var(--hd); letter-spacing: 2.5px; margin: 0 0 12px; color: var(--gold); }
.page .x { position: absolute; right: 16px; top: 14px; cursor: pointer; font-size: 18px; color: var(--dim); }
.page .x:hover { color: var(--ink); }
#help { width: min(780px, 94vw); max-height: 84vh; overflow-y: auto; font-size: 15px; line-height: 1.6; }
#help h5 { font: 500 13px var(--hd); letter-spacing: 2px; color: var(--gold); margin: 16px 0 6px; }
#help .row { display: flex; gap: 14px; padding: 3px 0; border-bottom: 1px solid #ffffff0d; } #help .row b { flex: none; width: 200px; font-weight: 500; color: var(--sea); }
#journal .wrap { position: relative; line-height: 0; }
#journal canvas { image-rendering: pixelated; width: min(74vh, 86vw); height: min(74vh, 86vw); border-radius: 2px; cursor: crosshair; }
#journal .ml { position: absolute; transform: translate(-50%, -130%); font: 500 13px var(--tx); color: #fff; text-shadow: 0 1px 2px #000, 0 0 4px #000; white-space: nowrap; pointer-events: none; line-height: 1; }
#journal .ml.r { color: var(--gold); font-size: 12px; } #journal .ml.c { color: #ffdd77; }
#journal .leg { font-size: 13px; color: var(--dim); margin-top: 10px; line-height: 1.6; }
#zoom { top: 106px; left: 196px; display: flex; gap: 0; align-items: center; }
#zoom .dots { font-size: 9px; letter-spacing: 3px; padding: 0 10px; color: var(--ink); text-shadow: 0 1px 3px #000; }
#panel { top: 282px; right: 14px; width: 270px; display: none; flex-direction: column; gap: 10px; font-size: 15px; line-height: 1.5; background: var(--sl); border-left: 3px solid var(--gold); border-radius: 3px; padding: 14px 16px; box-shadow: 0 2px 10px #0005; }
#panel.open { display: flex; }
#panel label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#panel input[type=text], #panel select { font: 14px var(--tx); background: var(--sl2); color: var(--ink); border: 1px solid var(--ln); border-radius: 2px; padding: 5px 7px; width: 120px; }
#panel input[type=checkbox] { accent-color: var(--gold); width: 16px; height: 16px; }
#hint { bottom: 12px; right: 14px; font: 400 12px var(--hd); letter-spacing: 1.5px; color: var(--dim); padding: 7px 12px; }
@media (max-width: 1180px) { #hint { display: none; } }
`;

const row = (a: string, b: string) => `<div class="row"><b>${a}</b><span>${b}</span></div>`;
const HELP = `
<h5>CONTROLS (MOUSE ONLY)</h5>
${row('Click the ground', 'Walk there. Leave camp and your crew follows; come back and they go back to work.')}
${row('ALONE / CREW / ALL', 'Who comes when you leave camp. CREW is your picks, filled out by the camp in turns.')}
${row('Click a survivor', 'Their card: bring them next trip, send them scouting, find them.')}
${row('Click a build site', 'Pitch in yourself. Everyone works faster with you there.')}
${row('Click a message', 'Go to whoever it is about. CAMP takes you home.')}
${row('Click yourself', 'Your group waits here. Click again to call them.')}
${row('Right-click', 'Whistle: everyone with you comes running.')}
${row('Stand still', 'Your crew gets to work: fishing, gathering, patching people up. They carry it home.')}
${row('Drag', 'Look around. The camera follows you again when you walk.')}
${row('Scroll  or  − / +', 'Zoom in and out.')}
${row('Q / E', 'Turn the view.')}
${row('II  1x  2x  4x', 'Pause and game speed (Space pauses too).')}
<h5>WHAT THE MARKS MEAN</h5>
${row('<i class="ti ti-alert-circle" style="color:var(--gold)"></i> over someone', 'They want to talk. Click them to answer, or ignore them and they decide alone.')}
${row('<span style="color:#ffd65a">?</span> in a yellow ring', 'A rumor. Walk into the ring to see if it is true. Some people lie.')}
${row('<span style="color:#ff5a4a">!</span> in a red ring', 'Someone is lost or hurt out there. Go and find them.')}
${row('Dotted trail', "A scout's path. Click it to follow them with the camera.")}
${row('Faces', '<i class="ti ti-mood-smile"></i> happy · <i class="ti ti-mood-angry"></i> angry · <i class="ti ti-mood-confuzed"></i> worried · <i class="ti ti-mood-sad"></i> sad or hungry · <i class="ti ti-mood-nervous"></i> scared · <i class="ti ti-zzz"></i> tired · <i class="ti ti-heart"></i> fond · <i class="ti ti-bandage"></i> hurt')}
<h5>HOW THE DAY WORKS</h5>
${row('Morning', 'Three people suggest a plan. Pick one; the camp works on it all day. Time slows while you choose.')}
${row('Daytime', 'People gather food and water on their own, and come to you with ideas. Some ideas are bad: watch how they ask.')}
${row('Evening', 'Everyone eats from the pile by the fire. Not enough food = hungry, unhappy people.')}
${row('Night', 'Everyone sits at the fire and talks. Secrets slip out. Out in the dark, your group gets nervous.')}
<h5>WORDS</h5>
${row('Trust', 'Loyal › Trusts you › Unsure › Doubts you › Against you')}
${row('Food / water', 'Plenty › Enough › Low › Out')}
${row('GOALS box', 'What to do next. Click a goal with the target mark to look there.')}
`;

const BIOME_RGB: Record<number, number[]> = {
  [B.Ocean]: [28, 82, 145], [B.Beach]: [236, 216, 160], [B.Grass]: [108, 182, 84], [B.Jungle]: [44, 110, 52], [B.Highland]: [150, 150, 112], [B.Volcanic]: [110, 100, 94],
  [B.Swamp]: [70, 96, 64], [B.Bamboo]: [128, 178, 74], [B.Flowers]: [196, 172, 112], [B.TideRock]: [118, 118, 114], [B.Dirt]: [164, 136, 88], [B.Reef]: [96, 210, 200], [B.Lagoon]: [92, 206, 204], [B.Lake]: [70, 150, 220],
};

export class Hud {
  private clockEl: HTMLElement; private wxEl: HTMLElement; private zoomEl: HTMLElement;
  private help: HTMLElement;
  private mini: HTMLCanvasElement; private miniBase: ImageData; private miniDim: ImageData; private dimVer = -1; private dimT = 0;
  constructor(private game: Game, audio: Ambience) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild as HTMLElement; document.body.appendChild(e); return e; };
    this.clockEl = el('<div id="clock" class="hud pill"><i class="ic ti ti-sun"></i><span class="t">DAY 1 · 06:00</span></div>');
    this.wxEl = el('<div id="wx" class="hud pill">CLEAR</div>');
    const speed = el('<div id="speed" class="hud"><button data-s="0">II</button><button data-s="1" class="on">1x</button><button data-s="2">2x</button><button data-s="4">4x</button></div>');
    speed.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      game.clock.speed = Number(b.dataset.s); speed.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    addEventListener('keydown', e => { if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); (speed.querySelector(game.clock.speed ? '[data-s="0"]' : '[data-s="1"]') as HTMLButtonElement).click(); } });

    // zoom: one click per level, so the middle view is always easy to get back to
    this.zoomEl = el('<div id="zoom" class="hud"><button data-z="-1"><i class="ti ti-minus"></i></button><span class="dots"></span><button data-z="1"><i class="ti ti-plus"></i></button><button data-home title="Look at camp" style="margin-left:6px"><i class="ti ti-home"></i></button></div>');
    this.zoomEl.querySelectorAll('button[data-z]').forEach(b => b.addEventListener('click', () => game.rig.setZoom(game.rig.zoomI + Number((b as HTMLElement).dataset.z))));
    (this.zoomEl.querySelector('[data-home]') as HTMLElement).onclick = () => { game.rig.jumpTo(game.group.fire.x, game.group.fire.z); game.rig.followOn = false; game.camWho = null; };

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

    const rb = el('<div id="rbtns" class="hud"><button class="btn" data-b="help"><i class="ti ti-help"></i> HELP</button><button id="gear" class="btn"><i class="ti ti-settings"></i> SETTINGS</button></div>');
    const gear = rb.querySelector('#gear') as HTMLElement;
    this.help = el(`<div id="help" class="page"><div class="x"><i class="ti ti-x"></i></div><h4>HOW TO PLAY</h4>${HELP}</div>`);
    const close = () => { this.help.classList.remove('open'); };
    (this.help.querySelector('.x') as HTMLElement).onclick = close;
    rb.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
      const pg = this.help, o = !pg.classList.contains('open');
      close(); if (o) pg.classList.add('open');
    }));
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const panel = el(`<div id="panel" class="hud">
      <label>Outlines <input id="o-filter" type="checkbox"></label>
      <label>Texture grain <select id="o-grain"><option value="0">Smooth</option><option value="0.35">Soft</option><option value="0.65">Medium</option><option value="1">Classic</option></select></label>
      <label>Sound <input id="o-sound" type="checkbox" checked></label>
      <label>Weather <select id="o-wx"><option value="auto">Auto</option><option>clear</option><option>cloudy</option><option>rain</option><option>storm</option></select></label>
      <label>Seed <input id="o-seed" type="text" value="${game.world.seed}"></label>
      <button class="btn" id="o-again">NEW GAME (SAME ISLAND)</button>
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
    panel.querySelector('#o-again')!.addEventListener('click', () => { if (confirm('Start this island over? Your saved game on it will be lost.')) { stopSaving(); clearSave(game.world.seed); go(game.world.seed); } });
    panel.querySelector('#o-rand')!.addEventListener('click', () => go((Math.random() * 1e9) | 0));
    el('<div id="hint" class="hud pill">CLICK: GO &nbsp;·&nbsp; RIGHT-CLICK: WHISTLE &nbsp;·&nbsp; DRAG: LOOK &nbsp;·&nbsp; SCROLL: ZOOM &nbsp;·&nbsp; Q/E: TURN</div>');
    document.querySelectorAll('.hud').forEach(e => e.addEventListener('pointerdown', (ev: Event) => ev.stopPropagation()));
  }



  update() {
    const g = this.game, c = g.clock, wx = g.weather;
    const night = c.night > 0.5, h = c.hour;
    const dots = ZOOMS.map((_, i) => i === g.rig.zoomI ? '●' : '○').join('');
    const de = this.zoomEl.querySelector('.dots') as HTMLElement; if (de.textContent !== dots) de.textContent = dots;
    const ic = this.clockEl.querySelector('.ic') as HTMLElement, icn = `ic ti ti-${night ? 'moon' : h < 7 || h > 18 ? 'sunset-2' : 'sun'}`; if (ic.className !== icn) ic.className = icn;
    const tally = ('||||| '.repeat(Math.floor(c.day / 5)) + '|'.repeat(c.day % 5)).trim();
    (this.clockEl.querySelector('.t') as HTMLElement).innerHTML = `DAY ${c.day} <span class="tal">${tally}</span> · ${c.label}`;
    const label = wx.storm > 0.6 ? '<i class="ti ti-cloud-storm"></i> STORM' : wx.rain > 0.3 ? '<i class="ti ti-cloud-rain"></i> RAIN' : wx.cloud > 0.5 ? '<i class="ti ti-cloud"></i> CLOUDY' : night ? '<i class="ti ti-moon-stars"></i> CLEAR NIGHT' : '<i class="ti ti-sun"></i> CLEAR';
    if (this.wxEl.innerHTML !== label) this.wxEl.innerHTML = label;
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
      m.fillStyle = p.kind === 'water' ? '#7fd8ff' : p.kind === 'food' ? '#8af07a' : p.kind === 'material' ? '#d8a060' : '#ffffff';
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
