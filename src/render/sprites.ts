import * as THREE from 'three';
import { PX, U } from './shared';
import { BUILD_ART } from './buildart';

/**
 * Pixel sprites drawn as camera-facing (or ground-flat) quads in one instanced draw call.
 * Each quad is snapped to the screen-pixel grid so 1 sprite pixel = 1 screen pixel.
 */
export class SpriteBatch {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private a: { pos: Float32Array; rect: Float32Array; size: Float32Array; flags: Float32Array; tint: Float32Array };
  n = 0;

  constructor(public map: THREE.Texture, public max = 4000) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = { pos: new Float32Array(max * 3), rect: new Float32Array(max * 4), size: new Float32Array(max * 2), flags: new Float32Array(max * 2), tint: new Float32Array(max * 4) };
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.a.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iRect', new THREE.InstancedBufferAttribute(this.a.rect, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.a.size, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iFlags', new THREE.InstancedBufferAttribute(this.a.flags, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iTint', new THREE.InstancedBufferAttribute(this.a.tint, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    const img = map.image as { width: number; height: number };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uMap: { value: map }, uAtlas: { value: new THREE.Vector2(img.width, img.height) }, uPXs: { value: PX } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iRect; attribute vec2 iSize; attribute vec2 iFlags; attribute vec4 iTint;
        uniform vec2 uAtlas; uniform float uPXs; uniform vec3 uCamRight;
        varying vec2 vUv; varying vec4 vTint;
        void main(){
          vec2 c = position.xy;
          float ox = c.x * iSize.x - floor(iSize.x * 0.5), oy = c.y * iSize.y;
          vec4 mv;
          if (iFlags.y > 0.5) {               // lying flat on the ground/water
            vec3 fwd = normalize(cross(vec3(0.0, 1.0, 0.0), uCamRight));
            vec3 wp = iPos + uCamRight * ox * uPXs + fwd * (oy - floor(iSize.y * 0.5)) * uPXs;
            mv = viewMatrix * vec4(wp, 1.0);
          } else {
            mv = viewMatrix * vec4(iPos, 1.0);
            mv.xy = floor(mv.xy / uPXs + 0.5) * uPXs;
            mv.xy += vec2(ox, oy) * uPXs;
          }
          #ifdef SIL
            mv.z += 1.5;                       // only real cover (trees, hills) counts, not the ground at their feet
          #endif
          gl_Position = projectionMatrix * mv;
          float u = iFlags.x > 0.5 ? 1.0 - c.x : c.x;
          vUv = vec2((iRect.x + u * iRect.z) / uAtlas.x, 1.0 - (iRect.y + (1.0 - c.y) * iRect.w) / uAtlas.y);
          vTint = iTint;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uAmbient;
        varying vec2 vUv; varying vec4 vTint;
        float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
        void main(){
          vec4 c = texture2D(uMap, vUv);
          if (c.a < 0.5) discard;
          #ifdef SIL
            if (b4(gl_FragCoord.xy) >= 0.5) discard;
            gl_FragColor = vec4(vec3(0.98, 0.92, 0.72) * (0.55 + 0.45 * uAmbient), 1.0);
            return;
          #endif
          vec3 col = c.rgb * vTint.rgb;
          if (vTint.a <= 1.0) {                 // lit sprite, alpha via ordered dither
            if (b4(gl_FragCoord.xy) >= vTint.a) discard;
            col *= uAmbient;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  /** A see-through silhouette pass: shows these sprites where something (trees, hills) hides them. */
  silhouette() {
    const src = this.mesh.material as THREE.ShaderMaterial, m = src.clone();
    m.uniforms = src.uniforms;             // share live uniforms (clone() would copy the texture and freeze them)
    m.defines = { SIL: 1 }; m.depthFunc = THREE.GreaterDepth; m.depthWrite = false;
    const mesh = new THREE.Mesh(this.geo, m); mesh.frustumCulled = false;
    mesh.renderOrder = 5; this.mesh.renderOrder = 6;    // silhouettes first, so the sprites themselves win where they overlap
    return mesh;
  }

  begin() { this.n = 0; }
  /** tint alpha: 0..1 = lit + dithered alpha; 2 = emissive (ignores day/night). */
  push(x: number, y: number, z: number, r: Rect, flip = false, tr = 1, tg = 1, tb = 1, ta = 1, flat = false) {
    if (this.n >= this.max) return;
    const i = this.n++, a = this.a;
    a.pos[i * 3] = x; a.pos[i * 3 + 1] = y; a.pos[i * 3 + 2] = z;
    a.rect[i * 4] = r.x; a.rect[i * 4 + 1] = r.y; a.rect[i * 4 + 2] = r.w; a.rect[i * 4 + 3] = r.h;
    a.size[i * 2] = r.w; a.size[i * 2 + 1] = r.h;
    a.flags[i * 2] = flip ? 1 : 0; a.flags[i * 2 + 1] = flat ? 1 : 0;
    a.tint[i * 4] = tr; a.tint[i * 4 + 1] = tg; a.tint[i * 4 + 2] = tb; a.tint[i * 4 + 3] = ta;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const k of ['iPos', 'iRect', 'iSize', 'iFlags', 'iTint']) (this.geo.attributes[k] as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

// ---------- ASCII pixel art -> atlas ----------
const PAL: Record<string, string> = {
  r: '#d8433a', R: '#f27a5a', l: '#8a2a24', w: '#f4f4f0', W: '#c8ccd4', g: '#8a8f98', G: '#5a6068', o: '#f2a03a', y: '#f2d44a',
  b: '#3a6fd0', B: '#24489a', n: '#6a4a2e', N: '#4a321e', t: '#c8a070', f: '#e0b890', e: '#1a1420', s: '#2a3a48', S: '#cfd8e0',
  v: '#5aa84a', V: '#2f6e33', c: '#3a8a7a', C: '#2a5a5a', d: '#5a6a80', D: '#3a4a5c', k: '#1c1626', p: '#e86aa0', u: '#7a5aa8',
  a: '#8a6a4a', h: '#b8784a', x: '#ffffff', z: '#fff6a0', m: '#5a3a28', M: '#7a5236', q: '#9a9a94',
};

/** Every pixel k times as big, for things that should read from far away. */
const big = (rows: string[], k: number) => rows.flatMap(r => Array(k).fill(r.split('').map(c => c.repeat(k)).join('')) as string[]);

const DEFS: Record<string, { frames: string[][]; outline?: boolean }> = {
  crab: { frames: [['r.r.r.r', '.rrRrr.', 'rrrrrrr', '.l.l.l.'], ['r.r.r.r', '.rrRrr.', 'rrrrrrr', 'l.l.l.l']] },
  dog: { frames: [['..........N...', '.........Nnnn.', 'N........nnnek', '.N.......nnnn.', '..nnnnnnnnnn..', '.nnnnnnnnnnn..', '..nnnnnnnnn...', '..n.n....n.n..', '..n.n....n.n..'], ['..........N...', '.N.......Nnnn.', '..N......nnnek', '..N......nnnn.', '..nnnnnnnnnn..', '.nnnnnnnnnnn..', '..nnnnnnnnn...', '.n...n..n...n.', 'n....n..n....n']] },
  dogSit: { frames: [['.......N...', '......Nnnn.', '......nnnek', 'N.....nnnn.', '.N...nnnnn.', '..nnnnnnnn.', '..nnnnnnnn.', '.nnnnnnnn..', 'nn.n..nnn..']] },
  goat: { frames: [['.........GG..', '.........wwG.', '........wwwew', '.W......wwww.', '.wwwwwwwwwW..', 'wwwwwwwwwwW..', '.wwwwwwwwww..', '..N.N...N.N..', '..N.N...N.N..', '..N.N...N.N..'], ['.........GG..', '.........wwG.', '........wwwew', '.W......wwww.', '.wwwwwwwwwW..', 'wwwwwwwwwwW..', '.wwwwwwwwww..', '.N..N..N...N.', '.N...N.N...N.', 'N....N.N....N']] },
  chicken: { frames: [['...r.', '..wwo', 'wwww.', '.www.', '..y..'], ['...r.', '..wwo', 'wwww.', '.www.', '.y.y.']] },
  pet: { frames: [['.vv..', '.vey.', 'vvr..', 'vrr..', '.r...', '.r...'], ['.vv..', '.vey.', 'vvr..', 'vVr..', '.V...', '.r...']] },
  gullFly: { frames: [['ww.....ww', '.ww...ww.', '..wwwwwo.', '....W....'], ['.........', '..wwwwwo.', '.ww...ww.', 'ww.....ww']] },
  gullSit: { frames: [['..ww.', '.wwwo', 'Wwww.', '.ww..', '.o.o.']] },
  turtle: { frames: [['....vvvvv.....', '..vvVvvvVvv...', '.vVvvvVvvvVvtt', 'tvvvvvvvvvvvte', '.tt.......tt..'], ['....vvvvv.....', '..vvVvvvVvv...', '.vVvvvVvvvVvtt', 'tvvvvvvvvvvvte', 'tt.........tt.']] },
  fishShadow: { frames: [['sssss.s', '.sssss.', 'sssss.s']], outline: false },
  fishJump: { frames: [['.SS..', 'SSSSs', '.SS..']] },
  dolphin: { frames: [['......d....', '...dddd....', '.dddddddd..', 'dSSSSddddd.', '........dd.'], ['....dd.....', '..ddddd....', 'ddddddddd..', '.dSSSSdddd.', '.........dd']] },
  whale: { frames: [[
    '.......DDD..........', '....DDDDDDDD........', '..DDDDDDDDDDDD......', '.DDDDDDDDDDDDDDD....', 'DDeDDDDDDDDDDDDDD...',
    'DSSSSSSSDDDDDDDDDD..', '.SSSSSSSSSDDDDDDDDD.', '...SSSSSSSSSDDDDDDDD', '..............DD.DD.']] },
  parrot: { frames: [['.y...y.', '.rr.rr.', '..rrrbo', '...rb..', '...b...'], ['.......', '..rrrbo', '.rr.rr.', 'y..rb.y', '...b...']] },
  bird: { frames: [['n...n', '.nnn.', '..n..'], ['.....', 'nnnnn', '..n..']] },
  monkey: { frames: [['...mmm...', '..mmmmm..', '..mefem..', '..mfffm..', '...mmm...', '.mmmmmmm.', 'm.mMMMm.m', 'm.mMMMm.m', '..mmmmm..', '..m...m.m', '.mm...mm.'], ['...mmm...', 'm.mmmmm.m', 'm.mefem.m', '.mmfffmm.', '...mmm...', '..mmmmm..', '..mMMMm..', '..mMMMm..', '..mmmmm.m', '.m.....m.', 'm.......m']] },
  frog: { frames: [['.e.e.', 'vvvvv', 'vVVVv', 'v...v'], ['.e.e.', 'vvvvv', 'VVVVV', '.v.v.']] },
  boar: { frames: [['.......NNNN.....', '....NnnnnnnNN...', '..NNNNNNNNNNNNN.', 'nNNNNNNNNNNNNeNN', '.NNNNNNNNNNNNNNn', '.NNNNNNNNNNNNNwn', '..NNNNNNNNNN.N..', '..N.N....N.N....', '..N.N....N.N....'], ['.......NNNN.....', '....NnnnnnnNN...', '..NNNNNNNNNNNNN.', 'nNNNNNNNNNNNNeNN', '.NNNNNNNNNNNNNNn', '.NNNNNNNNNNNNNwn', '..NNNNNNNNNN.N..', '..N..N...N..N...', '.N....N.N....N..']] },
  deer: { frames: [['...........a..a.', '...........aaaa.', '............aa..', '............hhh.', '...........hhehh', '...........hhh..', '..........hhh...', '.hhhhhhhhhhhh...', 'whhhhhhhhhhhh...', '.hhhhhhhhhhhh...', '..ffffffffff....', '..h.h.....h.h...', '..h.h.....h.h...', '..h.h.....h.h...', '..N.N.....N.N...'], ['...........a..a.', '...........aaaa.', '............aa..', '............hhh.', '...........hhehh', '...........hhh..', '..........hhh...', '.hhhhhhhhhhhh...', 'whhhhhhhhhhhh...', '.hhhhhhhhhhhh...', '..ffffffffff....', '..h..h...h...h..', '.h...h...h....h.', '.h....h.h.....h.', '.N....N.N.....N.'], ['................', '................', '................', '................', '................', '................', '................', '.hhhhhhhhhhh....', 'whhhhhhhhhhhh...', '.hhhhhhhhhhhhh..', '..ffffffffff.hh.', '..h.h.....h.h.hh', '..h.h.....h.h.hh', '..h.h.....h.h..e', '..N.N.....N.N...']] },
  piglet: { frames: [['..nnnn..', '.ntntntn', 'ntntntne', '.nnnnnnn', '.n.n.n.n'], ['..nnnn..', '.ntntntn', 'ntntntne', '.nnnnnnn', 'n.n...n.']] },
  spear: { frames: [['.........W', 'nnnnnnnnWW', '.........W']] },
  climb: { frames: [['..y..', '.yyy.', 'y.y.y', '..y..', '..y..']] },
  trophyDeer: { frames: [['a.a...a.a', 'aa.a.a.aa', '.aa...aa.', '..aa.aa..', '...hhh...', '...heh...', '...hhh...', '....h....', '....n....', '....n....', '....n....', '....n....', '...nnn...']] },
  trophyBoar: { frames: [['..NNNNN..', '.NNNNNNN.', '.NeNNNeN.', '.NNNNNNN.', 'w.NnnnN.w', '.wNnnnNw.', '...NNN...', '....n....', '....n....', '....n....', '....n....', '....n....', '...nnn...']] },
  butterfly: { frames: [['xx.xx', 'xxkxx', '.x.x.'], ['.xkx.', '.xkx.', '..k..']] },
  dragonfly: { frames: [['WW.WW..', '.cccccc'], ['.W.W...', '.cccccc']] },
  bat: { frames: [['k.....k', 'kk.k.kk', '..kkk..'], ['.......', '.kkkkk.', 'k.kkk.k']], outline: false },
  owl: { frames: [['a...a', 'aaaaa', 'ayaya', 'aaaaa', 'atata', '.a.a.']] },
  firefly: { frames: [['z'], ['y']], outline: false },
  dot1: { frames: [['x']], outline: false },
  dot2: { frames: [['xx', 'xx']], outline: false },
  puff: { frames: [['.xx.', 'xxxx', 'xxxx', '.xx.']], outline: false },
  puff6: { frames: [['..xx..', '.xxxx.', 'xxxxxx', 'xxxxxx', '.xxxx.', '..xx..']], outline: false },
  drop: { frames: [['x', 'x', 'x']], outline: false },
  splash: { frames: [['x.x', '.x.']], outline: false },
  leaf: { frames: [['xx']], outline: false },
  ring: { frames: [['....xxxxxx....', '..xx......xx..', 'xx..........xx', '..xx......xx..', '....xxxxxx....']], outline: false },
  // people: torch flame, mood icons, markers
  flame: { frames: [['.y.', 'yzy', 'oyo', '.o.'], ['y..', 'yzy', 'oyo', '.o.'], ['..y', 'yzy', 'oyo', '.o.']], outline: false },
  mHappy: { frames: [['.yyy.', 'yeyey', 'yyyyy', 'yeeey', '.yyy.']] },
  mAngry: { frames: [['r.r.r', '.rrr.', 'rr.rr', '.rrr.', 'r.r.r']] },
  mWorry: { frames: [['..b..', '.bbb.', 'bbbbb', 'bxbbb', '.bbb.']] },
  mSad: { frames: [['bb.bb', '.....', '.eee.', 'e...e', 'b....']] },
  mScared: { frames: [['w.w.w', 'w.w.w', 'w.w.w', '.....', 'w.w.w']] },
  mSleep: { frames: [['wwww.', '..w..', '.w...', 'wwww.'], ['.....', 'wwww.', '..w..', 'wwww.']] },
  mFond: { frames: [['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..']] },
  mPain: { frames: [['.r.', 'rrr', '.r.']] },
  mSick: { frames: [['.vvv.', 'vevev', 'vvvvv', 'vVVVv', '.vvv.']] },
  pMeat: { frames: [['.RR.', 'RlRl', '.wR.']] },
  snares: { frames: [['..n..', '.n.n.', 'n.a.n', '.aaa.']] },
  smokeRack: { frames: [['nnnnnnnnnnnn', 'n.lR.lR.lR.n', 'n.lR.lR.lR.n', 'n..........n', 'n...WWW....n', 'n..WoyoW...n']] },
  hideRack: { frames: [['nnnnnnnnnn', 'n.hhhhhh.n', 'n.hahhah.n', 'n.hhhhhh.n', 'n.hhhhhh.n', 'n........n', 'n........n']] },
  grave: { frames: [['..w..', '.www.', '..w..', '..w..', 'nnnnn', 'NnnnN']] },
  cat: { frames: [
    ['.............e..e.', '.............eeee.', 'ee...eeeeeeeeeyeye', '.eeeeeeeeeeeeeeee.', '..eeeeeeeeeeeeee..', '..eeeeeeeeeeeee...', '..e.e.......e.e...', '..e..e.....e...e..'],
    ['.............e..e.', '.............eeee.', 'ee...eeeeeeeeeyeye', '.eeeeeeeeeeeeeeee.', '..eeeeeeeeeeeeee..', '..eeeeeeeeeeeee...', '...ee.......ee....', '...e.e.....e.e....']] },
  eyes: { frames: [['y.y']], outline: false },
  paw: { frames: [['e.e', '.e.']], outline: false },
  flag: { frames: [['nxxx', 'nxxx', 'n...', 'n...'], ['nxx.', 'nxxx', 'n...', 'n...']] },
  catHide: { frames: [['n.........n', 'nNNeeeeeNNn', 'n.eeyeyee.n', 'n..eeeee..n', 'n...eee...n', 'n.........n']] },
  pathTile: { frames: [Array.from({ length: 16 }, (_, j) => Array.from({ length: 16 }, (_, i) => ((i * 7 + j * 13) % 5 < 2 && Math.hypot(i - 7.5, j - 7.5) < 8) ? 'h' : '.').join(''))], outline: false },
  qMark: { frames: [['.yyy.', 'yy.yy', '...yy', '..yy.', '..yy.', '.....', '..yy.']] },
  xMark: { frames: [['rr', 'rr', 'rr', 'rr', 'rr', '..', 'rr']] },
  // food spots and clues
  fruitBush: { frames: [['..vvVv..', '.vrvvvr.', 'vvvVvvvv', 'vrvvvrvV', '.vvVvvv.', '...nn...']] },
  coconuts: { frames: [['.nn.nn.', 'nNnnnNn', '.nnNnn.']] },
  shells: { frames: [['p.x..R', 'pp.xxR', '..x...']] },
  suitcase: { frames: [['..aa..', 'hhhhhh', 'hahhah', 'hhhhhh', 'hahhah']] },
  seat: { frames: [['bb...', 'bb...', 'bb...', 'bbbbb', 'g...g']] },
  // the camp stockpile
  pFruit: { frames: [['.v.', 'rRr', '.r.']] },
  pCoco: { frames: [['.nn.', 'nNnn', '.nn.']] },
  pShell: { frames: [['.pp.', 'pxxp']] },
  pFish: { frames: [['.SSS.S', 'SeSSSS', '.SSS.S']] },
  pJug: { frames: [['.g.', 'bSb', 'bbb', 'bbb']] },
  pSnack: { frames: [['WbW', 'bwb', 'WbW']] },
  askMark: { frames: [
    ['.yyyyy.', 'yyzzzyy', 'yyzzzyy', 'yyzzzyy', '.yzzzy.', '..yzy..', '.......', '..yyy..', '..yzy..', '..yyy..'],
    ['.ooooo.', 'oozzzoo', 'oozzzoo', 'oozzzoo', '.ozzzo.', '..ozo..', '.......', '..ooo..', '..ozo..', '..ooo..']] },
  // things people build
  // material heaps and where they come from
  hLog: { frames: [['tnnnnt', 'tnnnnt']] },
  hBamboo: { frames: [['vVvVvVv', 'vVvVvVv']] },
  hStone: { frames: [['.qq.', 'qqWq', 'Gqqq']] },
  hVine: { frames: [['.VvV.', 'VvVvV', '.VvV.']] },
  hScrap: { frames: [['WWgW', 'gWWG']] },
  srcWood: { frames: [['.nnnn.', 'tttttt', '.nnnn.', '.nNNn.']] },
  srcStone: { frames: [['..qq...', '.qWqq..', 'qqqGqq.', 'qGqqqqq']] },
  srcBamboo: { frames: [['v.v.v', 'vVvVv', 'vVvVv', 'vVvVv', 'VvVvV']] },
  srcVines: { frames: [['V.v.V', 'vVvVv', '.vVv.', 'V.v.V']] },
  signalFire: { frames: [['.....n.....', '....nNn....', '...nN.Nn...', '..nN...Nn..', '.nN.....Nn.', 'nNnnnnnnnNn']] },
  dryingRack: { frames: [['nnnnnnnnnn', 'n.S..S..Sn', 'n.S..S..Sn', 'n.e..e..en', 'n........n', 'n........n']] },
  rainCatcher: { frames: [['n.......n', 'bbbbbbbbb', '.bBBBBBb.', '..bBcBb..', 'n..bbb..n', 'n...g...n', 'n..ggg..n']] },
  lookout: { frames: [['nrrr.', 'nrRrr', 'nrr..', 'n....', 'n....', 'n....', 'n....', 'n....', 'n....', 'n....', 'nn...'], ['nrr..', 'nrRr.', 'nrrrr', 'n....', 'n....', 'n....', 'n....', 'n....', 'n....', 'n....', 'nn...']] },
  sos: { frames: [big(['qqq.qqq.qqq', 'q...q.q.q..', 'qqq.q.q.qqq', '..q.q.q...q', 'qqq.qqq.qqq'], 3)] },
  ...BUILD_ART,
};

export type SpriteName = keyof typeof DEFS;
export const ATLAS: Record<string, Rect[]> = {};

export function buildAtlas() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  let x = 1, y = 1, rowH = 0;
  for (const [name, def] of Object.entries(DEFS)) {
    ATLAS[name] = [];
    for (const f of def.frames) {
      const pad = def.outline === false ? 0 : 1;
      const w = f[0].length + pad * 2, h = f.length + pad * 2;
      if (x + w > c.width - 1) { x = 1; y += rowH + 1; rowH = 0; }
      const filled = (i: number, j: number) => j >= 0 && j < f.length && i >= 0 && i < f[0].length && f[j][i] !== '.';
      for (let j = -pad; j < f.length + pad; j++) for (let i = -pad; i < f[0].length + pad; i++) {
        if (filled(i, j)) { g.fillStyle = PAL[f[j][i]] ?? '#ff00ff'; g.fillRect(x + pad + i, y + pad + j, 1, 1); }
        else if (pad && (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1))) { g.fillStyle = PAL.k; g.fillRect(x + pad + i, y + pad + j, 1, 1); }
      }
      ATLAS[name].push({ x, y, w, h });
      x += w + 1; rowH = Math.max(rowH, h);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
