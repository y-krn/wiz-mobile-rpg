// The town picture, painted pixel by pixel (#2107). It follows the dungeon's
// storybook pixel look: bright daylight, ink outlines, textured materials
// (stone courses, roof tiles, plaster and timber, cobbles, grass), light from
// the upper left with cast shadows, and light haze for what is far away.
// Pure: it returns RGBA pixels, so it can be painted on a canvas or tested.

export const TOWN_ART_WIDTH = 180;
export const TOWN_ART_HEIGHT = 260;

const W = TOWN_ART_WIDTH;
const H = TOWN_ART_HEIGHT;

function hex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE = [255, 255, 255];
const BLACK = [20, 14, 24];

function shade(color, amount) {
  return amount >= 0 ? mix(color, WHITE, amount) : mix(color, BLACK, -amount);
}

function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dither(x, y) {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

// Quantize a colour step so gradients read as pixel bands.
function stepped(t, steps) {
  return Math.round(t * steps) / steps;
}

const P = Object.freeze({
  ink: hex("#3b2a1e"),
  skyTop: hex("#7cc2ea"),
  skyMid: hex("#b8e1f1"),
  skyLow: hex("#fbe8c8"),
  cloud: hex("#ffffff"),
  cloudShade: hex("#d9e1f4"),
  cloudEdge: hex("#a9bad8"),
  farHill: hex("#93acd0"),
  rock: hex("#9a96a4"),
  snow: hex("#f4f6fb"),
  grass: hex("#8fca7a"),
  grassDark: hex("#6fae62"),
  path: hex("#e3d6bd"),
  cobble: hex("#cdbfa6"),
  stone: hex("#c9c4bb"),
  stoneWarm: hex("#d8cdb8"),
  plaster: hex("#f6ead2"),
  timber: hex("#7a4e34"),
  wood: hex("#9a6a44"),
  roofRed: hex("#d0634a"),
  roofBlue: hex("#5f8fc9"),
  roofSlate: hex("#7f7a93"),
  roofPurple: hex("#9a7fc4"),
  roofGrey: hex("#9a96a0"),
  glass: hex("#a7dff0"),
  glassWarm: hex("#ffe2a0"),
  door: hex("#8a5a3c"),
  dark: hex("#2b2230"),
  flagRed: hex("#e0574f"),
  leaf: hex("#5fae6e"),
  leafDark: hex("#3f8a55"),
  trunk: hex("#8a5a44"),
  flowerPink: hex("#f08aa0"),
  flowerGold: hex("#f6c85f"),
  skin: hex("#f0c8a0"),
  iron: hex("#6b6878"),
  fire: hex("#ff9a3c")
});

class Canvas {
  constructor() {
    this.pixels = new Uint8ClampedArray(W * H * 4);
  }

  set(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || !color) return;
    const index = (y * W + x) * 4;
    this.pixels[index] = color[0];
    this.pixels[index + 1] = color[1];
    this.pixels[index + 2] = color[2];
    this.pixels[index + 3] = 255;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const index = (y * W + x) * 4;
    return [this.pixels[index], this.pixels[index + 1], this.pixels[index + 2]];
  }

  // Fill a masked shape with a material and draw its ink outline. `inside`
  // decides membership; `paint` picks the colour from position and light.
  shape(box, inside, paint, { outline = P.ink, haze = 0 } = {}) {
    const { x0, y0, x1, y1 } = box;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y)) continue;
        const edge = outline && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
        let color = edge ? outline : paint(x, y);
        if (haze > 0 && color) color = mix(color, P.skyMid, haze);
        this.set(x, y, color);
      }
    }
  }

  // A soft cast shadow: darken what is already there, dithered at its edge.
  shadow(inside, box, strength = 0.22) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (!inside(x, y)) continue;
        const under = this.get(x, y);
        if (under) this.set(x, y, shade(under, -strength));
      }
    }
  }
}

const rectBox = (x, y, w, h) => ({ x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 });
const inRect = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;
const inRoof = (cx, top, bottom, halfBase) => (px, py) =>
  py >= top && py <= bottom && Math.abs(px - cx) <= ((py - top) / Math.max(1, bottom - top)) * halfBase;
const any = (...masks) => (px, py) => masks.some(mask => mask(px, py));

// ---------- materials ----------

// Light from the upper left: left and top of a face are brighter.
function lit(color, x, y, box, amount = 0.08) {
  const tx = (x - box.x0) / Math.max(1, box.x1 - box.x0);
  return shade(color, amount * (0.5 - tx) * 2);
}

function stoneCourses(base, box, seed) {
  return (x, y) => {
    const row = Math.floor((y - box.y0) / 4);
    const offset = row % 2 ? 3 : 0;
    const col = Math.floor((x - box.x0 + offset) / 6);
    const mortar = (y - box.y0) % 4 === 3 || (x - box.x0 + offset) % 6 === 5;
    if (mortar) return shade(base, -0.22);
    let color = shade(base, (hash(col, row, seed) - 0.5) * 0.12);
    if ((y - box.y0) % 4 === 0) color = shade(color, 0.1);
    return lit(color, x, y, box);
  };
}

function roofTiles(base, top, bottom, seed) {
  return (x, y) => {
    const row = Math.floor((y - top) / 3);
    const offset = row % 2 ? 2 : 0;
    const sub = (y - top) % 3;
    let color = shade(base, (hash(Math.floor((x + offset) / 4), row, seed) - 0.5) * 0.1);
    if (sub === 2) color = shade(color, -0.22);
    else if ((x + offset) % 4 === 0) color = shade(color, -0.12);
    else if (sub === 0) color = shade(color, 0.1);
    // Lighter toward the ridge.
    return shade(color, 0.08 * (1 - (y - top) / Math.max(1, bottom - top)));
  };
}

function plaster(base, box, seed) {
  return (x, y) => {
    const n = hash(x, y, seed);
    const color = n > 0.93 ? shade(base, -0.08) : n < 0.05 ? shade(base, 0.06) : base;
    return lit(color, x, y, box, 0.05);
  };
}

function planks(base, box, seed, vertical = true) {
  return (x, y) => {
    const u = vertical ? x - box.x0 : y - box.y0;
    const v = vertical ? y : x;
    if (u % 3 === 2) return shade(base, -0.25);
    const grain = hash(Math.floor(u / 3), Math.floor(v / 2), seed) > 0.8 ? -0.1 : 0;
    return shade(base, grain + (u % 3 === 0 ? 0.08 : 0));
  };
}

// ---------- scene pieces ----------

function paintSky(c) {
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / 128;
      const upper = t < 0.55;
      const local = upper ? t / 0.55 : (t - 0.55) / 0.45;
      const a = upper ? P.skyTop : P.skyMid;
      const b = upper ? P.skyMid : P.skyLow;
      const band = stepped(local, 5);
      const next = Math.min(1, band + 0.2);
      const pick = (local - band) / 0.2 > dither(x, y) ? next : band;
      c.set(x, y, mix(a, b, pick));
    }
  }
}

function paintCloud(c, cx, cy, size) {
  const blobs = [[0, 0, size], [-size * 0.9, size * 0.35, size * 0.7], [size * 0.95, size * 0.3, size * 0.75], [size * 0.3, -size * 0.45, size * 0.6]];
  const inside = (x, y) => blobs.some(([dx, dy, r]) => (x - cx - dx) ** 2 + ((y - cy - dy) * 1.6) ** 2 <= r * r);
  const box = { x0: Math.floor(cx - size * 2), y0: Math.floor(cy - size), x1: Math.ceil(cx + size * 2), y1: Math.ceil(cy + size) };
  c.shape(box, inside, (x, y) => (y > cy + size * 0.2 ? P.cloudShade : y < cy - size * 0.2 && x < cx ? WHITE : P.cloud), { outline: P.cloudEdge });
}

function paintMountains(c) {
  const ridge = x => 74 + Math.sin(x * 0.07) * 8 + Math.sin(x * 0.19 + 1) * 4;
  c.shape({ x0: 0, y0: 50, x1: W - 1, y1: 122 }, (x, y) => y >= ridge(x) && y <= 122,
    (x, y) => shade(P.farHill, hash(x >> 2, y >> 2, 3) > 0.7 ? 0.06 : 0), { outline: shade(P.farHill, -0.15) });
  // The near mountain holding the mine.
  const peak = x => 56 + Math.abs(x - 92) * 0.62 + Math.sin(x * 0.4) * 1.5;
  c.shape({ x0: 30, y0: 52, x1: 160, y1: 122 }, (x, y) => y >= peak(x) && y <= 122 && x > 30 && x < 160,
    (x, y) => {
      if (y < peak(x) + 7 && y < 70) return hash(x, y, 9) > 0.15 ? P.snow : shade(P.snow, -0.08);
      const strata = (y + Math.floor(Math.sin(x * 0.3) * 2)) % 7 === 0 ? -0.12 : 0;
      return shade(lit(P.rock, x, y, { x0: 30, x1: 160 }, 0.12), strata + (hash(x >> 1, y >> 1, 4) - 0.5) * 0.08);
    }, { haze: 0.12 });
}

function paintGround(c) {
  // Grass with tufts and a few flowers.
  for (let y = 118; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hash(x, y, 21);
      let color = n > 0.9 ? P.grassDark : n < 0.04 ? shade(P.grass, 0.12) : P.grass;
      if (n > 0.995) color = hash(x, y, 22) > 0.5 ? P.flowerPink : P.flowerGold;
      c.set(x, y, color);
    }
  }
  // The street: a cobbled road from the mine down through the town and the
  // front street of the facilities.
  const road = (x, y) => {
    if (y >= 178 && y < 186) return true;
    if (y < 120) return false;
    const half = 9 + (y - 120) * 0.42;
    return Math.abs(x - 90) <= half;
  };
  c.shape({ x0: 0, y0: 120, x1: W - 1, y1: H - 1 }, road, (x, y) => {
    const row = Math.floor(y / 3);
    const offset = row % 2 ? 2 : 0;
    const cell = (x + offset) % 5;
    const seam = y % 3 === 2 || cell === 4;
    if (seam) return shade(P.path, -0.12);
    const base = shade(P.cobble, (hash(Math.floor((x + offset) / 5), row, 5) - 0.5) * 0.12);
    return cell === 0 && y % 3 === 0 ? shade(base, 0.12) : base;
  }, { outline: shade(P.path, -0.25) });
}

function paintTree(c, x, y, size = 7) {
  c.shadow((px, py) => (px - x - 3) ** 2 + ((py - y - size - 3) * 2.2) ** 2 <= (size * 0.9) ** 2, rectBox(x - size, y, size * 3, size * 2 + 6));
  c.shape(rectBox(x - 1, y + size - 2, 3, size), inRect(x - 1, y + size - 2, 3, size), () => P.trunk);
  c.shape(rectBox(x - size, y - size, size * 2 + 1, size * 2 + 1),
    (px, py) => (px - x) ** 2 + (py - y) ** 2 <= size * size,
    (px, py) => {
      const n = hash(px >> 1, py >> 1, 33);
      const light = px - x + (py - y) < -size * 0.4 ? 0.12 : px - x + (py - y) > size * 0.6 ? -0.15 : 0;
      return shade(n > 0.75 ? P.leafDark : P.leaf, light);
    });
}

function paintWindow(c, x, y, w, h, { warm = false, boarded = false } = {}) {
  c.shape(rectBox(x - 1, y - 1, w + 2, h + 2), inRect(x - 1, y - 1, w + 2, h + 2), (px, py) => {
    if (px === x - 1 || px === x + w || py === y - 1 || py === y + h) return P.timber;
    if (boarded) return (py - y) % 2 === 0 ? P.wood : shade(P.wood, -0.25);
    const glass = warm ? P.glassWarm : P.glass;
    if (px === x + Math.floor(w / 2) || py === y + Math.floor(h / 2)) return shade(P.timber, 0.1);
    return px - x === py - y || px - x === py - y + 1 ? shade(glass, 0.4) : glass;
  }, { outline: P.ink });
}

function paintDoor(c, x, y, w, h) {
  c.shape(rectBox(x, y, w, h), inRect(x, y, w, h), planks(P.door, rectBox(x, y, w, h), 7));
  c.set(x + w - 2, y + Math.floor(h / 2), hex("#f6c85f"));
}

// A small figure: a head, a body in its colour, an outline.
function paintFigure(c, x, y, body) {
  c.shape(rectBox(x, y, 3, 3), inRect(x, y, 3, 3), () => P.skin);
  c.shape(rectBox(x - 1, y + 3, 5, 6), inRect(x - 1, y + 3, 5, 6), (px) => (px === x - 1 ? shade(body, 0.12) : body));
}

function paintMine(c) {
  // Timber portal into the near mountain, rails running out of it.
  c.shape(rectBox(76, 94, 28, 27), inRect(76, 94, 28, 27), (x, y) => {
    if (x >= 81 && x <= 98 && y >= 100) return P.dark;
    if (y < 98) return planks(P.wood, rectBox(76, 94, 28, 4), 2, false)(x, y);
    return planks(P.timber, rectBox(76, 94, 28, 27), 3)(x, y);
  });
  c.shape(rectBox(81, 100, 18, 21), inRect(81, 100, 18, 21), (x, y) => (y > 116 ? shade(P.dark, 0.08) : P.dark), { outline: null });
  for (const x of [78, 100]) c.shape(rectBox(x, 101, 2, 3), inRect(x, 101, 2, 3), () => P.fire, { outline: null });
  for (let y = 121; y < 178; y++) {
    c.set(86, y, P.iron);
    c.set(94, y, P.iron);
    if (y % 5 === 0) for (let x = 84; x <= 96; x++) c.set(x, y, P.timber);
  }
  // A cart left at the mouth.
  c.shape(rectBox(100, 113, 10, 6), inRect(100, 113, 10, 6), planks(P.iron, rectBox(100, 113, 10, 6), 4));
  c.set(102, 119, P.ink); c.set(107, 119, P.ink);
  for (let x = 101; x <= 108; x++) c.set(x, 112, hex("#b3a49a"));
}

function paintCastle(c) {
  const keep = rectBox(12, 62, 34, 58);
  const leftTower = rectBox(2, 46, 14, 74);
  const rightTower = rectBox(42, 46, 14, 74);
  const all = any(inRect(12, 62, 34, 58), inRect(2, 46, 14, 74), inRect(42, 46, 14, 74));
  c.shadow((x, y) => all(x - 6, y + 4) && !all(x, y), rectBox(2, 50, 64, 74));
  c.shape(keep, inRect(12, 62, 34, 58), stoneCourses(P.stone, keep, 1));
  for (const tower of [leftTower, rightTower]) {
    c.shape(tower, inRect(tower.x0, tower.y0, 14, 74), stoneCourses(P.stoneWarm, tower, 2));
    for (let i = 0; i < 4; i++) {
      const bx = tower.x0 + i * 4;
      c.shape(rectBox(bx, tower.y0 - 3, 2, 3), inRect(bx, tower.y0 - 3, 2, 3), () => P.stoneWarm);
    }
    const cx = tower.x0 + 7;
    c.shape(rectBox(cx - 9, tower.y0 - 16, 19, 14), inRoof(cx, tower.y0 - 16, tower.y0 - 3, 9), roofTiles(P.roofBlue, tower.y0 - 16, tower.y0 - 3, 5));
    paintWindow(c, tower.x0 + 5, tower.y0 + 12, 4, 6);
    paintWindow(c, tower.x0 + 5, tower.y0 + 36, 4, 6);
  }
  for (let i = 0; i < 6; i++) c.shape(rectBox(13 + i * 6, 59, 3, 3), inRect(13 + i * 6, 59, 3, 3), () => P.stone);
  // Flag on the right tower.
  for (let y = 18; y < 31; y++) c.set(49, y, P.ink);
  c.shape(rectBox(50, 18, 8, 5), (x, y) => x >= 50 && y >= 18 && y <= 22 && x <= 57 - Math.abs(y - 20), () => P.flagRed);
  // Gate.
  c.shape(rectBox(23, 98, 12, 22), (x, y) => y >= 98 && y < 120 && x >= 23 && x < 35 && !(y < 102 && Math.abs(x - 28.5) > (y - 98) * 1.6 + 2), planks(P.door, rectBox(23, 98, 12, 22), 8));
  paintWindow(c, 18, 72, 4, 6);
  paintWindow(c, 36, 72, 4, 6);
  paintFigure(c, 17, 108, hex("#5b7fb0"));
  for (let y = 102; y < 118; y++) c.set(21, y, P.iron);
}

function paintHouseBody(c, x, y, w, h, wallMaterial, roof, { roofTop, halfTimber = false, seed = 0 } = {}) {
  const body = rectBox(x, y, w, h);
  const mask = any(inRect(x, y, w, h), inRoof(x + w / 2, roofTop, y + 1, w / 2 + 3));
  c.shadow((px, py) => mask(px - 5, py + 3) && !mask(px, py), rectBox(x, roofTop, w + 10, h + (y - roofTop) + 6));
  c.shape(body, inRect(x, y, w, h), (px, py) => {
    if (halfTimber && (py === y + 1 || py === y + Math.floor(h / 2) || px === x + 1 || px === x + w - 2 || ((px - x) % 12 === 0 && py < y + h / 2))) return P.timber;
    return wallMaterial(px, py);
  });
  c.shape(rectBox(x - 3, roofTop, w + 7, y - roofTop + 2), inRoof(x + w / 2, roofTop, y + 1, w / 2 + 3), roofTiles(roof, roofTop, y + 1, seed));
}

function paintTavern(c) {
  c.shape(rectBox(162, 62, 6, 14), inRect(162, 62, 6, 14), stoneCourses(P.stone, rectBox(162, 62, 6, 14), 6));
  paintSmoke(c, 165, 60);
  paintHouseBody(c, 118, 88, 58, 36, plaster(P.plaster, rectBox(118, 88, 58, 36), 11), P.roofRed, { roofTop: 66, halfTimber: true, seed: 12 });
  paintWindow(c, 124, 94, 6, 6, { warm: true });
  paintWindow(c, 160, 94, 6, 6, { warm: true });
  paintWindow(c, 124, 110, 6, 6, { warm: true });
  paintDoor(c, 147, 108, 10, 16);
  // Hanging tankard sign.
  c.set(141, 104, P.ink); c.set(141, 105, P.ink);
  c.shape(rectBox(138, 106, 7, 6), inRect(138, 106, 7, 6), () => hex("#f6c85f"));
  // The notice board with its papers, and someone reading it.
  c.shape(rectBox(162, 107, 13, 11), inRect(162, 107, 13, 11), planks(P.wood, rectBox(162, 107, 13, 11), 13, false));
  for (const [px, py] of [[164, 109], [169, 110], [166, 113]]) c.shape(rectBox(px, py, 4, 3), inRect(px, py, 4, 3), () => hex("#fff8e6"), { outline: hex("#c9b48f") });
  for (let y = 118; y < 124; y++) { c.set(163, y, P.timber); c.set(173, y, P.timber); }
  paintFigure(c, 167, 116, hex("#7a6aa8"));
  // Barrels by the wall.
  for (const bx of [120, 127]) c.shape(rectBox(bx, 117, 6, 7), inRect(bx, 117, 6, 7), planks(P.wood, rectBox(bx, 117, 6, 7), 14));
}

function paintArchives(c) {
  const body = rectBox(6, 136, 52, 32);
  c.shadow((x, y) => inRect(6, 128, 52, 40)(x - 5, y + 3) && !inRect(6, 128, 52, 40)(x, y), rectBox(6, 128, 62, 44));
  c.shape(body, inRect(6, 136, 52, 32), (x, y) => {
    if ([10, 19, 42, 51].some(cx => x >= cx && x < cx + 4)) return lit(shade(P.stoneWarm, x % 4 === 0 ? 0.1 : 0), x, y, body);
    return stoneCourses(P.stone, body, 15)(x, y);
  });
  // Dome.
  c.shape(rectBox(4, 118, 57, 20), (x, y) => y <= 137 && (x - 32) ** 2 + ((y - 137) * 1.45) ** 2 <= 27 * 27,
    (x) => {
      const band = Math.floor((x - 5) / 5) % 2 === 0;
      const light = x < 26 ? 0.12 : x > 42 ? -0.12 : 0;
      return shade(band ? P.roofBlue : shade(P.roofBlue, -0.1), light);
    });
  c.shape(rectBox(30, 113, 5, 6), inRect(30, 113, 5, 6), () => hex("#f6c85f"));
  paintWindow(c, 25, 142, 5, 8, { warm: true });
  paintWindow(c, 35, 142, 5, 8, { warm: true });
  paintDoor(c, 28, 154, 9, 14);
  // The guidebook's lectern.
  c.shape(rectBox(46, 157, 9, 3), inRect(46, 157, 9, 3), () => hex("#fff8e6"));
  c.shape(rectBox(49, 160, 3, 7), inRect(49, 160, 3, 7), () => P.wood);
}

function paintWorkshop(c) {
  c.shape(rectBox(155, 124, 7, 20), inRect(155, 124, 7, 20), stoneCourses(P.stone, rectBox(155, 124, 7, 20), 16));
  paintSmoke(c, 158, 121);
  paintHouseBody(c, 114, 148, 54, 28, planks(hex("#b98c62"), rectBox(114, 148, 54, 28), 17), P.roofSlate, { roofTop: 130, seed: 18 });
  paintWindow(c, 120, 154, 6, 5);
  // Open forge with its fire.
  c.shape(rectBox(138, 156, 15, 20), inRect(138, 156, 15, 20), (x, y) => (y > 166 && x > 140 && x < 151 ? (hash(x, y, 4) > 0.4 ? P.fire : hex("#ffd27a")) : P.dark));
  // Anvil and the smith.
  c.shape(rectBox(157, 169, 9, 3), inRect(157, 169, 9, 3), () => P.iron);
  c.shape(rectBox(159, 172, 5, 4), inRect(159, 172, 5, 4), () => shade(P.iron, -0.15));
  paintFigure(c, 169, 163, hex("#8a5a44"));
  c.set(160, 167, hex("#ffd27a")); c.set(163, 166, P.fire);
}

function paintSmoke(c, x, y) {
  for (const [dx, dy, r] of [[0, 0, 2], [2, -5, 3], [-1, -11, 3]]) {
    c.shape(rectBox(x + dx - r, y + dy - r, r * 2 + 1, r * 2 + 1), (px, py) => (px - x - dx) ** 2 + (py - y - dy) ** 2 <= r * r,
      (px, py) => (py < y + dy ? WHITE : hex("#e4e1ec")), { outline: hex("#c3bfd0") });
  }
}

// A house per facility: kept up once its keeper is home, boarded while
// someone still waits below, an empty fenced plot for the rest.
function paintFacility(c, cx, status) {
  const x = cx - 12;
  const y = 196;
  if (status === "empty") {
    for (let px = x + 1; px < x + 24; px++) { c.set(px, y + 14, P.timber); c.set(px, y + 18, P.timber); }
    for (const px of [x + 1, x + 12, x + 23]) for (let py = y + 12; py < y + 22; py++) c.set(px, py, P.timber);
    return;
  }
  const open = status === "open";
  const wall = open ? P.plaster : hex("#bdb5a8");
  paintHouseBody(c, x, y, 24, 22, plaster(wall, rectBox(x, y, 24, 22), cx), open ? P.roofPurple : P.roofGrey, { roofTop: y - 11, halfTimber: open, seed: cx });
  paintWindow(c, x + 3, y + 5, 5, 5, { warm: open, boarded: !open });
  paintWindow(c, x + 16, y + 5, 5, 5, { warm: open, boarded: !open });
  paintDoor(c, x + 9, y + 11, 6, 11);
  if (!open) for (let i = 0; i < 6; i++) c.set(x + 9 + i, y + 12 + i, P.timber);
}

function paintForeground(c) {
  for (const [x, y, s] of [[10, 226, 9], [30, 236, 7], [150, 232, 8], [170, 224, 9]]) paintTree(c, x, y, s);
  // A low fence along the bottom of the road.
  for (let x = 58; x <= 122; x++) { c.set(x, 244, P.timber); c.set(x, 248, P.timber); }
  for (let x = 58; x <= 122; x += 8) for (let y = 241; y < 252; y++) c.set(x, y, P.wood);
  // Flower beds.
  for (let x = 0; x < W; x++) {
    for (let y = 252; y < H; y++) {
      const n = hash(x, y, 77);
      c.set(x, y, n > 0.82 ? (n > 0.92 ? P.flowerPink : P.flowerGold) : n > 0.5 ? P.leafDark : P.leaf);
    }
  }
  // Lamp posts at the corners of the street.
  for (const lx of [64, 116]) {
    for (let y = 160; y < 178; y++) c.set(lx, y, P.ink);
    c.shape(rectBox(lx - 2, 155, 5, 5), inRect(lx - 2, 155, 5, 5), () => hex("#fff3c4"));
  }
}

/**
 * Paint the town. `facilityStatuses` lists "open", "waiting" or "empty" for
 * each of the six front-street plots, in order.
 */
export function paintTownArt(facilityStatuses = [], plots = [16, 46, 76, 106, 136, 166]) {
  const c = new Canvas();
  paintSky(c);
  paintCloud(c, 34, 20, 7);
  paintCloud(c, 132, 30, 9);
  paintCloud(c, 166, 12, 5);
  paintMountains(c);
  paintGround(c);
  paintTree(c, 66, 112, 6);
  paintTree(c, 110, 116, 5);
  paintMine(c);
  paintCastle(c);
  paintTavern(c);
  paintArchives(c);
  paintWorkshop(c);
  plots.forEach((cx, index) => paintFacility(c, cx, facilityStatuses[index] || "empty"));
  paintForeground(c);
  return { width: W, height: H, pixels: c.pixels };
}
