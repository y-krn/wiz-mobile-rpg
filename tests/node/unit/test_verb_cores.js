// Verb-hooked Cores (#2138): 溜め受け, 不意打ち, 蝕みの型, 毒移し, 術技一体.
import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import {
  applySpellTechCooldown,
  clearTechniqueCombatFlags,
  commitTechniqueUse,
  getOpeningMultiplier,
  getTechniqueStatus,
  storeGuardDamage,
  takeGuardStore
} from "../../../src/rules/technique_rules.js";
import { resolvePlayerTechnique } from "../../../src/combat_logic/technique_resolution.js";
import { applyKillAffixEffects } from "../../../src/combat_logic/damage.js";
import { applyStatusEffect, hasStatusEffect, STATUS_EFFECT_IDS } from "../../../src/combat_logic/status_effects.js";
import { getCharMaxHp, getCharMaxMp } from "../../../src/rules/character_stats.js";
import { getGeneratableCoreIds } from "../../../src/systems/equipment_generation.js";
import { getCoreFamily } from "../../../src/rules/core_families.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const alwaysHit = () => 0;
const NEW_CORES = ["CORE_GUARD_STORE", "CORE_AMBUSH_STRIKE", "CORE_BLIGHT_TECH", "CORE_PLAGUE_SPREAD", "CORE_SPELL_TECH"];

function coreItem(baseId, coreId) {
  return {
    kind: "equipment", instanceId: `eq_${baseId}_${coreId}`, baseId, rarity: "magic", level: 1,
    identified: true, halfIdentified: true, knowledgeStage: "full", observationCount: 0, trialCount: 0,
    tags: [], hintTags: [], curseEffectId: null, cursePower: 1, curseSuspected: false,
    unidentifiedName: baseId, affixes: [{ id: coreId, kind: "core", type: coreId, value: 1 }]
  };
}

function reset(kit = "vanguard") {
  state.party = [createStartingKitCharacter(kit)];
  state.inventory = [];
  state.floor = 1;
  state.logs = [];
  state.currentRun = createDefaultCurrentRun();
  state.combatState = { monsters: [], roundNumber: 1 };
  return state.party[0];
}

function enemy(overrides = {}) {
  return { name: "的", hp: 500, maxHp: 500, atk: 5, def: 0, color: "#fff", ...overrides };
}

// Technique damage dealt to one fresh target, after `setup` prepares it.
function techniqueDamage(slot, item, { setup = () => {}, firstStrike = false } = {}) {
  const char = reset();
  if (item) char.equipment[slot] = item;
  char.combatFirstStrikeActive = firstStrike;
  const target = enemy();
  setup(target);
  state.combatState.monsters = [target];
  resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
  return { damage: 500 - target.hp, target, char };
}

// Every new Core can appear and belongs to a family that seeds it (or, for
// 毒移し and 術技一体, an accessory seed).
const generatable = new Set(getGeneratableCoreIds(null));
NEW_CORES.forEach(id => assert.ok(generatable.has(id), `${id} can appear`));
[["guard", "CORE_GUARD_STORE"], ["stealth", "CORE_AMBUSH_STRIKE"], ["blight", "CORE_BLIGHT_TECH"],
  ["blight", "CORE_PLAGUE_SPREAD"], ["arcane", "CORE_SPELL_TECH"]].forEach(([familyId, coreId]) => {
  const family = getCoreFamily(familyId);
  assert.ok(family.coreIds.includes(coreId), `${coreId} is in ${familyId}`);
  assert.ok(family.seedOptions.some(option => option.coreId === coreId), `${familyId} seeds ${coreId}`);
});

// 溜め受け: half of the damage is stored, capped at half of max HP, and taken once.
let char = reset();
assert.equal(storeGuardDamage(char, 20), 0, "no store without the Core");
char.equipment.shield = coreItem("BUCKLER", "CORE_GUARD_STORE");
assert.equal(storeGuardDamage(char, 20), 10);
storeGuardDamage(char, 9999);
assert.equal(char.guardStore, Math.floor(getCharMaxHp(char) * 0.5), "the store is capped");
const stored = char.guardStore;
assert.equal(takeGuardStore(char), stored);
assert.equal(takeGuardStore(char), 0, "the store is spent once");
storeGuardDamage(char, 20);
clearTechniqueCombatFlags([char]);
assert.equal(char.guardStore, undefined, "the store ends with combat");

const plain = techniqueDamage("weapon", null).damage;
const banked = techniqueDamage("shield", coreItem("BUCKLER", "CORE_GUARD_STORE"), {
  setup: () => { state.party[0].guardStore = 30; }
});
assert.equal(banked.damage, plain + 30, "the store rides on the technique");
assert.equal(banked.char.guardStore, 0);

// 不意打ち: only with first strike, and only with the Core.
char = reset();
char.combatFirstStrikeActive = true;
assert.equal(getOpeningMultiplier(char), 1);
char.equipment.armor = coreItem("LEATHER_ARMOR", "CORE_AMBUSH_STRIKE");
assert.equal(getOpeningMultiplier(char), 1.5);
char.combatFirstStrikeActive = false;
assert.equal(getOpeningMultiplier(char), 1);
const opening = techniqueDamage("armor", coreItem("LEATHER_ARMOR", "CORE_AMBUSH_STRIKE"), { firstStrike: true }).damage;
assert.ok(opening > plain, `first strike technique is stronger (${opening} > ${plain})`);
assert.equal(techniqueDamage("armor", coreItem("LEATHER_ARMOR", "CORE_AMBUSH_STRIKE")).damage, plain);

// 蝕みの型: a hit poisons; a set-up target takes more.
const blightItem = () => coreItem("SHORT_SWORD", "CORE_BLIGHT_TECH");
const fresh = techniqueDamage("weapon", blightItem());
assert.ok(hasStatusEffect(fresh.target, STATUS_EFFECT_IDS.POISONED), "the technique hit poisons");
const setUp = techniqueDamage("weapon", blightItem(), {
  setup: target => applyStatusEffect(target, STATUS_EFFECT_IDS.POISONED, { source: "test" })
});
assert.ok(setUp.damage > fresh.damage, `a poisoned target takes more (${setUp.damage} > ${fresh.damage})`);
const flinched = techniqueDamage("weapon", blightItem(), { setup: target => { target.flinched = true; } });
assert.ok(flinched.damage > fresh.damage, "a flinched target counts as set up");
const blinded = techniqueDamage("weapon", blightItem(), {
  setup: target => applyStatusEffect(target, STATUS_EFFECT_IDS.BLIND, { remainingTurns: 3 })
});
assert.ok(hasStatusEffect(blinded.target, STATUS_EFFECT_IDS.BLIND), "poison never overwrites blind");

// 毒移し: a poisoned or bleeding kill passes the status on.
char = reset();
char.equipment.accessory = coreItem("VNEXT_RING", "CORE_PLAGUE_SPREAD");
let dead = enemy({ name: "倒れた敵", hp: 0 });
applyStatusEffect(dead, STATUS_EFFECT_IDS.POISONED, { source: "test" });
applyStatusEffect(dead, STATUS_EFFECT_IDS.BLEEDING, { remainingTurns: 3 });
const other = enemy({ name: "隣の敵" });
const gone = enemy({ name: "倒れていた敵", hp: 0 });
state.combatState.monsters = [gone, dead, other];
const log = [];
applyKillAffixEffects(char, dead, state, log);
assert.ok(hasStatusEffect(other, STATUS_EFFECT_IDS.POISONED), "poison moves on");
assert.ok(hasStatusEffect(other, STATUS_EFFECT_IDS.BLEEDING), "bleeding moves on");
assert.ok(!hasStatusEffect(gone, STATUS_EFFECT_IDS.POISONED), "a dead enemy is skipped");
assert.ok(log.some(entry => entry.msg.includes("隣の敵")));
char = reset();
dead = enemy({ hp: 0 });
applyStatusEffect(dead, STATUS_EFFECT_IDS.POISONED, { source: "test" });
const untouched = enemy();
state.combatState.monsters = [dead, untouched];
applyKillAffixEffects(char, dead, state, []);
assert.ok(!hasStatusEffect(untouched, STATUS_EFFECT_IDS.POISONED), "no spread without the Core");

// 術技一体: a spell shortens the cooldown; a technique restores MP.
char = reset("arcana");
char.equipment.accessory = coreItem("VNEXT_AMULET", "CORE_SPELL_TECH");
assert.equal(applySpellTechCooldown(state, char, 0), 0, "nothing to shorten while ready");
assert.equal(commitTechniqueUse(state, 0).ok, true);
const before = getTechniqueStatus(state, 0).remaining;
assert.equal(applySpellTechCooldown(state, char, 0), 1);
assert.equal(getTechniqueStatus(state, 0).remaining, before - 1);
char = reset("vanguard");
char.equipment.accessory = coreItem("VNEXT_AMULET", "CORE_SPELL_TECH");
char.mp = 0;
const mpBefore = char.mp;
state.combatState.monsters = [enemy()];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
if (getCharMaxMp(char) > 0) assert.equal(char.mp, mpBefore + 1, "a technique restores 1 MP");

console.log("[PASS] verb-hooked Cores (#2138)");
