import assert from "node:assert/strict";
import * as explorationItemsFacade from "../../../src/systems/exploration_items.js";
import * as explorationItemsOwner from "../../../src/systems/exploration_items.ts";
import { ITEMS } from "../../../src/data/items.js";
import { CRAFT_RECIPES } from "../../../src/craft.js";
import { MILESTONE_MERCHANT_STOCK } from "../../../src/data/milestone_merchant.js";
import { calculateEncounterChance } from "../../../src/movement.js";
import {
  applyExplorationItem,
  NOISE_BALL_FORCED_ENCOUNTER_STEPS,
  SILENCE_INCENSE_ENCOUNTER_MULTIPLIER,
  SILENCE_INCENSE_STEPS,
  TRAP_SENSE_STONE_RADIUS
} from "../../../src/systems/exploration_items.js";
import { ITEM_EFFECTS } from "../../../src/systems/item_effects.js";

for (const exportName of [
  "NOISE_BALL_FORCED_ENCOUNTER_STEPS",
  "SILENCE_INCENSE_STEPS",
  "SILENCE_INCENSE_ENCOUNTER_MULTIPLIER",
  "TRAP_SENSE_STONE_RADIUS",
  "applyNoiseBall",
  "applySilenceIncense",
  "revealTrapsInRange",
  "applyExplorationItem"
]) {
  assert.strictEqual(
    explorationItemsFacade[exportName],
    explorationItemsOwner[exportName],
    `exploration items facade preserves ${exportName} identity`
  );
}

assert.equal(explorationItemsFacade.NOISE_BALL_FORCED_ENCOUNTER_STEPS, 4);
assert.equal(explorationItemsFacade.SILENCE_INCENSE_STEPS, 10);
assert.equal(explorationItemsFacade.SILENCE_INCENSE_ENCOUNTER_MULTIPLIER, 0.2);
assert.equal(explorationItemsFacade.TRAP_SENSE_STONE_RADIUS, 3);

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

check("Phase 1 consumables are defined as usable utility items", () => {
  for (const itemId of ["NOISE_BALL", "SILENCE_INCENSE", "TRAP_SENSE_STONE"]) {
    assert.equal(ITEMS[itemId]?.type, "usable");
    assert.equal(ITEMS[itemId]?.exploreNoTarget || ITEMS[itemId]?.exploreDirectional, true);
    assert.equal(typeof ITEM_EFFECTS[itemId], "function");
  }
});

check("noise ball arms a bounded normal-encounter window", () => {
  const stateLike = { forcedEncounterSteps: 0 };
  const result = applyExplorationItem(stateLike, "NOISE_BALL");
  assert.equal(result.ok, true);
  assert.equal(stateLike.forcedEncounterSteps, NOISE_BALL_FORCED_ENCOUNTER_STEPS);
});

check("silence incense lowers only normal encounter chance", () => {
  const normal = calculateEncounterChance(10, {});
  const quiet = calculateEncounterChance(10, { silenceTurns: SILENCE_INCENSE_STEPS });
  assert.equal(quiet, normal * SILENCE_INCENSE_ENCOUNTER_MULTIPLIER);
  assert.equal(SILENCE_INCENSE_STEPS >= 8 && SILENCE_INCENSE_STEPS <= 12, true);
});

check("trap sense stone reveals traps without changing disarm stats", () => {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({
    walls: [false, false, false, false]
  })));
  grid[3][5].trap = { state: "hidden", type: "damage", intensity: 2 };
  grid[3][6].trap = { state: "hidden", type: "damage", intensity: 2 };
  const stateLike = { x: 2, y: 3, map: grid, mapRevision: 0 };
  const result = applyExplorationItem(stateLike, "TRAP_SENSE_STONE");
  assert.equal(result.revealed.length, 1);
  assert.equal(result.revealed[0].x, 5);
  assert.equal(grid[3][5].trap.state, "discovered");
  assert.equal(grid[3][5].trap.traceReadLevel, 3);
  assert.equal(grid[3][6].trap.state, "hidden");
  assert.equal(stateLike.mapRevision, 1);
  assert.equal(TRAP_SENSE_STONE_RADIUS, 3);
});

check("trap sense stone preserves stronger trace reads and blocks walls", () => {
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => ({
    walls: [false, false, false, false]
  })));
  grid[1][2].walls[1] = true;
  grid[1][3].walls[3] = true;
  grid[1][3].trap = { state: "hidden", type: "blocked", traceReadLevel: 7 };
  grid[0][2].trap = { state: "hidden", type: "edge", traceReadLevel: 1 };
  const stateLike = { x: 1, y: 1, map: grid, mapRevision: 4 };
  const result = applyExplorationItem(stateLike, "TRAP_SENSE_STONE");
  assert.deepEqual(result.revealed, [{ x: 2, y: 0, type: "edge" }]);
  assert.equal(grid[1][3].trap.state, "hidden");
  assert.equal(grid[1][3].trap.traceReadLevel, 7);
  assert.equal(grid[0][2].trap.traceReadLevel, 3);
  assert.equal(stateLike.mapRevision, 5);
});

check("trap sense stone keeps map revision when nothing is revealed", () => {
  const grid = [[{ walls: [false, false, false, false] }]];
  const stateLike = { x: 0, y: 0, map: grid, mapRevision: 9 };
  const result = applyExplorationItem(stateLike, "TRAP_SENSE_STONE");
  assert.deepEqual(result, { ok: true, revealed: [], message: "探知石は反応しなかった。" });
  assert.equal(stateLike.mapRevision, 9);
});

check("exploration item boundaries preserve failure results", () => {
  assert.deepEqual(
    applyExplorationItem({ x: 0, y: 0, map: null, mapRevision: 2 }, "TRAP_SENSE_STONE"),
    { ok: false, revealed: [], message: "探知石は反応しなかった。" }
  );
  assert.deepEqual(
    applyExplorationItem({ x: "0", y: 0, map: [[{}]], mapRevision: 2 }, "TRAP_SENSE_STONE"),
    { ok: false, revealed: [], message: "探知石は反応しなかった。" }
  );
  assert.deepEqual(
    applyExplorationItem({}, "UNKNOWN_ITEM"),
    { ok: false, revealed: [], message: "この道具は探索中には使えない。" }
  );
});

check("supply routes are intentional", () => {
  assert.ok(CRAFT_RECIPES.some(recipe => recipe.resultId === "NOISE_BALL"));
  assert.ok(CRAFT_RECIPES.some(recipe => recipe.resultId === "SILENCE_INCENSE"));
  assert.deepEqual(
    MILESTONE_MERCHANT_STOCK.find(entry => entry.id === "trap_sense_stone"),
    {
      id: "trap_sense_stone",
      kind: "item",
      itemId: "TRAP_SENSE_STONE",
      name: "探知石",
      cost: { "魔石片": 2 }
    }
  );
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}
console.log("[PASS] Issue #412 tactical consumables");
