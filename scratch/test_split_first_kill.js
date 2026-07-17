import assert from "node:assert/strict";
import { applyCombatRewards } from "../src/combat_logic/rewards.js";

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function makeRewardState() {
  return {
    floor: 1,
    party: [],
    combatState: { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [] },
    currentRun: {
      kills: 0, goldGained: 0, expGained: 0, bossesKilled: 0, elitesKilled: 0,
      materialsFound: {}, equipmentFound: []
    },
    codex: { stats: { totalKills: 0 }, monsters: {} },
    firstKills: [],
    materials: {},
    inventory: [],
    gold: 0,
    floorChestsTotal: [0]
  };
}

function monster(overrides = {}) {
  return {
    name: "スライム",
    hp: 0,
    maxHp: 10,
    exp: 0,
    gold: 0,
    tags: [],
    fled: false,
    ...overrides
  };
}

test("分裂体は初討伐ボーナス対象外", () => {
  const state = makeRewardState();
  state.combatState.monsters = [monster({ name: "スライムの分裂体1", hasSplit: true })];

  applyCombatRewards(state, state.combatState.monsters, [], () => 1);

  assert.deepEqual(state.firstKills, []);
  assert.equal(state.gold, 1);
});

test("通常の新種は初討伐ボーナス対象", () => {
  const state = makeRewardState();
  state.combatState.monsters = [monster()];

  applyCombatRewards(state, state.combatState.monsters, [], () => 1);

  assert.deepEqual(state.firstKills, ["スライム"]);
  assert.equal(state.gold, 101);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}
