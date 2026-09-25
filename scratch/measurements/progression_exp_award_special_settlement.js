// Diagnostic-only controlled special encounter fixtures for Phase 4j-E5.

import { generateEncounter } from "../../src/combat_ui/encounter.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { runCombatRoundCalculation } from "../../src/combat_logic.js";
import { createDefaultCurrentRun, createStartingKitCharacter } from "../../src/state/initial_state.js";
import { calculateCandidateAward, classifyAwardKind } from "./progression_exp_award_paired_inventory.js";

const FIXTURE_CONTEXTS = Object.freeze([
  { kind: "rare", floor: 15, isBoss: false, isMidboss: false, isRoamingFlack: false },
  { kind: "elite", floor: 1, isBoss: false, isMidboss: false, isRoamingFlack: true },
  { kind: "midboss", floor: 5, isBoss: false, isMidboss: true, isRoamingFlack: false },
  { kind: "boss", floor: 20, isBoss: true, isMidboss: false, isRoamingFlack: false }
]);

function makeGeneratedFixture(context) {
  const runSeed = `phase4j-e5-controlled-B${context.floor}-${context.kind}`;
  const state = {
    floor: context.floor,
    currentRun: { runSeed, trialBands: {} }
  };
  const roamingMonster = null;
  const rng = context.kind === "rare" ? () => 0 : () => 0.5;
  const generated = generateEncounter(
    state,
    context.isBoss,
    context.isMidboss,
    context.isRoamingFlack,
    roamingMonster,
    rng
  );
  if (generated.monsters.length !== 1) throw new Error(`${context.kind} fixture is not initial size one`);
  const monster = generated.monsters[0];
  const templateName = monster.name.replace(/\s[A-Z]$/, "");
  const template = MONSTERS.find(entry => entry.name === templateName);
  if (!template || !Number.isFinite(monster.exp)) throw new Error(`${context.kind} fixture has unresolved identity or EXP`);
  const kind = classifyAwardKind({
    boss: context.isBoss,
    elite: context.isRoamingFlack,
    midboss: context.isMidboss,
    rare: generated.isRare || monster.isRare === true
  });
  if (kind !== context.kind) throw new Error(`production context classified ${context.kind} fixture as ${kind}`);
  const candidate = calculateCandidateAward({ floor: context.floor, kind });
  const originalMonster = structuredClone(monster);
  const candidateMonster = structuredClone(monster);
  candidateMonster.exp = candidate.totalAward;
  const nonExpFieldsUnchanged = Object.keys(originalMonster).every(key =>
    key === "exp" || JSON.stringify(originalMonster[key]) === JSON.stringify(candidateMonster[key])
  ) && Object.keys(originalMonster).length === Object.keys(candidateMonster).length;
  if (!nonExpFieldsUnchanged) throw new Error(`${context.kind} candidate mutated fields outside instance EXP`);

  return {
    controlled: true,
    context: {
      floor: context.floor,
      isBoss: context.isBoss,
      isMidboss: context.isMidboss,
      isRoamingFlack: context.isRoamingFlack,
      isRare: generated.isRare
    },
    kind,
    identity: {
      name: monster.name,
      templateName,
      templateFlags: {
        isBoss: Boolean(template.isBoss),
        isMidboss: Boolean(template.isMidboss),
        isRare: Boolean(template.treasureRare || monster.isRare)
      },
      roamingMonsterId: roamingMonster?.id ?? null,
      runSeed
    },
    productionExp: originalMonster.exp,
    candidateTotal: candidate.totalAward,
    nonExpFieldsUnchanged,
    rareFleeChance: monster.fleeChance ?? 0,
    candidateMonster,
    productionMonster: originalMonster
  };
}

function createCombatState(fixture, monster) {
  const character = createStartingKitCharacter("vanguard");
  character.name = "E5 controlled combatant";
  character.str = 10000;
  character.agi = 10000;
  character.vit = 10000;
  character.hp = 1_000_000;
  character.maxHp = 1_000_000;
  character.exp = 0;
  character.level = 1;
  character.equipment.weapon = {
    baseId: "SHORT_SWORD",
    identified: true,
    affixes: [{ type: "atk", value: 1_000_000 }]
  };
  const currentRun = {
    ...createDefaultCurrentRun(),
    runSeed: fixture.identity.runSeed,
    expGained: 0
  };
  return {
    floor: fixture.context.floor,
    party: [character],
    currentRun,
    combatState: {
      monsters: [structuredClone(monster)],
      isBoss: fixture.context.isBoss,
      isMidboss: fixture.context.isMidboss,
      isRoamingFlack: fixture.context.isRoamingFlack,
      phase: "choose_actions",
      roundNumber: 1,
      enemyActionScheduling: "independent"
    },
    inventory: [],
    firstKills: [],
    roamingMonsters: [],
    floorChestsTotal: [],
    codex: null
  };
}

function settleFixture(fixture, mode, monster) {
  let state = createCombatState(fixture, monster);
  const initial = {
    characterExp: state.party[0].exp,
    level: state.party[0].level,
    maxHp: state.party[0].maxHp,
    hp: state.party[0].hp,
    combatLedger: state.currentRun.expGained,
    bossesKilled: state.currentRun.bossesKilled,
    elitesKilled: state.currentRun.elitesKilled
  };
  let rounds = 0;
  while (rounds < 20 && state.combatState.monsters.some(enemy => enemy.hp > 0)) {
    const result = runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    }, { rng: () => 0.999999 });
    state = result.state;
    rounds++;
  }
  const enemy = state.combatState.monsters[0];
  const ledgerDelta = state.currentRun.expGained - initial.combatLedger;
  const victory = enemy.hp <= 0 && enemy.fled !== true && ledgerDelta > 0;
  const characterExpDelta = state.party[0].exp - initial.characterExp;
  const row = {
    mode,
    rounds,
    victory,
    enemyHpAfter: enemy.hp,
    enemyFled: Boolean(enemy.fled),
    combatLedgerDelta: ledgerDelta,
    characterExpDelta,
    levelBefore: initial.level,
    levelAfter: state.party[0].level,
    maxHpBefore: initial.maxHp,
    maxHpAfter: state.party[0].maxHp,
    hpBefore: initial.hp,
    hpAfter: state.party[0].hp,
    bossesKilled: state.currentRun.bossesKilled - initial.bossesKilled,
    elitesKilled: state.currentRun.elitesKilled - initial.elitesKilled,
    kills: state.currentRun.kills
  };
  return row;
}

export function runSpecialExpSettlementFixtures() {
  const fixtures = FIXTURE_CONTEXTS.map(context => {
    const fixture = makeGeneratedFixture(context);
    const candidate = settleFixture(fixture, "candidate", fixture.candidateMonster);
    const production = settleFixture(fixture, "production", fixture.productionMonster);
    const expectedCounter = fixture.kind === "boss" ? "bossesKilled" : "elitesKilled";
    const expectedCandidate = fixture.candidateTotal;
    const coverageGaps = [];
    for (const arm of [candidate, production]) {
      if (!arm.victory) coverageGaps.push(`${fixture.kind}-${arm.mode}-non-victory`);
      if (arm.enemyFled) coverageGaps.push(`${fixture.kind}-${arm.mode}-actual-flee`);
      if (arm.kills !== 1) coverageGaps.push(`${fixture.kind}-${arm.mode}-kill-count`);
      if (arm.characterExpDelta !== arm.combatLedgerDelta) coverageGaps.push(`${fixture.kind}-${arm.mode}-character-exp-ledger-drift`);
    }
    if (candidate.victory && candidate.combatLedgerDelta !== expectedCandidate) {
      coverageGaps.push(`${fixture.kind}-candidate-settlement-total-drift`);
    }
    if (production.victory && production.combatLedgerDelta !== fixture.productionExp) {
      coverageGaps.push(`${fixture.kind}-production-settlement-total-drift`);
    }
    if (candidate[expectedCounter] !== 1 || production[expectedCounter] !== 1) {
      coverageGaps.push(`${fixture.kind}-production-counter-mismatch`);
    }
    return {
      controlled: fixture.controlled,
      context: fixture.context,
      kind: fixture.kind,
      identity: fixture.identity,
      productionExp: fixture.productionExp,
      candidateTotal: fixture.candidateTotal,
      rareFleeChance: fixture.rareFleeChance,
      nonExpFieldsUnchanged: fixture.nonExpFieldsUnchanged,
      candidate,
      production,
      counter: expectedCounter,
      coverageGaps
    };
  });
  return {
    evidence: "controlled-production-context-N=1",
    bandFloors: [...new Set(fixtures.map(fixture => fixture.context.floor))].filter(floor => [1, 20].includes(floor)),
    fixtures,
    coverageGaps: fixtures.flatMap(fixture => fixture.coverageGaps),
    uncoveredLifecyclePaths: [
      "actual-flee-reward-ownership",
      "split-descendant-reward-ownership",
      "summon-descendant-reward-ownership",
      "monster-count-change-reward-ownership",
      "non-victory-reward-ownership"
    ]
  };
}
