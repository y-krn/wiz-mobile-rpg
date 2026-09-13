// balance-impact: none — shared read-only dungeon visibility facts for renderers.
import { DX, DY } from "../constants/directions.js";
import { isMapDirectionBlocked } from "./map_movement.js";

export function isRenderableCorridorCell(cell) {
  return cell && Array.isArray(cell.walls) && cell.walls.length === 4 &&
    cell.walls.every(wall => typeof wall === "boolean");
}

/**
 * Return the map cells visible from the player through the same directed
 * movement rules used by exploration. The result is renderer-neutral; Canvas
 * and Pixi decide independently how to present these cells.
 */
export function getVisibleCorridorCells(map, px, py, dir, maxDepth = 3, maxColumn = 2) {
  const dirRight = (dir + 1) % 4;
  const offsets = [{ z: 0, column: 0 }];
  const queue = [{ z: 0, column: 0 }];
  const seen = new Set(["0:0"]);

  const visit = (z, column) => {
    if (z < 0 || z > maxDepth || column < -maxColumn || column > maxColumn) return;
    const key = `${z}:${column}`;
    if (seen.has(key)) return;
    const x = px + DX[dir] * z + DX[dirRight] * column;
    const y = py + DY[dir] * z + DY[dirRight] * column;
    if (!isRenderableCorridorCell(map?.[y]?.[x])) return;
    seen.add(key);
    offsets.push({ z, column });
    queue.push({ z, column });
  };

  while (queue.length > 0) {
    const { z, column } = queue.shift();
    const x = px + DX[dir] * z + DX[dirRight] * column;
    const y = py + DY[dir] * z + DY[dirRight] * column;
    const neighbors = [
      { z: z + 1, column, moveDir: dir },
      { z: z - 1, column, moveDir: (dir + 2) % 4 },
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
export function getVisibleCorridorTopology(map, px, py, dir, maxDepth = 3, maxColumn = 2) {
  const dirRight = (dir + 1) % 4;
  return getVisibleCorridorCells(map, px, py, dir, maxDepth, maxColumn).map(({ z, column }) => {
    const x = px + DX[dir] * z + DX[dirRight] * column;
    const y = py + DY[dir] * z + DY[dirRight] * column;
    const cell = map?.[y]?.[x];
    if (!isRenderableCorridorCell(cell)) {
      return Object.freeze({ z, column, x, y, cell: null, valid: false });
    }

    const leftDir = (dir + 3) % 4;
    const backDir = (dir + 2) % 4;
    const frontWall = Boolean(cell.walls[dir]);
    const frontBlocked = isMapDirectionBlocked(map, x, y, dir);
    const leftBlocked = isMapDirectionBlocked(map, x, y, leftDir);
    const rightBlocked = isMapDirectionBlocked(map, x, y, dirRight);
    const backBlocked = isMapDirectionBlocked(map, x, y, backDir);
    return Object.freeze({
      z,
      column,
      x,
      y,
      cell,
      valid: true,
      leftBlocked,
      rightBlocked,
      frontWall,
      frontBlocked,
      backBlocked,
      frontOneWayBarrier: !frontWall && frontBlocked,
      leftOneWayBarrier: !cell.walls[leftDir] && leftBlocked,
      rightOneWayBarrier: !cell.walls[dirRight] && rightBlocked,
      backOneWayBarrier: !cell.walls[backDir] && backBlocked
    });
  });
}
