// sim-scope: run
/* global console, process */

// #264診断専用。実ラン経路は sim_depth_material_ev.js に委譲する。
const { AFFIX_BALANCE } = await import("../src/data/affixes.js");
const progressionModule = await import("../src/data/progression.js");
const { EXP_LEVELS } = progressionModule;
// #276のmain curveを基準に、what-if用の原曲線を計測時だけ復元する。
const BASE_EXP_LEVELS = progressionModule.BASE_EXP_LEVELS
  ? [...progressionModule.BASE_EXP_LEVELS]
  : EXP_LEVELS.map((exp, level) => (level < 2 ? exp : Math.round(exp / 0.5)));
const {
  DEPTH_SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS = Math.max(1, Number(process.env.ISSUE264_RUNS || process.env.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.ISSUE264_CALIBRATION_RUNS || Math.min(RUNS, 500))
);
const DAMAGE_SOURCES = ["trap", "normal", "elite", "boss", "other"];
const REASONS = ["death", "target-retreat", "wing-retreat", "other-retreat"];
const BASE_COMPOSITIONS = structuredClone(AFFIX_BALANCE.rollComposition);
const BASE_BUDGETS = structuredClone(AFFIX_BALANCE.budgetsByRarityAndFloor);
const BASELINE_EXP_LEVELS = [...EXP_LEVELS];

function createReasonCounts() {
  return Object.fromEntries(REASONS.map(reason => [reason, 0]));
}

function createDamageCounts() {
  return Object.fromEntries(DAMAGE_SOURCES.map(source => [source, 0]));
}

function restoreSlotOverrides() {
  Object.entries(BASE_COMPOSITIONS).forEach(([rarity, composition]) => {
    AFFIX_BALANCE.rollComposition[rarity] = structuredClone(composition);
  });
  delete process.env.SIM_CORE_SLOT_OVERRIDE;
}

function applySlotVariant(slotVariant) {
  restoreSlotOverrides();
  if (!slotVariant) return;
  if (Number.isFinite(slotVariant.support)) {
    Object.values(AFFIX_BALANCE.rollComposition).forEach(composition => {
      composition.support = slotVariant.support;
    });
  }
  if (Number.isFinite(slotVariant.core)) {
    process.env.SIM_CORE_SLOT_OVERRIDE = String(slotVariant.core);
  }
}

function restoreBudgetOverrides() {
  Object.entries(BASE_BUDGETS).forEach(([rarity, budgets]) => {
    AFFIX_BALANCE.budgetsByRarityAndFloor[rarity] = [...budgets];
  });
  delete process.env.SIM_AFFIX_BUDGET_UNCLAMPED;
}

function applyBudgetVariant(budgetVariant) {
  restoreBudgetOverrides();
  if (!budgetVariant) return;
  if (budgetVariant.unclamped) {
    process.env.SIM_AFFIX_BUDGET_UNCLAMPED = "1";
  }
  Object.entries(budgetVariant.tables || budgetVariant).forEach(([rarity, budgets]) => {
    AFFIX_BALANCE.budgetsByRarityAndFloor[rarity] = [...budgets];
  });
}

function restoreExpOverrides() {
  EXP_LEVELS.splice(0, EXP_LEVELS.length, ...BASELINE_EXP_LEVELS);
}

function applyExpVariant(expVariant) {
  restoreExpOverrides();
  if (!expVariant) return;
  const scale = Number(expVariant.scale);
  if (!Number.isFinite(scale) || scale <= 0) return;
  EXP_LEVELS.splice(
    0,
    EXP_LEVELS.length,
    ...BASE_EXP_LEVELS.map((exp, level) => (
      level < 2 ? exp : Math.round(exp * scale)
    ))
  );
}

function createClassSummary() {
  return Object.fromEntries(SIM_CLASSES.map(className => [className, {
    runs: 0,
    termination: createReasonCounts(),
    fatalSources: createDamageCounts(),
    fatalDamage: createDamageCounts()
  }]));
}

function summarize(results) {
  const summary = {
    runs: results.length,
    survived: 0,
    died: 0,
    reachedFloor: 0,
    finalLevel: 0,
    bankedMaterialEv: 0,
    timeCost: 0,
    fleeRuns: 0,
    termination: createReasonCounts(),
    terminationByFloor: {},
    byClass: createClassSummary(),
    fatalSources: createDamageCounts(),
    fatalDamage: createDamageCounts()
  };
  results.forEach(result => {
    summary.survived += Number(result.survived);
    summary.died += Number(result.died);
    summary.reachedFloor += result.reachedFloor;
    summary.finalLevel += result.finalLevel;
    summary.bankedMaterialEv += result.bankedMaterials;
    summary.timeCost += result.timeCost;
    summary.fleeRuns += Number(result.fleeCount > 0);
    const reason = result.terminationReason || (result.died ? "death" : "target-retreat");
    summary.termination[reason]++;
    const floor = `B${result.terminationFloor || result.reachedFloor}`;
    summary.terminationByFloor[floor] ||= createReasonCounts();
    summary.terminationByFloor[floor][reason]++;
    const classSummary = summary.byClass[result.className];
    classSummary.runs++;
    classSummary.termination[reason]++;
    if (!result.died) return;
    const fatalSource = DAMAGE_SOURCES.includes(result.fatalSource)
      ? result.fatalSource
      : "other";
    summary.fatalSources[fatalSource]++;
    classSummary.fatalSources[fatalSource]++;
    DAMAGE_SOURCES.forEach(source => {
      summary.fatalDamage[source] += result.fatalDamageBySource?.[source] || 0;
      classSummary.fatalDamage[source] += result.fatalDamageBySource?.[source] || 0;
    });
  });
  const deaths = Math.max(1, summary.died);
  return {
    runs: summary.runs,
    survivalRate: summary.survived / summary.runs,
    deathRate: summary.died / summary.runs,
    averageReachedFloor: summary.reachedFloor / summary.runs,
    averageFinalLevel: summary.finalLevel / summary.runs,
    bankedMaterialEv: summary.bankedMaterialEv / summary.runs,
    averageTimeCost: summary.timeCost / summary.runs,
    materialEvPerTime: summary.bankedMaterialEv / Math.max(1, summary.timeCost),
    fleeRunRate: summary.fleeRuns / summary.runs,
    termination: summary.termination,
    terminationByFloor: summary.terminationByFloor,
    byClass: Object.fromEntries(
      Object.entries(summary.byClass).map(([className, values]) => [className, {
        runs: values.runs,
        termination: values.termination,
        fatalSources: values.fatalSources,
        fatalDamagePerDeath: Object.fromEntries(
          DAMAGE_SOURCES.map(source => [source, values.fatalDamage[source] / Math.max(1, values.termination.death)])
        )
      }])
    ),
    fatalSources: summary.fatalSources,
    fatalDamagePerDeath: Object.fromEntries(
      DAMAGE_SOURCES.map(source => [source, summary.fatalDamage[source] / deaths])
    )
  };
}

function getScenario(id) {
  const scenario = DEPTH_SCENARIOS.find(candidate => candidate.id === id);
  if (!scenario) throw new Error(`unknown depth scenario: ${id}`);
  return structuredClone(scenario);
}

function runCase({
  key,
  scenarioId,
  startFloor,
  targetDepth,
  scenarioPatch = {},
  workshop = null,
  slotVariant = null,
  budgetVariant = null,
  expVariant = null
}) {
  applySlotVariant(slotVariant);
  applyBudgetVariant(budgetVariant);
  applyExpVariant(expVariant);
  const baseScenario = getScenario(scenarioId);
  const scenario = { ...baseScenario, ...scenarioPatch };
  const activeWorkshop = workshop || scenario.workshop || { ranks: {} };
  const calibrationOverrides = {
    ...scenarioPatch,
    identificationPolicy: "legacy"
  };
  resetSimulationRandom(Number(process.env.SIM_SEED || 231));
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    calibrationOverrides,
    "legacy",
    activeWorkshop
  );
  resetSimulationRandom(Number(process.env.SIM_SEED || 231));
  const results = [];
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor,
      targetDepth,
      runIndex,
      seriesId: process.env.ISSUE264_SERIES_ID || `issue264-${key}`,
      scoringProfile,
      scenario: { ...scenario, identificationPolicy: "legacy" },
      workshop: activeWorkshop
    });
    results.push({ ...result, className });
  }
  const resultSummary = summarize(results);
  console.log(`[ISSUE264] ${JSON.stringify({
    key,
    scenarioId,
    startFloor,
    targetDepth,
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    scenario: {
      trapPolicy: scenario.trapPolicy || process.env.TRAP_POLICY || "conservative",
      trapAvoidancePolicy: scenario.trapAvoidancePolicy || process.env.TRAP_AVOIDANCE_POLICY || "ev",
      fleeHpThreshold: scenario.fleeHpThreshold,
      startingLevel: scenario.startingLevel || 1,
      startingStatBonus: scenario.startingStatBonus || null,
      workshop: activeWorkshop,
      slotVariant,
      budgetVariant,
      expVariant
    },
    summary: resultSummary
  })}`);
  return resultSummary;
}

function runNamedCases() {
  const mode = process.env.ISSUE264_MODE || "baseline";
  const complete = getScenario("workshop-complete").workshop;
  if (mode === "baseline") {
    runCase({
      key: "baseline-complete-b5-b20",
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 5),
      workshop: complete
    });
    return;
  }
  if (mode === "flee") {
    [0.15, 0.25, 0.35, 0.45, 0.55].forEach(threshold => {
      runCase({
        key: `flee-${threshold}`,
        scenarioId: "workshop-complete",
        startFloor: 1,
        targetDepth: Number(process.env.ISSUE264_TARGET || 20),
        scenarioPatch: { fleeHpThreshold: threshold },
        workshop: complete
      });
    });
    return;
  }
  if (mode === "workshop") {
    [
      "workshop-empty",
      "workshop-stats",
      "workshop-gear",
      "workshop-blood-wand",
      "workshop-blood-wand-spells",
      "workshop-complete"
    ].forEach(scenarioId => runCase({
      key: scenarioId,
      scenarioId,
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: getScenario(scenarioId).workshop
    }));
    return;
  }
  if (mode === "trap") {
    ["conservative", "disabled"].forEach(trapPolicy => runCase({
      key: `trap-${trapPolicy}`,
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      scenarioPatch: { trapPolicy },
      workshop: complete
    }));
    return;
  }
  if (mode === "slots") {
    [
      { key: "slots-baseline", slotVariant: null },
      { key: "slots-support-plus1", slotVariant: { support: 3 } },
      { key: "slots-core-plus1", slotVariant: { core: 2 } }
    ].forEach(({ key, slotVariant }) => runCase({
      key,
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: complete,
      slotVariant
    }));
    return;
  }
  if (mode === "budget") {
    [
      { key: "budget-baseline", budgetVariant: null },
      {
        key: "budget-deep-expanded",
        budgetVariant: {
          unclamped: true,
          tables: {
            magic: [0, 3, 3, 3, 3, 3, ...Array(15).fill(50)],
            rare: [0, 10, 10, 10, 10, 10, ...Array(15).fill(50)],
            epic: [0, 12, 13, 14, 15, 16, ...Array(15).fill(50)]
          }
        }
      }
    ].forEach(({ key, budgetVariant }) => runCase({
      key,
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: complete,
      budgetVariant
    }));
    return;
  }
  if (mode === "exp") {
    [1, 0.75, 0.5, 0.35, 0.25].forEach(scale => runCase({
      key: `exp-scale-${scale}`,
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: complete,
      expVariant: { scale }
    }));
    return;
  }
  if (mode === "start-level") {
    [1, 4, 6, 8, 10].forEach(startingLevel => runCase({
      key: `start-b10-level-${startingLevel}`,
      scenarioId: "legacy-no-portal",
      startFloor: 10,
      targetDepth: Number(process.env.ISSUE264_TARGET || 15),
      scenarioPatch: { startingLevel },
      workshop: complete
    }));
    return;
  }
  if (mode === "combo") {
    const base = {
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: complete
    };
    [0, 1].forEach(trap => [0, 1].forEach(slot => [0, 1].forEach(stat => [0, 1].forEach(exp => {
      const key = `combo-t${trap}-s${slot}-a${stat}-e${exp}`;
      runCase({
        ...base,
        key,
        scenarioPatch: {
          ...(trap ? { trapPolicy: "disabled" } : {}),
          ...(stat ? {
            startingStatBonus: { str: 5, int: 5, pie: 5, vit: 5, agi: 5, luk: 5 }
          } : {})
        },
        slotVariant: slot ? { support: 3 } : null,
        expVariant: exp ? { scale: 0.35 } : null
      });
    }))));
    return;
  }
  if (mode === "combo-focus") {
    const base = {
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: Number(process.env.ISSUE264_TARGET || 20),
      workshop: complete
    };
    [
      { key: "combo-focus-baseline" },
      {
        key: "combo-focus-full",
        scenarioPatch: {
          trapPolicy: "disabled",
          startingStatBonus: { str: 5, int: 5, pie: 5, vit: 5, agi: 5, luk: 5 }
        },
        slotVariant: { support: 3 },
        expVariant: {
          scale: Number(process.env.ISSUE264_COMBO_EXP_SCALE || 0.35)
        }
      }
    ].forEach(runCaseOptions => runCase({ ...base, ...runCaseOptions }));
    return;
  }
  if (mode === "routes") {
    runCase({
      key: "route-b1-to-b15",
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: 15,
      workshop: complete
    });
    runCase({
      key: "route-b10-empty-to-b15",
      scenarioId: "legacy-no-portal",
      startFloor: 10,
      targetDepth: 15,
      workshop: getScenario("legacy-no-portal").workshop
    });
    runCase({
      key: "route-b10-complete-level4-to-b15",
      scenarioId: "legacy-no-portal",
      startFloor: 10,
      targetDepth: 15,
      scenarioPatch: { startingLevel: 4 },
      workshop: complete
    });
    runCase({
      key: "route-b1-complete-statplus5-to-b15",
      scenarioId: "workshop-complete",
      startFloor: 1,
      targetDepth: 15,
      scenarioPatch: {
        startingStatBonus: { str: 5, int: 5, pie: 5, vit: 5, agi: 5, luk: 5 }
      },
      workshop: complete
    });
    return;
  }
  throw new Error(`unknown ISSUE264_MODE: ${mode}`);
}

runNamedCases();
