import { strict as assert } from "node:assert";
import test from "node:test";
import { SPELL_EFFECTS } from "../../../src/systems/spell_effects.js";
import { ITEM_EFFECTS } from "../../../src/systems/item_effects.js";
import {
  applyStatusEffect,
  hasStatusEffect,
  hasStatusEffectForDamage,
  normalizeStatusEffectTarget,
  removeStatusEffect,
  resolveExplorationPoisonStep,
  rollExplorationPoisonDuration,
  EXPLORATION_POISON_DURATION_MIN,
  EXPLORATION_POISON_DURATION_MAX,
  tickMonsterBuffs,
  wakeSleepingMonsterOnDamage,
  STATUS_EFFECT_IDS
} from "../../../src/combat_logic/status_effects.js";
import { tryApplyExecutionerSetup } from "../../../src/rules/affix_rules.js";
import { applySavePayload, createSavePayload } from "../../../src/state/save_payload.js";
import { migrateSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";
import { createSoloCharacter, state } from "../../../src/state.js";

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

test("exploration poison has a finite, probabilistic lifecycle while legacy poison remains cureable", () => {
  const target = { name: "Explorer", hp: 20, status: "poisoned" };
  const rolls = [0.99, 0.20, 0.99, 0.20, 0.00];
  const rng = () => rolls.shift() ?? 0.99;

  const noDamage = resolveExplorationPoisonStep(target, {
    rng,
    damageChance: 0.5,
    durationSteps: 3
  });
  assert.equal(noDamage.damage, 0);
  assert.equal(noDamage.remainingSteps, 2);
  assert.equal(target.hp, 20);

  const damaged = resolveExplorationPoisonStep(target, {
    rng,
    damageChance: 0.5,
    durationSteps: 3
  });
  assert.equal(damaged.damage, 2);
  assert.equal(target.hp, 18);
  assert.equal(damaged.remainingSteps, 1);

  const ended = resolveExplorationPoisonStep(target, {
    rng,
    damageChance: 0,
    durationSteps: 1
  });
  assert.equal(ended.naturalCure, true);
  assert.equal(target.status, "ok");

  const legacy = { name: "Legacy", hp: 10, status: "poisoned" };
  const legacyRolls = [0.99, 0.99];
  const legacyTick = resolveExplorationPoisonStep(legacy, {
    rng: () => legacyRolls.shift() ?? 0.99,
    damageChance: null,
    durationSteps: null
  });
  assert.equal(legacyTick.damage, 2);
  assert.equal(legacyTick.remainingSteps, 11);
  assert.equal(legacy.status, "poisoned");
  removeStatusEffect(legacy, STATUS_EFFECT_IDS.POISONED);
  assert.equal(legacy.status, "ok");
});

test("exploration poison duration is rolled once within the 7-12 step range", () => {
  assert.equal(rollExplorationPoisonDuration(() => 0), EXPLORATION_POISON_DURATION_MIN);
  assert.equal(rollExplorationPoisonDuration(() => 0.999999), EXPLORATION_POISON_DURATION_MAX);

  const target = { name: "Rolled", hp: 20, status: STATUS_EFFECT_IDS.POISONED };
  const rolls = [0, 0.999999];
  const first = resolveExplorationPoisonStep(target, { rng: () => rolls.shift(), damageChance: 0 });
  const second = resolveExplorationPoisonStep(target, { rng: () => rolls.shift(), damageChance: 0 });
  assert.equal(first.remainingSteps, EXPLORATION_POISON_DURATION_MIN - 1);
  assert.equal(second.remainingSteps, EXPLORATION_POISON_DURATION_MIN - 2);
});

test("exploration poison keeps the default 30% chance and 1-2 damage range", () => {
  const noDamage = { hp: 20, status: STATUS_EFFECT_IDS.POISONED };
  const noDamageRolls = [0, 0.30];
  assert.equal(resolveExplorationPoisonStep(noDamage, {
    rng: () => noDamageRolls.shift(),
  }).damage, 0);

  const oneDamage = { hp: 20, status: STATUS_EFFECT_IDS.POISONED };
  const oneDamageRolls = [0, 0.29, 0];
  assert.equal(resolveExplorationPoisonStep(oneDamage, {
    rng: () => oneDamageRolls.shift(),
  }).damage, 1);

  const twoDamage = { hp: 20, status: STATUS_EFFECT_IDS.POISONED };
  const twoDamageRolls = [0, 0.29, 0.999];
  assert.equal(resolveExplorationPoisonStep(twoDamage, {
    rng: () => twoDamageRolls.shift(),
  }).damage, 2);
});

test("player poison save/load preserves finite and legacy records with lazy first-step migration", () => {
  const originalParty = state.party;
  const originalCombatState = state.combatState;
  const character = createSoloCharacter("Priest");
  character.status = STATUS_EFFECT_IDS.POISONED;
  character.statusEffects = {
    poisoned: { id: STATUS_EFFECT_IDS.POISONED, remainingTurns: 6, stacks: 1, source: "spring" }
  };
  state.party = [character];
  state.combatState = null;

  try {
    const currentPayload = JSON.parse(JSON.stringify(createSavePayload()));
    assert.equal(currentPayload.party[0].statusEffects.poisoned.remainingTurns, 6);
    assert.equal(currentPayload.party[0].statusEffects.poisoned.source, "spring");

    applySavePayload(migrateSavePayload(currentPayload));
    assert.equal(state.party[0].status, STATUS_EFFECT_IDS.POISONED);
    assert.equal(state.party[0].statusEffects.poisoned.remainingTurns, 6);

    const currentTick = resolveExplorationPoisonStep(state.party[0], {
      rng: () => 0.99,
      damageChance: 0
    });
    assert.equal(currentTick.damage, 0);
    assert.equal(currentTick.remainingSteps, 5);
    assert.equal(state.party[0].statusEffects.poisoned.remainingTurns, 5);

    const legacyPayload = JSON.parse(JSON.stringify(currentPayload));
    delete legacyPayload.party[0].statusEffects;
    applySavePayload(migrateSavePayload(legacyPayload));
    assert.equal(state.party[0].status, STATUS_EFFECT_IDS.POISONED);
    assert.equal(state.party[0].statusEffects.poisoned.remainingTurns, null);

    const legacyTick = resolveExplorationPoisonStep(state.party[0], {
      rng: () => 0.99,
      damageChance: 0
    });
    assert.equal(legacyTick.damage, 0);
    assert.equal(legacyTick.remainingSteps, 11);
    assert.equal(state.party[0].statusEffects.poisoned.remainingTurns, 11);
  } finally {
    state.party = originalParty;
    state.combatState = originalCombatState;
  }
});

test("all current poison cures clear both finite and legacy player poison", () => {
  const cures = [
    ["ANTIDOTE", ({ char }) => ITEM_EFFECTS.ANTIDOTE({ char })],
    ["HOLY_WATER", ({ char }) => ITEM_EFFECTS.HOLY_WATER({ char })],
    ["PANACEA", ({ char }) => ITEM_EFFECTS.PANACEA({ char })],
    ["LATUMOFIS", ({ char }) => SPELL_EFFECTS.LATUMOFIS({ caster: { name: "Priest" }, target: char })]
  ];

  cures.forEach(([label, cure]) => {
    [6, null].forEach(remainingTurns => {
      const target = {
        name: `${label}-${remainingTurns ?? "legacy"}`,
        hp: 10,
        maxHp: 20,
        status: STATUS_EFFECT_IDS.POISONED
      };
      if (remainingTurns !== null) {
        target.statusEffects = {
          poisoned: { id: STATUS_EFFECT_IDS.POISONED, remainingTurns, stacks: 1, source: "chest" }
        };
      }

      cure({ char: target });

      assert.equal(target.status, "ok", `${label} should clear ${remainingTurns === null ? "legacy" : "finite"} poison`);
      assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.POISONED), false, `${label} left poison active`);
    });
  });
});

test("normalization removes stale canonical legacy status after direct legacy transition", () => {
  const target = { status: "sleep", sleepTurns: 2 };
  normalizeStatusEffectTarget(target);
  target.status = "poisoned";
  delete target.sleepTurns;

  normalizeStatusEffectTarget(target);

  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.SLEEP), false);
  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.POISONED), true);
  assert.deepEqual(Object.keys(target.statusEffects), [STATUS_EFFECT_IDS.POISONED]);
});

test("normalization removes stale canonical silence after duration expiry or absence", () => {
  const target = { status: "ok", silenceTurns: 2 };
  normalizeStatusEffectTarget(target);
  target.silenceTurns = 0;
  normalizeStatusEffectTarget(target);
  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.SILENCE), false);

  target.silenceTurns = 2;
  normalizeStatusEffectTarget(target);
  delete target.silenceTurns;
  normalizeStatusEffectTarget(target);
  assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.SILENCE), false);
  assert.equal(Object.hasOwn(target.statusEffects, STATUS_EFFECT_IDS.SILENCE), false);
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
    monsters: [{
      name: "Monster", hp: 20, status: "poisoned",
      statusEffects: {
        bleeding: { id: "bleeding", remainingTurns: 2, stacks: 1, source: "bleedingAtk" }
      }
    }, {
      name: "Chest Poison", hp: 20, status: "poisoned",
      statusEffects: {
        poisoned: { id: STATUS_EFFECT_IDS.POISONED, remainingTurns: 7, stacks: 1, source: "chest" }
      }
    }]
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
    assert.deepEqual(payload.combatState.monsters[0].statusEffects.bleeding, {
      id: "bleeding", remainingTurns: 2, stacks: 1, source: "bleedingAtk"
    });
    assert.deepEqual(payload.combatState.monsters[1].statusEffects.poisoned, {
      id: "poisoned", remainingTurns: 7, stacks: 1, source: "chest"
    });

    applySavePayload(migrateSavePayload(payload));
    assert.equal(state.combatState.monsters[0].statusEffects.bleeding.remainingTurns, 2);
    assert.equal(state.combatState.monsters[0].statusEffects.bleeding.source, "bleedingAtk");
    assert.equal(state.combatState.monsters[1].statusEffects.poisoned.remainingTurns, 7);

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
