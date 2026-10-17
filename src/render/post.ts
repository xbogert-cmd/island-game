import * as THREE from 'three';

/**
 * Low-res render target -> screen. Optional pixel filter (depth outlines + ordered dither, off by default),
 * plus full-screen weather moments: lightning flash, rainbow, shooting stars.
 */
export class Post {
  rt: THREE.WebGLRenderTarget;
  mat: THREE.ShaderMaterial;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tC: { value: this.rt.texture }, tD: { value: this.rt.depthTexture }, res: { value: new THREE.Vector2(4, 4) }, scr: { value: new THREE.Vector2(4, 4) },
        range: { value: 800 }, uFilter: { value: 0 }, flash: { value: 0 }, rainbow: { value: 0 }, star: { value: new THREE.Vector4(0, 0, 0, 0) }, time: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tC, tD; uniform vec2 res, scr; uniform float range, uFilter, flash, rainbow, time; uniform vec4 star;
        varying vec2 vUv;
        float D(vec2 o){ return texture2D(tD, vUv + o / scr).x * range; }   // o in screen pixels
        float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
        void main(){
          vec4 c = texture2D(tC, vUv);
          vec2 fc = floor(vUv * res);
          if (uFilter > 0.5) {
            // outlines one SCREEN pixel thin: only where the next screen pixel falls in a nearer low-res texel
            float d = D(vec2(0.0));
            float behind = max(max(d - D(vec2(1.0, 0.0)), d - D(vec2(-1.0, 0.0))), max(d - D(vec2(0.0, 1.0)), d - D(vec2(0.0, -1.0))));
            if (behind > 0.8) c.rgb = c.rgb * 0.22 + vec3(0.02, 0.02, 0.05);
            float L = 18.0; c.rgb = floor(c.rgb * L + b4(fc)) / L;
          }
          // rainbow: dithered arc across the upper sky part of the view
          if (rainbow > 0.0) {
            vec2 p = (fc - vec2(res.x * 0.5, -res.y * 0.55)) / res.y;
            float rr = length(p);
            float band = (rr - 1.05) / 0.12;
            if (band > 0.0 && band < 1.0) {
              vec3 rb = band < 0.17 ? vec3(0.6,0.3,0.9) : band < 0.33 ? vec3(0.3,0.4,1.0) : band < 0.5 ? vec3(0.3,0.9,0.4) : band < 0.67 ? vec3(1.0,0.95,0.3) : band < 0.83 ? vec3(1.0,0.6,0.2) : vec3(1.0,0.3,0.3);
              float a = rainbow * 0.32 * smoothstep(0.0, 0.3, p.y + 0.6);
              if (b4(fc) < a * 1.6) c.rgb = mix(c.rgb, rb, 0.55);
            }
          }
          // shooting star streak
          if (star.w > 0.0) {
            vec2 a = star.xy * res, dir = normalize(vec2(-1.0, -0.45));
            vec2 rel = fc - a; float along = dot(rel, dir), across = abs(dot(rel, vec2(-dir.y, dir.x)));
            if (across < 0.8 && along > 0.0 && along < 26.0 * star.w) c.rgb = mix(c.rgb, vec3(1.0, 1.0, 0.92), (1.0 - along / (26.0 * star.w)) * star.w);
          }
          c.rgb += flash * vec3(0.75, 0.8, 0.95);
          gl_FragColor = vec4(c.rgb, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }

  /** w,h = the low-res scene; sw,sh = the screen it is shown on. */
  setSize(w: number, h: number, sw: number, sh: number) {
    this.rt.setSize(w, h);
    (this.mat.uniforms.res.value as THREE.Vector2).set(w, h);
    (this.mat.uniforms.scr.value as THREE.Vector2).set(sw, sh);
  }

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera) {
    r.setRenderTarget(this.rt); r.render(scene, cam);
    r.setRenderTarget(null); r.render(this.scene, this.cam);
  }
}
