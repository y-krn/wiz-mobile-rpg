import { getCharMaxHp, getCharMaxMp, getCharCoreParams } from "../data.js";
import { floorHasCampEvent } from "../run_map_generator.js";

export function isCampEntryEligible(stateObj, floor) {
  return floorHasCampEvent(floor) &&
    stateObj.currentRun?.defeatedMilestones?.includes(floor - 1) === true;
}

export function beginCampEntry(stateObj, floor) {
  if (!stateObj.currentRun || !isCampEntryEligible(stateObj, floor)) return false;
  const completed = stateObj.currentRun.completedCampEntryFloors || [];
  if (completed.includes(floor)) return false;
  if (stateObj.currentRun.pendingCampEntryFloor !== null) return false;
  stateObj.currentRun.completedCampEntryFloors = completed;
  stateObj.currentRun.pendingCampEntryFloor = floor;
  return true;
}

export function completeCampEntry(stateObj, floor) {
  if (stateObj.currentRun?.pendingCampEntryFloor !== floor) return false;
  stateObj.currentRun.completedCampEntryFloors ||= [];
  if (!stateObj.currentRun.completedCampEntryFloors.includes(floor)) {
    stateObj.currentRun.completedCampEntryFloors.push(floor);
    stateObj.currentRun.completedCampEntryFloors.sort((a, b) => a - b);
  }
  stateObj.currentRun.pendingCampEntryFloor = null;
  return true;
}

// 野営の休息は1ランに1階1回。進入イベントの完了状態もここで永続化する。
export function getCampRestStatus(stateObj) {
  const floor = stateObj.floor;
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
