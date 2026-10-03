// balance-impact: none — presentation-only placement of wall decor (#1964).
//
// A wall face is one cell side: (x, y, dir). Its decor is a pure function of
// the run seed, floor, and face, so the same face shows the same decor from
// every viewpoint and on every revisit, and nothing is stored in the save.

/** Share of wall faces that carry a decor sprite. */
export const WALL_DECOR_DENSITY = 0.14;

function hashFace(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Final avalanche so neighboring faces do not share low bits.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return (hash >>> 0) / 0x100000000;
}

/**
 * Index into the biome's decor list for the wall face, or -1 for a bare wall.
 */
export function getWallDecorIndex({ seed = "", floor = 1, x, y, dir, count, density = WALL_DECOR_DENSITY }) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const roll = hashFace(`${seed}:${floor}:${x},${y}:${dir}`);
  if (roll >= density) return -1;
  return Math.min(count - 1, Math.floor((roll / density) * count));
}
