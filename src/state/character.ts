// balance-impact: none — canonical player combat actor contract only.

export type CombatPlayerStatus =
  | "ok"
  | "poisoned"
  | "blind"
  | "sleep"
  | "paralyze"
  | "paralyzed"
  | "dead";

export interface CombatPlayerActor {
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  status: CombatPlayerStatus;
}

const COMBAT_PLAYER_STATUSES: ReadonlySet<string> = new Set([
  "ok",
  "poisoned",
  "blind",
  "sleep",
  "paralyze",
  "paralyzed",
  "dead"
]);

const COMBAT_PLAYER_ACTIONABLE_STATUSES: ReadonlySet<string> = new Set([
  "ok",
  "poisoned",
  "blind"
]);

const COMBAT_PLAYER_CORE_FIELDS = ["name", "hp", "maxHp", "mp", "maxMp", "status"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isCombatPlayerStatus(value: unknown): value is CombatPlayerStatus {
  return typeof value === "string" && COMBAT_PLAYER_STATUSES.has(value);
}

export function isCombatPlayerActor(value: unknown): value is CombatPlayerActor {
  if (!isRecord(value) || !COMBAT_PLAYER_CORE_FIELDS.every(field => Object.hasOwn(value, field))) return false;
  return typeof value.name === "string" &&
    isFiniteNumber(value.hp) &&
    isFiniteNumber(value.maxHp) &&
    isFiniteNumber(value.mp) &&
    isFiniteNumber(value.maxMp) &&
    isCombatPlayerStatus(value.status);
}

export function isCombatPlayerActionableActor(value: unknown): value is CombatPlayerActor {
  return isCombatPlayerActor(value) && COMBAT_PLAYER_ACTIONABLE_STATUSES.has(value.status);
}

export function isCombatPlayerParty(value: unknown): value is CombatPlayerActor[] {
  return Array.isArray(value) && value.every(isCombatPlayerActor);
}
