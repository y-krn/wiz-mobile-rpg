import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { getAffixDefinition, getDamageAffixResult } from "../../../src/data.js";
import { getCharMaxMp } from "../../../src/rules/character_stats.js";
import {
  applyKillTempo,
  clearTechniqueCombatFlags,
  getTechniqueDamageMultiplier,
  primeGuardStrike,
  takeNextAttackMultiplier
} from "../../../src/rules/technique_rules.js";
import { applyKillAffixEffects, tryGuardCounter } from "../../../src/combat_logic/damage.js";
import { resolvePlayerTechnique } from "../../../src/combat_logic/technique_resolution.js";
import { applyStatusEffect, STATUS_EFFECT_IDS } from "../../../src/combat_logic/status_effects.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { createRng } from "../../../src/seed_rng.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Verb Supports (#2137): Supports that pay off a player verb (Technique,
// Guard, reading a telegraph, setting up, a pack, a kill) instead of a flat
// stat. Each test fixes the rng so the effect is checked, not the roll.

const VERB_SUPPORTS = ["techPower", "guardStrike", "telegraphHunter", "statusHunter", "packBreaker", "killTempo", "techMp", "guardCounter"];

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

function supportItem(type, value, baseId = "VNEXT_RING") {
  return {
    kind: "equipment", baseId, identified: true,
    affixes: [{ id: type, type, kind: "support", value }]
  };
}

function makeChar(support = null, value = 0) {
  return {
    name: "Tester", level: 5, hp: 100, maxHp: 100, mp: 0, maxMp: 10,
    str: 15, int: 12, pie: 10, vit: 12, agi: 10, luk: 10, status: "ok",
    equipment: {
      weapon: { kind: "equipment", baseId: "SHORT_SWORD", identified: true, affixes: [] },
      shield: null, armor: null,
      accessory: support ? supportItem(support, value) : null
    }
  };
}

function damageWith(char, target, state = null) {
  return getDamageAffixResult(char, target, 100, { state }).damage;
}

test("every verb Support is defined with a cost and a value per rarity", () => {
  VERB_SUPPORTS.forEach(id => {
    const definition = getAffixDefinition(id);
    assert.ok(definition, id);
    assert.equal(definition.kind, "support", id);
  });
});

test("技冴え raises only Technique damage", () => {
  assert.equal(getTechniqueDamageMultiplier(makeChar()), 1);
  assert.ok(Math.abs(getTechniqueDamageMultiplier(makeChar("techPower", 15)) - 1.15) < 1e-9);
});

test("構え打ち: Guard primes the next attack once", () => {
  const plain = makeChar();
  assert.equal(primeGuardStrike(plain), false, "no Support, nothing to prime");
  const char = makeChar("guardStrike", 30);
  assert.equal(primeGuardStrike(char), true);
  assert.ok(Math.abs(takeNextAttackMultiplier(char) - 1.3) < 1e-9);
  assert.equal(takeNextAttackMultiplier(char), 1, "the primed bonus is spent");
  primeGuardStrike(char);
  clearTechniqueCombatFlags([char]);
  assert.equal(takeNextAttackMultiplier(char), 1, "combat end clears the primed bonus");
});

test("見切り眼 pays off only against a telegraphing enemy", () => {
  const char = makeChar("telegraphHunter", 20);
  assert.equal(damageWith(char, { hp: 50 }), 100);
  assert.equal(damageWith(char, { hp: 50, chargeQueued: true }), 120);
});

test("追い討ち pays off against any setup: status, bleeding, or flinch", () => {
  const char = makeChar("statusHunter", 15);
  assert.equal(damageWith(char, { hp: 50 }), 100);
  const poisoned = { hp: 50 };
  applyStatusEffect(poisoned, STATUS_EFFECT_IDS.POISONED, { remainingTurns: 3 });
  assert.equal(damageWith(char, poisoned), 115);
  const bleeding = { hp: 50 };
  applyStatusEffect(bleeding, STATUS_EFFECT_IDS.BLEEDING, { remainingTurns: 3 });
  assert.equal(damageWith(char, bleeding), 115);
  assert.equal(damageWith(char, { hp: 50, flinched: true }), 115);
});

test("群れ崩し needs three living enemies", () => {
  const char = makeChar("packBreaker", 15);
  const pack = count => ({ combatState: { monsters: Array.from({ length: count }, (_, i) => ({ hp: i === 0 ? 0 : 10 })) } });
  assert.equal(damageWith(char, { hp: 10 }, pack(3)), 100, "a dead enemy does not count");
  assert.equal(damageWith(char, { hp: 10 }, pack(4)), 115);
});

test("止め shortens the killer's technique cooldown once per round", () => {
  const char = makeChar("killTempo", 1);
  const stateLike = { party: [char], combatState: { roundNumber: 2, techniqueCooldowns: [3] } };
  assert.equal(applyKillTempo(stateLike, char), 1);
  assert.equal(stateLike.combatState.techniqueCooldowns[0], 2);
  assert.equal(applyKillTempo(stateLike, char), 0, "a second kill in the same round does nothing");
  stateLike.combatState.roundNumber = 3;
  assert.equal(applyKillTempo(stateLike, char), 1);
  stateLike.combatState.techniqueCooldowns[0] = 0;
  stateLike.combatState.roundNumber = 4;
  assert.equal(applyKillTempo(stateLike, char), 0, "nothing to shorten when the technique is ready");
  const plain = makeChar();
  const plainState = { party: [plain], combatState: { roundNumber: 1, techniqueCooldowns: [3] } };
  assert.equal(applyKillTempo(plainState, plain), 0);
});

test("止め is logged from the kill path", () => {
  const char = makeChar("killTempo", 1);
  const killState = { party: [char], floor: 1, combatState: { roundNumber: 1, techniqueCooldowns: [2], monsters: [] } };
  const log = [];
  applyKillAffixEffects(char, { name: "Enemy", hp: 0, maxHp: 10 }, killState, log);
  assert.equal(killState.combatState.techniqueCooldowns[0], 1);
  assert.ok(log.some(entry => entry.msg.includes("止めの勢い")), JSON.stringify(log));
});

test("受け流し counters a hit only on a successful roll", () => {
  const char = makeChar("guardCounter", 20);
  const monster = { name: "Enemy", hp: 50, maxHp: 50, def: 0 };
  const log = [];
  assert.equal(tryGuardCounter(char, monster, 0, { combatState: {} }, log, () => 0.5), 0, "0.5 misses a 20% chance");
  assert.equal(monster.hp, 50);
  const damage = tryGuardCounter(char, monster, 0, { combatState: {} }, log, () => 0);
  assert.ok(damage > 0);
  assert.equal(monster.hp, 50 - damage);
  assert.ok(log.some(entry => entry.msg.includes("受け流し")));
  assert.equal(tryGuardCounter(makeChar(), monster, 0, { combatState: {} }, [], () => 0), 0, "no Support, no counter");
});

test("呼吸 restores MP when a Technique is used", () => {
  state.party = [createStartingKitCharacter("vanguard")];
  state.inventory = [];
  state.floor = 1;
  state.logs = [];
  state.currentRun = createDefaultCurrentRun();
  const char = state.party[0];
  char.equipment.accessory = supportItem("techMp", 1);
  const maxMp = getCharMaxMp(char);
  assert.ok(maxMp > 0, "the test character has an MP pool");
  char.mp = 0;
  const monsters = [{ name: "的", hp: 200, maxHp: 200, atk: 5, def: 0, color: "#fff" }];
  state.combatState = { monsters, roundNumber: 1 };
  const log = [];
  resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, monsters, log, { rng: () => 0 });
  assert.ok(log.some(entry => entry.msg.includes("技の呼吸")), JSON.stringify(log.map(entry => entry.msg)));
  assert.ok(char.mp > 0);
});

test("verb Supports are a visible share of Support drops, not a takeover", () => {
  const rng = createRng("verb-share");
  let verb = 0;
  let total = 0;
  for (let index = 0; index < 3000; index += 1) {
    const item = index % 3 === 0 ? generateRandomAccessory(10, { rng }) : generateRandomEquipment(10, { rng });
    (item?.affixes || []).filter(affix => affix.kind !== "core").forEach(affix => {
      total += 1;
      if (VERB_SUPPORTS.includes(affix.type)) verb += 1;
    });
  }
  const share = verb / total;
  assert.ok(share > 0.2 && share < 0.5, `verb Support share ${share.toFixed(2)}`);
});

if (failures > 0) {
  console.error(`${failures} verb Support check(s) failed`);
  process.exit(1);
}
