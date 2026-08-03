// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  DEPTH_SCENARIOS,
  SIM_CLASSES,
  simulateRun,
  DEFAULT_TRAP_POLICY_ID
} = await import("./sim_depth_material_ev.js");
const {
  WORKSHOP_NODES
} = await import("../src/data/workshop.js");
const { CRAFT_RECIPES } = await import("../src/craft.js");
const {
  getWorkshopNodeCost,
  getWorkshopRank,
  getWorkshopGrants,
  purchaseWorkshopNode
} = await import("../src/systems/workshop.js");
const { generateEncounter } = await import("../src/combat_ui/encounter.js");
const {
  getLegacyMonsterGroupClassification,
  getMonsterGroupClassification,
  spendMaterials
} = await import("../src/rules/material_rules.js");
const { MONSTERS } = await import("../src/data/monsters.js");
const {
  getDepartureCraftCost: summarizeDepartureCraftCost,
  getDepartureCraftPaymentTotal,
  getDepartureCraftRecipePayment,
  spendDepartureCraftRecipes
} = await import("../src/rules/craft_rules.js");

const TRIALS = Math.max(1, Number(process.env.PROGRESSION_TRIALS || 50));
const RUNS_PER_TRIAL = Math.max(1, Number(process.env.PROGRESSION_RUNS || 50));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.PROGRESSION_CALIBRATION_RUNS || 100)
);
const BASE_SEED = Number(process.env.PROGRESSION_SEED || 278234) >>> 0;
const POST_WING_TARGET = Math.max(6, Number(process.env.PROGRESSION_POST_WING_TARGET || 20));
const MATERIALS = [
  "霊粉",
  "魔石片",
  "獣の牙",
  "硬い皮",
  "毒腺",
  "骨片",
  "呪布",
  "黒角",
  "鉄片",
  "竜鱗"
];
const ENCOUNTER_GROUPS = [
  "beast",
  "poison",
  "undead",
  "spirit",
  "caster",
  "armor",
  "demon",
  "dragon"
];
const ENCOUNTER_BANDS = ["B1-5", "B6-10", "B11-15", "B16-20"];
const ENCOUNTER_SAMPLES_PER_FLOOR = Math.max(
  100,
  Number(process.env.PROGRESSION_ENCOUNTER_SAMPLES || 10000)
);
const CRAFT_RECIPE_ORDER = [
  "TOWN_PORTAL",
  "HEAL_POTION",
  "ANTIDOTE",
  "TRAP_KIT",
  "IDENTIFY_POWDER",
  "GUARD_POTION",
  "HOLY_WATER",
  "MANA_POTION",
  "GREATER_HEAL"
];
const CRAFT_PRIORITY_MODES = new Set(["wing-first", "cheap-first"]);
const CRAFT_PRIORITY = process.env.PROGRESSION_CRAFT_PRIORITY || "wing-first";
if (!CRAFT_PRIORITY_MODES.has(CRAFT_PRIORITY)) {
  throw new Error(
    `PROGRESSION_CRAFT_PRIORITY must be ${[...CRAFT_PRIORITY_MODES].join("|")}: ${CRAFT_PRIORITY}`
  );
}
const DEFAULT_WING_COST_SWEEP = [6, 8, 10, 11, 12, 14, 16];
const DEFAULT_POWDER_COST_SWEEP = [4, 5, 6, 7, 8, 10];
const DEFAULT_WORKSHOP_COST_SWEEP = [5, 6, 7, 8, 10];
const DEFAULT_RARE_MATERIAL_FLOOR_SWEEP = [3, 4, 5, 6, 8, 10];
const DEFAULT_CHEST_MATERIAL_PROFILE_SWEEP = ["default", "early-rare", "early-balanced"];
const DEFAULT_SECONDARY_MATERIAL_PROFILE_SWEEP = ["default", "arcane", "magic", "magic-poison", "scarce"];
const PROGRESSION_POLICIES = new Set([
  "craft-first",
  "workshop-first",
  "workshop-complete"
]);
const PROGRESSION_POLICY = process.env.PROGRESSION_POLICY || "workshop-first";
if (!PROGRESSION_POLICIES.has(PROGRESSION_POLICY)) {
  throw new Error(
    `PROGRESSION_POLICY must be ${[...PROGRESSION_POLICIES].join("|")}: ${PROGRESSION_POLICY}`
  );
}

function parseNumberSweep(value, fallback) {
  const values = (value || fallback.join(","))
    .split(",")
    .map(entry => Math.floor(Number(entry.trim())))
    .filter(Number.isFinite)
    .filter(entry => entry >= 0);
  return [...new Set(values)].sort((left, right) => left - right);
}

const WING_COST_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_WING_COSTS,
  DEFAULT_WING_COST_SWEEP
);
const POWDER_COST_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_POWDER_COSTS,
  DEFAULT_POWDER_COST_SWEEP
);
const WORKSHOP_COST_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_WORKSHOP_COSTS,
  DEFAULT_WORKSHOP_COST_SWEEP
);
const RARE_MATERIAL_FLOOR_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_RARE_MATERIAL_FLOORS,
  DEFAULT_RARE_MATERIAL_FLOOR_SWEEP
);
const CHEST_MATERIAL_PROFILE_SWEEP = (process.env.PROGRESSION_CHEST_MATERIAL_PROFILES ||
  DEFAULT_CHEST_MATERIAL_PROFILE_SWEEP.join(","))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const SECONDARY_MATERIAL_PROFILE_SWEEP = (process.env.PROGRESSION_SECONDARY_MATERIAL_PROFILES ||
  DEFAULT_SECONDARY_MATERIAL_PROFILE_SWEEP.join(","))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const PORTAL_BASE_RECIPE = CRAFT_RECIPES.find(recipe => recipe.resultId === "TOWN_PORTAL");
const PORTAL_BASE_TOTAL = getDepartureCraftPaymentTotal(PORTAL_BASE_RECIPE);
const REFERENCE_WING_COST = PORTAL_BASE_TOTAL;
const IDENTIFY_POWDER_RECIPE = CRAFT_RECIPES.find(
  recipe => recipe.resultId === "IDENTIFY_POWDER"
);
const REFERENCE_POWDER_COST = getDepartureCraftPaymentTotal(IDENTIFY_POWDER_RECIPE);
const ADDED_WORKSHOP_NODE_IDS = new Set([
  "pool_opener",
  "pool_trap_eater",
  "pool_giant_slayer",
  "pool_thorn_shield",
  "pool_tomb_raider",
  "pool_scholar_eye"
]);

const STAT_NODE_IDS = WORKSHOP_NODES
  .filter(node => node.category === "permanentStats")
  .map(node => node.id);
const OTHER_NODE_IDS = WORKSHOP_NODES
  .filter(node => !STAT_NODE_IDS.includes(node.id))
  .map(node => node.id);
const PROGRESSION_SCENARIO = {
  ...DEPTH_SCENARIOS.find(scenario => scenario.id === "workshop-empty-no-portal"),
  id: "workshop-progression",
  label: "工房進行",
  useTownPortal: true
};

function totalMaterials(materials) {
  return MATERIALS.reduce((sum, material) => sum + (materials?.[material] || 0), 0);
}

function createEncounterGroupCounts() {
  return Object.fromEntries(
    ENCOUNTER_BANDS.map(band => [
      band,
      Object.fromEntries(ENCOUNTER_GROUPS.map(group => [group, 0]))
    ])
  );
}

function createMaterialCountsBySource() {
  return Object.fromEntries(
    ["combat", "chest", "quest", "other"].map(source => [
      source,
      Object.fromEntries(MATERIALS.map(material => [material, 0]))
    ])
  );
}

function addNestedCounts(target, additions) {
  Object.entries(additions || {}).forEach(([key, values]) => {
    target[key] ||= {};
    Object.entries(values || {}).forEach(([name, amount]) => {
      target[key][name] = (target[key][name] || 0) + amount;
    });
  });
}

function addMaterialCountsBySource(target, additions) {
  Object.entries(additions || {}).forEach(([source, materials]) => {
    target[source] ||= emptyMaterials();
    addMaterials(target[source], materials);
  });
}

function mergeEncounterFallbacks(target, additions) {
  (additions || []).forEach(fallback => {
    const current = target[fallback.name] || {
      ...fallback,
      groups: {},
      count: 0
    };
    current.count += fallback.count || 0;
    Object.entries(fallback.groups || {}).forEach(([group, amount]) => {
      current.groups[group] = (current.groups[group] || 0) + amount;
    });
    current.minFloor = Math.min(current.minFloor, fallback.minFloor);
    current.maxFloor = Math.max(current.maxFloor, fallback.maxFloor);
    target[fallback.name] = current;
  });
}

function createDiagnosticRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sampleEncounterGroupDistribution() {
  const counts = createEncounterGroupCounts();
  const fallbacks = {};
  const rng = createDiagnosticRandom(BASE_SEED ^ 0x380380);
  const state = { floor: 1 };
  for (let floor = 1; floor <= 20; floor++) {
    state.floor = floor;
    const band = ENCOUNTER_BANDS[Math.min(3, Math.floor((floor - 1) / 5))];
    for (let sample = 0; sample < ENCOUNTER_SAMPLES_PER_FLOOR; sample++) {
      const { monsters } = generateEncounter(state, false, false, false, null, rng);
      monsters.forEach(monster => {
        const classification = getMonsterGroupClassification(monster);
        counts[band][classification.group]++;
        if (classification.source !== "fallback") return;
        const name = String(monster.name || "").replace(/\s[A-Z]$/, "");
        const current = fallbacks[name] || {
          name,
          tags: [...(monster.tags || [])],
          spriteType: monster.spriteType || "",
          groups: {},
          count: 0,
          minFloor: floor,
          maxFloor: floor
        };
        current.count++;
        current.groups[classification.group] = (current.groups[classification.group] || 0) + 1;
        current.minFloor = Math.min(current.minFloor, floor);
        current.maxFloor = Math.max(current.maxFloor, floor);
        fallbacks[name] = current;
      });
    }
  }
  return { counts, fallbacks };
}

function formatGroupDistribution(groups) {
  const total = Object.values(groups).reduce((sum, amount) => sum + amount, 0);
  return ENCOUNTER_GROUPS
    .map(group => `${group}=${groups[group]} (${formatRate(groups[group] / Math.max(1, total))})`)
    .join(", ");
}

function printEncounterGroupDiagnostics(result) {
  const sampled = sampleEncounterGroupDistribution();
  console.log(
    `\n【通常遭遇サンプル / floorごと${ENCOUNTER_SAMPLES_PER_FLOOR}回 / seed=${BASE_SEED ^ 0x380380}】`
  );
  ENCOUNTER_BANDS.forEach(band => {
    console.log(`  ${band}: ${formatGroupDistribution(sampled.counts[band])}`);
  });
  console.log("fallback一覧（名前 / tags / spriteType / 群）:");
  Object.values(sampled.fallbacks)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .forEach(monster => {
      console.log(
        `  ${monster.name} / tags=${monster.tags.join(",") || "-"} / ` +
        `spriteType=${monster.spriteType || "-"} / ` +
        `group=${Object.keys(monster.groups).join(",")} / ` +
        `n=${monster.count} / floor=${monster.minFloor}-${monster.maxFloor}`
      );
    });
  console.log("実run遭遇群（reference scenario）:");
  ENCOUNTER_BANDS.forEach(band => {
    console.log(`  ${band}: ${formatGroupDistribution(result.totals.encounterGroupCounts[band])}`);
  });
  console.log("実run fallback一覧:");
  Object.values(result.totals.encounterFallbacks)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .forEach(monster => {
      console.log(
        `  ${monster.name} / tags=${monster.tags.join(",") || "-"} / ` +
        `spriteType=${monster.spriteType || "-"} / ` +
        `group=${Object.keys(monster.groups).join(",")} / ` +
        `n=${monster.count} / floor=${monster.minFloor}-${monster.maxFloor}`
      );
    });
}

function emptyMaterials() {
  return Object.fromEntries(MATERIALS.map(material => [material, 0]));
}

function addMaterials(target, additions) {
  MATERIALS.forEach(material => {
    target[material] = (target[material] || 0) + (additions?.[material] || 0);
  });
  return target;
}

function cloneWorkshop(workshop) {
  return { ranks: { ...(workshop?.ranks || {}) } };
}

function getNodeMaxRank(node) {
  return node?.maxRank || 1;
}

function isStandardWorkshopComplete(workshop) {
  return WORKSHOP_NODES.every(node =>
    getWorkshopRank(workshop, node.id) >= getNodeMaxRank(node)
  );
}

function getRemainingDemand(workshop) {
  const demand = emptyMaterials();
  WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    for (let index = rank; index < getNodeMaxRank(node); index++) {
      addMaterials(demand, getWorkshopNodeCost(node, index));
    }
  });
  return demand;
}

function summarizeWorkshopState(workshop) {
  const ranks = WORKSHOP_NODES
    .map(node => [node.id, getWorkshopRank(workshop, node.id)])
    .filter(([, rank]) => rank > 0);
  const grants = getWorkshopGrants(workshop);
  const totalSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  const purchasedSteps = ranks.reduce((sum, [, rank]) => sum + rank, 0);
  const phase = purchasedSteps === 0
    ? "empty"
    : purchasedSteps === totalSteps
      ? "complete"
      : grants.affixIds.some(coreId => [
            "CORE_OPENER",
            "CORE_TRAP_EATER",
            "CORE_GIANT_SLAYER",
            "CORE_THORN_SHIELD",
            "CORE_TOMB_RAIDER",
            "CORE_SCHOLAR_EYE"
          ].includes(coreId))
        ? "core-pools-in-progress"
        : grants.spellIds.length > 0
          ? "blood-wand+deep-spells"
          : grants.affixIds.includes("CORE_BLOOD_WAND")
            ? "blood-wand-unlocked"
            : grants.startingGear.length > 0
              ? "starting-gear-unlocked"
              : "stats-in-progress";
  return {
    signature: ranks.map(([nodeId, rank]) => `${nodeId}=${rank}`).join(",") || "empty",
    purchasedSteps,
    phase,
    ranks,
    grants: {
      stats: { ...grants.stats },
      startingGear: [...grants.startingGear],
      affixIds: [...grants.affixIds],
      spellIds: [...grants.spellIds],
      identifyPowder: grants.identifyPowder,
      returnItems: [...grants.returnItems]
    }
  };
}

function getNodeCost(nodeId, workshop, scenario = null) {
  const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
  if (!node) return null;
  const rank = getWorkshopRank(workshop, nodeId);
  const sourceCost = getWorkshopNodeCost(node, rank);
  if (
    !sourceCost ||
    !scenario ||
    !Number.isFinite(scenario.workshopCostOverride) ||
    !ADDED_WORKSHOP_NODE_IDS.has(nodeId) ||
    rank > 0
  ) return sourceCost;
  return scaleCostToTotal(sourceCost, scenario.workshopCostOverride);
}

function purchaseStandardAvailable(initialBank, initialWorkshop, scenario = null) {
  let bank = { ...initialBank };
  let workshop = cloneWorkshop(initialWorkshop);
  const spent = emptyMaterials();
  const purchasedNodeIds = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of [...STAT_NODE_IDS, ...OTHER_NODE_IDS]) {
      const cost = getNodeCost(nodeId, workshop, scenario);
      if (!cost) continue;
      const result = scenario?.workshopCostOverride !== undefined &&
        ADDED_WORKSHOP_NODE_IDS.has(nodeId)
        ? (() => {
            const balance = spendMaterials(bank, cost);
            if (!balance) return { ok: false };
            return {
              ok: true,
              metaMaterials: balance,
              workshop: {
                ...workshop,
                ranks: {
                  ...(workshop?.ranks || {}),
                  [nodeId]: getWorkshopRank(workshop, nodeId) + 1
                }
              }
            };
          })()
        : purchaseWorkshopNode(bank, workshop, nodeId);
      if (!result.ok) continue;
      bank = result.metaMaterials;
      workshop = result.workshop;
      addMaterials(spent, cost);
      purchasedNodeIds.push(nodeId);
      changed = true;
    }
  }
  return { bank, workshop, spent, purchasedNodeIds };
}

function scaleCostToTotal(baseCost, targetTotal) {
  const target = Math.max(0, Math.floor(Number(targetTotal) || 0));
  if (target === totalMaterials(baseCost)) return { ...baseCost };
  const entries = Object.entries(baseCost);
  if (entries.length === 0) return {};
  let remaining = target;
  const scaled = {};
  entries.forEach(([material, quantity], index) => {
    if (index === entries.length - 1) {
      scaled[material] = remaining;
      return;
    }
    const amount = Math.max(
      0,
      Math.min(remaining, Math.round((quantity / totalMaterials(baseCost)) * target))
    );
    scaled[material] = amount;
    remaining -= amount;
  });
  return scaled;
}

function getScenarioRecipeIds(scenario) {
  return [...(scenario.recipeIds || [])];
}

function getScenarioRecipe(scenario, recipeId) {
  const sourceRecipe = CRAFT_RECIPES.find(recipe => recipe.resultId === recipeId);
  if (!sourceRecipe) return null;
  if (scenario.wingCostOverride && recipeId === "TOWN_PORTAL") {
    const payment = getDepartureCraftRecipePayment(sourceRecipe);
    if (payment.mode === "any") {
      return {
        ...sourceRecipe,
        departureCost: { mode: "any", total: scenario.wingCostOverride }
      };
    }
    return {
      ...sourceRecipe,
      mats: scaleCostToTotal(sourceRecipe.mats, scenario.wingCostOverride)
    };
  }
  if (scenario.powderCostOverride && recipeId === "IDENTIFY_POWDER") {
    const payment = getDepartureCraftRecipePayment(sourceRecipe);
    if (payment.mode === "any") {
      return {
        ...sourceRecipe,
        departureCost: { mode: "any", total: scenario.powderCostOverride }
      };
    }
    return {
      ...sourceRecipe,
      mats: scaleCostToTotal(sourceRecipe.mats, scenario.powderCostOverride)
    };
  }
  return sourceRecipe;
}

function getScenarioCraftCost(scenario, recipeIds = getScenarioRecipeIds(scenario)) {
  return summarizeDepartureCraftCost(
    recipeIds.map(recipeId => getScenarioRecipe(scenario, recipeId)).filter(Boolean)
  );
}

function getSimulationCraftBank(scenario, recipeIds = getScenarioRecipeIds(scenario)) {
  const sourceRecipes = recipeIds
    .map(recipeId => CRAFT_RECIPES.find(recipe => recipe.resultId === recipeId))
    .filter(Boolean);
  const sourceCost = summarizeDepartureCraftCost(sourceRecipes);
  const scenarioCost = getScenarioCraftCost({ ...scenario, recipeIds });
  const bank = { ...sourceCost.typed, ...scenarioCost.typed };
  if (sourceCost.any > 0 || scenarioCost.any > 0) {
    bank["獣の牙"] = (bank["獣の牙"] || 0) + Math.max(sourceCost.any, scenarioCost.any);
  }
  MATERIALS.forEach(material => {
    bank[material] = Math.max(
      bank[material] || 0,
      sourceCost.typed[material] || 0,
      scenarioCost.typed[material] || 0
    );
  });
  return bank;
}

function emptyCraftPurchase() {
  return {
    purchased: false,
    cost: {},
    balance: null,
    recipeIds: [],
    attempts: {},
    shortages: {},
    shortageMaterials: {}
  };
}

function getCraftPriorityRecipeIds(scenario, priority = CRAFT_PRIORITY) {
  const recipeIds = getScenarioRecipeIds(scenario);
  if (priority === "wing-first") return recipeIds;
  return recipeIds
    .map((recipeId, index) => ({
      recipeId,
      index,
      cost: getDepartureCraftPaymentTotal(getScenarioRecipe(scenario, recipeId))
    }))
    .sort((left, right) => left.cost - right.cost || left.index - right.index)
    .map(entry => entry.recipeId);
}

export function purchaseCraftFromBank(bank, scenario, priority = CRAFT_PRIORITY) {
  const recipeIds = getScenarioRecipeIds(scenario);
  if (recipeIds.length === 0) {
    return emptyCraftPurchaseWithBalance(bank);
  }
  let balance = { ...bank };
  const selectedRecipeIds = [];
  const cost = {};
  const attempts = {};
  const shortages = {};
  const shortageMaterials = {};
  const priorityRecipeIds = getCraftPriorityRecipeIds(scenario, priority);
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const recipeId of priorityRecipeIds) {
      attempts[recipeId] = (attempts[recipeId] || 0) + 1;
      const recipe = getScenarioRecipe(scenario, recipeId);
      if (!recipe) throw new Error(`craft sweep recipe validation failed: ${recipeId}`);
      const payment = getDepartureCraftRecipePayment(recipe);
      const candidateRecipeIds = [...selectedRecipeIds, recipeId];
      const purchase = spendDepartureCraftRecipes(
        bank,
        candidateRecipeIds.map(candidateId => getScenarioRecipe(scenario, candidateId))
      );
      // UIと同じく、払えない品を飛ばしながら優先順位を周回する。
      if (!purchase) {
        shortages[recipeId] = (shortages[recipeId] || 0) + 1;
        if (payment.mode === "any") {
          if (!shortageMaterials[recipeId]) shortageMaterials[recipeId] = {};
          shortageMaterials[recipeId]["種別不問合計"] =
            (shortageMaterials[recipeId]["種別不問合計"] || 0) + 1;
        } else {
          Object.entries(payment.mats).forEach(([material, quantity]) => {
            if ((balance[material] || 0) >= quantity) return;
            if (!shortageMaterials[recipeId]) shortageMaterials[recipeId] = {};
            shortageMaterials[recipeId][material] =
              (shortageMaterials[recipeId][material] || 0) + 1;
          });
        }
        continue;
      }
      balance = purchase.balance;
      selectedRecipeIds.push(recipeId);
      Object.assign(cost, purchase.spent);
      madeProgress = true;
    }
  }
  if (selectedRecipeIds.length === 0) {
    return {
      ...emptyCraftPurchaseWithBalance(bank),
      attempts,
      shortages,
      shortageMaterials
    };
  }
  return {
    purchased: true,
    cost,
    balance,
    recipeIds: selectedRecipeIds,
    attempts,
    shortages,
    shortageMaterials
  };
}

function emptyCraftPurchaseWithBalance(bank) {
  return { ...emptyCraftPurchase(), balance: { ...bank } };
}

function createScenarioList() {
  const scenarios = [
    {
      id: "craft-off",
      label: "出発クラフトなし（宝箱・商人のみ）",
      recipeIds: [],
      allowChestTownPortal: true
    },
    {
      id: "merchant-only",
      label: "出発クラフトなし（商人のみ）",
      recipeIds: [],
      allowChestTownPortal: false
    }
  ];
  scenarios.push({
    id: "unlimited-reference",
    label: `分類修正のみ（旧配分、翼コスト=${REFERENCE_WING_COST}）`,
    recipeIds: [...CRAFT_RECIPE_ORDER],
    allowChestTownPortal: true,
    comparisonSeries: "material-reference",
    sweep: "reference",
    isReference: true
  });
  scenarios.push({
    id: "material-baseline",
    label: "分類修正のみ baseline（旧配分・比較用）",
    recipeIds: [...CRAFT_RECIPE_ORDER],
    materialDropOverride: {
      chestMaterialProfile: "default",
      secondaryMaterialProfile: "default"
    },
    allowChestTownPortal: true,
    comparisonSeries: "material-reference",
    sweep: "material-baseline"
  });
  WING_COST_SWEEP.forEach(wingCost => {
    scenarios.push({
      id: `wing-${wingCost}`,
      label: `出発クラフト 翼コスト=${wingCost}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      wingCostOverride: wingCost,
      allowChestTownPortal: true,
      sweep: "wing-cost"
    });
  });
  POWDER_COST_SWEEP.forEach(powderCost => {
    scenarios.push({
      id: `powder-${powderCost}`,
      label: `出発クラフト 鑑定粉コスト=${powderCost}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      powderCostOverride: powderCost,
      allowChestTownPortal: true,
      sweep: "powder-cost"
    });
  });
  WORKSHOP_COST_SWEEP.forEach(workshopCost => {
    scenarios.push({
      id: `workshop-cost-${workshopCost}`,
      label: `追加工房ノード初段コスト=${workshopCost}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      workshopCostOverride: workshopCost,
      allowChestTownPortal: true,
      sweep: "workshop-cost"
    });
  });
  RARE_MATERIAL_FLOOR_SWEEP.forEach(rareMaterialFloor => {
    scenarios.push({
      id: `rare-material-floor-${rareMaterialFloor}`,
      label: `竜鱗ゲート floor>=${rareMaterialFloor}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      materialDropOverride: { rareMaterialFloor },
      allowChestTownPortal: true,
      sweep: "rare-material-floor"
    });
  });
  CHEST_MATERIAL_PROFILE_SWEEP.forEach(chestMaterialProfile => {
    scenarios.push({
      id: `chest-material-profile-${chestMaterialProfile}`,
      label: `宝箱素材配分=${chestMaterialProfile}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      materialDropOverride: { chestMaterialProfile },
      allowChestTownPortal: true,
      sweep: "chest-material-profile"
    });
  });
  SECONDARY_MATERIAL_PROFILE_SWEEP.forEach(secondaryMaterialProfile => {
    scenarios.push({
      id: `secondary-material-profile-${secondaryMaterialProfile}`,
      label: `戦闘副素材配分=${secondaryMaterialProfile}`,
      recipeIds: [...CRAFT_RECIPE_ORDER],
      materialDropOverride: { secondaryMaterialProfile },
      allowChestTownPortal: true,
      sweep: "secondary-material-profile"
    });
  });
  scenarios.push({
    id: "rejected-material-profile",
    label: "不採用比較（宝箱early-rare＋戦闘magic-poison）",
    recipeIds: [...CRAFT_RECIPE_ORDER],
    materialDropOverride: {
      chestMaterialProfile: "early-rare",
      secondaryMaterialProfile: "magic-poison"
    },
    allowChestTownPortal: true,
    comparisonSeries: "material-reference",
    sweep: "rejected-material-profile"
  });
  return scenarios;
}

const FINITE_PORTAL_SCENARIOS = createScenarioList();

function createFiniteTotals() {
  return {
    runs: 0,
    survived: 0,
    carried: 0,
    banked: 0,
    time: 0,
    reached: 0,
    reachedSquared: 0,
    reachedB5: 0,
    b5Breakthrough: 0,
    b5Deaths: 0,
    reachedB10: 0,
    b10Breakthrough: 0,
    b10Deaths: 0,
    reachedB15: 0,
    portalUses: 0,
    portalAcquisitions: {
      departureCraft: 0,
      workshop: 0,
      workshopSupply: 0,
      chest: 0,
      merchant: 0
    },
    portalUsesBySource: {},
    merchantAttempts: 0,
    merchantPurchases: 0,
    merchantFailures: {},
    craftPurchases: 0,
    craftItems: 0,
    craftItemsByRecipe: Object.fromEntries(CRAFT_RECIPE_ORDER.map(recipeId => [recipeId, 0])),
    craftRunsByRecipe: Object.fromEntries(CRAFT_RECIPE_ORDER.map(recipeId => [recipeId, 0])),
    craftAttemptsByRecipe: Object.fromEntries(CRAFT_RECIPE_ORDER.map(recipeId => [recipeId, 0])),
    craftShortagesByRecipe: Object.fromEntries(CRAFT_RECIPE_ORDER.map(recipeId => [recipeId, 0])),
    craftShortageMaterialsByRecipe: Object.fromEntries(
      CRAFT_RECIPE_ORDER.map(recipeId => [recipeId, emptyMaterials()])
    ),
    craftMaterialSpent: 0,
    craftSpentByMaterial: emptyMaterials(),
    materialAcquiredByMaterial: emptyMaterials(),
    materialBankedByMaterial: emptyMaterials(),
    materialConsumedByCraft: emptyMaterials(),
    materialConsumedByWorkshop: emptyMaterials(),
    materialConsumedByMerchant: emptyMaterials(),
    materialSourceCounts: createMaterialCountsBySource(),
    endingBankByMaterial: emptyMaterials(),
    endingBankSamples: [],
    encounterGroupCounts: createEncounterGroupCounts(),
    encounterFallbacks: {},
    healPotionsAcquired: 0,
    healPotionsConsumed: 0,
    healPotionsAcquiredBySource: {},
    healPotionsConsumedBySource: {},
    trapKitsAcquired: 0,
    trapKitsUsed: 0,
    trapKitsAcquiredBySource: {},
    trapKitsConsumedBySource: {},
    identificationPowderAcquired: 0,
    identificationPowderUsed: 0,
    identificationPowderAcquiredBySource: {},
    milestoneDecisions: 0,
    insuredMilestoneDecisions: 0,
    endingBankTotal: 0,
    surplusPerRun: 0,
    firstMerchantPurchaseRuns: [],
    standardCompleteRuns: [],
    workshopStepCounts: {},
    workshopStateCounts: {},
    workshopPhaseCounts: {},
    workshopPhaseSamples: {},
    workshopNodeAcquisitionCounts: Object.fromEntries(
      WORKSHOP_NODES.map(node => [node.id, 0])
    ),
    workshopNodeTrialCounts: Object.fromEntries(
      WORKSHOP_NODES.map(node => [node.id, 0])
    ),
    workshopNodeAcquisitionPositionSums: Object.fromEntries(
      WORKSHOP_NODES.map(node => [node.id, 0])
    )
  };
}

function addSourceCounts(target, additions) {
  Object.entries(additions || {}).forEach(([source, amount]) => {
    target[source] = (target[source] || 0) + amount;
  });
}

function printMonsterClassificationAudit() {
  console.log("全モンスター分類（旧→新）:");
  const changed = [];
  MONSTERS.forEach(monster => {
    const before = getLegacyMonsterGroupClassification(monster);
    const after = getMonsterGroupClassification(monster);
    const isChanged = before.group !== after.group;
    if (isChanged) changed.push({ monster, before, after });
    console.log(
      `${isChanged ? "*" : " "} ${monster.name} | ` +
      `tags=${monster.tags?.join(",") || "-"} | spriteType=${monster.spriteType || "-"} | ` +
      `${before.group}(${before.source}) -> ${after.group}(${after.source})`
    );
  });
  console.log(`分類変更=${changed.length}/${MONSTERS.length}`);
  console.log("分類変更個体:");
  changed.forEach(({ monster, before, after }) => {
    console.log(
      `  ${monster.name}: ${before.group} -> ${after.group} ` +
      `(tags=${monster.tags?.join(",") || "-"}, spriteType=${monster.spriteType || "-"})`
    );
  });
}

function addCounts(target, additions) {
  Object.entries(additions || {}).forEach(([key, amount]) => {
    target[key] = (target[key] || 0) + amount;
  });
}

function addCraftSpend(totals, cost) {
  totals.craftMaterialSpent += totalMaterials(cost);
  addMaterials(totals.craftSpentByMaterial, cost);
  addMaterials(totals.materialConsumedByCraft, cost);
}

function simulateFinitePortalTrial(trial, scenario, scoringProfile) {
  resetSimulationRandom(BASE_SEED + trial * 104729);
  let bank = emptyMaterials();
  let workshop = { ranks: {} };
  let pendingCraftPurchase = emptyCraftPurchase();
  let standardCompleteRun = null;
  let firstMerchantPurchaseRun = null;
  const bankTimeline = [];
  const events = [];

  for (let run = 1; run <= RUNS_PER_TRIAL; run++) {
    const bankAtStart = { ...bank };
    const workshopAtStart = cloneWorkshop(workshop);
    const workshopStateAtStart = summarizeWorkshopState(workshopAtStart);
    const standardCompleteAtStart = isStandardWorkshopComplete(workshop);
    const craftPurchase = pendingCraftPurchase;
    pendingCraftPurchase = emptyCraftPurchase();
    const className = SIM_CLASSES[(trial * RUNS_PER_TRIAL + run - 1) % SIM_CLASSES.length];
    const craftScenario = craftPurchase.purchased
      ? {
          departureCraft: craftPurchase.recipeIds,
          departureCraftCostOverride: craftPurchase.cost,
          // 外側で実bankから支払済み。ここはsimulateRun内の購入API検証用。
          departureCraftMaterials: getSimulationCraftBank(scenario, craftPurchase.recipeIds)
        }
      : {
          departureCraft: [],
          departureCraftMaterials: {}
        };
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: POST_WING_TARGET,
      runIndex: trial * RUNS_PER_TRIAL + run,
      seriesId: `finite-craft-${scenario.comparisonSeries || scenario.id}-${CRAFT_PRIORITY}`,
      scoringProfile,
      scenario: {
        ...PROGRESSION_SCENARIO,
        id: scenario.id,
        allowChestTownPortal: scenario.allowChestTownPortal,
        buyMerchantTownPortal: true,
        retreatAtMilestoneWithoutTownPortal: true,
        materialDropOverride: scenario.materialDropOverride || null,
        ...craftScenario
      },
      workshop
    });
    if (firstMerchantPurchaseRun === null && result.merchantWingsPurchased > 0) {
      firstMerchantPurchaseRun = run;
    }

    addMaterials(bank, result.bankedMaterialCounts);
    const bankAfterRun = { ...bank };
    let workshopSpent = emptyMaterials();
    let purchasedNodeIds = [];
    if (run < RUNS_PER_TRIAL) {
      if (PROGRESSION_POLICY === "craft-first") {
        pendingCraftPurchase = purchaseCraftFromBank(bank, scenario);
        if (pendingCraftPurchase.purchased) bank = pendingCraftPurchase.balance;
      }

      const purchaseResult = purchaseStandardAvailable(bank, workshop, scenario);
      bank = purchaseResult.bank;
      workshop = purchaseResult.workshop;
      workshopSpent = purchaseResult.spent;
      purchasedNodeIds = purchaseResult.purchasedNodeIds;

      const canCraftAfterWorkshop = PROGRESSION_POLICY === "workshop-first" ||
        (PROGRESSION_POLICY === "workshop-complete" && isStandardWorkshopComplete(workshop));
      if (canCraftAfterWorkshop) {
        pendingCraftPurchase = purchaseCraftFromBank(bank, scenario);
        if (pendingCraftPurchase.purchased) bank = pendingCraftPurchase.balance;
      }
    }
    if (standardCompleteRun === null && isStandardWorkshopComplete(workshop)) {
      standardCompleteRun = run;
    }
    bankTimeline.push(totalMaterials(bank));
    events.push({
      bankAtStart,
      bankAfterRun,
      bankAtEnd: { ...bank },
      workshopSpent,
      purchasedNodeIds: [...purchasedNodeIds],
      standardCompleteAtStart,
      craftPurchase,
      workshop: workshopAtStart,
      workshopState: workshopStateAtStart,
      result: {
        survived: result.survived,
        died: result.died,
        deathFloor: result.deathFloor,
        carriedMaterials: result.carriedMaterials,
        carriedMaterialCounts: { ...result.carriedMaterialCounts },
        bankedMaterials: result.bankedMaterials,
        bankedMaterialCounts: { ...result.bankedMaterialCounts },
        timeCost: result.timeCost,
        reachedFloor: result.reachedFloor,
        townPortalsUsed: result.townPortalsUsed,
        portalAcquisitions: result.portalAcquisitions,
        portalUsesBySource: result.portalUsesBySource,
        merchantWingAttempts: result.merchantWingAttempts,
        merchantWingsPurchased: result.merchantWingsPurchased,
        merchantWingFailures: result.merchantWingFailures,
        milestoneDecisions: result.milestoneDecisions,
        healPotionsAcquiredBySource: result.healPotionsAcquiredBySource,
        healPotionsConsumedBySource: result.healPotionsConsumedBySource,
        trapKitsAcquired: result.trapKitsAcquired,
        trapKitsUsed: result.trapKitsUsed,
        trapKitsAcquiredBySource: result.trapKitsAcquiredBySource,
        trapKitsConsumedBySource: result.trapKitsConsumedBySource,
        identificationPowderAcquired: result.identificationPowderAcquired,
        identificationPowderUsed: result.identificationPowderUsed,
        identificationPowderAcquiredBySource: result.identificationPowderAcquiredBySource,
        encounterGroupCounts: result.encounterGroupCounts,
        encounterFallbacks: result.encounterFallbacks,
        materialSourceCounts: result.materialSourceCounts,
        materialConsumedByMerchant: result.materialConsumedByMerchant
      }
    });
  }

  const halfway = Math.floor(RUNS_PER_TRIAL / 2);
  const halfwayBalance = halfway > 0 ? bankTimeline[halfway - 1] : 0;
  return {
    events,
    surplusPerRun:
      (bankTimeline.at(-1) - halfwayBalance) / Math.max(1, RUNS_PER_TRIAL - halfway),
    endingBankTotal: bankTimeline.at(-1),
    endingBankByMaterial: { ...bank },
    firstMerchantPurchaseRun,
    standardCompleteRun
  };
}

function aggregateFinitePortalScenario(scenario, trialResults) {
  const totals = createFiniteTotals();
  for (const trialResult of trialResults) {
    const trialNodeFirstPositions = new Map();
    let trialPurchasePosition = 0;
    trialResult.events.forEach(event => {
      const { result } = event;
      totals.runs++;
      totals.survived += Number(result.survived);
      totals.carried += result.carriedMaterials;
      totals.banked += result.bankedMaterials;
      totals.time += result.timeCost;
      totals.reached += result.reachedFloor;
      totals.reachedSquared += result.reachedFloor ** 2;
      totals.reachedB5 += Number(result.reachedFloor >= 5);
      totals.b5Breakthrough += Number(result.reachedFloor > 5);
      totals.b5Deaths += Number(result.deathFloor === 5);
      totals.reachedB10 += Number(result.reachedFloor >= 10);
      totals.b10Breakthrough += Number(result.reachedFloor > 10);
      totals.b10Deaths += Number(result.deathFloor === 10);
      totals.reachedB15 += Number(result.reachedFloor >= 15);
      const grossMaterialCounts = Object.values(result.materialSourceCounts || {})
        .reduce((materials, sourceCounts) => {
          addMaterials(materials, sourceCounts);
          return materials;
        }, emptyMaterials());
      addMaterials(totals.materialAcquiredByMaterial, grossMaterialCounts);
      addMaterials(totals.materialBankedByMaterial, result.bankedMaterialCounts);
      addMaterials(totals.materialConsumedByWorkshop, event.workshopSpent);
      addMaterials(totals.materialConsumedByMerchant, result.materialConsumedByMerchant);
      addMaterialCountsBySource(totals.materialSourceCounts, result.materialSourceCounts);
      addNestedCounts(totals.encounterGroupCounts, result.encounterGroupCounts);
      mergeEncounterFallbacks(totals.encounterFallbacks, result.encounterFallbacks);
      addCounts(totals.craftAttemptsByRecipe, event.craftPurchase.attempts);
      addCounts(totals.craftShortagesByRecipe, event.craftPurchase.shortages);
      Object.entries(event.craftPurchase.shortageMaterials).forEach(
        ([recipeId, materials]) => addCounts(
          totals.craftShortageMaterialsByRecipe[recipeId],
          materials
        )
      );
      totals.portalUses += result.townPortalsUsed;
      addSourceCounts(totals.portalUsesBySource, result.portalUsesBySource);
      Object.entries(result.portalAcquisitions).forEach(([source, amount]) => {
        totals.portalAcquisitions[source] =
          (totals.portalAcquisitions[source] || 0) + amount;
      });
      totals.merchantAttempts += result.merchantWingAttempts;
      totals.merchantPurchases += result.merchantWingsPurchased;
      Object.entries(result.merchantWingFailures).forEach(([reason, count]) => {
        totals.merchantFailures[reason] = (totals.merchantFailures[reason] || 0) + count;
      });
      totals.milestoneDecisions += result.milestoneDecisions.length;
      totals.insuredMilestoneDecisions += result.milestoneDecisions
        .filter(decision => decision.hasTownPortal)
        .length;
      if (event.craftPurchase.purchased) {
        totals.craftPurchases++;
        totals.craftItems += event.craftPurchase.recipeIds.length;
        event.craftPurchase.recipeIds.forEach(recipeId => {
          totals.craftItemsByRecipe[recipeId] = (totals.craftItemsByRecipe[recipeId] || 0) + 1;
        });
        [...new Set(event.craftPurchase.recipeIds)].forEach(recipeId => {
          totals.craftRunsByRecipe[recipeId] = (totals.craftRunsByRecipe[recipeId] || 0) + 1;
        });
        addCraftSpend(totals, event.craftPurchase.cost);
      }
      const acquiredHeal = Object.values(result.healPotionsAcquiredBySource)
        .reduce((sum, amount) => sum + amount, 0);
      const consumedHeal = Object.values(result.healPotionsConsumedBySource)
        .reduce((sum, amount) => sum + amount, 0);
      totals.healPotionsAcquired += acquiredHeal;
      totals.healPotionsConsumed += consumedHeal;
      addSourceCounts(totals.healPotionsAcquiredBySource, result.healPotionsAcquiredBySource);
      addSourceCounts(totals.healPotionsConsumedBySource, result.healPotionsConsumedBySource);
      totals.trapKitsAcquired += result.trapKitsAcquired;
      totals.trapKitsUsed += result.trapKitsUsed;
      addSourceCounts(totals.trapKitsAcquiredBySource, result.trapKitsAcquiredBySource);
      addSourceCounts(totals.trapKitsConsumedBySource, result.trapKitsConsumedBySource);
      totals.identificationPowderAcquired += result.identificationPowderAcquired;
      totals.identificationPowderUsed += result.identificationPowderUsed;
      addSourceCounts(
        totals.identificationPowderAcquiredBySource,
        result.identificationPowderAcquiredBySource
      );
      totals.workshopStepCounts[event.workshopState.purchasedSteps] =
        (totals.workshopStepCounts[event.workshopState.purchasedSteps] || 0) + 1;
      event.purchasedNodeIds.forEach(nodeId => {
        totals.workshopNodeAcquisitionCounts[nodeId]++;
      });
      [...new Set(event.purchasedNodeIds)].forEach((nodeId, index) => {
        if (!trialNodeFirstPositions.has(nodeId)) {
          trialNodeFirstPositions.set(nodeId, trialPurchasePosition + index + 1);
        }
      });
      trialPurchasePosition += event.purchasedNodeIds.length;
      totals.workshopPhaseCounts[event.workshopState.phase] =
        (totals.workshopPhaseCounts[event.workshopState.phase] || 0) + 1;
      if (!totals.workshopPhaseSamples[event.workshopState.phase]) {
        totals.workshopPhaseSamples[event.workshopState.phase] = [];
      }
      totals.workshopPhaseSamples[event.workshopState.phase].push({
        workshop: event.workshop,
        state: event.workshopState
      });
      const stateTotal = totals.workshopStateCounts[event.workshopState.signature] || {
        ...event.workshopState,
        workshop: event.workshop,
        count: 0
      };
      stateTotal.count++;
      totals.workshopStateCounts[event.workshopState.signature] = stateTotal;
    });
    trialNodeFirstPositions.forEach((position, nodeId) => {
      totals.workshopNodeTrialCounts[nodeId]++;
      totals.workshopNodeAcquisitionPositionSums[nodeId] += position;
    });
    totals.surplusPerRun += trialResult.surplusPerRun;
    totals.endingBankTotal += trialResult.endingBankTotal;
    addMaterials(totals.endingBankByMaterial, trialResult.endingBankByMaterial);
    totals.endingBankSamples.push(trialResult.endingBankByMaterial);
    if (trialResult.firstMerchantPurchaseRun !== null) {
      totals.firstMerchantPurchaseRuns.push(trialResult.firstMerchantPurchaseRun);
    }
    if (trialResult.standardCompleteRun !== null) {
      totals.standardCompleteRuns.push(trialResult.standardCompleteRun);
    }
  }
  return { scenario, totals };
}

export function runWorkshopTrialTask(task, { scoringProfile }) {
  const scenario = FINITE_PORTAL_SCENARIOS.find(candidate => candidate.id === task.scenarioId);
  if (!scenario) throw new Error(`unknown workshop scenario: ${task.scenarioId}`);
  return simulateFinitePortalTrial(task.trial, scenario, scoringProfile);
}

function average(total, totals) {
  return total / Math.max(1, totals.runs);
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function wilsonInterval(successes, trials, z = 1.96) {
  if (trials <= 0) return null;
  const rate = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (rate * (1 - rate) + (z * z) / (4 * trials)) / trials
  ) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function formatWilson(successes, trials) {
  if (trials <= 0) return "未観測";
  const interval = wilsonInterval(successes, trials);
  const uncertain = trials < 30 ? " 未確定" : "";
  return `${formatRate(successes / trials)} [${formatRate(interval[0])},${formatRate(interval[1])}; N=${trials}]${uncertain}`;
}

function formatConditionalWilson(successes, denominator) {
  return formatWilson(successes, denominator);
}

function formatWorkshopBuyout(totals) {
  const totalSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  return formatWilson(totals.workshopStepCounts[totalSteps] || 0, totals.runs);
}

function formatAverageDepth(totals) {
  const runs = Math.max(1, totals.runs);
  const mean = totals.reached / runs;
  if (runs < 2) return `B${mean.toFixed(2)} [未確定; N=${runs}]`;
  const variance = Math.max(
    0,
    (totals.reachedSquared - runs * mean * mean) / (runs - 1)
  );
  const margin = 1.96 * Math.sqrt(variance / runs);
  return `B${mean.toFixed(2)} [B${Math.max(0, mean - margin).toFixed(2)},B${(mean + margin).toFixed(2)}; N=${runs}]`;
}

function formatMilestoneMetrics(totals, floor) {
  const entrant = floor === 5 ? totals.reachedB5 : totals.reachedB10;
  const breakthrough = floor === 5 ? totals.b5Breakthrough : totals.b10Breakthrough;
  const deaths = floor === 5 ? totals.b5Deaths : totals.b10Deaths;
  return {
    entrant: formatWilson(entrant, totals.runs),
    breakthrough: formatConditionalWilson(breakthrough, entrant),
    death: formatConditionalWilson(deaths, entrant)
  };
}

function sourceAverage(totals, field, source) {
  return average(totals[field][source] || 0, totals);
}

function craftMetricSummary(totals) {
  const successRate = totals.craftPurchases / Math.max(1, totals.runs);
  const itemRates = CRAFT_RECIPE_ORDER
    .map(recipeId => {
      const runs = Math.max(1, totals.runs);
      const creationRate = (totals.craftRunsByRecipe[recipeId] || 0) / runs;
      const averageItems = (totals.craftItemsByRecipe[recipeId] || 0) / runs;
      return `${recipeId}=${formatRate(creationRate)}/${averageItems.toFixed(2)}`;
    })
    .join(",");
  return `支払い成立run率=${formatRate(successRate)}, 平均品数=${average(totals.craftItems, totals).toFixed(2)}, ` +
    `品目別(作成率/個数)=${itemRates}`;
}

function formatFiniteResult(result) {
  const { scenario, totals } = result;
  const merchantSuccessRate = totals.merchantAttempts > 0
    ? totals.merchantPurchases / totals.merchantAttempts
    : 0;
  const firstMerchant = totals.firstMerchantPurchaseRuns.length > 0
    ? `中央run ${percentile(totals.firstMerchantPurchaseRuns, 0.5)}`
    : "期間内なし";
  const b5 = formatMilestoneMetrics(totals, 5);
  const b10 = formatMilestoneMetrics(totals, 10);
  return (
    `[${PROGRESSION_POLICY}/${CRAFT_PRIORITY}] ${scenario.label}: 平均到達=${formatAverageDepth(totals)}, ` +
    `生還率=${formatWilson(totals.survived, totals.runs)}, ` +
    `B5(entrant/突破/死亡)=${b5.entrant}/${b5.breakthrough}/${b5.death}, ` +
    `B10(entrant/突破/死亡)=${b10.entrant}/${b10.breakthrough}/${b10.death}, ` +
    `EV/時間=${(totals.banked / Math.max(1, totals.time)).toFixed(4)}, ` +
    `B10/B15到達率=${formatRate(average(totals.reachedB10, totals))}/` +
    `${formatRate(average(totals.reachedB15, totals))}, ` +
    `クラフト=${craftMetricSummary(totals)}, ` +
    `素材消費=${average(totals.craftMaterialSpent, totals).toFixed(2)}/run, ` +
    `翼入手(出発/宝箱/商人)=${sourceAverage(totals, "portalAcquisitions", "departureCraft").toFixed(3)}/` +
    `${sourceAverage(totals, "portalAcquisitions", "chest").toFixed(3)}/` +
    `${sourceAverage(totals, "portalAcquisitions", "merchant").toFixed(3)}, ` +
    `翼使用=${formatRate(totals.portalUses / Math.max(1, totals.runs))}, ` +
    `傷薬入手/消費=${average(totals.healPotionsAcquired, totals).toFixed(2)}/` +
    `${average(totals.healPotionsConsumed, totals).toFixed(2)}, ` +
    `罠kit入手/消費=${average(totals.trapKitsAcquired, totals).toFixed(2)}/` +
    `${average(totals.trapKitsUsed, totals).toFixed(2)}, ` +
    `鑑定粉入手/消費=${average(totals.identificationPowderAcquired, totals).toFixed(2)}/` +
    `${average(totals.identificationPowderUsed, totals).toFixed(2)}, ` +
    `商人成立=${totals.merchantPurchases}/${totals.merchantAttempts} ` +
    `(${formatRate(merchantSuccessRate)}, ${firstMerchant}), ` +
    `工房買切(run開始)=${formatWorkshopBuyout(totals)}, ` +
    `工房買切trial=${formatWilson(totals.standardCompleteRuns.length, TRIALS)}, ` +
    `余剰蓄積=${(totals.surplusPerRun / TRIALS).toFixed(2)}/run, ` +
    `終了bank=${(totals.endingBankTotal / TRIALS).toFixed(1)}`
  );
}

function formatMaterialAmount(amount, digits = 2) {
  return Number(amount || 0).toFixed(digits);
}

function printMaterialEconomy(result) {
  const printableSweeps = new Set(["material-baseline", "rejected-material-profile"]);
  if (!result.scenario.isReference && !printableSweeps.has(result.scenario.sweep)) return;
  const { totals } = result;
  console.log(`\n【素材種別ボトルネック / ${CRAFT_PRIORITY} / ${result.scenario.label}】`);
  console.log(
    "素材 | 入手/run | 銀行入庫/run | クラフト消費/run | 工房消費/run | 商人消費/run | 余剰/run | 終了bank平均 [P50/P90]"
  );
  console.log("-----|----------|--------------|------------------|--------------|--------------|----------|-----------------------");
  MATERIALS.forEach(material => {
    const acquired = totals.materialAcquiredByMaterial[material] / Math.max(1, totals.runs);
    const banked = totals.materialBankedByMaterial[material] / Math.max(1, totals.runs);
    const craft = totals.materialConsumedByCraft[material] / Math.max(1, totals.runs);
    const workshop = totals.materialConsumedByWorkshop[material] / Math.max(1, totals.runs);
    const merchant = totals.materialConsumedByMerchant[material] / Math.max(1, totals.runs);
    const surplus = banked - craft - workshop - merchant;
    const samples = totals.endingBankSamples.map(sample => sample[material] || 0);
    const mean = totals.endingBankByMaterial[material] / Math.max(1, totals.endingBankSamples.length);
    console.log(
      `${material} | ${formatMaterialAmount(acquired).padStart(8)} | ` +
      `${formatMaterialAmount(banked).padStart(12)} | ${formatMaterialAmount(craft).padStart(16)} | ` +
      `${formatMaterialAmount(workshop).padStart(12)} | ${formatMaterialAmount(merchant).padStart(12)} | ` +
      `${formatMaterialAmount(surplus).padStart(8)} | ` +
      `${formatMaterialAmount(mean, 1)} [${formatMaterialAmount(percentile(samples, 0.5), 1)}/` +
      `${formatMaterialAmount(percentile(samples, 0.9), 1)}]`
    );
  });
  const totalAcquired = totalMaterials(totals.materialAcquiredByMaterial) / Math.max(1, totals.runs);
  const totalBanked = totalMaterials(totals.materialBankedByMaterial) / Math.max(1, totals.runs);
  const totalSurplus = MATERIALS.reduce(
    (sum, material) => sum + (
      totals.materialBankedByMaterial[material] -
      totals.materialConsumedByCraft[material] -
      totals.materialConsumedByWorkshop[material] -
      totals.materialConsumedByMerchant[material]
    ),
    0
  ) / Math.max(1, totals.runs);
  console.log(
    `総入手量/run=${totalAcquired.toFixed(2)}, 銀行入庫/run=${totalBanked.toFixed(2)}, ` +
    `余剰蓄積/run=${totalSurplus.toFixed(2)}, 40run後bank=${(totals.endingBankTotal / TRIALS).toFixed(1)}`
  );
  console.log("入手源別（種別合計/run）:");
  Object.entries(totals.materialSourceCounts).forEach(([source, materials]) => {
    console.log(`  ${source}: ${(totalMaterials(materials) / Math.max(1, totals.runs)).toFixed(2)}`);
  });
  console.log("入手源別×素材（/run; combat/chest/quest/other）:");
  MATERIALS.forEach(material => {
    const bySource = ["combat", "chest", "quest", "other"]
      .map(source => (totals.materialSourceCounts[source][material] / Math.max(1, totals.runs)).toFixed(2))
      .join("/");
    console.log(`  ${material}: ${bySource}`);
  });
  console.log("クラフト不足回数（候補として試行したが支払えなかった回数）:");
  CRAFT_RECIPE_ORDER.forEach(recipeId => {
    const attempts = totals.craftAttemptsByRecipe[recipeId] || 0;
    const shortages = totals.craftShortagesByRecipe[recipeId] || 0;
    const reasons = Object.entries(totals.craftShortageMaterialsByRecipe[recipeId] || {})
      .map(([material, count]) => `${material}=${count}`)
      .join(",") || "-";
    console.log(
      `  ${recipeId}: 試行=${attempts}, 不足=${shortages} ` +
      `(${formatRate(shortages / Math.max(1, attempts))}), 不足種別=${reasons}`
    );
  });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function printSweepTable(results, sweep, label, keyLabel) {
  console.log(`\n【${label} / 測定値】`);
  console.log(
    `${keyLabel} | 生還率(95%CI) | 平均到達(95%CI) | ` +
    "B5 entrant | B5突破 | B5死亡 | B10 entrant | B10突破 | B10死亡 | 工房買切(95%CI) | EV/時間 | " +
    "クラフト(成立/平均品数) | 翼入手/消費 | 傷薬入手/消費 | 罠kit入手/消費 | 粉入手/消費"
  );
  results
    .filter(result => result.scenario.sweep === sweep)
    .forEach(result => {
      const { scenario, totals } = result;
      const key = sweep === "wing-cost"
        ? scenario.wingCostOverride
        : sweep === "powder-cost"
          ? scenario.powderCostOverride
          : sweep === "rare-material-floor"
            ? scenario.materialDropOverride?.rareMaterialFloor
          : sweep === "chest-material-profile"
              ? scenario.materialDropOverride?.chestMaterialProfile
              : sweep === "secondary-material-profile"
                ? scenario.materialDropOverride?.secondaryMaterialProfile
                : scenario.workshopCostOverride;
      const b5 = formatMilestoneMetrics(totals, 5);
      const b10 = formatMilestoneMetrics(totals, 10);
      console.log(
        `${String(key).padStart(2)} | ${formatWilson(totals.survived, totals.runs)} | ` +
        `${formatAverageDepth(totals)} | ` +
        `${b5.entrant} | ${b5.breakthrough} | ${b5.death} | ` +
        `${b10.entrant} | ${b10.breakthrough} | ${b10.death} | ` +
        `${formatWorkshopBuyout(totals)} | ` +
        `${(totals.banked / Math.max(1, totals.time)).toFixed(4).padStart(8)} | ` +
        `${formatRate(totals.craftPurchases / Math.max(1, totals.runs)).padStart(6)}/` +
        `${average(totals.craftItems, totals).toFixed(2).padStart(5)} | ` +
        `${sourceAverage(totals, "portalAcquisitions", "departureCraft").toFixed(2)}/` +
        `${((totals.portalUsesBySource["departure-craft"] || 0) / Math.max(1, totals.runs)).toFixed(2)} | ` +
        `${sourceAverage(totals, "healPotionsAcquiredBySource", "departureCraft").toFixed(2)}/` +
        `${sourceAverage(totals, "healPotionsConsumedBySource", "departureCraft").toFixed(2)} | ` +
        `${sourceAverage(totals, "trapKitsAcquiredBySource", "departureCraft").toFixed(2)}/` +
        `${sourceAverage(totals, "trapKitsConsumedBySource", "departureCraft").toFixed(2)} | ` +
        `${average(totals.identificationPowderAcquired, totals).toFixed(2)}/` +
        `${average(totals.identificationPowderUsed, totals).toFixed(2)}`
      );
    });
}

function formatWorkshopState(state) {
  const ranks = state.ranks.map(([nodeId, rank]) => `${nodeId}=${rank}`).join(",") || "-";
  const grants = state.grants;
  const statGrant = Object.entries(grants.stats)
    .map(([stat, amount]) => `${stat}+${amount}`)
    .join(",") || "-";
  return `step=${state.purchasedSteps}/${WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  )}, nodes=${ranks}, stats=${statGrant}, gear=${grants.startingGear.join(",") || "-"}, ` +
    `affix=${grants.affixIds.join(",") || "-"}, spell=${grants.spellIds.join(",") || "-"}, ` +
    `powder=${grants.identifyPowder}, return=${grants.returnItems.join(",") || "-"}`;
}

function printWorkshopStateDistribution(result) {
  if (
    (!result.scenario.isReference || result.scenario.sweep !== "reference") &&
    result.scenario.sweep !== "material-baseline"
  ) return;
  const { totals } = result;
  console.log(
    `\n【工房状態分布 / ${result.scenario.label}】` +
    `（${RUNS_PER_TRIAL}ラン×${TRIALS}試行、各run開始時点）`
  );
  const stepDistribution = Object.entries(totals.workshopStepCounts)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([step, count]) => `${step}step=${formatWilson(count, totals.runs)}`)
    .join(" / ");
  console.log(`購入step分布: ${stepDistribution}`);
  const phaseLabels = {
    empty: "空",
    "stats-in-progress": "ステータス投資中",
    "starting-gear-unlocked": "初期装備解放済み",
    "blood-wand-unlocked": "血杖解放済み",
    "blood-wand+deep-spells": "血杖+深層呪文解放済み",
    "core-pools-in-progress": "追加コアプール投資中",
    complete: "買い切り済み"
  };
  Object.entries(phaseLabels).forEach(([phase, label]) => {
    const count = totals.workshopPhaseCounts[phase] || 0;
    if (!count) {
      console.log(`  ${label}: ${formatWilson(0, totals.runs)} (0/${totals.runs})`);
      return;
    }
    const samples = totals.workshopPhaseSamples[phase];
    const meanSteps = samples.reduce(
      (sum, sample) => sum + sample.state.purchasedSteps,
      0
    ) / samples.length;
    const representative = samples
      .slice()
      .sort((left, right) =>
        Math.abs(left.state.purchasedSteps - meanSteps) -
        Math.abs(right.state.purchasedSteps - meanSteps)
      )[0];
    console.log(
      `  ${label}: ${formatWilson(count, totals.runs)} ` +
      `(${count}/${totals.runs}), 平均step=${meanSteps.toFixed(1)}, ` +
      `代表 ${formatWorkshopState(representative.state)}`
    );
  });
  printWorkshopAcquisitionOrder(result);
  console.log("上位の完全一致state:");
  Object.values(totals.workshopStateCounts)
    .sort((left, right) => right.count - left.count || left.purchasedSteps - right.purchasedSteps)
    .slice(0, 8)
    .forEach(state => {
      console.log(
        `  ${formatWilson(state.count, totals.runs)} (${state.count}/${totals.runs}): ` +
        formatWorkshopState(state)
      );
    });
}

function printWorkshopAcquisitionOrder(result) {
  if (
    (!result.scenario.isReference || result.scenario.sweep !== "reference") &&
    result.scenario.sweep !== "material-baseline"
  ) return;
  const { totals } = result;
  console.log("工房ノード取得率・平均取得順（trial単位。0件は死に枝候補）:");
  WORKSHOP_NODES.forEach(node => {
    const rankCount = totals.workshopNodeAcquisitionCounts[node.id] || 0;
    const trialCount = totals.workshopNodeTrialCounts[node.id] || 0;
    const averagePosition = trialCount > 0
      ? totals.workshopNodeAcquisitionPositionSums[node.id] / trialCount
      : null;
    console.log(
      `  ${node.id} [${node.category}] ${node.name}: ` +
      `取得試行=${trialCount}/${TRIALS} (${formatWilson(trialCount, TRIALS)}), ` +
      `rank購入=${rankCount}, ` +
      `平均順=${averagePosition === null ? "未取得" : averagePosition.toFixed(1)}` +
      `${trialCount === 0 ? " / 死に枝候補" : ""}`
    );
  });
}

export async function runWorkshopProgressionSimulation() {
  console.log("工房進行シミュレーション（Issue #348: 出発クラフト）");
  console.log(
    `試行: 条件ごと N=${TRIALS}, ${RUNS_PER_TRIAL}ラン/試行, seed=${BASE_SEED}, ` +
    `core calibration N=${CALIBRATION_RUNS}`
  );
  console.log(
    `工房/クラフト優先方針: ${PROGRESSION_POLICY} ` +
    "（craft-first=クラフト→工房 / workshop-first=工房→クラフト / " +
    "workshop-complete=工房買切り後のみクラフト）"
  );
  console.log(
    `クラフト品目優先順位: ${CRAFT_PRIORITY} ` +
    "（wing-first=翼優先 / cheap-first=単品コスト昇順。払えない品は次へ進む）"
  );
  const initialDemand = getRemainingDemand({ ranks: {} });
  const workshopSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  if (workshopSteps !== 40 || totalMaterials(initialDemand) !== 161) {
    throw new Error(
      `workshop demand mismatch: steps=${workshopSteps}, materials=${totalMaterials(initialDemand)}`
    );
  }
  console.log(
    `工房実需要検算: ${WORKSHOP_NODES.length}ノード / ${workshopSteps}購入step / ` +
    `総${totalMaterials(initialDemand)}個。`
  );
  console.log(
    `出発クラフト実装値: 個数上限=素材残高, ` +
    `翼コスト合計=${REFERENCE_WING_COST}, ` +
    `鑑定粉コスト合計=${REFERENCE_POWDER_COST}, ` +
    `候補レシピ=${CRAFT_RECIPE_ORDER.join(",")}`
  );
  console.log(
    "実装経路: generateRunFloor / applyCombatRewards / generateRandomEquipment / " +
    "bankRunMaterials / purchaseWorkshopNode / purchaseDepartureCraft を実srcから使用。"
  );
  console.log(
    "クラフト支払: 各run終了後、実bankから次run分を支払。simulateRunへ渡すbankは " +
    "外側支払済みレシピのAPI検証用であり、素材無料注入ではない。"
  );
  console.log(
    `罠モデル: simulateRun内でgenerateRunFloor経由、宝箱/フロア罠、傷薬、罠kit、翼、鑑定粉を ` +
    `入手数・消費数付きで集計。TRAP_POLICY=${DEFAULT_TRAP_POLICY_ID}。`
  );
  console.log(
    "N/翼コストの表はsim内what-if。最終値は実srcのレシピ変更後に同じrun経路で再測定し、" +
    "乱数消費順の違いによる閾値合わせはしない。"
  );

  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
  const finiteTasks = FINITE_PORTAL_SCENARIOS.flatMap(scenario =>
    Array.from({ length: TRIALS }, (_, trial) => ({
      kind: "finite",
      scenarioId: scenario.id,
      trial
    }))
  );
  const taskResults = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runWorkshopTrialTask",
    runTask: runWorkshopTrialTask,
    tasks: finiteTasks,
    context: { scoringProfile }
  });
  let resultOffset = 0;
  const finiteResults = FINITE_PORTAL_SCENARIOS.map(scenario => {
    const trialResults = taskResults.slice(resultOffset, resultOffset + TRIALS);
    resultOffset += TRIALS;
    return aggregateFinitePortalScenario(scenario, trialResults);
  });

  console.log("\n【出発クラフト条件別の測定値】");
  finiteResults.forEach(result => console.log(formatFiniteResult(result)));
  const referenceResult = finiteResults.find(result => result.scenario.isReference);
  if (referenceResult) {
    printEncounterGroupDiagnostics(referenceResult);
    printMonsterClassificationAudit();
  }
  printSweepTable(finiteResults, "wing-cost", "帰還の翼コスト sweep", "cost");
  printSweepTable(finiteResults, "powder-cost", "鑑定粉コスト sweep", "cost");
  printSweepTable(finiteResults, "rare-material-floor", "竜鱗ゲート sweep", "floor");
  printSweepTable(finiteResults, "chest-material-profile", "宝箱素材配分 sweep", "profile");
  printSweepTable(finiteResults, "secondary-material-profile", "戦闘副素材配分 sweep", "profile");
  finiteResults.forEach(printWorkshopStateDistribution);
  finiteResults.forEach(printMaterialEconomy);

  console.log("\n【素材コスト集計】");
  finiteResults
    .filter(result => result.scenario.isReference)
    .forEach(result => {
      console.log(
        `${result.scenario.label}: ` +
        `spent=${JSON.stringify(Object.fromEntries(
          Object.entries(result.totals.craftSpentByMaterial)
            .map(([material, amount]) => [material, amount / Math.max(1, result.totals.craftPurchases)])
        ))}`
      );
    });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorkshopProgressionSimulation();
}
