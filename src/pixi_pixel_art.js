// balance-impact: none — PixiJS presentation palette and procedural pixel textures.
// Derives a bright, storybook-style palette from each biome's signature color
// and bakes small nearest-filtered textures for walls, floors, and ceilings.
// The painters live in pixel_art_painters.js so they stay testable in Node.
import { CanvasSource, Texture } from "pixi.js";
import {
  FLOOR_PATTERNS,
  PIXEL_TEXTURE_SIZE,
  TRAP_DECAL_SIZE,
  WALL_DECOR,
  WALL_DECOR_HEIGHT,
  WALL_DECOR_WIDTH,
  WALL_PATTERNS,
  createRandom,
  hashString,
  paintBricks,
  paintCeiling,
  paintSlabFloor,
  paintTrapDecal,
  paintWallDecor
} from "./pixel_art_painters.js";

export * from "./pixel_art_painters.js";

function createCanvas(width, height = width) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function bakeCanvasTexture(width, height, paint, label) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  const source = new CanvasSource({ resource: canvas, scaleMode: "nearest", autoGenerateMipmaps: false });
  return new Texture({ source, label });
}

function bakeTexture(painter, tones, seed, palette) {
  return bakeCanvasTexture(PIXEL_TEXTURE_SIZE, PIXEL_TEXTURE_SIZE, (ctx) => {
    painter(ctx, PIXEL_TEXTURE_SIZE, tones, createRandom(seed), palette);
  }, "pixel-surface");
}

/**
 * Returns wall/floor/ceiling textures, wall-decor sprites, and the trap decal
 * for a palette and the biome's surface set. Callers own the cache and must
 * destroy every returned texture together with its source.
 */
export function createPixelSurfaceTextures(palette, surfaces = {}) {
  const seed = hashString(palette.accent);
  const decorIds = (surfaces.decor || []).filter((id) => WALL_DECOR[id]);
  return Object.freeze({
    wall: bakeTexture(WALL_PATTERNS[surfaces.wall] || paintBricks, palette.wall, seed, palette),
    floor: bakeTexture(FLOOR_PATTERNS[surfaces.floor] || paintSlabFloor, palette.floor, seed ^ 0x9e3779b9, palette),
    ceiling: bakeTexture(paintCeiling, palette.ceiling, seed ^ 0x85ebca6b, palette),
    decor: Object.freeze(decorIds.map((id) => bakeCanvasTexture(WALL_DECOR_WIDTH, WALL_DECOR_HEIGHT, (ctx) => paintWallDecor(ctx, id, palette), `wall-decor:${id}`))),
    trap: bakeCanvasTexture(TRAP_DECAL_SIZE, TRAP_DECAL_SIZE, (ctx) => paintTrapDecal(ctx, surfaces.trapStyle, palette), `trap-decal:${surfaces.trapStyle || "default"}`)
  });
}

/** Every texture in a createPixelSurfaceTextures result, for disposal and stats. */
export function listPixelSurfaceTextures(surfaces) {
  return [surfaces.wall, surfaces.floor, surfaces.ceiling, ...(surfaces.decor || []), surfaces.trap].filter(Boolean);
}
