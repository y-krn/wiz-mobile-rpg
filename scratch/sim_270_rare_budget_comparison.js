/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const {
  SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getSimulationRandomState,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const {
  AFFIX_BALANCE,
  CORE_AFFIXES
} = await import("../src/data/affixes.js");

const RUNS = Math.max(1, Number(process.env.RARE_BUDGET_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.RARE_BUDGET_CALIBRATION_RUNS || RUNS)
);
const SEED = Number(process.env.RARE_BUDGET_SEED || 231) >>> 0;
const TARGET_DEPTH = 20;
const EARLY_MAX_FLOOR = 10;
const scratchDir = path.dirname(fileURLToPath(import.meta.url));
const rawOutputPath = path.join(
  scratchDir,
  "results",
  "issue-270-rare-budget-comparison.raw.txt"
);
const jsonlOutputPath = path.join(
  scratchDir,
  "results",
  "issue-270-rare-budget-comparison.jsonl"
);

const baselineBalance = structuredClone({
  rareBudgets: AFFIX_BALANCE.budgetsByRarityAndFloor.rare,
  rareCoreChance: AFFIX_BALANCE.rollComposition.rare.coreChance
});

const RARITY_MAX = Object.freeze({
  epicStart: 0.20,
  epicAtB10: 0.155,
  rareStart: 0.45,
  rareAtB10: 0.45
});

const BUDGETS = Object.freeze({
  a: [0, 10, 10, 10, 10, 10],
  b: [0, 10, 10, 11, 12, 13],
  c: [0, 8, 9, 10, 11, 12]
});

const CONDITIONS = Object.freeze([
  {
    id: "baseline",
    label: "現状",
    note: "overrideなし"
  },
  {
    id: "rare-core-075",
    label: "coreChance 0.75単独",
    rareCoreChance: 0.75,
    note: "rare予算は現状"
  },
  {
    id: "rare-core-100",
    label: "coreChance 1.00単独",
    rareCoreChance: 1,
    note: "rare予算は現状"
  },
  {
    id: "budget-a",
    label: "rare予算A",
    rareBudgets: BUDGETS.a,
    note: "rare=[0,10,10,10,10,10]"
  },
  {
    id: "budget-b",
    label: "rare予算B",
    rareBudgets: BUDGETS.b,
    note: "rare=[0,10,10,11,12,13]"
  },
  {
    id: "budget-c",
    label: "rare予算C",
    rareBudgets: BUDGETS.c,
    note: "rare=[0,8,9,10,11,12]"
  },
  ...["a", "b", "c"].flatMap(key => ([
    {
      id: `budget-${key}-core-075`,
      label: `rare予算${key.toUpperCase()} + coreChance 0.75`,
      rareBudgets: BUDGETS[key],
      rareCoreChance: 0.75,
      note: `rare=${JSON.stringify(BUDGETS[key])}, coreChance=0.75`
    },
    {
      id: `budget-${key}-core-100`,
      label: `rare予算${key.toUpperCase()} + coreChance 1.00`,
      rareBudgets: BUDGETS[key],
      rareCoreChance: 1,
      note: `rare=${JSON.stringify(BUDGETS[key])}, coreChance=1.00`
    }
  ])),
  {
    id: "rarity-max",
    label: "rarity前傾・上限",
    earlyRarity: RARITY_MAX,
    note: "B1 epic/rare=20%/45%、B10=15.5%/45%、B11以降現状"
  },
  ...["a", "b", "c"].map(key => ({
    id: `budget-${key}-rarity-max`,
    label: `rare予算${key.toUpperCase()} + rarity前傾`,
    rareBudgets: BUDGETS[key],
    earlyRarity: RARITY_MAX,
    note: `rare=${JSON.stringify(BUDGETS[key])} + rarity前傾・上限`
  }))
]);

const CONDITION_FILTER = new Set(
  String(process.env.RARE_BUDGET_CONDITIONS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const ACTIVE_CONDITIONS = CONDITION_FILTER.size === 0
  ? CONDITIONS
  : CONDITIONS.filter(condition => CONDITION_FILTER.has(condition.id));

function emit(...parts) {
  const line = parts.join(" ");
  console.log(line);
  fs.appendFileSync(rawOutputPath, `${line}\n`);
}

function formatRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function addObject(target, additions) {
  Object.entries(additions || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value;
  });
}

function createDistribution() {
  return { 0: 0, 1: 0, 2: 0, 3: 0, "4+": 0 };
}

function createTotals() {
  return {
    reachedFloor: 0,
    survived: 0,
    equipmentUpgrades: 0,
    earlyEquipmentUpgrades: 0,
    equipmentFound: 0,
    earlyCoreEncounterRuns: 0,
    earlyCoreEquippedRuns: 0,
    finalCoreEquippedRuns: 0,
    deepReachedRuns: 0,
    deepCoreEncounterRuns: 0,
    timeCost: 0,
    bankedMaterials: 0,
    cursedEquipmentFound: 0,
    cursedCoreEquipmentFound: 0,
    coreEquipmentFound: 0,
    rarity: { magic: 0, rare: 0, epic: 0, other: 0 },
    supportCountDistribution: createDistribution(),
    supportCountByRarity: {
      magic: createDistribution(),
      rare: createDistribution(),
      epic: createDistribution(),
      other: createDistribution()
    },
    rareCoreSupportCountDistribution: createDistribution(),
    epicCoreSupportCountDistribution: createDistribution(),
    totalSupportAffixesFound: 0
  };
}

function aggregate(results) {
  const totals = createTotals();
  results.forEach(result => {
    totals.reachedFloor += result.reachedFloor;
    totals.survived += Number(result.survived);
    totals.equipmentUpgrades += result.equipmentUpgrades;
    totals.earlyEquipmentUpgrades += result.earlyEquipmentUpgrades;
    totals.equipmentFound += result.equipmentFound;
    totals.earlyCoreEncounterRuns += Number(
      result.firstCoreDepth !== null && result.firstCoreDepth <= EARLY_MAX_FLOOR
    );
    totals.earlyCoreEquippedRuns += Number(result.earlyCoreEquipped);
    totals.finalCoreEquippedRuns += Number(result.coreEquipped);
    totals.deepReachedRuns += Number(result.reachedFloor > EARLY_MAX_FLOOR);
    totals.deepCoreEncounterRuns += Number(
      result.coreEncounterFloors.some(floor => floor > EARLY_MAX_FLOOR)
    );
    totals.timeCost += result.timeCost;
    totals.bankedMaterials += result.bankedMaterials;
    totals.cursedEquipmentFound += result.cursedEquipmentFound;
    totals.cursedCoreEquipmentFound += result.cursedCoreEquipmentFound;
    totals.coreEquipmentFound += result.coreEquipmentFound;
    addObject(totals.rarity, result.rarityFound);
    addObject(totals.supportCountDistribution, result.supportCountDistribution);
    Object.keys(totals.supportCountByRarity).forEach(rarity => {
      addObject(
        totals.supportCountByRarity[rarity],
        result.supportCountByRarity[rarity]
      );
    });
    addObject(
      totals.rareCoreSupportCountDistribution,
      result.rareCoreSupportCountDistribution
    );
    addObject(
      totals.epicCoreSupportCountDistribution,
      result.epicCoreSupportCountDistribution
    );
    totals.totalSupportAffixesFound += result.totalSupportAffixesFound;
  });
  const unidentified =
    totals.rarity.magic + totals.rarity.rare + totals.rarity.epic;
  const averageTime = totals.timeCost / RUNS;
  return {
    ...totals,
    averageReachedFloor: totals.reachedFloor / RUNS,
    survivalRate: totals.survived / RUNS,
    averageEquipmentUpgrades: totals.equipmentUpgrades / RUNS,
    averageEarlyEquipmentUpgrades: totals.earlyEquipmentUpgrades / RUNS,
    averageEquipmentFound: totals.equipmentFound / RUNS,
    earlyCoreEncounterRate: totals.earlyCoreEncounterRuns / RUNS,
    earlyCoreEquippedRate: totals.earlyCoreEquippedRuns / RUNS,
    earlyCoreRetentionRate: totals.earlyCoreEncounterRuns > 0
      ? totals.earlyCoreEquippedRuns / totals.earlyCoreEncounterRuns
      : 0,
    finalCoreEquippedRate: totals.finalCoreEquippedRuns / RUNS,
    deepCoreEncounterRate: totals.deepCoreEncounterRuns / RUNS,
    deepCoreEncounterRateAmongDeepReached: totals.deepReachedRuns > 0
      ? totals.deepCoreEncounterRuns / totals.deepReachedRuns
      : 0,
    averageUnidentified: unidentified / RUNS,
    cursedEquipmentShare: unidentified > 0
      ? totals.cursedEquipmentFound / unidentified
      : 0,
    cursedCoreShare: totals.coreEquipmentFound > 0
      ? totals.cursedCoreEquipmentFound / totals.coreEquipmentFound
      : 0,
    materialEvPerTime: (totals.bankedMaterials / RUNS) / averageTime,
    averageSupportAffixesPerEquipment: totals.equipmentFound > 0
      ? totals.totalSupportAffixesFound / totals.equipmentFound
      : 0
  };
}

function restoreBalance() {
  AFFIX_BALANCE.budgetsByRarityAndFloor.rare =
    [...baselineBalance.rareBudgets];
  AFFIX_BALANCE.rollComposition.rare.coreChance =
    baselineBalance.rareCoreChance;
}

function applyCondition(condition) {
  AFFIX_BALANCE.budgetsByRarityAndFloor.rare = [
    ...(condition.rareBudgets || baselineBalance.rareBudgets)
  ];
  AFFIX_BALANCE.rollComposition.rare.coreChance =
    condition.rareCoreChance ?? baselineBalance.rareCoreChance;
}

function getB20InitialRandomState(scenario, scoringProfile) {
  restoreBalance();
  resetSimulationRandom(SEED);
  for (const targetDepth of [5, 10, 15]) {
    for (let runIndex = 0; runIndex < RUNS; runIndex++) {
      simulateRun({
        className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
        startFloor: 1,
        targetDepth,
        runIndex,
        seriesId: `depth-${targetDepth}`,
        scoringProfile,
        scenario
      });
    }
  }
  return getSimulationRandomState();
}

function runCondition(condition, scenario, scoringProfile, initialRandomState) {
  applyCondition(condition);
  resetSimulationRandom(initialRandomState);
  const results = [];
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    results.push(simulateRun({
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: "depth-20",
      scoringProfile,
      scenario,
      supplyOverride: condition.earlyRarity ? condition : null
    }));
  }
  restoreBalance();
  return aggregate(results);
}

function distributionText(distribution) {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  return Object.entries(distribution)
    .map(([count, value]) => `${count}=${formatRate(value / Math.max(1, total))}`)
    .join(",");
}

function rarityText(summary) {
  const total = Object.values(summary.rarity).reduce((sum, count) => sum + count, 0);
  return ["magic", "rare", "epic", "other"]
    .map(rarity => `${rarity}=${formatRate(summary.rarity[rarity] / Math.max(1, total))}`)
    .join(",");
}

function printConditionResult(condition, scenario, summary) {
  emit(`\n--- ${condition.id} / ${scenario.id} 保存完了 ---`);
  emit(`${condition.label} / ${scenario.label}: ${condition.note}`);
  emit(
    `前半core遭遇=${formatRate(summary.earlyCoreEncounterRate)},`,
    `前半core装備=${formatRate(summary.earlyCoreEquippedRate)},`,
    `core定着=${formatRate(summary.earlyCoreRetentionRate)},`,
    `最終core装備=${formatRate(summary.finalCoreEquippedRate)}`
  );
  emit(
    `装備=${summary.averageEquipmentFound.toFixed(2)}/run,`,
    `前半換装=${summary.averageEarlyEquipmentUpgrades.toFixed(2)},`,
    `全換装=${summary.averageEquipmentUpgrades.toFixed(2)},`,
    `rarity=${rarityText(summary)}`
  );
  emit(
    `深層core遭遇=${formatRate(summary.deepCoreEncounterRate)},`,
    `深層到達内=${formatRate(summary.deepCoreEncounterRateAmongDeepReached)},`,
    `未鑑定ギャンブル=${summary.averageUnidentified.toFixed(2)}/run,`,
    `呪い=${formatRate(summary.cursedEquipmentShare)},`,
    `core呪い=${formatRate(summary.cursedCoreShare)}`
  );
  emit(
    `平均到達=B${summary.averageReachedFloor.toFixed(2)},`,
    `生還=${formatRate(summary.survivalRate)},`,
    `EV/時間=${summary.materialEvPerTime.toFixed(4)},`,
    `support=${summary.averageSupportAffixesPerEquipment.toFixed(3)}/装備`
  );
  emit(`support全装備分布: ${distributionText(summary.supportCountDistribution)}`);
  emit(`support rare分布: ${distributionText(summary.supportCountByRarity.rare)}`);
  emit(`support rare-core分布: ${distributionText(summary.rareCoreSupportCountDistribution)}`);
  emit(`support epic-core分布: ${distributionText(summary.epicCoreSupportCountDistribution)}`);
}

function appendJsonl(condition, scenario, summary) {
  fs.appendFileSync(jsonlOutputPath, `${JSON.stringify({
    conditionId: condition.id,
    conditionLabel: condition.label,
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    runs: RUNS,
    seed: SEED,
    summary
  })}\n`);
}

function printCompositionAudit() {
  const coreCosts = [...new Set(CORE_AFFIXES.map(affix => affix.cost))]
    .sort((left, right) => left - right);
  emit("=== 構成・呼び出し経路監査 ===");
  emit(
    "実経路: generateRunFloor → runCombatRoundCalculation",
    "→ 勝利時applyCombatRewards 1回 → 実src装備generator。sim直applyなし。"
  );
  emit(
    "宝箱: generateRunFloor配置 → 拾得 → chest.js分岐のsim再現",
    "→ 実src装備generator。本体最大1回+装身具最大1回/宝箱。"
  );
  emit(
    "B1-B2宝箱はallowCores=false。予算>=10でもcore不可。",
    "戦闘はB1からallowCores=true、宝箱はB3からtrue。"
  );
  emit(`core cost実値=${coreCosts.join(",")}（全${CORE_AFFIXES.length}種）`);
  emit(
    "rare: corePool空ならlegacy supportへfallback。",
    "corePool有り時だけcoreChance判定。core側選択時はcore1のみ、support追加なし。"
  );
  emit(
    "従って「core側を選んだが予算不足で空」は発生しない。",
    "予算不足時はcoreChance自体が評価されずsupport構成になる。"
  );
  emit(
    "epic: core1取得後の残予算でsupport最大2を順次抽選。",
    "B1予算12では残2のためsupport2保証なし。実測分布を各条件で出力。"
  );
}

function printComparison(resultsByScenario) {
  emit("\n=== 主軸比較: 工房解放済（翼あり） ===");
  emit(
    "条件 | 前半core遭遇 | 前半core装備 | 定着 | 装備/run | 前半換装 |",
    "rarity magic/rare/epic/base | deep | gamble | 呪い/core呪い |",
    "support/装備 | 平均到達 | 生還 | EV/時間"
  );
  const workshop = resultsByScenario["workshop-unlocked"];
  ACTIVE_CONDITIONS.forEach(condition => {
    const summary = workshop[condition.id];
    emit(
      `${condition.label} | ${formatRate(summary.earlyCoreEncounterRate)} |`,
      `${formatRate(summary.earlyCoreEquippedRate)} |`,
      `${formatRate(summary.earlyCoreRetentionRate)} |`,
      `${summary.averageEquipmentFound.toFixed(2)} |`,
      `${summary.averageEarlyEquipmentUpgrades.toFixed(2)} |`,
      `${rarityText(summary)} |`,
      `${formatRate(summary.deepCoreEncounterRate)} |`,
      `${summary.averageUnidentified.toFixed(2)} |`,
      `${formatRate(summary.cursedEquipmentShare)}/${formatRate(summary.cursedCoreShare)} |`,
      `${summary.averageSupportAffixesPerEquipment.toFixed(3)} |`,
      `B${summary.averageReachedFloor.toFixed(2)} |`,
      `${formatRate(summary.survivalRate)} |`,
      `${summary.materialEvPerTime.toFixed(4)}`
    );
  });

  emit("\n=== 参考条件比較 ===");
  emit("scenario | 条件 | 前半core遭遇 | 前半core装備 | 装備/run | 前半換装 | 平均到達 | 生還");
  SCENARIOS.filter(scenario => scenario.id !== "workshop-unlocked")
    .forEach(scenario => {
      ACTIVE_CONDITIONS.forEach(condition => {
        const summary = resultsByScenario[scenario.id][condition.id];
        emit(
          `${scenario.label} | ${condition.label} |`,
          `${formatRate(summary.earlyCoreEncounterRate)} |`,
          `${formatRate(summary.earlyCoreEquippedRate)} |`,
          `${summary.averageEquipmentFound.toFixed(2)} |`,
          `${summary.averageEarlyEquipmentUpgrades.toFixed(2)} |`,
          `B${summary.averageReachedFloor.toFixed(2)} |`,
          `${formatRate(summary.survivalRate)}`
        );
      });
    });
}

export function runRareBudgetComparison() {
  fs.mkdirSync(path.dirname(rawOutputPath), { recursive: true });
  fs.writeFileSync(rawOutputPath, "");
  fs.writeFileSync(jsonlOutputPath, "");
  emit("=== #270 rare予算 最終比較測定（what-if試算） ===");
  emit(
    `N=${RUNS}/条件/scenario, calibration N=${CALIBRATION_RUNS},`,
    `seed=${SEED}, target=B${TARGET_DEPTH}, src変更なし`
  );
  emit(
    "注意: override経路は実src変更後と乱数消費順が異なる。",
    "採用判断は実src変更後N=500再測定前提。"
  );
  printCompositionAudit();

  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
  const initialStates = {};
  for (const scenario of SCENARIOS) {
    initialStates[scenario.id] = getB20InitialRandomState(
      scenario,
      scoringProfile
    );
  }

  const resultsByScenario = {};
  for (const scenario of SCENARIOS) {
    resultsByScenario[scenario.id] = {};
    for (const condition of ACTIVE_CONDITIONS) {
      const summary = runCondition(
        condition,
        scenario,
        scoringProfile,
        initialStates[scenario.id]
      );
      resultsByScenario[scenario.id][condition.id] = summary;
      printConditionResult(condition, scenario, summary);
      appendJsonl(condition, scenario, summary);
    }
  }
  printComparison(resultsByScenario);
  emit("\n=== 実行完了 ===");
  restoreBalance();
  return resultsByScenario;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRareBudgetComparison();
}
