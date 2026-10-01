// balance-impact: none — PixiJS presentation palette and procedural pixel textures.
// Derives a bright, storybook-style palette from each biome's signature color
// and bakes small nearest-filtered textures for walls, floors, and ceilings.
import { CanvasSource, Texture } from "pixi.js";

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

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createCanvas(size) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(size, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function paintBricks(ctx, size, tones, random) {
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

function paintFloor(ctx, size, tones, random) {
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

function paintCeiling(ctx, size, tones, random) {
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

function bakeTexture(painter, tones, seed) {
  const canvas = createCanvas(PIXEL_TEXTURE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  ctx.imageSmoothingEnabled = false;
  painter(ctx, PIXEL_TEXTURE_SIZE, tones, createRandom(seed));
  const source = new CanvasSource({ resource: canvas, scaleMode: "nearest", autoGenerateMipmaps: false });
  return new Texture({ source, label: "pixel-surface" });
}

/**
 * Returns wall/floor/ceiling textures for a palette. Callers own the cache and
 * must destroy the returned textures together with their sources.
 */
export function createPixelSurfaceTextures(palette) {
  const seed = hashString(palette.accent);
  return Object.freeze({
    wall: bakeTexture(paintBricks, palette.wall, seed),
    floor: bakeTexture(paintFloor, palette.floor, seed ^ 0x9e3779b9),
    ceiling: bakeTexture(paintCeiling, palette.ceiling, seed ^ 0x85ebca6b)
  });
}

// Distance haze in a bright scene lifts far surfaces toward the fog color
// instead of darkening them into a void.
export function getDepthFog(depth) {
  return [0, 0.12, 0.26, 0.4, 0.52][Math.max(0, Math.min(4, depth))];
}
