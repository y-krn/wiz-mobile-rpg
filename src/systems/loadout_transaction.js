import { state, addLog } from "../state.js";
import { getItemData } from "../data.js";
import { getCharMaxMp } from "../rules/character_stats.js";
import { getLoadoutDraftChanges, isLoadoutDraftDirty, validateLoadoutDraft } from "../rules/loadout_transaction.js";
import { trackEquipmentDecision, trackLoadoutTransaction, trackLootLifecycle } from "../telemetry.js";
import { getEquipmentPreview, getUnequipPreview } from "../rules/equipment_preview.js";
import { findRunObjectLootEntry } from "../state/run_loot.js";
import { revealEquipmentOnEquip } from "./identification.js";

function getName(item) {
  return getItemData(item)?.name || "装備品";
}

function describeChange(change) {
  const from = change.from ? getName(change.from) : "なし";
  const to = change.to ? getName(change.to) : "なし";
  return `${from} → ${to}`;
}

export function commitLoadoutDraft(draft, { stateLike = state } = {}) {
  if (stateLike.gameState === "combat") return { ok: false, reason: "combat_locked" };
  if (!isLoadoutDraftDirty(draft)) return { ok: true, changed: false, turnCost: 0, changes: getLoadoutDraftChanges(draft) };
  const validation = validateLoadoutDraft(draft);
  if (!validation.ok) return { ok: false, reason: "invalid_draft", errors: validation.errors };

  const changes = getLoadoutDraftChanges(draft);
  const previousParty = stateLike.party;
  changes.equipment.forEach(change => {
    const character = previousParty?.[change.actorIdx];
    const preview = change.to
      ? getEquipmentPreview(character, change.to, change.slot, { floor: stateLike.floor })
      : getUnequipPreview(character, change.slot, { floor: stateLike.floor });
    trackEquipmentDecision(change.to ? "equip" : "unequip", {
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

  // Validation has completed against the complete projected state. Only now
  // replace the live placement arrays; no intermediate inventory is exposed.
  stateLike.party = draft.party;
  stateLike.inventory = [...draft.inventory];
  stateLike.party.forEach(character => {
    if (!Number.isFinite(character.mp)) return;
    character.mp = Math.min(character.mp, Math.max(0, getCharMaxMp(character)));
  });

  changes.equipment
    .filter(change => change.to)
    .forEach(change => {
      const reveal = revealEquipmentOnEquip(change.to);
      const character = stateLike.party?.[change.actorIdx];
      trackLootLifecycle("adopted", {
        state: stateLike,
        character,
        itemKey: change.to,
        lootId: findRunObjectLootEntry(stateLike, change.to)?.id,
        source: "dungeon"
      });
      if (reveal.cursed) addLog(`[呪い装備] ${getName(change.to)}は外せない。`);
    });

  const equipmentText = changes.equipment
    .map(change => describeChange(change))
    .join(" / ");
  const runeCount = changes.runes.reduce((sum, change) => sum + Math.max(change.from.length, change.to.length), 0);
  addLog(`装備変更を確定した。${equipmentText}${runeCount ? ` / Rune変更 ${runeCount}件` : ""}`);
  trackLoadoutTransaction("commit", {
    state: stateLike,
    equipmentChanges: changes.equipment.length,
    runeChanges: changes.runes.length,
    discardedItems: changes.discarded.length,
    turnCost: 1
  });
  return { ok: true, changed: true, turnCost: 1, changes };
}
