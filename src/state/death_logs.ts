// balance-impact: none — canonical persisted death-log domain boundary only.

export const DEATH_TYPES = Object.freeze({
  COMBAT: "combat",
  TRAP: "trap",
  STATUS: "status"
});

export const DEATH_TYPE_LABELS = Object.freeze({
  combat: "戦闘",
  trap: "罠",
  status: "状態異常"
});

export type AuthoredDeathType = "combat" | "trap" | "status";

export interface NormalizedRunDeathLog {
  charName: string;
  cause: string;
  floor: number;
  turn: number | null;
  type?: string;
  source?: string;
}

export type NormalizedRunDeathLogs = NormalizedRunDeathLog[];

export interface NormalizedDeathHistoryCharacter {
  name: string;
  level: number;
}

export interface NormalizedDeathHistoryEntry {
  id: string;
  endedAt: number;
  floor: number;
  x: number;
  y: number;
  seed: string;
  cause: string;
  type: string | null;
  source: string | null;
  character: NormalizedDeathHistoryCharacter | null;
  lostItems: string[];
  deepestFloor: number;
  kills: number;
  chestsOpened: number;
}

export type NormalizedDeathHistory = NormalizedDeathHistoryEntry[];

export interface DeathLogSummary {
  floor: number;
  type: string;
  source: string;
  cause: string;
  count: number;
}

const RUN_DEATH_LOG_FIELDS = new Set(["charName", "cause", "floor", "turn", "type", "source"]);
const DEATH_HISTORY_FIELDS = new Set([
  "id", "endedAt", "floor", "x", "y", "seed", "cause", "type", "source", "character",
  "lostItems", "deepestFloor", "kills", "chestsOpened"
]);
const DEATH_HISTORY_CHARACTER_FIELDS = new Set(["name", "level"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

function hasOnlyFields(value: Record<string, unknown>, fields: Set<string>): boolean {
  return Object.keys(value).every(field => fields.has(field));
}

export function isKnownDeathType(value: unknown): value is AuthoredDeathType {
  return value === DEATH_TYPES.COMBAT || value === DEATH_TYPES.TRAP || value === DEATH_TYPES.STATUS;
}

export function normalizeDeathSource(source: unknown): string {
  return String(source || "").replace(/\s[A-Z]$/, "");
}

export function isNormalizedRunDeathLog(value: unknown): value is NormalizedRunDeathLog {
  return isRecord(value) &&
    hasOnlyFields(value, RUN_DEATH_LOG_FIELDS) &&
    typeof value.charName === "string" &&
    typeof value.cause === "string" &&
    isPositiveInteger(value.floor) &&
    (value.turn === null || isNonNegativeInteger(value.turn)) &&
    (!Object.hasOwn(value, "type") || typeof value.type === "string") &&
    (!Object.hasOwn(value, "source") || typeof value.source === "string");
}

export function isNormalizedRunDeathLogs(value: unknown): value is NormalizedRunDeathLogs {
  return isDenseArray(value) && value.every(isNormalizedRunDeathLog);
}

export function normalizeRunDeathLog(value: unknown): NormalizedRunDeathLog | null {
  if (!isRecord(value)) return null;
  const normalized: NormalizedRunDeathLog = {
    charName: typeof value.charName === "string" ? value.charName : "",
    cause: typeof value.cause === "string" ? value.cause : "",
    floor: isPositiveInteger(value.floor) ? value.floor : 1,
    turn: isNonNegativeInteger(value.turn) ? value.turn : null
  };
  if (typeof value.type === "string") normalized.type = value.type;
  if (typeof value.source === "string") normalized.source = value.source;
  return normalized;
}

export function normalizeRunDeathLogs(value: unknown): NormalizedRunDeathLogs {
  if (!Array.isArray(value)) return [];
  const normalized: NormalizedRunDeathLogs = [];
  for (const entry of value) {
    const normalizedEntry = normalizeRunDeathLog(entry);
    if (normalizedEntry) normalized.push(normalizedEntry);
  }
  return normalized;
}

function normalizeDeathHistoryCharacter(value: unknown): NormalizedDeathHistoryCharacter | null {
  if (!isRecord(value)) return null;
  return {
    name: typeof value.name === "string" ? value.name : "",
    level: isPositiveInteger(value.level) ? value.level : 1
  };
}

function isNormalizedDeathHistoryCharacter(value: unknown): value is NormalizedDeathHistoryCharacter {
  return isRecord(value) &&
    hasOnlyFields(value, DEATH_HISTORY_CHARACTER_FIELDS) &&
    typeof value.name === "string" &&
    isPositiveInteger(value.level);
}

export function isNormalizedDeathHistoryEntry(value: unknown): value is NormalizedDeathHistoryEntry {
  return isRecord(value) &&
    hasOnlyFields(value, DEATH_HISTORY_FIELDS) &&
    Object.hasOwn(value, "id") && typeof value.id === "string" &&
    Object.hasOwn(value, "endedAt") && isNonNegativeInteger(value.endedAt) &&
    Object.hasOwn(value, "floor") && isPositiveInteger(value.floor) &&
    Object.hasOwn(value, "x") && isInteger(value.x) &&
    Object.hasOwn(value, "y") && isInteger(value.y) &&
    Object.hasOwn(value, "seed") && typeof value.seed === "string" &&
    Object.hasOwn(value, "cause") && typeof value.cause === "string" &&
    Object.hasOwn(value, "type") && (value.type === null || typeof value.type === "string") &&
    Object.hasOwn(value, "source") && (value.source === null || typeof value.source === "string") &&
    Object.hasOwn(value, "character") &&
    (value.character === null || isNormalizedDeathHistoryCharacter(value.character)) &&
    Object.hasOwn(value, "lostItems") && isDenseArray(value.lostItems) &&
    value.lostItems.every(item => typeof item === "string") &&
    Object.hasOwn(value, "deepestFloor") && isPositiveInteger(value.deepestFloor) &&
    Object.hasOwn(value, "kills") && isNonNegativeInteger(value.kills) &&
    Object.hasOwn(value, "chestsOpened") && isNonNegativeInteger(value.chestsOpened);
}

export function isNormalizedDeathHistory(value: unknown): value is NormalizedDeathHistory {
  return isDenseArray(value) && value.every(isNormalizedDeathHistoryEntry);
}

export function normalizeDeathHistoryEntry(value: unknown): NormalizedDeathHistoryEntry | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === "string" ? value.id : "",
    endedAt: isNonNegativeInteger(value.endedAt) ? value.endedAt : 0,
    floor: isPositiveInteger(value.floor) ? value.floor : 1,
    x: isInteger(value.x) ? value.x : 0,
    y: isInteger(value.y) ? value.y : 0,
    seed: typeof value.seed === "string" ? value.seed : "",
    cause: typeof value.cause === "string" ? value.cause : "",
    type: typeof value.type === "string" ? value.type : null,
    source: typeof value.source === "string" ? value.source : null,
    character: normalizeDeathHistoryCharacter(value.character),
    lostItems: Array.isArray(value.lostItems)
      ? value.lostItems.filter((item): item is string => typeof item === "string")
      : [],
    deepestFloor: isPositiveInteger(value.deepestFloor) ? value.deepestFloor : 1,
    kills: isNonNegativeInteger(value.kills) ? value.kills : 0,
    chestsOpened: isNonNegativeInteger(value.chestsOpened) ? value.chestsOpened : 0
  };
}

export function normalizeDeathHistory(value: unknown): NormalizedDeathHistory {
  if (!Array.isArray(value)) return [];
  const normalized: NormalizedDeathHistory = [];
  for (const entry of value) {
    const normalizedEntry = normalizeDeathHistoryEntry(entry);
    if (normalizedEntry) normalized.push(normalizedEntry);
  }
  return normalized;
}

export function summarizeDeathLogs(deathLogs: unknown = []): DeathLogSummary[] {
  const groups = new Map<string, DeathLogSummary>();

  (Array.isArray(deathLogs) ? deathLogs : []).forEach(log => {
    if (!isRecord(log) || !log.type || !log.source || !Number.isFinite(Number(log.floor))) return;

    const floor = Math.max(1, Math.floor(Number(log.floor)));
    const type = String(log.type);
    const source = normalizeDeathSource(log.source);
    const key = `${floor}\u0000${type}\u0000${source}`;
    const current = groups.get(key);
    if (current) {
      current.count++;
      return;
    }

    groups.set(key, {
      floor,
      type,
      source,
      cause: typeof log.cause === "string" && log.cause ? log.cause : source,
      count: 1
    });
  });

  return [...groups.values()].sort((a, b) => (
    b.count - a.count ||
    b.floor - a.floor ||
    a.source.localeCompare(b.source, "ja")
  ));
}
