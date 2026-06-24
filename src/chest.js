import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "./state.js";
import { ITEMS, MAP_WIDTH, MAP_HEIGHT, getItemData, getCharTrapBonus, generateRandomEquipment, getCharAffixSum } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { updateUI } from "./ui.js";
import { menuContext, openSubmenu, goBackSubmenu, closeSubmenu, resetSubmenuBackButton } from "./navigation.js";
import { triggerGameOver } from "./combat.js";
import { createRng } from "./seed_rng.js";

export function setupChestState(forcedTrap = null, forcedGold = null, forcedItem = null, customRng = null) {
  if (state.codex && state.codex.events && state.codex.events.facilities) {
    if (!state.codex.events.facilities.chest) {
      state.codex.events.facilities.chest = { found: 0, opened: 0 };
    }
    state.codex.events.facilities.chest.found++;
  }
  const chestSeed = `${state.seed}:chest:B${state.floor}:${state.x},${state.y}`;
  const rng = customRng || (state.seed ? createRng(chestSeed) : Math.random);

  // Traps are floor dependent
  let trap = "none";
  if (forcedTrap !== null) {
    trap = forcedTrap;
  } else if (state.floor === 1) {
    const r = rng();
    if (r < 0.35) trap = "none";
    else if (r < 0.60) trap = "poison needle";
    else if (r < 0.85) trap = "flash bomb";
    else trap = "gas bomb";
  } else {
    let traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
    if (state.floor === 2) {
      // B2F: Moderate poison needle rate (around 28% chance)
      traps = ["poison needle", "poison needle", "gas bomb", "teleporter", "flash bomb", "none", "none"];
    } else if (state.floor === 4) {
      // B4F: Higher teleporter and gas bomb chance, 12.5% none (1/8)
      traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "flash bomb", "poison needle", "poison needle", "none"];
    } else if (state.floor === 5) {
      // B5F: Extremely dangerous traps, high chance of teleporter, 8.3% none (1/12)
      traps = ["gas bomb", "gas bomb", "teleporter", "teleporter", "teleporter", "teleporter", "poison needle", "poison needle", "flash bomb", "flash bomb", "flash bomb", "none"];
    }
    const randIdx = Math.floor(rng() * traps.length);
    trap = traps[randIdx];
  }

  // Gold reward scale by floor
  let gold = 0;
  if (forcedGold !== null) {
    gold = forcedGold;
  } else {
    gold = Math.floor(rng() * 81) + 20; // Default 20-100G
    if (state.floor === 4) {
      gold = Math.floor(rng() * 201) + 150; // B4F: 150-350G
    } else if (state.floor === 5) {
      gold = Math.floor(rng() * 351) + 250; // B5F: 250-600G
    }
  }

  // Item reward scale by floor
  let item = null;
  if (forcedItem !== null) {
    item = forcedItem;
  } else {
    let isGuaranteed = false;
    if (state.floor === 1 && !state.firstChestUnidentifiedGuaranteed) {
      isGuaranteed = true;
    }

    const itemChance = state.floor >= 5 ? 0.85 : (state.floor === 4 ? 0.75 : 0.50);
    if (isGuaranteed || rng() < itemChance) {
    if (isGuaranteed) {
      const guaranCandidates = ["DAGGER", "WAND", "MACE", "RAPIER", "BUCKLER", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK"];
      const baseId = guaranCandidates[Math.floor(rng() * guaranCandidates.length)];
      const baseItem = ITEMS[baseId];
      
      const affixes = [];
      if (baseItem.type === "weapon") {
        affixes.push({ type: "atk", value: 1 });
      } else if (baseItem.type === "armor" || baseItem.type === "shield") {
        affixes.push({ type: "def", value: 1 });
      }
      
      const instanceId = `eq_${rng().toString(36).substr(2, 9)}`;
      item = {
        kind: "equipment",
        instanceId,
        baseId,
        rarity: "magic",
        level: 1,
        identified: false,
        affixes
      };
      state.firstChestUnidentifiedGuaranteed = true;
    } else {
      const hasAshes = state.inventory.some(i => {
        if (typeof i === "string") return i === "SACRED_ASHES";
        return i.baseId === "SACRED_ASHES";
      });
      if (state.floor >= 3 && !hasAshes && rng() < 0.05) {
        item = "SACRED_ASHES";
      } else {
        let candidates = [];
        if (state.floor === 1) {
          candidates = ["DAGGER", "WAND", "MACE", "RAPIER", "BUCKLER", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "HEAL_POTION", "ANTIDOTE"];
        } else if (state.floor === 2) {
          candidates = ["DAGGER", "WAND", "SHORT_SWORD", "RAPIER", "MACE", "SACRED_MACE", "SMALL_SHIELD", "BUCKLER", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "SCALE_MAIL", "MAGE_CLOAK", "HEAL_POTION", "ANTIDOTE", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL"];
        } else if (state.floor === 3) {
          candidates = ["SHORT_SWORD", "RAPIER", "NINJA_DAGGER", "LONG_SWORD", "MACE", "SACRED_MACE", "SMALL_SHIELD", "LARGE_SHIELD", "MAGIC_SHIELD", "LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL", "ARCANE_ROBE", "HEAL_POTION", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL"];
        } else if (state.floor === 4) {
          // B4F: Standard standard chests only drop high-level store gear (e.g. Katana, Claymore)
          candidates = ["CLAYMORE", "KATANA", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_DAGGER", "NINJA_SUIT", "CHAIN_MAIL", "ARCANE_ROBE", "BATTLE_GARB", "HOLY_WATER"];
        } else if (state.floor === 5) {
          // B5F: Standard standard chests drop high-level gear
          candidates = ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "BATTLE_GARB", "DRAGON_SCALE", "HOLY_WATER", "TOWN_PORTAL"];
        }

        if (candidates.length > 0) {
          item = candidates[Math.floor(rng() * candidates.length)];
        } else {
          const itemKeys = Object.keys(ITEMS).filter(k => k !== "ANTIGRAVITY_CRYSTAL");
          const randItemIdx = Math.floor(rng() * itemKeys.length);
          item = itemKeys[randItemIdx];
        }

        if (item) {
          const itemData = ITEMS[item];
          if (itemData && (itemData.type === "weapon" || itemData.type === "armor" || itemData.type === "shield")) {
            let randChance = 0.50;
            if (state.floor === 4) {
              const isDangerousTrap = ["poison needle", "gas bomb", "teleporter"].includes(trap);
              randChance = isDangerousTrap ? 0.80 : 0.70;
            } else if (state.floor === 5) {
              randChance = 0.90;
            } else {
              // B1F/B2F/B3F
              const isDangerousTrap = ["poison needle", "gas bomb", "teleporter"].includes(trap);
              randChance = isDangerousTrap ? 0.70 : 0.50;
            }
            
            // Rescue mechanism: if no equipment found yet and chestsOpened >= 2 (i.e. 3rd chest onwards)
            if (state.currentRun && state.currentRun.equipmentFound && state.currentRun.equipmentFound.length === 0 && state.currentRun.chestsOpened >= 2) {
              randChance += 0.20;
            }
            
            // treasureSense bonus
            if (state.party) {
              const senseSum = state.party.reduce((sum, c) => {
                if (c.status !== "dead") {
                  return sum + getCharAffixSum(c, "treasureSense");
                }
                return sum;
              }, 0);
              randChance += Math.min(25, senseSum) / 100;
            }

            randChance = Math.min(0.90, randChance);
            
            if (rng() < randChance) {
              item = generateRandomEquipment(state.floor, null, rng);
            }
          }
        }
      }
    }
  }
}

  // Aura & loot hint calculation
  let aura = "weak";
  let hasEquipmentSignal = false;
  if (item && typeof item === "object" && item.kind === "equipment") {
    hasEquipmentSignal = true;
    if (item.rarity === "epic") aura = "strong";
    else if (item.rarity === "rare") aura = "medium";
    else aura = "weak";
  }
  let label = hasEquipmentSignal ? "装備品の反応あり" : "消耗品または反応なし";
  if (hasEquipmentSignal) {
    const tagLabels = {
      followUp: "連撃",
      arcane: "秘術",
      devotion: "神聖",
      guardian: "守護",
      treasureSense: "宝探",
      trapBonus: "技巧",
      antiUndead: "不死祓い",
      antiDragon: "竜殺し",
      spellGuard: "魔除け",
      poisonWard: "毒避け",
      firstStrike: "先制"
    };
    const senseSum = state.party.reduce((sum, c) => {
      if (c.status === "dead") return sum;
      return sum + getCharAffixSum(c, "treasureSense");
    }, 0);
    const shouldRevealTag = senseSum >= 5 || rng() < 0.20;
    const hintedAffix = item.affixes?.find(aff => tagLabels[aff.type]);
    if (shouldRevealTag && hintedAffix) {
      label = `${label} / 気配:${tagLabels[hintedAffix.type]}`;
    }
  }

  state.chestState = {
    trap,
    gold,
    item,
    inspected: false,
    identifiedTrap: "",
    x: state.x,
    y: state.y,
    lootHint: {
      hasEquipmentSignal,
      aura,
      label
    }
  };
  
  // Transition to chest submenu
  openChestMenu();
}

export function openChestMenu() {
  state.gameState = "submenu";
  menuContext.type = "chest_menu";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "宝箱の調査・解除";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    if (t === "flash bomb") return "閃光弾";
    return "なし";
  };

  // Create Info Panel for Chest Details & Floor Risks
  const infoPanel = document.createElement("div");
  infoPanel.style.padding = "8px 10px";
  infoPanel.style.border = "1px solid #3a3a4c";
  infoPanel.style.borderRadius = "4px";
  infoPanel.style.backgroundColor = "rgba(27, 27, 34, 0.6)";
  infoPanel.style.fontSize = "11px";
  infoPanel.style.fontFamily = "var(--font-mono)";
  infoPanel.style.lineHeight = "1.4";
  infoPanel.style.gridColumn = "auto";
  infoPanel.style.marginBottom = "0";
  infoPanel.style.height = "100%";
  infoPanel.style.boxSizing = "border-box";
  infoPanel.style.display = "flex";
  infoPanel.style.flexDirection = "column";
  infoPanel.style.justifyContent = "center";

  // 1. Floor Risk Warning
  let riskText = "";
  if (state.floor === 1 || state.floor === 3) {
    riskText = `<span style="color:var(--neon-yellow)">[階層] 罠遭遇：高 (約80%)</span>`;
  } else if (state.floor === 2) {
    riskText = `<span style="color:var(--neon-green)">[階層] 罠遭遇：中 (約70%)</span>`;
  } else if (state.floor === 4) {
    riskText = `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き（転移警戒）</span>`;
  } else if (state.floor === 5) {
    riskText = `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き＆火炎トラップ注意</span>`;
  }

  // 2. Inspection result
  let inspectText = "";
  if (!state.chestState.inspected) {
    inspectText = `<span style="color:var(--text-muted)">推定罠: 未調査</span>`;
  } else {
    const trapNameJp = translateTrap(state.chestState.identifiedTrap);
    const chance = state.chestState.inspectChance || 0;
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
      reliabilityColor = "#ff9f0a"; // orange
    }
    inspectText = `推定: <strong style="color:var(--neon-cyan)">${trapNameJp}</strong> (<span style="color:${reliabilityColor}">${reliability}</span>)`;
  }

  // 3. Traps Help
  const helpText = `<div style="font-size:9px; color:var(--text-muted); border-top:1px solid #3a3a4c; margin-top:6px; padding-top:4px; line-height:1.2;">
毒針:単体+毒 | ガス:全体ダメ<br>
テレポ:転移 | 閃光:全体盲目
</div>`;

  const loot = state.chestState.lootHint;
  let lootText = "";
  if (loot) {
    const auraLabel = loot.aura === "strong" ? `<span style="color:var(--neon-red); font-weight:bold;">強</span>` :
                      loot.aura === "medium" ? `<span style="color:var(--neon-yellow); font-weight:bold;">中</span>` :
                      `<span style="color:var(--text-muted);">弱</span>`;
    lootText = `
      <div style="border-top:1px dashed #3a3a4c; margin-top:4px; padding-top:4px;">
        <div>宝気: <span style="color:#fff;">${loot.label}</span></div>
        <div>魔力反応: ${auraLabel}</div>
      </div>
    `;
  }

  infoPanel.innerHTML = `
    <div>${riskText}</div>
    <div style="margin-top:4px;">${inspectText}</div>
    ${lootText}
    ${helpText}
  `;
  optGrid.appendChild(infoPanel);

  // Inspect Chest
  const btnInspect = document.createElement("button");
  btnInspect.className = "btn btn-neon btn-block";
  btnInspect.textContent = "調べる";
  btnInspect.style.minHeight = "44px";
  btnInspect.style.flex = "1";
  btnInspect.addEventListener("click", () => {
    // Thief class has high inspect rate, others low
    const thief = state.party.find(c => c.class === "Thief" && ["ok", "poisoned", "blind"].includes(c.status));
    let chance = thief ? 0.85 : 0.30;
    if (thief && thief.status === "blind") {
      chance = chance / 2.0;
    } else if (!thief) {
      const activeChar = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status));
      if (activeChar && activeChar.status === "blind") {
        chance = chance / 2.0;
      }
    }
    state.chestState.inspected = true;
    state.chestState.inspectChance = chance; // Save inspect success rate for reliability display
    
    if (Math.random() < chance) {
      state.chestState.identifiedTrap = state.chestState.trap;
      addLog(`調査結果：[${translateTrap(state.chestState.trap)}]の罠のようだ！`);
    } else {
      // Pick random false trap
      const falseTraps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
      const randTrap = falseTraps[Math.floor(Math.random() * falseTraps.length)];
      state.chestState.identifiedTrap = randTrap;
      addLog(`調査結果：[${translateTrap(randTrap)}]の罠の可能性が高い。（不確実）`);
    }
    playSound("move");
    openChestMenu(); // redraw
  });

  // Disarm Chest
  const btnDisarm = document.createElement("button");
  btnDisarm.className = "btn btn-neon btn-block";
  btnDisarm.style.minHeight = "44px";
  btnDisarm.style.flex = "1";
  if (!state.chestState.inspected) {
    btnDisarm.textContent = "解除（要調査）";
    btnDisarm.disabled = true;
  } else if (state.chestState.identifiedTrap === "none") {
    btnDisarm.textContent = "解除不要";
    btnDisarm.disabled = true;
    btnDisarm.classList.add("disabled");
  } else {
    btnDisarm.textContent = "解除する";
  }
  btnDisarm.addEventListener("click", () => {
    openSubmenu("chest_disarmer_select", "罠を解除するキャラクターを選択：");
  });

  // Right Column (Inspect & Disarm)
  const rightColumn = document.createElement("div");
  rightColumn.style.display = "flex";
  rightColumn.style.flexDirection = "column";
  rightColumn.style.gap = "4px";
  rightColumn.style.width = "100%";
  rightColumn.style.height = "100%";
  rightColumn.appendChild(btnInspect);
  rightColumn.appendChild(btnDisarm);
  optGrid.appendChild(rightColumn);

  // Open Chest
  const btnOpen = document.createElement("button");
  btnOpen.className = "btn btn-neon btn-block";
  btnOpen.textContent = "宝箱を開ける";
  btnOpen.style.minHeight = "44px";
  btnOpen.addEventListener("click", () => {
    openChestDirectly();
  });
  optGrid.appendChild(btnOpen);

  // Leave Chest
  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.style.minHeight = "44px";
  btnLeave.addEventListener("click", () => {
    addLog("宝箱を開けずに立ち去った。");
    // Clear chest event on current cell
    state.map[state.y][state.x].event = null;
    if (state.floorChestsOpened) {
      state.floorChestsOpened[state.floor - 1] = (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
    }
    state.chestState = null;
    state.gameState = "explore";
    saveAutosave();
    updateUI();
  });
  optGrid.appendChild(btnLeave);
  
  // Custom back button disable because we are in event
  document.getElementById("btn-submenu-back").style.display = "none";
  updateUI();
}




export function executeDisarm(char) {
  let chance = 0.25;
  if (char.class === "Thief") {
    chance = 0.85;
  } else if (char.class === "Ranger") {
    chance = 0.60;
  }
  chance += getCharTrapBonus(char);
  if (char.status === "blind") {
    chance = chance / 2.0;
  }
  const success = Math.random() < chance;
  
  state.transitioning = true;
  if (success) {
    addLog(`解除成功！${char.name}は無事に罠を解除した。`);
    if (state.codex && state.codex.events && state.codex.events.traps) {
      const tKey = state.chestState.trap;
      if (state.codex.events.traps[tKey]) {
        state.codex.events.traps[tKey].disarmed++;
        if (state.codex.events.traps[tKey].firstFloor === 0) {
          state.codex.events.traps[tKey].firstFloor = state.floor;
        }
      }
    }
    if (state.currentRun) {
      state.currentRun.trapsDisarmed++;
    }
    state.chestState.trap = "none";
    playSound("heal");
  } else {
    addLog(`解除失敗！${char.name}は罠を作動させてしまった！`);
    if (state.currentRun) {
      state.currentRun.trapsTriggered++;
    }
    triggerChestTrap(char);
  }
  
  // Open the chest after disarm attempt resolves
  setTimeout(() => {
    openChestDirectly();
  }, 1500);
}

export function triggerChestTrap(char) {
  if (!state.chestState || state.chestState.trap === "none") return;
  const trap = state.chestState.trap;
  if (state.codex && state.codex.events && state.codex.events.traps) {
    if (state.codex.events.traps[trap]) {
      state.codex.events.traps[trap].triggered++;
      if (state.codex.events.traps[trap].firstFloor === 0) {
        state.codex.events.traps[trap].firstFloor = state.floor;
      }
    }
  }
  state.chestState.trap = "none";
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);

  if (trap === "poison needle") {
    char.hp = Math.max(0, char.hp - 12);
    const ward = getCharAffixSum(char, "poisonWard");
    const resisted = char.hp > 0 && ward > 0 && Math.random() * 100 < ward;
    char.status = char.hp === 0 ? "dead" : (resisted ? char.status : "poisoned");
    addLog(`毒針が作動！${char.name}は12のダメージを受けた。${resisted ? "毒避けの備えで毒は免れた！" : "毒状態になった！"}`);
    if (renderer) renderer.addDamageText("12", "#ff3b30");
  } else if (trap === "gas bomb") {
    addLog("ガス爆弾が作動！パーティ全体にガスが充満した！");
    state.party.forEach(c => {
      if (c.status !== "dead") {
        const dmg = Math.floor(Math.random() * 8) + 5; // 5-12
        c.hp = Math.max(0, c.hp - dmg);
        if (c.hp === 0) c.status = "dead";
        addLog(`${c.name}は${dmg}のガスダメージを受けた。`);
      }
    });
  } else if (trap === "teleporter") {
    // Teleport to random coordinates inside map paths
    // Find empty spots (must not be isolated "stone/wall" cells - i.e. must have at least one open wall)
    const emptySpots = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const cell = state.map[y][x];
        const isPassable = cell.walls.some(closed => !closed);
        if (isPassable && cell.event !== "boss") {
          emptySpots.push({ x, y });
        }
      }
    }
    const spot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
    state.x = spot.x;
    state.y = spot.y;
    state.visitedMap[state.y][state.x] = true;
    addLog("テレポーターが作動！パーティは別の場所にテレポートした！");
  } else if (trap === "flash bomb") {
    addLog("閃光弾が作動！まばゆい光がパーティを包み込んだ！");
    if (renderer && typeof renderer.triggerFlash === "function") {
      renderer.triggerFlash(400);
    }
    state.party.forEach(c => {
      if (c.status === "ok" && Math.random() < 0.60) {
        c.status = "blind";
        addLog(`${c.name}は光に目がくらみ、盲目状態になった！`);
      }
    });
  }
}

export function openChestDirectly() {
  state.transitioning = true;
  const chest = state.chestState;
  const chestMap = state.map;
  const chestX = chest.x;
  const chestY = chest.y;
  
  if (state.currentRun) {
    state.currentRun.chestsOpened++;
  }
  
  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    if (t === "flash bomb") return "閃光弾";
    return "なし";
  };

  // If trap is still active, trigger on character 1
  if (chest.trap !== "none") {
    const opener = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status)) || state.party[0];
    addLog(`宝箱を開けた瞬間、罠 [${translateTrap(chest.trap)}] が作動した！`);
    if (state.currentRun) {
      state.currentRun.trapsTriggered++;
    }
    triggerChestTrap(opener);
  }

  // Award Gold
  state.gold += chest.gold;
  if (state.currentRun) {
    state.currentRun.goldGained += chest.gold;
  }
  addLog(`宝箱から ${chest.gold} ゴールドを見つけた！`);
  
  if (state.codex && state.codex.events && state.codex.events.facilities) {
    if (!state.codex.events.facilities.chest) {
      state.codex.events.facilities.chest = { found: 1, opened: 0 };
    }
    state.codex.events.facilities.chest.opened++;
  }
  
  // Award Item
  if (chest.item) {
    const item = getItemData(chest.item);
    const added = addInventoryItem(chest.item);
    if (added) {
      recordEquipmentDiscovery(chest.item);
      if (state.currentRun) {
        if (typeof chest.item === "string") {
          state.currentRun.itemsFound.push(chest.item);
        } else {
          state.currentRun.equipmentFound.push(chest.item);
        }
      }
      addLog(`アイテム: [${item.name}] を手に入れた！`);
    } else {
      addLog(`[!] バッグがいっぱいで [${item.name}] を持ち帰れなかった！`);
    }
  }

  // Clear the original chest cell even if a trap moved the party.
  chestMap[chestY][chestX].event = null;
  if (state.floorChestsOpened) {
    state.floorChestsOpened[state.floor - 1] = (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
  }

  // Check game over
  const partyAlive = state.party.some(c => c.status !== "dead");
  
  setTimeout(() => {
    resetSubmenuBackButton();
    state.transitioning = false;
    if (!partyAlive) {
      triggerGameOver();
    } else {
      state.chestState = null;
      state.gameState = "explore";
      saveAutosave();
      updateUI();
    }
  }, 1800);
}
