// sim-scope: run
// Issue #271: B5 quality-dependence measurement only.
// This file intentionally lives under scratch; it does not change game rules.

import { isMainThread } from "node:worker_threads";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ENV = {
  SIM_SEED: "271",
  SIM_RUNS: "2000",
  SIM_CALIBRATION_RUNS: "1000",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "legacy",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  FLEE_HP_THRESHOLD: "0.35",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  SIM_SCENARIOS: "workshop-complete",
};

for (const [key, value] of Object.entries(DEFAULT_ENV)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const POLICY = process.env.FLEE_POLICY ?? "threshold";
const RUNS = Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = Number(process.env.SIM_CALIBRATION_RUNS);
const SEED = Number(process.env.SIM_SEED);
const SCENARIO_ID = "workshop-complete";
const B5 = 5;
const BOSS_OVERRIDE = process.env.BOSS_DISABLE_SPELL === "1"
  ? { floor: Number(process.env.BOSS_OVERRIDE_FLOOR ?? B5), disableSpell: true }
  : null;

const [
  { DEPTH_SCENARIOS, SIM_CLASSES, calibrateCoreScoringProfile, resetSimulationRandom, simulateRun },
  { CORE_AFFIXES },
  { SPELLS },
  { getCoreLogText },
  { runSimTasks },
] = await Promise.all([
  import("./sim_depth_material_ev.js"),
  import("../src/data/affixes.js"),
  import("../src/data.js"),
  import("../src/rules/affix_rules.js"),
  import("./sim_parallel.js"),
]);

const CORE_IDS = CORE_AFFIXES.map((affix) => affix.id);
const ENABLED_CORE_IDS = CORE_AFFIXES.filter((affix) => affix.enabled !== false).map(
  (affix) => affix.id,
);
const COMBAT_CORE_IDS = new Set(
  CORE_AFFIXES
    .filter((affix) => affix.enabled !== false && affix.poolGroup === "combat")
    .map((affix) => affix.id),
);
const CORE_HOOKS = {
  CORE_LAST_STAND: "低HP時の攻撃ダメージ",
  CORE_OPENER: "各戦闘の初撃・追撃",
  CORE_BLOOD_WAND: "MP不足時のHP支払いによる詠唱継続",
  CORE_PURIFY_RING: "アンデッド/スピリット/デーモン撃破時の回復",
  CORE_TRAP_EATER: "罠解除時の攻撃力スタック（boss直撃ではない）",
  CORE_CURSE_KEEPER: "呪い装備時の常時 stat 補正（イベント発動ではない）",
  CORE_GIANT_SLAYER: "敵最大HPが高い時の攻撃補正",
  CORE_REARGUARD: "無効化済み",
  CORE_THORN_SHIELD: "被弾時の counter",
  CORE_EXECUTIONER: "状態異常中の敵への攻撃補正",
  CORE_SNEAK_STEP: "探索時の罠検知",
  CORE_TOMB_RAIDER: "宝箱/罠 tier の探索補正",
  CORE_KEEN_EYE: "未鑑定効果の表示",
  CORE_CAMP_MASTER: "camp 回復量",
  CORE_BOUNTY_HUNTER: "quest kill count",
  CORE_SCHOLAR_EYE: "未登録素材の確定入手",
};

const SUPPORT_BY_CORE = {
  CORE_LAST_STAND: ["hp", "vit", "guardian", "killHeal"],
  CORE_OPENER: ["firstStrike", "firstTurnAttack", "fullHpDamage", "followUp"],
  CORE_BLOOD_WAND: ["hp", "vit", "int", "pie", "arcane", "devotion"],
  CORE_PURIFY_RING: ["antiUndead", "antiDemon", "arcane", "devotion"],
  CORE_TRAP_EATER: ["trapBonus"],
  CORE_CURSE_KEEPER: [],
  CORE_GIANT_SLAYER: ["antiDragon", "antiBeast", "antiSpirit"],
  CORE_THORN_SHIELD: ["guardian", "def", "vit", "hitFlinch"],
  CORE_EXECUTIONER: [],
};

const baseScenario = DEPTH_SCENARIOS.find((scenario) => scenario.id === SCENARIO_ID);
if (!baseScenario) throw new Error(`scenario not found: ${SCENARIO_ID}`);

const scenario = {
  ...baseScenario,
  id: SCENARIO_ID,
  label: "工房買い切り済み",
  trapPolicy: process.env.TRAP_POLICY,
  trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
  identificationPolicy: process.env.IDENTIFICATION_POLICY,
  statusCurePolicy: process.env.STATUS_CURE_POLICY,
  statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD),
  statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
  fleeHpThreshold: POLICY === "never" ? null : Number(process.env.FLEE_HP_THRESHOLD),
  portalHpThreshold: Number(process.env.PORTAL_HP_THRESHOLD),
  portalMaxHealPotions: Number(process.env.PORTAL_MAX_HEAL_POTIONS),
  portalMinFloor: Number(process.env.PORTAL_MIN_FLOOR),
  elitePolicy: process.env.ELITE_POLICY,
  bossOverride: BOSS_OVERRIDE,
};

const classNames = SIM_CLASSES.filter((name) =>
  ["Fighter", "Thief", "Priest", "Mage"].includes(name),
);

function hashSeed(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wilson(successes, total) {
  if (!total) return { estimate: null, low: null, high: null };
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denominator;
  return { estimate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function normalDifference(left, right) {
  if (!left.length || !right.length) return { estimate: null, low: null, high: null };
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = (values, valueMean) =>
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1)
      : 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const estimate = leftMean - rightMean;
  const se = Math.sqrt(variance(left, leftMean) / left.length + variance(right, rightMean) / right.length);
  return { estimate, low: estimate - 1.959963984540054 * se, high: estimate + 1.959963984540054 * se };
}

function fisherCorrelation(rows, valueKey, outcomeKey) {
  const grouped = new Map();
  for (const row of rows) {
    const outcome = typeof row[outcomeKey] === "boolean" ? Number(row[outcomeKey]) : row[outcomeKey];
    if (!Number.isFinite(row.b5?.[valueKey]) || !Number.isFinite(outcome)) continue;
    if (!grouped.has(row.className)) grouped.set(row.className, []);
    grouped.get(row.className).push({ x: row.b5[valueKey], y: outcome });
  }
  const pairs = [...grouped.values()].flatMap((values) => {
    const meanX = values.reduce((sum, value) => sum + value.x, 0) / values.length;
    const meanY = values.reduce((sum, value) => sum + value.y, 0) / values.length;
    return values.map((value) => ({ x: value.x - meanX, y: value.y - meanY }));
  });
  const sumXX = pairs.reduce((sum, value) => sum + value.x * value.x, 0);
  const sumYY = pairs.reduce((sum, value) => sum + value.y * value.y, 0);
  const sumXY = pairs.reduce((sum, value) => sum + value.x * value.y, 0);
  if (pairs.length < 4 || sumXX === 0 || sumYY === 0) {
    return { r: null, low: null, high: null, n: pairs.length };
  }
  const r = sumXY / Math.sqrt(sumXX * sumYY);
  const clipped = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(clipped);
  const se = 1 / Math.sqrt(pairs.length - 3);
  return {
    r,
    low: Math.tanh(z - 1.959963984540054 * se),
    high: Math.tanh(z + 1.959963984540054 * se),
    n: pairs.length,
  };
}

function classCenteredEffect(rows, predicate, outcomeKey) {
  const byClass = new Map();
  for (const row of rows) {
    const outcome = typeof row[outcomeKey] === "boolean" ? Number(row[outcomeKey]) : row[outcomeKey];
    if (!Number.isFinite(outcome)) continue;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  }
  const left = [];
  const right = [];
  const classCounts = {};
  for (const [className, classRows] of byClass) {
    const classMean = classRows.reduce(
      (sum, row) => sum + (typeof row[outcomeKey] === "boolean" ? Number(row[outcomeKey]) : row[outcomeKey]),
      0,
    ) / classRows.length;
    const classLeft = classRows.filter(predicate);
    const classRight = classRows.filter((row) => !predicate(row));
    classCounts[className] = { left: classLeft.length, right: classRight.length };
    left.push(...classLeft.map((row) => (typeof row[outcomeKey] === "boolean" ? Number(row[outcomeKey]) : row[outcomeKey]) - classMean));
    right.push(...classRight.map((row) => (typeof row[outcomeKey] === "boolean" ? Number(row[outcomeKey]) : row[outcomeKey]) - classMean));
  }
  return { ...normalDifference(left, right), nLeft: left.length, nRight: right.length, classCounts };
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    className: snapshot.className,
    level: snapshot.level,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatBuildScore: snapshot.combatBuildScore,
    resistanceScore: snapshot.resistanceScore,
    coreIds: snapshot.coreIds ?? [],
    supportAffixes: snapshot.supportAffixes ?? [],
    effectiveAffixes: snapshot.effectiveAffixes ?? [],
  };
}

function compactBossEncounter(encounter) {
  if (!encounter) return null;
  return {
    result: encounter.result,
    startBuild: compactSnapshot(encounter.startBuild),
    rounds: (encounter.rounds ?? []).map((round) => ({
      result: round.result,
      action: round.action,
      spellName: round.spellName,
      log: (round.log ?? []).filter((entry) => typeof entry === "string"),
      hpBefore: round.hpBefore,
      hpAfter: round.hpAfter,
      maxHp: round.maxHp,
      mpBefore: round.mpBefore,
      mpAfter: round.mpAfter,
    })),
  };
}

function findFloorSnapshot(result, floor) {
  return (result.diagnostics?.buildSnapshots ?? []).find(
    (snapshot) => snapshot.floor === floor && snapshot.point === "floor-start",
  );
}

function runQualityTask(task, context) {
  const { className, runIndex } = task;
  resetSimulationRandom(hashSeed(`${SEED}:${SCENARIO_ID}:${runIndex}`));
  const result = simulateRun({
    className,
    startFloor: 1,
    targetDepth: 21,
    runIndex,
    seriesId: "issue271-revalidation",
    scoringProfile: context.scoringProfile,
    scenario: context.scenario,
    workshop: context.scenario.workshop,
    collectDiagnostics: true,
  });
  const b5 = findFloorSnapshot(result, B5);
  const b6 = findFloorSnapshot(result, B5 + 1);
  const deathLog = result.diagnostics?.deathLogs?.at(-1) ?? null;
  const rawDeathFloor = Number(deathLog?.floor || result.terminationFloor || result.reachedFloor || 1);
  const deathFloor = result.died ? Math.max(1, Math.min(20, rawDeathFloor)) : null;
  const bossEncounters = (result.diagnostics?.encounters ?? [])
    .filter((encounter) => encounter.floor === B5 && encounter.type === "boss")
    .map(compactBossEncounter);
  const bossBattles = (result.specialBattles ?? [])
    .filter((battle) => battle.type === "boss" && battle.floor === B5)
    .map((battle) => ({ result: battle.finalResult, attempts: battle.attempts }));
  return {
    runIndex,
    className,
    depth: result.depth ?? result.reachedDepth ?? result.reachedFloor ?? 0,
    died: Boolean(result.died),
    fatalSource: result.fatalSource ?? null,
    deathEncounterType: result.deathEncounterType ?? null,
    terminationReason: result.terminationReason ?? null,
    b5: compactSnapshot(b5),
    b6: compactSnapshot(b6),
    b5Breakthrough: Boolean(b6),
    b5Death: deathFloor === B5,
    deathFloor: Number.isFinite(deathFloor) ? deathFloor : null,
    b5BossWin: bossBattles.some((battle) => battle.result === "victory"),
    b5BossBattles: bossBattles,
    b5BossEncounters: bossEncounters,
    coreObservations: result.coreObservations ?? {},
    coreEncounteredIds: result.coreEncounteredIds ?? [],
    coreEquipmentFoundById: result.coreEquipmentFoundById ?? {},
    supportAffixFoundById: result.supportAffixFoundById ?? {},
    coreDecisionReasons: result.coreDecisionReasons ?? {},
  };
}

function countLogActivations(entries, coreId) {
  const prefix = getCoreLogText(coreId);
  if (!prefix) return { events: 0, runs: 0 };
  let events = 0;
  const activationRuns = new Set();
  for (const { row, encounter } of entries) {
    let runEvents = 0;
    for (const round of encounter.rounds ?? []) {
      for (const log of round.log ?? []) {
        if (log.includes(prefix)) {
          events += 1;
          runEvents += 1;
        }
      }
    }
    if (runEvents > 0) activationRuns.add(row.runIndex);
  }
  return { events, runs: activationRuns.size };
}

function countBloodWandBossOpportunities(entries) {
  const spellByClass = { Priest: "BADIOS", Mage: "HALITO" };
  let opportunities = 0;
  for (const { row, encounter } of entries) {
    const spellName = spellByClass[row.className];
    const spellCost = SPELLS[spellName]?.cost;
    if (!spellCost) continue;
    for (const round of encounter.rounds ?? []) {
      if (
        round.action === "fight" &&
        Number(round.mpBefore) < spellCost &&
        Number(round.hpBefore) >= spellCost * 2
      ) {
        opportunities += 1;
      }
    }
  }
  return opportunities;
}

function coreStats(rows, coreId) {
  const entrants = rows.filter((row) => row.b5);
  const equipped = entrants.filter((row) => row.b5.coreIds.includes(coreId));
  const bossEligible = equipped.flatMap((row) =>
    row.b5BossEncounters.map((encounter) => ({ row, encounter })),
  );
  const activation = countLogActivations(bossEligible, coreId);
  const allRunEncountered = entrants.filter((row) => row.coreEncounteredIds.includes(coreId)).length;
  const allRunFound = entrants.reduce(
    (sum, row) => sum + Number(row.coreEquipmentFoundById[coreId] ?? 0),
    0,
  );
  const supportFound = entrants.reduce(
    (sum, row) => sum + SUPPORT_BY_CORE[coreId]?.reduce(
      (inner, supportId) => inner + Number(row.supportAffixFoundById[supportId] ?? 0),
      0,
    ),
    0,
  );
  const breakthrough = equipped.filter((row) => row.b5Breakthrough).length;
  const without = entrants.filter((row) => !row.b5.coreIds.includes(coreId));
  const matched = equipped.filter((row) => hasMatchedSupport(row.b5)).length;
  return {
    coreId,
    hook: CORE_HOOKS[coreId] ?? "未分類",
    enabled: ENABLED_CORE_IDS.includes(coreId),
    b5EquipN: equipped.length,
    b5EquipRate: wilson(equipped.length, entrants.length),
    b5BreakthroughN: breakthrough,
    b5BreakthroughRate: wilson(breakthrough, equipped.length),
    b5MatchedN: matched,
    b5MatchedRate: wilson(matched, equipped.length),
    withoutBreakthroughRate: wilson(without.filter((row) => row.b5Breakthrough).length, without.length),
    b5BossEncounterN: bossEligible.length,
    b5BossRunN: new Set(bossEligible.map(({ row }) => row.runIndex)).size,
    b5BossActivation: activation,
    b5BossBloodWandOpportunities: coreId === "CORE_BLOOD_WAND"
      ? countBloodWandBossOpportunities(bossEligible)
      : 0,
    runBloodWandOpportunities: coreId === "CORE_BLOOD_WAND"
      ? equipped.reduce((sum, row) => sum + Number(row.coreObservations.bloodWandSpellOpportunities ?? 0), 0)
      : 0,
    runPurifyTagKills: coreId === "CORE_PURIFY_RING"
      ? equipped.reduce((sum, row) => sum + Number(row.coreObservations.purifyTagKills ?? 0), 0)
      : 0,
    runPurifyKillsWithMpRoom: coreId === "CORE_PURIFY_RING"
      ? equipped.reduce((sum, row) => sum + Number(row.coreObservations.purifyKillsWithMpRoom ?? 0), 0)
      : 0,
    allRunEncounteredN: allRunEncountered,
    allRunEquipmentFound: allRunFound,
    matchingSupportObserved: supportFound,
    decisionReasons: entrants.reduce((counts, row) => {
      const reasons = row.coreDecisionReasons[coreId] ?? [];
      for (const reason of reasons) counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

function assignQuartiles(rows) {
  const byClass = new Map();
  for (const row of rows) {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  }
  const quartileByRun = new Map();
  for (const classRows of byClass.values()) {
    const sorted = [...classRows].sort((left, right) => left.b5.combatBuildScore - right.b5.combatBuildScore);
    sorted.forEach((row, index) => {
      quartileByRun.set(row.runIndex, Math.min(3, Math.floor((index * 4) / sorted.length)) + 1);
    });
  }
  return rows.map((row) => ({ ...row, qualityQuartile: quartileByRun.get(row.runIndex) }));
}

function hasSupport(snapshot, supportId) {
  if (!snapshot) return false;
  if (Array.isArray(snapshot.supportAffixes)) return snapshot.supportAffixes.includes(supportId);
  return Number(snapshot.supportAffixes?.[supportId] ?? 0) > 0;
}

function hasMatchedSupport(snapshot) {
  return snapshot?.coreIds?.some((coreId) =>
    (SUPPORT_BY_CORE[coreId] ?? []).some((supportId) => hasSupport(snapshot, supportId)),
  ) ?? false;
}

function quartileStats(rows) {
  return [1, 2, 3, 4].map((quartile) => {
    const group = rows.filter((row) => row.qualityQuartile === quartile);
    const deaths = group.filter((row) => row.b5Death).length;
    const breakthroughs = group.filter((row) => row.b5Breakthrough).length;
    const bossWins = group.filter((row) => row.b5BossWin).length;
    return {
      quartile,
      n: group.length,
      scoreMean: group.reduce((sum, row) => sum + row.b5.combatBuildScore, 0) / group.length,
      scoreMin: Math.min(...group.map((row) => row.b5.combatBuildScore)),
      scoreMax: Math.max(...group.map((row) => row.b5.combatBuildScore)),
      b5Death: wilson(deaths, group.length),
      b5Breakthrough: wilson(breakthroughs, group.length),
      bossWin: wilson(bossWins, group.length),
    };
  });
}

function aggregate(rows) {
  const entrants = rows.filter((row) => row.b5);
  const withQuartile = assignQuartiles(entrants);
  const scoreDepth = fisherCorrelation(withQuartile, "combatBuildScore", "depth");
  const scoreBreakthrough = fisherCorrelation(withQuartile, "combatBuildScore", "b5Breakthrough");
  const scoreDeath = fisherCorrelation(withQuartile, "combatBuildScore", "b5Death");
  const scoreAugmentedSweep = [0, 5, 10, 15, 20].map((matchedBonus) => {
    const adjustedRows = withQuartile.map((row) => ({
      ...row,
      b5: {
        ...row.b5,
        augmentedScore: row.b5.combatBuildScore + (hasMatchedSupport(row.b5) ? matchedBonus : 0),
      },
    }));
    return {
      matchedBonus,
      depth: fisherCorrelation(adjustedRows, "augmentedScore", "depth"),
      death: fisherCorrelation(adjustedRows, "augmentedScore", "b5Death"),
      breakthrough: fisherCorrelation(adjustedRows, "augmentedScore", "b5Breakthrough"),
    };
  });
  const quartiles = quartileStats(withQuartile);
  const q4 = withQuartile.filter((row) => row.qualityQuartile === 4);
  const q1 = withQuartile.filter((row) => row.qualityQuartile === 1);
  const q4q1Death = normalDifference(q4.map((row) => Number(row.b5Death)), q1.map((row) => Number(row.b5Death)));
  const q4q1Breakthrough = normalDifference(
    q4.map((row) => Number(row.b5Breakthrough)),
    q1.map((row) => Number(row.b5Breakthrough)),
  );
  const core = classCenteredEffect(withQuartile, (row) => row.b5.coreIds.length > 0, "b5Breakthrough");
  const coreDeath = classCenteredEffect(withQuartile, (row) => row.b5.coreIds.length > 0, "b5Death");
  const coreDepth = classCenteredEffect(withQuartile, (row) => row.b5.coreIds.length > 0, "depth");
  const combatCorePredicate = (row) => row.b5.coreIds.some((coreId) => COMBAT_CORE_IDS.has(coreId));
  const combatCore = classCenteredEffect(withQuartile, combatCorePredicate, "b5Breakthrough");
  const combatCoreDeath = classCenteredEffect(withQuartile, combatCorePredicate, "b5Death");
  const combatCoreDepth = classCenteredEffect(withQuartile, combatCorePredicate, "depth");
  const matchedPredicate = (row) => hasMatchedSupport(row.b5);
  const matched = classCenteredEffect(withQuartile, matchedPredicate, "b5Breakthrough");
  const matchedDeath = classCenteredEffect(withQuartile, matchedPredicate, "b5Death");
  const matchedDepth = classCenteredEffect(withQuartile, matchedPredicate, "depth");
  const b5BossEncounterN = withQuartile.reduce((sum, row) => sum + row.b5BossEncounters.length, 0);
  const bossBattleRows = withQuartile.filter((row) => row.b5BossBattles.length > 0);
  const b5BossWins = bossBattleRows.filter((row) => row.b5BossWin).length;
  const b5DeathBySource = Object.fromEntries(
    ["trap", "normal", "boss", "elite", "other"].map((source) => {
      const count = withQuartile.filter((row) => row.b5Death && row.fatalSource === source).length;
      return [source, { count, rate: wilson(count, withQuartile.length) }];
    }),
  );
  return {
    entrantsN: withQuartile.length,
    b5Breakthrough: wilson(withQuartile.filter((row) => row.b5Breakthrough).length, withQuartile.length),
    b5Death: wilson(withQuartile.filter((row) => row.b5Death).length, withQuartile.length),
    b5BossEncounterN,
    b5BossBattleRunN: bossBattleRows.length,
    b5BossWin: wilson(b5BossWins, bossBattleRows.length),
    scoreDepth,
    scoreBreakthrough,
    scoreDeath,
    scoreAugmentedSweep,
    b5DeathBySource,
    quartiles,
    q4q1Death,
    q4q1Breakthrough,
    core,
    coreDeath,
    coreDepth,
    combatCore,
    combatCoreDeath,
    combatCoreDepth,
    matched,
    matchedDeath,
    matchedDepth,
    coreStats: CORE_IDS.map((coreId) => coreStats(withQuartile, coreId)),
  };
}

function printRate(rate) {
  if (rate.estimate === null) return "NA";
  return `${(rate.estimate * 100).toFixed(1)}% [${(rate.low * 100).toFixed(1)}, ${(rate.high * 100).toFixed(1)}]`;
}

function printEffect(effect) {
  if (effect.estimate === null) return "NA";
  return `${(effect.estimate * 100).toFixed(1)}pp [${(effect.low * 100).toFixed(1)}, ${(effect.high * 100).toFixed(1)}]`;
}

function printCorrelation(correlation) {
  if (correlation.r === null) return "NA";
  return `r=${correlation.r.toFixed(3)} [${correlation.low.toFixed(3)}, ${correlation.high.toFixed(3)}], N=${correlation.n}`;
}

async function main() {
  if (POLICY !== "threshold" && POLICY !== "never") {
    throw new Error(`FLEE_POLICY must be threshold or never: ${POLICY}`);
  }
  const scenarioForCalibration = { ...scenario, id: SCENARIO_ID };
  resetSimulationRandom(SEED);
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    scenarioForCalibration,
    "legacy",
    scenarioForCalibration.workshop,
  );
  resetSimulationRandom(SEED);
  const tasks = Array.from({ length: RUNS }, (_, runIndex) => ({
    runIndex,
    className: classNames[runIndex % classNames.length],
  }));
  const rows = await runSimTasks({
    tasks,
    context: { scenario: scenarioForCalibration, scoringProfile },
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runQualityTask",
    runTask: runQualityTask,
  });
  const summary = aggregate(rows);
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const resultPath = join(resultDir, `issue-271-quality-${POLICY}.rows.jsonl`);
  writeFileSync(resultPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");

  console.log(JSON.stringify({
    env: Object.fromEntries(
      [
        "SIM_SEED", "SIM_RUNS", "SIM_CALIBRATION_RUNS", "DEPARTURE_CRAFT_IDS", "TRAP_POLICY",
        "TRAP_AVOIDANCE_POLICY", "TRAP_DAMAGE_MULTIPLIER", "IDENTIFICATION_POLICY", "STATUS_CURE_POLICY",
        "STATUS_CURE_HP_THRESHOLD", "STATUS_CURE_MERCHANT_POLICY", "FLEE_POLICY", "FLEE_HP_THRESHOLD",
        "PORTAL_HP_THRESHOLD", "PORTAL_MAX_HEAL_POTIONS", "PORTAL_MIN_FLOOR", "ELITE_POLICY", "SIM_SCENARIOS",
      ].map((key) => [key, process.env[key]]),
    ),
    scenario: { id: SCENARIO_ID, workshop: scenarioForCalibration.workshop, classes: classNames },
    coreCatalog: { total: CORE_IDS.length, enabled: ENABLED_CORE_IDS.length, directDefense: 0 },
    rawRowsPath: resultPath,
    summary,
  }, null, 2));
}

if (isMainThread) await main();

export { runQualityTask };
