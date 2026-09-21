// balance-impact: none — canonical save boundary types and runtime guards only.

import { isCharacterEquipment, type CharacterEquipment } from "./equipment.js";
import { isNormalizedCurrentRun, type NormalizedCurrentRun } from "./run_state.js";
import { isNormalizedStartingKitId, type NormalizedStartingKitId } from "./starting_kit.js";
import {
  isInventoryCollection,
  isRuntimeItemCollection,
  isStorageCollection,
  type InventoryCollection,
  type RuntimeItemCollection,
  type StorageCollection
} from "./item.js";

export type PersistedGameState =
  | "town"
  | "explore"
  | "combat"
  | "result"
  | "gameover"
  | "victory";

export interface NormalizedSaveCharacter {
  startingKit: NormalizedStartingKitId;
  equipment: CharacterEquipment;
  [key: string]: unknown;
}

export interface NormalizedDungeonMemory {
  mapFragments: Record<string, unknown>;
  visitedFloors: unknown[];
}

export interface NormalizedSavePayload {
  version: number;
  x: number;
  y: number;
  dir: number;
  prevX: number;
  prevY: number;
  floor: number;
  party: NormalizedSaveCharacter[];
  inventory: InventoryCollection;
  maps: unknown[];
  visitedMaps: unknown[] | null | undefined;
  lightTurns: number;
  lightPower: string;
  repelTurns: number;
  silenceTurns: number;
  forcedEncounterSteps: number;
  activeMerchantStock: RuntimeItemCollection;
  floorChestsOpened: unknown[];
  floorChestsTotal: unknown[];
  firstKills: string[];
  currentRun: NormalizedCurrentRun | null;
  records: Record<string, unknown>;
  unlockedMilestones: number[];
  runHistory: unknown[];
  deathLogs: unknown[];
  codex: Record<string, unknown>;
  seed: string;
  gameState: PersistedGameState;
  combatState: Record<string, unknown> | null;
  chestState: Record<string, unknown> | null;
  roamingMonsters: unknown[];
  roamingMovementStepCount: number;
  noiseEvents: unknown[];
  firstChestUnidentifiedGuaranteed: boolean;
  storage: StorageCollection;
  storageMax: number;
  identifyTickets: number;
  cleared: boolean;
  metaMaterials: Record<string, unknown>;
  workshop: Record<string, unknown>;
  keyItems: unknown[];
  dungeonMemory: NormalizedDungeonMemory;
  logs: string[];
}

export const SAVE_PAYLOAD_FIELDS = Object.freeze([
  "version", "x", "y", "dir", "party", "inventory", "floor", "maps",
  "visitedMaps", "lightTurns", "lightPower", "repelTurns", "silenceTurns", "forcedEncounterSteps",
  "activeMerchantStock", "floorChestsOpened", "floorChestsTotal",
  "firstKills", "currentRun", "records", "unlockedMilestones", "runHistory",
  "deathLogs", "codex", "seed", "gameState", "combatState", "chestState",
  "prevX", "prevY", "roamingMonsters", "roamingMovementStepCount", "noiseEvents",
  "firstChestUnidentifiedGuaranteed", "storage", "storageMax", "identifyTickets",
  "cleared", "metaMaterials", "workshop", "keyItems", "dungeonMemory", "logs"
] as const);

export const TRANSIENT_STATE_FIELDS = Object.freeze([
  "menuContext", "menuHistory", "equipState", "transitioning", "controlsGuardUntil",
  "mapRevision", "sessionMaxFloor"
] as const);

const REQUIRED_FIELDS = SAVE_PAYLOAD_FIELDS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRequiredFields(value: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.every(field => Object.hasOwn(value, field));
}

function isNormalizedCharacter(value: unknown): value is NormalizedSaveCharacter {
  return isRecord(value) && Object.hasOwn(value, "startingKit") &&
    isNormalizedStartingKitId(value.startingKit) && isCharacterEquipment(value.equipment);
}

export function isNormalizedSavePayload(value: unknown): value is NormalizedSavePayload {
  if (!isRecord(value) || !hasRequiredFields(value)) return false;
  const version = value.version;
  const floor = value.floor;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return false;
  if (![value.x, value.y, value.dir, value.prevX, value.prevY, value.floor]
    .every(Number.isInteger)) return false;
  if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 1) return false;
  if (!Array.isArray(value.party) || !value.party.every(isNormalizedCharacter)) return false;
  if (!isInventoryCollection(value.inventory) || !isStorageCollection(value.storage)) return false;
  if (!isRuntimeItemCollection(value.activeMerchantStock)) return false;
  if (!Array.isArray(value.maps) ||
      (value.visitedMaps !== null && value.visitedMaps !== undefined && !Array.isArray(value.visitedMaps))) return false;
  if (![value.floorChestsOpened, value.floorChestsTotal, value.runHistory, value.deathLogs,
    value.roamingMonsters, value.noiseEvents, value.keyItems].every(Array.isArray)) return false;
  if (!isFiniteNumber(value.lightTurns) || typeof value.lightPower !== "string" ||
      !isFiniteNumber(value.repelTurns) || !isFiniteNumber(value.silenceTurns) ||
      !isFiniteNumber(value.forcedEncounterSteps) || !isFiniteNumber(value.roamingMovementStepCount) ||
      !isFiniteNumber(value.storageMax) || !isFiniteNumber(value.identifyTickets)) return false;
  if (!Array.isArray(value.firstKills) || !value.firstKills.every(item => typeof item === "string")) return false;
  if (value.currentRun !== null && !isNormalizedCurrentRun(value.currentRun)) return false;
  if (!isRecord(value.records) || !isRecord(value.codex) || !isRecord(value.metaMaterials) ||
      !isRecord(value.workshop)) return false;
  if (!Array.isArray(value.unlockedMilestones) ||
      !value.unlockedMilestones.every(item => Number.isInteger(item))) return false;
  if (!isPersistedGameState(value.gameState)) return false;
  if (value.combatState !== null && !isRecord(value.combatState)) return false;
  if (value.chestState !== null && !isRecord(value.chestState)) return false;
  if (typeof value.seed !== "string" || typeof value.firstChestUnidentifiedGuaranteed !== "boolean" ||
      typeof value.cleared !== "boolean" || !Array.isArray(value.logs) ||
      !value.logs.every(log => typeof log === "string")) return false;
  if (!isRecord(value.dungeonMemory) || !isRecord(value.dungeonMemory.mapFragments) ||
      !Array.isArray(value.dungeonMemory.visitedFloors)) return false;
  return true;
}

function isPersistedGameState(value: unknown): value is PersistedGameState {
  return value === "town" || value === "explore" || value === "combat" ||
    value === "result" || value === "gameover" || value === "victory";
}

export function assertNormalizedSavePayload(value: unknown): NormalizedSavePayload {
  if (isNormalizedSavePayload(value)) return value;
  const error = new Error("Normalized save payload contract validation failed.");
  error.name = "MalformedSavePayloadError";
  throw error;
}
