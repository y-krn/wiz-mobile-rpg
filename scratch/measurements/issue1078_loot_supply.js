// sim-scope: formula — production-backed loot supply distributions and build invariance
/* global console, process */

import "../simulations/simulation_preflight.js";

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { ITEMS } from "../../src/data/items.js";
import {
  RUNE_SUPPLY_BANDS,
  RUNES,
  getRuneItemIdsByFloor
} from "../../src/data/magic.js";
import {
  LOOT_BUILD_ROLES,
  getAffixDefinition,
  getAffixKind
} from "../../src/data/affixes.js";
import { getItemBaseId, getItemData } from "../../src/rules/item_rules.js";
import {
  getChestItemCandidatesByFloor,
  rollChestAccessory,
  rollChestReward
} from "../../src/rules/chest_rules.js";
import { canEquipEquipment } from "../../src/rules/equipment_rules.js";
import { getEquipmentPreview } from "../../src/rules/equipment_preview.js";
import { createStartingKitCharacter } from "../../src/state/initial_state.js";
import { readSimScopeDeclaration, printEnvSignatureBanner } from "./measurement_env_signature.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const RUNNER_VERSION = "issue1078-loot-supply-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_SEED = 1078;
export const DEFAULT_RUNS = 500;
export const SIM_RUNS = DEFAULT_RUNS;
export const CHEST_DECISIONS_PER_BAND = 3;

const BAND_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "B1_5", label: "B1-5", floors: Object.freeze([2, 3, 5]) }),
  Object.freeze({ id: "B6_10", label: "B6-10", floors: Object.freeze([6, 8, 10]) }),
  Object.freeze({ id: "B11_PLUS", label: "B11+", floors: Object.freeze([11, 15, 20]) })
]);
const ROLE_IDS = Object.freeze(Object.values(LOOT_BUILD_ROLES));
const ROLE_SET = new Set(ROLE_IDS);
const EQUIPMENT_TYPES = new Set(["weapon", "armor", "shield", "accessory"]);
const RUNE_TIER_IDS = Object.freeze(RUNE_SUPPLY_BANDS.map(band => band.id));

function emptyCounts(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function createDistribution() {
  return { 0: 0, 1: 0, "2+": 0 };
}

function createMainAxisCoreDistribution() {
  return { 0: 0, 1: 0, 2: 0, 3: 0, "4+": 0 };
}

function recordDistribution(distribution, value) {
  const bucket = value >= 2 ? "2+" : String(Math.max(0, value));
  distribution[bucket] = (distribution[bucket] || 0) + 1;
}

function recordMainAxisCoreDistribution(distribution, value) {
  const bucket = value >= 4 ? "4+" : String(Math.max(0, value));
  distribution[bucket] = (distribution[bucket] || 0) + 1;
}

function rate(count, total) {
  return total > 0 ? count / total : null;
}

function formatRate(value) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function getItemId(item) {
  const id = getItemBaseId(item);
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getItemType(item) {
  return getItemData(item)?.type || null;
}

function isEquipment(item) {
  return EQUIPMENT_TYPES.has(getItemType(item));
}

function isRune(item) {
  return getItemType(item) === "rune";
}

function getRuneTier(item) {
  const rune = RUNES[getItemId(item)];
  return rune?.supplyTier || null;
}

function getAffixes(item) {
  return item && typeof item === "object" && Array.isArray(item.affixes)
    ? item.affixes
    : [];
}

function getEquippedMainAxisCoreCount(character) {
  return Object.values(character?.equipment || {}).reduce((count, item) => count + getAffixes(item)
    .filter(affix => getAffixKind(affix) === "core")
    .filter(affix => getAffixDefinition(affix)?.buildAxis === "main").length, 0);
}

function getCoreCount(item) {
  return getAffixes(item).filter(affix => getAffixKind(affix) === "core").length;
}

function getSupportCount(item) {
  return getAffixes(item).filter(affix => getAffixKind(affix) === "support").length;
}

function getActualAffixRoles(item) {
  return getAffixes(item)
    .map(affix => getAffixDefinition(affix)?.buildRole)
    .filter(role => ROLE_SET.has(role));
}

function hasPivotAffix(item) {
  return getActualAffixRoles(item).includes(LOOT_BUILD_ROLES.PIVOT);
}

function normalizeReward(item) {
  if (!item) return null;
  if (typeof item !== "object") return { id: getItemId(item), type: getItemType(item) };
  return {
    id: getItemId(item),
    type: getItemType(item),
    rarity: item.rarity || null,
    lootRole: ROLE_SET.has(item.lootRole) ? item.lootRole : null,
    buildRole: ROLE_SET.has(item.buildRole) ? item.buildRole : null,
    affixes: getAffixes(item).map(affix => ({
      id: affix.id || affix.type || null,
      kind: getAffixKind(affix),
      value: affix.value ?? null,
      buildRole: ROLE_SET.has(getAffixDefinition(affix)?.buildRole)
        ? getAffixDefinition(affix).buildRole
        : null
    }))
  };
}

function createCurrentRun() {
  return {
    chestsOpened: 0,
    equipmentFound: [],
    b1ChestsOpened: 0,
    b1EquipFound: 0
  };
}

function createBuildVariant(startingKit, { hp, mp } = {}) {
  const character = createStartingKitCharacter(startingKit);
  character.hp = hp;
  character.mp = mp;
  return [character];
}

function createInvarianceVariants() {
  return Object.freeze([
    Object.freeze({ id: "vanguard-low-resource", party: createBuildVariant("vanguard", { hp: 1, mp: 0 }) }),
    Object.freeze({ id: "arcana-full-resource", party: createBuildVariant("arcana", { hp: 20, mp: 20 }) }),
    Object.freeze({ id: "devotion-wounded", party: createBuildVariant("devotion", { hp: 7, mp: 0 }) })
  ]);
}

function createBandAggregate(band) {
  return {
    id: band.id,
    label: band.label,
    floors: [...band.floors],
    runs: 0,
    mainDecisions: 0,
    mainOutcomeCounts: emptyCounts(["empty", "equipment", "rune", "consumable"]),
    bundleRewardCount: 0,
    exposure: {
      equipment: 0,
      generatedEquipment: 0,
      rune: 0,
      consumable: 0,
      other: 0,
      equipmentBaseIds: {},
      runeTier: emptyCounts(RUNE_TIER_IDS),
      mediumFinds: 0,
      actualPivotItems: 0,
      mediumAndRunePairs: 0
    },
    targetRoleExposure: emptyCounts(ROLE_IDS),
    actualAffixRoleExposure: emptyCounts(ROLE_IDS),
    coreSupportExposure: {
      itemsWithCore: 0,
      itemsWithSupport: 0,
      coreCountByItem: { 0: 0, 1: 0, "2+": 0 },
      supportCountByItem: { 0: 0, 1: 0, 2: 0, 3: 0, "4+": 0 }
    },
    perRunDistributions: {
      objectLootDecisions: createDistribution(),
      equipmentFinds: createDistribution(),
      runeFinds: createDistribution(),
      consumableFinds: createDistribution(),
      targetPivotExposure: createDistribution(),
      truePivotAdoption: createDistribution(),
      coreFinds: createDistribution(),
      coreEquipped: createDistribution(),
      simultaneouslyEquippedMainAxisCores: createMainAxisCoreDistribution()
    },
    adoption: {
      equipmentCandidates: 0,
      adoptedEquipment: 0,
      pivotCandidates: 0,
      pivotAdopted: 0,
      coreCandidates: 0,
      coreAdopted: 0
    },
    floorSignatures: Object.fromEntries(band.floors.map(floor => [String(floor), {
      decisions: 0,
      nonEmpty: 0,
      uniqueMainRewards: new Set()
    }]))
  };
}

function updateCoreSupportExposure(aggregate, item) {
  const coreCount = getCoreCount(item);
  const supportCount = getSupportCount(item);
  if (coreCount > 0) aggregate.coreSupportExposure.itemsWithCore++;
  if (supportCount > 0) aggregate.coreSupportExposure.itemsWithSupport++;
  const coreBucket = coreCount >= 2 ? "2+" : String(coreCount);
  const supportBucket = supportCount >= 4 ? "4+" : String(supportCount);
  aggregate.coreSupportExposure.coreCountByItem[coreBucket]++;
  aggregate.coreSupportExposure.supportCountByItem[supportBucket]++;
}

function recordEquipmentExposure(aggregate, item) {
  aggregate.exposure.equipment++;
  const itemId = getItemId(item);
  aggregate.exposure.equipmentBaseIds[itemId] = (aggregate.exposure.equipmentBaseIds[itemId] || 0) + 1;
  if (ITEMS[itemId]?.behaviorProfile === "medium") aggregate.exposure.mediumFinds++;
  const targetRole = ROLE_SET.has(item?.lootRole) ? item.lootRole : null;
  if (targetRole) {
    aggregate.exposure.generatedEquipment++;
    aggregate.targetRoleExposure[targetRole]++;
  }
  if (hasPivotAffix(item)) aggregate.exposure.actualPivotItems++;
  getActualAffixRoles(item).forEach(role => { aggregate.actualAffixRoleExposure[role]++; });
  updateCoreSupportExposure(aggregate, item);
}

function recordItemExposure(aggregate, item) {
  if (isEquipment(item)) {
    recordEquipmentExposure(aggregate, item);
    return "equipment";
  }
  if (isRune(item)) {
    aggregate.exposure.rune++;
    const tier = getRuneTier(item);
    if (tier) aggregate.exposure.runeTier[tier]++;
    return "rune";
  }
  if (getItemType(item) === "usable") {
    aggregate.exposure.consumable++;
    return "consumable";
  }
  aggregate.exposure.other++;
  return "other";
}

function prepareAdoptionCandidate(item) {
  if (!isEquipment(item)) return item;
  return {
    ...item,
    identified: true,
    knowledgeStage: "identified"
  };
}

// This is deliberately a measurement-only adoption policy. It uses the same
// production equip validation and preview math as the UI, but does not claim to
// reproduce human preference. Core candidates are allowed through when the
// production preview has a positive primary delta or carries a Core; this
// makes "found" and "equipped" separately observable without an optimal-role
// selector or a build-dependent loot roll.
function adoptEquipment(character, item, floor) {
  if (!isEquipment(item)) return false;
  const candidate = prepareAdoptionCandidate(item);
  const availability = canEquipEquipment(character, candidate);
  if (!availability.ok) return false;
  const preview = getEquipmentPreview(character, candidate, availability.slot, { floor });
  if (!preview) return false;
  const qualifies = preview.primaryDiff > 0 || getCoreCount(item) > 0;
  if (!qualifies) return false;
  character.equipment[availability.slot] = candidate;
  return true;
}

function updateAdoption(aggregate, adoptionCharacter, item, floor, perRun) {
  if (!isEquipment(item)) return;
  aggregate.adoption.equipmentCandidates++;
  const pivot = hasPivotAffix(item);
  const hasCore = getCoreCount(item) > 0;
  if (pivot) {
    aggregate.adoption.pivotCandidates++;
    perRun.pivotCandidates++;
  }
  if (hasCore) aggregate.adoption.coreCandidates++;
  if (!adoptEquipment(adoptionCharacter, item, floor)) return;
  aggregate.adoption.adoptedEquipment++;
  if (pivot) {
    aggregate.adoption.pivotAdopted++;
    perRun.truePivotAdoptions++;
  }
  if (hasCore) aggregate.adoption.coreAdopted++;
  perRun.adoptedEquipment++;
}

function rollBundle({ band, floor, runIndex, decisionIndex, seed, party, currentRun }) {
  const rng = createRng(`${seed}:${band.id}:run:${runIndex}:decision:${decisionIndex}:B${floor}`);
  const mainReward = rollChestReward({
    floor,
    rng,
    party,
    currentRun,
    trap: "none",
    firstChestGuaranteed: false,
    includeRunes: true
  });
  const accessory = rollChestAccessory(floor, rng, party);
  currentRun.chestsOpened++;
  [mainReward.item, accessory]
    .filter(item => isEquipment(item))
    .forEach(item => currentRun.equipmentFound.push(item));
  return {
    main: mainReward.item,
    accessory,
    items: [mainReward.item, accessory].filter(Boolean)
  };
}

function recordMainOutcome(aggregate, item, floor) {
  const category = !item
    ? "empty"
    : isEquipment(item)
      ? "equipment"
      : isRune(item)
        ? "rune"
        : "consumable";
  aggregate.mainOutcomeCounts[category]++;
  const floorSummary = aggregate.floorSignatures[String(floor)];
  floorSummary.decisions++;
  if (item) {
    floorSummary.nonEmpty++;
    floorSummary.uniqueMainRewards.add(JSON.stringify(normalizeReward(item)));
  }
}

function finalizeAggregate(aggregate) {
  const floorSignatures = Object.fromEntries(Object.entries(aggregate.floorSignatures).map(([floor, value]) => [floor, {
    decisions: value.decisions,
    nonEmpty: value.nonEmpty,
    uniqueMainRewards: value.uniqueMainRewards.size
  }]));
  const decisions = aggregate.mainDecisions;
  const bundles = aggregate.bundleRewardCount;
  const runs = aggregate.runs;
  const pivotCandidates = aggregate.adoption.pivotCandidates;
  const coreCandidates = aggregate.adoption.coreCandidates;
  return {
    ...aggregate,
    floorSignatures,
    rates: {
      mainNonEmpty: rate(decisions - aggregate.mainOutcomeCounts.empty, decisions),
      equipmentExposurePerDecision: rate(aggregate.exposure.equipment, decisions),
      runeExposurePerDecision: rate(aggregate.exposure.rune, decisions),
      consumableExposurePerDecision: rate(aggregate.exposure.consumable, decisions),
      targetPivotExposure: rate(aggregate.targetRoleExposure.pivot, aggregate.exposure.generatedEquipment),
      actualPivotExposure: rate(aggregate.exposure.actualPivotItems, aggregate.exposure.equipment),
      truePivotAdoptionPerPivotCandidate: rate(aggregate.adoption.pivotAdopted, pivotCandidates),
      coreFindPerEquipment: rate(aggregate.coreSupportExposure.itemsWithCore, aggregate.exposure.equipment),
      coreEquipPerCoreCandidate: rate(aggregate.adoption.coreAdopted, coreCandidates),
      mediumAndRunePairPerBundle: rate(aggregate.exposure.mediumAndRunePairs, bundles)
    },
    floorRunCount: runs
  };
}

function measureBand(band, { seed, runs }) {
  const aggregate = createBandAggregate(band);
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    aggregate.runs++;
    const party = createBuildVariant("vanguard", { hp: 20, mp: 0 });
    const adoptionCharacter = createStartingKitCharacter("vanguard");
    const currentRun = createCurrentRun();
    const perRun = {
      objectLootDecisions: 0,
      equipmentFinds: 0,
      runeFinds: 0,
      consumableFinds: 0,
      targetPivotExposures: 0,
      truePivotAdoptions: 0,
      coreFinds: 0,
      coreEquipped: 0,
      pivotCandidates: 0,
      adoptedEquipment: 0
    };
    band.floors.forEach((floor, decisionIndex) => {
      aggregate.mainDecisions++;
      const bundle = rollBundle({
        band,
        floor,
        runIndex,
        decisionIndex,
        seed,
        party,
        currentRun
      });
      recordMainOutcome(aggregate, bundle.main, floor);
      aggregate.bundleRewardCount++;
      if (bundle.main && typeof bundle.main === "object") perRun.objectLootDecisions++;
      bundle.items.forEach(item => {
        const category = recordItemExposure(aggregate, item);
        if (category === "equipment") {
          perRun.equipmentFinds++;
          if (ROLE_SET.has(item.lootRole) && item.lootRole === LOOT_BUILD_ROLES.PIVOT) {
            perRun.targetPivotExposures++;
          }
          const beforeCoreCount = aggregate.adoption.coreAdopted;
          updateAdoption(aggregate, adoptionCharacter, item, floor, perRun);
          if (aggregate.adoption.coreAdopted > beforeCoreCount) {
            perRun.coreEquipped++;
          }
          perRun.coreFinds += Number(getCoreCount(item) > 0);
        }
        if (category === "rune") perRun.runeFinds++;
        if (category === "consumable") perRun.consumableFinds++;
      });
      const hasMedium = bundle.items.some(item => ITEMS[getItemId(item)]?.behaviorProfile === "medium");
      const hasRune = bundle.items.some(isRune);
      if (hasMedium && hasRune) aggregate.exposure.mediumAndRunePairs++;
    });
    recordDistribution(aggregate.perRunDistributions.objectLootDecisions, perRun.objectLootDecisions);
    recordDistribution(aggregate.perRunDistributions.equipmentFinds, perRun.equipmentFinds);
    recordDistribution(aggregate.perRunDistributions.runeFinds, perRun.runeFinds);
    recordDistribution(aggregate.perRunDistributions.consumableFinds, perRun.consumableFinds);
    recordDistribution(aggregate.perRunDistributions.targetPivotExposure, perRun.targetPivotExposures);
    recordDistribution(aggregate.perRunDistributions.truePivotAdoption, perRun.truePivotAdoptions);
    recordDistribution(aggregate.perRunDistributions.coreFinds, perRun.coreFinds);
    recordDistribution(aggregate.perRunDistributions.coreEquipped, perRun.coreEquipped);
    recordMainAxisCoreDistribution(
      aggregate.perRunDistributions.simultaneouslyEquippedMainAxisCores,
      getEquippedMainAxisCoreCount(adoptionCharacter)
    );
  }
  return finalizeAggregate(aggregate);
}

function getCandidateAudit() {
  return BAND_DEFINITIONS.map(band => ({
    id: band.id,
    floors: band.floors.map(floor => {
      const candidates = getChestItemCandidatesByFloor(floor, { includeRunes: true });
      const equipment = candidates.filter(item => isEquipment(item));
      return {
        floor,
        candidateCount: candidates.length,
        equipmentCount: equipment.length,
        runeIds: candidates.filter(item => isRune(item)),
        equipmentProfiles: [...new Set(equipment.map(item => ITEMS[item]?.behaviorProfile).filter(Boolean))].sort(),
        equipmentTypes: [...new Set(equipment.map(item => getItemType(item)))].sort(),
        twoHandedWeapons: equipment.filter(item => ITEMS[item]?.type === "weapon" && ITEMS[item]?.hands === 2)
      };
    })
  }));
}

function getRuneSupplyAudit() {
  return RUNE_SUPPLY_BANDS.map(band => ({
    id: band.id,
    minFloor: band.minFloor,
    spellKeys: [...band.spellKeys],
    itemIdsAtUnlock: getRuneItemIdsByFloor(band.minFloor)
  }));
}

function createInvarianceRunState() {
  return createCurrentRun();
}

function rollVariantSequence(variant, { seed, runs }) {
  const sequence = [];
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const currentRun = createInvarianceRunState();
    BAND_DEFINITIONS.forEach(band => {
      band.floors.forEach((floor, decisionIndex) => {
        const bundle = rollBundle({
          band,
          floor,
          runIndex,
          decisionIndex,
          seed,
          party: variant.party,
          currentRun
        });
        sequence.push({
          band: band.id,
          floor,
          main: normalizeReward(bundle.main),
          accessory: normalizeReward(bundle.accessory)
        });
      });
    });
  }
  return sequence;
}

function compareSequences(left, right) {
  const length = Math.min(left.length, right.length);
  let mismatchCount = Math.abs(left.length - right.length);
  const firstMismatch = [];
  for (let index = 0; index < length; index++) {
    if (JSON.stringify(left[index]) === JSON.stringify(right[index])) continue;
    mismatchCount++;
    if (firstMismatch.length < 3) firstMismatch.push({ index, left: left[index], right: right[index] });
  }
  return { mismatchCount, firstMismatch };
}

function measureBuildInvariance({ seed, runs }) {
  const variants = createInvarianceVariants();
  const sequences = variants.map(variant => ({ id: variant.id, sequence: rollVariantSequence(variant, { seed, runs }) }));
  const baseline = sequences[0];
  const comparisons = sequences.slice(1).map(candidate => ({
    baseline: baseline.id,
    variant: candidate.id,
    samples: Math.min(baseline.sequence.length, candidate.sequence.length),
    ...compareSequences(baseline.sequence, candidate.sequence)
  }));
  return {
    variants: variants.map(variant => variant.id),
    samplesPerVariant: baseline.sequence.length,
    comparisons,
    totalMismatches: comparisons.reduce((sum, comparison) => sum + comparison.mismatchCount, 0),
    invariant: comparisons.every(comparison => comparison.mismatchCount === 0),
    dimensionsChanged: ["startingKit", "equipped weapon/medium", "socketed Rune", "HP", "MP"]
  };
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null } = {}) {
  const normalizedRuns = Number(runs);
  if (!Number.isInteger(normalizedRuns) || normalizedRuns < 1) {
    throw new Error(`runs must be a positive integer: ${runs}`);
  }
  const normalizedSeed = String(seed);
  const environment = {
    scope: readSimScopeDeclaration(import.meta.url).name,
    runnerVersion: RUNNER_VERSION,
    seed: normalizedSeed,
    runs: normalizedRuns,
    decisionsPerBand: CHEST_DECISIONS_PER_BAND,
    representativeFloors: Object.fromEntries(BAND_DEFINITIONS.map(band => [band.id, band.floors])),
    chestSource: "ordinary",
    trap: "none",
    includeRunes: true,
    adoptionPolicy: "production canEquipEquipment + getEquipmentPreview; positive primary delta or Core",
    sourceOfTruth: [
      "rollChestReward",
      "rollChestAccessory",
      "getChestItemCandidatesByFloor",
      "RUNE_SUPPLY_BANDS",
      "EQUIPMENT_CANDIDATES_BY_FLOOR"
    ]
  };
  return {
    issue: 1078,
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurement: {
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      productionSourceSha: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      simulatorRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      simulatorRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      baseRef: provenance?.baseRef || null,
      baseCommit: provenance?.baseCommit || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      configuration: {
        seed: normalizedSeed,
        runs: normalizedRuns,
        decisionsPerBand: CHEST_DECISIONS_PER_BAND,
        floorsByBand: Object.fromEntries(BAND_DEFINITIONS.map(band => [band.id, [...band.floors]]))
      },
      environment
    },
    runeSupply: getRuneSupplyAudit(),
    candidateAudit: getCandidateAudit(),
    bands: BAND_DEFINITIONS.map(band => measureBand(band, { seed: normalizedSeed, runs: normalizedRuns })),
    buildInvariance: measureBuildInvariance({ seed: normalizedSeed, runs: normalizedRuns }),
    modeled: [
      "ordinary chest main reward and accessory reward through production roll functions",
      "equipment, Rune, consumable, Core, Support, role, and medium/Rune bundle distributions",
      "neutral production preview adoption for true pivot/Core find-vs-equip distributions",
      "starting-kit/current-build/HP/MP invariance under matched seeded draws"
    ],
    omitted: [
      "human preference and long-run player build policy",
      "map traversal, combat, merchant, and material economy; this is a formula-scope supply audit",
      "live telemetry transport; lifecycle schema is covered by unit tests and source telemetry fields"
    ]
  };
}

function parseOption(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function parseOptions(args) {
  const runsValue = parseOption(args, "--runs", String(DEFAULT_RUNS));
  const runs = Number(runsValue);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer: ${runsValue}`);
  return {
    seed: parseOption(args, "--seed", String(DEFAULT_SEED)),
    runs,
    output: parseOption(args, "--output"),
    summary: parseOption(args, "--summary")
  };
}

function renderSummary(report) {
  const lines = [
    "# Issue #1078 loot supply measurement",
    "",
    `- runner: \`${report.runnerVersion}\` / schema \`${report.schemaVersion}\``,
    `- source baseline: \`${report.measurement.gameplaySourceCommit || "unavailable"}\``,
    `- runner commit: \`${report.measurement.measurementRunnerCommit || "unavailable"}\``,
    `- N=${report.measurement.configuration.runs} per band; seed=\`${report.measurement.configuration.seed}\`; decisions/band=${report.measurement.configuration.decisionsPerBand}`,
    `- provenance: origin/main ancestor=${report.measurement.originMainAncestor}; clean=${report.measurement.workingTreeClean}; diff=${report.measurement.measurementRunnerDiffSha256 || "unavailable"}`,
    "",
    "## Supply distributions",
    "",
    "| Band | Main non-empty | Equipment exposure/decision | Rune exposure/decision | Consumable exposure/decision | Target pivot | Actual pivot | True pivot adopted | Core find 0/1/2+ | Core equip 0/1/2+ | Main-axis Core 0/1/2/3/4+ |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...report.bands.map(band => `| ${band.label} | ${formatRate(band.rates.mainNonEmpty)} | ${formatRate(band.rates.equipmentExposurePerDecision)} | ${formatRate(band.rates.runeExposurePerDecision)} | ${formatRate(band.rates.consumableExposurePerDecision)} | ${formatRate(band.rates.targetPivotExposure)} | ${formatRate(band.rates.actualPivotExposure)} | ${formatRate(band.rates.truePivotAdoptionPerPivotCandidate)} | \`${JSON.stringify(band.perRunDistributions.coreFinds)}\` | \`${JSON.stringify(band.perRunDistributions.coreEquipped)}\` | \`${JSON.stringify(band.perRunDistributions.simultaneouslyEquippedMainAxisCores)}\` |`),
    "",
    "## Rune supply",
    "",
    ...report.runeSupply.map(band => `- ${band.id} (B${band.minFloor}+): ${band.spellKeys.join(", ")}`),
    "",
    "## Build invariance",
    "",
    `- matched seeded samples: ${report.buildInvariance.samplesPerVariant} per variant`,
    `- invariant: **${report.buildInvariance.invariant ? "yes" : "no"}**; total mismatches=${report.buildInvariance.totalMismatches}`,
    ...report.buildInvariance.comparisons.map(comparison => `- ${comparison.baseline} vs ${comparison.variant}: ${comparison.mismatchCount} mismatches / ${comparison.samples} samples`),
    "",
    "## Interpretation boundary",
    "",
    "- `truePivotAdoption` is a neutral measurement policy using production equip validation and preview math; it is not a claim about human choice.",
    "- Rune and Medium are mutually exclusive within the single main reward slot; the measured same-bundle pair count is retained to guard against accidental pairing logic.",
    ""
  ];
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const provenance = requireRunnerProvenance({
    fetchOriginMain: true,
    measurementRunnerPaths: [
      "scratch/measurements/issue1078_loot_supply.js",
      "src/data/affixes.js",
      "src/data/equipment_tables.js",
      "src/data/magic.js",
      "src/rules/chest_rules.js",
      "src/systems/equipment_generation.js",
      "src/rules/equipment_preview.js",
      "src/rules/equipment_rules.js",
      "src/telemetry.js"
    ]
  });
  const environmentSignature = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    seed: options.seed,
    runs: options.runs,
    decisionsPerBand: CHEST_DECISIONS_PER_BAND,
    bands: BAND_DEFINITIONS.map(band => ({ id: band.id, floors: band.floors })),
    runeSupply: getRuneSupplyAudit(),
    adoptionPolicy: "production preview neutral policy"
  }, { label: "issue1078 loot supply env" });
  const report = runMeasurement({ seed: options.seed, runs: options.runs, provenance });
  report.measurement.environmentSignature = environmentSignature;
  if (options.output) {
    fs.mkdirSync(dirname(resolve(options.output)), { recursive: true });
    fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.summary) {
    fs.mkdirSync(dirname(resolve(options.summary)), { recursive: true });
    fs.writeFileSync(resolve(options.summary), renderSummary(report));
  }
  if (!options.output && !options.summary) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
