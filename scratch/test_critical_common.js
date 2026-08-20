import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { getClassCriticalChance } from "../src/rules/class_rules.js";
import { CLASSES } from "../src/data/classes.js";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { migrateSavePayload } from "../src/state/save_migrations.js";
import { state } from "../src/state/state_core.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ className = "Fighter", level = 10, targetOverrides = {} } = {}) {
  return {
    party: [{
      name: "Tester",
      class: className,
      level,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      str: 15,
      int: 8,
      pie: 8,
      vit: 10,
      agi: 100,
      luk: 10,
      status: "ok",
      spells: [],
      equipment: { weapon: null, shield: null, armor: null, accessory: null }
    }],
    combatState: {
      monsters: [{
        name: "Target",
        hp: 1000,
        maxHp: 1000,
        atk: 1,
        def: 0,
        row: "front",
        canReceiveCritical: true,
        ...targetOverrides
      }],
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1,
    x: 5,
    y: 5,
    combatFormulaTelemetry: {
      physicalPlayerHits: [],
      physicalPlayerMisses: [],
      physicalMonsterHits: [],
      targetedBonuses: [],
      mitigations: [],
      mitigationCalls: []
    }
  };
}

function run(state) {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }] });
  } finally {
    Math.random = originalRandom;
  }
}

for (const className of Object.keys(CLASSES).filter(name => name !== "Ninja")) {
  assert.equal(getClassCriticalChance({ class: className, level: 10 }), 0, `${className} critical chance`);
}
assert.equal(getClassCriticalChance({ class: "Ninja", level: 0 }), 0.05, "Ninja base critical chance");
assert.equal(getClassCriticalChance({ class: "Ninja", level: 10 }), 0.15, "Ninja critical cap");

const ninjaHit = run(createState({ className: "Ninja" }));
assert.equal(ninjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, true, "Ninja non-boss critical");
assert.equal(ninjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, 0.15);

const bossHit = run(createState({ className: "Ninja", targetOverrides: { isBoss: true, canReceiveCritical: false } }));
assert.equal(bossHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "boss critical exclusion");
assert.equal(bossHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, null, "boss critical telemetry remains ineligible");

const nonNinjaHit = run(createState({ className: "Fighter" }));
assert.equal(nonNinjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "non-Ninja critical remains disabled");
assert.equal(nonNinjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, null, "non-Ninja critical telemetry remains ineligible");

const propertyBlockedHit = run(createState({ className: "Ninja", targetOverrides: { canReceiveCritical: false } }));
assert.equal(propertyBlockedHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "target property blocks critical");
assert.equal(propertyBlockedHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, null, "blocked target is excluded from critical telemetry");

function createLegacyCombatPayload({ className = "Ninja", targetOverrides = {} } = {}) {
  state.party = createState({ className }).party;
  state.combatState = {
    monsters: [{
      name: "Target",
      hp: 1000,
      maxHp: 1000,
      atk: 1,
      def: 0,
      row: "front",
      canReceiveCritical: true,
      ...targetOverrides
    }],
    roundNumber: 1,
    phase: "choose_actions"
  };
  state.gameState = "combat";
  state.floor = 1;
  state.currentRun = { itemsFound: [], equipmentFound: [], deathLogs: [] };
  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  delete payload.combatState.monsters[0].canReceiveCritical;
  return payload;
}

function runLoadedLegacyCombat(options) {
  const restored = migrateSavePayload(createLegacyCombatPayload(options));
  applySavePayload(restored);
  state.combatFormulaTelemetry = {
    physicalPlayerHits: [],
    physicalPlayerMisses: [],
    physicalMonsterHits: [],
    targetedBonuses: [],
    mitigations: [],
    mitigationCalls: []
  };
  return run(state);
}

const legacyBossPayload = createLegacyCombatPayload({ targetOverrides: { isBoss: true } });
const legacyBossRound = runLoadedLegacyCombat({ targetOverrides: { isBoss: true } });
const legacyBoss = legacyBossRound.state.combatState.monsters[0];
assert.equal(legacyBoss.canReceiveCritical, false, "legacy boss is backfilled as critical-immune");
assert.equal(legacyBossRound.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "legacy boss cannot receive critical");
assert.equal(legacyBossRound.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, null, "legacy boss telemetry remains ineligible");
assert.equal(legacyBossPayload.combatState.monsters[0].canReceiveCritical, undefined, "legacy payload omits transient backfill field");

const legacyNonBossRound = runLoadedLegacyCombat();
assert.equal(legacyNonBossRound.state.combatState.monsters[0].canReceiveCritical, true, "legacy non-boss is backfilled as critical-eligible");
assert.equal(legacyNonBossRound.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, true, "legacy Ninja non-boss remains critical-eligible");
assert.equal(legacyNonBossRound.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, 0.15);

console.log("Critical common mechanism tests passed.");
