import type { ChestPropGeometry } from "../../../../src/chest_prop";
import {
  CHEST_PROP_STYLES as stylesFromOwner,
  getChestPropGeometry as geometryFromOwner,
  getChestPropPalette as paletteFromOwner,
  getChestPropStyle as styleFromOwner
} from "../../../../src/chest_prop";
import {
  CHEST_PROP_STYLES as stylesFromFacade,
  getChestPropGeometry as geometryFromFacade,
  getChestPropPalette as paletteFromFacade,
  getChestPropStyle as styleFromFacade
} from "../../../../src/chest_prop.js";
import {
  BASE_GEOMETRY,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile,
  getWorldObjectProjection
} from "../../../../src/rules/renderer_projection.js";

export function exerciseChestPropProjectionTypes(width: number, height: number, depth: number): number[] {
  const projection = getProjectionPlanes(BASE_GEOMETRY, getProjectionProfile(width, height));
  const column = getProjectionColumn(projection, depth);
  const worldObject = getWorldObjectProjection(projection, depth);
  const ownerGeometry: ChestPropGeometry = geometryFromOwner(worldObject, "bone_cache");
  const facadeGeometry: ChestPropGeometry = geometryFromFacade(column, "wood_crate");
  const ownerStyle = styleFromOwner("abyss_reliquary");
  const facadeStyle = styleFromFacade("sealed_book_coffer");
  const ownerPalette = paletteFromOwner(ownerStyle);
  const facadePalette = paletteFromFacade(facadeStyle);
  return [
    ownerGeometry.width,
    facadeGeometry.width,
    ownerGeometry.lid.length,
    facadeGeometry.lid.length,
    ownerPalette.glow.length,
    facadePalette.mark.length,
    Object.keys(stylesFromOwner).length,
    Object.keys(stylesFromFacade).length
  ];
}
