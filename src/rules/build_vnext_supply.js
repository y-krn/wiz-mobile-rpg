// Build vNext supply rules (#1801), Phase 3 equipment trial only.
//
// 1. Run-local power comes from equipment: found gear carries an enhancement
//    grade that grows with depth, so a find can be a real upgrade over the
//    +0 starting kit.
// 2. Finds are legible: ordinary finds arrive identified. Only the gamble
//    tier (epic quality or a curse) stays unidentified, so "unknown" means
//    "strong or dangerous", not "every item".
// 3. Rule-changing Cores appear from B1 and more often, with combat Cores
//    weighted over economy Cores.
import { KNOWLEDGE_STAGES, setKnowledgeStage } from "./identification_rules.js";

export const BUILD_VNEXT_SUPPLY = Object.freeze({
  // Expected grade ≈ floor × gradePerFloor, rolled up with one uniform draw.
  gradePerFloor: 0.4,
  maxGrade: 5,
  coreChanceByRarity: Object.freeze({ magic: 0.25, rare: 0.45 }),
  corePoolWeights: Object.freeze({ combat: 3, economy: 1 }),
  coreMinFloor: 1
});

export function rollBuildVNextGrade(floor, rng = Math.random) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const grade = Math.floor(depth * BUILD_VNEXT_SUPPLY.gradePerFloor + rng());
  return Math.max(0, Math.min(BUILD_VNEXT_SUPPLY.maxGrade, grade));
}

export function isBuildVNextGamble(item) {
  return Boolean(item) && typeof item === "object" && (item.rarity === "epic" || Boolean(item.curseEffectId));
}

// Mutates a freshly generated trial item: grade for weapon/armor/shield and
// the legibility rule. Accessories get no grade (they carry no base stat).
export function applyBuildVNextSupply(item, itemType, floor, rng = Math.random) {
  if (!item || typeof item !== "object") return item;
  if (["weapon", "armor", "shield"].includes(itemType)) {
    const grade = rollBuildVNextGrade(floor, rng);
    if (grade > 0) item.enhanceLevel = grade;
  }
  if (!isBuildVNextGamble(item)) setKnowledgeStage(item, KNOWLEDGE_STAGES.FULL);
  return item;
}
