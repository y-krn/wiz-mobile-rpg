import assert from "node:assert/strict";

import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";
import { createDefaultCodex, createDefaultCurrentRun, createStartingKitCharacter } from "../../../src/state/initial_state.js";

function createState(monster, currentRunOverrides = {}, characterOverrides = {}) {
  const character = {
    ...createStartingKitCharacter("vanguard"),
    hp: 100,
    maxHp: 100,
    status: "ok",
    exp: 0,
    buffs: [],
    ...characterOverrides
  };
  return {
    floor: 3,
    seed: "ISOLATION-SEED",
    party: [character],
    combatState: {
      monsters: [monster],
      phase: "choose_actions",
      roundNumber: 4,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      loggedCoreActivations: []
    },
    inventory: [],
    firstKills: [],
    codex: createDefaultCodex(),
    currentRun: { ...createDefaultCurrentRun(), ...currentRunOverrides },
    metaMaterials: {},
    roamingMonsters: [],
    floorChestsTotal: [],
    logs: [],
    logEntries: []
  };
}

{
  const state = createState({
    name: "ゴブリン A",
    hp: 1,
    maxHp: 1,
    atk: 1,
    def: 0,
    exp: 20,
    role: "beast",
    status: "ok",
    row: "front",
    traits: [],
    buffs: []
  }, {
    quests: [{
      type: "role_kill",
      role: "beast",
      targetValue: 3,
      currentValue: 0,
      completed: false,
      rewardClaimed: false,
      reward: { materials: { "獣の牙": 1 } }
    }],
    defeatsByRole: {}
  }, { hp: 1, maxHp: 1 });
  const originalSnapshot = structuredClone(state);

  const result = runCombatRoundCalculation(state, {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  }, { rng: () => 0 });

  assert.deepEqual(state, originalSnapshot, "combat reward resolution must not mutate original nested state");
  assert.notStrictEqual(result.state.codex, state.codex);
  assert.notStrictEqual(result.state.codex.stats, state.codex.stats);
  assert.notStrictEqual(result.state.codex.monsters, state.codex.monsters);
  assert.notStrictEqual(result.state.currentRun, state.currentRun);
  assert.notStrictEqual(result.state.currentRun.quests, state.currentRun.quests);
  assert.notStrictEqual(result.state.currentRun.quests[0], state.currentRun.quests[0]);
  assert.notStrictEqual(result.state.currentRun.defeatsByRole, state.currentRun.defeatsByRole);
  assert.notStrictEqual(result.state.currentRun.materials, state.currentRun.materials);
  assert.equal(result.state.currentRun.kills, 1);
  assert.equal(result.state.currentRun.defeatsByRole.beast, 1);
  assert.equal(result.state.codex.stats.totalKills, 1);
  assert.equal(result.state.codex.monsters.ゴブリン.killed, 1);
  assert.equal(state.currentRun.kills, 0);
  assert.equal(state.codex.stats.totalKills, 0);
  assert.equal(state.codex.monsters.ゴブリン, undefined);
  assert.equal(result.state.simPolicy, undefined);
  assert.equal(result.state.simTelemetry, undefined);
}

{
  const state = createState({
    name: "ゴブリン A",
    hp: 100,
    maxHp: 100,
    atk: 100,
    def: 0,
    exp: 1,
    status: "ok",
    row: "front",
    traits: [],
    buffs: []
  }, {}, { hp: 1, maxHp: 1 });
  const originalSnapshot = structuredClone(state);

  const result = runCombatRoundCalculation(state, {
    actions: [{ type: "defend", actorIdx: 0 }]
  }, { rng: () => 0 });

  assert.deepEqual(state, originalSnapshot, "recordCharDeath must not leak into original currentRun");
  assert.equal(result.state.party[0].status, "dead");
  assert.equal(result.state.currentRun.deathLogs.length, 1);
  assert.equal(state.currentRun.deathLogs.length, 0);
  assert.notStrictEqual(result.state.currentRun.deathLogs, state.currentRun.deathLogs);
}

console.log("[PASS] Combat round codex/currentRun nested mutation stays isolated in returned state.");
