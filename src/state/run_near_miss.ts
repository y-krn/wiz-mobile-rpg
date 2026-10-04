// balance-impact: none — persisted death-result facts only (#2003).
//
// A near-miss record is a bounded set of facts captured at the moment a run
// ends in death. It never feeds a rule, a reward, or the next run; the result
// screen renders it so a death reads as "almost", not as an unexplained loss.

export type NearMissEnemyKind = "guardian" | "elite" | "normal";
export type NearMissEnemyState = "健在" | "負傷" | "重傷" | "状態不明";

export interface NormalizedNearMissEnemy {
  name: string;
  kind: NearMissEnemyKind;
  state: NearMissEnemyState;
}

export interface NormalizedNearMissBestDepth {
  best: number;
  gap: number;
}

export type NearMissPortalKind = "ahead" | "guardian_ahead" | "guardian_defeated";

export interface NormalizedNearMissPortal {
  kind: NearMissPortalKind;
  floor: number;
  gap: number;
}

export interface NormalizedNearMissUnusedItem {
  itemId: string;
  count: number;
}

export interface NormalizedRunNearMiss {
  enemies: NormalizedNearMissEnemy[];
  defeatedInBattle: number;
  bestDepth: NormalizedNearMissBestDepth | null;
  portal: NormalizedNearMissPortal | null;
  unused: NormalizedNearMissUnusedItem[];
}

export const NEAR_MISS_ENEMY_LIMIT = 4;
export const NEAR_MISS_UNUSED_LIMIT = 8;

const ENEMY_KINDS: readonly NearMissEnemyKind[] = ["guardian", "elite", "normal"];
const ENEMY_STATES: readonly NearMissEnemyState[] = ["健在", "負傷", "重傷", "状態不明"];
const PORTAL_KINDS: readonly NearMissPortalKind[] = ["ahead", "guardian_ahead", "guardian_defeated"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

function isEnemyKind(value: unknown): value is NearMissEnemyKind {
  return ENEMY_KINDS.some(kind => kind === value);
}

function isEnemyState(value: unknown): value is NearMissEnemyState {
  return ENEMY_STATES.some(state => state === value);
}

function isPortalKind(value: unknown): value is NearMissPortalKind {
  return PORTAL_KINDS.some(kind => kind === value);
}

function isNormalizedEnemy(value: unknown): value is NormalizedNearMissEnemy {
  return isRecord(value) &&
    typeof value.name === "string" && value.name.length > 0 &&
    isEnemyKind(value.kind) &&
    isEnemyState(value.state);
}

function isNormalizedBestDepth(value: unknown): value is NormalizedNearMissBestDepth {
  return isRecord(value) && isPositiveInteger(value.best) && isNonNegativeInteger(value.gap);
}

function isNormalizedPortal(value: unknown): value is NormalizedNearMissPortal {
  return isRecord(value) &&
    isPortalKind(value.kind) &&
    isPositiveInteger(value.floor) &&
    isNonNegativeInteger(value.gap);
}

function isNormalizedUnusedItem(value: unknown): value is NormalizedNearMissUnusedItem {
  return isRecord(value) &&
    typeof value.itemId === "string" && value.itemId.length > 0 &&
    isPositiveInteger(value.count);
}

export function isNormalizedRunNearMiss(value: unknown): value is NormalizedRunNearMiss {
  return isRecord(value) &&
    Array.isArray(value.enemies) &&
    value.enemies.length <= NEAR_MISS_ENEMY_LIMIT &&
    value.enemies.every(isNormalizedEnemy) &&
    isNonNegativeInteger(value.defeatedInBattle) &&
    (value.bestDepth === null || isNormalizedBestDepth(value.bestDepth)) &&
    (value.portal === null || isNormalizedPortal(value.portal)) &&
    Array.isArray(value.unused) &&
    value.unused.length <= NEAR_MISS_UNUSED_LIMIT &&
    value.unused.every(isNormalizedUnusedItem);
}

/**
 * Normalize a saved near-miss record. Malformed entries are dropped one by
 * one; a record that ends up without any fact normalizes to `null` so the
 * result screen never renders an empty section.
 */
export function normalizeRunNearMiss(value: unknown): NormalizedRunNearMiss | null {
  if (!isRecord(value)) return null;
  const enemies = Array.isArray(value.enemies)
    ? value.enemies.filter(isNormalizedEnemy)
      .slice(0, NEAR_MISS_ENEMY_LIMIT)
      .map(enemy => ({ name: enemy.name, kind: enemy.kind, state: enemy.state }))
    : [];
  const unused = Array.isArray(value.unused)
    ? value.unused.filter(isNormalizedUnusedItem)
      .slice(0, NEAR_MISS_UNUSED_LIMIT)
      .map(item => ({ itemId: item.itemId, count: item.count }))
    : [];
  const bestDepth = isNormalizedBestDepth(value.bestDepth)
    ? { best: value.bestDepth.best, gap: value.bestDepth.gap }
    : null;
  const portal = isNormalizedPortal(value.portal)
    ? { kind: value.portal.kind, floor: value.portal.floor, gap: value.portal.gap }
    : null;
  const defeatedInBattle = isNonNegativeInteger(value.defeatedInBattle) ? value.defeatedInBattle : 0;
  if (enemies.length === 0 && unused.length === 0 && !bestDepth && !portal && defeatedInBattle === 0) {
    return null;
  }
  return { enemies, defeatedInBattle, bestDepth, portal, unused };
}
