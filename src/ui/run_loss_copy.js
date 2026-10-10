import { MATERIAL_TYPES } from "../data/materials.js";

// History records the settled total, not how much came from each protection
// mechanism. Describe that total without inventing a cause or a lost amount.
export function hasMaterialRecord(run) {
  return run.bankedMaterials !== null && typeof run.bankedMaterials === "object" &&
    !Array.isArray(run.bankedMaterials);
}

export function getRunLossCopy(run) {
  const items = [];
  if (Number.isInteger(run.lostSupplyCount) && run.lostSupplyCount > 0) {
    items.push(`未使用の持ち込み品 ${run.lostSupplyCount}個`);
  }
  // Legacy lostUnidentifiedCount records discoveries, including equipment left
  // in chests. It cannot establish how many owned items settlement removed.
  const materials = MATERIAL_TYPES.flatMap(name => {
    const quantity = run.bankedMaterials?.[name];
    return Number.isInteger(quantity) && quantity > 0 ? [`${name} ×${quantity}`] : [];
  }).join("、");
  return {
    items,
    materials: materials
      ? `街に残った素材：${materials}。`
      : hasMaterialRecord(run) ? "街に残った素材なし。" : "街に残った素材の内訳は未記録。"
  };
}
