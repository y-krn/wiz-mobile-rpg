import { getItemBaseId } from "../rules/item_rules.js";

export const DOCK_STATES = Object.freeze({
  COMPACT: "compact",
  DECISION: "decision",
  EXPANDED: "expanded"
});

export const DOCK_ACTION_ROLES = Object.freeze({
  BACK: "back",
  CONFIRM: "confirm"
});

export const OWNERSHIP_STATES = Object.freeze({
  TOWN_CONFIRMED: "town-confirmed",
  DUNGEON_UNCONFIRMED: "dungeon-unconfirmed",
  WING_SELECTED: "wing-selected",
  LOST: "lost",
  AMBIGUOUS: "ambiguous"
});

export const OWNERSHIP_LABELS = Object.freeze({
  [OWNERSHIP_STATES.TOWN_CONFIRMED]: "街から持ち込んだ品",
  [OWNERSHIP_STATES.DUNGEON_UNCONFIRMED]: "まだ持ち帰っていない品",
  [OWNERSHIP_STATES.WING_SELECTED]: "翼で持ち帰る",
  [OWNERSHIP_STATES.LOST]: "失った品",
  [OWNERSHIP_STATES.AMBIGUOUS]: "品の状態を確認中"
});

const UNRESOLVED_EVENT_PATTERNS = Object.freeze([
  /【気配】/,
  /【痕跡】/,
  /不確実/,
  /未知/
]);

const TRANSIENT_RESULT_PATTERNS = Object.freeze([
  /バッグが満杯/,
  /バッグ.*いっぱい/,
  /持ち帰れなかった/,
  /持ち込めなかった/
]);

function sameItem(candidate, expected) {
  if (!candidate || !expected || typeof candidate !== "object" || typeof expected !== "object") return false;
  return candidate === expected || Boolean(candidate.instanceId && expected.instanceId && candidate.instanceId === expected.instanceId);
}

function includesItem(items, item) {
  return Array.isArray(items) && items.some(candidate => sameItem(candidate, item));
}

function hasBaseId(items, item) {
  const itemId = getItemBaseId(item);
  return Boolean(itemId) && Array.isArray(items) && items.some(candidate => getItemBaseId(candidate) === itemId);
}

export function classifyEventLine(line) {
  const text = typeof line === "string" ? line : String(line ?? "");
  return {
    kind: UNRESOLVED_EVENT_PATTERNS.some(pattern => pattern.test(text)
      && !TRANSIENT_RESULT_PATTERNS.some(resultPattern => resultPattern.test(text)))
      ? "unresolved"
      : "transient",
    text
  };
}

export function getEventStripEntries(logs, { unresolvedLimit = 4, transientLimit = 8, activeObservations = undefined } = {}) {
  const lines = (Array.isArray(logs) ? logs : [])
    .flatMap(entry => {
      const text = typeof entry === "object" && entry !== null ? String(entry.text ?? "") : String(entry ?? "");
      const side = entry?.side || "neutral";
      const presentationKind = entry?.presentationKind || "neutral";
      return text.split("\n").map(line => ({ text: line, side, presentationKind }));
    })
    .filter(entry => entry.text);
  const activeObservationTexts = activeObservations === undefined
    ? null
    : new Set(Object.values(activeObservations || {})
      .filter(entry => entry?.lifecycle === "active" && entry.text)
      .map(entry => entry.text));
  const unresolved = activeObservations !== undefined
    ? Object.values(activeObservations || {})
      .filter(entry => entry?.lifecycle === "active" && entry.text)
      .filter(entry => entry.kind !== "result")
      .map(entry => ({
        kind: "unresolved",
        text: entry.text,
        side: entry.side || "neutral",
        presentationKind: entry.presentationKind || "neutral",
        key: entry.key,
        scope: entry.scope,
        lifecycle: entry.lifecycle
      }))
    : [];
  const results = activeObservations !== undefined
    ? Object.values(activeObservations || {})
      .filter(entry => entry?.lifecycle === "active" && entry.text && entry.kind === "result")
      .map(entry => ({
        kind: "result",
        text: entry.text,
        side: entry.side || "neutral",
        presentationKind: entry.presentationKind || "neutral",
        key: entry.key,
        scope: entry.scope,
        lifecycle: entry.lifecycle
      }))
    : [];
  const transient = [];
  lines.forEach(line => {
    const entry = {
      ...classifyEventLine(line.text),
      side: line.side,
      presentationKind: line.presentationKind
    };
    if (entry.kind === "unresolved" && activeObservations === undefined) unresolved.push(entry);
    if (entry.kind === "transient" && !activeObservationTexts?.has(entry.text)) transient.push(entry);
  });
  return {
    unresolved: unresolved.slice(-unresolvedLimit),
    results: results.slice(-unresolvedLimit),
    transient: transient.slice(-transientLimit)
  };
}

// Rows the strip shortens, then leaves out, first when its height budget runs
// out; unresolved threats and traps go last.
const EVENT_STRIP_FIT_ORDER = ["transient", "result", "enemy", "unresolved"];

// The event strip has a fixed height budget. Instead of letting the panel
// clip rows mid-line (#1823), shorten rows to one line ending in an ellipsis
// (older rows, then the newest, then unresolved ones), and only then leave out
// whole rows. The full text stays behind #btn-log-expand, which shows how many
// rows were left out. Returns that number.
export function fitEventStripRows(panel, content, expandButton = null) {
  const dropped = fitEventStripRowsToBudget(panel, content);
  if (expandButton?.dataset) {
    if (dropped > 0) expandButton.dataset.hiddenCount = `+${dropped}`;
    else delete expandButton.dataset.hiddenCount;
  }
  return dropped;
}

function fitEventStripRowsToBudget(panel, content) {
  if (typeof getComputedStyle !== "function" || typeof panel?.getBoundingClientRect !== "function" || !content?.children) return 0;
  const rows = Array.from(content.children).filter(row => getComputedStyle(row).display !== "none");
  const newest = rows.at(-1);
  if (!newest) return 0;
  const panelStyle = getComputedStyle(panel);
  const overflows = () => {
    const bottom = panel.getBoundingClientRect().bottom
      - parseFloat(panelStyle.paddingBottom || 0) - parseFloat(panelStyle.borderBottomWidth || 0);
    return newest.getBoundingClientRect().bottom > bottom + 0.5;
  };
  const older = EVENT_STRIP_FIT_ORDER.flatMap(kind => rows.filter(row => row !== newest && row.dataset.eventKind === kind));
  const clamp = (row, lines) => {
    row.classList.add("event-strip-item--clamped");
    row.style.setProperty("--event-strip-lines", String(lines));
  };
  const steps = [
    ...older.filter(row => row.dataset.eventKind !== "unresolved").map(row => [row, 1]),
    [newest, 2],
    [newest, 1],
    ...older.filter(row => row.dataset.eventKind === "unresolved").map(row => [row, 1])
  ];
  for (const [row, lines] of steps) {
    if (!overflows()) return 0;
    clamp(row, lines);
  }
  let dropped = 0;
  for (const row of older) {
    if (!overflows()) break;
    row.remove();
    dropped++;
  }
  return dropped;
}

export function setActionDockState(element, dockState) {
  const nextState = Object.values(DOCK_STATES).includes(dockState)
    ? dockState
    : DOCK_STATES.COMPACT;
  const dock = element || (typeof document !== "undefined" ? document.getElementById("controls-panel") : null);
  if (!dock) return nextState;
  Object.values(DOCK_STATES).forEach(value => dock.classList.remove(`dock-state-${value}`));
  dock.classList.add(`dock-state-${nextState}`);
  if (dock.dataset) dock.dataset.dockState = nextState;
  return nextState;
}

export function getActionDockState(element = null) {
  const dock = element || (typeof document !== "undefined" ? document.getElementById("controls-panel") : null);
  return Object.values(DOCK_STATES).includes(dock?.dataset?.dockState)
    ? dock.dataset.dockState
    : DOCK_STATES.COMPACT;
}

export function getDockStateForView(view) {
  if (view?.gameState === "submenu" || view?.gameState === "equip_overlay") return DOCK_STATES.EXPANDED;
  if (["combat", "trap_encounter", "chest", "result"].includes(view?.gameState)) return DOCK_STATES.DECISION;
  return DOCK_STATES.COMPACT;
}

export function setDockActionRole(element, role) {
  if (!element || !Object.values(DOCK_ACTION_ROLES).includes(role)) return false;
  Object.values(DOCK_ACTION_ROLES).forEach(value => element.classList.remove(`dock-action-${value}`));
  element.classList.add(`dock-action-${role}`);
  if (element.dataset) element.dataset.actionRole = role;
  return true;
}

export function getOwnershipLabel(ownership) {
  return OWNERSHIP_LABELS[ownership] || OWNERSHIP_LABELS[OWNERSHIP_STATES.AMBIGUOUS];
}

export function getItemOwnership(item, { state = null, selectedLootIds = null, lootEntryId = null } = {}) {
  const run = state?.currentRun;
  const lost = run?.lostObjectLoot;
  if (includesItem(lost, item)) return OWNERSHIP_STATES.LOST;

  const unbanked = Array.isArray(run?.unbankedObjectLoot) ? run.unbankedObjectLoot : [];
  const itemId = getItemBaseId(item);
  const townItems = run?.townInventory;
  const unbankedEntry = lootEntryId
    ? unbanked.find(entry => entry?.id === lootEntryId)
    : unbanked.find(entry => sameItem(entry?.item, item));
  if (unbankedEntry) {
    if (selectedLootIds?.has?.(unbankedEntry.id)) return OWNERSHIP_STATES.WING_SELECTED;
    return OWNERSHIP_STATES.DUNGEON_UNCONFIRMED;
  }
  if (includesItem(townItems, item)) return OWNERSHIP_STATES.TOWN_CONFIRMED;

  // Primitive IDs and legacy objects without instanceId cannot identify one
  // of two equal-baseId items. Never present a guessed confirmed state.
  const townCount = Array.isArray(townItems)
    ? townItems.filter(candidate => getItemBaseId(candidate) === itemId).length
    : 0;
  const unbankedCount = unbanked.filter(entry => getItemBaseId(entry?.item) === itemId).length;
  const lostCount = Array.isArray(lost)
    ? lost.filter(candidate => getItemBaseId(candidate) === itemId).length
    : 0;
  if ((townCount > 0 && unbankedCount > 0)
    || (townCount > 0 && lostCount > 0)
    || (unbankedCount > 0 && lostCount > 0)) return OWNERSHIP_STATES.AMBIGUOUS;
  if (hasBaseId(townItems, item)) return OWNERSHIP_STATES.TOWN_CONFIRMED;
  if (hasBaseId(lost, item)) return OWNERSHIP_STATES.LOST;
  if (unbanked.find(entry => itemId && getItemBaseId(entry?.item) === itemId)) {
    return OWNERSHIP_STATES.DUNGEON_UNCONFIRMED;
  }
  return OWNERSHIP_STATES.TOWN_CONFIRMED;
}

export function appendOwnershipBadge(parent, ownership, { label = null } = {}) {
  if (!parent || typeof document === "undefined") return null;
  if (ownership === OWNERSHIP_STATES.AMBIGUOUS) return null;
  const badge = document.createElement("span");
  badge.className = `ownership-badge ownership-badge--${ownership}`;
  if (badge.dataset) badge.dataset.ownership = ownership;
  badge.textContent = label || getOwnershipLabel(ownership);
  parent.appendChild(badge);
  return badge;
}
