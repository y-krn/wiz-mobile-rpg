// balance-impact: none — this module only renders the existing chest menu.
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { setDockActionRole } from "../ui/common_shell.js";

const TRAP_SIGN_DISPLAY = Object.freeze({
  none: Object.freeze({ text: "気配なし", color: "var(--neon-green)" }),
  trap: Object.freeze({ text: "何か仕掛けがある", color: "var(--neon-yellow)" }),
  danger: Object.freeze({ text: "危険な気配", color: "var(--neon-red)" })
});

function getSignReliabilityText(accuracy = 0) {
  if (accuracy >= 0.9) return "見立て: 確か";
  if (accuracy >= 0.75) return "見立て: まずまず";
  return "見立て: 怪しい";
}

function getTrapSignRow(chest) {
  const row = document.createElement("div");
  row.className = "chest-trap-sign";
  const prefix = document.createElement("span");
  prefix.textContent = "罠の気配: ";
  row.appendChild(prefix);
  const display = TRAP_SIGN_DISPLAY[chest.trapSign] || TRAP_SIGN_DISPLAY.trap;
  const sign = document.createElement("strong");
  sign.style.color = display.color;
  sign.textContent = display.text;
  row.appendChild(sign);
  const reliability = document.createElement("span");
  reliability.style.color = "var(--text-muted)";
  reliability.textContent = ` / ${getSignReliabilityText(chest.trapSignAccuracy)}`;
  row.appendChild(reliability);
  return row;
}

function getDisarmRow(disarmChance) {
  const row = document.createElement("div");
  row.className = "chest-disarm-chance";
  row.style.color = "var(--text-muted)";
  row.textContent = `開けるときの自動解除: 約${Math.round(Math.max(0, Math.min(1, disarmChance)) * 100)}%`;
  return row;
}

function createButton({ id, className, text, onClick, title, role = null, compact = false }) {
  const button = document.createElement("button");
  if (id) button.id = id;
  button.className = className;
  button.textContent = text;
  if (!compact) button.style.minHeight = "44px";
  if (title) button.title = title;
  if (role) setDockActionRole(button, role);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function createDetails(full) {
  const details = document.createElement("details");
  details.className = "chest-details";
  const summary = document.createElement("summary");
  summary.textContent = "罠と宝箱の説明";
  details.appendChild(summary);
  const help = document.createElement("div");
  help.className = "chest-help-text";
  help.textContent = "開けると罠の解除を自動で試み、失敗すると罠が作動する。";
  help.appendChild(document.createElement("br"));
  const signHelp = document.createElement("span");
  signHelp.textContent = "危険な気配の箱ほど、中身も期待できる。気配の見立ては外れることがある。";
  help.appendChild(signHelp);
  help.appendChild(document.createElement("br"));
  const kitHelp = document.createElement("span");
  kitHelp.textContent = "罠外しキットは罠を確実に解除する。罠がなければ消費しない。";
  help.appendChild(kitHelp);
  if (!full) {
    help.appendChild(document.createElement("br"));
    const bagNote = document.createElement("span");
    bagNote.textContent = "装備中の品は枠外。開封後の報酬だけが空き枠を使います。";
    help.appendChild(bagNote);
  }
  details.appendChild(help);
  return details;
}

export function renderChestMenu({
  chest,
  inventory = [],
  disarmChance = 0,
  canUseTrapKit = false,
  onOpen,
  onOpenWithKit,
  onLeave
}) {
  document.getElementById("submenu-title").textContent = "宝箱";
  const optGrid = document.getElementById("submenu-options");
  optGrid.className = "submenu-grid";
  optGrid.innerHTML = "";

  const loot = chest.lootHint;
  const infoPanel = document.createElement("div");
  infoPanel.className = "chest-info-panel";
  const bagFull = inventory.length >= INVENTORY_CAPACITY;
  infoPanel.appendChild(createBagCapacitySummary(inventory, {
    className: "chest-inventory-status",
    // The heading already states used/free slots; the 20-cell grid stays on bag-management screens.
    showSlots: false,
    showNote: bagFull,
    note: "満杯。報酬は自動取得されません。開封前に装備画面で整理できます。"
  }));
  infoPanel.appendChild(getTrapSignRow(chest));
  infoPanel.appendChild(getDisarmRow(disarmChance));
  if (loot) {
    const lootHint = document.createElement("div");
    lootHint.className = "chest-loot-hint";
    const lootPrefix = document.createElement("span");
    lootPrefix.textContent = "宝気: ";
    lootHint.appendChild(lootPrefix);
    const lootLabel = document.createElement("span");
    lootLabel.style.color = "var(--text-primary)";
    lootLabel.style.fontWeight = "bold";
    lootLabel.textContent = loot.label;
    lootHint.appendChild(lootLabel);
    const auraPrefix = document.createElement("span");
    auraPrefix.textContent = " / 魔力反応: ";
    lootHint.appendChild(auraPrefix);
    const aura = document.createElement("span");
    aura.style.fontWeight = "bold";
    aura.style.color = loot.aura === "strong"
      ? "var(--neon-red)"
      : loot.aura === "medium" ? "var(--neon-yellow)" : "var(--text-muted)";
    aura.textContent = loot.aura === "strong" ? "強" : loot.aura === "medium" ? "中" : "弱";
    lootHint.appendChild(aura);
    infoPanel.appendChild(lootHint);
  }
  infoPanel.appendChild(createDetails(bagFull));
  optGrid.appendChild(infoPanel);

  const openButton = createButton({
    id: "btn-chest-open",
    className: "btn btn-neon btn-block btn-primary chest-action-recommended",
    text: "開ける",
    role: "confirm",
    onClick: onOpen
  });
  if (openButton.dataset) openButton.dataset.recommended = "true";
  optGrid.appendChild(openButton);
  if (canUseTrapKit) {
    optGrid.appendChild(createButton({
      id: "btn-chest-trap-kit",
      className: "btn btn-neon btn-block",
      text: "キットを使って開ける",
      title: "罠を確実に解除してから開けます。罠がなければキットは消費しません",
      role: "confirm",
      onClick: onOpenWithKit
    }));
  }
  optGrid.appendChild(createButton({
    id: "btn-chest-leave",
    className: "btn btn-neon btn-block",
    text: "立ち去る",
    onClick: onLeave,
    role: "back"
  }));
  document.getElementById("btn-submenu-back").style.display = "none";
}
