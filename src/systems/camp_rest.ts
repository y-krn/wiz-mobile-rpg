import { getCharCoreParams } from "../rules/affix_rules.js";
import { getCharMaxHp, getCharMaxMp } from "../rules/character_stats.js";
import { floorHasCampEvent } from "../run_map_generator.js";
import type { CharacterEquipment } from "../state/equipment.js";
import type {
  NormalizedCampRested,
  NormalizedCompletedCampEntryFloors,
  NormalizedPendingCampEntryFloor
} from "../state/camp_state.js";

interface CampCharacter {
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  status?: string;
  equipment?: CharacterEquipment;
}

interface CampRunState {
  defeatedMilestones?: readonly number[];
  pendingCampEntryFloor?: NormalizedPendingCampEntryFloor;
  completedCampEntryFloors?: NormalizedCompletedCampEntryFloors;
  campRested?: NormalizedCampRested;
}

interface CampState {
  floor: number;
  party: CampCharacter[];
  currentRun?: CampRunState | null;
}

type CampRestStatus =
  | { available: true; reason: null }
  | { available: false; reason: "no_run" | "used" };

export interface CampRestResult {
  available: boolean;
  reason: "no_run" | "used" | null;
  hpRecovered: number;
  mpRecovered: number;
  coreUsers?: string[];
}

export function isCampEntryEligible(stateObj: CampState, floor: number): boolean {
  return floorHasCampEvent(floor) &&
    stateObj.currentRun?.defeatedMilestones?.includes(floor - 1) === true;
}

export function beginCampEntry(stateObj: CampState, floor: number): boolean {
  const currentRun = stateObj.currentRun;
  if (!currentRun || !isCampEntryEligible(stateObj, floor)) return false;
  const completed = currentRun.completedCampEntryFloors || [];
  if (completed.includes(floor)) return false;
  if (currentRun.pendingCampEntryFloor !== null) return false;
  currentRun.completedCampEntryFloors = completed;
  currentRun.pendingCampEntryFloor = floor;
  return true;
}

export function completeCampEntry(stateObj: CampState, floor: number): boolean {
  const currentRun = stateObj.currentRun;
  if (!currentRun || currentRun.pendingCampEntryFloor !== floor) return false;
  currentRun.completedCampEntryFloors ||= [];
  if (!currentRun.completedCampEntryFloors.includes(floor)) {
    currentRun.completedCampEntryFloors.push(floor);
    currentRun.completedCampEntryFloors.sort((a, b) => a - b);
  }
  currentRun.pendingCampEntryFloor = null;
  return true;
}

// 野営の休息は1ランに1階1回。進入イベントの完了状態もここで永続化する。
export function getCampRestStatus(stateObj: CampState): CampRestStatus {
  const floor = stateObj.floor;
  if (!stateObj.currentRun) return { available: false, reason: "no_run" };
  if (stateObj.currentRun.campRested?.[floor]) return { available: false, reason: "used" };
  return { available: true, reason: null };
}

export function restAtCamp(stateObj: CampState): CampRestResult {
  const status = getCampRestStatus(stateObj);
  if (!status.available) return { ...status, hpRecovered: 0, mpRecovered: 0 };

  const currentRun = stateObj.currentRun;
  if (!currentRun) return { available: false, reason: "no_run", hpRecovered: 0, mpRecovered: 0 };

  let hpRecovered = 0;
  let mpRecovered = 0;
  const coreUsers: string[] = [];
  stateObj.party.forEach(char => {
    if (char.hp <= 0 || ["dead", "ash"].includes(char.status ?? "")) return;
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

  currentRun.campRested ??= {};
  currentRun.campRested[stateObj.floor] = true;
  return { available: true, reason: null, hpRecovered, mpRecovered, coreUsers };
}
