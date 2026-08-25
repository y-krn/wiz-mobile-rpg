import { DX, DY } from "../constants/directions.js";

function isMapCell(cell) {
  return cell && Array.isArray(cell.walls) && cell.walls.length === 4 &&
    cell.walls.every(wall => typeof wall === "boolean");
}

/**
 * Return the movement truth used by both exploration input and the 3D view.
 * A missing or malformed destination is closed just like a map boundary.
 */
export function isMapDirectionBlocked(map, x, y, dir) {
  const cell = map?.[y]?.[x];
  if (!isMapCell(cell) || cell.walls[dir]) return true;

  const nextX = x + DX[dir];
  const nextY = y + DY[dir];
  const destination = map?.[nextY]?.[nextX];
  if (!isMapCell(destination)) return true;

  return Boolean(destination.blockEnter?.[(dir + 2) % 4]);
}
