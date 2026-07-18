import { BIOMES, getBiomeForFloor } from "./biomes.js";

export const FLOOR_THEMES = Object.freeze(Object.fromEntries(
  BIOMES.map((biome, index) => [index + 1, Object.freeze({
    id: biome.id,
    name: biome.name,
    cssClass: biome.cssClass,
    ...biome.theme
  })])
));

export function getFloorTheme(floor) {
  const biome = getBiomeForFloor(floor);
  return Object.freeze({
    id: biome.id,
    name: biome.name,
    cssClass: biome.cssClass,
    ...biome.theme
  });
}

export function getVisitedFloors(stateInstance) {
  return stateInstance.dungeonMemory?.visitedFloors || [];
}

export function isFloorVisited(stateInstance, floor) {
  return getVisitedFloors(stateInstance).includes(Number(floor));
}

export function revealFloor(stateInstance, floor) {
  stateInstance.dungeonMemory ||= { traps: {}, mapFragments: {} };
  stateInstance.dungeonMemory.visitedFloors ||= [];
  const value = Number(floor);
  if (stateInstance.dungeonMemory.visitedFloors.includes(value)) return false;
  stateInstance.dungeonMemory.visitedFloors.push(value);
  stateInstance.dungeonMemory.visitedFloors.sort((a, b) => a - b);
  const theme = getFloorTheme(value);
  [...(stateInstance.contracts || []), stateInstance.activeContract]
    .filter(contract => contract?.locationFloor === value)
    .forEach(contract => {
      contract.name = contract.name.replaceAll("???", theme.name);
      contract.description = contract.description.replaceAll("???", theme.name);
    });
  return true;
}

export function getFloorDisplayName(stateInstance, floor) {
  const theme = getFloorTheme(floor);
  return isFloorVisited(stateInstance, floor) ? theme.name : "???";
}

export function getFloorLabel(stateInstance, floor) {
  return `${getFloorDisplayName(stateInstance, floor)}（地下${floor}階）`;
}
