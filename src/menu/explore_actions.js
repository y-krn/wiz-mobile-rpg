import { state, initNewGame, saveAutosave, addLog, markMapChanged } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI } from "../ui.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "../navigation.js";
import { isSpellcaster, getClassJpName, getItemData, getCharWeaponAtk, getCharDef, getCharTrapBonus, getPartyMaxAffix, canEquipCoreAffix, DX, DY, DIR_NAMES } from "../data.js";
import { triggerRunResult } from "../result.js";
import { advanceRoamingTurn, challengePendingWarden, checkCellEvents, createNoiseEvent, executeEnterDungeon, getEncounterChance, recordExplorationSteps, retreatPendingWarden, tickExplorationSpellEffects } from "../movement.js";
import { WARDEN_PERCEPTION_HINTS } from "../systems/warden_perception.js";
import { getCampRestStatus, restAtCamp } from "../systems/camp_rest.js";
import { startCombat, triggerGameOver } from "../combat.js";
import { openEquipOverlay, getItemUseStatus } from "../equip.js";
import { executeDisarm, openChestDirectly } from "../chest.js";
import { openWall } from "../map_generator.js";
import { clearCharIncapacitationOnDamage } from "../combat_logic/status_effects.js";

function getSecretSearchDirs() {
  return [
    state.dir,
    (state.dir + 3) % 4,
    (state.dir + 1) % 4,
    (state.dir + 2) % 4
  ];
}

function getSecretDoorCandidate() {
  const cell = state.map[state.y]?.[state.x];
  if (!cell) return null;

  for (const dir of getSecretSearchDirs()) {
    const nx = state.x + DX[dir];
    const ny = state.y + DY[dir];
    const next = state.map[ny]?.[nx];
    const opposite = (dir + 2) % 4;
    if (!next) continue;
    if (cell.secretDoor?.[dir] && !cell.secretFound?.[dir]) {
      return { x: state.x, y: state.y, dir, nx, ny, opposite };
    }
  }
  return null;
}

function calculateSecretSearchSuccessRate() {
  let rate = 0.35;
  const scouts = state.party.filter(c => ["Thief", "Ninja", "Ranger"].includes(c.class) && c.hp > 0);
  if (scouts.length > 0) {
    const bestScout = scouts
      .map(c => {
        let bonus = 0;
        if (c.class === "Thief") bonus = 0.20;
        else if (c.class === "Ninja") bonus = 0.15;
        else if (c.class === "Ranger") bonus = 0.10;
        return bonus + (c.luk + c.agi) * 0.01;
      })
      .sort((a, b) => b - a)[0];
    rate += bestScout;
  }
  rate -= (state.floor - 1) * 0.05;
  return Math.max(0.10, Math.min(0.95, rate));
}

function consumeSearchTurn() {
  recordExplorationSteps();
  tickExplorationSpellEffects();

  const encounterChance = getEncounterChance();

  if ((!state.repelTurns || state.repelTurns <= 0) && Math.random() < encounterChance) {
    state.transitioning = true;
    addLog("探索に時間をかけている間に、モンスターが近づいてきた！");
    setTimeout(() => {
      state.transitioning = false;
      startCombat(false, false);
    }, 600);
    return true;
  }
  return false;
}

function revealSecretDoor(candidate) {
  const cell = state.map[candidate.y][candidate.x];
  const next = state.map[candidate.ny][candidate.nx];
  cell.secretFound[candidate.dir] = true;
  next.secretFound[candidate.opposite] = true;
  openWall(state.map, candidate.x, candidate.y, candidate.dir);
  markMapChanged();
  addLog(`【隠し扉発見！】${DIR_NAMES[candidate.dir]}の壁に秘密の通路を見つけた！`);
  playSound("item");
}

function searchSecretDoor() {
  const candidate = getSecretDoorCandidate();
  const arcaneSense = getPartyMaxAffix(state.party, "arcaneSense");
  const interrupted = consumeSearchTurn();
  if (interrupted) {
    saveAutosave();
    updateUI();
    return true;
  }

  if (candidate && Math.random() < calculateSecretSearchSuccessRate()) {
    revealSecretDoor(candidate);
    saveAutosave();
    updateUI();
    return true;
  }

  if (!interrupted) {
    if (candidate && arcaneSense >= 2) {
      addLog(`${DIR_NAMES[candidate.dir]}の壁の奥に空洞の気配がある。もう少し丁寧に調べる必要がありそうだ。`);
    } else {
      addLog(candidate ? "壁を調べたが、隠し扉は見つからなかった。" : "周囲を調べたが、特に何も見つからなかった。");
    }
    saveAutosave();
    updateUI();
  }
  return true;
}

export function handleExploreAction(action) {
  if (state.transitioning || state.gameState !== "explore") return;
  if (action === "search") {
    const cell = state.map[state.y][state.x];
    if (cell && (cell.type === "stairs-up" || cell.type === "stairs-down")) {
      checkCellEvents(state.x, state.y);
    } else {
      searchSecretDoor();
    }
  } else if (action === "spell") {
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && c.maxMp > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    openSubmenu("spell_select", "呪文選択:");
  } else if (action === "tool") {
    openSubmenu("item_inventory", `共有バッグ (${state.inventory.length}個) - 道具を使う:`);
  } else if (action === "item" || action === "equip") {
    openEquipOverlay(0);
  }
}

export function renderItemInventory(optGrid) {
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
      const typeJp = item.type === "usable" ? "消費" : item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : item.type === "armor" ? "鎧" : "装飾";
      btn.textContent = `${item.name} [${typeJp}]`;
      btn.addEventListener("click", () => {
        menuContext.itemKey = itemKey;
        menuContext.itemIdx = idx;
        openSubmenu(item.exploreDirectional ? "item_direction_select" : "item_target_select", item.exploreDirectional ? `${item.name}を投げる方向:` : `${item.name}の対象を選択:`);
      });
      optGrid.appendChild(btn);
    });
  }
}

export function renderWardenConfirm(optGrid) {
  const info = document.createElement("div");
  info.className = "submenu-info";
  const monster = state.roamingMonsters?.find(rm => rm.id === state.pendingWardenEncounter?.monsterId);
  const perceptionHint = WARDEN_PERCEPTION_HINTS[monster?.perception] || "未知の方法でこちらを捉えている";
  info.textContent = `格上の強敵。${perceptionHint}。`;
  optGrid.appendChild(info);

  const fightBtn = document.createElement("button");
  fightBtn.className = "btn btn-danger btn-block";
  fightBtn.textContent = "挑む";
  fightBtn.addEventListener("click", () => {
    closeSubmenu();
    challengePendingWarden();
  });
  optGrid.appendChild(fightBtn);

  const backBtn = document.createElement("button");
  backBtn.className = "btn btn-neon btn-block";
  backBtn.textContent = "引き返す";
  backBtn.addEventListener("click", () => {
    closeSubmenu();
    retreatPendingWarden();
  });
  optGrid.appendChild(backBtn);
}

export function renderItemDirectionSelect(optGrid) {
  const item = getItemData(menuContext.itemKey);
  if (!item?.exploreDirectional) return;
  DIR_NAMES.forEach((name, dir) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${name}へ投げる`;
    btn.addEventListener("click", () => {
      let x = state.x;
      let y = state.y;
      for (let distance = 0; distance < 3; distance++) {
        if (state.map[y]?.[x]?.walls[dir]) break;
        x += DX[dir];
        y += DY[dir];
      }
      createNoiseEvent(x, y);
      state.inventory.splice(menuContext.itemIdx, 1);
      recordExplorationSteps();
      tickExplorationSpellEffects();
      addLog(`鳴らし玉を${name}へ投げた。甲高い音が迷宮に響く。`);
      playSound("bump");
      closeSubmenu();
      advanceRoamingTurn(false, state.x, state.y);
      saveAutosave();
      updateUI();
    });
    optGrid.appendChild(btn);
  });
}

export function renderItemTargetSelect(optGrid) {
  const item = getItemData(menuContext.itemKey);
  if (!item) return;

  state.party.forEach((char) => {
    const btn = document.createElement("button");
    btn.style.minHeight = "44px";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "6px 12px";

    const charName = `${char.name} (Lv.${char.level} ${getClassJpName(char.class)})`;
    const hpmpText = `HP: ${char.hp}/${char.maxHp} | MP: ${char.mp}/${char.maxMp}`;

    let isAllowed = false;
    let reason = "";

    if (item.type === "usable") {
      const useStatus = getItemUseStatus(char, menuContext.itemKey);
      isAllowed = useStatus.usable;
      reason = useStatus.reason;
    } else if (["weapon", "shield", "armor", "accessory"].includes(item.type)) {
      isAllowed = !item.classes || item.classes.includes(char.class);
      reason = isAllowed ? "" : "この職業は装備不可";
      const itemKey = state.inventory[menuContext.itemIdx];
      if (isAllowed && !canEquipCoreAffix(char, itemKey, item.type)) {
        isAllowed = false;
        reason = "コアは1人につき1個まで";
      }
    }

    if (isAllowed) {
      btn.className = "btn btn-neon btn-block";
      btn.innerHTML = `<span style="font-weight: bold;">${charName}</span><span style="font-size: 10px; color: var(--text-muted);">${hpmpText}</span>`;
      btn.addEventListener("click", () => {
        if (item.type === "usable") {
          if (menuContext.itemKey === "TOWN_PORTAL") {
            addLog("帰還のスクロールを読んだ！冒険者は眩い光に包まれ、一瞬でお城へ戻った！");
            playSound("cast_spell");
            state.inventory.splice(menuContext.itemIdx, 1);
            closeSubmenu();
            triggerRunResult("escape_scroll");
            return;
          }
          const log = item.effect(char, state.party);
          addLog(log);
          playSound("heal");
          state.inventory.splice(menuContext.itemIdx, 1);
          saveAutosave();
          goBackSubmenu();
        } else {
          const slot = item.type;
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
        }
      });
    } else {
      btn.className = "btn btn-block disabled";
      btn.disabled = true;
      btn.innerHTML = `<span style="color: var(--text-muted);">${charName}</span><span style="font-size: 10px; color: var(--text-danger); font-weight: bold;">${reason || "使用できません"}</span>`;
    }

    optGrid.appendChild(btn);
  });
}

export function renderGameOverMain(optGrid) {
  const btnBack = document.createElement("button");
  btnBack.className = "btn btn-neon btn-block";
  btnBack.textContent = "街へ戻り、新しいランを始める";
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
  btnB1F.textContent = "迷宮へ入る";
  btnB1F.addEventListener("click", () => {
    closeSubmenu();
    executeEnterDungeon(1);
  });
  optGrid.appendChild(btnB1F);
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
      addLog("[!] 泉の水は清らかだった！冒険者のHPが20回復した。");
    } else if (rand < 0.70) {
      state.party.forEach(char => {
        if (char.status !== "dead" && char.maxMp > 0) {
          char.mp = Math.min(char.maxMp, char.mp + 3);
        }
      });
      playSound("heal");
      addLog("[!] 泉の水から神秘的な力を感じた！冒険者のMPが3回復した。");
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
      markMapChanged();
    }
    saveAutosave();
    openSubmenu("event_spring_result", "泉の結果：");
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

export function renderEventCamp(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";
  const status = getCampRestStatus(state);

  const info = document.createElement("p");
  info.className = "submenu-description";
  info.textContent = status.reason === "locked"
    ? "門番が徘徊する間は休めない。封印門の門番を倒せば、この野営地を使える。"
    : status.reason === "used"
      ? "この野営地では、すでに今回の遠征中に休息した。"
      : "生存メンバーの失ったHP・MPを40%回復する。状態異常や死亡は回復しない。";
  optGrid.appendChild(info);

  if (status.available) {
    const btnRest = document.createElement("button");
    btnRest.className = "btn btn-neon btn-block";
    btnRest.textContent = "休息する";
    btnRest.addEventListener("click", () => {
      const result = restAtCamp(state);
      if (!result.available) return;
      playSound("heal");
      if (result.coreUsers?.length) addLog(`[野営の達人] ${result.coreUsers.join("・")}の休息効果が倍増した！`);
      addLog(`[!] 野営地で休息した。HP ${result.hpRecovered} / MP ${result.mpRecovered} 回復。`);
      saveAutosave();
      closeSubmenu();
    });
    optGrid.appendChild(btnRest);
  }

  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.addEventListener("click", closeSubmenu);
  optGrid.appendChild(btnLeave);
}

export function renderEventSpringResult(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  const btnReturn = document.createElement("button");
  btnReturn.className = "btn btn-neon btn-block";
  btnReturn.textContent = "探索に戻る";
  btnReturn.addEventListener("click", () => {
    closeSubmenu();
  });
  optGrid.appendChild(btnReturn);
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
      state.party.forEach(char => {
        if (char.status !== "dead") {
          char.exp += expGained;
        }
      });
      playSound("level_up");
      addLog(`石碑の文字を解読した：`);
      addLog(`「${chosenHint}」`);
      addLog(`[!] 古代の叡智に触れ、全員が${expGained}の経験値を獲得した！`);
    } else if (rand < 0.70) {
      const aliveChars = state.party.filter(char => char.status !== "dead");
      if (aliveChars.length > 0) {
        const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
        const trapDmg = 6 + currentFloor * 3;
        target.hp = Math.max(0, target.hp - trapDmg);
        clearCharIncapacitationOnDamage(target);
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
      markMapChanged();
    }
    saveAutosave();

    const allPartyDead = state.party.every(c => c.status === "dead");
    if (allPartyDead) {
      triggerGameOver();
    } else {
      openSubmenu("event_tablet_result", "石碑の結果：");
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

export function renderEventTabletResult(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";

  const btnReturn = document.createElement("button");
  btnReturn.className = "btn btn-neon btn-block";
  btnReturn.textContent = "探索に戻る";
  btnReturn.addEventListener("click", () => {
    closeSubmenu();
  });
  optGrid.appendChild(btnReturn);
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

export function renderChestOpenerSelect(optGrid) {
  state.party.forEach((char) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";

    const trapBonus = getCharTrapBonus(char);
    const statusSuffix = char.status === "blind" ? " / 盲目" : (char.status === "poisoned" ? " / 毒" : "");
    const bonusText = trapBonus > 0 ? ` / 耐罠 +${trapBonus}%` : "";
    btn.textContent = `${char.name} (${getClassJpName(char.class)}) 開ける${statusSuffix}${bonusText}`;

    if (!["ok", "poisoned", "blind"].includes(char.status)) btn.disabled = true;
    btn.addEventListener("click", () => {
      if (state.transitioning) return;
      openChestDirectly(char);
    });
    optGrid.appendChild(btn);
  });
}
