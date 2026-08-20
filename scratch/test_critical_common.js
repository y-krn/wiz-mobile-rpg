import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { getClassCriticalChance } from "../src/rules/class_rules.js";
import { CLASSES } from "../src/data/classes.js";

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
assert.equal(bossHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, 0.15);

const nonNinjaHit = run(createState({ className: "Fighter" }));
assert.equal(nonNinjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "non-Ninja critical remains disabled");
assert.equal(nonNinjaHit.state.combatFormulaTelemetry.physicalPlayerHits[0].criticalChance, 0);

const propertyBlockedHit = run(createState({ className: "Ninja", targetOverrides: { canReceiveCritical: false } }));
assert.equal(propertyBlockedHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, false, "target property blocks critical");

console.log("Critical common mechanism tests passed.");
