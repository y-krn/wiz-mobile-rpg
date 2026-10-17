import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { TECHNIQUES, VARIANT_TECHNIQUES } from "../../../src/data/techniques.js";
import { getCoreFamily } from "../../../src/rules/core_families.js";
import {
  commitTechniqueUse,
  getCharTechnique,
  getItemTechnique,
  getTechniqueStatus,
  tickTechniqueStances
} from "../../../src/rules/technique_rules.js";
import { resolveGuardMitigation } from "../../../src/rules/guard_rules.js";
import { resolvePlayerTechnique } from "../../../src/combat_logic/technique_resolution.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Variant techniques (#2135): the 変化の型 Core swaps a weapon's family
// technique for a variant with a different role.

const alwaysHit = () => 0;

function shiftItem(baseId) {
  return {
    kind: "equipment", instanceId: `eq_${baseId}_shift`, baseId, rarity: "magic", level: 1,
    identified: true, halfIdentified: true, knowledgeStage: "full", observationCount: 0, trialCount: 0,
    tags: [], hintTags: [], curseEffectId: null, cursePower: 1, curseSuspected: false,
    unidentifiedName: baseId, affixes: [{ id: "CORE_TECH_SHIFT", kind: "core", type: "CORE_TECH_SHIFT", value: 1 }]
  };
}

function reset(kit = "vanguard", weaponBaseId = null) {
  state.party = [createStartingKitCharacter(kit)];
  state.inventory = [];
  state.floor = 1;
  state.logs = [];
  state.currentRun = createDefaultCurrentRun();
  state.combatState = { monsters: [], roundNumber: 1 };
  const char = state.party[0];
  if (weaponBaseId) {
    char.equipment.weapon = shiftItem(weaponBaseId);
    if (weaponBaseId === "CLAYMORE" || weaponBaseId === "SAGE_STAFF") char.equipment.shield = null;
  }
  return char;
}

function enemy(overrides = {}) {
  return { name: "的", hp: 200, maxHp: 200, atk: 5, def: 0, color: "#fff", ...overrides };
}

function useTechnique(char, monsters, targetIdx = 0) {
  state.combatState.monsters = monsters;
  const log = [];
  resolvePlayerTechnique(char, { type: "technique", actorIdx: 0, targetIdx }, state, monsters, log, { rng: alwaysHit });
  return log;
}

// Every family has exactly one variant, and it differs from the base technique.
const profiles = ["light", "blade", "impact", "heavy", "medium"];
profiles.forEach(profileId => {
  const variants = Object.values(VARIANT_TECHNIQUES).filter(technique => technique.profileId === profileId);
  assert.equal(variants.length, 1, `${profileId} has one variant`);
  const base = Object.values(TECHNIQUES).find(technique => technique.profileId === profileId);
  assert.notEqual(variants[0].id, base.id);
});

// The Core swaps the technique for the character and for the item card.
const expected = { DAGGER: "shadowPin", SHORT_SWORD: "sweep", MACE: "guardedBlow", CLAYMORE: "recklessBlow", SAGE_STAFF: "manaStrike" };
Object.entries(expected).forEach(([baseId, techniqueId]) => {
  const char = reset("vanguard", baseId);
  assert.equal(getCharTechnique(char, state).id, techniqueId, `${baseId} with 変化の型 uses ${techniqueId}`);
  assert.equal(getItemTechnique(shiftItem(baseId)).id, techniqueId);
});
assert.equal(getItemTechnique("SHORT_SWORD").id, "readingCut", "a plain weapon keeps its family technique");
assert.equal(getItemTechnique("LEATHER_ARMOR"), null);

// The Core is offered by the 技 family, including the first chest.
const family = getCoreFamily("technique");
assert.ok(family.coreIds.includes("CORE_TECH_SHIFT"));
assert.ok(family.seedOptions.some(option => option.coreId === "CORE_TECH_SHIFT"));

// 影縫い: a normal enemy loses its next action; a guardian does not.
let char = reset("vanguard", "DAGGER");
const pinned = enemy();
useTechnique(char, [pinned]);
assert.ok(pinned.hp < 200);
assert.equal(pinned.flinched, true);
char = reset("vanguard", "DAGGER");
const guardian = enemy({ isBoss: true });
useTechnique(char, [guardian]);
assert.notEqual(guardian.flinched, true, "guardians shrug off 影縫い");

// 薙ぎ払い: hits every living enemy, without a target choice.
char = reset("vanguard", "SHORT_SWORD");
const pack = [enemy({ name: "A" }), enemy({ name: "B", hp: 0 }), enemy({ name: "C" })];
useTechnique(char, pack, -1);
assert.ok(pack[0].hp < 200 && pack[2].hp < 200, "every living enemy is hit");
assert.equal(pack[1].hp, 0);

// 守り打ち / 捨て身: incoming damage is scaled until the end of the next round.
char = reset("vanguard", "MACE");
useTechnique(char, [enemy()]);
assert.equal(resolveGuardMitigation(char, 100), 60);
tickTechniqueStances(state.party);
assert.equal(resolveGuardMitigation(char, 100), 60, "still active during the next round");
tickTechniqueStances(state.party);
assert.equal(resolveGuardMitigation(char, 100), 100, "gone after the next round ends");
char = reset("vanguard", "CLAYMORE");
const reckless = useTechnique(char, [enemy()]);
assert.equal(resolveGuardMitigation(char, 100), 150);
assert.ok(reckless.some(entry => /守りを捨てた/.test(entry.msg)));
const guarded = resolveGuardMitigation(char, 100, { isDefending: true });
assert.ok(guarded < 150, "guarding still helps under 捨て身");

// 魔力撃: costs MP, ignores DEF, and cannot be used without the MP.
char = reset("arcana", "SAGE_STAFF");
char.mp = 5;
const armored = enemy({ def: 500 });
useTechnique(char, [armored]);
assert.equal(char.mp, 2);
assert.ok(200 - armored.hp > 1, "DEF is ignored");
char = reset("arcana", "SAGE_STAFF");
char.mp = 2;
const status = getTechniqueStatus(state, 0);
assert.equal(status.available, false);
assert.equal(status.mpShort, true);
assert.equal(commitTechniqueUse(state, 0).ok, false);

console.log("[PASS] Technique variants: 変化の型 swaps the family technique and each variant resolves");
