// balance-impact: none — this module only renders the existing chest menu.
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { setDockActionRole } from "../ui/common_shell.js";

const TRAP_LABELS = Object.freeze({
  "poison needle": "毒針",
  "gas bomb": "ガス爆弾",
  teleporter: "テレポーター",
  "flash bomb": "閃光弾"
});

function translateTrap(trap) {
  return TRAP_LABELS[trap] || "なし";
}

function getRiskText(floor) {
  const risk = document.createElement("span");
  if (floor === 1 || floor === 3) {
    risk.style.color = "var(--neon-yellow)";
    risk.textContent = "[階層] 罠遭遇：高 (約80%)";
  } else if (floor === 2) {
    risk.style.color = "var(--neon-green)";
    risk.textContent = "[階層] 罠遭遇：中 (約70%)";
  } else if (floor === 4) {
    risk.style.color = "var(--neon-red)";
    risk.textContent = "[警告] 全宝箱罠付き（転移警戒）";
  } else if (floor === 5) {
    risk.style.color = "var(--neon-red)";
    risk.textContent = "[警告] 全宝箱罠付き＆火炎トラップ注意";
  } else {
    return null;
  }
  return risk;
}

function getInspectionText(chest) {
  if (!chest.inspected) {
    const result = document.createElement("span");
    result.style.color = "var(--text-muted)";
    result.textContent = "推定罠: 未調査";
    return result;
  }
  const chance = chest.inspectChance || 0;
  let reliability = "極低";
  let reliabilityColor = "var(--neon-red)";
  if (chance >= 0.8) {
    reliability = "高";
    reliabilityColor = "var(--neon-green)";
  } else if (chance >= 0.4) {
    reliability = "中";
    reliabilityColor = "var(--neon-yellow)";
  } else if (chance >= 0.3) {
    reliability = "低";
    reliabilityColor = "#ff9f0a";
  }
  const result = typeof document.createDocumentFragment === "function"
    ? document.createDocumentFragment()
    : document.createElement("span");
  result.textContent = "推定: ";
  const trap = document.createElement("strong");
  trap.style.color = "var(--neon-cyan)";
  trap.textContent = translateTrap(chest.identifiedTrap);
  result.appendChild(trap);
  const separator = document.createElement("span");
  separator.textContent = " / 信頼度 ";
  result.appendChild(separator);
  const reliabilityValue = document.createElement("span");
  reliabilityValue.style.color = reliabilityColor;
  reliabilityValue.textContent = reliability;
  result.appendChild(reliabilityValue);
  result.appendChild(document.createElement("br"));
  const uncertainty = document.createElement("span");
  uncertainty.style.color = chance >= 0.8 ? "var(--text-muted)" : reliabilityColor;
  if (chance < 0.8) uncertainty.style.fontWeight = "bold";
  uncertainty.textContent = chance >= 0.8 ? "推定は外れる場合あり" : "[!] 外れる可能性あり";
  result.appendChild(uncertainty);
  return result;
}

function createButton({ id, className, text, onClick, title, role = null }) {
  const button = document.createElement("button");
  if (id) button.id = id;
  button.className = className;
  button.textContent = text;
  button.style.minHeight = "44px";
  if (title) button.title = title;
  if (role) setDockActionRole(button, role);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

export function renderChestMenu({
  chest,
  floor,
  inventory = [],
  onInspect,
  onDisarm,
  onTrapKit,
  onOpen,
  onSmash,
  onLeave
}) {
  document.getElementById("submenu-title").textContent = "宝箱の調査・解除";
  const optGrid = document.getElementById("submenu-options");
  optGrid.className = "submenu-grid";
  optGrid.innerHTML = "";

  const loot = chest.lootHint;
  const infoPanel = document.createElement("div");
  infoPanel.className = "chest-info-panel";
  infoPanel.appendChild(createBagCapacitySummary(inventory, {
    className: "chest-inventory-status",
    note: inventory.length >= INVENTORY_CAPACITY
      ? "満杯。報酬は自動取得されません。開封前に装備画面で整理できます。"
      : "装備中の品は枠外。開封後の報酬だけが空き枠を使います。"
  }));
  const risk = getRiskText(floor);
  if (risk) {
    const riskRow = document.createElement("div");
    riskRow.appendChild(risk);
    infoPanel.appendChild(riskRow);
  }
  const inspectionRow = document.createElement("div");
  inspectionRow.style.marginTop = "4px";
  inspectionRow.appendChild(getInspectionText(chest));
  infoPanel.appendChild(inspectionRow);
  if (loot) {
    const lootHint = document.createElement("div");
    lootHint.className = "chest-loot-hint";
    const lootRow = document.createElement("div");
    lootRow.textContent = "宝気: ";
    const lootLabel = document.createElement("span");
    lootLabel.style.color = "#fff";
    lootLabel.textContent = loot.label;
    lootRow.appendChild(lootLabel);
    const auraRow = document.createElement("div");
    auraRow.textContent = "魔力反応: ";
    const aura = document.createElement("span");
    aura.style.fontWeight = "bold";
    aura.style.color = loot.aura === "strong"
      ? "var(--neon-red)"
      : loot.aura === "medium" ? "var(--neon-yellow)" : "var(--text-muted)";
    aura.textContent = loot.aura === "strong" ? "強" : loot.aura === "medium" ? "中" : "弱";
    auraRow.appendChild(aura);
    lootHint.appendChild(lootRow);
    lootHint.appendChild(auraRow);
    infoPanel.appendChild(lootHint);
  }
  const help = document.createElement("div");
  help.className = "chest-help-text";
  help.textContent = "毒針:単体+毒 | ガス:全体ダメ";
  help.appendChild(document.createElement("br"));
  const helpSecondLine = document.createElement("span");
  helpSecondLine.textContent = "テレポ:転移 | 閃光:全体盲目";
  help.appendChild(helpSecondLine);
  help.appendChild(document.createElement("br"));
  const smashHelp = document.createElement("span");
  smashHelp.style.color = "var(--neon-red)";
  smashHelp.textContent = "叩き壊す：罠を弱める代わりに、報酬が壊れることがある。";
  help.appendChild(smashHelp);
  infoPanel.appendChild(help);
  optGrid.appendChild(infoPanel);

  const inspectButton = createButton({
    id: "btn-chest-inspect",
    className: "btn btn-neon btn-block",
    text: chest.inspected ? "調査済み" : "調べる",
    onClick: onInspect
  });
  if (chest.inspected) {
    inspectButton.disabled = true;
    inspectButton.classList.add("disabled");
  }
  optGrid.appendChild(inspectButton);

  let disarmText = "解除する";
  let disarmHandler = onDisarm;
  if (!chest.inspected) {
    disarmText = "解除（要調査）";
    disarmHandler = null;
  } else if (!chest.identifiedTrap || chest.identifiedTrap === "none") {
    disarmText = "解除不要";
    disarmHandler = null;
  }
  const disarmButton = createButton({
    id: "btn-chest-disarm",
    className: "btn btn-neon btn-block",
    text: disarmText,
    onClick: disarmHandler,
    role: "confirm"
  });
  if (!disarmHandler) {
    disarmButton.disabled = true;
    disarmButton.classList.add("disabled");
  }
  optGrid.appendChild(disarmButton);

  if (inventory.includes("TRAP_KIT")) {
    optGrid.appendChild(createButton({
      id: "btn-chest-trap-kit",
      className: "btn btn-neon btn-block",
      text: "キットで解除",
      onClick: onTrapKit,
      role: "confirm"
    }));
  }
  optGrid.appendChild(createButton({
    id: "btn-chest-open",
    className: "btn btn-neon btn-block",
    text: "宝箱を開ける",
    onClick: onOpen,
    role: "confirm"
  }));
  const smashButton = createButton({
    id: "btn-chest-smash",
    className: "btn btn-danger btn-block",
    text: "叩き壊す",
    title: "罠を弱める代わりに、報酬が壊れることがあります",
    role: "confirm",
    onClick: () => {
      smashButton.disabled = true;
      onSmash?.();
    }
  });
  optGrid.appendChild(smashButton);
  optGrid.appendChild(createButton({
    className: "btn btn-danger btn-block",
    text: "立ち去る",
    onClick: onLeave,
    role: "back"
  }));
  document.getElementById("btn-submenu-back").style.display = "none";
}
