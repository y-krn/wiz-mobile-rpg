// balance-impact: none — shared read-only dungeon visibility facts for renderers.
import { DX, DY } from "../constants/directions.js";
import { isMapDirectionBlocked } from "./map_movement.js";

interface RenderableCell {
  readonly walls: readonly boolean[];
}

interface LegacyCellCandidate {
  readonly walls?: unknown;
}

interface LegacyMapRow {
  readonly [key: PropertyKey]: unknown;
}

interface LegacyMap {
  readonly [key: PropertyKey]: LegacyMapRow | null | undefined;
}

interface CorridorOffset {
  z: number;
  column: number;
}

interface InvalidCorridorTopology {
  readonly z: number;
  readonly column: number;
  readonly x: unknown;
  readonly y: unknown;
  readonly cell: null;
  readonly valid: false;
}

interface ValidCorridorTopology {
  readonly z: number;
  readonly column: number;
  readonly x: unknown;
  readonly y: unknown;
  readonly cell: RenderableCell;
  readonly valid: true;
  readonly leftBlocked: boolean;
  readonly rightBlocked: boolean;
  readonly frontWall: boolean;
  readonly frontBlocked: boolean;
  readonly backBlocked: boolean;
  readonly frontOneWayBarrier: boolean;
  readonly leftOneWayBarrier: boolean;
  readonly rightOneWayBarrier: boolean;
  readonly backOneWayBarrier: boolean;
}

type CorridorTopology = InvalidCorridorTopology | ValidCorridorTopology;

export function isRenderableCorridorCell(cell: unknown): unknown {
  const candidate = cell as LegacyCellCandidate | null | undefined;
  return candidate && Array.isArray(candidate.walls) && candidate.walls.length === 4 &&
    candidate.walls.every(wall => typeof wall === "boolean");
}

/**
 * World objects use only the forward centre cells already admitted by the
 * renderer topology. Wall occlusion is applied by the Pixi layer order after
 * this visibility fact is consumed; object-specific visibility is forbidden.
 */
export function isVisibleWorldObjectCell(topology: unknown): unknown {
  const candidate = topology as {
    readonly valid?: unknown;
    readonly z?: unknown;
    readonly column?: unknown;
    readonly cell?: unknown;
  } | null | undefined;
  return candidate?.valid === true && (candidate.z as number) > 0 && candidate.column === 0 &&
    isRenderableCorridorCell(candidate.cell);
}

/**
 * Return the map cells visible from the player through the same directed
 * movement rules used by exploration. The result is renderer-neutral and
 * consumed by the Pixi presentation.
 */
export function getVisibleCorridorCells(
  map: unknown,
  px: unknown,
  py: unknown,
  dir: unknown,
  maxDepth: unknown = 3,
  maxColumn: unknown = 2
): CorridorOffset[] {
  const legacyMap = map as LegacyMap | null | undefined;
  const dirRight = ((dir as number) + 1) % 4;
  const offsets: CorridorOffset[] = [{ z: 0, column: 0 }];
  const queue: CorridorOffset[] = [{ z: 0, column: 0 }];
  const seen = new Set(["0:0"]);

  const visit = (z: number, column: number) => {
    if (z < 0 || z > (maxDepth as number) || column < -(maxColumn as number) || column > (maxColumn as number)) return;
    const key = `${z}:${column}`;
    if (seen.has(key)) return;
    const x = (px as number) + DX[dir as number] * z + DX[dirRight] * column;
    const y = (py as number) + DY[dir as number] * z + DY[dirRight] * column;
    if (!isRenderableCorridorCell(legacyMap?.[y as PropertyKey]?.[x as PropertyKey])) return;
    seen.add(key);
    offsets.push({ z, column });
    queue.push({ z, column });
  };

  while (queue.length > 0) {
    const { z, column } = queue.shift()!;
    const x = (px as number) + DX[dir as number] * z + DX[dirRight] * column;
    const y = (py as number) + DY[dir as number] * z + DY[dirRight] * column;
    const neighbors = [
      { z: z + 1, column, moveDir: dir },
      { z: z - 1, column, moveDir: ((dir as number) + 2) % 4 },
      { z, column: column + 1, moveDir: dirRight },
      { z, column: column - 1, moveDir: (dirRight + 2) % 4 },
    ];
    for (const neighbor of neighbors) {
      if (isMapDirectionBlocked(map, x, y, neighbor.moveDir)) continue;
      visit(neighbor.z, neighbor.column);
    }
  }

  return offsets;
}

/**
 * Add the wall facts needed by a dungeon projection to every visible cell.
 * `frontBlocked` intentionally includes malformed/out-of-bounds destinations
 * and one-way entrances because that is the canonical movement contract.
 */
export function getVisibleCorridorTopology(
  map: unknown,
  px: unknown,
  py: unknown,
  dir: unknown,
  maxDepth: unknown = 3,
  maxColumn: unknown = 2
): CorridorTopology[] {
  const legacyMap = map as LegacyMap | null | undefined;
  const dirRight = ((dir as number) + 1) % 4;
  return getVisibleCorridorCells(map, px, py, dir, maxDepth, maxColumn).map(({ z, column }) => {
    const x = (px as number) + DX[dir as number] * z + DX[dirRight] * column;
    const y = (py as number) + DY[dir as number] * z + DY[dirRight] * column;
    const cell = legacyMap?.[y as PropertyKey]?.[x as PropertyKey];
    if (!isRenderableCorridorCell(cell)) {
      return Object.freeze({ z, column, x, y, cell: null, valid: false });
    }

    const renderableCell = cell as RenderableCell;
    const leftDir = ((dir as number) + 3) % 4;
    const backDir = ((dir as number) + 2) % 4;
    const frontWall = Boolean(renderableCell.walls[dir as number]);
    const frontBlocked = isMapDirectionBlocked(map, x, y, dir);
    const leftBlocked = isMapDirectionBlocked(map, x, y, leftDir);
    const rightBlocked = isMapDirectionBlocked(map, x, y, dirRight);
    const backBlocked = isMapDirectionBlocked(map, x, y, backDir);
    return Object.freeze({
      z,
      column,
      x,
      y,
      cell: renderableCell,
      valid: true,
      leftBlocked,
      rightBlocked,
      frontWall,
      frontBlocked,
      backBlocked,
      frontOneWayBarrier: !frontWall && frontBlocked,
      leftOneWayBarrier: !renderableCell.walls[leftDir] && leftBlocked,
      rightOneWayBarrier: !renderableCell.walls[dirRight] && rightBlocked,
      backOneWayBarrier: !renderableCell.walls[backDir] && backBlocked
    });
  });
}
