import type { ProjectionColumn, WorldObjectProjection } from "../../../../src/rules/renderer_projection.js";
import {
  getDungeonPropBase as getBaseFromOwner,
  getSpringPropGeometry as getSpringFromOwner,
  getStairsPropGeometry as getStairsFromOwner,
  getDungeonPropPalette as getPaletteFromOwner
} from "../../../../src/dungeon_prop";
import {
  getDungeonPropBase as getBaseFromFacade,
  getSpringPropGeometry as getSpringFromFacade,
  getStairsPropGeometry as getStairsFromFacade,
  getDungeonPropPalette as getPaletteFromFacade
} from "../../../../src/dungeon_prop.js";
import {
  BASE_GEOMETRY,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile,
  getWorldObjectProjection
} from "../../../../src/rules/renderer_projection.js";

export function exerciseDungeonPropProjectionTypes(width: number, height: number, z: unknown): number[] {
  const projection = getProjectionPlanes(BASE_GEOMETRY, getProjectionProfile(width, height));
  const column: ProjectionColumn = getProjectionColumn(projection, z);
  const worldObject: WorldObjectProjection = getWorldObjectProjection(projection, z);
  const ownerBase = getBaseFromOwner(worldObject, 0.42);
  const facadeBase = getBaseFromFacade(column, 0.42);
  const ownerSpring = getSpringFromOwner(worldObject);
  const facadeSpring = getSpringFromFacade(column);
  const ownerStairs = getStairsFromOwner(worldObject, "up", "catacomb_arch");
  const facadeStairs = getStairsFromFacade(column, "down", "rough_stone");
  const ownerPalette = getPaletteFromOwner("spring");
  const facadePalette = getPaletteFromFacade("stairs", "#58d6e8", "up");
  return [ownerBase.width, facadeBase.width, ownerSpring.width, facadeSpring.width, ownerStairs.width, facadeStairs.width, ownerPalette.basin, facadePalette.stone];
}
