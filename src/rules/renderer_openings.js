// balance-impact: none — renderer presentation cues only; gameplay rules and state mutation are unchanged.
import { getProjectionColumn } from "./renderer_projection.js";

const SIDES = Object.freeze([
  Object.freeze({ side: "left", column: -1, blockedKey: "leftBlocked", edgeKey: "leftTop" }),
  Object.freeze({ side: "right", column: 1, blockedKey: "rightBlocked", edgeKey: "rightTop" })
]);

/**
 * Return the wall corners that frame each side opening of the centre lane.
 * Posts are derived only from the visible corridor topology (the same
 * movement truth the renderer already draws), so they never reveal a passage,
 * trap, or unvisited cell that the corridor geometry does not already show.
 */
export function getSideOpeningPosts(topology, projection) {
  const cells = new Map();
  (Array.isArray(topology) ? topology : []).forEach((cell) => {
    if (cell?.valid) cells.set(`${cell.z}:${cell.column}`, cell);
  });
  const depthCount = projection?.xl?.length ?? 0;
  const posts = new Map();

  cells.forEach((cell) => {
    if (cell.column !== 0) return;
    const { z } = cell;
    SIDES.forEach(({ side, column, blockedKey, edgeKey }) => {
      if (cell[blockedKey]) return;
      const passage = cells.get(`${z}:${column}`);
      if (!passage) return;
      const previous = cells.get(`${z - 1}:0`);
      const next = cells.get(`${z + 1}:0`);
      // A post stands only where a wall actually turns the corner.
      const corners = [
        { depth: z, present: passage.backBlocked || (z > 0 && previous?.[blockedKey] !== false) },
        { depth: z + 1, present: passage.frontBlocked || cell.frontBlocked || next?.[blockedKey] !== false }
      ];
      corners.forEach(({ depth, present }) => {
        const key = `${depth}:${side}`;
        if (!present || posts.has(key) || depth >= depthCount) return;
        const plane = getProjectionColumn(projection, depth, 0);
        posts.set(key, Object.freeze({
          side,
          z: depth,
          x: plane[edgeKey],
          top: plane.top,
          bottom: plane.bottom,
          width: Math.max(3, (plane.rightBottom - plane.leftBottom) * 0.06)
        }));
      });
    });
  });

  return [...posts.values()].sort((first, second) => second.z - first.z);
}
