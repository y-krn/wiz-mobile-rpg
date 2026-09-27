import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { TECHNIQUES } from "../../../src/data/techniques.js";
import {
  commitTechniqueUse,
  getCharTechnique,
  getTechniqueCooldownLength,
  getTechniqueStatus,
  onGuardChosen,
  takeNextAttackMultiplier,
  tickTechniqueCooldowns
} from "../../../src/rules/technique_rules.js";
import { resolvePlayerTechnique } from "../../../src/combat_logic/technique_resolution.js";
import { assignCombatActor, isCombatAction } from "../../../src/combat_logic/combat_action.js";
import { getCharWeaponAtk, resolveWeaponAttack } from "../../../src/data.js";
import { TRIAL_PROFILES } from "../../../src/trial_profiles.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const alwaysHit = () => 0;

function coreItem(baseId, coreId) {
  return {
    kind: "equipment", instanceId: `eq_${baseId}_${coreId}`, baseId, rarity: "magic", level: 1,
    identified: true, halfIdentified: true, knowledgeStage: "full", observationCount: 0, trialCount: 0,
    tags: [], hintTags: [], curseEffectId: null, cursePower: 1, curseSuspected: false,
    unidentifiedName: baseId, affixes: [{ id: coreId, kind: "core", type: coreId, value: 1 }]
  };
}

function reset(profile = TRIAL_PROFILES.PHASE3_EQUIPMENT, kit = "vanguard") {
  state.party = [createStartingKitCharacter(kit)];
  state.inventory = [];
  state.floor = 1;
  state.logs = [];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.trialProfile = profile;
  state.combatState = { monsters: [], roundNumber: 1 };
  return state.party[0];
}

function enemy(overrides = {}) {
  return { name: "的", hp: 200, maxHp: 200, atk: 5, def: 0, color: "#fff", ...overrides };
}

// The action exists only in the trial profile.
let char = reset(TRIAL_PROFILES.NORMAL);
assert.equal(getCharTechnique(char, state), null, "normal runs have no technique");
char = reset();
assert.equal(getCharTechnique(char, state).id, "readingCut", "the vanguard sword owns the blade technique");
char.equipment.weapon = "DAGGER";
assert.equal(getCharTechnique(char, state).id, "twinStrike");
char.equipment.weapon = "MACE";
assert.equal(getCharTechnique(char, state).id, "armorBreak");
char.equipment.weapon = "CLAYMORE";
char.equipment.shield = null;
assert.equal(getCharTechnique(char, state).id, "allOutSwing");
char = reset(TRIAL_PROFILES.PHASE3_EQUIPMENT, "arcana");
assert.equal(getCharTechnique(char, state).id, "focusMana");

// Action contract.
assert.ok(isCombatAction({ type: "technique", actorIdx: 0, targetIdx: 1 }));
assert.ok(isCombatAction({ type: "technique", actorIdx: 0, targetIdx: -1 }));
assert.deepEqual(assignCombatActor({ type: "technique", targetIdx: 2 }, 0), { type: "technique", actorIdx: 0, targetIdx: 2 });

// Cooldown: usable, then unavailable for `cooldown` rounds.
char = reset();
assert.equal(getTechniqueStatus(state, 0).available, true);
assert.equal(commitTechniqueUse(state, 0).ok, true);
tickTechniqueCooldowns(state.combatState);
const cooldown = TECHNIQUES.readingCut.cooldown;
for (let round = 0; round < cooldown; round++) {
  assert.equal(getTechniqueStatus(state, 0).available, false, `still cooling after ${round} ticks`);
  tickTechniqueCooldowns(state.combatState);
}
assert.equal(getTechniqueStatus(state, 0).available, true);

// Hone shortens the cooldown; Blood lets the technique be used early for HP.
char = reset();
char.equipment.weapon = coreItem("SHORT_SWORD", "CORE_TECH_HONE");
assert.equal(getTechniqueCooldownLength(char, getCharTechnique(char, state)), cooldown - 1);
char = reset();
char.equipment.armor = coreItem("LEATHER_ARMOR", "CORE_BLOOD_TECH");
commitTechniqueUse(state, 0);
const status = getTechniqueStatus(state, 0);
assert.equal(status.available, true);
assert.ok(status.hpCost > 0);
const hpBefore = char.hp;
assert.equal(commitTechniqueUse(state, 0).hpPaid, status.hpCost);
assert.equal(char.hp, hpBefore - status.hpCost);

// Riposte: Guard resets the cooldown and primes the next hit.
char = reset();
char.equipment.shield = coreItem("BUCKLER", "CORE_GUARD_RIPOSTE");
commitTechniqueUse(state, 0);
assert.equal(getTechniqueStatus(state, 0).available, false);
assert.equal(onGuardChosen(state, char, 0), true);
assert.equal(getTechniqueStatus(state, 0).available, true);
assert.equal(takeNextAttackMultiplier(char), 1.5);
assert.equal(takeNextAttackMultiplier(char), 1, "the riposte bonus is one-shot");

// Reading cut: more than a plain hit, interrupts an ordinary telegraph and
// only exploits (does not cancel) a guardian's.
char = reset();
const plain = resolveWeaponAttack({
  char, weaponAtk: getCharWeaponAtk(char), randRoll: 0, meleeMod: 1, def: 0, physResist: 0
}).damage;
let target = enemy({ lahalitoQueued: true });
state.combatState.monsters = [target];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
assert.ok(200 - target.hp > plain, "reading cut outdamages the universal attack");
assert.equal(target.lahalitoQueued, false, "ordinary telegraph is interrupted");
char = reset();
const boss = enemy({ isBoss: true, lahalitoQueued: true });
state.combatState.monsters = [boss];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
assert.equal(boss.lahalitoQueued, true, "guardian telegraphs are exploited, not cancelled");

// Armor break ignores DEF and leaves a DEF debuff.
char = reset();
char.equipment.weapon = "MACE";
const armored = enemy({ def: 30 });
state.combatState.monsters = [armored];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
assert.ok(armored.buffs.some(buff => buff.type === "def" && buff.value < 0));

// Twin strike hits twice.
char = reset();
char.equipment.weapon = "DAGGER";
const log = [];
state.combatState.monsters = [enemy()];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, log, { rng: alwaysHit });
assert.equal(log.filter(entry => /二連突き！.*ダメージ/.test(entry.msg)).length, 2);

// Focus mana restores MP and primes the next spell.
char = reset(TRIAL_PROFILES.PHASE3_EQUIPMENT, "arcana");
char.mp = 0;
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: -1 }, state, [], [], { rng: alwaysHit });
assert.equal(char.mp, TECHNIQUES.focusMana.mpRestore);
assert.equal(char.focusSpellMultiplier, TECHNIQUES.focusMana.nextSpellMultiplier);

// Chain: after a technique the next ordinary attack is boosted once.
char = reset();
char.equipment.weapon = coreItem("SHORT_SWORD", "CORE_TECH_CHAIN");
state.combatState.monsters = [enemy()];
resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx: 0 }, state, state.combatState.monsters, [], { rng: alwaysHit });
assert.equal(takeNextAttackMultiplier(char), 1.6);
assert.equal(takeNextAttackMultiplier(char), 1);

console.log("[PASS] Build vNext techniques: profiles, cooldown, Cores, resolution");
