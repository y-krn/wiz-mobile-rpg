import assert from "node:assert/strict";
import { BIOMES, getBiomeCycle, getBiomeForFloor } from "../src/data/biomes.js";
import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../src/data/milestone_merchant.js";
import { MATERIAL_DROP_BALANCE } from "../src/data/materials.js";
import { getMilestoneEventCounts, generateRunFloor } from "../src/run_map_generator.js";
import { getDepthMaterialExpectedQuantity } from "../src/rules/material_rules.js";
import { revealEquipmentOnEquip } from "../src/systems/identification.js";
import { purchaseMilestoneStock, purchaseMilestoneUncurse } from "../src/systems/milestone_merchant.js";
import { recordMilestoneVictory } from "../src/state/run_state.js";

const failures = [];
function check(label, fn) {
  try {
    fn();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`[FAIL] ${label}: ${error.message}`);
  }
}

check("B1-B30は5フロアごとに6バイオームへ切り替わる", () => {
  assert.equal(BIOMES.length, 6);
  for (let floor = 1; floor <= 30; floor++) {
    const expected = BIOMES[Math.floor((floor - 1) / 5)];
    assert.equal(getBiomeForFloor(floor).id, expected.id, `B${floor}F`);
  }
  assert.equal(getBiomeForFloor(31).id, BIOMES[0].id);
  assert.equal(getBiomeCycle(30), 0);
  assert.equal(getBiomeCycle(31), 1);
  BIOMES.forEach(biome => {
    assert.ok(biome.enemyPool.length >= 9, biome.id);
    assert.ok(biome.gimmicks.trapSet.length >= 2, biome.id);
    assert.match(biome.cssClass, /^floor-theme-b[1-6]$/);
  });
});

check("5の倍数だけボス・商人・帰還ポータルを各1件生成する", () => {
  for (let floor = 1; floor <= 30; floor++) {
    const generated = generateRunFloor({ runSeed: "MILESTONE-TEST", floor });
    const counts = getMilestoneEventCounts(generated.grid);
    const expected = floor % 5 === 0 ? 1 : 0;
    assert.deepEqual(counts, { boss: expected, merchant: expected, portal: expected }, `B${floor}F`);
    assert.equal(generated.biomeId, getBiomeForFloor(floor).id);
  }
});

check("節目開始は既存0.6定数を参照し素材期待値を減額する", () => {
  assert.equal(MATERIAL_DROP_BALANCE.milestoneStartMultiplier, 0.6);
  for (const floor of [5, 10, 20, 30]) {
    const full = getDepthMaterialExpectedQuantity(floor, { startFloor: 1 });
    const shortcut = getDepthMaterialExpectedQuantity(floor, { startFloor: floor });
    assert.equal(shortcut, full * MATERIAL_DROP_BALANCE.milestoneStartMultiplier);
  }
});

check("節目ボス撃破は開始地点を恒久アンロックする", () => {
  const state = { currentRun: { defeatedMilestones: [] }, unlockedMilestones: [5] };
  assert.deepEqual(recordMilestoneVictory(state, 10), { ok: true, unlocked: true });
  assert.deepEqual(state.currentRun.defeatedMilestones, [10]);
  assert.deepEqual(state.unlockedMilestones, [5, 10]);
  assert.deepEqual(recordMilestoneVictory(state, 10), { ok: true, unlocked: false });
  assert.deepEqual(recordMilestoneVictory(state, 9), { ok: false, unlocked: false });
});

check("節目商人は装備を売らず、素材で補給品を購入する", () => {
  assert.ok(MILESTONE_MERCHANT_STOCK.every(entry => entry.kind !== "equipment"));
  const state = {
    currentRun: { materials: { "霊粉": 2 } },
    inventory: [],
    identifyTickets: 0
  };
  assert.equal(purchaseMilestoneStock(state, "identify_powder").ok, true);
  assert.equal(state.identifyTickets, 1);
  assert.equal(state.currentRun.materials["霊粉"], 0);
});

check("解呪は節目商人の高額素材払いでのみ成立する", () => {
  const item = {
    identified: false,
    curseEffectId: "curse_hollow_soul",
    curseLocked: false,
    curseSuspected: true,
    tags: ["curse"]
  };
  revealEquipmentOnEquip(item);
  const poor = { party: [{ equipment: { weapon: item } }], currentRun: { materials: {} } };
  assert.deepEqual(purchaseMilestoneUncurse(poor, "weapon"), { ok: false, reason: "insufficient_materials" });
  assert.equal(item.curseEffectId, "curse_hollow_soul");
  const rich = {
    party: poor.party,
    currentRun: { materials: { ...MILESTONE_UNCURSE_COST } }
  };
  assert.equal(purchaseMilestoneUncurse(rich, "weapon").ok, true);
  assert.equal(item.curseEffectId, null);
  Object.keys(MILESTONE_UNCURSE_COST).forEach(name => assert.equal(rich.currentRun.materials[name], 0));
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAILURE] ${failure}`));
  process.exit(1);
}

console.log("[PASS] milestones, biomes, shortcut penalty, and merchant rules verified.");
