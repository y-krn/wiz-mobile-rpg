import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

function createState() {
  return {
    party: [{
      name: "RNG Tester",
      level: 1,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      status: "ok",
      equipment: { weapon: "DAGGER", shield: null, armor: null, accessory: null },
      buffs: []
    }],
    combatState: {
      monsters: [{
        name: "RNG Target",
        hp: 100,
        maxHp: 100,
        atk: 5,
        def: 0,
        status: "ok",
        row: "front",
        traits: []
      }],
      phase: "choose_actions",
      roundNumber: 1,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    metaMaterials: {},
    roamingMonsters: [],
    floorChestsTotal: [],
    floor: 1
  };
}

function runWithSequence(sequence, includeLegacyState = false) {
  let index = 0;
  const state = createState();
  if (includeLegacyState) {
    state.simPolicy = { measurementMaxEnemyActionsPerRound: 0 };
    state.simTelemetry = { causalDamageEvents: [{ legacy: true }] };
  }
  const rng = () => sequence[index++] ?? 0;
  const result = runCombatRoundCalculation(state, {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  }, { rng });
  return { result, draws: index };
}

const sequence = [0.12, 0.34, 0.56, 0.78, 0.91, 0.23, 0.45, 0.67];
const first = runWithSequence(sequence);
const second = runWithSequence(sequence);
const legacyState = runWithSequence(sequence, true);

assert.deepEqual(second.result, first.result, "the same injected RNG sequence must resolve the same round");
assert.deepEqual(legacyState.result, first.result, "legacy simulation fields do not alter production behavior when context is omitted");
assert.equal(second.draws, first.draws, "the same round must consume the same number of RNG values");
assert.ok(first.draws > 0, "the combat round must consume its injected RNG");
assert.equal(first.result.state.simPolicy, undefined);
assert.equal(first.result.state.simTelemetry, undefined);

console.log(`[PASS] Combat RNG injection preserves deterministic round resolution (${first.draws} draws).`);
