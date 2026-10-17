import * as THREE from 'three';
import { N, World } from '../world/island';
import { GLSL_COMMON, U } from './shared';

const VERT = /* glsl */ `
uniform float uLevelOffset; uniform float uTideOn;
varying vec3 vWorld; varying vec2 vUv; varying vec3 vN;
${'' /* tide raises/lowers the sea */}
uniform float uTide;
void main(){
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  p.y += uTide * uTideOn;
  vWorld = p; vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

/** Still water (sea, crater lake, hot springs): colour by depth over the terrain, pixel foam and wave dashes. */
const FRAG_STILL = /* glsl */ `
${GLSL_COMMON}
uniform float uTideOn; uniform vec3 uTint; uniform float uSpring;
varying vec3 vWorld; varying vec2 vUv; varying vec3 vN;
void main(){
  vec3 P = vWorld; vec2 pc = pixCoord(P);
  float r = h21(pc), r2 = h21(pc + 13.7);
  float th = terrainH(P.xz);
  float d = P.y - th + (r - 0.5) * 0.08 * uGrain;
  vec4 bd = texture2D(uBiome, (P.xz + 0.5) / uN);
  float bio = floor(bd.r * 255.0 + 0.5);
  vec3 c;
  if (d < 0.18) c = vec3(0.56, 0.86, 0.76);
  else if (d < 0.7) c = vec3(0.36, 0.80, 0.80);
  else if (d < 1.8) c = vec3(0.22, 0.66, 0.78);
  else if (d < 4.5) c = vec3(0.16, 0.52, 0.74);
  else if (d < 9.0) c = vec3(0.12, 0.38, 0.62);
  else c = vec3(0.10, 0.30, 0.55);
  if (bio > 11.5 && bio < 12.5) c = mix(vec3(0.24, 0.78, 0.8), vec3(0.42, 0.86, 0.8), step(0.55, vn(P.xz * 0.15) + (r - 0.5) * 0.1)); // lagoon: clear turquoise with sandy patches
  if ((bio > 10.5 && bio < 12.5) && r2 < 0.05 * (0.3 + uGrain) && d < 1.0) {                     // coral specks
    float k = h21(pc + 4.0); c = k < 0.33 ? vec3(0.95, 0.55, 0.55) : k < 0.66 ? vec3(0.98, 0.72, 0.4) : vec3(0.7, 0.55, 0.9);
  }
  c = mix(c, uTint, uSpring);
  // drifting wave dashes on open water
  float row = pc.y;
  float spd = 4.0 + 6.0 * h21(vec2(row, 3.0)) + uWind * 10.0;
  float seg = floor((pc.x + uTime * spd) / 9.0);
  float dash = step(h21(vec2(seg, row)), (0.014 + uWind * 0.07) * (0.6 + uGrain)) * step(mod(row, 4.0), 0.5);
  if (d > 1.0) c = mix(c, min(vec3(1.0), c * 1.3 + 0.08), dash);
  if (d > 2.5 && uWind > 0.6 && r < (uWind - 0.6) * 0.05) c = vec3(0.92, 0.96, 1.0);   // storm whitecaps
  // shoreline foam and incoming waves
  float lap = 0.07 + 0.05 * sin(uTime * 1.4 + P.x * 0.31 + P.z * 0.23);
  if (d < lap && r < 1.0 - 0.08 * uGrain && bio < 11.5) c = vec3(0.95, 0.98, 1.0);
  float band = fract(uTime * 0.16 + vn(P.xz * 0.06) * 2.0);
  float wd = mix(1.1, 0.12, band);
  if (bio < 10.5 && d < 1.3 && abs(d - wd) < 0.035 + uWind * 0.02 && r < 0.3 + band * 0.5) c = mix(c, vec3(0.95, 0.98, 1.0), 0.35 + band * 0.5);
  if (bio > 10.5 && bio < 11.5 && r < 0.35 + 0.3 * sin(uTime * 2.0 + P.x * 0.5)) c = vec3(0.95, 0.98, 1.0); // breakers on reef
  // sun glints by day
  if (r > 1.0 - (0.0015 + uWind * 0.003) * (0.3 + uGrain) && uNight < 0.5) c = vec3(1.0);
  c *= mix(1.0, 0.8, cloudShade(P.xz));
  c *= uAmbient;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Rivers and waterfalls: flow streaks along the ribbon, white water where it drops. */
const FRAG_RIVER = /* glsl */ `
${GLSL_COMMON}
varying vec3 vWorld; varying vec2 vUv; varying vec3 vN;
void main(){
  vec3 P = vWorld; vec2 pc = pixCoord(P);
  float r = h21(pc);
  float fall = 1.0 - clamp(vN.y, 0.0, 1.0);
  float edge = abs(vUv.x - 0.5) * 2.0;
  vec3 c = mix(vec3(0.26, 0.68, 0.78), vec3(0.36, 0.78, 0.8), step(0.75, edge));
  float flow = fract(vUv.y * 0.18 - uTime * (0.5 + fall * 3.0) + h21(vec2(floor(vUv.x * 6.0), 1.0)));
  if (flow < 0.08 && r < 0.8) c = mix(c, vec3(0.85, 0.95, 1.0), 0.7);
  if (edge > 0.88 && r < 0.6) c = vec3(0.9, 0.96, 1.0);
  if (fall > 0.35) { float s = fract(vUv.y * 0.6 - uTime * 2.2 + h21(vec2(floor(vUv.x * 10.0), 2.0))); c = s < 0.55 ? vec3(0.93, 0.97, 1.0) : vec3(0.62, 0.86, 0.94); }
  c *= mix(1.0, 0.8, cloudShade(P.xz));
  c *= uAmbient;
  gl_FragColor = vec4(c, 1.0);
}`;

function stillMat(tideOn: boolean, spring = 0, tint = new THREE.Color(0.5, 0.9, 0.85)) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uTideOn: { value: tideOn ? 1 : 0 }, uSpring: { value: spring }, uTint: { value: tint }, uLevelOffset: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG_STILL,
  });
}

export class Water {
  group = new THREE.Group();
  constructor(w: World) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(N + 1600, N + 1600, 1, 1).rotateX(-Math.PI / 2), stillMat(true));
    sea.position.set(N / 2, 0, N / 2);
    sea.receiveShadow = true;
    this.group.add(sea);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(w.volcano.r * 0.165, 40).rotateX(-Math.PI / 2), stillMat(false));
    lake.position.set(w.lake.x, w.lake.level, w.lake.z);
    this.group.add(lake);
    for (const l of w.landmarks) if (l.kind === 'hotSpring') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(l.r * 0.85, 20).rotateX(-Math.PI / 2), stillMat(false, 0.55));
      let y = -1e9; for (let a = 0; a < 6.28; a += 0.5) y = Math.max(y, w.h[Math.round(l.z + Math.sin(a) * l.r * 0.85) * N + Math.round(l.x + Math.cos(a) * l.r * 0.85)]);
      m.position.set(l.x, y - 0.15, l.z);
      (m.userData as { spring: boolean }).spring = true;
      this.group.add(m);
    }
    const riverMat = new THREE.ShaderMaterial({ uniforms: { ...U, uTideOn: { value: 0 }, uLevelOffset: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG_RIVER });
    for (const rv of w.rivers) this.group.add(new THREE.Mesh(ribbon(rv.pts), riverMat));
  }
}

/** Water ribbon along a river path; steep drops become near-vertical waterfall sheets. */
function ribbon(pts: { x: number; z: number; y: number; w: number }[]) {
  const n = pts.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), ind: number[] = [];
  let dist = 0;
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 2)], b = pts[Math.min(n - 1, k + 2)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const p = pts[k], w = p.w * 0.95;
    if (k) dist += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z, p.y - pts[k - 1].y);
    pos.set([p.x - tz * w, p.y + 0.06, p.z + tx * w, p.x + tz * w, p.y + 0.06, p.z - tx * w], k * 6);
    uv.set([0, dist, 1, dist], k * 4);
    if (k < n - 1) { const i = k * 2; ind.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(ind); g.computeVertexNormals();
  return g;
}
