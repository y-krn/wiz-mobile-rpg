// Compatibility facade for renderer-neutral projection/runtime imports.
// PixiJS is the only production Dungeon View renderer.
export { dungeonRenderer, setDungeonRenderer } from "./renderer_runtime.js";
export { getVisibleCorridorCells, getVisibleCorridorTopology } from "./rules/renderer_topology.js";
export {
  BASE_GEOMETRY,
  BASE_PROJECTION,
  PORTRAIT_NEAR_COVERAGE_MIN,
  WORLD_OBJECT_CELL_DEPTH,
  WORLD_OBJECT_SCALE_EXPONENT,
  getCombatMonsterLayout,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile,
  getWorldObjectProjection
} from "./rules/renderer_projection.js";
