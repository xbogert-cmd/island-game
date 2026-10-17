/**
 * Pixel art for camp buildings, drawn with a few primitives instead of typed out by hand.
 * Output is the same as the ASCII sprites (rows of palette letters), so it goes through the same atlas + outline.
 */
type Grid = string[][];

function canvas(w: number, h: number) {
  const g: Grid = Array.from({ length: h }, () => Array(w).fill('.'));
  const set = (x: number, y: number, c: string) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const rect = (x: number, y: number, rw: number, rh: number, c: string) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, c); };
  /** a triangle roof: apex at (cx, top), base from x0..x1 at row `bottom` */
  const roof = (cx: number, top: number, x0: number, x1: number, bottom: number, fill: (i: number, j: number) => string) => {
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / Math.max(1, bottom - top), a = Math.round(cx - (cx - x0) * t), b = Math.round(cx + (x1 - cx) * t);
      for (let x = a; x <= b; x++) set(x, y, fill(x, y));
    }
  };
  const out = () => g.map(r => r.join(''));
  return { set, rect, roof, out, w, h };
}

/** Thatch: straw with darker streaks and a highlight on top. */
const thatch = (x: number, y: number) => (x * 7 + y * 3) % 11 === 0 ? 'a' : (x + y * 2) % 5 === 0 ? 'y' : 'h';
/** Planks: vertical boards with dark seams. */
const planks = (x: number) => x % 4 === 0 ? 'M' : 'n';

function hut() {
  const c = canvas(30, 26);
  c.rect(4, 12, 22, 13, 'n');
  for (let x = 4; x < 26; x++) for (let y = 12; y < 25; y++) c.set(x, y, planks(x));
  c.rect(12, 16, 6, 9, 'e'); c.rect(12, 16, 6, 1, 'N');               // door
  c.rect(6, 15, 3, 3, 'e'); c.rect(21, 15, 3, 3, 'e');                // windows
  c.rect(3, 25, 24, 1, 'N');                                         // floor
  c.roof(15, 0, 0, 29, 12, thatch);
  for (let x = 1; x < 29; x++) c.set(x, 12, 'a');                    // eave shadow
  c.set(15, 0, 'y'); c.set(14, 1, 'y'); c.set(16, 1, 'y');
  return c.out();
}

function storage() {
  const c = canvas(32, 28);
  for (const x of [5, 26]) c.rect(x, 19, 2, 9, 'N');                 // stilts
  for (const x of [11, 20]) c.rect(x, 19, 1, 9, 'M');
  c.rect(4, 10, 24, 9, 'n');
  for (let x = 4; x < 28; x++) for (let y = 10; y < 19; y++) c.set(x, y, (y % 3 === 0) ? 'M' : 'n');  // horizontal logs
  c.rect(13, 12, 6, 7, 'e'); c.rect(15, 13, 2, 2, 'o');              // door, something orange inside
  c.rect(3, 19, 26, 1, 'N');
  for (let i = 0; i < 6; i++) c.set(13 - i, 20 + i, 'a'), c.set(14 - i, 20 + i, 'a');   // ladder
  c.roof(16, 0, 0, 31, 10, thatch);
  for (let x = 1; x < 31; x++) c.set(x, 10, 'a');
  return c.out();
}

function sickbay() {
  const c = canvas(30, 22);
  c.roof(15, 0, 0, 29, 19, (x) => x < 15 ? (x % 6 === 0 ? 'W' : 'w') : (x % 6 === 0 ? 'S' : 'W'));
  c.rect(12, 11, 6, 9, 'e');                                         // opening
  c.rect(14, 4, 2, 6, 'r'); c.rect(12, 6, 6, 2, 'r');                // red cross
  c.rect(0, 20, 30, 2, 'N');
  c.set(15, 0, 'n'); c.set(15, 1, 'n');                              // pole
  c.rect(2, 19, 6, 1, 'b'); c.rect(22, 19, 6, 1, 'b');               // bedding
  return c.out();
}

function workbench() {
  const c = canvas(24, 15);
  c.rect(1, 7, 22, 2, 'a'); c.rect(1, 9, 22, 1, 'N');                // top
  for (const x of [2, 20]) c.rect(x, 10, 2, 5, 'N');
  c.rect(4, 12, 16, 1, 'n');                                         // shelf
  c.rect(5, 11, 3, 1, 'q'); c.rect(14, 11, 4, 1, 'h');               // stone, rope
  c.rect(4, 4, 1, 3, 'n'); c.rect(3, 3, 3, 2, 'G');                  // hammer
  c.rect(16, 2, 1, 5, 'n'); c.rect(15, 2, 3, 1, 'g'); c.rect(15, 3, 1, 1, 'g');   // axe
  c.rect(9, 5, 4, 2, 'W'); c.set(10, 4, 'g');                        // scrap plate
  return c.out();
}

function cooking() {
  const c = canvas(22, 18);
  c.rect(1, 2, 1, 10, 'n'); c.rect(20, 2, 1, 10, 'n');               // spit posts
  c.rect(1, 3, 20, 1, 'N');                                          // spit bar
  c.rect(8, 4, 6, 3, 'l'); c.rect(9, 4, 4, 1, 'R');                  // roast
  c.roof(11, 8, 3, 19, 16, (x, y) => (x + y) % 4 === 0 ? 'G' : 'q'); // stone oven
  c.rect(8, 13, 6, 3, 'e'); c.rect(9, 14, 4, 2, 'o'); c.set(10, 14, 'y'); c.set(11, 15, 'y');
  c.rect(1, 17, 20, 1, 'G');
  return c.out();
}

function watchFire() {
  const c = canvas(16, 20);
  for (let i = 0; i < 10; i++) { c.set(4 - i * 0.35, 10 + i, 'n'); c.set(11 + i * 0.35, 10 + i, 'n'); c.set(8, 10 + i, 'N'); }
  c.rect(2, 6, 12, 4, 'q'); c.rect(3, 9, 10, 1, 'G'); c.rect(3, 5, 10, 1, 'G');   // brazier
  c.rect(4, 4, 8, 1, 'n'); c.rect(5, 3, 6, 1, 'N');                  // logs in it
  return c.out();
}

function beacon() {
  const c = canvas(22, 30);
  for (let y = 4; y < 29; y++) {
    const half = 3 + Math.floor((y - 4) * 0.32);
    for (let x = 11 - half; x <= 11 + half; x++) c.set(x, y, (y % 4 === 0) ? 'N' : (x === 11 - half || x === 11 + half) ? 'N' : (x + y) % 3 ? 'n' : 'M');
  }
  c.rect(7, 0, 8, 4, 'n'); c.rect(8, 1, 6, 2, 'N');
  c.rect(0, 29, 22, 1, 'G');
  return c.out();
}

function fishTrap() {
  const c = canvas(18, 10);
  c.roof(9, 0, 0, 17, 9, (x, y) => (x + y) % 3 === 0 ? 'a' : (x - y) % 4 === 0 ? 'N' : 'h');
  c.rect(7, 5, 4, 4, 'e'); c.set(8, 6, 'S'); c.set(9, 7, 'S');
  return c.out();
}

function fencePost() {
  const c = canvas(5, 13);
  c.rect(1, 1, 3, 12, 'n'); c.rect(2, 0, 1, 1, 'n'); c.rect(1, 1, 1, 12, 'N');
  c.rect(0, 4, 5, 1, 'a'); c.rect(0, 9, 5, 1, 'a');                  // lashings
  return c.out();
}

function bath() {
  const c = canvas(26, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 26; x++) {
    const d = ((x - 12.5) / 12.5) ** 2 + ((y - 5.5) / 5.5) ** 2;
    if (d < 0.62) c.set(x, y, (x * 3 + y * 5) % 9 === 0 ? 'S' : 'c'); else if (d < 1.05) c.set(x, y, (x + y) % 3 ? 'q' : 'G');
  }
  return c.out();
}

function stakes() {
  const c = canvas(14, 7);
  for (const x of [1, 5, 9, 13]) c.rect(x, 0, 1, 7, 'n');
  c.rect(0, 5, 14, 1, 'a'); c.set(3, 4, 'a'); c.set(7, 4, 'a'); c.set(11, 4, 'a');
  return c.out();
}

export const BUILD_ART: Record<string, { frames: string[][] }> = {
  hut: { frames: [hut()] }, storage: { frames: [storage()] }, sickbay: { frames: [sickbay()] }, workbench: { frames: [workbench()] },
  cooking: { frames: [cooking()] }, watchFire: { frames: [watchFire()] }, beacon: { frames: [beacon()] }, fishTrap: { frames: [fishTrap()] },
  fencePost: { frames: [fencePost()] }, bath: { frames: [bath()] }, stakes: { frames: [stakes()] },
};
