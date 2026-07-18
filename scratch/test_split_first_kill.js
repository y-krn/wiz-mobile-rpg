import assert from "node:assert/strict";
import { applyCombatRewards } from "../src/combat_logic/rewards.js";
import { normalizeSavePayload } from "../src/state/save_migrations.js";

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

test("分裂体は図鑑に登録されない", () => {
  const state = makeRewardState();
  const splitName = "スライムの分裂体1";
  state.combatState.monsters = [monster({ name: splitName, hasSplit: true })];

  applyCombatRewards(state, state.combatState.monsters, [], () => 1);

  assert.equal(Object.hasOwn(state.codex.monsters, splitName), false);
});

test("通常種は図鑑の討伐数が増える", () => {
  const state = makeRewardState();
  state.codex.monsters["スライム"] = { encountered: 1, killed: 2, firstKilled: true };
  state.combatState.monsters = [monster()];

  applyCombatRewards(state, state.combatState.monsters, [], () => 1);

  assert.equal(state.codex.monsters["スライム"].killed, 3);
});

test("normalizeSavePayloadは分裂体の図鑑汚染を除去する", () => {
  const normalized = normalizeSavePayload({
    codex: {
      monsters: {
        "スライム": { encountered: 1, killed: 3, firstKilled: true },
        "スライムの分裂体1": { encountered: 1, killed: 1, firstKilled: true }
      }
    },
    firstKills: ["スライム", "スライムの分裂体2"]
  });

  assert.deepEqual(normalized.codex.monsters, {
    "スライム": { encountered: 1, killed: 3, firstKilled: true }
  });
  assert.deepEqual(normalized.firstKills, ["スライム"]);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}
