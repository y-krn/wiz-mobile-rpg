// balance-impact: none — this module only renders the existing chest menu.
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";

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
  if (floor === 1 || floor === 3) return `<span style="color:var(--neon-yellow)">[階層] 罠遭遇：高 (約80%)</span>`;
  if (floor === 2) return `<span style="color:var(--neon-green)">[階層] 罠遭遇：中 (約70%)</span>`;
  if (floor === 4) return `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き（転移警戒）</span>`;
  if (floor === 5) return `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き＆火炎トラップ注意</span>`;
  return "";
}

function getInspectionText(chest) {
  if (!chest.inspected) return `<span style="color:var(--text-muted)">推定罠: 未調査</span>`;
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
  const uncertainty = chance >= 0.8
    ? `<span style="color:var(--text-muted)">推定は外れる場合あり</span>`
    : `<span style="color:${reliabilityColor}; font-weight:bold;">[!] 外れる可能性あり</span>`;
  return `推定: <strong style="color:var(--neon-cyan)">${translateTrap(chest.identifiedTrap)}</strong> / 信頼度 <span style="color:${reliabilityColor}">${reliability}</span><br>${uncertainty}`;
}

function createButton({ id, className, text, onClick, title }) {
  const button = document.createElement("button");
  if (id) button.id = id;
  button.className = className;
  button.textContent = text;
  button.style.minHeight = "44px";
  if (title) button.title = title;
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
  const auraLabel = loot?.aura === "strong"
    ? `<span style="color:var(--neon-red); font-weight:bold;">強</span>`
    : loot?.aura === "medium"
      ? `<span style="color:var(--neon-yellow); font-weight:bold;">中</span>`
      : `<span style="color:var(--text-muted);">弱</span>`;
  const lootText = loot ? `
      <div class="chest-loot-hint">
        <div>宝気: <span style="color:#fff;">${loot.label}</span></div>
        <div>魔力反応: ${auraLabel}</div>
      </div>
    ` : "";
  const helpText = `<div class="chest-help-text">
毒針:単体+毒 | ガス:全体ダメ<br>
テレポ:転移 | 閃光:全体盲目<br>
<span style="color:var(--neon-red)">叩き壊す：罠を弱める代わりに、報酬が壊れることがある。</span>
</div>`;
  const infoPanel = document.createElement("div");
  infoPanel.className = "chest-info-panel";
  infoPanel.innerHTML = `
    <div class="chest-inventory-status ${inventory.length >= INVENTORY_CAPACITY ? "full" : ""}">バッグ：${inventory.length}/${INVENTORY_CAPACITY}枠${inventory.length >= INVENTORY_CAPACITY ? "（満杯・報酬は自動取得されません）" : `（空き${INVENTORY_CAPACITY - inventory.length}枠）`}</div>
    <div>${getRiskText(floor)}</div>
    <div style="margin-top:4px;">${getInspectionText(chest)}</div>
    ${lootText}
    ${helpText}
  `;
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
  } else if (!chest.identifiedTrap) {
    disarmText = "解除不要";
    disarmHandler = null;
  }
  const disarmButton = createButton({
    id: "btn-chest-disarm",
    className: "btn btn-neon btn-block",
    text: disarmText,
    onClick: disarmHandler
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
      onClick: onTrapKit
    }));
  }
  optGrid.appendChild(createButton({
    id: "btn-chest-open",
    className: "btn btn-neon btn-block",
    text: "宝箱を開ける",
    onClick: onOpen
  }));
  const smashButton = createButton({
    id: "btn-chest-smash",
    className: "btn btn-danger btn-block",
    text: "叩き壊す",
    title: "罠を弱める代わりに、報酬が壊れることがあります",
    onClick: () => {
      smashButton.disabled = true;
      onSmash?.();
    }
  });
  optGrid.appendChild(smashButton);
  optGrid.appendChild(createButton({
    className: "btn btn-danger btn-block",
    text: "立ち去る",
    onClick: onLeave
  }));
  document.getElementById("btn-submenu-back").style.display = "none";
}
