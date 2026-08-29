import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import { resolvePlayerSpell } from "../../../src/combat_logic/spell_resolution.js";
import { applySavePayload, createSavePayload } from "../../../src/state/save_payload.js";
import { migrateSavePayload } from "../../../src/state/save_migrations.js";
import { state } from "../../../src/state.js";
import {
  applyStatusEffect,
  applyVulnerableDamage,
  getStatusEffectRemainingTurns,
  hasStatusEffect,
  hasStatusEffectForDamage,
  STATUS_EFFECT_IDS,
  tickStatusEffects,
  VULNERABLE_DAMAGE_MULTIPLIER,
  VULNERABLE_DURATION_TURNS
} from "../../../src/combat_logic/status_effects.js";

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function createCombatState(target = {}) {
  const caster = {
    name: "Mage", class: "Mage", level: 5, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10, status: "ok",
    spells: ["VULNERA", "MAHALITO"], equipment: { weapon: null, shield: null, armor: null, accessory: null }
  };
  return {
    party: [caster],
    floor: 1,
    gameState: "combat",
    combatState: {
      phase: "choose_actions", roundNumber: 1,
      monsters: [{ name: "Target", hp: 1000, maxHp: 1000, atk: 1, def: 0, row: "front", status: "ok", ...target }]
    },
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    inventory: [], firstKills: [], codex: null, floorChestsTotal: [],
    simTelemetry: { vulnerable: { attempts: 0, applied: 0, refresh: 0, consumed: 0, expired: 0, cleared: 0, damageContribution: 0, latencyTurns: [], qualifyingHitTypes: {}, sources: {} } },
    combatFormulaTelemetry: { physicalPlayerHits: [], physicalPlayerMisses: [], physicalMonsterHits: [], spellHits: [], targetedBonuses: [], mitigations: [], mitigationCalls: [] }
  };
}

const target = {};
applyStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE, { remainingTurns: VULNERABLE_DURATION_TURNS, source: "VULNERA" });
const amplified = applyVulnerableDamage(target, 20);
assert.equal(amplified.damage, Math.round(20 * VULNERABLE_DAMAGE_MULTIPLIER));
assert.equal(amplified.damageContribution, 5);
assert.equal(amplified.consumed, true);
assert.equal(hasStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE), false);
assert.equal(applyVulnerableDamage(target, 20).consumed, false);

applyStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE, { remainingTurns: 1, stacks: 99, source: "old" });
applyStatusEffect(target, STATUS_EFFECT_IDS.VULNERABLE, { remainingTurns: VULNERABLE_DURATION_TURNS, stacks: 99, source: "new" });
assert.equal(getStatusEffectRemainingTurns(target, STATUS_EFFECT_IDS.VULNERABLE), VULNERABLE_DURATION_TURNS);
assert.equal(target.statusEffects.vulnerable.stacks, 1);
assert.equal(hasStatusEffectForDamage(target), false);

const spellState = createCombatState();
const spellTarget = spellState.combatState.monsters[0];
const spellLogs = [];
const originalRandom = Math.random;
Math.random = () => 0;
resolvePlayerSpell(spellState.party[0], { spellName: "VULNERA", targetIdx: 0 }, spellState, [spellTarget], spellLogs);
assert.equal(hasStatusEffect(spellTarget, STATUS_EFFECT_IDS.VULNERABLE), true);
assert.equal(spellState.simTelemetry.vulnerable.attempts, 1);
assert.equal(spellState.simTelemetry.vulnerable.applied, 1);
resolvePlayerSpell(spellState.party[0], { spellName: "MAHALITO", targetIdx: 0 }, spellState, [spellTarget], spellLogs);
Math.random = originalRandom;
assert.equal(hasStatusEffect(spellTarget, STATUS_EFFECT_IDS.VULNERABLE), false);
assert.equal(spellState.simTelemetry.vulnerable.consumed, 1);
assert.equal(spellState.simTelemetry.vulnerable.qualifyingHitTypes.spell, 1);
assert.equal(spellState.combatFormulaTelemetry.spellHits.at(-1).damage, 45);
assert.equal(spellState.combatFormulaTelemetry.spellHits.at(-1).vulnerableDamageContribution, 9);
assert.match(spellLogs.map(entry => entry.msg).join("\n"), /脆弱で\+9/);

const areaState = createCombatState();
areaState.party[0].spells.push("LAHALITO");
const areaTarget = areaState.combatState.monsters[0];
applyStatusEffect(areaTarget, STATUS_EFFECT_IDS.VULNERABLE, { remainingTurns: 3, source: "VULNERA" });
const areaRandom = Math.random;
Math.random = () => 0;
resolvePlayerSpell(areaState.party[0], { spellName: "LAHALITO", targetIdx: -1 }, areaState, [areaTarget], []);
Math.random = areaRandom;
assert.equal(areaTarget.hp, 977);
assert.equal(areaState.combatFormulaTelemetry.spellHits.at(-1).vulnerableConsumed, true);
assert.equal(areaState.combatFormulaTelemetry.spellHits.at(-1).vulnerableDamageContribution, 5);

const physicalState = createCombatState({
  statusEffects: { vulnerable: { id: "vulnerable", remainingTurns: 3, stacks: 1, source: "VULNERA" } }
});
physicalState.party[0].str = 15;
const physicalRandom = Math.random;
Math.random = () => 0;
const physical = runCombatRoundCalculation(physicalState, {
  actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
});
Math.random = physicalRandom;
const physicalHit = physical.state.combatFormulaTelemetry.physicalPlayerHits[0];
assert.equal(physicalHit.vulnerableConsumed, true);
assert.ok(physicalHit.vulnerableDamageContribution > 0);
assert.equal(physical.state.simTelemetry.vulnerable.qualifyingHitTypes.physical, 1);
assert.equal(hasStatusEffect(physical.state.combatState.monsters[0], STATUS_EFFECT_IDS.VULNERABLE), false);

const originalParty = state.party;
const originalGameState = state.gameState;
const originalCombatState = state.combatState;
state.party = [spellState.party[0]];
state.gameState = "combat";
state.combatState = {
  phase: "choose_actions",
  monsters: [{ name: "Saved Target", hp: 40, maxHp: 100, status: "ok", statusEffects: {
    vulnerable: { id: "vulnerable", remainingTurns: 2, stacks: 1, source: "VULNERA" }
  } }]
};
try {
  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  assert.deepEqual(payload.combatState.monsters[0].statusEffects.vulnerable, {
    id: "vulnerable", remainingTurns: 2, stacks: 1, source: "VULNERA"
  });
  applySavePayload(migrateSavePayload(payload));
  assert.equal(state.combatState.monsters[0].statusEffects.vulnerable.remainingTurns, 2);
  assert.equal(state.combatState.monsters[0].statusEffects.vulnerable.source, "VULNERA");
} finally {
  state.party = originalParty;
  state.gameState = originalGameState;
  state.combatState = originalCombatState;
}

const expiring = { status: "ok" };
applyStatusEffect(expiring, STATUS_EFFECT_IDS.VULNERABLE, { remainingTurns: 1, source: "VULNERA" });
let expired = 0;
tickStatusEffects(expiring, { onVulnerableExpire: () => { expired++; } });
assert.equal(expired, 1);
assert.equal(hasStatusEffect(expiring, STATUS_EFFECT_IDS.VULNERABLE), false);

console.log("vulnerable deterministic pipeline: PASS");
