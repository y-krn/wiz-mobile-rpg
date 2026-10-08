import assert from "node:assert/strict";

const element = () => ({
  style: {},
  appendChild: () => element(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  innerHTML: "",
  textContent: "",
  className: ""
});

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  getElementById: () => element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  createElement: () => element(),
  body: element()
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", { value: { userAgent: "node" }, configurable: true });

const { buildDeathNearMiss } = await import("../../../src/rules/near_miss.js");
const { isNormalizedRunNearMiss, normalizeRunNearMiss } = await import("../../../src/state/run_near_miss.js");
const { state, createDefaultCurrentRun, createStartingKitCharacter, initNewGame } =
  await import("../../../src/state.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getNearMissFacts } = await import("../../../src/ui/result_screen.js");

// --- Combat deaths: enemy state, ordering, and defeated count ---------------

const normalFight = buildDeathNearMiss({
  floor: 3,
  deepestFloor: 3,
  combat: {
    monsters: [
      { name: "コボルトの斥候 A", hp: 0, maxHp: 20 },
      { name: "コボルトの斥候 B", hp: 4, maxHp: 20 },
      { name: "かみつき蟲", hp: 18, maxHp: 18 },
      { name: "群れネズミ", hp: 5, maxHp: 10, fled: true }
    ]
  }
});
assert.deepEqual(normalFight.enemies, [
  { name: "コボルトの斥候", kind: "normal", state: "重傷" },
  { name: "かみつき蟲", kind: "normal", state: "健在" }
], "living, non-fled enemies keep the three-step combat state and lose the encounter suffix");
assert.equal(normalFight.defeatedInBattle, 1, "fled enemies are not counted as defeated");
console.log("[PASS] a normal fight records living enemies and the defeated count");

const guardianFight = buildDeathNearMiss({
  floor: 5,
  deepestFloor: 5,
  defeatedMilestones: [],
  combat: { isBoss: true, monsters: [{ name: "デーモンガード", hp: 30, maxHp: 120 }] }
});
assert.deepEqual(guardianFight.enemies, [{ name: "デーモンガード", kind: "guardian", state: "重傷" }]);
assert.deepEqual(guardianFight.portal, { kind: "guardian_ahead", floor: 5, gap: 0 });
console.log("[PASS] a guardian fight is labelled and places the Portal behind the guardian");

const eliteFight = buildDeathNearMiss({
  floor: 2,
  deepestFloor: 2,
  combat: { isRoamingFlack: true, monsters: [{ name: "フラック", hp: 60, maxHp: 100 }] }
});
assert.equal(eliteFight.enemies[0].kind, "elite");
assert.equal(eliteFight.enemies[0].state, "負傷");

const rareInNormalFight = buildDeathNearMiss({
  floor: 2,
  deepestFloor: 2,
  combat: {
    monsters: [
      { name: "群れネズミ", hp: 9, maxHp: 10 },
      { name: "金色のスライム", hp: 9, maxHp: 10, isRare: true }
    ]
  }
});
assert.deepEqual(rareInNormalFight.enemies.map(enemy => enemy.kind), ["elite", "normal"],
  "guardians and elites are listed before ordinary enemies");
console.log("[PASS] elites are labelled and sorted ahead of ordinary enemies");

const manyEnemies = buildDeathNearMiss({
  floor: 2,
  deepestFloor: 2,
  combat: { monsters: Array.from({ length: 7 }, (_, index) => ({ name: `敵${index}`, hp: 5, maxHp: 10 })) }
});
assert.equal(manyEnemies.enemies.length, 4, "the enemy list is bounded");

// --- Deaths outside combat ---------------------------------------------------

const trapDeath = buildDeathNearMiss({
  floor: 4,
  deepestFloor: 4,
  deathLog: { type: "trap", source: "火炎の罠" },
  combat: null,
  inventory: ["TRAP_KIT"]
});
assert.deepEqual(trapDeath.enemies, []);
assert.equal(trapDeath.defeatedInBattle, 0);
assert.deepEqual(trapDeath.unused, [], "tools that would not have helped are not listed");
assert.deepEqual(trapDeath.portal, { kind: "ahead", floor: 5, gap: 1 });
console.log("[PASS] a trap death records no enemy and still reports the Portal distance");

// --- Personal best gap -------------------------------------------------------

assert.deepEqual(buildDeathNearMiss({ floor: 3, deepestFloor: 3, previousBestFloor: 5 }).bestDepth,
  { best: 5, gap: 2 });
assert.deepEqual(buildDeathNearMiss({ floor: 5, deepestFloor: 5, previousBestFloor: 5 }).bestDepth,
  { best: 5, gap: 0 });
assert.equal(buildDeathNearMiss({ floor: 6, deepestFloor: 6, previousBestFloor: 5 }).bestDepth, null,
  "a new record is left to the record section");
assert.equal(buildDeathNearMiss({ floor: 2, deepestFloor: 2, previousBestFloor: 0 }).bestDepth, null,
  "the first run has no best to compare with");
console.log("[PASS] the best-depth gap covers below, tied, record, and first-run cases");

// --- Portal distance ---------------------------------------------------------

assert.deepEqual(buildDeathNearMiss({ floor: 6, deepestFloor: 6 }).portal, { kind: "ahead", floor: 10, gap: 4 });
assert.deepEqual(buildDeathNearMiss({ floor: 10, deepestFloor: 10, defeatedMilestones: [5, 10] }).portal,
  { kind: "guardian_defeated", floor: 10, gap: 0 });
assert.deepEqual(buildDeathNearMiss({ floor: 10, deepestFloor: 10, defeatedMilestones: [5] }).portal,
  { kind: "guardian_ahead", floor: 10, gap: 0 });
console.log("[PASS] the Portal fact distinguishes before and after the guardian on a milestone floor");

// --- Unused tools ------------------------------------------------------------

const unusedCombat = buildDeathNearMiss({
  floor: 3,
  deepestFloor: 3,
  deathLog: { type: "combat", source: "コボルトの斥候" },
  inventory: [
    "HEAL_POTION", "TOWN_PORTAL", "HEAL_POTION", "ANTIDOTE", "GREATER_HEAL",
    { kind: "equipment", baseId: "SHORT_SWORD", instanceId: "sword-1" }
  ]
});
assert.deepEqual(unusedCombat.unused, [
  { itemId: "TOWN_PORTAL", count: 1 },
  { itemId: "HEAL_POTION", count: 2 },
  { itemId: "GREATER_HEAL", count: 1 }
], "a combat death lists the Wing and HP recovery, not unrelated cures or equipment");

const unusedPoison = buildDeathNearMiss({
  floor: 3,
  deepestFloor: 3,
  deathLog: { type: "status", source: "毒" },
  inventory: ["ANTIDOTE", "PANACEA", "EYE_DROPS"]
});
assert.deepEqual(unusedPoison.unused, [
  { itemId: "ANTIDOTE", count: 1 },
  { itemId: "PANACEA", count: 1 }
], "a poison death also lists the cures for poison");
console.log("[PASS] unused Wing, HP recovery, and cause-matched cures are counted");

// --- Normalization -----------------------------------------------------------

assert.equal(normalizeRunNearMiss(null), null);
assert.equal(normalizeRunNearMiss({ enemies: [], unused: [], defeatedInBattle: 0 }), null,
  "a record without any fact normalizes to null");
const repaired = normalizeRunNearMiss({
  enemies: [{ name: "デーモンガード", kind: "guardian", state: "重傷" }, { name: "", kind: "x", state: "12%" }],
  defeatedInBattle: -2,
  bestDepth: { best: 0, gap: 1 },
  portal: { kind: "elsewhere", floor: 5, gap: 1 },
  unused: [{ itemId: "TOWN_PORTAL", count: 1 }, { itemId: "TOWN_PORTAL", count: 0 }]
});
assert.deepEqual(repaired, {
  enemies: [{ name: "デーモンガード", kind: "guardian", state: "重傷" }],
  defeatedInBattle: 0,
  bestDepth: null,
  portal: null,
  unused: [{ itemId: "TOWN_PORTAL", count: 1 }]
});
assert.equal(isNormalizedRunNearMiss(repaired), true);
assert.equal(isNormalizedRunNearMiss({ ...repaired, enemies: [{ name: "敵", kind: "normal", state: "12%" }] }), false,
  "an exact HP share is not a valid enemy state");
console.log("[PASS] malformed near-miss data is dropped field by field");

// --- Result text -------------------------------------------------------------

assert.deepEqual(getNearMissFacts({
  enemies: [
    { name: "デーモンガード", kind: "guardian", state: "重傷" },
    { name: "フラック", kind: "elite", state: "負傷" },
    { name: "かみつき蟲", kind: "normal", state: "健在" }
  ],
  defeatedInBattle: 2,
  bestDepth: { best: 5, gap: 2 },
  portal: { kind: "ahead", floor: 5, gap: 2 },
  unused: [{ itemId: "TOWN_PORTAL", count: 1 }, { itemId: "HEAL_POTION", count: 2 }]
}), [
  "階層守護者・デーモンガードを重傷まで追い込んでいた",
  "強敵・フラックに傷を負わせていた",
  "かみつき蟲は健在だった",
  "この戦闘で2体を倒していた",
  "この迷宮での自己最深 B5F まであと2階だった",
  "帰還の門（B5F）まであと2階だった",
  "使わずに残っていた物：帰還の翼×1、傷薬×2"
]);
assert.deepEqual(getNearMissFacts(null), []);
assert.equal(getNearMissFacts({
  enemies: [{ name: "デーモンガード", kind: "guardian", state: "重傷" }],
  defeatedInBattle: 0, bestDepth: null, portal: null, unused: []
}).some(fact => /%|\d+\s*\/\s*\d+/.test(fact)), false, "no exact HP value or share is shown");
console.log("[PASS] result facts are stated without advice or exact HP");

// --- Run result integration --------------------------------------------------

function setupRun() {
  initNewGame();
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "NEAR-MISS-TEST";
  state.currentRun.startedAt = 100;
  state.currentRun.deepestFloor = 3;
  state.floor = 3;
  state.gameState = "explore";
  state.inventory = ["TOWN_PORTAL", "HEAL_POTION"];
  state.currentRun.townInventory = state.inventory.slice();
  state.currentRun.departureCraftItems = state.inventory.slice();
  state.records.personalBests.deepestFloor = 4;
}

setupRun();
state.combatState = {
  isBoss: false,
  monsters: [{ name: "コボルトの斥候 A", hp: 3, maxHp: 20 }, { name: "コボルトの斥候 B", hp: 0, maxHp: 20 }]
};
triggerRunResult("gameover");
assert.deepEqual(state.currentRun.nearMiss, {
  enemies: [{ name: "コボルトの斥候", kind: "normal", state: "重傷" }],
  defeatedInBattle: 1,
  bestDepth: { best: 4, gap: 1 },
  portal: { kind: "ahead", floor: 5, gap: 2 },
  unused: [{ itemId: "TOWN_PORTAL", count: 1 }, { itemId: "HEAL_POTION", count: 1 }]
}, "the record is captured before settlement clears the bag and before records absorb the run");
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.currentRun.nearMiss, state.currentRun.nearMiss,
  "the record survives a save round trip while the result is shown");
console.log("[PASS] death captures the near-miss record and it survives a reload");

setupRun();
state.combatState = null;
triggerRunResult("milestone_portal");
assert.equal(state.currentRun.nearMiss, null, "a safe return records no near miss");
setupRun();
triggerRunResult("abandon");
assert.equal(state.currentRun.nearMiss, null, "an abandoned run records no near miss");
console.log("[PASS] return and abandon record no near miss");

const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.currentRun.nearMiss;
assert.equal(normalizeSavePayload(legacy).currentRun.nearMiss, null,
  "a save from before this field loads with no near-miss record");
console.log("[PASS] saves without the field load as no near miss");
