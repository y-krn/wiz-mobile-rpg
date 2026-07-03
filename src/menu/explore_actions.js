import { state, initNewGame, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI } from "../ui.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "../navigation.js";
import { isSpellcaster, getClassJpName, getItemData, getCharWeaponAtk, getCharDef, EXP_LEVELS } from "../data.js";
import { triggerRunResult } from "../result.js";
import { checkCellEvents, executeEnterDungeon } from "../movement.js";
import { triggerGameOver } from "../combat.js";
import { openCampMenu } from "../camp.js";
import { openEquipOverlay } from "../equip.js";
import { executeDisarm } from "../chest.js";

export function handleExploreAction(action) {
  if (state.transitioning || state.gameState !== "explore") return;
  if (action === "search") {
    const cell = state.map[state.y][state.x];
    if (cell && (cell.type === "stairs-up" || cell.type === "stairs-down")) {
      checkCellEvents(state.x, state.y);
    } else {
      addLog("周囲を調べたが、特に何も見つからなかった。");
      updateUI();
    }
  } else if (action === "camp") {
    openCampMenu();
  } else if (action === "spell") {
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && c.maxMp > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    openSubmenu("spell_select", "呪文選択:");
  } else if (action === "tool") {
    openSubmenu("item_user_select", "道具を使う:");
  } else if (action === "item" || action === "equip") {
    openEquipOverlay(0);
  }
}

export function renderItemUserSelect(optGrid) {
  state.party.forEach((char, idx) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${char.name} (Lv.${char.level} ${getClassJpName(char.class)})`;
    btn.addEventListener("click", () => {
      menuContext.actorIdx = idx;
      openSubmenu("item_inventory", `共有バッグ (${state.inventory.length}個) - ${char.name}の使用/装備:`);
    });
    optGrid.appendChild(btn);
  });
}

export function renderItemInventory(optGrid) {
  const char = state.party[menuContext.actorIdx];
  
  const statsDiv = document.createElement("div");
  statsDiv.style.gridColumn = "span 2";
  statsDiv.style.fontFamily = "var(--font-mono)";
  statsDiv.style.fontSize = "11px";
  statsDiv.style.color = "var(--neon-cyan)";
  statsDiv.style.textAlign = "center";
  statsDiv.style.marginBottom = "4px";
  
  const wName = char.equipment.weapon ? getItemData(char.equipment.weapon).name : "なし";
  const sName = char.equipment.shield ? getItemData(char.equipment.shield).name : "なし";
  const aName = char.equipment.armor ? getItemData(char.equipment.armor).name : "なし";
  statsDiv.textContent = `武器: ${wName} | 盾: ${sName} | 鎧: ${aName}`;
  optGrid.appendChild(statsDiv);

  if (state.inventory.length === 0) {
    const btn = document.createElement("button");
    btn.className = "btn btn-block";
    btn.textContent = "バッグは空っぽです";
    btn.disabled = true;
    optGrid.appendChild(btn);
  } else {
    state.inventory.forEach((itemKey, idx) => {
      const item = getItemData(itemKey);
      if (!item) return;
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      const typeJp = item.type === "usable" ? "消費" : item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "鎧";
      btn.textContent = `${item.name} [${typeJp}]`;
      btn.addEventListener("click", () => {
        menuContext.itemKey = itemKey;
        menuContext.itemIdx = idx;
        openSubmenu("item_action", `${item.name}:`);
      });
      optGrid.appendChild(btn);
    });
  }
}

export function renderItemAction(optGrid) {
  const item = getItemData(menuContext.itemKey);
  
  if (item.type === "usable") {
    const btnUse = document.createElement("button");
    btnUse.className = "btn btn-neon btn-block";
    btnUse.textContent = "使用する";
    btnUse.addEventListener("click", () => {
      const char = state.party[menuContext.actorIdx];
      if (menuContext.itemKey === "TOWN_PORTAL") {
        addLog("帰還のスクロールを読んだ！パーティ全員が眩い光に包まれ、一瞬でお城へ戻った！");
        playSound("cast_spell");
        state.inventory.splice(menuContext.itemIdx, 1);
        closeSubmenu();
        triggerRunResult("escape_scroll");
        return;
      }
      const log = item.effect(char);
      addLog(log);
      playSound("heal");
      state.inventory.splice(menuContext.itemIdx, 1);
      saveAutosave();
      goBackSubmenu();
    });
    optGrid.appendChild(btnUse);
  } else if (item.type === "weapon" || item.type === "shield" || item.type === "armor") {
    const btnEquip = document.createElement("button");
    const char = state.party[menuContext.actorIdx];
    const canEquip = !item.classes || item.classes.includes(char.class);

    if (canEquip) {
      btnEquip.className = "btn btn-neon btn-block";
      btnEquip.textContent = "装備する";
      btnEquip.addEventListener("click", () => {
        const slot = item.type; // weapon, shield, armor
        const oldEq = char.equipment[slot];
        char.equipment[slot] = item.id;
        
        if (oldEq) {
          state.inventory[menuContext.itemIdx] = oldEq;
        } else {
          state.inventory.splice(menuContext.itemIdx, 1);
        }
        
        const newAtk = getCharWeaponAtk(char) + char.str;
        const newDef = getCharDef(char);
        
        addLog(`${char.name}は${item.name}を装備した。(攻撃:${newAtk}/守備:${newDef})`);
        playSound("move");
        saveAutosave();
        goBackSubmenu();
      });
    } else {
      btnEquip.className = "btn btn-block";
      btnEquip.textContent = "この職業は装備不可";
      btnEquip.disabled = true;
    }
    optGrid.appendChild(btnEquip);
  } else {
    const btnInfo = document.createElement("button");
    btnInfo.className = "btn btn-block";
    btnInfo.textContent = "今は使用できません";
    btnInfo.disabled = true;
    optGrid.appendChild(btnInfo);
  }
}

export function renderCampMain(optGrid) {
  const btnRest = document.createElement("button");
  btnRest.className = "btn btn-neon btn-block";
  btnRest.textContent = "パーティの強さ";
  btnRest.addEventListener("click", () => {
    openSubmenu("camp_status", "パーティ詳細ステータス:");
  });
  optGrid.appendChild(btnRest);

  const btnItems = document.createElement("button");
  btnItems.className = "btn btn-neon btn-block";
  btnItems.textContent = "装備変更";
  btnItems.addEventListener("click", () => {
    openEquipOverlay(0);
  });
  optGrid.appendChild(btnItems);

  const btnDiscard = document.createElement("button");
  btnDiscard.className = "btn btn-danger btn-block";
  btnDiscard.textContent = "冒険を最初からやり直す";
  btnDiscard.addEventListener("click", () => {
    if (confirm("セーブデータを削除して、最初からやり直しますか？")) {
      initNewGame();
      closeSubmenu();
    }
  });
  optGrid.appendChild(btnDiscard);
}

export function renderGameOverMain(optGrid) {
  const btnBack = document.createElement("button");
  btnBack.className = "btn btn-neon btn-block";
  btnBack.textContent = "街へ戻る（寺院で蘇生・訓練場で編成）";
  btnBack.addEventListener("click", () => {
    state.gameState = "town";
    closeSubmenu();
    updateUI();
  });
  optGrid.appendChild(btnBack);

  const btnRestart = document.createElement("button");
  btnRestart.className = "btn btn-danger btn-block";
  btnRestart.textContent = "最初からやり直す（新規データ）";
  btnRestart.addEventListener("click", () => {
    if (confirm("本当に最初からやり直しますか？現在のセーブデータは消去されます。")) {
      initNewGame();
      state.gameState = "town";
      closeSubmenu();
      updateUI();
    }
  });
  optGrid.appendChild(btnRestart);
}

export function renderEnterDungeonSelect(optGrid) {
  const btnB1F = document.createElement("button");
  btnB1F.className = "btn btn-neon btn-block";
  btnB1F.textContent = "地下1階から潜る";
  btnB1F.addEventListener("click", () => {
    closeSubmenu();
    executeEnterDungeon(1);
  });
  optGrid.appendChild(btnB1F);

  if (state.lastReturnedFloor && state.lastReturnedFloor > 1 && state.lastReturnedFloor <= 4) {
    const btnResume = document.createElement("button");
    btnResume.className = "btn btn-neon btn-block";
    btnResume.textContent = `地下${state.lastReturnedFloor}階から再開`;
    btnResume.addEventListener("click", () => {
      closeSubmenu();
      executeEnterDungeon(state.lastReturnedFloor);
    });
    optGrid.appendChild(btnResume);
  }
}

export function renderCampStatus(optGrid) {
  state.party.forEach(char => {
    const card = document.createElement("div");
    card.style.fontFamily = "var(--font-mono)";
    card.style.fontSize = "11px";
    card.style.border = "1px solid var(--border-color)";
    card.style.padding = "4px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    const classJp = getClassJpName(char.class);
    const nextReq = char.class === "Ninja" ? Math.floor(EXP_LEVELS[char.level + 1] * 1.5) : EXP_LEVELS[char.level + 1];
    const nextText = nextReq ? `${char.exp}/${nextReq}` : `${char.exp}/MAX`;
    card.innerHTML = `
      <strong style="color:var(--neon-gold)">${char.name} (${classJp})</strong>
      <span>HP: ${char.hp}/${char.maxHp} | MP: ${char.mp}/${char.maxMp}</span>
      <span>力:${char.str} 知恵:${char.int} 信仰:${char.pie}</span>
      <span>生命:${char.vit} 素早:${char.agi} 運:${char.luk}</span>
      <span>攻撃:+${getCharWeaponAtk(char)} | 守備:${getCharDef(char)}</span>
      <span style="color:var(--neon-cyan)">EXP: ${nextText}</span>
    `;
    optGrid.appendChild(card);
  });
}

export function renderEventSpring(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  const btnDrink = document.createElement("button");
  btnDrink.className = "btn btn-neon btn-block";
  btnDrink.textContent = "泉の水を飲む";
  btnDrink.addEventListener("click", () => {
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.spring.used++;
    }
    const rand = Math.random();
    if (rand < 0.40) {
      state.party.forEach(char => {
        if (char.status !== "dead") {
          char.hp = Math.min(char.maxHp, char.hp + 20);
        }
      });
      playSound("heal");
      addLog("[!] 泉の水は清らかだった！パーティ全員のHPが20回復した。");
    } else if (rand < 0.70) {
      state.party.forEach(char => {
        if (char.status !== "dead" && char.maxMp > 0) {
          char.mp = Math.min(char.maxMp, char.mp + 3);
        }
      });
      playSound("heal");
      addLog("[!] 泉の水から神秘的な力を感じた！パーティ全員のMPが3回復した。");
    } else if (rand < 0.85) {
      const aliveChars = state.party.filter(char => char.status !== "dead");
      if (aliveChars.length > 0) {
        const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
        target.status = "poisoned";
        playSound("bump");
        addLog(`[!] うわっ、水には毒が混ざっていた！${target.name}は毒状態になった！`);
      }
    } else {
      const aliveChars = state.party.filter(char => char.status !== "dead");
      if (aliveChars.length > 0) {
        const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
        target.status = "paralyzed";
        playSound("bump");
        addLog(`[!] うわっ、水が急に冷たくなり体が動かない！${target.name}は麻痺状態になった！`);
      }
    }
    const currentCell = state.map[state.y][state.x];
    if (currentCell.event === "event_spring") {
      currentCell.event = null;
    }
    saveAutosave();
    closeSubmenu();
  });
  optGrid.appendChild(btnDrink);

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.addEventListener("click", () => {
    addLog("泉に近づかず、そのまま立ち去った。");
    closeSubmenu();
  });
  optGrid.appendChild(btnLeave);
}

export function renderEventTablet(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  const btnRead = document.createElement("button");
  btnRead.className = "btn btn-neon btn-block";
  btnRead.textContent = "文字を読む";
  btnRead.addEventListener("click", () => {
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.tablet.read++;
    }
    const rand = Math.random();
    const currentFloor = state.floor || 1;
    if (rand < 0.40) {
      const hints = [
        "『光は闇を照らし、ロミルワは永遠のミニマップをもたらす。』",
        "『いにしえの竜は極大爆裂呪文ティルトウェイトを放つ。十分に対抗せよ。』",
        "『忍者は武器を持たぬとき、その真の力を発揮する。』",
        "『毒針の罠は、解毒薬かラツモフィスの呪文で治療可能である。』",
        "『地下3階の奥にはデーモンガードが「竜の鍵」を守っているという。』",
        "『さまよう商人は迷宮の奥深くで究極の霊薬エリクサーを売っている。』"
      ];
      const chosenHint = hints[Math.floor(Math.random() * hints.length)];
      const expGained = 100 + currentFloor * 100;
      const goldGained = 50 + currentFloor * 50;
      state.party.forEach(char => {
        if (char.status !== "dead") {
          char.exp += expGained;
        }
      });
      state.gold += goldGained;
      playSound("level_up");
      addLog(`石碑の文字を解読した：`);
      addLog(`「${chosenHint}」`);
      addLog(`[!] 古代の叡智に触れ、全員が${expGained}の経験値を獲得し、${goldGained}Gを見つけた！`);
    } else if (rand < 0.70) {
      const aliveChars = state.party.filter(char => char.status !== "dead");
      if (aliveChars.length > 0) {
        const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
        const trapDmg = 6 + currentFloor * 3;
        target.hp = Math.max(0, target.hp - trapDmg);
        if (target.hp === 0) {
          target.status = "dead";
        }
        playSound("hit");
        addLog(`[!] カチッ…罠が作動した！石碑の隙間から矢が飛び出し、${target.name}に${trapDmg}のダメージ！`);
        if (target.hp === 0) {
          addLog(`[!] ${target.name}は力尽きた！`);
        }
      }
    } else {
      addLog("石碑の文字は風化しており、何も読み取れなかった。");
    }
    const currentCell = state.map[state.y][state.x];
    if (currentCell.event === "event_tablet") {
      currentCell.event = null;
    }
    saveAutosave();

    const allPartyDead = state.party.every(c => c.status === "dead");
    if (allPartyDead) {
      triggerGameOver();
    } else {
      closeSubmenu();
    }
  });
  optGrid.appendChild(btnRead);

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.addEventListener("click", () => {
    addLog("石碑には触れず、そのまま立ち去った。");
    closeSubmenu();
  });
  optGrid.appendChild(btnLeave);
}

export function renderChestDisarmerSelect(optGrid) {
  state.party.forEach((char) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    
    let chance = 0.25;
    if (char.class === "Thief") {
      chance = 0.85;
    } else if (char.class === "Ranger") {
      chance = 0.60;
    }
    if (char.status === "blind") {
      chance = chance / 2.0;
    }
    const pct = Math.floor(chance * 100);
    const blindSuffix = char.status === "blind" ? " / 盲目" : "";
    btn.textContent = `${char.name} (${getClassJpName(char.class)}) 解除 ${pct}%${blindSuffix}`;

    if (!["ok", "poisoned", "blind"].includes(char.status)) btn.disabled = true;
    btn.addEventListener("click", () => {
      if (state.transitioning) return;
      executeDisarm(char);
    });
    optGrid.appendChild(btn);
  });
}

export function clearSaveData() {
  localStorage.removeItem("mobile_wiz_rpg_save");
  localStorage.removeItem("mobile_wiz_rpg_autosave");
}
