// sim-scope: formula — Issue #1064 unknown equipment trial commit and projection
/* global console */

import "./simulation_preflight.js";
import { createStartingKitCharacter, state } from "../../src/state.js";
import {
  createLoadoutDraft,
  stageTrialEquip,
  validateLoadoutDraft
} from "../../src/rules/loadout_transaction.js";
import { commitLoadoutDraft } from "../../src/systems/loadout_transaction.js";

function createUnknownEquipment(instanceId) {
  return {
    kind: "equipment",
    instanceId,
    baseId: "SHORT_SWORD",
    rarity: "rare",
    level: 2,
    identified: false,
    knowledgeStage: "discovery",
    trialCount: 0,
    tags: ["blade"],
    hintTags: ["blade"],
    observedHintTags: [],
    curseEffectId: "curse_blood_thirst",
    cursePower: 1,
    curseSuspected: true,
    affixes: []
  };
}

function runScenario(name, { bag = [], previousWeapon = "DAGGER" } = {}) {
  const item = createUnknownEquipment(`${name}-item`);
  const character = createStartingKitCharacter("vanguard");
  character.equipment.weapon = previousWeapon;
  const stateLike = {
    ...state,
    party: [character],
    inventory: [item, ...bag],
    gameState: "explore",
    currentRun: { steps: 0, floorSteps: {}, runSeed: `issue-1064-${name}` }
  };
  const draft = createLoadoutDraft(stateLike);
  const staged = stageTrialEquip(draft, { actorIdx: 0, inventoryIndex: 0 });
  const validation = staged.ok ? validateLoadoutDraft(staged.draft) : staged;
  const commit = staged.ok && validation.ok
    ? commitLoadoutDraft(staged.draft, { stateLike, turnCost: 1 })
    : { ok: false, reason: validation.reason || validation.errors?.join(" ") };
  return {
    name,
    staged: staged.ok,
    projectedValid: validation.ok,
    committed: commit.ok,
    turnCost: commit.turnCost || 0,
    finalBag: staged.ok && validation.ok ? staged.draft.inventory.length : null,
    knowledgeStage: item.knowledgeStage,
    curseLocked: item.curseLocked === true
  };
}

console.log(JSON.stringify({
  issue: 1064,
  scenarios: [
    runScenario("displaced-gear", { bag: Array.from({ length: 19 }, () => "HEAL_POTION") }),
    runScenario("empty-bag")
  ]
}, null, 2));
