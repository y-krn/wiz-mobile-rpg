import assert from "node:assert/strict";

const { state, createDefaultCurrentRun } = await import("../../../src/state.js");
const { MONSTERS, getEncounterPoolForFloor, getEncounterSizeWeightsForFloor } = await import("../../../src/data.js");
const { generateEncounter } = await import("../../../src/combat_ui/encounter.js");
const { isEncounterCompositionAllowed } = await import("../../../src/rules/encounter_rules.js");
const { runCombatRoundCalculation } = await import("../../../src/combat_logic/round.js");
const { allocateCandidateAward, calculateCandidateAward } = await import("../../../scratch/measurements/progression_exp_award_paired_inventory.js");

const templateSamples = [{ templateExp: 1 }, { templateExp: 1 }, { templateExp: 1 }];
const templateSamplesBefore = structuredClone(templateSamples);
assert.deepEqual(allocateCandidateAward(5, templateSamples), [2, 2, 1],
  "equal fractional remainders award extra EXP by initial encounter index");
assert.deepEqual(allocateCandidateAward(5, templateSamples), [2, 2, 1],
  "equal-remainder allocation is deterministic");
assert.deepEqual(allocateCandidateAward(7, [{ templateExp: 1 }, { templateExp: 3 }]), [2, 5],
  "size two allocation follows distinct template EXP proportions");
assert.deepEqual(allocateCandidateAward(8, [{ templateExp: 1 }, { templateExp: 2 }, { templateExp: 3 }]), [1, 3, 4],
  "size three allocation follows distinct template EXP proportions");
assert.deepEqual(templateSamples, templateSamplesBefore, "allocation leaves its template EXP inputs unchanged");
for (const [totalAward, monsters] of [
  [5, templateSamples],
  [7, [{ templateExp: 1 }, { templateExp: 3 }]],
  [8, [{ templateExp: 1 }, { templateExp: 2 }, { templateExp: 3 }]]
]) {
  assert.equal(allocateCandidateAward(totalAward, monsters).reduce((sum, value) => sum + value, 0), totalAward);
}

const ordinaryTemplate = template => !template.treasureRare && !template.isBoss && !template.isMidboss &&
  !template.split && !template.hasSplit && !template.summons && !Number.isFinite(template.fleeChance) &&
  !template.traits?.some(trait => /split|summon/i.test(String(trait)));

function makeEncounterRng(floor, runSeed) {
  const targetSize = 2;
  const sizeWeights = getEncounterSizeWeightsForFloor(floor, { runSeed });
  const sizeRoll = sizeWeights.slice(0, targetSize - 1).reduce((sum, value) => sum + value, 0) +
    sizeWeights[targetSize - 1] / 2;
  const pool = getEncounterPoolForFloor(floor, { runSeed })
    .map(name => MONSTERS.find(template => template.name === name))
    .filter(Boolean);
  const selected = [];
  let call = 0;
  return () => {
    if (call++ === 0) return 0.99; // production ordinary, non-Rare branch
    if (call === 2) return sizeRoll; // initial encounter size two
    const candidates = pool.filter(template => isEncounterCompositionAllowed([...selected, template], targetSize));
    const chosen = candidates.find(ordinaryTemplate);
    assert.ok(chosen, `production pool has an ordinary size-${targetSize} continuation at B${floor}`);
    selected.push(chosen);
    return (candidates.indexOf(chosen) + 0.5) / candidates.length;
  };
}

function initialize(floor, runSeed) {
  const character = {
    name: `B${floor} E4 settlement`, characterClass: "Fighter", status: "ok",
    level: 1, exp: 0, hp: 900, maxHp: 1000, mp: 0, maxMp: 0,
    str: 100000, int: 10, pie: 10, vit: 10, agi: 100000, luk: 100,
    equipment: { weapon: "LEGENDARY_SWORD" }, spells: [],
    buffs: [{ type: "firstStrike", value: 100000, turns: 99 }]
  };
  state.floor = floor;
  state.party = [character];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.startFloor = floor;
  state.currentRun.runSeed = runSeed;
  state.currentRun.expGained = 0;
  state.firstKills = [];
  state.inventory = [];
  state.combatState = { monsters: [], phase: "choose_actions", roundNumber: 1, isBoss: false, isMidboss: false, isRoamingFlack: false };
  state.logs = [];
  return character;
}

function runFixture(floor, candidateArm) {
  const runSeed = `phase4j-e4-controlled-b${floor}`;
  const character = initialize(floor, runSeed);
  const encounter = generateEncounter(state, false, false, false, null, makeEncounterRng(floor, runSeed));
  assert.equal(encounter.isRare, false);
  assert.ok([2, 3].includes(encounter.monsters.length));
  const enemies = encounter.monsters;
  const initialSnapshot = enemies.map(enemy => structuredClone(enemy));
  const enemyFieldsWithoutExp = initialSnapshot.map(enemy => {
    const snapshot = structuredClone(enemy);
    delete snapshot.exp;
    return snapshot;
  });
  const templates = enemies.map(enemy => {
    const name = enemy.name.replace(/\s[A-Z]$/, "");
    const template = MONSTERS.find(entry => entry.name === name);
    assert.ok(template, `generated identity resolves to a template: ${name}`);
    assert.ok(ordinaryTemplate(template));
    assert.equal(enemy.isRare, undefined);
    assert.equal(enemy.isSummoned, undefined);
    assert.equal(Number.isFinite(enemy.fleeChance), false);
    return { name, template, templateExp: template.exp, templateSnapshot: structuredClone(template) };
  });
  const candidate = calculateCandidateAward({
    floor, kind: "ordinary", monsters: templates.map(({ templateExp }) => ({ templateExp })), encounterSize: enemies.length
  });
  const allocation = allocateCandidateAward(candidate.totalAward, templates.map(({ templateExp }) => ({ templateExp })));
  if (candidateArm) enemies.forEach((enemy, index) => { enemy.exp = allocation[index]; });
  enemies.forEach((enemy, index) => {
    assert.deepEqual({ ...enemy, exp: initialSnapshot[index].exp }, initialSnapshot[index],
      "candidate arm changes only each generated diagnostic enemy instance EXP");
    assert.deepEqual(templates[index].template, templates[index].templateSnapshot,
      "candidate allocation never mutates shared production templates");
  });
  assert.equal(allocation.reduce((sum, value) => sum + value, 0), candidate.totalAward);

  state.combatState = { ...state.combatState, monsters: enemies, initialLivingMonsterCount: enemies.length };
  const expBefore = character.exp;
  const maxHpBefore = character.maxHp;
  const hpBefore = character.hp;
  let combatState = state;
  let finalRound;
  let rounds = 0;
  while (combatState.combatState.monsters.some(enemy => enemy.hp > 0) && rounds < 10) {
    const targetIdx = combatState.combatState.monsters.findIndex(enemy => enemy.hp > 0);
    finalRound = runCombatRoundCalculation(combatState, {
      actions: [{ actorIdx: 0, type: "fight", targetIdx }]
    }, { rng: () => 0 });
    combatState = finalRound.state;
    rounds++;
  }
  assert.ok(rounds > 0 && rounds < 10, `generated encounter resolves through production combat rounds at B${floor}`);
  assert.ok(finalRound.logQueue.some(entry => entry.msg?.includes("戦闘に勝利した")));
  const settlementExp = candidateArm
    ? candidate.totalAward
    : initialSnapshot.reduce((sum, enemy) => sum + enemy.exp, 0);
  assert.equal(combatState.currentRun.expGained, settlementExp,
    "production combat ledger equals candidate total or original instance EXP sum");
  assert.equal(combatState.party[0].exp - expBefore, settlementExp,
    "production reward settlement grants the expected combat EXP");
  assert.equal(combatState.combatState.monsters.length, enemies.length,
    "no split or summon changes the initial encounter size during settlement");
  const levelUpLog = finalRound.logQueue.find(entry => Number.isFinite(entry.levelUpRecoveryHp));
  return {
    floor,
    arm: candidateArm ? "candidate" : "production-control",
    generatedNames: enemies.map(enemy => enemy.name),
    enemyFieldsWithoutExp,
    otherEnemyFieldsUnchanged: true,
    initialSize: enemies.length,
    templateExp: templates.map(({ templateExp }) => templateExp),
    productionInstanceExp: initialSnapshot.map(enemy => enemy.exp),
    candidateTotalAward: candidate.totalAward,
    candidateAllocation: allocation,
    settledExp: settlementExp,
    ledgerDelta: combatState.currentRun.expGained,
    characterExpDelta: combatState.party[0].exp - expBefore,
    rounds,
    levelBefore: 1,
    levelAfter: combatState.party[0].level,
    rawMaxHpBefore: maxHpBefore,
    rawMaxHpAfter: combatState.party[0].maxHp,
    hpBefore,
    hpAfter: combatState.party[0].hp,
    levelUpRecoveryHp: levelUpLog?.levelUpRecoveryHp ?? 0
  };
}

const evidence = [];
for (const floor of [1, 20]) {
  const candidate = runFixture(floor, true);
  const production = runFixture(floor, false);
  assert.deepEqual(candidate.generatedNames, production.generatedNames,
    `candidate and production control use the same production-generated identity at B${floor}`);
  assert.deepEqual(candidate.enemyFieldsWithoutExp, production.enemyFieldsWithoutExp,
    `candidate and production control preserve every other generated enemy field at B${floor}`);
  assert.equal(production.ledgerDelta, production.productionInstanceExp.reduce((sum, exp) => sum + exp, 0));
  assert.equal(candidate.ledgerDelta, candidate.candidateTotalAward);
  evidence.push(candidate, production);
}

console.log(JSON.stringify({ status: "diagnostic-only", fixtureN: 1, naturalRunEvidence: false, evidence }));
