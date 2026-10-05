// balance-impact: none — this module only renders the existing chest menu.
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { setDockActionRole } from "../ui/common_shell.js";

const TRAP_SIGN_DISPLAY = Object.freeze({
  none: Object.freeze({ text: "気配なし", color: "var(--neon-green)" }),
  trap: Object.freeze({ text: "何か仕掛けがある", color: "var(--neon-yellow)" }),
  danger: Object.freeze({ text: "危険な気配", color: "var(--neon-red)" })
});

// How far the sign can be trusted, said as an aside to the sign itself.
function getSignReliabilityText(accuracy = 0) {
  if (accuracy >= 0.9) return "（まず確か）";
  if (accuracy >= 0.75) return "（たぶん）";
  return "（当てにならない）";
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
  reliability.textContent = getSignReliabilityText(chest.trapSignAccuracy);
  row.appendChild(reliability);
  return row;
}

function getDisarmRow(disarmChance) {
  const row = document.createElement("div");
  row.className = "chest-disarm-chance";
  row.style.color = "var(--text-muted)";
  row.textContent = `開けるときに罠を外せる見込み: 約${Math.round(Math.max(0, Math.min(1, disarmChance)) * 100)}%`;
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

// Why the chest cannot be opened right now (#1807). The buttons are disabled
// with this line, so a press is never silently ignored.
const OPENER_BLOCK_REASONS = Object.freeze({
  paralyzed: "体がしびれていて、宝箱に手を出せない。しばらく歩けば、しびれは取れる。",
  paralyze: "体がしびれていて、宝箱に手を出せない。しばらく歩けば、しびれは取れる。",
  sleep: "眠っていて、宝箱に手を出せない。"
});

function getOpenerBlockRow(status) {
  const row = document.createElement("div");
  row.className = "chest-opener-blocked";
  row.setAttribute?.("role", "status");
  row.style.color = "var(--neon-red)";
  row.textContent = OPENER_BLOCK_REASONS[status] || "いまは宝箱に手を出せない。";
  return row;
}

function createDetails(full) {
  const details = document.createElement("details");
  details.className = "chest-details";
  const summary = document.createElement("summary");
  summary.textContent = "罠と宝箱の説明";
  details.appendChild(summary);
  const help = document.createElement("div");
  help.className = "chest-help-text";
  help.textContent = "開けるときに罠を外そうとする。外せなければ罠が作動する。";
  help.appendChild(document.createElement("br"));
  const signHelp = document.createElement("span");
  signHelp.textContent = "危険な気配の箱ほど、中身も期待できる。気配の読みは外れることがある。";
  help.appendChild(signHelp);
  help.appendChild(document.createElement("br"));
  const kitHelp = document.createElement("span");
  kitHelp.textContent = "罠外しキットは罠を確実に外す。罠がなければ減らない。";
  help.appendChild(kitHelp);
  if (!full) {
    help.appendChild(document.createElement("br"));
    const bagNote = document.createElement("span");
    bagNote.textContent = "身につけている品はバッグの枠を使わない。";
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
  openerBlockedStatus = null,
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
    note: "バッグが満杯。中身を持つには、先に装備画面で空きを作る。"
  }));
  if (openerBlockedStatus) infoPanel.appendChild(getOpenerBlockRow(openerBlockedStatus));
  infoPanel.appendChild(getTrapSignRow(chest));
  infoPanel.appendChild(getDisarmRow(disarmChance));
  if (loot) {
    const lootHint = document.createElement("div");
    lootHint.className = "chest-loot-hint";
    const lootPrefix = document.createElement("span");
    lootPrefix.textContent = "中身: ";
    lootHint.appendChild(lootPrefix);
    const lootLabel = document.createElement("span");
    lootLabel.style.color = "var(--text-primary)";
    lootLabel.style.fontWeight = "bold";
    lootLabel.textContent = loot.label;
    lootHint.appendChild(lootLabel);
    const auraPrefix = document.createElement("span");
    auraPrefix.textContent = "（魔力は";
    lootHint.appendChild(auraPrefix);
    const aura = document.createElement("span");
    aura.style.fontWeight = "bold";
    aura.style.color = loot.aura === "strong"
      ? "var(--neon-red)"
      : loot.aura === "medium" ? "var(--neon-yellow)" : "var(--text-muted)";
    aura.textContent = loot.aura === "strong" ? "強い" : loot.aura === "medium" ? "そこそこ" : "弱い";
    lootHint.appendChild(aura);
    const auraSuffix = document.createElement("span");
    auraSuffix.textContent = "）";
    lootHint.appendChild(auraSuffix);
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
  openButton.disabled = Boolean(openerBlockedStatus);
  optGrid.appendChild(openButton);
  if (canUseTrapKit) {
    const kitButton = createButton({
      id: "btn-chest-trap-kit",
      className: "btn btn-neon btn-block",
      text: "キットを使って開ける",
      title: "罠を確実に解除してから開けます。罠がなければキットは消費しません",
      role: "confirm",
      onClick: onOpenWithKit
    });
    kitButton.disabled = Boolean(openerBlockedStatus);
    optGrid.appendChild(kitButton);
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
