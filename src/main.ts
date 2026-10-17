import { Game } from './game';
import { generate } from './world/island';
import { Ambience } from './audio/ambience';
import { Hud } from './ui/hud';
import { ZOOMS } from './render/camera';
import { Input } from './ui/input';
import { Social } from './ui/social';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);
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
  const g = game.group;
  g.onWhistle = () => audio.whistle();
  g.onAlarm = () => audio.alarm();
  g.onChime = (big) => audio.chime(big);
  g.story.onSay = (p) => { const t = game.rig.target; if (Math.hypot(p.x - t.x, p.z - t.z) < game.viewR) audio.blip(p.per.voice); };
  game.every((dt) => {
    const t = game.rig.target, wx = game.weather;
    audio.update(dt, t.x, t.z, game.viewR, game.clock.hour, game.clock.night, wx.rain, wx.wind, 1 - game.rig.zoomI / (ZOOMS.length - 1));
    hud.update();
    social.update(dt);
    const L = g.leader, f = g.fire;
    audio.life(Math.hypot(f.x - t.x, f.z - t.z), game.clock.night > 0.5 && !!L, !!L && L.moving);
  });
  (window as unknown as { game: Game }).game = game;
  loading.remove();
}, 30));
