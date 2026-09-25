// Focused controlled N=1 evidence for Phase 4j-E6; never wired into production simulation.

import { generateEncounter } from "../../src/combat_ui/encounter.js";
import { getEncounterPoolForFloor, getEncounterSizeWeightsForFloor, MONSTERS } from "../../src/data.js";
import { runCombatRoundCalculation } from "../../src/combat_logic.js";
import { createDefaultCurrentRun, createStartingKitCharacter } from "../../src/state/initial_state.js";
import { isEncounterCompositionAllowed } from "../../src/rules/encounter_rules.js";
import {
  allocateCandidateAward, calculateCandidateAward
} from "./progression_exp_award_paired_inventory.js";
import {
  candidateSettlementBudget, createCandidateExpLifecycle, reconcileCandidateExpLifecycle
} from "./progression_exp_award_lifecycle.js";

function identityTemplate(name) {
  const baseName = name.replace(/\s[A-Z]$/, "");
  const template = MONSTERS.find(entry => entry.name === baseName);
  if (!template) throw new Error(`generated enemy identity has no production template: ${name}`);
  return template;
}

function controlledEncounterRng(floor, targetName, targetSize = 1) {
  const pool = getEncounterPoolForFloor(floor).map(name => MONSTERS.find(entry => entry.name === name)).filter(Boolean);
  const weights = getEncounterSizeWeightsForFloor(floor, { runSeed: `phase4j-e6-b${floor}` });
  let cumulative = 0;
  for (let index = 0; index < targetSize - 1; index++) cumulative += weights[index];
  const sizeRoll = cumulative + weights[targetSize - 1] / 2;
  let call = 0;
  const selected = [];
  return () => {
    if (call++ === 0) return 0.99; // production ordinary branch
    if (call === 2) return sizeRoll;
    const candidates = pool.filter(template =>
      isEncounterCompositionAllowed([...selected, template], targetSize));
    const preferred = selected.length === 0
      ? candidates.findIndex(template => template.name === targetName)
      : -1;
    const index = preferred >= 0 ? preferred : candidates.findIndex(template =>
      !template.treasureRare && !template.isBoss && !template.isMidboss &&
      !template.traits?.includes("splitOnDeath") && !template.traits?.includes("summonAlly"));
    if (index < 0) throw new Error(`controlled production pool cannot select ${targetName} at B${floor}`);
    selected.push(candidates[index]);
    return (index + 0.5) / candidates.length;
  };
}

function rareEncounterRng(floor, targetName) {
  const maxPoolLevel = Math.max(...getEncounterPoolForFloor(floor).map(name =>
    MONSTERS.find(entry => entry.name === name)?.level ?? 0));
  const treasure = MONSTERS.filter(monster => monster.treasureRare && monster.level <= maxPoolLevel + 1);
  const index = treasure.findIndex(monster => monster.name === targetName);
  if (index < 0) throw new Error(`production Rare pool at B${floor} excludes ${targetName}`);
  let call = 0;
  return () => call++ === 0 ? 0 : (index + 0.5) / treasure.length;
}

function generate(floor, name, { rare = false, targetSize = 1 } = {}) {
  const runSeed = `phase4j-e6-controlled-b${floor}-${name}`;
  const generated = generateEncounter(
    { floor, currentRun: { runSeed, trialBands: {} } }, false, false, false, null,
    rare ? rareEncounterRng(floor, name) : controlledEncounterRng(floor, name, targetSize)
  );
  const target = generated.monsters.find(monster => monster.name.replace(/\s[A-Z]$/, "") === name);
  if (!target || (rare && !generated.isRare) || (!rare && generated.isRare)) {
    throw new Error(`production generateEncounter failed controlled ${rare ? "Rare" : "ordinary"} identity ${name}`);
  }
  return { generated, runSeed };
}

function createState(floor, runSeed, monsters, flags = {}) {
  const character = createStartingKitCharacter("vanguard");
  character.name = "E6 controlled combatant";
  character.str = flags.weak ? 1 : 10000;
  character.agi = 100000;
  character.vit = 10000;
  character.hp = 1_000_000;
  character.maxHp = 1_000_000;
  character.exp = 0;
  character.level = 1;
  if (!flags.weak) {
    character.equipment.weapon = {
      baseId: "SHORT_SWORD", identified: true,
      affixes: [{ type: "atk", value: 1_000_000 }]
    };
  }
  return {
    floor,
    party: [character],
    currentRun: { ...createDefaultCurrentRun(), runSeed, expGained: 0 },
    combatState: {
      monsters: structuredClone(monsters), isBoss: false, isMidboss: false,
      isRoamingFlack: false, phase: "choose_actions", roundNumber: 1,
      enemyActionScheduling: "independent"
    },
    inventory: [], firstKills: [], roamingMonsters: [], floorChestsTotal: [], codex: null
  };
}

function candidateAllocation(floor, monsters) {
  const templates = monsters.map(monster => identityTemplate(monster.name));
  const award = calculateCandidateAward({
    floor, kind: "ordinary",
    monsters: templates.map(template => ({ templateExp: template.exp })),
    encounterSize: monsters.length
  });
  const allocation = allocateCandidateAward(award.totalAward,
    templates.map(template => ({ templateExp: template.exp })));
  return { award, allocation, templates };
}

function withoutExp(monster) {
  const copy = structuredClone(monster);
  delete copy.exp;
  return copy;
}

function runArm({ floor, runSeed, generated, candidate, kind, weak = false }) {
  const originalMonsters = structuredClone(generated);
  const allocationData = kind === "rare"
    ? { award: calculateCandidateAward({ floor, kind: "rare" }), allocation: [calculateCandidateAward({ floor, kind: "rare" }).totalAward] }
    : candidateAllocation(floor, generated);
  const monsters = structuredClone(generated);
  if (candidate) monsters.forEach((monster, index) => { monster.exp = allocationData.allocation[index]; });
  const lifecycle = createCandidateExpLifecycle(monsters, allocationData.allocation);
  const initialCandidateFields = monsters.map(withoutExp);
  let state = createState(floor, runSeed, monsters, { weak });
  const before = {
    combatLedger: state.currentRun.expGained, characterExp: state.party[0].exp,
    level: state.party[0].level, maxHp: state.party[0].maxHp, hp: state.party[0].hp
  };
  let rounds = 0;
  let fledLog = false;
  let splitGenerated = false;
  let summonGenerated = false;
  let victoryLog = false;
  let reconcileMutatesOnlyExp = true;
  const maxRounds = kind === "summon" ? 12 : 8;
  while (state.combatState.monsters.some(monster => monster.hp > 0) && rounds < maxRounds) {
    const combatants = state.combatState.monsters;
    const targetIdx = combatants.findIndex(monster => monster.hp > 0);
    let actions;
    if (kind === "summon" && rounds < 4) {
      actions = [{ actorIdx: 0, type: "defend" }];
    } else {
      actions = [{ actorIdx: 0, type: "fight", targetIdx }];
    }
    const result = runCombatRoundCalculation(state, { actions }, { rng: () => kind === "flee" ? 0 : 0.5 });
    state = result.state;
    fledLog ||= result.logQueue.some(entry => entry.msg?.includes("逃げ出した"));
    splitGenerated ||= result.logQueue.some(entry => entry.msg?.includes("体に分裂した"));
    summonGenerated ||= result.logQueue.some(entry => entry.msg?.includes("を召喚した"));
    victoryLog ||= result.logQueue.some(entry => entry.msg?.includes("戦闘に勝利した"));
    rounds++;
    if (candidate) {
      const beforeReconcile = state.combatState.monsters.map(withoutExp);
      reconcileCandidateExpLifecycle(state.combatState.monsters, lifecycle);
      const afterReconcile = state.combatState.monsters.map(withoutExp);
      reconcileMutatesOnlyExp &&= JSON.stringify(beforeReconcile) === JSON.stringify(afterReconcile);
    }
  }
  const finalMonsters = state.combatState.monsters;
  const settlement = candidate
    ? candidateSettlementBudget(finalMonsters, lifecycle)
    : finalMonsters.filter(monster => !monster.fled).reduce((sum, monster) => sum + monster.exp, 0);
  const ledgerDelta = state.currentRun.expGained - before.combatLedger;
  const expDelta = state.party[0].exp - before.characterExp;
  return {
    candidate, rounds, fledLog, splitGenerated, summonGenerated, victory: victoryLog,
    allFled: finalMonsters.length > 0 && finalMonsters.every(monster => monster.fled),
    allDefeated: finalMonsters.every(monster => monster.hp <= 0),
    initialCount: generated.length, finalCount: finalMonsters.length,
    initialCandidateBudgets: [...allocationData.allocation],
    initialExp: finalMonsters.slice(0, generated.length).map(monster => monster.exp),
    descendantExp: finalMonsters.slice(generated.length).map(monster => monster.exp),
    settlementBudget: settlement, combatLedgerDelta: ledgerDelta, characterExpDelta: expDelta,
    levelBefore: before.level, levelAfter: state.party[0].level,
    maxHpBefore: before.maxHp, maxHpAfter: state.party[0].maxHp,
    hpBefore: before.hp, hpAfter: state.party[0].hp,
    initialNonExpFieldsUnchanged: JSON.stringify(initialCandidateFields) === JSON.stringify(
      (candidate ? generated.map(withoutExp) : originalMonsters.map(withoutExp))
    ),
    reconcileMutatesOnlyExp,
    dynamicDescendantCount: Math.max(0, finalMonsters.length - generated.length),
    settled: victoryLog || (finalMonsters.length > 0 && finalMonsters.every(monster => monster.fled))
  };
}

function fixture({ floor, name, kind, rare = false, targetSize = 1 }) {
  const { generated, runSeed } = generate(floor, name, { rare, targetSize });
  const productionIdentity = generated.monsters.map(monster => ({
    name: monster.name, template: identityTemplate(monster.name).name,
    exp: monster.exp, isRare: monster.isRare === true,
    traits: monster.traits || [], fleeChance: monster.fleeChance || 0
  }));
  const candidate = runArm({ floor, runSeed, generated: generated.monsters, candidate: true, kind, weak: kind === "flee" });
  const production = runArm({ floor, runSeed, generated: generated.monsters, candidate: false, kind, weak: kind === "flee" });
  return { floor, kind, controlled: true, runSeed, generatedRare: generated.isRare, productionIdentity, candidate, production };
}

export function runLifecycleSettlementFixtures() {
  const flee = fixture({ floor: 15, name: "メタルパピー", kind: "flee", rare: true });
  const split = fixture({ floor: 1, name: "分裂スライム", kind: "split" });
  const summon = fixture({ floor: 20, name: "召喚する悪魔", kind: "summon", targetSize: 2 });
  const multiBudgetAccounting = (() => {
    const monsters = [{ name: "A", exp: 0, fled: false }, { name: "B", exp: 0, fled: true }];
    const lifecycle = createCandidateExpLifecycle(monsters, [8, 28]);
    return { budgets: [...lifecycle.allocations], settled: reconcileCandidateExpLifecycle(monsters, lifecycle) };
  })();
  return {
    evidence: "controlled-production-context-N=1",
    naturalRunEvidence: false,
    bandFloors: [...new Set([flee.floor, split.floor, summon.floor].filter(floor => [1, 20].includes(floor)))],
    multiBudgetAccounting,
    fixtures: [flee, split, summon],
    coverageGaps: ["natural-encounter-distribution", "full-run-candidate-integration", "non-victory-settlement"]
  };
}
