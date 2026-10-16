// Dev helper: writes a BMP top-down map of an island so world gen can be eyeballed without the renderer.
import { writeFileSync } from 'node:fs';
import { B, N, generate } from '../src/world/island';
const seed = Number(process.argv[2] ?? 1234);
const t = performance.now(); const w = generate(seed); console.log('gen ms', (performance.now() - t) | 0, 'rivers', w.rivers.length, 'landmarks', w.landmarks.map(l => l.kind).join(','));
const col: Record<number, number[]> = { [B.Ocean]: [30, 80, 150], [B.Beach]: [235, 215, 160], [B.Grass]: [110, 180, 80], [B.Jungle]: [40, 110, 50], [B.Highland]: [140, 130, 110], [B.Volcanic]: [95, 85, 80], [B.Swamp]: [70, 90, 60], [B.Bamboo]: [150, 190, 70], [B.Flowers]: [220, 150, 190], [B.TideRock]: [100, 100, 100], [B.Dirt]: [160, 130, 90], [B.Reef]: [80, 200, 190], [B.Lagoon]: [90, 210, 210], [B.Lake]: [60, 140, 220] };
const S = N, row = S * 3 + ((4 - (S * 3) % 4) % 4), buf = Buffer.alloc(54 + row * S);
buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14); buf.writeInt32LE(S, 18); buf.writeInt32LE(-S, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
  const i = z * N + x, h = w.h[i]; let c = col[w.biome[i]];
  if (w.biome[i] === B.Ocean) c = h > -2 ? [70, 170, 200] : c;
  const sh = w.biome[i] === B.Ocean ? 1 : Math.max(0.55, Math.min(1.25, 0.8 + (h - w.h[Math.max(0, i - N - 1)]) * 0.35));
  const o = 54 + z * row + x * 3; buf[o] = Math.min(255, c[2] * sh); buf[o + 1] = Math.min(255, c[1] * sh); buf[o + 2] = Math.min(255, c[0] * sh);
}
for (const r of w.rivers) for (const p of r.pts) { const o = 54 + (p.z | 0) * row + (p.x | 0) * 3; buf[o] = 255; buf[o + 1] = 120; buf[o + 2] = 40; }
for (const l of w.landmarks) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const o = 54 + ((l.z + dz) | 0) * row + ((l.x + dx) | 0) * 3; buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 255; }
writeFileSync(`scripts/map-${seed}.bmp`, buf);
