import {
  getVisibleCorridorCells,
  getVisibleCorridorTopology,
  isRenderableCorridorCell,
  isVisibleWorldObjectCell
} from "../../../../src/rules/renderer_topology.js";

export function exerciseRendererTopologyInputs() {
  const generatedMap = [[{ walls: [false, false, false, false], blockEnter: [false, false, false, false] }]];
  const partialMap: unknown = [[{ walls: [false, false, false, false] }]];
  const cell: unknown = { walls: [true, true, true, true] };
  const topology: unknown = { valid: true, z: 1, column: 0, cell };
  const px: unknown = 0;
  const py: unknown = "0";
  const dir: unknown = "0";
  const maxDepth: unknown = 3;
  const maxColumn: unknown = 2;

  return [
    isRenderableCorridorCell(cell),
    isVisibleWorldObjectCell(topology),
    getVisibleCorridorCells(generatedMap, px, py, dir, maxDepth, maxColumn),
    getVisibleCorridorTopology(partialMap, px, py, dir, maxDepth, maxColumn)
  ];
}
