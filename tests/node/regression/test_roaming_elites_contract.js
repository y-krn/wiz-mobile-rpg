import assert from "node:assert/strict";
import * as facade from "../../../src/systems/roaming_elites.js";
import * as owner from "../../../src/systems/roaming_elites.ts";
import { createRng } from "../../../src/seed_rng.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { getBandTrialForFloor, getFloorRole } from "../../../src/rules/floor_trials.js";
import { findMapCellByType } from "../../../src/rules/map_queries.js";
import { recordMinimalEliteAction } from "../fixtures/typescript/roaming_elites_minimal_input.ts";

const exportNames = [
  "ELITE_MIN_FLOOR", "ELITE_PATROL_RADIUS", "ELITE_ENTRY_SPAWN_CHANCE",
  "ELITE_PROLONGED_CHECK_SCORE", "ELITE_PROLONGED_MAX_CHANCE",
  "ELITE_COMBAT_TRAITS", "ELITE_COMBAT_TRAIT_LABELS", "shouldSpawnElite",
  "getEliteId", "getElitePerception", "getEliteCombatTraitWeights",
  "getEliteCombatTrait", "applyEliteCombatTraitStats", "getEliteProlongedCheckChance",
  "shouldSpawnEliteAfterExploration", "markEliteEntryRollResolved",
  "recordEliteGreedAction", "findEliteStart", "createFloorElite", "progressEliteThreat"
];
for (const name of exportNames) assert.strictEqual(facade[name], owner[name], `${name} identity`);
assert.deepEqual([
  facade.ELITE_MIN_FLOOR, facade.ELITE_PATROL_RADIUS, facade.ELITE_ENTRY_SPAWN_CHANCE,
  facade.ELITE_PROLONGED_CHECK_SCORE, facade.ELITE_PROLONGED_MAX_CHANCE
], [3, 5, 0.30, 12, 0.30]);
assert.deepEqual(facade.ELITE_COMBAT_TRAITS, ["berserk", "armored", "spell_eater", "regenerator", "executioner"]);
assert.equal(Object.isFrozen(facade.ELITE_COMBAT_TRAITS), true);
assert.deepEqual(facade.ELITE_COMBAT_TRAIT_LABELS, {
  berserk: "狂暴：HP半分以下で攻撃が強化される",
  armored: "重装：物理に強く、呪文に弱い",
  spell_eater: "魔喰い：呪文を受けると一時的に強化される",
  regenerator: "再生：毎ターンHPが回復する",
  executioner: "処刑者：瀕死の冒険者を狙う"
});
assert.equal(Object.isFrozen(facade.ELITE_COMBAT_TRAIT_LABELS), true);

assert.equal(facade.shouldSpawnElite(2, "invalid-floor"), false);
assert.equal(facade.shouldSpawnElite(3, ""), false);
assert.equal(facade.shouldSpawnElite(3, null), false);
let invalidSeedCoercions = 0;
const invalidSeed = { toString() { invalidSeedCoercions++; return "unused"; } };
assert.equal(facade.shouldSpawnElite(2, invalidSeed), false);
assert.equal(facade.shouldSpawnEliteAfterExploration({ floor: 2, runSeed: invalidSeed, greedScore: 12, checkIndex: 1 }), false);
assert.equal(invalidSeedCoercions, 0);
const entrySeed = "ROAMING-ENTRY-SEED";
assert.equal(facade.shouldSpawnElite(3, entrySeed), createRng(`${entrySeed}:elite-entry:B3`)() < 0.30);
assert.equal(facade.getElitePerception(entrySeed, 3), ["sound", "blind_charge", "vibration", "standard", "afterimage"][
  Math.floor(createRng(`${entrySeed}:elite-perception:B3`)() * 5)
]);
const traitTrial = getBandTrialForFloor(entrySeed, 3);
const traitWeights = facade.getEliteCombatTraitWeights(traitTrial, getFloorRole(3));
const traitOrder = facade.ELITE_COMBAT_TRAITS;
const traitTotal = traitOrder.reduce((sum, trait) => sum + traitWeights[trait], 0);
let traitThreshold = createRng(`${entrySeed}:elite-combat-trait:B3`)() * traitTotal;
const expectedTrait = traitOrder.find(trait => (traitThreshold -= traitWeights[trait]) < 0) ?? traitOrder.at(-1);
assert.equal(facade.getEliteCombatTrait(entrySeed, 3), expectedTrait);

const plainMonster = { hp: 12, physResist: 0.2, magicResist: -0.1 };
assert.strictEqual(facade.applyEliteCombatTraitStats(plainMonster, "berserk"), plainMonster);
const armoredMonster = facade.applyEliteCombatTraitStats(plainMonster, "armored");
assert.notStrictEqual(armoredMonster, plainMonster);
assert.deepEqual(armoredMonster, { hp: 12, physResist: 0.45, magicResist: -0.35 });
assert.deepEqual(facade.applyEliteCombatTraitStats({ physResist: 0.6, magicResist: -0.5 }, "armored"), {
  physResist: 0.6, magicResist: -0.5
});

const legacyRun = { eliteFloors: { "3": { greedScore: 4.5, warningStage: 99, actionKeys: ["kept"] } } };
const partialFloor = facade.markEliteEntryRollResolved({ currentRun: legacyRun, roamingMonsters: [] }, 3);
assert.strictEqual(partialFloor, legacyRun.eliteFloors["3"]);
assert.deepEqual(partialFloor, {
  entryRollResolved: true, spawned: false, defeated: false, warningStage: 99,
  prolongedChecks: 0, greedScore: 4.5, stairsFound: false, actionKeys: ["kept"]
});
const greedState = { floor: 3, currentRun: {} };
assert.equal(facade.recordEliteGreedAction(greedState, "battle", 2), true);
assert.equal(facade.recordEliteGreedAction(greedState, "chest", 1, "chest-1"), true);
assert.equal(facade.recordEliteGreedAction(greedState, "chest", 5, "chest-1"), false);
assert.equal(facade.recordEliteGreedAction(greedState, "stairs_found"), true);
assert.equal(facade.recordEliteGreedAction(greedState, "new_room", 2, "room-1"), true);
assert.equal(greedState.currentRun.eliteFloors["3"].greedScore, 14);
assert.equal(facade.recordEliteGreedAction(greedState, "invalid"), false);
const optionalState = { floor: 3, currentRun: {} };
assert.equal(facade.recordEliteGreedAction(optionalState, "optional_area"), true);
assert.equal(optionalState.currentRun.eliteFloors["3"].greedScore, 3);
const falsyKeyState = { floor: 3, currentRun: {} };
assert.equal(facade.recordEliteGreedAction(falsyKeyState, "battle", 1, ""), true);
assert.deepEqual(falsyKeyState.currentRun.eliteFloors["3"].actionKeys, []);
assert.equal(recordMinimalEliteAction(), 2);

const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
  type: "empty", walls: [true, true, true, true], blockEnter: [false, false, false, false]
})));
grid[2][2].type = "stairs-up";
for (let x = 2; x < 7; x++) {
  grid[2][x].walls[1] = false;
  grid[2][x + 1].walls[3] = false;
}
grid[2][2].walls[2] = false;
grid[3][2].walls[0] = false;
for (let y = 3; y < 7; y++) {
  grid[y][2].walls[2] = false;
  grid[y + 1][2].walls[0] = false;
}
let rngCalls = 0;
const firstReachable = facade.findEliteStart(grid, { x: 2, y: 2 }, () => { rngCalls++; return 0; });
assert.deepEqual(firstReachable, { x: 7, y: 2 });
assert.equal(rngCalls, 1);
const blockedGrid = grid.map(row => row.map(cell => ({ ...cell, walls: [...cell.walls], blockEnter: [...cell.blockEnter] })));
blockedGrid[2][4].blockEnter[3] = true;
assert.deepEqual(facade.findEliteStart(blockedGrid, { x: 2, y: 2 }, () => { rngCalls++; return 0; }), { x: 2, y: 7 });
assert.equal(rngCalls, 2);
assert.deepEqual(facade.findEliteStart(grid, { x: 2, y: 2 }, () => 0.5), { x: 2, y: 7 });
const wallGrid = grid.map(row => row.map(cell => ({ ...cell, walls: [...cell.walls], blockEnter: [...cell.blockEnter] })));
wallGrid[2][2].walls[1] = true;
assert.deepEqual(facade.findEliteStart(wallGrid, { x: 2, y: 2 }, () => 0), { x: 2, y: 7 });

const runSeed = "ROAMING-CREATE-SEED";
const mapData = generateRunFloor({ runSeed, floor: 3 });
const elite = facade.createFloorElite({ runSeed, floor: 3, mapData, spawnReason: "prolonged", storedTrial: {
  bandIndex: 0, mainId: "resource", subId: "status"
} });
assert.deepEqual(Object.keys(elite), [
  "id", "floor", "x", "y", "name", "kind", "perception", "combatTrait",
  "combatTraitLabel", "trialThemeIds", "trialRole", "spawnReason", "homeX", "homeY"
]);
assert.deepEqual(elite.trialThemeIds, ["resource", "status"]);
assert.equal(elite.trialRole, "change");
assert.equal(elite.spawnReason, "prolonged");
assert.deepEqual([elite.homeX, elite.homeY], [elite.x, elite.y]);
assert.equal(facade.getEliteId(3), "RUN_ELITE_B3");
const stairs = findMapCellByType(mapData.grid, "stairs-up");
assert.ok(Math.abs(elite.x - stairs.x) + Math.abs(elite.y - stairs.y) >= 5);

const omenState = { floor: 3, currentRun: { runSeed: "ROAMING-OMEN", eliteFloors: {
  "3": { greedScore: 8, warningStage: 0, prolongedChecks: 0 }
} }, roamingMonsters: [] };
assert.deepEqual(facade.progressEliteThreat(omenState).omens, ["この階に長く留まりすぎた気がする……"]);
omenState.currentRun.eliteFloors["3"].greedScore = 16;
omenState.currentRun.eliteFloors["3"].prolongedChecks = 1;
assert.deepEqual(facade.progressEliteThreat(omenState).omens, ["遠くで何かが目覚めた……"]);
omenState.currentRun.eliteFloors["3"].greedScore = 24;
omenState.currentRun.eliteFloors["3"].prolongedChecks = 2;
assert.deepEqual(facade.progressEliteThreat(omenState).omens, ["重い足音が、先ほどより近い……"]);
assert.equal(omenState.currentRun.eliteFloors["3"].warningStage, 3);

const failedSeed = Array.from({ length: 100 }, (_, i) => `ROAMING-FAILED-${i}`).find(seed =>
  !facade.shouldSpawnEliteAfterExploration({ floor: 3, runSeed: seed, greedScore: 24, checkIndex: 1 }) &&
  !facade.shouldSpawnEliteAfterExploration({ floor: 3, runSeed: seed, greedScore: 24, checkIndex: 2 })
);
assert.ok(failedSeed);
const failedState = { floor: 3, currentRun: { runSeed: failedSeed, eliteFloors: {
  "3": { greedScore: 24, warningStage: 0, prolongedChecks: 0 }
} }, map: mapData.grid, roamingMonsters: [] };
const failedResult = facade.progressEliteThreat(failedState);
assert.equal(failedResult.spawned, null);
assert.equal(failedState.currentRun.eliteFloors["3"].prolongedChecks, 2);
assert.deepEqual(failedState.roamingMonsters, []);

const successfulSeed = Array.from({ length: 100 }, (_, i) => `ROAMING-SUCCESS-${i}`).find(seed =>
  facade.shouldSpawnEliteAfterExploration({ floor: 3, runSeed: seed, greedScore: 12, checkIndex: 1 })
);
assert.ok(successfulSeed);
const successfulMap = generateRunFloor({ runSeed: successfulSeed, floor: 3 });
const successfulState = { floor: 3, currentRun: { runSeed: successfulSeed, eliteFloors: {
  "3": { greedScore: 12, prolongedChecks: 0, warningStage: 0 }
} }, map: successfulMap.grid, roamingMonsters: [] };
const successfulResult = facade.progressEliteThreat(successfulState);
assert.strictEqual(successfulResult.spawned, successfulState.roamingMonsters[0]);
assert.equal(successfulResult.spawned?.spawnReason, "prolonged");
assert.equal(successfulState.currentRun.eliteFloors["3"].spawned, true);

const defeatedState = { floor: 3, currentRun: { runSeed, eliteDefeatedFloors: [3], eliteFloors: {
  "3": { greedScore: 100, prolongedChecks: 0, warningStage: 0 }
} }, map: mapData.grid, roamingMonsters: [] };
assert.equal(facade.progressEliteThreat(defeatedState).spawned, null);
assert.equal(defeatedState.currentRun.eliteFloors["3"].prolongedChecks, 0);

const saveState = { floor: 3, currentRun: { runSeed, eliteFloors: {
  "3": { greedScore: 12, prolongedChecks: 0, warningStage: 0 }
} }, map: mapData.grid, roamingMonsters: [] };
const loadedState = JSON.parse(JSON.stringify(saveState));
facade.progressEliteThreat(saveState);
facade.progressEliteThreat(loadedState);
assert.deepEqual(loadedState, saveState);

console.log("[PASS] roaming elites facade, determinism, legacy state, reachability, spawn and save contract");
