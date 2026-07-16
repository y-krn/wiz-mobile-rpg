import { getCharMaxHp, getCharMaxMp, getCharCoreParams } from "../data.js";
import { getWardenGateId } from "../state/warden_gates.js";

const CAMP_FLOORS = new Set([2, 4]);

export function getCampRestStatus(stateObj) {
  const floor = stateObj.floor;
  if (!CAMP_FLOORS.has(floor)) return { available: false, reason: "invalid_floor" };
  if (!stateObj.openedGates?.includes(getWardenGateId(floor))) {
    return { available: false, reason: "locked" };
  }
  if (!stateObj.currentRun) return { available: false, reason: "no_run" };
  if (stateObj.currentRun.campRested?.[floor]) return { available: false, reason: "used" };
  return { available: true, reason: null };
}

export function restAtCamp(stateObj) {
  const status = getCampRestStatus(stateObj);
  if (!status.available) return { ...status, hpRecovered: 0, mpRecovered: 0 };

  let hpRecovered = 0;
  let mpRecovered = 0;
  const coreUsers = [];
  stateObj.party.forEach(char => {
    if (char.hp <= 0 || ["dead", "ash"].includes(char.status)) return;
    const maxHp = getCharMaxHp(char);
    const maxMp = getCharMaxMp(char);
    const params = getCharCoreParams(char, "CORE_CAMP_MASTER");
    const multiplier = params?.recoveryMultiplier || 1;
    if (params) coreUsers.push(char.name);
    const hpGain = Math.min(maxHp - char.hp, Math.ceil((maxHp - char.hp) * 0.4 * multiplier));
    const mpGain = Math.min(maxMp - char.mp, Math.ceil((maxMp - char.mp) * 0.4 * multiplier));
    char.hp = Math.min(maxHp, char.hp + hpGain);
    char.mp = Math.min(maxMp, char.mp + mpGain);
    hpRecovered += hpGain;
    mpRecovered += mpGain;
  });

  stateObj.currentRun.campRested ??= {};
  stateObj.currentRun.campRested[stateObj.floor] = true;
  return { available: true, reason: null, hpRecovered, mpRecovered, coreUsers };
}
