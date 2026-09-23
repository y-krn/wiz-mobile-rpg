import { isMapDirectionBlocked } from "../../../../src/rules/map_movement.js";

export function exerciseMapMovementTypes() {
  const generatedMap = [[{
    walls: [false, false, false, false],
    blockEnter: [false, false, false, false],
    type: "floor"
  }]];
  const partialMap: unknown = [[{ walls: [false, false, false, false] }]];
  const x: unknown = 0;
  const y: unknown = 0;
  const dir: unknown = "0";

  return [
    isMapDirectionBlocked(generatedMap, 0, 0, 0),
    isMapDirectionBlocked(partialMap, x, y, dir),
    isMapDirectionBlocked(generatedMap, x, y, dir),
  ];
}
