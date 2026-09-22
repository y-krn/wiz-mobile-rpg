import { getItemBaseId, getItemData, isSpecialOrQuestItem } from "../rules/item_rules.js";
import { trackLootLifecycle } from "../telemetry.js";
import { isRuntimeItemCollection, isRuntimeItemRef, type RuntimeItemRef } from "./item.js";

// This is intentionally separate from equipped/unbagged state. An item can be
// equipped and still remain an unbanked dungeon result until the run ends.
export const RETURN_WING_SALVAGE_COUNT = 2;

export interface NormalizedRunObjectLootEntry {
  id: string;
  item: RuntimeItemRef;
}

export type NormalizedRunObjectLootLedger = NormalizedRunObjectLootEntry[];

interface RunObjectLootEntryLike {
  id?: unknown;
  item?: unknown;
  [key: string]: unknown;
}

interface RunLike {
  startedAt?: unknown;
  lootSequence?: unknown;
  townInventory?: unknown[];
  unbankedObjectLoot?: unknown[];
  returnedTownItems?: unknown[];
  bankedObjectLoot?: unknown[];
  lostObjectLoot?: unknown[];
  [key: string]: unknown;
}

interface StateLike {
  currentRun?: RunLike | null;
  inventory?: unknown[];
  storage?: unknown[];
  party?: unknown[];
  [key: string]: unknown;
}

interface PendingObjectLootEntry {
  id: string;
  role: string;
  item: unknown;
  [key: string]: unknown;
}

interface LootLifecycleOptions {
  source?: string;
  role?: string;
}

interface LootRecordOptions {
  source?: string;
  foundAlreadyTracked?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStateLike(value: unknown): value is StateLike {
  return isRecord(value);
}

function getRun(stateLike: unknown): RunLike | null {
  if (!isStateLike(stateLike) || !isRecord(stateLike.currentRun)) return null;
  return stateLike.currentRun;
}

function getItemId(item: unknown): unknown {
  return getItemBaseId(item);
}

function getObjectLootEntries(run: RunLike): RunObjectLootEntryLike[] {
  if (!Array.isArray(run.unbankedObjectLoot)) return [];
  return run.unbankedObjectLoot.filter(isRecord);
}

function getOrCreateObjectLootLedger(run: RunLike): unknown[] {
  if (!Array.isArray(run.unbankedObjectLoot)) run.unbankedObjectLoot = [];
  return run.unbankedObjectLoot;
}

function hasExactOwnFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === fields.length && fields.every(field => ownKeys.includes(field));
}

export function isNormalizedRunObjectLootEntry(
  value: unknown
): value is NormalizedRunObjectLootEntry {
  return isRecord(value) &&
    hasExactOwnFields(value, ["id", "item"]) &&
    typeof value.id === "string" &&
    isRuntimeItemRef(value.item);
}

export function isNormalizedRunObjectLootLedger(
  value: unknown
): value is NormalizedRunObjectLootLedger {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isNormalizedRunObjectLootEntry(value[index])) return false;
  }
  return true;
}

export function normalizeRunObjectLootEntry(
  value: unknown
): NormalizedRunObjectLootEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRuntimeItemRef(value.item)) {
    return null;
  }
  // Keep the runtime item reference intact. Equipment identity is state-owned.
  return { id: value.id, item: value.item };
}

export function normalizeRunObjectLootLedger(value: unknown): NormalizedRunObjectLootLedger {
  if (!Array.isArray(value)) return [];
  const normalized: NormalizedRunObjectLootLedger = [];
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) continue;
    const entry = normalizeRunObjectLootEntry(value[index]);
    if (entry) normalized.push(entry);
  }
  return normalized;
}

export function findRunObjectLootEntry(stateLike: unknown, item: unknown): RunObjectLootEntryLike | null {
  const run = getRun(stateLike);
  if (!run) return null;
  const itemId = getItemId(item);
  const entries = getObjectLootEntries(run);
  const sameInstance = (candidate: unknown, expected: unknown): boolean => candidate === expected || (
    isRecord(candidate) && isRecord(expected) &&
    Boolean(candidate.instanceId) && candidate.instanceId === expected.instanceId
  );
  const exactEntry = entries.find(entry => sameInstance(entry.item, item));
  // Object actions carry instance identity and may intentionally select a
  // dungeon item despite a Town duplicate. String-key actions do not carry
  // ownership identity, so preserve Town-first consumption policy.
  if (exactEntry && item !== null && typeof item === "object") return exactEntry;
  const townInventory = Array.isArray(run.townInventory) ? run.townInventory : [];
  if (townInventory.some(entry => getItemId(entry) === itemId)) return null;
  return exactEntry || entries.find(entry => getItemId(entry.item) === itemId) || null;
}

function isBankableObject(item: unknown): boolean {
  const itemId = getItemId(item);
  return Boolean(itemId) && !isSpecialOrQuestItem(itemId);
}

function nextLootId(run: RunLike): string {
  run.lootSequence = Math.max(0, Math.floor(Number(run.lootSequence) || 0)) + 1;
  return `${run.startedAt || "run"}:loot:${run.lootSequence}`;
}

export function createPendingObjectLootEntry(
  stateLike: unknown,
  item: unknown,
  { source = "dungeon", role = "object" }: LootLifecycleOptions = {}
): PendingObjectLootEntry | null {
  const run = getRun(stateLike);
  if (!run || !isBankableObject(item)) return null;
  const id = nextLootId(run);
  trackLootLifecycle("found", { state: stateLike, itemKey: item, source, lootId: id });
  return { id, role, item };
}

export function adoptPendingObjectLoot(
  stateLike: unknown,
  entry: unknown,
  { source = "dungeon" }: LootLifecycleOptions = {}
): boolean {
  const run = getRun(stateLike);
  if (!run || !isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      !isBankableObject(entry.item)) return false;
  const ledger = getOrCreateObjectLootLedger(run);
  if (ledger.some(candidate => isRecord(candidate) && candidate.id === entry.id)) return false;
  // role/source are decision-time facts and are deliberately not persisted.
  ledger.push({ id: entry.id, item: entry.item });
  trackLootLifecycle("bagged", {
    state: stateLike,
    itemKey: entry.item,
    source,
    lootId: entry.id,
    ownership: "unbanked"
  });
  return true;
}

export function resolvePendingObjectLootDisposition(
  stateLike: unknown,
  entry: unknown,
  disposition: unknown,
  { source = "dungeon" }: LootLifecycleOptions = {}
): boolean {
  if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      !isBankableObject(entry.item)) return false;
  if (disposition !== "discarded" && disposition !== "left") return false;
  trackLootLifecycle(disposition, {
    state: stateLike,
    itemKey: entry.item,
    source,
    lootId: entry.id,
    ownership: "unbanked"
  });
  return true;
}

export function recordDungeonObjectLoot(
  stateLike: unknown,
  item: unknown,
  { source = "dungeon", foundAlreadyTracked = false }: LootRecordOptions = {}
): boolean {
  const run = getRun(stateLike);
  if (!run || !isBankableObject(item)) return false;
  const id = nextLootId(run);
  if (!foundAlreadyTracked) {
    trackLootLifecycle("found", { state: stateLike, itemKey: item, source, lootId: id });
  }
  const ledger = getOrCreateObjectLootLedger(run);
  ledger.push({ id, item });
  trackLootLifecycle("bagged", {
    state: stateLike,
    itemKey: item,
    source,
    lootId: id,
    ownership: "unbanked"
  });
  return true;
}

export function consumeRunObjectLoot(stateLike: unknown, item: unknown): boolean {
  const run = getRun(stateLike);
  if (!run) return false;
  const itemId = getItemId(item);
  const ledger = Array.isArray(run.unbankedObjectLoot) ? run.unbankedObjectLoot : [];
  const exactUnbankedIndex = item && typeof item === "object"
    ? ledger.findIndex(entry => isRecord(entry) && (
      entry.item === item || (
        isRecord(entry.item) && isRecord(item) &&
        Boolean(item.instanceId) && item.instanceId === entry.item.instanceId
      )
    ))
    : -1;
  if (exactUnbankedIndex !== -1) {
    ledger.splice(exactUnbankedIndex, 1);
    return true;
  }
  // Current item-use actions carry only a base item ID, not an ownership ID.
  // Confirmed Town stock remains the first fallback.
  const townInventory = Array.isArray(run.townInventory) ? run.townInventory : [];
  const townIndex = townInventory.findIndex(entry => getItemId(entry) === itemId);
  if (townIndex !== -1) {
    townInventory.splice(townIndex, 1);
    return true;
  }
  const unbankedIndex = ledger.findIndex(entry =>
    isRecord(entry) && getItemId(entry.item) === itemId
  );
  if (unbankedIndex !== -1) {
    ledger.splice(unbankedIndex, 1);
    return true;
  }
  return false;
}

export function replaceRunObjectLoot(
  stateLike: unknown,
  previousItem: unknown,
  nextItem: unknown
): boolean {
  const run = getRun(stateLike);
  if (!run) return false;
  const previousId = getItemId(previousItem);
  const sameInstance = (candidate: unknown, expected: unknown): boolean => candidate === expected || (
    isRecord(candidate) && isRecord(expected) &&
    Boolean(candidate.instanceId) && candidate.instanceId === expected.instanceId
  );
  const townInventory = Array.isArray(run.townInventory) ? run.townInventory : [];
  const townIndex = townInventory.findIndex(item => sameInstance(item, previousItem));
  if (townIndex !== -1) {
    townInventory[townIndex] = nextItem;
    return true;
  }
  const ledger = getObjectLootEntries(run);
  const unbankedEntry = ledger.find(entry => sameInstance(entry.item, previousItem));
  if (unbankedEntry) {
    unbankedEntry.item = nextItem;
    return true;
  }
  const townFallbackIndex = previousId
    ? townInventory.findIndex(item => getItemId(item) === previousId)
    : -1;
  if (townFallbackIndex !== -1) {
    townInventory[townFallbackIndex] = nextItem;
    return true;
  }
  const unbankedFallback = previousId
    ? ledger.find(entry => getItemId(entry.item) === previousId)
    : null;
  if (unbankedFallback) {
    unbankedFallback.item = nextItem;
    return true;
  }
  return false;
}

function takeByIds(entries: RunObjectLootEntryLike[], selectedIds: unknown[] | null = null): RunObjectLootEntryLike[] {
  const selected = selectedIds ? new Set(selectedIds) : null;
  return entries.filter(entry => !selected || selected.has(entry.id));
}

function removeTrackedItemsFromInventory(stateLike: StateLike, items: unknown[]): void {
  const remaining = new Map<unknown, number>();
  items.forEach(item => {
    const itemId = getItemId(item);
    if (itemId) remaining.set(itemId, (remaining.get(itemId) || 0) + 1);
  });
  stateLike.inventory = (stateLike.inventory || []).filter(item => {
    const itemId = getItemId(item);
    const count = remaining.get(itemId) || 0;
    if (count <= 0) return true;
    remaining.set(itemId, count - 1);
    return false;
  });
}

function removeTrackedItemsFromEquipment(
  stateLike: StateLike,
  entries: RunObjectLootEntryLike[],
  inventoryBeforeRemoval: unknown[],
  townItems: unknown[]
): void {
  const trackedCounts = new Map<unknown, number>();
  const inventoryCounts = new Map<unknown, number>();
  const townCounts = new Map<unknown, number>();
  entries.forEach(entry => {
    const itemId = getItemId(entry.item);
    if (itemId) trackedCounts.set(itemId, (trackedCounts.get(itemId) || 0) + 1);
  });
  inventoryBeforeRemoval.forEach(item => {
    const itemId = getItemId(item);
    if (itemId) inventoryCounts.set(itemId, (inventoryCounts.get(itemId) || 0) + 1);
  });
  townItems.forEach(item => {
    const itemId = getItemId(item);
    if (itemId) townCounts.set(itemId, (townCounts.get(itemId) || 0) + 1);
  });
  const fallbackEquippedCounts = new Map([...trackedCounts].map(([itemId, count]) => [
    itemId,
    Math.max(0, count - Math.max(0, (inventoryCounts.get(itemId) || 0) - (townCounts.get(itemId) || 0)))
  ]));

  (stateLike.party || []).forEach(character => {
    if (!isRecord(character) || !isRecord(character.equipment)) return;
    const equipment = character.equipment;
    Object.entries(equipment).forEach(([slot, item]) => {
      const itemId = getItemId(item);
      const exactMatch = item && typeof item === "object" && entries.some(entry => (
        entry.item === item || (
          isRecord(entry.item) && isRecord(item) &&
          Boolean(item.instanceId) && item.instanceId === entry.item.instanceId
        )
      ));
      const fallbackMatch = itemId && (fallbackEquippedCounts.get(itemId) || 0) > 0;
      if (item && (exactMatch || fallbackMatch)) {
        equipment[slot] = null;
        if (fallbackMatch) fallbackEquippedCounts.set(itemId, fallbackEquippedCounts.get(itemId)! - 1);
      }
    });
  });
}

function canAppendToTownStorage(stateLike: StateLike, items: unknown[]): boolean {
  if (!isRuntimeItemCollection(items)) return false;
  const currentStorage = stateLike.storage ?? [];
  return isRuntimeItemCollection(currentStorage);
}

function appendToTownStorage(stateLike: StateLike, items: unknown[]): void {
  if (items.length === 0) return;
  const currentStorage = stateLike.storage ?? [];
  stateLike.storage = currentStorage;
  currentStorage.push(...items);
}

function isTownPreparationItem(item: unknown): boolean {
  return getItemData(item)?.type === "usable";
}

/**
 * Resolve object ownership at a run terminal. Town-owned items that were not
 * consumed are always returned to permanent storage. Returned dungeon
 * consumables are also Town preparation stock, while recovered equipment is
 * confirmed only for the terminal result and never becomes next-run storage;
 * death and abandon lose unbanked dungeon loot.
 */
export function settleRunObjectLoot(
  stateLike: unknown,
  outcome: unknown,
  salvageIds: unknown[] | null = null
): { banked: unknown[]; lost: unknown[] } {
  const state = isStateLike(stateLike) ? stateLike : null;
  const run = getRun(stateLike);
  if (!state || !run) return { banked: [], lost: [] };

  const unbanked = getObjectLootEntries(run).filter(entry => entry.item);
  const townItems = Array.isArray(run.townInventory) ? [...run.townInventory] : [];
  const returnedLoot = outcome === "retreat"
    ? unbanked
    : salvageIds
      ? takeByIds(unbanked, salvageIds).slice(0, RETURN_WING_SALVAGE_COUNT)
      : [];
  const lostLoot = unbanked.filter(entry => !returnedLoot.some(item => item.id === entry.id));
  const returnedDungeonItems = returnedLoot.map(entry => entry.item);
  const bankedItems = [...townItems, ...returnedDungeonItems];
  const returnedPreparationItems = returnedDungeonItems.filter(isTownPreparationItem);
  const storageItems = [...townItems, ...returnedPreparationItems];
  if (!canAppendToTownStorage(state, storageItems)) {
    return { banked: [], lost: [] };
  }

  returnedLoot.forEach(entry => trackLootLifecycle(
    outcome === "wing" ? "salvaged" : "banked",
    {
      state: stateLike,
      itemKey: entry.item,
      source: "dungeon",
      lootId: entry.id,
      ownership: "town"
    }
  ));
  lostLoot.forEach(entry => trackLootLifecycle("lost", {
    state: stateLike,
    itemKey: entry.item,
    source: "dungeon",
    lootId: entry.id,
    ownership: "unbanked"
  }));

  appendToTownStorage(state, storageItems);
  removeTrackedItemsFromEquipment(state, unbanked, state.inventory || [], townItems);
  removeTrackedItemsFromInventory(state, [
    ...townItems,
    ...unbanked.map(entry => entry.item)
  ]);

  run.returnedTownItems = townItems;
  run.bankedObjectLoot = returnedLoot.map(entry => entry.item);
  run.lostObjectLoot = lostLoot.map(entry => entry.item);
  run.unbankedObjectLoot = [];
  run.townInventory = [];
  return { banked: bankedItems, lost: run.lostObjectLoot };
}

// balance-impact: none — canonical normalized current-run boundary only.
