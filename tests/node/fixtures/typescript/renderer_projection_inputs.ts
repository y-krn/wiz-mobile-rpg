import {
  getCombatMonsterLayout as getLayoutFromOwner,
  getProjectionColumn as getColumnFromOwner,
  getProjectionPlanes as getPlanesFromOwner,
  getProjectionProfile as getProfileFromOwner,
  getWorldObjectProjection as getWorldObjectFromOwner
} from "../../../../src/rules/renderer_projection";
import {
  getCombatMonsterLayout as getLayoutFromFacade,
  getProjectionColumn as getColumnFromFacade,
  getProjectionPlanes as getPlanesFromFacade,
  getProjectionProfile as getProfileFromFacade,
  getWorldObjectProjection as getWorldObjectFromFacade
} from "../../../../src/rules/renderer_projection.js";

export function exerciseRendererProjectionTypes(legacyWidth: unknown, legacyHeight: unknown, legacyProfile: unknown, legacyProjection: unknown, legacyZ: unknown): number[] {
  const profile = getProfileFromOwner(legacyWidth, legacyHeight);
  const facadeProfile = getProfileFromFacade(legacyWidth, legacyHeight);
  const planes = getPlanesFromOwner(undefined, profile);
  const facadePlanes = getPlanesFromFacade(undefined, facadeProfile);
  const column = getColumnFromOwner(legacyProjection ?? planes, legacyZ, 0);
  const facadeColumn = getColumnFromFacade(legacyProjection ?? facadePlanes, legacyZ, 0);
  const worldObject = getWorldObjectFromOwner(legacyProjection ?? planes, legacyZ, 0);
  const facadeWorldObject = getWorldObjectFromFacade(legacyProjection ?? facadePlanes, legacyZ, 0);
  const layout = getLayoutFromOwner([{ hp: 1, name: "Biter" }], profile);
  const facadeLayout = getLayoutFromFacade([{ hp: 1, name: "Biter" }], facadeProfile);

  column.leftTop = facadeColumn.leftTop;
  facadeColumn.leftTop = column.leftTop;
  return [
    column.leftTop + facadeColumn.leftTop + worldObject.worldObject.scale + facadeWorldObject.worldObject.scale,
    layout[0]?.hitRegion.radiusX ?? 0,
    facadeLayout[0]?.hitRegion.radiusY ?? 0
  ];
}
