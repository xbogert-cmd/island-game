import * as THREE from 'three';

/** World units per screen pixel. Everything (ground texels, sprites) is drawn on this grid. */
export const PX = 1 / 8;
/** Camera tilt from horizontal. */
export const PITCH = 0.82;

/** Uniforms shared by every custom shader. */
export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.2 },
  uWindDir: { value: new THREE.Vector2(1, 0.35).normalize() },
  uCamRight: { value: new THREE.Vector3(1, 0, 0) },
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },
  uCloud: { value: 0.3 },
  uCloudOff: { value: new THREE.Vector2() },
  uWet: { value: 0 },
  uTide: { value: 0 },
  uAmbient: { value: new THREE.Color(1, 1, 1) },   // unlit surfaces (water, sprites) are tinted by this
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
  uNight: { value: 0 },
  uHeight: { value: null as THREE.Texture | null },
  uBiome: { value: null as THREE.Texture | null },
  uN: { value: 768 },
  uPX: { value: PX },
  /** 0 = smooth, 1 = gritty: scales single-pixel noise in the ground and water shaders. */
  uGrain: { value: 1 },
};

/** GLSL helpers: integer screen-pixel coordinates of a world point (stable while the camera pans), hashing and value noise. */
export const GLSL_COMMON = /* glsl */ `
uniform float uTime, uWind, uCloud, uWet, uTide, uNight, uN, uPX, uGrain;
uniform vec2 uWindDir, uCloudOff;
uniform vec3 uCamRight, uCamUp, uAmbient, uSunDir;
uniform sampler2D uHeight, uBiome;
vec2 pixCoord(vec3 p){ return floor(vec2(dot(p, uCamRight), dot(p, uCamUp)) / uPX); }
float h21(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float terrainH(vec2 xz){
  vec2 g = xz, i = floor(g), f = g - i;
  float a = texture2D(uHeight, (i + 0.5) / uN).r, b = texture2D(uHeight, (i + vec2(1.5, 0.5)) / uN).r;
  float c = texture2D(uHeight, (i + vec2(0.5, 1.5)) / uN).r, d = texture2D(uHeight, (i + 1.5) / uN).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float cloudShade(vec2 xz){
  float n = vn(xz * 0.018 + uCloudOff) * 0.65 + vn(xz * 0.05 + uCloudOff * 1.7) * 0.35;
  return clamp(step(1.0 - uCloud * 0.75, n) + smoothstep(0.75, 0.95, uCloud), 0.0, 1.0);
}
`;
