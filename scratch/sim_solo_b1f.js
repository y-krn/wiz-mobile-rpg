// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import {
  SOLO_CLASSES,
  createDefaultCurrentRun,
  createSoloCharacter
} from "../src/state/initial_state.js";
import { generateEncounter } from "../src/combat_ui/encounter.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { checkCharLevelUp } from "../src/systems/leveling.js";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";

const RUNS_PER_CASE = Number(process.env.SIM_RUNS || 2000);
const SIM_SEED = Number(process.env.SIM_SEED || 173) >>> 0;
const MAX_COMBAT_TURNS = 50;
const MAIN_RANGE = { min: 40, max: 70, label: "40〜70歩（主分析）" };
const STEP_RANGES = [
  { min: 30, max: 50, label: "30〜50歩" },
  MAIN_RANGE,
  { min: 60, max: 90, label: "60〜90歩" }
];
const MILWA_CONDITIONS = [
  { useMilwa: false, label: "条件A: MILWAなし" },
  { useMilwa: true, label: "条件B: MILWAあり" }
];
const CLASS_LABELS = {
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師",
  Samurai: "侍",
  Bishop: "司教",
  Ranger: "野伏",
  Ninja: "忍者"
};
const HOLY_TAGS = new Set(["undead", "spirit", "demon"]);

let randomState = SIM_SEED;
Math.random = () => {
  randomState += 0x6D2B79F5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

function randomIntInclusive(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function createSimulationState(character) {
  return {
    party: [character],
    combatState: null,
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: createDefaultCurrentRun(),
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 1
  };
}

function isAlive(character) {
  return character.status !== "dead" && character.hp > 0;
}

function hasSpell(character, spellName) {
  return character.spells?.includes(spellName) === true;
}

function getLowestHpEnemyIndex(monsters, predicate = () => true) {
  let selectedIdx = -1;
  let selectedHp = Infinity;
  monsters.forEach((monster, idx) => {
    if (monster.hp > 0 && predicate(monster) && monster.hp < selectedHp) {
      selectedIdx = idx;
      selectedHp = monster.hp;
    }
  });
  return selectedIdx;
}

function hasHolyTag(monster) {
  return monster.tags?.some(tag => HOLY_TAGS.has(tag)) === true;
}

function selectCombatAction(state) {
  const character = state.party[0];
  const monsters = state.combatState.monsters;
  const lowestHpIdx = getLowestHpEnemyIndex(monsters);

  if (hasSpell(character, "DIOS") && character.hp < character.maxHp * 0.35 && character.mp >= 1) {
    return { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "DIOS" };
  }

  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  if (character.mp > reserveMp) {
    if (character.class === "Priest" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = monsters.findIndex(monster => monster.hp > 0 && hasHolyTag(monster));
      const firstLivingIdx = monsters.findIndex(monster => monster.hp > 0);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : firstLivingIdx,
        spellName: "BADIOS"
      };
    }

    if (character.class === "Bishop") {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      if (holyTargetIdx >= 0 && hasSpell(character, "BADIOS")) {
        return { type: "spell", actorIdx: 0, targetIdx: holyTargetIdx, spellName: "BADIOS" };
      }
      if (hasSpell(character, "HALITO")) {
        return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
      }
    }

    if ((character.class === "Mage" || character.class === "Samurai") && hasSpell(character, "HALITO")) {
      return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
    }

    if (character.class === "Ranger" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : lowestHpIdx,
        spellName: "BADIOS"
      };
    }
  }

  return { type: "fight", actorIdx: 0, targetIdx: lowestHpIdx };
}

function runEncounter(state) {
  const { monsters } = generateEncounter(state, false, false, false, null);
  state.combatState = {
    monsters,
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    allParalyzedTurns: 0,
    phase: "choose_actions",
    roundNumber: 1
  };

  let mpDepleted = false;
  for (let turn = 0; turn < MAX_COMBAT_TURNS; turn++) {
    const character = state.party[0];
    if (!isAlive(character)) return { result: "death", mpDepleted };
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", mpDepleted };
    }

    const mpBefore = character.mp || 0;
    const roundResult = runCombatRoundCalculation(state, {
      actions: [selectCombatAction(state)]
    });
    state = roundResult.state;
    const mpAfter = state.party[0].mp || 0;
    if (mpBefore > 0 && mpAfter === 0) mpDepleted = true;

    if (!isAlive(state.party[0])) return { result: "death", mpDepleted, state };
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", mpDepleted, state };
    }
  }

  return { result: "stalemate", mpDepleted, state };
}

function applyPostCombatRecovery(character) {
  while (hasSpell(character, "DIOS") && character.mp > 0 && character.hp < character.maxHp * 0.70) {
    character.mp -= 1;
    SPELL_EFFECTS.DIOS({ caster: character, target: character });
  }
}

function maintainMilwa(state, enabled) {
  const character = state.party[0];
  if (!enabled || state.lightTurns > 0 || !hasSpell(character, "MILWA") || character.mp < 2) return;
  character.mp -= 1;
  state.lightTurns = 30;
}

function getEncounterChance(step, lightTurns) {
  const baseRate = step <= 30 ? 0.10 : 0.04;
  return Math.max(0, baseRate - (lightTurns > 0 ? 0.03 : 0));
}

function simulateRun(className, stepRange, useMilwa) {
  let state = createSimulationState(createSoloCharacter(className));
  const stepsToStairs = randomIntInclusive(stepRange.min, stepRange.max);
  let victories = 0;
  let mpDepleted = false;

  for (let step = 1; step <= stepsToStairs; step++) {
    maintainMilwa(state, useMilwa);
    const encounterChance = getEncounterChance(step, state.lightTurns || 0);
    if (state.lightTurns > 0) state.lightTurns -= 1;

    if (Math.random() >= encounterChance) continue;

    const combatResult = runEncounter(state);
    state = combatResult.state || state;
    mpDepleted ||= combatResult.mpDepleted;

    if (combatResult.result === "death") {
      return { success: false, death: true, stalemate: false, steps: step, victories, level: state.party[0].level, mpDepleted };
    }
    if (combatResult.result === "stalemate") {
      return { success: false, death: false, stalemate: true, steps: step, victories, level: state.party[0].level, mpDepleted };
    }

    victories += 1;
    while (checkCharLevelUp(state.party[0])) {
      // applyCombatRewards already grants EXP and performs the first possible level-up.
    }
    applyPostCombatRecovery(state.party[0]);
    if (!isAlive(state.party[0])) {
      return { success: false, death: true, stalemate: false, steps: step, victories, level: state.party[0].level, mpDepleted };
    }
  }

  return {
    success: true,
    death: false,
    stalemate: false,
    steps: stepsToStairs,
    victories,
    level: state.party[0].level,
    mpDepleted
  };
}

function simulateCase(className, stepRange, useMilwa) {
  const totals = {
    successes: 0,
    victories: 0,
    levels: 0,
    deathSteps: 0,
    deaths: 0,
    mpDepleted: 0,
    stalemates: 0
  };

  for (let run = 0; run < RUNS_PER_CASE; run++) {
    const result = simulateRun(className, stepRange, useMilwa);
    totals.successes += Number(result.success);
    totals.victories += result.victories;
    totals.levels += result.level;
    totals.deathSteps += result.death ? result.steps : 0;
    totals.deaths += Number(result.death);
    totals.mpDepleted += Number(result.mpDepleted);
    totals.stalemates += Number(result.stalemate);
  }

  return {
    className,
    successRate: totals.successes / RUNS_PER_CASE * 100,
    averageVictories: totals.victories / RUNS_PER_CASE,
    averageLevel: totals.levels / RUNS_PER_CASE,
    averageDeathSteps: totals.deaths > 0 ? totals.deathSteps / totals.deaths : null,
    mpDepletionRate: totals.mpDepleted / RUNS_PER_CASE * 100,
    stalemateRate: totals.stalemates / RUNS_PER_CASE * 100
  };
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function printDetailedTable(results) {
  console.log("職業     | 突破率 | 平均戦闘回数(勝利数) | 平均到達Lv | 死亡ラン平均歩数 | MP枯渇経験率 | スタルメイト率");
  console.log("---------|--------|----------------------|------------|------------------|--------------|----------------");
  results.forEach(result => {
    const deathSteps = result.averageDeathSteps === null ? "-" : result.averageDeathSteps.toFixed(1);
    console.log(
      `${CLASS_LABELS[result.className].padEnd(8)} | ${formatPercent(result.successRate).padStart(6)} | ` +
      `${result.averageVictories.toFixed(2).padStart(20)} | ${result.averageLevel.toFixed(2).padStart(10)} | ` +
      `${deathSteps.padStart(16)} | ${formatPercent(result.mpDepletionRate).padStart(12)} | ` +
      `${formatPercent(result.stalemateRate).padStart(14)}`
    );
  });
}

function printCompactTable(resultsByCondition) {
  console.log("条件               | " + SOLO_CLASSES.map(className => CLASS_LABELS[className].padStart(6)).join(" | "));
  console.log("-------------------|" + SOLO_CLASSES.map(() => "--------").join("|") );
  resultsByCondition.forEach(({ condition, results }) => {
    console.log(`${condition.label.padEnd(18)} | ${results.map(result => formatPercent(result.successRate).padStart(6)).join(" | ")}`);
  });
}

function printSummary(condition, results) {
  const sorted = [...results].sort((a, b) => b.successRate - a.successRate);
  const highest = sorted[0];
  const lowest = sorted.at(-1);
  const gap = highest.successRate - lowest.successRate;
  console.log(
    `${condition.label}: 最高 ${CLASS_LABELS[highest.className]} ${formatPercent(highest.successRate)} / ` +
    `最低 ${CLASS_LABELS[lowest.className]} ${formatPercent(lowest.successRate)} / 差 ${gap.toFixed(1)}pt`
  );
}

console.log("全8職 ソロB1F突破率シミュレーション");
console.log(`試行数: 各 職業×条件×歩数レンジ N=${RUNS_PER_CASE}`);
console.log(`乱数seed: ${SIM_SEED}`);
console.log("突破定義: 規定歩数を生存して歩き切る（ボス戦なし）");

const allResults = new Map();
for (const stepRange of STEP_RANGES) {
  const resultsByCondition = MILWA_CONDITIONS.map(condition => ({
    condition,
    results: SOLO_CLASSES.map(className => simulateCase(className, stepRange, condition.useMilwa))
  }));
  allResults.set(stepRange.label, resultsByCondition);

  console.log(`\n【歩数レンジ ${stepRange.label}】`);
  if (stepRange === MAIN_RANGE) {
    resultsByCondition.forEach(({ condition, results }) => {
      console.log(`\n${condition.label}`);
      printDetailedTable(results);
    });
  } else {
    printCompactTable(resultsByCondition);
  }
}

console.log("\n【サマリ: 40〜70歩】");
allResults.get(MAIN_RANGE.label).forEach(({ condition, results }) => printSummary(condition, results));
