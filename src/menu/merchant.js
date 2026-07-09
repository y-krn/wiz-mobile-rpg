import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "../state.js";
import { ITEMS, getItemData, getItemBaseId, generateRandomAccessory, generateRandomEquipment } from "../data.js";
import { playSound } from "../audio.js";
import { openSubmenu, closeSubmenu } from "../navigation.js";

export function generateMerchantStock(floor, inventory) {
  const generated = [];
  const alreadyHasAshes = inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");
  const alreadyHasLifeWater = inventory.some(i => getItemBaseId(i) === "LIFE_WATER");

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
    if (floor >= 5 && !alreadyHasLifeWater && Math.random() < 0.08) {
      choices.push({ type: "item", key: "LIFE_WATER", price: ITEMS.LIFE_WATER.price, soldOut: false });
    }
    if (floor >= 3 && Math.random() < 0.08) {
      choices.push({ type: "unidentified_accessory", rarity: "magic", price: floor >= 5 ? 900 : 650, soldOut: false });
    }

    return choices;
  };

  const choices = getSlot1And2Choices();
  const shuffledChoices = choices.sort(() => 0.5 - Math.random());
  generated.push(shuffledChoices[0]);
  generated.push(shuffledChoices[1]);

  const usables = [
    { type: "item", key: "HEAL_POTION", price: 40, soldOut: false },
    { type: "item", key: "MANA_POTION", price: 250, soldOut: false },
    { type: "item", key: "HOLY_WATER", price: 70, soldOut: false },
    { type: "item", key: "ANTIDOTE", price: 50, soldOut: false },
    { type: "item", key: "EYE_DROPS", price: 60, soldOut: false },
    { type: "item", key: "PARALYZE_CURE", price: 100, soldOut: false },
    { type: "item", key: "WAKE_POWDER", price: 60, soldOut: false },
    { type: "item", key: "TOWN_PORTAL", price: 400, soldOut: false }
  ];
  if (floor >= 3) {
    usables.push(
      { type: "item", key: "GREATER_HEAL", price: 160, soldOut: false },
      { type: "item", key: "ETHER", price: 650, soldOut: false },
      { type: "item", key: "PANACEA", price: 260, soldOut: false }
    );
  }

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
      } else if (stockType === "unidentified_accessory") {
        name = "未鑑定の装身具 (Magic)";
        desc = "鑑定するまで詳細のわからない装身具。";
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
        const isLimitedItem = stock.key === "SACRED_ASHES" || stock.key === "LIFE_WATER" || stock.key === "TOWN_PORTAL";
        const hasLimitedItem = state.inventory.some(i => getItemBaseId(i) === stock.key);
        const bagFull = state.inventory.length >= 20;
        
        btn.textContent = `${name} (${stock.price}G) - ${desc}`;

        // バッグ制限のチェック
        const needsBagSpace = (stockType === "item" || stockType === "unidentified" || stockType === "unidentified_accessory");

        if (state.gold < stock.price || (isLimitedItem && hasLimitedItem) || (needsBagSpace && bagFull)) {
          btn.disabled = true;
          if (isLimitedItem && hasLimitedItem) {
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
            const eqObj = generateRandomEquipment(state.floor || 1, stock.rarity, Math.random, state.party);
            if (eqObj) {
              eqObj.identified = false;
              if (addInventoryItem(eqObj)) {
                purchaseSuccess = true;
              }
            }
          } else if (stockType === "unidentified_accessory") {
            const accessory = generateRandomAccessory(state.floor || 1, stock.rarity, Math.random, state.party);
            if (accessory && addInventoryItem(accessory)) {
              purchaseSuccess = true;
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
            openSubmenu("event_merchant_result", "商人「毎度あり。」");
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

export function renderEventMerchantResult(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  const btnContinue = document.createElement("button");
  btnContinue.className = "btn btn-neon btn-block";
  btnContinue.textContent = "取引を続ける";
  btnContinue.addEventListener("click", () => {
    openSubmenu("event_merchant_buy", "商人「他に入用なものはあるかね？」", true);
  });
  optGrid.appendChild(btnContinue);

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "探索に戻る";
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
