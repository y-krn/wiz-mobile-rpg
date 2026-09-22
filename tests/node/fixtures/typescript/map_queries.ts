import { findMapCellByType } from "../../../../src/rules/map_queries.js";

const generatedMap: readonly (readonly { readonly type: string }[])[] = [
  [{ type: "stairs-up" }, { type: "floor" }]
];
const generatedResult = findMapCellByType(generatedMap, "stairs-up");

const migratedMap: readonly (readonly { readonly type: unknown }[])[] = [
  [{ type: 7 }, { type: null }, { type: false }]
];
const broadType: unknown = 7;
const migratedResult = findMapCellByType(migratedMap, broadType);

void generatedResult;
void migratedResult;
