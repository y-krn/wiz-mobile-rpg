// balance-impact: maps — per-cell recovery is exercised by the Issue #1993 production browser run.
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { getHealMultiplier } from "../rules/item_rules.js";

const RECOVERY_RATE = 0.02;
const FLOOR_CAP_RATE = 0.5;

function getFloorRecovery(run, floor) {
  if (!run || !Number.isInteger(floor) || floor < 1) return null;
  run.explorationRecovery ||= {};
  const key = String(floor);
  run.explorationRecovery[key] ||= {
    hpRecovered: 0,
    mpRecovered: 0,
    hpRemainder: 0,
    mpRemainder: 0
  };
  return run.explorationRecovery[key];
}

function recoverResource({ char, floorState, resource, getMax, multiplier = 1 }) {
  const current = Number(char?.[resource]);
  const max = getMax(char);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0 || current >= max) return 0;

  const recoveredKey = `${resource}Recovered`;
  const remainderKey = `${resource}Remainder`;
  const cap = Math.floor(max * FLOOR_CAP_RATE);
  const remaining = Math.max(0, cap - floorState[recoveredKey]);
  if (remaining === 0) return 0;

  const credit = max * RECOVERY_RATE * multiplier + floorState[remainderKey];
  const points = Math.floor(credit + Number.EPSILON * max);
  if (points === 0) {
    floorState[remainderKey] = credit;
    return 0;
  }

  const recovered = Math.min(points, max - current, remaining);
  if (recovered <= 0) return 0;
  char[resource] = current + recovered;
  floorState[recoveredKey] += recovered;
  floorState[remainderKey] = floorState[recoveredKey] < cap ? Math.max(0, credit - points) : 0;
  return recovered;
}

export function applyExplorationRecovery(stateLike, floor = stateLike?.floor) {
  const char = stateLike?.party?.[0];
  const floorState = getFloorRecovery(stateLike?.currentRun, floor);
  if (!char || !floorState || char.hp <= 0 || ["dead", "ash", "poisoned"].includes(char.status)) {
    return { hpRecovered: 0, mpRecovered: 0 };
  }

  return {
    hpRecovered: recoverResource({ char, floorState, resource: "hp", getMax: getCharMaxHp, multiplier: getHealMultiplier(char) }),
    mpRecovered: recoverResource({ char, floorState, resource: "mp", getMax: getCharMaxMp })
  };
}

export function getExplorationRecoveryRemaining(stateLike, floor = stateLike?.floor) {
  const char = stateLike?.party?.[0];
  if (!char) return null;
  const floorState = stateLike?.currentRun?.explorationRecovery?.[String(floor)];
  const hpCap = Math.floor(getCharMaxHp(char) * FLOOR_CAP_RATE);
  const mpCap = Math.floor(getCharMaxMp(char) * FLOOR_CAP_RATE);
  return {
    hp: Math.max(0, hpCap - (floorState?.hpRecovered || 0)),
    mp: Math.max(0, mpCap - (floorState?.mpRecovered || 0))
  };
}
