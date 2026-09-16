// sim-scope: measurement — pure build candidate observation helpers

export const SIDEGRADE_CLASSIFICATIONS = Object.freeze([
  "strictUpgrade",
  "combatTradeoff",
  "durabilityTradeoff",
  "safetyTradeoff",
  "buildTradeoff",
  "noMeaningfulGain"
]);

export const EXPLORATION_SUPPORT_IDS = Object.freeze([
  "trapBonus",
  "trapGuard",
  "treasureSense",
  "arcaneSense",
  "hearRange",
  "traceRead",
  "materialFind",
  "identifyDiscount"
]);

export const EXPLORATION_CANDIDATE_CATEGORIES = Object.freeze([
  "positiveExplorationDelta",
  ...EXPLORATION_SUPPORT_IDS
]);

export const REJECTION_REASON_IDS = Object.freeze([
  "class-incompatible",
  "already-equipped-unlimited",
  "current-curse-locked",
  "unidentified-not-potential-upgrade",
  "unidentified-held",
  "combat-score-not-higher",
  "economy-ev-not-higher",
  "score-not-higher",
  "economy-core-retained",
  "economy-below-95pct",
  "equipped-core-retained",
  "not-best-selection-score",
  "out-ranked-by-later-candidate",
  "other"
]);

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function positive(value) {
  return numeric(value) > 0;
}

function negative(value) {
  return numeric(value) < 0;
}

function setDifference(left = [], right = []) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter(value => !rightSet.has(value)).sort();
}

function sortedUnion(left = [], right = []) {
  return [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].sort();
}

export function diffBuildObservations(before, after) {
  const explorationBefore = before?.explorationSupportValues || {};
  const explorationAfter = after?.explorationSupportValues || {};
  const explorationAbilityDelta = Object.fromEntries(
    sortedUnion(explorationBefore, explorationAfter).map(id => [
      id,
      numeric(explorationAfter[id]) - numeric(explorationBefore[id])
    ])
  );
  const mainCoreIdsAdded = setDifference(after?.mainCoreIds, before?.mainCoreIds);
  const mainCoreIdsRemoved = setDifference(before?.mainCoreIds, after?.mainCoreIds);
  const auxiliaryCoreIdsAdded = setDifference(after?.auxiliaryCoreIds, before?.auxiliaryCoreIds);
  const auxiliaryCoreIdsRemoved = setDifference(before?.auxiliaryCoreIds, after?.auxiliaryCoreIds);
  const supportBefore = before?.supportValues || {};
  const supportAfter = after?.supportValues || {};
  const supportDelta = Object.fromEntries(
    sortedUnion(supportBefore, supportAfter).map(id => [
      id,
      numeric(supportAfter[id]) - numeric(supportBefore[id])
    ])
  );
  const activeRuneSpellIdsAdded = setDifference(
    after?.activeRuneSpellIds,
    before?.activeRuneSpellIds
  );
  const activeRuneSpellIdsRemoved = setDifference(
    before?.activeRuneSpellIds,
    after?.activeRuneSpellIds
  );
  const spellIdsAdded = setDifference(after?.spellIds, before?.spellIds);
  const spellIdsRemoved = setDifference(before?.spellIds, after?.spellIds);
  return {
    atk: numeric(after?.atk) - numeric(before?.atk),
    def: numeric(after?.def) - numeric(before?.def),
    maxHp: numeric(after?.maxHp) - numeric(before?.maxHp),
    maxMp: numeric(after?.maxMp) - numeric(before?.maxMp),
    explorationAbilityDelta,
    mainCoreIdsAdded,
    mainCoreIdsRemoved,
    auxiliaryCoreIdsAdded,
    auxiliaryCoreIdsRemoved,
    supportDelta,
    activeRuneSpellIdsAdded,
    activeRuneSpellIdsRemoved,
    spellIdsAdded,
    spellIdsRemoved,
    buildIdentityBefore: before?.identity || null,
    buildIdentityAfter: after?.identity || null
  };
}

function anyPositive(values) {
  return Object.values(values || {}).some(positive);
}

function anyNegative(values) {
  return Object.values(values || {}).some(negative);
}

export function classifySidegrade(delta) {
  const combat = [delta?.atk, delta?.def, delta?.maxHp, delta?.maxMp];
  const combatImproved = combat.some(positive);
  const combatReduced = combat.some(negative);
  const offenseReduced = negative(delta?.atk);
  const durabilityImproved = [delta?.def, delta?.maxHp, delta?.maxMp].some(positive);
  const explorationImproved = anyPositive(delta?.explorationAbilityDelta);
  const featureImproved = [
    delta?.mainCoreIdsAdded,
    delta?.auxiliaryCoreIdsAdded,
    delta?.activeRuneSpellIdsAdded,
    delta?.spellIdsAdded
  ].some(values => Array.isArray(values) && values.length > 0) ||
    anyPositive(delta?.supportDelta);
  const featureReduced = [
    delta?.mainCoreIdsRemoved,
    delta?.auxiliaryCoreIdsRemoved,
    delta?.activeRuneSpellIdsRemoved,
    delta?.spellIdsRemoved
  ].some(values => Array.isArray(values) && values.length > 0) ||
    anyNegative(delta?.supportDelta);
  const classifications = [];

  if (!combatReduced && !anyNegative(delta?.explorationAbilityDelta) &&
    !featureReduced &&
    (combatImproved || explorationImproved || featureImproved)) {
    classifications.push("strictUpgrade");
  }
  if (combatImproved && combatReduced) classifications.push("combatTradeoff");
  if (offenseReduced && durabilityImproved) classifications.push("durabilityTradeoff");
  if (combatReduced && explorationImproved) classifications.push("safetyTradeoff");
  if ((combatReduced && featureImproved) || (combatImproved && featureReduced)) {
    classifications.push("buildTradeoff");
  }
  if (classifications.length === 0) classifications.push("noMeaningfulGain");
  return classifications;
}

export function countClassifications(audits, { rejectedOnly = false } = {}) {
  const counts = Object.fromEntries(SIDEGRADE_CLASSIFICATIONS.map(id => [id, 0]));
  audits.forEach(audit => {
    if (rejectedOnly && audit.selected) return;
    (audit.sidegradeClassifications || []).forEach(id => {
      if (Object.hasOwn(counts, id)) counts[id]++;
    });
  });
  return counts;
}

function candidateMetric() {
  return {
    candidateCount: 0,
    evaluable: 0,
    qualifies: 0,
    selected: 0
  };
}

function incrementCandidateMetric(target, audit) {
  target.candidateCount++;
  target.evaluable += Number(Boolean(audit.evaluableCandidate));
  target.qualifies += Number(Boolean(audit.evaluableCandidate && audit.qualifies));
  target.selected += Number(Boolean(audit.evaluableCandidate && audit.selected));
}

function explorationDelta(audit) {
  return audit?.explorationAbilityDelta || audit?.deltas?.explorationAbility || {};
}

function positiveExplorationIds(audit) {
  return Object.entries(explorationDelta(audit))
    .filter(([, value]) => Number(value) > 0)
    .map(([id]) => id)
    .filter(id => EXPLORATION_SUPPORT_IDS.includes(id));
}

function positiveExplorationCategories(audit) {
  const positiveIds = positiveExplorationIds(audit);
  return positiveIds.length > 0
    ? ["positiveExplorationDelta", ...positiveIds]
    : [];
}

function emptyFloorMap(floors, factory) {
  return Object.fromEntries(floors.map(floor => [String(floor), factory()]));
}

export function summarizeExplorationCandidateActivity(audits = [], floors = []) {
  const byFloor = emptyFloorMap(floors, () => ({
    candidateCount: 0,
    evaluable: 0,
    qualifies: 0,
    selected: 0,
    categories: Object.fromEntries([
      "positiveExplorationDelta",
      ...EXPLORATION_SUPPORT_IDS
    ].map(id => [id, candidateMetric()]))
  }));
  audits.forEach(audit => {
    const floor = byFloor[String(audit?.floor)];
    if (!floor) return;
    floor.candidateCount++;
    floor.evaluable += Number(Boolean(audit.evaluableCandidate));
    floor.qualifies += Number(Boolean(audit.evaluableCandidate && audit.qualifies));
    floor.selected += Number(Boolean(audit.evaluableCandidate && audit.selected));
    const positiveIds = positiveExplorationIds(audit);
    if (positiveIds.length === 0) return;
    incrementCandidateMetric(floor.categories.positiveExplorationDelta, audit);
    positiveIds.forEach(id => incrementCandidateMetric(floor.categories[id], audit));
  });
  return {
    status: "observed",
    byFloor
  };
}

export function normalizeRejectionReason(reason) {
  return REJECTION_REASON_IDS.includes(reason) ? reason : "other";
}

export function summarizeRejectedCandidateCrossTab(audits = [], floors = []) {
  const byFloor = emptyFloorMap(floors, () => ({
    byRejectionReason: {},
    byCategory: {}
  }));
  audits.forEach(audit => {
    if (!audit?.evaluableCandidate || audit.selected) return;
    const floor = byFloor[String(audit.floor)];
    if (!floor) return;
    const reason = normalizeRejectionReason(audit.rejectionReason);
    const classifications = audit.sidegradeClassifications?.length
      ? audit.sidegradeClassifications
      : ["noMeaningfulGain"];
    classifications.forEach(classification => {
      if (!SIDEGRADE_CLASSIFICATIONS.includes(classification)) return;
      floor.byRejectionReason[reason] ||= {};
      floor.byRejectionReason[reason][classification] =
        (floor.byRejectionReason[reason][classification] || 0) + 1;
    });
    positiveExplorationCategories(audit).forEach(category => {
      floor.byCategory[category] ||= {};
      floor.byCategory[category][reason] ||= {
        rejectedCandidateCount: 0,
        sidegradeClassificationCounts: {}
      };
      floor.byCategory[category][reason].rejectedCandidateCount++;
      classifications.forEach(classification => {
        if (!SIDEGRADE_CLASSIFICATIONS.includes(classification)) return;
        const counts = floor.byCategory[category][reason].sidegradeClassificationCounts;
        counts[classification] = (counts[classification] || 0) + 1;
      });
    });
  });
  return {
    status: "observed",
    byFloor
  };
}
