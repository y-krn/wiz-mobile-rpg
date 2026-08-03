// sim-scope: run
/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const {
  REFERENCE_SCENARIOS,
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

const RUNS = Math.max(1, Number(process.env.CHEST_GATE_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.CHEST_GATE_CALIBRATION_RUNS || RUNS)
);
const SEED = Number(process.env.CHEST_GATE_SEED || 231) >>> 0;
const TARGET_DEPTH = 20;
const EARLY_MAX_FLOOR = 10;
const SOURCE_ACCESSORY_MIN_FLOOR = Math.max(
  1,
  Number(process.env.CHEST_GATE_SOURCE_ACCESSORY_MIN_FLOOR || 2)
);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rawOutputPath = path.join(
  scriptDir,
  "results",
  "issue-270-chest-core-gate.raw.txt"
);
const jsonlOutputPath = path.join(
  scriptDir,
  "results",
  "issue-270-chest-core-gate.jsonl"
);

const baselineAffixBalance = structuredClone({
  rareBudgets: AFFIX_BALANCE.budgetsByRarityAndFloor.rare,
  rareCoreChance: AFFIX_BALANCE.rollComposition.rare.coreChance
});
const legacyAffixBalance = Object.freeze({
  rareBudgets: [0, 6, 7, 8, 9, 10],
  rareCoreChance: 0.5
});
const CORE_GROUP_BY_ID = new Map(
  CORE_AFFIXES.filter(affix => affix.enabled)
    .map(affix => [affix.id, affix.poolGroup])
);
const GROUPS = Object.freeze(["combat", "economy"]);

const currentConditions = [
  {
    id: "actual-src",
    label: "実src",
    equipmentMinFloor: 3,
    accessoryMinFloor: SOURCE_ACCESSORY_MIN_FLOOR,
    useSourceGate: true
  },
  {
    id: "current-b3-both",
    label: "現行 B3:本体+装身具",
    equipmentMinFloor: 3,
    accessoryMinFloor: 3
  },
  {
    id: "current-b2-equipment",
    label: "B2:本体のみ",
    equipmentMinFloor: 2,
    accessoryMinFloor: 3
  },
  {
    id: "current-b2-accessory",
    label: "B2:装身具のみ",
    equipmentMinFloor: 3,
    accessoryMinFloor: 2
  },
  {
    id: "current-b2-both",
    label: "B2:本体+装身具",
    equipmentMinFloor: 2,
    accessoryMinFloor: 2
  },
  {
    id: "current-b1-equipment",
    label: "B1:本体のみ",
    equipmentMinFloor: 1,
    accessoryMinFloor: 3
  },
  {
    id: "current-b1-accessory",
    label: "B1:装身具のみ",
    equipmentMinFloor: 3,
    accessoryMinFloor: 1
  },
  {
    id: "current-b1-both",
    label: "B1:本体+装身具",
    equipmentMinFloor: 1,
    accessoryMinFloor: 1
  }
];
const legacyConditions = [
  {
    id: "legacy-b3-both",
    label: "旧rare B3:本体+装身具",
    equipmentMinFloor: 3,
    accessoryMinFloor: 3,
    ...legacyAffixBalance
  },
  {
    id: "legacy-b2-accessory",
    label: "旧rare B2:装身具のみ",
    equipmentMinFloor: 3,
    accessoryMinFloor: 2,
    ...legacyAffixBalance
  }
];
const CONDITIONS = Object.freeze([...currentConditions, ...legacyConditions]);
const CONDITION_FILTER = new Set(
  String(process.env.CHEST_GATE_CONDITIONS || "")
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

function addArray(target, additions) {
  additions.forEach((value, index) => {
    target[index] = (target[index] || 0) + value;
  });
}

function addObject(target, additions) {
  Object.entries(additions || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value;
  });
}

function createGroupTotals() {
  return {
    combat: {
      earlyEncounterRuns: 0,
      earlyEquippedRuns: 0,
      finalEquippedRuns: 0,
      foundByFloor: Array(21).fill(0)
    },
    economy: {
      earlyEncounterRuns: 0,
      earlyEquippedRuns: 0,
      finalEquippedRuns: 0,
      foundByFloor: Array(21).fill(0)
    }
  };
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
    totalSupportAffixesFound: 0,
    rarity: { magic: 0, rare: 0, epic: 0, other: 0 },
    firstCoreFloor: {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
      "11+": 0,
      none: 0
    },
    groups: createGroupTotals()
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
      result.firstCoreDepth !== null &&
      result.firstCoreDepth <= EARLY_MAX_FLOOR
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
    totals.totalSupportAffixesFound += result.totalSupportAffixesFound;
    addObject(totals.rarity, result.rarityFound);

    if (result.firstCoreDepth === null) {
      totals.firstCoreFloor.none++;
    } else if (result.firstCoreDepth <= EARLY_MAX_FLOOR) {
      totals.firstCoreFloor[result.firstCoreDepth]++;
    } else {
      totals.firstCoreFloor["11+"]++;
    }

    GROUPS.forEach(group => {
      const encounterFloor = result.coreFirstEncounterFloorByGroup[group];
      const equippedFloor = result.coreFirstEquippedFloorByGroup[group];
      totals.groups[group].earlyEncounterRuns += Number(
        encounterFloor !== null && encounterFloor <= EARLY_MAX_FLOOR
      );
      totals.groups[group].earlyEquippedRuns += Number(
        equippedFloor !== null && equippedFloor <= EARLY_MAX_FLOOR
      );
      totals.groups[group].finalEquippedRuns += Number(
        CORE_GROUP_BY_ID.get(result.finalCoreId) === group
      );
      addArray(
        totals.groups[group].foundByFloor,
        result.coreEquipmentFoundByGroupAndFloor[group]
      );
    });
  });

  const unidentified =
    totals.rarity.magic + totals.rarity.rare + totals.rarity.epic;
  const averageTime = totals.timeCost / RUNS;
  const groupSummary = Object.fromEntries(GROUPS.map(group => {
    const values = totals.groups[group];
    return [group, {
      ...values,
      earlyEncounterRate: values.earlyEncounterRuns / RUNS,
      earlyEquippedRate: values.earlyEquippedRuns / RUNS,
      earlyRetentionRate: values.earlyEncounterRuns > 0
        ? values.earlyEquippedRuns / values.earlyEncounterRuns
        : 0,
      finalEquippedRate: values.finalEquippedRuns / RUNS
    }];
  }));
  return {
    ...totals,
    groups: groupSummary,
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

function restoreAffixBalance() {
  AFFIX_BALANCE.budgetsByRarityAndFloor.rare = [
    ...baselineAffixBalance.rareBudgets
  ];
  AFFIX_BALANCE.rollComposition.rare.coreChance =
    baselineAffixBalance.rareCoreChance;
}

function applyCondition(condition) {
  AFFIX_BALANCE.budgetsByRarityAndFloor.rare = [
    ...(condition.rareBudgets || baselineAffixBalance.rareBudgets)
  ];
  AFFIX_BALANCE.rollComposition.rare.coreChance =
    condition.rareCoreChance ?? baselineAffixBalance.rareCoreChance;
}

function getB20InitialRandomState(scenario, scoringProfile) {
  restoreAffixBalance();
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
    const supplyOverride = condition.useSourceGate
      ? null
      : {
          chestEquipmentCoreMinFloor: condition.equipmentMinFloor,
          chestAccessoryCoreMinFloor: condition.accessoryMinFloor
        };
    results.push(simulateRun({
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: "depth-20",
      scoringProfile,
      scenario,
      supplyOverride
    }));
  }
  restoreAffixBalance();
  return aggregate(results);
}

function rarityText(summary) {
  const total = Object.values(summary.rarity).reduce((sum, count) => sum + count, 0);
  return ["magic", "rare", "epic", "other"]
    .map(rarity => `${rarity}=${formatRate(summary.rarity[rarity] / Math.max(1, total))}`)
    .join(",");
}

function firstFloorText(summary) {
  return Object.entries(summary.firstCoreFloor)
    .map(([floor, count]) => `${floor}=${formatRate(count / RUNS)}`)
    .join(",");
}

function groupText(group) {
  return [
    `遭遇=${formatRate(group.earlyEncounterRate)}`,
    `装備=${formatRate(group.earlyEquippedRate)}`,
    `定着=${formatRate(group.earlyRetentionRate)}`,
    `最終=${formatRate(group.finalEquippedRate)}`,
    `B1個数=${group.foundByFloor[1]}`,
    `B2個数=${group.foundByFloor[2]}`
  ].join(",");
}

function printConditionResult(condition, scenario, summary) {
  emit(`\n--- ${condition.id} / ${scenario.id} 保存完了 ---`);
  emit(
    `${condition.label} / ${scenario.label}:`,
    `本体>=B${condition.equipmentMinFloor},`,
    `装身具>=B${condition.accessoryMinFloor}`
  );
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
  emit(`初回core遭遇フロア: ${firstFloorText(summary)}`);
  GROUPS.forEach(group => emit(`${group}: ${groupText(summary.groups[group])}`));
}

function appendJsonl(condition, scenario, summary) {
  fs.appendFileSync(jsonlOutputPath, `${JSON.stringify({
    conditionId: condition.id,
    conditionLabel: condition.label,
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    runs: RUNS,
    seed: SEED,
    equipmentMinFloor: condition.equipmentMinFloor,
    accessoryMinFloor: condition.accessoryMinFloor,
    rareBudgets: condition.rareBudgets || baselineAffixBalance.rareBudgets,
    rareCoreChance:
      condition.rareCoreChance ?? baselineAffixBalance.rareCoreChance,
    summary
  })}\n`);
}

function printComparison(resultsByScenario) {
  emit("\n=== 主軸比較: 工房解放済（翼あり） ===");
  emit(
    "条件 | core遭遇 | core装備 | 定着 | combat遭遇/装備/定着 |",
    "economy遭遇/装備/定着 | 装備 | 換装 | deep | gamble |",
    "呪い/core呪い | support | 固定base | 平均到達 | 生還 | EV/時間"
  );
  const workshop = resultsByScenario["workshop-empty"];
  ACTIVE_CONDITIONS.forEach(condition => {
    const summary = workshop[condition.id];
    const rarityTotal = Object.values(summary.rarity)
      .reduce((sum, count) => sum + count, 0);
    emit(
      `${condition.label} | ${formatRate(summary.earlyCoreEncounterRate)} |`,
      `${formatRate(summary.earlyCoreEquippedRate)} |`,
      `${formatRate(summary.earlyCoreRetentionRate)} |`,
      `${formatRate(summary.groups.combat.earlyEncounterRate)}/` +
        `${formatRate(summary.groups.combat.earlyEquippedRate)}/` +
        `${formatRate(summary.groups.combat.earlyRetentionRate)} |`,
      `${formatRate(summary.groups.economy.earlyEncounterRate)}/` +
        `${formatRate(summary.groups.economy.earlyEquippedRate)}/` +
        `${formatRate(summary.groups.economy.earlyRetentionRate)} |`,
      `${summary.averageEquipmentFound.toFixed(2)} |`,
      `${summary.averageEarlyEquipmentUpgrades.toFixed(2)} |`,
      `${formatRate(summary.deepCoreEncounterRate)} |`,
      `${summary.averageUnidentified.toFixed(2)} |`,
      `${formatRate(summary.cursedEquipmentShare)}/` +
        `${formatRate(summary.cursedCoreShare)} |`,
      `${summary.averageSupportAffixesPerEquipment.toFixed(3)} |`,
      `${formatRate(summary.rarity.other / Math.max(1, rarityTotal))} |`,
      `B${summary.averageReachedFloor.toFixed(2)} |`,
      `${formatRate(summary.survivalRate)} |`,
      `${summary.materialEvPerTime.toFixed(4)}`
    );
  });

  emit("\n=== 参考条件比較 ===");
  emit("scenario | 条件 | core遭遇 | core装備 | 定着 | 装備 | 換装 | 平均到達 | 生還 | EV/時間");
  REFERENCE_SCENARIOS.filter(scenario => scenario.id !== "workshop-empty")
    .forEach(scenario => {
      ACTIVE_CONDITIONS.forEach(condition => {
        const summary = resultsByScenario[scenario.id][condition.id];
        emit(
          `${scenario.label} | ${condition.label} |`,
          `${formatRate(summary.earlyCoreEncounterRate)} |`,
          `${formatRate(summary.earlyCoreEquippedRate)} |`,
          `${formatRate(summary.earlyCoreRetentionRate)} |`,
          `${summary.averageEquipmentFound.toFixed(2)} |`,
          `${summary.averageEarlyEquipmentUpgrades.toFixed(2)} |`,
          `B${summary.averageReachedFloor.toFixed(2)} |`,
          `${formatRate(summary.survivalRate)} |`,
          `${summary.materialEvPerTime.toFixed(4)}`
        );
      });
    });
}

export function runChestCoreGateComparison() {
  fs.mkdirSync(path.dirname(rawOutputPath), { recursive: true });
  const appendOutput = process.env.CHEST_GATE_APPEND === "1";
  if (appendOutput) {
    fs.appendFileSync(rawOutputPath, "\n=== 追補測定 ===\n");
  } else {
    fs.writeFileSync(rawOutputPath, "");
    fs.writeFileSync(jsonlOutputPath, "");
  }
  emit("=== #270 宝箱allowCoresゲート測定 ===");
  emit(
    `N=${RUNS}/条件/scenario, calibration N=${CALIBRATION_RUNS},`,
    `seed=${SEED}, target=B${TARGET_DEPTH}`
  );
  emit(
    "actual-src条件はoverrideなし。sim内のchest.js再現ゲートを実srcと同期。"
  );
  emit(
    "実経路: generateRunFloor配置→拾得→chest.js分岐のsim再現→",
    "実src generator。本体最大1+装身具最大1/宝箱。"
  );
  emit(
    "戦闘: runCombatRoundCalculation勝利時applyCombatRewards 1回。",
    "sim直applyなし。戦闘allowCores=trueは全条件不変。"
  );
  emit(
    `現行rare=${JSON.stringify(baselineAffixBalance.rareBudgets)},`,
    `coreChance=${baselineAffixBalance.rareCoreChance};`,
    `旧rare=${JSON.stringify(legacyAffixBalance.rareBudgets)},`,
    `coreChance=${legacyAffixBalance.rareCoreChance}`
  );
  emit(
    "shallow corePoolWeights: B1-B2 combat:economy=1:3。",
    "B1-B2解禁時の種別をrun率と実個数で出力。"
  );

  if (ACTIVE_CONDITIONS.length === 0) {
    throw new Error("CHEST_GATE_CONDITIONSに有効な条件がない");
  }

  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
  const initialStates = {};
  for (const scenario of REFERENCE_SCENARIOS) {
    initialStates[scenario.id] = getB20InitialRandomState(
      scenario,
      scoringProfile
    );
  }

  const resultsByScenario = {};
  for (const scenario of REFERENCE_SCENARIOS) {
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
  restoreAffixBalance();
  return resultsByScenario;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runChestCoreGateComparison();
}
