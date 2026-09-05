import { state, addLog, saveAutosave } from "./state.js";
import { getItemData } from "./data.js";
import { getKnowledgeStage, KNOWLEDGE_STAGES } from "./rules/identification_rules.js";
import { getRuneSpellKey } from "./rules/magic_rules.js";
import { getItemBaseId, isSpecialOrQuestItem } from "./rules/item_rules.js";
import { isEquipmentItem } from "./rules/equipment_preview.js";
import {
  adoptPendingObjectLoot,
  consumeRunObjectLoot,
  createPendingObjectLootEntry,
  findRunObjectLootEntry
} from "./state/run_loot.js";
import { trackLootLifecycle } from "./telemetry.js";
import {
  createLoadoutDraft,
  stageDiscardInventoryItem,
  stageEquip,
  stageTrialEquip,
  stageSocketRune,
  validateLoadoutDraft
} from "./rules/loadout_transaction.js";
import { resolvePendingRewardPlan } from "./rules/pending_reward_bundle.js";
import { commitLoadoutDraft } from "./systems/loadout_transaction.js";
import { consumeExplorationTurn } from "./movement.js";
import { menuContext, resetSubmenuBackButton } from "./navigation.js";
import { updateUI } from "./ui.js";
import { createBagCapacitySummary } from "./ui/bag_summary.js";
import { setDockActionRole } from "./ui/common_shell.js";

export const PENDING_REWARD_MENU = "pending_rewards";

function getRun(stateLike = state) {
  return stateLike?.currentRun && typeof stateLike.currentRun === "object"
    ? stateLike.currentRun
    : null;
}

function getBundle(stateLike = state) {
  const bundle = getRun(stateLike)?.pendingRewardBundle;
  return bundle && Array.isArray(bundle.entries) && bundle.entries.length > 0 ? bundle : null;
}

export function hasPendingRewardBundle(stateLike = state) {
  return Boolean(getBundle(stateLike));
}

function isBankableObject(item) {
  const data = getItemData(item);
  return Boolean(data) && !isSpecialOrQuestItem(getItemBaseId(item)) && data.type !== "quest" && data.type !== "key";
}

export function stagePendingRewardBundle(
  stateLike = state,
  rewards = [],
  { source = "chest", floor = stateLike.floor, x = stateLike.x, y = stateLike.y } = {}
) {
  const run = getRun(stateLike);
  if (!run || hasPendingRewardBundle(stateLike)) return null;

  const entries = rewards
    .filter(reward => reward?.item && isBankableObject(reward.item))
    .map(reward => {
      const entry = createPendingObjectLootEntry(stateLike, reward.item, {
        source,
        role: reward.role || "object"
      });
      if (!entry) return null;
      return {
        ...entry,
        decision: null,
        loadoutAction: null
      };
    })
    .filter(Boolean);

  if (entries.length === 0) return null;
  run.pendingRewardBundle = {
    id: `${entries[0].id}:bundle`,
    source,
    floor: Number(floor) || 1,
    x: Number.isInteger(x) ? x : null,
    y: Number.isInteger(y) ? y : null,
    entries,
    discardIndexes: []
  };
  return run.pendingRewardBundle;
}

function sameItem(left, right) {
  if (left === right) return true;
  return Boolean(left?.instanceId && right?.instanceId && left.instanceId === right.instanceId);
}

function itemName(item) {
  return getItemData(item)?.name || "未知の戦果";
}

function isKnownLoadoutItem(item) {
  return (isEquipmentItem(getItemData(item)) || Boolean(getRuneSpellKey(item))) &&
    getKnowledgeStage(item) === KNOWLEDGE_STAGES.FULL;
}

function isUnknownLoadoutItem(item) {
  return isEquipmentItem(getItemData(item)) && getKnowledgeStage(item) !== KNOWLEDGE_STAGES.FULL;
}

function normalizeDiscardIndexes(bundle, inventory) {
  const indexes = [...new Set((bundle.discardIndexes || [])
    .filter(index => Number.isInteger(index) && index >= 0 && index < inventory.length))];
  bundle.discardIndexes = indexes;
  return indexes;
}

function getTakenEntries(bundle) {
  return bundle.entries.filter(entry => entry.decision === "take");
}

function getPendingActionEntry(bundle, entry) {
  const action = entry.loadoutAction;
  if (!action) return null;
  if (entry.decision !== "take") return { reason: "装備候補は持つを選んでください。" };
  if (!action.type || !["equip", "socket", "trial"].includes(action.type)) {
    return { reason: "不明な装備操作です。" };
  }
  if (action.type === "trial" && !isUnknownLoadoutItem(entry.item)) {
    return { reason: "試用できる未鑑定装備ではありません。" };
  }
  if (action.type !== "trial" && !isKnownLoadoutItem(entry.item)) {
    return { reason: "未鑑定品は『試す』から実際に装備してください。" };
  }
  if (action.type === "socket" && !getRuneSpellKey(entry.item)) {
    return { reason: "Rune以外はsocketできません。" };
  }
  if (action.type === "equip" && getRuneSpellKey(entry.item)) {
    return { reason: "Runeはsocket候補にしてください。" };
  }
  if (action.type === "trial" && getRuneSpellKey(entry.item)) {
    return { reason: "Runeは試用できません。" };
  }
  return null;
}

function validateResolution(stateLike, bundle) {
  const inventory = Array.isArray(stateLike.inventory) ? stateLike.inventory : [];
  const discardIndexes = normalizeDiscardIndexes(bundle, inventory);
  const taken = getTakenEntries(bundle);
  if (bundle.entries.some(entry => !["take", "leave"].includes(entry.decision))) {
    return { ok: false, reason: "すべての戦果を持つか置いていくか選んでください。" };
  }
  const actionError = bundle.entries.map(entry => getPendingActionEntry(bundle, entry)).find(Boolean);
  if (actionError) return { ok: false, reason: actionError.reason };
  if (taken.some(entry => getItemData(entry.item)?.id === "TOWN_PORTAL" && inventory.some(item => getItemData(item)?.id === "TOWN_PORTAL"))) {
    return { ok: false, reason: "帰還の翼はすでに所持しています。置いていくを選んでください。" };
  }
  const hasLoadoutAction = bundle.entries.some(entry => entry.loadoutAction);
  const trialEntries = bundle.entries.filter(entry => entry.loadoutAction?.type === "trial");
  const normalLoadoutEntries = bundle.entries.filter(entry => ["equip", "socket"].includes(entry.loadoutAction?.type));
  if (trialEntries.length > 1) return { ok: false, reason: "試用できる装備は1件ずつ確定してください。" };
  if (trialEntries.length > 0 && normalLoadoutEntries.length > 0) {
    return { ok: false, reason: "試用は通常の装備変更と同じ戦果解決に混ぜられません。" };
  }
  let plan = null;
  let loadoutDraft = null;
  if (hasLoadoutAction) {
    const projected = buildPendingLoadoutDraft(stateLike, bundle, taken, discardIndexes);
    if (!projected.ok) return projected;
    const draftValidation = validateLoadoutDraft(projected.draft);
    if (!draftValidation.ok) return { ok: false, reason: draftValidation.errors.join(" ") };
    loadoutDraft = projected.draft;
  } else {
    plan = resolvePendingRewardPlan({
      bagCount: inventory.length,
      rewardCount: bundle.entries.length,
      takeCount: taken.length,
      discardCount: discardIndexes.length,
      loadoutChanged: false
    });
    if (!plan.ok) {
      const finalBagCount = inventory.length - discardIndexes.length + taken.length;
      return { ok: false, reason: `最終バッグが${finalBagCount}/20枠です。既存品を選んで置いてください。` };
    }
  }
  return {
    ok: true,
    discardIndexes,
    taken,
    finalBagCount: loadoutDraft?.inventory.length ?? plan.bagCount - plan.discardCount + plan.takeCount,
    loadoutDraft
  };
}

function findDraftItemIndex(draft, item) {
  for (let index = draft.inventory.length - 1; index >= 0; index -= 1) {
    if (sameItem(draft.inventory[index], item)) return index;
  }
  return -1;
}

function buildPendingLoadoutDraft(stateLike, bundle, taken, discardIndexes) {
  let draft = createLoadoutDraft(stateLike);
  const trialEntries = bundle.entries.filter(entry => entry.loadoutAction?.type === "trial");
  taken.filter(entry => !trialEntries.includes(entry)).forEach(entry => draft.inventory.push(entry.item));
  [...discardIndexes].sort((left, right) => right - left).forEach(index => {
    const staged = stageDiscardInventoryItem(draft, index);
    if (staged.ok) draft = staged.draft;
  });
  for (const entry of bundle.entries.filter(candidate => candidate.loadoutAction)) {
    const inventoryIndex = findDraftItemIndex(draft, entry.item);
    const staged = entry.loadoutAction.type === "trial"
      ? stageTrialEquip(draft, {
        actorIdx: entry.loadoutAction.actorIdx ?? 0,
        item: entry.item,
        requestedSlot: entry.loadoutAction.requestedSlot || null
      })
      : inventoryIndex < 0
      ? { ok: false, reason: `${itemName(entry.item)}をdraftに置けません。` }
      : entry.loadoutAction.type === "socket"
      ? stageSocketRune(draft, { actorIdx: entry.loadoutAction.actorIdx ?? 0, inventoryIndex })
      : stageEquip(draft, {
        actorIdx: entry.loadoutAction.actorIdx ?? 0,
        inventoryIndex,
        requestedSlot: entry.loadoutAction.requestedSlot || null
      });
    if (!staged.ok) return { ok: false, reason: staged.reason || `${itemName(entry.item)}を変更できません。` };
    draft = staged.draft;
  }
  return { ok: true, draft };
}

function discardDirectInventoryItems(stateLike, indexes) {
  const discarded = [...indexes]
    .sort((left, right) => right - left)
    .map(index => stateLike.inventory[index])
    .filter(Boolean);
  discarded.forEach(item => {
    const lootId = findRunObjectLootEntry(stateLike, item)?.id;
    consumeRunObjectLoot(stateLike, item);
    trackLootLifecycle("discarded", {
      state: stateLike,
      itemKey: item,
      lootId,
      source: "dungeon"
    });
  });
  [...indexes].sort((left, right) => right - left).forEach(index => stateLike.inventory.splice(index, 1));
  return discarded;
}

function clearPendingMenu(stateLike) {
  const run = getRun(stateLike);
  if (run) run.pendingRewardBundle = null;
  stateLike.gameState = "explore";
  menuContext.type = "";
  menuContext.prevGameState = null;
  resetSubmenuBackButton();
}

export function resolvePendingRewardBundle(stateLike = state) {
  const bundle = getBundle(stateLike);
  if (!bundle) return { ok: false, reason: "解決する戦果がありません。" };
  const validation = validateResolution(stateLike, bundle);
  if (!validation.ok) return validation;

  const actionEntries = bundle.entries.filter(entry => entry.loadoutAction);
  let discarded = [];
  let commitResult = { ok: true, changed: false, turnCost: 0 };

  if (actionEntries.length > 0) {
    const draft = validation.loadoutDraft;
    if (!draft) return { ok: false, reason: "装備変更のdraftを作成できません。" };
    commitResult = commitLoadoutDraft(draft, { stateLike, turnCost: 1, worldAction: "explore" });
    if (!commitResult.ok) return commitResult;
  } else {
    discarded = discardDirectInventoryItems(stateLike, validation.discardIndexes);
    stateLike.inventory.push(...validation.taken.map(entry => entry.item));
  }

  validation.taken.forEach(entry => adoptPendingObjectLoot(stateLike, entry, { source: bundle.source }));
  bundle.entries
    .filter(entry => entry.decision === "leave")
    .forEach(entry => trackLootLifecycle("left", {
      state: stateLike,
      itemKey: entry.item,
      lootId: entry.id,
      source: bundle.source
    }));

  const discardedNames = discarded.map(itemName);
  const takenNames = validation.taken.map(entry => itemName(entry.item));
  const leftNames = bundle.entries.filter(entry => entry.decision === "leave").map(entry => itemName(entry.item));
  const summary = [
    discardedNames.length ? `${discardedNames.join("・")}を置いて` : "",
    takenNames.length ? `${takenNames.join("・")}を持つ` : "",
    leftNames.length ? `${leftNames.join("・")}を置いていく` : ""
  ].filter(Boolean).join("。 ");
  addLog(summary ? `[戦果解決] ${summary}。` : "[戦果解決] 戦果を置いていった。");

  clearPendingMenu(stateLike);
  if (commitResult.turnCost === 1) consumeExplorationTurn();
  saveAutosave();
  updateUI();
  return {
    ok: true,
    changed: commitResult.changed || validation.taken.length > 0 || validation.discardIndexes.length > 0,
    turnCost: commitResult.turnCost,
    taken: validation.taken,
    left: bundle.entries.filter(entry => entry.decision === "leave"),
    discarded
  };
}

function createActionButton(text, className, onClick, id = "") {
  const button = document.createElement("button");
  button.type = "button";
  if (id) button.id = id;
  button.className = className;
  button.textContent = text;
  button.style.minHeight = "44px";
  button.addEventListener("click", onClick);
  return button;
}

function renderPendingRewardMenu() {
  const bundle = getBundle(state);
  if (!bundle) return false;
  const optGrid = document.getElementById("submenu-options");
  if (!optGrid) return false;
  optGrid.className = "submenu-grid pending-reward-grid";
  optGrid.innerHTML = "";
  document.getElementById("submenu-title").textContent = "発見した戦果を解決";

  const info = document.createElement("div");
  info.className = "pending-reward-intro";
  info.textContent = "次の探索へ進む前に、同じ取得イベントの戦果をまとめて決めてください。置いていく戦果はバッグに入りません。";
  optGrid.appendChild(info);

  const discardIndexes = normalizeDiscardIndexes(bundle, state.inventory);
  const projectedInventory = state.inventory.filter((_, index) => !discardIndexes.includes(index));
  const projectedCount = projectedInventory.length + getTakenEntries(bundle).length;
  optGrid.appendChild(createBagCapacitySummary(projectedInventory, {
    className: "pending-reward-bag-status",
    note: projectedCount > 20
      ? `確定後 ${projectedCount}/20枠。既存品を選んで置いてください。`
      : `確定後 ${projectedCount}/20枠。pending戦果はまだバッグではありません。`
  }));

  bundle.entries.forEach(entry => {
    const card = document.createElement("section");
    card.className = "pending-reward-card";
    if (!card.dataset) card.dataset = {};
    card.dataset.rewardId = entry.id;
    const item = getItemData(entry.item);
    const heading = document.createElement("strong");
    heading.textContent = `${item?.name || "戦果"}（${entry.role}）`;
    card.appendChild(heading);
    const detail = document.createElement("small");
    detail.textContent = entry.loadoutAction?.type === "trial"
      ? "試す（探索時間が進む）"
      : entry.decision === "take" ? "持つ" : entry.decision === "leave" ? "置いていく" : "未決定";
    card.appendChild(detail);
    const actions = document.createElement("div");
    actions.className = "pending-reward-actions";
    actions.appendChild(createActionButton("持つ", "btn btn-neon", () => {
      entry.decision = "take";
      entry.loadoutAction = null;
      saveAutosave();
      renderPendingRewardMenu();
      updateUI();
    }));
    actions.appendChild(createActionButton("置いていく", "btn btn-danger", () => {
      entry.decision = "leave";
      entry.loadoutAction = null;
      saveAutosave();
      renderPendingRewardMenu();
      updateUI();
    }));
    if (isKnownLoadoutItem(entry.item) && !getRuneSpellKey(entry.item)) {
      actions.appendChild(createActionButton("装備して持つ", "btn btn-neon", () => {
        entry.decision = "take";
        entry.loadoutAction = { type: "equip", actorIdx: 0, requestedSlot: null };
        saveAutosave();
        renderPendingRewardMenu();
        updateUI();
      }));
    }
    if (isUnknownLoadoutItem(entry.item)) {
      actions.appendChild(createActionButton("試す（探索時間が進む）", "btn btn-neon", () => {
        entry.decision = "take";
        entry.loadoutAction = { type: "trial", actorIdx: 0, requestedSlot: null };
        saveAutosave();
        renderPendingRewardMenu();
        updateUI();
      }));
    }
    if (isKnownLoadoutItem(entry.item) && getRuneSpellKey(entry.item)) {
      actions.appendChild(createActionButton("socketして持つ", "btn btn-neon", () => {
        entry.decision = "take";
        entry.loadoutAction = { type: "socket", actorIdx: 0 };
        saveAutosave();
        renderPendingRewardMenu();
        updateUI();
      }));
    }
    card.appendChild(actions);
    optGrid.appendChild(card);
  });

  const discardHeading = document.createElement("h4");
  discardHeading.textContent = "既存バッグから置いていく品（必要な場合のみ）";
  optGrid.appendChild(discardHeading);
  state.inventory.forEach((item, index) => {
    const label = document.createElement("label");
    label.className = "pending-reward-discard-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = discardIndexes.includes(index);
    if (!checkbox.dataset) checkbox.dataset = {};
    checkbox.dataset.discardIndex = String(index);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) bundle.discardIndexes = [...new Set([...(bundle.discardIndexes || []), index])];
      else bundle.discardIndexes = (bundle.discardIndexes || []).filter(value => value !== index);
      saveAutosave();
      renderPendingRewardMenu();
      updateUI();
    });
    label.appendChild(checkbox);
    const labelText = document.createElement("span");
    labelText.textContent = ` ${itemName(item)}`;
    label.appendChild(labelText);
    optGrid.appendChild(label);
  });

  const validation = validateResolution(state, bundle);
  const confirm = createActionButton(
    validation.ok ? "この内容で確定する" : validation.reason,
    "btn btn-neon btn-block pending-reward-confirm",
    () => resolvePendingRewardBundle(state),
    "btn-pending-reward-confirm"
  );
  confirm.disabled = !validation.ok;
  setDockActionRole(confirm, "confirm");
  optGrid.appendChild(confirm);
  document.getElementById("btn-submenu-back").style.display = "none";
  return true;
}

export function openPendingRewardMenu() {
  if (!hasPendingRewardBundle()) return false;
  state.gameState = "submenu";
  menuContext.type = PENDING_REWARD_MENU;
  menuContext.prevGameState = "explore";
  menuContext.targetType = "";
  renderPendingRewardMenu();
  updateUI();
  return true;
}
