import { createRng } from "../seed_rng.js";
import { FLOOR_ROLES, FLOOR_TRIALS } from "../data/floor_trials.js";

const TRIAL_BY_ID = new Map(FLOOR_TRIALS.map(trial => [trial.id, trial]));

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isInteger(number) && number >= 1 ? number : fallback;
}

export function getBandIndexForFloor(floor) {
  return Math.floor((positiveInteger(floor) - 1) / 5);
}

export function getFloorRole(floor) {
  return FLOOR_ROLES[(positiveInteger(floor) - 1) % FLOOR_ROLES.length];
}

function chooseWeighted(values, rng, weightOf) {
  const weighted = values.map(value => ({ value, weight: Math.max(0, Number(weightOf(value)) || 0) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return values[0];
  let threshold = rng() * total;
  for (const entry of weighted) {
    threshold -= entry.weight;
    if (threshold < 0) return entry.value;
  }
  return weighted.at(-1).value;
}

function selectBandTrial(runSeed, bandIndex, previousMainId = null) {
  const rng = createRng(`${runSeed}:trial-band:${bandIndex}`);
  const main = chooseWeighted(FLOOR_TRIALS, rng, trial =>
    trial.id === previousMainId ? 0.35 : 1
  );
  const subCandidates = FLOOR_TRIALS.filter(trial => trial.id !== main.id);
  const sub = chooseWeighted(subCandidates, rng, trial => {
    // Related pairs are more legible, but every pair remains possible.
    const related = trial.affinity.traits.some(trait => main.affinity.traits.includes(trait));
    return related ? 1.15 : 1;
  });
  return { bandIndex, main, sub, mainId: main.id, subId: sub.id };
}

export function getBandTrialForRun(runSeed, bandIndex) {
  if (typeof runSeed !== "string" || runSeed.length === 0) {
    throw new TypeError("runSeed must be a non-empty string");
  }
  if (!Number.isInteger(bandIndex) || bandIndex < 0) {
    throw new TypeError(`bandIndex must be a non-negative integer: ${bandIndex}`);
  }
  let previousMainId = null;
  let trial = null;
  for (let index = 0; index <= bandIndex; index++) {
    trial = selectBandTrial(runSeed, index, previousMainId);
    previousMainId = trial.mainId;
  }
  return trial;
}

export function getBandTrialForFloor(runSeed, floor, storedTrial = null) {
  const bandIndex = getBandIndexForFloor(floor);
  if (storedTrial?.bandIndex === bandIndex &&
      TRIAL_BY_ID.has(storedTrial.mainId) &&
      TRIAL_BY_ID.has(storedTrial.subId) &&
      storedTrial.mainId !== storedTrial.subId) {
    const main = TRIAL_BY_ID.get(storedTrial.mainId);
    const sub = TRIAL_BY_ID.get(storedTrial.subId);
    return { bandIndex, main, sub, mainId: main.id, subId: sub.id };
  }
  return getBandTrialForRun(runSeed, bandIndex);
}

export function getStoredBandTrial(trial) {
  if (!trial || !Number.isInteger(trial.bandIndex) ||
      !TRIAL_BY_ID.has(trial.mainId) || !TRIAL_BY_ID.has(trial.subId) ||
      trial.mainId === trial.subId) return null;
  return { bandIndex: trial.bandIndex, mainId: trial.mainId, subId: trial.subId };
}

function hasAffinity(monster, affinity) {
  const traits = new Set(monster?.traits || []);
  if (affinity.traits?.some(trait => traits.has(trait))) return true;
  if (affinity.tags?.some(tag => monster?.tags?.includes(tag))) return true;
  return affinity.fields?.some(field => {
    if (field === "highHp") return Number(monster?.hp) >= 100;
    if (field === "highDef") return Number(monster?.def) >= 10;
    if (field === "spell") return Boolean(monster?.spell);
    if (field === "magicResist") return Number(monster?.magicResist) > 0;
    return Boolean(monster?.[field]);
  }) === true;
}

export function getTrialAffinityWeight(monster, trial, role = null) {
  if (!trial) return 1;
  const floorRole = role || FLOOR_ROLES[0];
  const mainMatch = hasAffinity(monster, trial.main.affinity);
  const subMatch = hasAffinity(monster, trial.sub.affinity);
  // Keep every existing enemy in the pool. The trial changes emphasis by
  // lifting matching capabilities, rather than compensating with exclusions
  // or a hidden counter-rule.
  let weight = mainMatch ? floorRole.mainWeight : 1;
  if (subMatch) weight *= mainMatch ? floorRole.subWeight * 1.08 : 1.06;
  return weight;
}

export function getTrialEncounterSizeWeights(trial, role, baseWeights) {
  const weights = [...baseWeights];
  const groupAffinity = [trial?.main, trial?.sub].some(theme =>
    theme?.id === "many_battles"
  );
  if (groupAffinity) {
    weights[0] /= role.groupWeight;
    weights[1] *= role.groupWeight;
    weights[2] *= role.groupWeight;
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

export function getTrialRareWeight(trial, role) {
  if (!trial) return 1;
  const temptation = role.id === "temptation";
  const rareTheme = trial.main.id === "many_battles" || trial.sub.id === "many_battles";
  return role.rareWeight * (temptation || rareTheme ? 1.15 : 1);
}

export function getBandClue(trial, floor = null) {
  if (!trial) return null;
  const role = floor == null ? FLOOR_ROLES[trial.bandIndex % FLOOR_ROLES.length] : getFloorRole(floor);
  const options = [...trial.main.signals, ...trial.sub.signals, ...role.signals];
  const rng = createRng(`${trial.bandIndex}:${trial.mainId}:${trial.subId}:clue`);
  return options[Math.floor(rng() * options.length)];
}

export { FLOOR_ROLES, FLOOR_TRIALS };
