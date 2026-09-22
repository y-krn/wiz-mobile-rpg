import { state, addLog } from "../state.js";
import { getItemData } from "../data.js";
import { getCharMaxMp } from "../rules/character_stats.js";
import { getLoadoutDraftChanges, isLoadoutDraftDirty, validateLoadoutDraft } from "../rules/loadout_transaction.js";
import { trackEquipmentDecision, trackLoadoutTransaction, trackLootLifecycle } from "../telemetry.js";
import { getEquipmentPreview, getUnequipPreview } from "../rules/equipment_preview.js";
import { consumeRunObjectLoot, findRunObjectLootEntry } from "../state/run_loot.js";
import { revealEquipmentOnEquip } from "./identification.js";

type LoadoutCharacter = {
  mp?: number;
};

type TrialAction = {
  actorIdx: number;
  slot: string;
  item: unknown;
  lootId?: unknown;
};

type LoadoutDraft = {
  committed?: boolean;
  party: LoadoutCharacter[];
  inventory: unknown[];
  trialAction?: TrialAction | null;
};

type LoadoutState = {
  gameState?: string;
  party?: LoadoutCharacter[];
  inventory?: unknown[];
  floor?: number;
};

type EquipmentChange = {
  actorIdx: number;
  slot: string;
  from: unknown;
  to: unknown;
};

type LoadoutChanges = {
  equipment: EquipmentChange[];
  runes: Array<{ from: unknown[]; to: unknown[] }>;
  discarded: unknown[];
};

type ValidationResult =
  | { ok: true }
  | { ok: false; errors: unknown };

type LoadoutOptions = {
  stateLike?: LoadoutState;
  turnCost?: unknown;
  worldAction?: unknown;
};

const getChanges: (draft: LoadoutDraft | null | undefined) => LoadoutChanges = getLoadoutDraftChanges;
const isDirty: (draft: LoadoutDraft | null | undefined) => boolean = isLoadoutDraftDirty;
const validateDraft: (draft: LoadoutDraft | null | undefined) => ValidationResult = validateLoadoutDraft;
const getEquipmentPreviewAtBoundary = getEquipmentPreview as unknown as (
  character: LoadoutCharacter | undefined,
  item: unknown,
  slot: string,
  options: { floor: number | undefined }
) => unknown;

function getName(item: unknown): string {
  return getItemData(item)?.name || "装備品";
}

function describeChange(change: EquipmentChange): string {
  const from = change.from ? getName(change.from) : "なし";
  const to = change.to ? getName(change.to) : "なし";
  return `${from} → ${to}`;
}

export function commitLoadoutDraft(
  draft: LoadoutDraft | null | undefined,
  { stateLike = state, turnCost = 0, worldAction = null }: LoadoutOptions = {}
) {
  if (draft?.committed === true) {
    return { ok: true, changed: false, duplicate: true, turnCost: 0, changes: getChanges(draft) };
  }
  const resolvedTurnCost = turnCost === 1 ? 1 : 0;
  if (stateLike.gameState === "combat") return { ok: false, reason: "combat_locked" };
  if (!isDirty(draft)) return { ok: true, changed: false, turnCost: 0, changes: getChanges(draft) };
  const isTrial = Boolean(draft?.trialAction);
  if (isTrial && stateLike.gameState !== "explore" && worldAction !== "explore") {
    return { ok: false, reason: "未鑑定装備の試用は探索中のみ実行できます。" };
  }
  if (isTrial && resolvedTurnCost !== 1) {
    return { ok: false, reason: "試用には探索時間1ターンが必要です。" };
  }
  const validation = validateDraft(draft);
  if (!validation.ok) return { ok: false, reason: "invalid_draft", errors: validation.errors };

  const committedDraft = draft as LoadoutDraft;
  const changes = getChanges(committedDraft);
  const previousParty = stateLike.party;
  changes.equipment.forEach(change => {
    const character = previousParty?.[change.actorIdx];
    const preview = change.to
      ? getEquipmentPreviewAtBoundary(character, change.to, change.slot, { floor: stateLike.floor })
      : getUnequipPreview(character, change.slot, { floor: stateLike.floor });
    const trialTarget = isTrial && change.to && committedDraft.trialAction
      && committedDraft.trialAction.actorIdx === change.actorIdx
      && committedDraft.trialAction.slot === change.slot
      && change.to === committedDraft.trialAction.item;
    trackEquipmentDecision(change.to ? (trialTarget ? "trial" : "equip") : "unequip", {
      state: stateLike,
      character,
      candidateKey: change.to,
      currentKey: change.from,
      preview
    });
  });
  changes.discarded.forEach(itemKey => {
    const character = previousParty?.[0];
    trackEquipmentDecision("discard", {
      state: stateLike,
      character,
      candidateKey: itemKey,
      currentKey: null,
      preview: character ? getEquipmentPreview(character, itemKey, null, { floor: stateLike.floor }) : null
    });
  });

  // Validation completed against the projected state; replace both live arrays atomically.
  stateLike.party = committedDraft.party;
  stateLike.inventory = [...committedDraft.inventory];
  stateLike.party.forEach(character => {
    if (!Number.isFinite(character.mp)) return;
    character.mp = Math.min(character.mp!, Math.max(0, getCharMaxMp(character)));
  });

  changes.discarded.forEach(itemKey => {
    const character = previousParty?.[0];
    const lootId = findRunObjectLootEntry(stateLike, itemKey)?.id;
    consumeRunObjectLoot(stateLike, itemKey);
    trackLootLifecycle("discarded", {
      state: stateLike,
      character,
      itemKey,
      lootId,
      source: "dungeon"
    });
  });

  changes.equipment
    .filter(change => change.to)
    .forEach(change => {
      const reveal = revealEquipmentOnEquip(change.to);
      const character = stateLike.party?.[change.actorIdx];
      const trialTarget = isTrial && committedDraft.trialAction
        && committedDraft.trialAction.actorIdx === change.actorIdx
        && committedDraft.trialAction.slot === change.slot
        && change.to === committedDraft.trialAction.item;
      trackLootLifecycle(trialTarget ? "tried" : "adopted", {
        state: stateLike,
        character,
        itemKey: change.to,
        lootId: trialTarget
          ? (committedDraft.trialAction!.lootId || findRunObjectLootEntry(stateLike, change.to)?.id)
          : findRunObjectLootEntry(stateLike, change.to)?.id,
        source: "dungeon"
      });
      if (reveal.cursed) addLog(`[呪い装備] ${getName(change.to)}は外せない。`);
    });

  const equipmentText = changes.equipment
    .map(change => describeChange(change))
    .join(" / ");
  const runeCount = changes.runes.reduce((sum, change) => sum + Math.max(change.from.length, change.to.length), 0);
  addLog(isTrial
    ? `試用を確定した。${equipmentText}（探索時間が進む）`
    : `装備変更を確定した。${equipmentText}${runeCount ? ` / ルーン変更 ${runeCount}件` : ""}`);
  trackLoadoutTransaction("commit", {
    state: stateLike,
    equipmentChanges: changes.equipment.length,
    runeChanges: changes.runes.length,
    discardedItems: changes.discarded.length,
    mode: isTrial ? "trial" : "loadout",
    turnCost: resolvedTurnCost
  });
  committedDraft.committed = true;
  return { ok: true, changed: true, turnCost: resolvedTurnCost, changes };
}
