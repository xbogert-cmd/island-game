import { Game } from './game';
import { generate } from './world/island';
import { Ambience } from './audio/ambience';
import { Hud } from './ui/hud';
import { ZOOMS } from './render/camera';

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
  game.every((dt) => {
    const t = game.rig.target, wx = game.weather;
    audio.update(dt, t.x, t.z, game.viewR, game.clock.hour, game.clock.night, wx.rain, wx.wind, 1 - game.rig.zoomI / (ZOOMS.length - 1));
    hud.update();
  });
  (window as unknown as { game: Game }).game = game;
  loading.remove();
}, 30));
