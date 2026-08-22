import { strict as assert } from "node:assert";
import test from "node:test";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";
import {
  applyStatusEffect,
  hasStatusEffect,
  hasStatusEffectForDamage,
  normalizeStatusEffectTarget,
  removeStatusEffect,
  tickMonsterBuffs,
  wakeSleepingMonsterOnDamage,
  STATUS_EFFECT_IDS
} from "../src/combat_logic/status_effects.js";
import { tryApplyExecutionerSetup } from "../src/rules/affix_rules.js";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { migrateSavePayload, SAVE_VERSION } from "../src/state/save_migrations.js";
import { createSoloCharacter, state } from "../src/state.js";

function executionerCharacter() {
  return {
    hp: 20,
    maxHp: 20,
    equipment: {
      weapon: {
        affixes: [{ id: "CORE_EXECUTIONER", kind: "core" }]
      }
    }
  };
}

test("legacy status and simultaneous duration fields normalize without rewriting them", () => {
  const target = {
    status: "sleep",
    sleepTurns: 2,
    silenceTurns: 2
  };

  normalizeStatusEffectTarget(target);

  assert.equal(target.status, "sleep");
  assert.equal(target.sleepTurns, 2);
  assert.equal(target.silenceTurns, 2);
  assert.deepEqual(target.statusEffects, {
    sleep: { id: "sleep", remainingTurns: 2, stacks: 1, source: null },
    silence: { id: "silence", remainingTurns: 2, stacks: 1, source: null }
  });
  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.SLEEP), true);
  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.SILENCE), true);
});

test("legacy poison, sleep, and silence behavior remains projected through the adapter", () => {
  const poison = { status: "ok" };
  applyStatusEffect(poison, STATUS_EFFECT_IDS.POISONED, { source: "test" });
  assert.equal(poison.status, "poisoned");
  assert.equal(hasStatusEffectForDamage(poison), true);
  removeStatusEffect(poison, STATUS_EFFECT_IDS.POISONED);
  assert.equal(poison.status, "ok");

  const sleeping = { status: "sleep", sleepTurns: 2, hp: 10 };
  applyStatusEffect(sleeping, STATUS_EFFECT_IDS.SILENCE, { remainingTurns: 2 });
  tickMonsterBuffs([sleeping]);
  assert.equal(sleeping.status, "sleep");
  assert.equal(sleeping.sleepTurns, 1);
  assert.equal(sleeping.silenceTurns, 1);
  assert.equal(wakeSleepingMonsterOnDamage(sleeping, () => 0), true);
  assert.equal(sleeping.status, undefined);
  assert.equal(sleeping.sleepTurns, undefined);
  assert.equal(sleeping.silenceTurns, 1);
});

test("KATINO and MONTINO preserve their legacy fields and model entries", () => {
  const caster = { name: "Mage", int: 10, pie: 10 };
  const target = { name: "Monster", hp: 20 };
  SPELL_EFFECTS.KATINO({ caster, target: [target], rng: () => 0 });
  SPELL_EFFECTS.MONTINO({ caster, target: [target], rng: () => 0 });

  assert.equal(target.status, "sleep");
  assert.equal(target.sleepTurns, 2);
  assert.equal(target.silenceTurns, 2);
  assert.equal(target.statusEffects.sleep.remainingTurns, 2);
  assert.equal(target.statusEffects.silence.remainingTurns, 2);
});

test("save round-trip normalizes old status fields and retains the canonical shape", () => {
  const originalParty = state.party;
  const originalCombatState = state.combatState;
  state.party = [{ ...createSoloCharacter("Mage"), status: "sleep", sleepTurns: 2, silenceTurns: 2 }];
  state.combatState = {
    monsters: [{ name: "Monster", hp: 20, status: "poisoned" }]
  };

  try {
    const payload = JSON.parse(JSON.stringify(createSavePayload()));
    assert.equal(payload.version, SAVE_VERSION);
    assert.deepEqual(payload.party[0].statusEffects.sleep, {
      id: "sleep", remainingTurns: 2, stacks: 1, source: null
    });
    assert.deepEqual(payload.combatState.monsters[0].statusEffects.poisoned, {
      id: "poisoned", remainingTurns: null, stacks: 1, source: null
    });

    const legacyPayload = JSON.parse(JSON.stringify(payload));
    delete legacyPayload.party[0].statusEffects;
    delete legacyPayload.combatState.monsters[0].statusEffects;
    const restored = migrateSavePayload(legacyPayload);
    applySavePayload(restored);
    assert.equal(state.party[0].status, "sleep");
    assert.equal(state.party[0].sleepTurns, 2);
    assert.equal(state.party[0].silenceTurns, 2);
    assert.equal(state.party[0].statusEffects.silence.remainingTurns, 2);
    assert.equal(state.combatState.monsters[0].status, "poisoned");
    assert.equal(state.combatState.monsters[0].statusEffects.poisoned.id, "poisoned");
  } finally {
    state.party = originalParty;
    state.combatState = originalCombatState;
  }
});

test("CORE_EXECUTIONER keeps the #313 pre-damage poison setup contract", () => {
  const target = { name: "Target", hp: 100, maxHp: 100, status: "ok" };
  const logs = [];
  assert.equal(tryApplyExecutionerSetup(executionerCharacter(), target, { rng: () => 0, logQueue: logs }), true);
  assert.equal(target.status, "poisoned");
  assert.equal(target.statusEffects.poisoned.source, "CORE_EXECUTIONER");
  assert.equal(logs.filter(log => log.executionerStatusSetup).length, 1);
  assert.equal(
    tryApplyExecutionerSetup(executionerCharacter(), target, { rng: () => { throw new Error("duplicate roll"); } }),
    false
  );

  const sleeping = { name: "Sleeping", hp: 100, maxHp: 100, status: "sleep", sleepTurns: 2 };
  assert.equal(tryApplyExecutionerSetup(executionerCharacter(), sleeping, { rng: () => { throw new Error("sleep roll"); } }), false);
  assert.equal(sleeping.status, "sleep");
  assert.equal(sleeping.sleepTurns, 2);
});
