// sim-scope: measurement — pure build candidate observation helpers

export const SIDEGRADE_CLASSIFICATIONS = Object.freeze([
  "strictUpgrade",
  "combatTradeoff",
  "durabilityTradeoff",
  "safetyTradeoff",
  "buildTradeoff",
  "noMeaningfulGain"
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
  if (combatReduced && featureImproved) classifications.push("buildTradeoff");
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
