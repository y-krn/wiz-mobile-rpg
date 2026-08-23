// sim-scope: run — measures solo B1F outcomes across classes and conditions with the simulation runner; retained because origin is unknown and no closed-Issue owner was found.
/* global console, process */

import "./simulation_preflight.js";
import { pathToFileURL } from "node:url";

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { SOLO_CLASSES } = await import("../src/state/initial_state.js");

const RUNS_PER_CASE = Math.max(1, Number(process.env.SIM_RUNS || 800));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.B1_CALIBRATION_RUNS || Math.min(200, RUNS_PER_CASE))
);
const SIM_SEED = Number(process.env.SIM_SEED || 173) >>> 0;
const CRAFT_RECIPE_IDS = [
  "TOWN_PORTAL",
  "HEAL_POTION",
  "ANTIDOTE",
  "TRAP_KIT",
  "IDENTIFY_POWDER"
];
const B1_CLASSES = SOLO_CLASSES;
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

const CONDITIONS = [
  {
    id: "legacy-free-items",
    label: "ゼロ化前（傷薬4+解毒薬1）",
    startingHealPotions: 4,
    startingAntidotes: 1,
    departureCraft: []
  },
  {
    id: "zero-no-craft",
    label: "ゼロ化後（クラフトなし）",
    startingHealPotions: 0,
    startingAntidotes: 0,
    departureCraft: []
  },
  {
    id: "zero-departure-craft",
    label: "ゼロ化後（クラフト全支給what-if）",
    startingHealPotions: 0,
    startingAntidotes: 0,
    departureCraft: CRAFT_RECIPE_IDS
  }
];

function createScenario(condition) {
  return {
    id: `b1-${condition.id}`,
    label: condition.label,
    useTownPortal: false,
    allowChestTownPortal: false,
    ignoreWorkshopReturnItems: true,
    startingHealPotions: condition.startingHealPotions,
    startingAntidotes: condition.startingAntidotes,
    departureCraft: condition.departureCraft
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function runCondition(condition, scoringProfile) {
  const scenario = createScenario(condition);
  resetSimulationRandom(SIM_SEED);
  const totals = Object.fromEntries(B1_CLASSES.map(className => [className, {
    runs: 0,
    survived: 0,
    died: 0,
    stalemates: 0,
    reachedFloor: 0,
    healPotionsAcquired: 0,
    healPotionsConsumed: 0,
    trapKitsAcquired: 0,
    trapKitsConsumed: 0,
    portalsAcquired: 0,
    portalsConsumed: 0,
    powderAcquired: 0,
    powderConsumed: 0
  }]));

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    const className = B1_CLASSES[runIndex % B1_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: 2,
      runIndex,
      seriesId: `b1-${condition.id}`,
      scoringProfile,
      scenario
    });
    const classTotals = totals[className];
    classTotals.runs++;
    classTotals.survived += Number(result.survived);
    classTotals.died += Number(result.died);
    classTotals.stalemates += Number(result.stalemate);
    classTotals.reachedFloor += result.reachedFloor;
    classTotals.healPotionsAcquired += Object.values(result.healPotionsAcquiredBySource)
      .reduce((sum, amount) => sum + amount, 0);
    classTotals.healPotionsConsumed += Object.values(result.healPotionsConsumedBySource)
      .reduce((sum, amount) => sum + amount, 0);
    classTotals.trapKitsAcquired += result.trapKitsAcquired;
    classTotals.trapKitsConsumed += result.trapKitsUsed;
    classTotals.portalsAcquired += Object.values(result.portalAcquisitions)
      .reduce((sum, amount) => sum + amount, 0);
    classTotals.portalsConsumed += result.townPortalsUsed;
    classTotals.powderAcquired += result.identificationPowderAcquired;
    classTotals.powderConsumed += result.identificationPowderUsed;
  }
  return { condition, totals };
}

function printConditionTable(result) {
  console.log(`\n【${result.condition.label}】`);
  console.log(
    "職業 | B1F突破率 | 生還/死亡/膠着 | 平均到達階 | 傷薬入手/消費 | 罠kit入手/消費 | 翼入手/消費 | 粉入手/消費"
  );
  console.log(
    "-----|----------|----------------|------------|--------------|----------------|------------|------------"
  );
  B1_CLASSES.forEach(className => {
    const values = result.totals[className];
    const runs = Math.max(1, values.runs);
    const survivedRate = values.survived / runs;
    console.log(
      `${CLASS_LABELS[className].padEnd(4)} | ${formatPercent(survivedRate).padStart(8)} | ` +
      `${formatPercent(survivedRate)}/${formatPercent(values.died / runs)}/` +
      `${formatPercent(values.stalemates / runs)} | ` +
      `B${(values.reachedFloor / runs).toFixed(2).padStart(5)} | ` +
      `${(values.healPotionsAcquired / runs).toFixed(2)}/` +
      `${(values.healPotionsConsumed / runs).toFixed(2)} | ` +
      `${(values.trapKitsAcquired / runs).toFixed(2)}/` +
      `${(values.trapKitsConsumed / runs).toFixed(2)} | ` +
      `${(values.portalsAcquired / runs).toFixed(2)}/` +
      `${(values.portalsConsumed / runs).toFixed(2)} | ` +
      `${(values.powderAcquired / runs).toFixed(2)}/` +
      `${(values.powderConsumed / runs).toFixed(2)}`
    );
  });
}

async function main() {
  console.log("全8職 ソロB1F突破率（実ラン生成）");
  console.log(
    `試行数: 条件×職業 round-robin N=${RUNS_PER_CASE}, seed=${SIM_SEED}, ` +
    `calibration N=${CALIBRATION_RUNS}`
  );
  console.log(
    "B1F突破定義: generateRunFloorで生成したB1FをsimulateRun(targetDepth=2)で踏破し、" +
    "死亡せずB2F入口へ到達。#215の司教/忍者を含む。"
  );
  console.log(
    `出発クラフト: ${CRAFT_RECIPE_IDS.join(",")} / 個数上限=素材残高`
  );
  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
  CONDITIONS.map(condition => runCondition(condition, scoringProfile))
    .forEach(printConditionTable);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
