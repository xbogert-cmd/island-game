import { Game } from './game';
import { generate } from './world/island';
import { Ambience } from './audio/ambience';
import { Hud } from './ui/hud';
import { ZOOMS } from './render/camera';
import { Input } from './ui/input';
import { Social } from './ui/social';
import { Action } from './ui/action';
import { LAST, autosave } from './life/save';

const params = new URLSearchParams(location.search);
// the island you were last on, unless the link asks for another
const lastSeed = (() => { try { return Number(localStorage.getItem(LAST)) || 0; } catch { return 0; } })();
const seed = Number(params.get('seed')) || lastSeed || ((Math.random() * 1e9) | 0);
const loading = document.getElementById('loading')!;
addEventListener('error', (e) => { loading.textContent = 'Error: ' + e.message; console.error(e.error); });

requestAnimationFrame(() => setTimeout(() => {
  const world = generate(seed);
  const game = new Game(world, document.getElementById('c') as HTMLCanvasElement);
  const audio = new Ambience(world);
  const hud = new Hud(game, audio);
  game.fx.onThunder = (d) => audio.thunder(d);
  const input = new Input(game, game.canvas);
  const social = new Social(game, input);
  new Action(game, input);
  const g = game.group;
  g.onWhistle = () => audio.whistle();
  g.onAlarm = () => audio.alarm();
  g.onQuake = (k) => { game.rig.shake = k; audio.alarm(); };
  g.onChime = (big) => audio.chime(big);
  g.onAsk = () => audio.attention();
  g.onSting = (good) => audio.sting(good);
  g.onClunk = () => { const t = game.rig.target, P = g.stock.pile; if (Math.hypot(P.x - t.x, P.z - t.z) < game.viewR * 0.6) audio.clunk(); };
  g.story.onSay = (p) => { const t = game.rig.target; if (Math.hypot(p.x - t.x, p.z - t.z) < game.viewR) audio.blip(p.per.voice); };
  game.every((dt) => {
    const t = game.rig.target, wx = game.weather;
    audio.update(dt, t.x, t.z, game.viewR, game.clock.hour, game.clock.night, wx.rain, wx.wind, 1 - game.rig.zoomI / (ZOOMS.length - 1));
    hud.update();
    social.update(dt);
    const L = g.leader, f = g.fire;
    audio.life(Math.hypot(f.x - t.x, f.z - t.z), game.clock.night > 0.5 && !!L, !!L && L.moving);
  });
  autosave(game);
  (window as unknown as { game: Game }).game = game;
  loading.remove();
}, 30));
