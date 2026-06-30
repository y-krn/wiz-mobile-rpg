import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "../state.js";
import { ITEMS, getItemData, getItemBaseId, generateRandomEquipment } from "../data.js";
import { playSound } from "../audio.js";
import { openSubmenu, closeSubmenu } from "../navigation.js";

export function generateMerchantStock(floor, inventory) {
  const generated = [];
  const alreadyHasAshes = inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");

  const allowlist = ["SHORT_SWORD", "SMALL_SHIELD", "LEATHER_ARMOR", "DAGGER", "WAND", "ROBE", "NINJA_SUIT"];

  let matPool = ["獣の牙", "硬い皮"];
  if (floor === 3) {
    matPool = ["骨片", "霊粉", "毒腺"];
  } else if (floor >= 4) {
    matPool = ["鉄片", "呪布", "魔石片", "黒角", "竜鱗"];
  }

  const getSlot1And2Choices = () => {
    const choices = [];
    
    const eq1 = allowlist[Math.floor(Math.random() * allowlist.length)];
    const eq2 = allowlist[Math.floor(Math.random() * allowlist.length)];
    choices.push({ type: "item", key: eq1, price: Math.floor(ITEMS[eq1].price * 0.8), soldOut: false });
    choices.push({ type: "item", key: eq2, price: Math.floor(ITEMS[eq2].price * 0.8), soldOut: false });

    choices.push({ type: "ticket", key: "IDENTIFY_TICKET", price: 100, soldOut: false });

    const mat = matPool[Math.floor(Math.random() * matPool.length)];
    let price = 60;
    if (mat === "黒角") price = 250;
    if (mat === "竜鱗") price = 300;
    choices.push({ type: "material", key: mat, price, soldOut: false });

    if (floor >= 4 && !alreadyHasAshes && Math.random() < 0.1) {
      choices.push({ type: "item", key: "SACRED_ASHES", price: ITEMS.SACRED_ASHES.price, soldOut: false });
    }

    return choices;
  };

  const choices = getSlot1And2Choices();
  const shuffledChoices = choices.sort(() => 0.5 - Math.random());
  generated.push(shuffledChoices[0]);
  generated.push(shuffledChoices[1]);

  const usables = [
    { type: "item", key: "HEAL_POTION", price: 40, soldOut: false },
    { type: "item", key: "MANA_POTION", price: 300, soldOut: false },
    { type: "item", key: "HOLY_WATER", price: 70, soldOut: false },
    { type: "item", key: "ANTIDOTE", price: 50, soldOut: false },
    { type: "item", key: "TOWN_PORTAL", price: 250, soldOut: false }
  ];

  const shuffledUsables = usables.sort(() => 0.5 - Math.random());
  generated.push(shuffledUsables[0]);
  generated.push(shuffledUsables[1]);

  return generated;
}

export function renderEventMerchant(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  // Generate dynamic stock if empty
  if (!state.activeMerchantStock || state.activeMerchantStock.length === 0) {
    state.activeMerchantStock = generateMerchantStock(state.floor || 1, state.inventory || []);
    saveAutosave();
  }

  const btnTrade = document.createElement("button");
  btnTrade.className = "btn btn-neon btn-block";
  btnTrade.textContent = "取引をする";
  btnTrade.addEventListener("click", () => {
    openSubmenu("event_merchant_buy", "商人「さあ、どれにするかね？」");
  });
  optGrid.appendChild(btnTrade);

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.addEventListener("click", () => {
    addLog("商人は闇の中へと去っていった。");
    state.activeMerchantStock = [];
    const currentCell = state.map[state.y][state.x];
    if (currentCell.event === "event_merchant") {
      currentCell.event = null;
    }
    saveAutosave();
    closeSubmenu();
  });
  optGrid.appendChild(btnLeave);
}

export function renderEventMerchantBuy(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "block";

  if (state.activeMerchantStock && state.activeMerchantStock.length > 0) {
    state.activeMerchantStock.forEach(stock => {
      const stockType = stock.type || "item";
      let name = "";
      let desc;
      
      if (stockType === "ticket") {
        name = "鑑定割引券";
        desc = "鑑定時にゴールドの代わりに使用できる。";
      } else if (stockType === "material") {
        name = stock.key;
        desc = `[素材] 工房で使用する。`;
      } else if (stockType === "unidentified") {
        name = stock.rarity === "rare" ? "未鑑定の装備 (Rare)" : "未鑑定 of 装備 (Magic)";
        desc = "鑑定するまで詳細のわからない装備品。";
      } else {
        const item = getItemData(stock.key);
        name = item ? item.name : stock.key;
        desc = item ? item.desc.split("[")[0] : "";
      }

      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      
      if (stock.soldOut) {
        btn.textContent = `[売り切れ] ${name}`;
        btn.disabled = true;
      } else {
        const isAshes = stock.key === "SACRED_ASHES";
        const hasAshes = state.inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");
        const bagFull = state.inventory.length >= 20;
        
        btn.textContent = `${name} (${stock.price}G) - ${desc}`;

        // バッグ制限のチェック
        const needsBagSpace = (stockType === "item" || stockType === "unidentified");

        if (state.gold < stock.price || (isAshes && hasAshes) || (needsBagSpace && bagFull)) {
          btn.disabled = true;
          if (isAshes && hasAshes) {
            btn.textContent = `[所持数制限] ${name} (${stock.price}G)`;
          } else if (needsBagSpace && bagFull) {
            btn.textContent = `[バッグ満杯] ${name} (${stock.price}G)`;
          }
        }

        btn.addEventListener("click", () => {
          let purchaseSuccess = false;
          
          if (stockType === "ticket") {
            state.identifyTickets = (state.identifyTickets || 0) + 1;
            purchaseSuccess = true;
          } else if (stockType === "material") {
            state.materials[stock.key] = (state.materials[stock.key] || 0) + 1;
            purchaseSuccess = true;
          } else if (stockType === "unidentified") {
            const eqObj = generateRandomEquipment(state.floor || 1, stock.rarity);
            if (eqObj) {
              eqObj.identified = false;
              if (addInventoryItem(eqObj)) {
                purchaseSuccess = true;
              }
            }
          } else {
            // item
            if (addInventoryItem(stock.key)) {
              recordEquipmentDiscovery(stock.key);
              purchaseSuccess = true;
            }
          }

          if (purchaseSuccess) {
            state.gold -= stock.price;
            if (state.codex && state.codex.events && state.codex.events.facilities) {
              state.codex.events.facilities.merchant.purchased++;
            }
            stock.soldOut = true;
            playSound("gold");
            addLog(`[!] 商人から[${name}]を${stock.price}Gで購入した。`);
            saveAutosave();
            openSubmenu("event_merchant_buy", "商人「他に入用なものはあるかね？」", true);
          }
        });
      }
      optGrid.appendChild(btn);
    });
  }

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "買い物を終える";
  btnLeave.addEventListener("click", () => {
    addLog("商人は丁寧に一礼し、立ち去った。");
    state.activeMerchantStock = [];
    const currentCell = state.map[state.y][state.x];
    if (currentCell.event === "event_merchant") {
      currentCell.event = null;
    }
    saveAutosave();
    closeSubmenu();
  });
  optGrid.appendChild(btnLeave);
}
