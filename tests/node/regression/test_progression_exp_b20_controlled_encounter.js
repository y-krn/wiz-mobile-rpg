import assert from "node:assert/strict";

const makeElement = () => {
  const listeners = {};
  return {
    style: {},
    appendChild() {},
    replaceChildren() {},
    addEventListener(event, callback) { listeners[event] = callback; },
    trigger(event, ...args) { listeners[event]?.(...args); },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {},
    getAttribute() { return ""; }
  };
};

global.document = {
  getElementById: () => makeElement(),
  createElement: () => makeElement(),
  querySelector: () => makeElement()
};
global.window = {};
global.localStorage = { getItem: () => "false", setItem() {} };

const { state, createDefaultCurrentRun } = await import("../../../src/state.js");
const { BIOMES, MONSTERS, getEncounterPoolForFloor } = await import("../../../src/data.js");
const { generateEncounter } = await import("../../../src/combat_ui/encounter.js");
const { isEncounterCompositionAllowed } = await import("../../../src/rules/encounter_rules.js");
const { getBandTrialForFloor } = await import("../../../src/rules/floor_trials.js");
const { runCombatRoundCalculation } = await import("../../../src/combat_logic/round.js");
const { calculateCandidateAward } = await import("../../../scratch/measurements/progression_exp_award_paired_inventory.js");

const floor = 20;
const runSeed = "phase4j-e3-b20-controlled-encounter";
const character = {
  name: "B20接続検証",
  characterClass: "Fighter",
  status: "ok",
  level: 1,
  exp: 980,
  hp: 900,
  maxHp: 1000,
  mp: 0,
  maxMp: 0,
  str: 100000,
  int: 10,
  pie: 10,
  vit: 10,
  agi: 100000,
  luk: 100,
  equipment: { weapon: "LEGENDARY_SWORD" },
  spells: [],
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
state.combatState = {
  monsters: [],
  phase: "choose_actions",
  roundNumber: 1,
  isBoss: false,
  isMidboss: false,
  isRoamingFlack: false
};
state.maps[floor - 1] = [[{ event: null }]];
state.x = 0;
state.y = 0;
state.logs = [];

const trial = getBandTrialForFloor(runSeed, floor, state.currentRun.trialBands?.[3] || null);
const floorPool = getEncounterPoolForFloor(floor, { trial });
const poolTemplates = floorPool
  .map(name => MONSTERS.find(monster => monster.name === name))
  .filter(Boolean);
const selectableSinglePool = poolTemplates.filter(template =>
  isEncounterCompositionAllowed([template], 1) &&
  !template.treasureRare &&
  !template.split &&
  !template.spell &&
  !template.statusAttackPattern &&
  !template.isParalyzing &&
  !template.isPoisonous &&
  !template.isBlinding &&
  !template.isSleepInflicting &&
  !template.traits?.some(trait => /split|summon/i.test(String(trait)))
);
assert.ok(selectableSinglePool.length > 0, "B20 production pool has an eligible solo ordinary template");
const selectedTemplate = selectableSinglePool[0];
const selectedIndex = poolTemplates.findIndex(template => template.name === selectedTemplate.name);
const generationRolls = [0.99, 0, (selectedIndex + 0.5) / poolTemplates.length];
let generationRollIndex = 0;
const generated = generateEncounter(
  state,
  false,
  false,
  false,
  null,
  () => generationRolls[generationRollIndex++] ?? 0
);
assert.equal(generated.isRare, false, "controlled production generation selects the normal encounter branch");
assert.equal(generated.monsters.length, 1, "production generator creates one enemy");
const enemy = generated.monsters[0];
const templateName = enemy.name.replace(/\s[A-Z]$/, "");
const template = MONSTERS.find(monster => monster.name === templateName);
assert.ok(template);
assert.ok(floorPool.includes(templateName), "generated identity belongs to the B20 encounter pool");
assert.equal(enemy.isRare, undefined, "generated enemy is non-Rare");
assert.equal(template.treasureRare, undefined, "generated template is not a treasure Rare");
assert.ok(!template.split && !template.traits?.some(trait => /split|summon/i.test(String(trait))));

const templateBefore = structuredClone(template);
const enemyBefore = structuredClone(enemy);
const candidate = calculateCandidateAward({
  floor,
  kind: "ordinary",
  monsters: [{ templateExp: template.exp }],
  encounterSize: 1
});
enemy.exp = candidate.totalAward;
assert.deepEqual({ ...enemy, exp: enemyBefore.exp }, enemyBefore,
  "only the generated diagnostic enemy instance EXP changes");
assert.deepEqual(template, templateBefore, "production template remains unchanged");

state.combatState = {
  ...state.combatState,
  monsters: generated.monsters,
  initialLivingMonsterCount: 1
};
const characterExpBefore = character.exp;
const rawMaxHpBefore = character.maxHp;
const hpBefore = character.hp;
let combatState = state;
let roundCount = 0;
let finalRound;
while (combatState.combatState.monsters.some(monster => monster.hp > 0) && roundCount < 10) {
  finalRound = runCombatRoundCalculation(combatState, {
    actions: [{ actorIdx: 0, type: "fight", targetIdx: 0 }]
  }, { rng: () => 0 });
  combatState = finalRound.state;
  roundCount++;
}
assert.ok(roundCount > 0 && roundCount < 10,
  `controlled encounter resolves through actual combat rounds: ${JSON.stringify({ roundCount, enemyName: combatState.combatState.monsters[0]?.name, enemyHp: combatState.combatState.monsters[0]?.hp, char: combatState.party[0] })}`);
assert.ok(finalRound.logQueue.some(entry => entry.msg?.includes("戦闘に勝利した")),
  "production round reaches victory reward settlement");
const settledCharacter = combatState.party[0];
assert.equal(combatState.currentRun.expGained, candidate.totalAward,
  "production combat ledger receives the candidate award exactly once");
assert.equal(settledCharacter.exp - characterExpBefore, candidate.totalAward,
  "production reward settlement adds the combat candidate EXP");
assert.equal(settledCharacter.exp, 980 + candidate.totalAward);
assert.equal(settledCharacter.level, 2, "production reward settlement performs one Level check");
assert.equal(settledCharacter.maxHp, rawMaxHpBefore + 5, "production Level-up grows raw maxHP");
assert.ok(settledCharacter.hp > hpBefore, "production Level-up heals current HP");
const levelUpLogs = finalRound.logQueue.filter(entry => Number.isFinite(entry.levelUpRecoveryHp));
assert.equal(levelUpLogs.length, 1, "production performs one Level check and one Level-up");
const levelUpLog = levelUpLogs[0];
assert.equal(levelUpLog.levelUpRecoveryHp, 10, "natural HP growth and extra recovery use production values");
assert.equal(settledCharacter.hp, hpBefore + levelUpLog.levelUpRecoveryHp);
assert.equal(settledCharacter.exp - 980, combatState.currentRun.expGained,
  "combat candidate accounts for the character EXP total");

console.log(JSON.stringify({
  status: "controlled-production-fixture-only",
  naturalRunEvidence: false,
  pairedFullRunEvidence: false,
  floor,
  generatedPool: BIOMES[Math.floor((floor - 1) / 5)].enemyPool.includes(templateName),
  generatedEnemy: templateName,
  encounterSize: generated.monsters.length,
  rare: generated.isRare,
  candidateExp: candidate.totalAward,
  combatLedger: combatState.currentRun.expGained,
  characterExp: settledCharacter.exp,
  level: settledCharacter.level,
  rawMaxHp: settledCharacter.maxHp,
  hp: settledCharacter.hp,
  levelUpRecoveryHp: levelUpLog.levelUpRecoveryHp
}));
