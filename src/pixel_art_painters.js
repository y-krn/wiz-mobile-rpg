// balance-impact: none — pure pixel-art palette and painters for the Dungeon View (#1964).
// Pixi-free so Node tests can exercise every pattern; pixi_pixel_art.js bakes
// these into textures.

const CREAM = "#fff8ec";
const INK = "#2e2640";
export const PIXEL_TEXTURE_SIZE = 64;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function toRgb(value) {
  if (typeof value === "number") return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const match = typeof value === "string" ? value.trim().match(/^#([0-9a-f]{6})$/i) : null;
  if (!match) return [255, 255, 255];
  const hex = Number.parseInt(match[1], 16);
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(first, second, amount) {
  const t = clamp01(amount);
  const a = toRgb(first);
  const b = toRgb(second);
  return toHex(a.map((channel, index) => channel * (1 - t) + b[index] * t));
}

export function hexToNumber(value) {
  const [r, g, b] = toRgb(value);
  return (r << 16) | (g << 8) | b;
}

/**
 * Bright scene palette for one biome. The signature wall color remains the
 * accent (trim, sparkles, props) while surfaces are pastel tints of it.
 */
export function getPixelScenePalette(wallColor) {
  const accent = typeof wallColor === "string" && /^#[0-9a-f]{6}$/i.test(wallColor) ? wallColor : "#58d6e8";
  const wallBase = mixHex(accent, "#e9d8bb", 0.66);
  const floorBase = mixHex(accent, "#c7a882", 0.78);
  const ceilingBase = mixHex(accent, "#fbf3e2", 0.7);
  return Object.freeze({
    accent,
    ink: mixHex(accent, INK, 0.8),
    fog: mixHex(accent, CREAM, 0.8),
    skyTop: mixHex(accent, "#fffdf6", 0.62),
    skyBottom: mixHex(accent, CREAM, 0.86),
    groundTop: mixHex(floorBase, CREAM, 0.35),
    groundBottom: floorBase,
    wall: Object.freeze({
      base: wallBase,
      light: mixHex(wallBase, "#ffffff", 0.5),
      dark: mixHex(wallBase, INK, 0.2),
      mortar: mixHex(wallBase, INK, 0.36),
      moss: mixHex(accent, "#7fb069", 0.55)
    }),
    floor: Object.freeze({
      base: floorBase,
      light: mixHex(floorBase, "#ffffff", 0.3),
      dark: mixHex(floorBase, INK, 0.2),
      grout: mixHex(floorBase, INK, 0.38)
    }),
    ceiling: Object.freeze({
      base: ceilingBase,
      light: mixHex(ceilingBase, "#ffffff", 0.5),
      dark: mixHex(ceilingBase, INK, 0.14),
      beam: mixHex(ceilingBase, INK, 0.3)
    })
  });
}

export function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const pick = (random, items) => items[Math.floor(random() * items.length) % items.length];

// ---------------------------------------------------------------------------
// Wall patterns (#1964). Each biome names one in visualSignature.surfaces.
// ---------------------------------------------------------------------------

export function paintBricks(ctx, size, tones, random) {
  const brickW = 16;
  const brickH = 8;
  ctx.fillStyle = tones.mortar;
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size / brickH; row += 1) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col <= size / brickW; col += 1) {
      const x = col * brickW + offset;
      const y = row * brickH;
      const shade = random();
      ctx.fillStyle = shade < 0.18 ? tones.dark : shade > 0.86 ? tones.light : tones.base;
      ctx.fillRect(x + 1, y + 1, brickW - 1, brickH - 1);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 1, y + 1, brickW - 2, 1);
      ctx.fillStyle = tones.dark;
      ctx.fillRect(x + 1, y + brickH - 1, brickW - 1, 1);
      ctx.fillStyle = tones.dark;
      ctx.fillRect(x + brickW - 1, y + 1, 1, brickH - 1);
      if (random() < 0.35) {
        ctx.fillStyle = tones.dark;
        ctx.fillRect(x + 3 + Math.floor(random() * 9), y + 3 + Math.floor(random() * 3), 2, 1);
      }
    }
  }
  for (let index = 0; index < 14; index += 1) {
    ctx.fillStyle = tones.moss;
    ctx.fillRect(Math.floor(random() * size), size - 1 - Math.floor(random() * 3), 1 + Math.floor(random() * 2), 1);
  }
}

// Mine: rough rock face of uneven boulders with ore glints and a timber prop.
function paintRockFace(ctx, size, tones, random, palette) {
  ctx.fillStyle = tones.mortar;
  ctx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const rowH = 7 + Math.floor(random() * 7);
    let x = -Math.floor(random() * 8);
    while (x < size) {
      const w = 8 + Math.floor(random() * 14);
      const shade = random();
      ctx.fillStyle = shade < 0.28 ? tones.dark : shade > 0.8 ? tones.light : tones.base;
      // Rounded boulder: chop the corners by one pixel.
      ctx.fillRect(x + 2, y + 1, w - 3, rowH - 2);
      ctx.fillRect(x + 1, y + 2, w - 1, rowH - 4);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 2, y + 1, Math.max(1, w - 5), 1);
      ctx.fillStyle = tones.dark;
      ctx.fillRect(x + 2, y + rowH - 2, w - 3, 1);
      x += w;
    }
    y += rowH;
  }
  for (let index = 0; index < 6; index += 1) {
    const cx = Math.floor(random() * (size - 4));
    const cy = Math.floor(random() * (size - 4));
    ctx.fillStyle = palette.accent;
    ctx.fillRect(cx, cy, 2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx, cy, 1, 1);
  }
  // Timber prop on the left edge so repeated segments read as shored tunnels.
  ctx.fillStyle = "#8a6242";
  ctx.fillRect(1, 0, 5, size);
  ctx.fillStyle = "#b08560";
  ctx.fillRect(1, 0, 1, size);
  ctx.fillStyle = "#5c3e28";
  ctx.fillRect(5, 0, 1, size);
  ctx.fillStyle = "#8a6242";
  ctx.fillRect(0, 2, size, 4);
  ctx.fillStyle = "#b08560";
  ctx.fillRect(0, 2, size, 1);
  ctx.fillStyle = "#5c3e28";
  ctx.fillRect(0, 5, size, 1);
}

// Catacomb: ashlar blocks with a band of arched burial niches holding skulls.
function paintOssuary(ctx, size, tones, random) {
  ctx.fillStyle = tones.mortar;
  ctx.fillRect(0, 0, size, size);
  const blockW = 32;
  const blockH = 12;
  for (let row = 0; row * blockH < size; row += 1) {
    const offset = row % 2 ? blockW / 2 : 0;
    for (let col = -1; col * blockW < size; col += 1) {
      const x = col * blockW + offset;
      const y = row * blockH;
      ctx.fillStyle = random() < 0.2 ? tones.dark : tones.base;
      ctx.fillRect(x + 1, y + 1, blockW - 1, blockH - 1);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 1, y + 1, blockW - 2, 1);
    }
  }
  // Niche band.
  const bandY = 22;
  const bandH = 20;
  ctx.fillStyle = tones.dark;
  ctx.fillRect(0, bandY - 2, size, bandH + 4);
  ctx.fillStyle = tones.light;
  ctx.fillRect(0, bandY - 2, size, 1);
  ctx.fillRect(0, bandY + bandH + 1, size, 1);
  for (let x = 2; x < size; x += 16) {
    ctx.fillStyle = tones.mortar;
    ctx.fillRect(x + 2, bandY + 3, 10, bandH - 4);
    ctx.fillRect(x + 3, bandY + 2, 8, 1);
    ctx.fillRect(x + 4, bandY + 1, 6, 1);
    // Skull: cream dome, two eye sockets, a jaw.
    ctx.fillStyle = "#f4ead2";
    ctx.fillRect(x + 4, bandY + 8, 6, 5);
    ctx.fillRect(x + 5, bandY + 13, 4, 2);
    ctx.fillStyle = "#3a2e22";
    ctx.fillRect(x + 5, bandY + 10, 1, 2);
    ctx.fillRect(x + 8, bandY + 10, 1, 2);
    ctx.fillRect(x + 6, bandY + 14, 2, 1);
    if (random() < 0.5) {
      ctx.fillStyle = "#e4d6b6";
      ctx.fillRect(x + 3, bandY + 16, 8, 1);
    }
  }
}

// Rift: layered strata cut by silk strands that sag between anchor points.
function paintStrata(ctx, size, tones, random) {
  ctx.fillStyle = tones.base;
  ctx.fillRect(0, 0, size, size);
  let y = 0;
  let band = 0;
  while (y < size) {
    const h = 5 + Math.floor(random() * 6);
    ctx.fillStyle = band % 3 === 0 ? tones.dark : band % 3 === 1 ? tones.base : tones.light;
    for (let x = 0; x < size; x += 4) {
      const wave = Math.round(Math.sin((x + band * 11) / 9) * 1.5);
      ctx.fillRect(x, y + wave, 4, h);
    }
    ctx.fillStyle = tones.mortar;
    for (let x = 0; x < size; x += 4) {
      const wave = Math.round(Math.sin((x + band * 11) / 9) * 1.5);
      ctx.fillRect(x, y + h - 1 + wave, 4, 1);
    }
    y += h;
    band += 1;
  }
  // Silk strands.
  ctx.fillStyle = "#fbf6ff";
  for (let strand = 0; strand < 3; strand += 1) {
    const x0 = Math.floor(random() * size);
    const y0 = Math.floor(random() * 20);
    const length = 18 + Math.floor(random() * 24);
    for (let step = 0; step < length; step += 1) {
      ctx.fillRect(x0 + step, y0 + Math.round(Math.sin(step / length * Math.PI) * 8) + Math.floor(step / 3), 1, 1);
    }
  }
  for (let index = 0; index < 10; index += 1) {
    ctx.fillStyle = tones.moss;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 2, 1);
  }
}

// Library: shelves of book spines in varied heights and bindings.
function paintBookshelf(ctx, size, tones, random, palette) {
  const wood = "#9b6b45";
  const woodLight = "#c49468";
  const woodDark = "#6a4529";
  ctx.fillStyle = woodDark;
  ctx.fillRect(0, 0, size, size);
  const bindings = [palette.accent, "#d9645a", "#e8b04f", "#6c8fd8", "#7fb069", "#b07cc9", "#efe3c8"];
  const shelfH = 16;
  for (let shelf = 0; shelf < size / shelfH; shelf += 1) {
    const top = shelf * shelfH;
    let x = 1;
    while (x < size - 1) {
      const w = 2 + Math.floor(random() * 3);
      const h = 9 + Math.floor(random() * 4);
      if (random() < 0.08) {
        x += w;
        continue;
      }
      const color = pick(random, bindings);
      ctx.fillStyle = color;
      ctx.fillRect(x, top + shelfH - 3 - h, w, h);
      ctx.fillStyle = mixHex(color, "#ffffff", 0.45);
      ctx.fillRect(x, top + shelfH - 3 - h, 1, h);
      ctx.fillStyle = mixHex(color, INK, 0.4);
      ctx.fillRect(x, top + shelfH - 3 - h + 2, w, 1);
      x += w + (random() < 0.2 ? 1 : 0);
    }
    ctx.fillStyle = wood;
    ctx.fillRect(0, top + shelfH - 3, size, 3);
    ctx.fillStyle = woodLight;
    ctx.fillRect(0, top + shelfH - 3, size, 1);
  }
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size - 2, 0, 2, size);
}

// Forge: riveted iron plates with warm seams.
function paintIronPlate(ctx, size, tones, random) {
  ctx.fillStyle = tones.mortar;
  ctx.fillRect(0, 0, size, size);
  const plate = 32;
  for (let y = 0; y < size; y += plate / 2) {
    const offset = (y / (plate / 2)) % 2 ? plate / 2 : 0;
    for (let x = -plate; x < size; x += plate) {
      const px = x + offset;
      ctx.fillStyle = random() < 0.25 ? tones.dark : tones.base;
      ctx.fillRect(px + 1, y + 1, plate - 2, plate / 2 - 2);
      ctx.fillStyle = tones.light;
      ctx.fillRect(px + 1, y + 1, plate - 2, 1);
      ctx.fillStyle = tones.dark;
      ctx.fillRect(px + 1, y + plate / 2 - 2, plate - 2, 1);
      ctx.fillStyle = "#4a3a32";
      [[3, 3], [plate - 5, 3], [3, plate / 2 - 5], [plate - 5, plate / 2 - 5]].forEach(([rx, ry]) => {
        ctx.fillRect(px + rx, y + ry, 2, 2);
      });
      ctx.fillStyle = "#fff1d6";
      [[3, 3], [plate - 5, 3]].forEach(([rx, ry]) => ctx.fillRect(px + rx, y + ry, 1, 1));
    }
  }
  // Heat-tinted seam along the bottom.
  ctx.fillStyle = "#ff9a4a";
  ctx.fillRect(0, size - 3, size, 1);
  ctx.fillStyle = "#ffd08a";
  for (let index = 0; index < 5; index += 1) ctx.fillRect(Math.floor(random() * size), size - 3, 3, 1);
}

// Abyss: smooth void stone with star specks and faint carved runes.
function paintVoidStone(ctx, size, tones, random, palette) {
  ctx.fillStyle = tones.mortar;
  ctx.fillRect(0, 0, size, size);
  const blockW = 21;
  const blockH = 21;
  for (let row = 0; row * blockH < size; row += 1) {
    for (let col = 0; col * blockW < size; col += 1) {
      const x = col * blockW + (row % 2 ? 10 : 0);
      const y = row * blockH;
      ctx.fillStyle = mixHex(tones.base, palette.accent, 0.1 + random() * 0.1);
      ctx.fillRect(x + 1, y + 1, blockW - 1, blockH - 1);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 1, y + 1, 1, blockH - 2);
    }
  }
  ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.35);
  for (let rune = 0; rune < 3; rune += 1) {
    const rx = 4 + Math.floor(random() * (size - 12));
    const ry = 4 + Math.floor(random() * (size - 12));
    ctx.fillRect(rx + 2, ry, 1, 7);
    ctx.fillRect(rx, ry + 2, 5, 1);
    ctx.fillRect(rx + (random() < 0.5 ? 0 : 4), ry + 5, 1, 2);
  }
  for (let index = 0; index < 16; index += 1) {
    ctx.fillStyle = random() < 0.5 ? "#ffffff" : mixHex(palette.accent, "#ffffff", 0.6);
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Floor patterns. Every floor stays dry and flat so the flood puddle and the
// heat grate (#1963) remain the only water and metal-grate reads on a floor.
// ---------------------------------------------------------------------------

export function paintSlabFloor(ctx, size, tones, random) {
  ctx.fillStyle = tones.grout;
  ctx.fillRect(0, 0, size, size);
  const slab = 32;
  for (let y = 0; y < size; y += slab) {
    for (let x = 0; x < size; x += slab) {
      const shade = random();
      ctx.fillStyle = shade < 0.25 ? tones.dark : tones.base;
      ctx.fillRect(x + 1, y + 1, slab - 1, slab - 1);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 1, y + 1, slab - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, slab - 2);
      ctx.fillStyle = tones.dark;
      ctx.fillRect(x + 1, y + slab - 2, slab - 1, 1);
      ctx.fillRect(x + slab - 2, y + 1, 1, slab - 1);
      for (let speck = 0; speck < 7; speck += 1) {
        ctx.fillStyle = random() < 0.6 ? tones.dark : tones.light;
        ctx.fillRect(x + 3 + Math.floor(random() * (slab - 7)), y + 3 + Math.floor(random() * (slab - 7)), 1 + Math.floor(random() * 2), 1);
      }
    }
  }
}

// Mine: packed dirt strewn with pebbles.
function paintGravel(ctx, size, tones, random) {
  ctx.fillStyle = tones.base;
  ctx.fillRect(0, 0, size, size);
  for (let index = 0; index < 120; index += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() < 0.5 ? tones.dark : tones.light;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let index = 0; index < 26; index += 1) {
    const x = Math.floor(random() * (size - 4));
    const y = Math.floor(random() * (size - 3));
    const w = 2 + Math.floor(random() * 3);
    ctx.fillStyle = tones.grout;
    ctx.fillRect(x, y + 1, w, 2);
    ctx.fillStyle = tones.light;
    ctx.fillRect(x, y, w, 1);
  }
}

// Rift: dry earth split by a branching crack network.
function paintCrackedEarth(ctx, size, tones, random) {
  ctx.fillStyle = tones.base;
  ctx.fillRect(0, 0, size, size);
  for (let index = 0; index < 40; index += 1) {
    ctx.fillStyle = random() < 0.5 ? tones.light : tones.dark;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 2, 1);
  }
  ctx.fillStyle = tones.grout;
  for (let crack = 0; crack < 6; crack += 1) {
    let x = Math.floor(random() * size);
    let y = Math.floor(random() * size);
    for (let step = 0; step < 14 + Math.floor(random() * 12); step += 1) {
      ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
      x += random() < 0.5 ? 1 : -1;
      y += random() < 0.6 ? 1 : 0;
    }
  }
}

// Library: dry wooden floorboards.
function paintPlanks(ctx, size, tones, random) {
  const plankW = 8;
  for (let x = 0; x < size; x += plankW) {
    const shade = random();
    const base = mixHex(tones.base, "#b58358", 0.45);
    ctx.fillStyle = shade < 0.3 ? mixHex(base, INK, 0.12) : shade > 0.8 ? mixHex(base, "#ffffff", 0.18) : base;
    ctx.fillRect(x, 0, plankW, size);
    ctx.fillStyle = mixHex(base, INK, 0.38);
    ctx.fillRect(x + plankW - 1, 0, 1, size);
    const joint = Math.floor(random() * size);
    ctx.fillRect(x, joint, plankW - 1, 1);
    ctx.fillStyle = mixHex(base, "#ffffff", 0.3);
    ctx.fillRect(x, 0, 1, size);
    ctx.fillStyle = mixHex(base, INK, 0.22);
    for (let grain = 0; grain < 3; grain += 1) {
      ctx.fillRect(x + 2 + Math.floor(random() * 4), Math.floor(random() * size), 1, 4 + Math.floor(random() * 6));
    }
  }
}

// Forge: basalt cobbles with thin ember veins (not a grate).
function paintBasalt(ctx, size, tones, random) {
  ctx.fillStyle = tones.grout;
  ctx.fillRect(0, 0, size, size);
  const cell = 16;
  for (let row = 0; row < size / cell; row += 1) {
    const offset = row % 2 ? cell / 2 : 0;
    for (let col = -1; col < size / cell; col += 1) {
      const x = col * cell + offset;
      const y = row * cell;
      ctx.fillStyle = random() < 0.3 ? tones.dark : tones.base;
      ctx.fillRect(x + 2, y + 1, cell - 3, cell - 2);
      ctx.fillRect(x + 1, y + 2, cell - 1, cell - 4);
      ctx.fillStyle = tones.light;
      ctx.fillRect(x + 2, y + 1, cell - 4, 1);
    }
  }
  ctx.fillStyle = "#f2894a";
  for (let vein = 0; vein < 3; vein += 1) {
    let x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    for (let step = 0; step < 8; step += 1) {
      ctx.fillRect(x % size, (y + Math.floor(step / 2)) % size, 1, 1);
      x += 1;
    }
  }
}

// Abyss: polished obsidian tiles with a diagonal sheen and star specks.
function paintObsidian(ctx, size, tones, random, palette) {
  ctx.fillStyle = tones.grout;
  ctx.fillRect(0, 0, size, size);
  const tile = 16;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const checker = ((x + y) / tile) % 2;
      ctx.fillStyle = checker ? tones.base : mixHex(tones.base, palette.accent, 0.18);
      ctx.fillRect(x + 1, y + 1, tile - 1, tile - 1);
      ctx.fillStyle = tones.light;
      for (let step = 0; step < 5; step += 1) ctx.fillRect(x + 3 + step, y + 8 - step, 1, 1);
    }
  }
  for (let index = 0; index < 12; index += 1) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }
}

export function paintCeiling(ctx, size, tones, random) {
  ctx.fillStyle = tones.base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = tones.light;
    ctx.fillRect(0, y + 1, size, 1);
    ctx.fillStyle = tones.dark;
    ctx.fillRect(0, y + 7, size, 1);
  }
  ctx.fillStyle = tones.beam;
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, size / 2, size, 2);
  for (let index = 0; index < 12; index += 1) {
    ctx.fillStyle = tones.dark;
    ctx.fillRect(Math.floor(random() * size), 3 + Math.floor(random() * (size - 6)), 2, 1);
  }
}

export const WALL_PATTERNS = Object.freeze({
  brick: paintBricks,
  rock_face: paintRockFace,
  ossuary: paintOssuary,
  strata: paintStrata,
  bookshelf: paintBookshelf,
  iron_plate: paintIronPlate,
  void_stone: paintVoidStone
});

export const FLOOR_PATTERNS = Object.freeze({
  slab: paintSlabFloor,
  gravel: paintGravel,
  cracked_earth: paintCrackedEarth,
  planks: paintPlanks,
  basalt: paintBasalt,
  obsidian: paintObsidian
});

// ---------------------------------------------------------------------------
// Wall decor: transparent sprites mounted on a wall face (#1964).
// ---------------------------------------------------------------------------

export const WALL_DECOR_WIDTH = 32;
export const WALL_DECOR_HEIGHT = 48;

function paintLantern(ctx, palette) {
  ctx.fillStyle = "#ffd98a";
  ctx.globalAlpha = 0.35;
  ctx.fillRect(6, 14, 20, 22);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#5c3e28";
  ctx.fillRect(15, 4, 2, 10);
  ctx.fillRect(10, 4, 12, 2);
  ctx.fillStyle = "#3a2e26";
  ctx.fillRect(11, 14, 10, 2);
  ctx.fillRect(11, 30, 10, 2);
  ctx.fillRect(11, 16, 1, 14);
  ctx.fillRect(20, 16, 1, 14);
  ctx.fillStyle = "#ffcf5c";
  ctx.fillRect(12, 16, 8, 14);
  ctx.fillStyle = "#fff4c2";
  ctx.fillRect(14, 20, 4, 7);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(15, 32, 2, 2);
}

function paintOreCluster(ctx, palette) {
  const glow = mixHex(palette.accent, "#ffffff", 0.5);
  [[8, 22, 5, 12], [14, 16, 6, 18], [21, 24, 5, 10]].forEach(([x, y, w, h]) => {
    ctx.fillStyle = mixHex(palette.accent, INK, 0.25);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = glow;
    ctx.fillRect(x + 1, y + 1, 1, h - 3);
  });
  ctx.fillStyle = "#6b5a4a";
  ctx.fillRect(5, 34, 22, 4);
}

function paintSkullNiche(ctx) {
  ctx.fillStyle = "#3d3326";
  ctx.fillRect(6, 10, 20, 30);
  ctx.fillRect(8, 7, 16, 3);
  ctx.fillRect(11, 5, 10, 2);
  ctx.fillStyle = "#f4ead2";
  ctx.fillRect(10, 20, 12, 10);
  ctx.fillRect(12, 30, 8, 4);
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(12, 23, 3, 3);
  ctx.fillRect(17, 23, 3, 3);
  ctx.fillRect(15, 28, 2, 1);
  ctx.fillRect(13, 32, 1, 2);
  ctx.fillRect(16, 32, 1, 2);
  ctx.fillRect(18, 32, 1, 2);
  ctx.fillStyle = "#cdbf9f";
  ctx.fillRect(4, 40, 24, 3);
}

function paintCandleShelf(ctx) {
  ctx.fillStyle = "#7a5b3e";
  ctx.fillRect(4, 32, 24, 3);
  [[7, 20], [14, 16], [21, 22]].forEach(([x, top]) => {
    ctx.fillStyle = "#ffe9b0";
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x - 3, top - 8, 9, 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f6efe0";
    ctx.fillRect(x, top, 3, 32 - top);
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(x + 1, top - 4, 1, 3);
    ctx.fillStyle = "#fff4c2";
    ctx.fillRect(x + 1, top - 2, 1, 1);
  });
}

function paintWeb(ctx) {
  ctx.fillStyle = "#ffffff";
  const cx = 16;
  const cy = 20;
  for (let r = 0; r < 16; r += 1) {
    ctx.fillRect(cx + r, cy - r, 1, 1);
    ctx.fillRect(cx - r, cy - r, 1, 1);
    ctx.fillRect(cx + r, cy + r, 1, 1);
    ctx.fillRect(cx - r, cy + r, 1, 1);
  }
  ctx.fillRect(cx, 2, 1, 36);
  ctx.fillRect(1, cy, 30, 1);
  [5, 10, 15].forEach((ring) => {
    ctx.fillRect(cx - ring, cy - ring, ring * 2, 1);
    ctx.fillRect(cx - ring, cy + ring, ring * 2, 1);
    ctx.fillRect(cx - ring, cy - ring, 1, ring * 2);
    ctx.fillRect(cx + ring, cy - ring, 1, ring * 2);
  });
}

function paintEggSac(ctx, palette) {
  ctx.fillStyle = "#fbf6ff";
  ctx.fillRect(15, 0, 1, 12);
  [[9, 14, 14, 18], [7, 26, 10, 12], [17, 28, 9, 10]].forEach(([x, y, w, h]) => {
    ctx.fillStyle = "#e9e0f2";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.55);
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 1, y + 1, 2, 2);
  });
}

function paintArcaneBanner(ctx, palette) {
  ctx.fillStyle = "#6a4529";
  ctx.fillRect(4, 3, 24, 2);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(7, 5, 18, 34);
  ctx.fillRect(7, 39, 6, 4);
  ctx.fillRect(19, 39, 6, 4);
  ctx.fillStyle = mixHex(palette.accent, INK, 0.35);
  ctx.fillRect(7, 5, 2, 34);
  ctx.fillStyle = "#fff4c2";
  ctx.fillRect(15, 12, 2, 16);
  ctx.fillRect(11, 18, 10, 2);
  ctx.fillRect(12, 14, 1, 2);
  ctx.fillRect(19, 24, 1, 2);
}

function paintCrystalSconce(ctx, palette) {
  ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.6);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(7, 6, 18, 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#8a6242";
  ctx.fillRect(10, 28, 12, 3);
  ctx.fillRect(14, 31, 4, 8);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(13, 12, 6, 16);
  ctx.fillRect(14, 9, 4, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(14, 13, 1, 10);
}

function paintFurnaceMouth(ctx) {
  ctx.fillStyle = "#4a3a32";
  ctx.fillRect(4, 12, 24, 30);
  ctx.fillRect(7, 9, 18, 3);
  ctx.fillStyle = "#ff7a2f";
  ctx.fillRect(8, 18, 16, 20);
  ctx.fillRect(10, 15, 12, 3);
  ctx.fillStyle = "#ffcf5c";
  ctx.fillRect(10, 26, 12, 12);
  ctx.fillStyle = "#fff4c2";
  ctx.fillRect(13, 31, 6, 7);
  ctx.fillStyle = "#2e2420";
  [10, 15, 20].forEach((x) => ctx.fillRect(x, 15, 2, 23));
}

function paintWeaponRack(ctx) {
  ctx.fillStyle = "#6a4529";
  ctx.fillRect(3, 36, 26, 3);
  ctx.fillRect(3, 8, 26, 2);
  ctx.fillStyle = "#c9d3dc";
  ctx.fillRect(8, 10, 2, 22);
  ctx.fillRect(22, 10, 2, 22);
  ctx.fillStyle = "#8a6242";
  ctx.fillRect(7, 30, 4, 6);
  ctx.fillRect(21, 30, 4, 6);
  ctx.fillStyle = "#e8b04f";
  ctx.fillRect(6, 29, 6, 1);
  ctx.fillRect(20, 29, 6, 1);
  ctx.fillStyle = "#7a7470";
  ctx.fillRect(13, 12, 6, 6);
  ctx.fillStyle = "#8a6242";
  ctx.fillRect(15, 18, 2, 18);
}

function paintVoidEye(ctx, palette) {
  ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.3);
  ctx.fillRect(5, 22, 22, 2);
  ctx.fillRect(8, 19, 16, 1);
  ctx.fillRect(8, 26, 16, 1);
  ctx.fillRect(11, 17, 10, 1);
  ctx.fillRect(11, 28, 10, 1);
  ctx.fillStyle = "#fff4ff";
  ctx.fillRect(9, 20, 14, 6);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(13, 19, 6, 8);
  ctx.fillStyle = "#1e0a26";
  ctx.fillRect(15, 20, 2, 6);
  ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.3);
  [[15, 8], [15, 34], [4, 14], [26, 14], [4, 32], [26, 32]].forEach(([x, y]) => ctx.fillRect(x, y, 2, 3));
}

function paintFloatingShard(ctx, palette) {
  ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.55);
  ctx.globalAlpha = 0.28;
  ctx.fillRect(8, 6, 16, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.accent;
  for (let row = 0; row < 26; row += 1) {
    const half = row < 8 ? Math.floor(row / 2) + 1 : Math.max(1, 5 - Math.floor((row - 8) / 4));
    ctx.fillRect(16 - half, 8 + row, half * 2, 1);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(15, 11, 1, 12);
  ctx.fillStyle = mixHex(palette.accent, INK, 0.4);
  ctx.fillRect(10, 40, 12, 2);
}

export const WALL_DECOR = Object.freeze({
  lantern: paintLantern,
  ore_cluster: paintOreCluster,
  skull_niche: paintSkullNiche,
  candle_shelf: paintCandleShelf,
  web: paintWeb,
  egg_sac: paintEggSac,
  arcane_banner: paintArcaneBanner,
  crystal_sconce: paintCrystalSconce,
  furnace_mouth: paintFurnaceMouth,
  weapon_rack: paintWeaponRack,
  void_eye: paintVoidEye,
  floating_shard: paintFloatingShard
});

// ---------------------------------------------------------------------------
// Discovered-trap floor decals, one per biome trapStyle (#1964). Each keeps a
// red warning ring so a known trap never reads as a gimmick tile.
// ---------------------------------------------------------------------------

export const TRAP_DECAL_SIZE = 32;
const TRAP_RED = "#ff3b30";

function paintWarningRing(ctx) {
  ctx.fillStyle = TRAP_RED;
  for (let angle = 0; angle < 64; angle += 1) {
    const t = (angle / 64) * Math.PI * 2;
    ctx.fillRect(Math.round(16 + Math.cos(t) * 14) - 1, Math.round(16 + Math.sin(t) * 14) - 1, 2, 2);
  }
}

const TRAP_DECALS = Object.freeze({
  rockfall_mark(ctx) {
    ctx.fillStyle = "#7a6a58";
    [[8, 12, 6], [17, 9, 7], [12, 19, 8]].forEach(([x, y, s]) => ctx.fillRect(x, y, s, s - 2));
    ctx.fillStyle = TRAP_RED;
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(10 + i, 10 + i, 2, 2);
      ctx.fillRect(21 - i, 10 + i, 2, 2);
    }
  },
  grave_seal(ctx) {
    ctx.fillStyle = "#cfc3a6";
    ctx.fillRect(8, 8, 16, 16);
    ctx.fillStyle = "#5a4e3e";
    ctx.fillRect(15, 10, 2, 12);
    ctx.fillRect(11, 14, 10, 2);
  },
  claw_rift(ctx) {
    ctx.fillStyle = "#2a1a30";
    [10, 15, 20].forEach((x) => {
      for (let i = 0; i < 14; i += 1) ctx.fillRect(x + Math.floor(i / 4), 9 + i, 2, 1);
    });
  },
  arcane_glyph(ctx, palette) {
    ctx.fillStyle = mixHex(palette.accent, INK, 0.2);
    for (let row = 0; row < 12; row += 1) ctx.fillRect(16 - Math.ceil(row / 2) - 1, 9 + row, Math.ceil(row / 2) * 2 + 2, 1);
    ctx.fillStyle = mixHex(palette.accent, "#ffffff", 0.55);
    for (let row = 3; row < 10; row += 1) ctx.fillRect(16 - Math.ceil(row / 2) + 1, 10 + row, Math.max(0, Math.ceil(row / 2) * 2 - 2), 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(15, 16, 2, 2);
  },
  forge_vent(ctx) {
    ctx.fillStyle = "#4a3a32";
    ctx.fillRect(9, 11, 14, 10);
    ctx.fillStyle = "#ff7a2f";
    ctx.fillRect(11, 13, 10, 6);
    ctx.fillStyle = "#ffd08a";
    ctx.fillRect(13, 15, 2, 4);
    ctx.fillRect(17, 14, 2, 5);
  },
  void_sigill(ctx, palette) {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(9, 15, 14, 2);
    ctx.fillRect(15, 9, 2, 14);
    ctx.fillStyle = "#1e0a26";
    ctx.fillRect(14, 14, 4, 4);
    ctx.fillStyle = "#fff4ff";
    ctx.fillRect(15, 15, 1, 1);
  }
});

export const TRAP_DECAL_STYLES = Object.freeze(Object.keys(TRAP_DECALS));

/** Paint one surface pattern into any 2D context; exposed for tests. */
export function paintSurfacePattern(ctx, kind, pattern, palette, seed = hashString(palette.accent)) {
  if (kind === "ceiling") return paintCeiling(ctx, PIXEL_TEXTURE_SIZE, palette.ceiling, createRandom(seed), palette);
  const painters = kind === "floor" ? FLOOR_PATTERNS : WALL_PATTERNS;
  const painter = painters[pattern] || (kind === "floor" ? paintSlabFloor : paintBricks);
  return painter(ctx, PIXEL_TEXTURE_SIZE, kind === "floor" ? palette.floor : palette.wall, createRandom(seed), palette);
}

/** Paint one wall-decor sprite; unknown ids paint nothing. Exposed for tests. */
export function paintWallDecor(ctx, decorId, palette) {
  WALL_DECOR[decorId]?.(ctx, palette);
}

/** Paint one trap decal; unknown styles fall back to the bare warning ring. */
export function paintTrapDecal(ctx, style, palette) {
  TRAP_DECALS[style]?.(ctx, palette);
  paintWarningRing(ctx);
}

/** Cache key for the textures of one palette and surface set. */
export function getPixelSurfaceKey(palette, surfaces = {}) {
  return [palette.accent, surfaces.wall || "brick", surfaces.floor || "slab", (surfaces.decor || []).join("+"), surfaces.trapStyle || ""].join("|");
}

// Distance haze in a bright scene lifts far surfaces toward the fog color
// instead of darkening them into a void.
const DEPTH_FOG = [0, 0.12, 0.26, 0.4, 0.52];

// A fractional depth (a view mid-step, #1972) blends the two nearest planes.
export function getDepthFog(depth) {
  const clamped = Math.max(0, Math.min(DEPTH_FOG.length - 1, Number(depth) || 0));
  const lower = Math.floor(clamped);
  const upper = Math.min(DEPTH_FOG.length - 1, lower + 1);
  return DEPTH_FOG[lower] + (DEPTH_FOG[upper] - DEPTH_FOG[lower]) * (clamped - lower);
}
