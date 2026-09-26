// balance-impact: none — renderer presentation cues only; gameplay rules and state mutation are unchanged.
import { getProjectionColumn } from "./renderer_projection.js";

type OpeningSide = "left" | "right";

interface SideDefinition {
  readonly side: OpeningSide;
  readonly column: -1 | 1;
  readonly blockedKey: "leftBlocked" | "rightBlocked";
  readonly edgeKey: "leftTop" | "rightTop";
}

interface OpeningCell {
  readonly valid?: unknown;
  readonly z: number;
  readonly column: number;
  readonly leftBlocked?: unknown;
  readonly rightBlocked?: unknown;
  readonly frontBlocked?: unknown;
  readonly backBlocked?: unknown;
  readonly frontOneWayBarrier?: unknown;
}

interface OpeningProjection {
  readonly xl?: { readonly length: number } | null;
}

interface SideOpeningPost {
  readonly side: OpeningSide;
  readonly z: number;
  readonly x: unknown;
  readonly top: unknown;
  readonly bottom: unknown;
  readonly width: number;
}

const SIDES: readonly SideDefinition[] = Object.freeze([
  Object.freeze({ side: "left", column: -1, blockedKey: "leftBlocked", edgeKey: "leftTop" }),
  Object.freeze({ side: "right", column: 1, blockedKey: "rightBlocked", edgeKey: "rightTop" })
]);

/**
 * Return the wall corners that frame each side opening of the centre lane.
 * Posts are derived only from the visible corridor topology (the same
 * movement truth the renderer already draws), so they never reveal a passage,
 * trap, or unvisited cell that the corridor geometry does not already show.
 */
export function getSideOpeningPosts(topology: unknown, projection: unknown): Readonly<SideOpeningPost>[] {
  const cells = new Map<string, OpeningCell>();
  (Array.isArray(topology) ? topology : []).forEach((cell: unknown) => {
    const openingCell = cell as OpeningCell | null | undefined;
    if (openingCell?.valid) cells.set(`${openingCell.z}:${openingCell.column}`, openingCell);
  });
  const openingProjection = projection as OpeningProjection | null | undefined;
  const depthCount = openingProjection?.xl?.length ?? 0;
  const posts = new Map<string, Readonly<SideOpeningPost>>();
  // Posts are drawn over every cell, so centre cells hidden behind the front
  // wall (reachable only by looping around a side column) must not frame any.
  let lastVisibleDepth = 0;
  while (cells.has(`${lastVisibleDepth}:0`) && !cells.get(`${lastVisibleDepth}:0`)!.frontBlocked) {
    lastVisibleDepth += 1;
  }

  cells.forEach((cell) => {
    if (cell.column !== 0 || cell.z > lastVisibleDepth) return;
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
        const plane = getProjectionColumn(openingProjection, depth, 0);
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
