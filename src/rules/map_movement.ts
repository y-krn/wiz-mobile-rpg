import { DX, DY } from "../constants/directions.js";

interface MapMovementCell {
  readonly walls: readonly boolean[];
  readonly blockEnter: readonly boolean[];
}

type LegacyMapRow = { readonly [key: PropertyKey]: unknown };
type LegacyMap = { readonly [key: PropertyKey]: LegacyMapRow | null | undefined };

function isMapCell(cell: unknown): cell is MapMovementCell {
  const candidate = cell as { readonly walls?: unknown; readonly blockEnter?: unknown } | null | undefined;
  return Boolean(candidate && Array.isArray(candidate.walls) && candidate.walls.length === 4 &&
    candidate.walls.every(wall => typeof wall === "boolean") &&
    Array.isArray(candidate.blockEnter) && candidate.blockEnter.length === 4 &&
    candidate.blockEnter.every(blocked => typeof blocked === "boolean"));
}

/**
 * Return the movement truth used by both exploration input and the 3D view.
 * A missing or malformed destination is closed just like a map boundary.
 */
export function isMapDirectionBlocked(map: unknown, x: unknown, y: unknown, dir: unknown): boolean {
  const legacyMap = map as LegacyMap | null | undefined;
  const cell = legacyMap?.[y as PropertyKey]?.[x as PropertyKey];
  if (!isMapCell(cell) || cell.walls[dir as number]) return true;

  const nextX = (x as number) + DX[dir as number];
  const nextY = (y as number) + DY[dir as number];
  const destination = legacyMap?.[nextY]?.[nextX];
  if (!isMapCell(destination)) return true;

  return Boolean(destination.blockEnter?.[((dir as number) + 2) % 4]);
}
