import { state, saveAutosave, addLog, getCharWeaponAtk, getCharDef, checkCharLevelUp } from "./state.js";
import { DIR_N, START_X, START_Y, MONSTERS, ITEMS, SPELLS } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { menuContext, openSubmenu, closeSubmenu } from "./menu.js";
import { setupChestState, resetSubmenuBackButton } from "./chest.js";

// Combat action selection state
export let combatSelection = {
  charIdx: 0,
  actions: [] // array of { type, actorIdx, targetIdx, spellName, itemKey }
};

export function startCombat(isBoss) {
  state.gameState = "combat";
  
  // Choose monsters
  const monsters = [];
  if (isBoss) {
    // Ancient Dragon Boss
    const dragonTemplate = MONSTERS.find(m => m.isBoss);
    monsters.push({
      ...dragonTemplate,
      hp: dragonTemplate.hp,
      maxHp: dragonTemplate.hp
    });
  } else {
    // Regular random encounter
    // Choose 1-3 monsters matching party level
    const avgLevel = Math.round(state.party.reduce((sum, c) => sum + c.level, 0) / state.party.length);
    const count = Math.floor(Math.random() * 3) + 1; // 1-3
    
    // Filter templates close to level
    const candidates = MONSTERS.filter(m => !m.isBoss && Math.abs(m.level - avgLevel) <= 1);
    
    for (let i = 0; i < count; i++) {
      const template = candidates[Math.floor(Math.random() * candidates.length)] || MONSTERS[0];
      // Letters A, B, C
      const suffix = count > 1 ? ` ${String.fromCharCode(65 + i)}` : "";
      monsters.push({
        ...template,
        name: template.name + suffix,
        hp: template.hp,
        maxHp: template.hp
      });
    }
  }

  state.combatState = {
    monsters,
    phase: "choose_actions",
    isBoss
  };

  combatSelection.charIdx = 0;
  combatSelection.actions = [];

  addLog(`戦闘開始！敵が現れた：${monsters.map(m => m.name).join(", ")}`);
  
  // Check if first character needs choice (if alive)
  advanceActionSelection();
  saveAutosave();
}

export function advanceActionSelection() {
  // Find next living character
  const livingIdxs = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok" || x.c.status === "poisoned").map(x => x.i);
  
  const currentSelect = livingIdxs[combatSelection.charIdx];
  if (combatSelection.charIdx >= livingIdxs.length) {
    // All characters chose actions! Run turn resolution.
    resolveCombatRound();
  } else {
    updateUI();
  }
}

export function selectCombatAction(type) {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok" || x.c.status === "poisoned");
  const char = livingChars[combatSelection.charIdx].c;
  const charOriginalIdx = livingChars[combatSelection.charIdx].i;

  if (type === "fight") {
    // Let player choose target monster
    openCombatTargetMenu("enemy", (targetIdx) => {
      combatSelection.actions.push({
        type: "fight",
        actorIdx: charOriginalIdx,
        targetIdx
      });
      combatSelection.charIdx++;
      advanceActionSelection();
    });
  } else if (type === "spell") {
    // Show available caster spells
    if (!char.spells || char.spells.length === 0) {
      addLog(`${char.name}は唱えられる呪文を持っていません。`);
      return;
    }
    openCombatSpellMenu(char, (spellName) => {
      const spell = SPELLS[spellName];
      if (char.mp < spell.cost) {
        addLog("MPが足りません。");
        return;
      }
      
      // Determine targets
      if (spell.target === "single_enemy") {
        openCombatTargetMenu("enemy", (targetIdx) => {
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        });
      } else if (spell.target === "single_ally") {
        openCombatTargetMenu("ally", (targetIdx) => {
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        });
      } else {
        // All enemies / all allies
        combatSelection.actions.push({
          type: "spell",
          actorIdx: charOriginalIdx,
          targetIdx: -1, // targets all
          spellName
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      }
    });
  } else if (type === "item") {
    // Open item selection
    if (state.inventory.length === 0) {
      addLog("共有バッグは空っぽです。");
      return;
    }
    openCombatItemMenu((itemKey, itemIdx) => {
      const item = ITEMS[itemKey];
      if (item.type !== "usable") {
        addLog("戦闘中その装備品は使用できません。");
        return;
      }
      openCombatTargetMenu("ally", (targetIdx) => {
        combatSelection.actions.push({
          type: "item",
          actorIdx: charOriginalIdx,
          targetIdx,
          itemKey,
          itemIdx
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      });
    });
  } else if (type === "defend") {
    combatSelection.actions.push({
      type: "defend",
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  } else if (type === "run") {
    combatSelection.actions.push({
      type: "run",
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  }
}

export function cancelCombatAction() {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;
  if (combatSelection.charIdx > 0) {
    combatSelection.actions.pop();
    combatSelection.charIdx--;
    playSound("move");
    updateUI();
  }
}

export function openCombatTargetMenu(type, callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_target";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = type === "enemy" ? "攻撃対象の敵を選択してください:" : "回復・支援対象の味方を選択してください:";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (type === "enemy") {
    const monsters = state.combatState.monsters;
    monsters.forEach((m, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${m.name} (HP:${m.hp}/${m.maxHp})`;
      if (m.hp <= 0) btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gameState = "combat";
        callback(idx);
      });
      optGrid.appendChild(btn);
    });
  } else {
    // Ally targeting
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (HP:${char.hp}/${char.maxHp})`;
      if (char.status === "dead") btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gameState = "combat";
        callback(idx);
      });
      optGrid.appendChild(btn);
    });
  }
  updateUI();
}

export function openCombatSpellMenu(char, callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_spell";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = `Spell Cast - ${char.name} (MP:${char.mp}/${char.maxMp}):`;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  char.spells.forEach(spKey => {
    const spell = SPELLS[spKey];
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${spell.name} (MP:${spell.cost}) - ${spell.desc}`;
    if (char.mp < spell.cost) btn.disabled = true;
    btn.addEventListener("click", () => {
      state.gameState = "combat";
      callback(spKey);
    });
    optGrid.appendChild(btn);
  });
  updateUI();
}

export function openCombatItemMenu(callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_item";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "使用する道具を選択:";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  state.inventory.forEach((itemKey, idx) => {
    const item = ITEMS[itemKey];
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${item.name}`;
    if (item.type !== "usable") btn.disabled = true;
    btn.addEventListener("click", () => {
      state.gameState = "combat";
      callback(itemKey, idx);
    });
    optGrid.appendChild(btn);
  });
  updateUI();
}

export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  document.getElementById("btn-submenu-back").style.display = "none";
  
  const logQueue = [];
  const monsters = state.combatState.monsters;
  let escaped = false;

  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status === "ok" || char.status === "poisoned") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const speed = char.agi + Math.floor(Math.random() * 10);
      turns.push({
        type: "char",
        char,
        idx,
        speed,
        action: chosen || { type: "defend", actorIdx: idx }
      });
    }
  });

  // Monsters
  monsters.forEach((mon, idx) => {
    if (mon.hp > 0) {
      const speed = 10 + Math.floor(Math.random() * 10); // Standard speed roll
      turns.push({
        type: "monster",
        mon,
        idx,
        speed
      });
    }
  });

  // Sort by Speed descending
  turns.sort((a, b) => b.speed - a.speed);

  // Run each action
  turns.forEach(turn => {
    if (escaped) return;
    if (turn.type === "char") {
      const char = turn.char;
      if (char.status !== "ok" && char.status !== "poisoned") return; // Died/slept earlier in the round
      
      const act = turn.action;
      
      if (act.type === "fight") {
        const target = monsters[act.targetIdx];
        if (target.hp <= 0) {
          // Find another random living target
          const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
          if (livingTargetIdx === -1) return; // All dead
          act.targetIdx = livingTargetIdx;
        }
        
        const finalTarget = monsters[act.targetIdx];
        
        // Attack math
        const atkVal = char.str + getCharWeaponAtk(char);
        const randRoll = Math.floor(Math.random() * 5); // 0-4
        const dmg = Math.max(1, atkVal + randRoll - finalTarget.def);
        
        finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
        logQueue.push({
          msg: `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。`,
          sound: "hit",
          shake: 8,
          floatText: `${dmg}`,
          floatColor: finalTarget.color
        });

        if (finalTarget.hp === 0) {
          logQueue.push({ msg: `[味方] [!] ${finalTarget.name}を倒した！` });
        }
      } else if (act.type === "spell") {
        const spell = SPELLS[act.spellName];
        
        if (char.mp < spell.cost) {
          logQueue.push({ msg: `[味方] ${char.name}は${spell.name}を唱えようとしたが、MPが足りない！` });
          return;
        }
        char.mp -= spell.cost;

        if (spell.target === "single_enemy") {
          let target = monsters[act.targetIdx];
          if (target.hp <= 0) {
            const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
            if (livingTargetIdx === -1) return;
            target = monsters[livingTargetIdx];
          }
          
          const result = spell.effect(char, target);
          target.hp = Math.max(0, target.hp - result.damage);
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "hit",
            shake: 12,
            floatText: `${result.damage}`,
            floatColor: target.color
          });

          if (target.hp === 0) {
            logQueue.push({ msg: `[味方] [!] ${target.name}を倒した！` });
          }
        } else if (spell.target === "all_enemies") {
          const result = spell.effect(char, monsters);
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          
          monsters.forEach(m => {
            if (m.hp === 0 && !m.loggedDeath) {
              m.loggedDeath = true;
              logQueue.push({ msg: `[味方] [!] ${m.name}を倒した！` });
            }
          });
        } else if (spell.target === "single_ally") {
          const target = state.party[act.targetIdx];
          const result = spell.effect(char, target);
          let floatText = undefined;
          if (result.heal) {
            floatText = `+${result.heal}`;
          } else if (spell.name === "LATUMOFIS" || spell.name === "DIALKO") {
            floatText = "CURED";
          }
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "heal",
            floatText,
            floatColor: "#00ff66"
          });
        }
      } else if (act.type === "item") {
        const item = ITEMS[act.itemKey];
        if (act.itemKey === "TOWN_PORTAL") {
          state.inventory.splice(act.itemIdx, 1);
          logQueue.push({
            msg: `[味方] ${char.name}は帰還のスクロールを読んだ！パーティ全員が眩い光に包まれる！`,
            sound: "cast_spell",
            escapeToTown: true
          });
          escaped = true;
          return;
        }
        const target = state.party[act.targetIdx];
        const log = item.effect(target);
        state.inventory.splice(act.itemIdx, 1);
        let floatText = undefined;
        let floatColor = "#00ff66";
        if (act.itemKey === "HEAL_POTION") {
          floatText = "+15";
        } else if (act.itemKey === "ANTIDOTE") {
          floatText = "CURED";
        }
        logQueue.push({
          msg: `[味方] ${log}`,
          sound: "heal",
          floatText,
          floatColor
        });
      } else if (act.type === "defend") {
        logQueue.push({ msg: `[味方] ${char.name}は身を固めて防御している。` });
      } else if (act.type === "run") {
        if (state.combatState.isBoss) {
          logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、竜の前からは逃げられない！` });
        } else {
          const escape = Math.random() < 0.40;
          if (escape) {
            logQueue.push({
              msg: "[味方] パーティは戦闘から逃げ出した！",
              sound: "miss",
              runEscape: true
            });
          } else {
            logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、失敗した！` });
          }
        }
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status !== "dead");
      if (livingChars.length === 0) return;

      const targetSelect = livingChars[Math.floor(Math.random() * livingChars.length)];
      const target = targetSelect.c;

      if (mon.spell && Math.random() < 0.20) {
        if (mon.spell === "HALITO") {
          const dmg = Math.floor(Math.random() * 10) + 5;
          target.hp = Math.max(0, target.hp - dmg);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！`,
            sound: "cast_spell",
            shake: 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });
        } else if (mon.spell === "LAHALITO") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}は激しい炎の息（ラハリト）を吐き出した！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach(c => {
            if (c.status !== "dead") {
              const dmg = Math.floor(Math.random() * 15) + 10;
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。` });
            }
          });
        }
      } else {
        const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
        const finalAtk = mon.atk + Math.floor(Math.random() * 4);
        const finalDef = getCharDef(target);
        let dmg = Math.max(1, finalAtk - finalDef);
        if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
        target.hp = Math.max(0, target.hp - dmg);
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`,
          sound: "hit",
          shake: 8,
          floatText: `${dmg}`,
          floatColor: "#ff3b30"
        });
      }

      if (target.hp === 0) {
        target.status = "dead";
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
    }
  });

  if (escaped) {
    playBattleLogs(logQueue, 0);
    return;
  }

  const allMonstersDead = monsters.every(m => m.hp <= 0);
  if (allMonstersDead) {
    const totalExp = monsters.reduce((sum, m) => sum + m.exp, 0);
    const totalGold = monsters.reduce((sum, m) => sum + m.gold, 0);
    const livingChars = state.party.filter(c => c.status !== "dead");
    const expShare = Math.round(totalExp / livingChars.length);

    logQueue.push({ msg: "======================================" });
    logQueue.push({
      msg: `戦闘に勝利した！パーティは${totalGold}ゴールドを獲得した。`,
      sound: "level_up"
    });

    state.gold += totalGold;

    livingChars.forEach(c => {
      c.exp += expShare;
      logQueue.push({ msg: `${c.name}は${expShare}の経験値を得た。` });
      const lvlUp = checkCharLevelUp(c);
      if (lvlUp) {
        logQueue.push({
          msg: `[★] レベルアップ！${c.name}はレベル${c.level}になった！`,
          sound: "level_up",
          flash: true,
          floatText: "LEVEL UP!",
          floatColor: "#ffb300"
        });
      }
    });

    logQueue.push({ msg: "======================================" });

    if (state.combatState.isBoss) {
      logQueue.push({
        msg: "ついに伝説の [浮遊石 (クリスタル)] を手に入れた！おしろに持ち帰ろう！",
        sound: "gold",
        giveCrystal: true
      });
    } else {
      if (Math.random() < 0.40) {
        logQueue.push({
          msg: "モンスターが宝箱を残していった！",
          triggerChest: true
        });
      } else {
        logQueue.push({
          msg: "周囲に静寂が戻った。",
          endCombat: true
        });
      }
    }
  } else {
    // Combat round end poison damage
    state.party.forEach(c => {
      if (c.status === "poisoned" && c.hp > 0) {
        const pDmg = Math.floor(Math.random() * 3) + 2; // 2-4 damage
        c.hp = Math.max(0, c.hp - pDmg);
        logQueue.push({
          msg: `[味方] [!] 毒のダメージ！${c.name}は${pDmg}のダメージを受けた。`,
          sound: "hit",
          floatText: `${pDmg}`,
          floatColor: "#ff3b30"
        });
        if (c.hp === 0) {
          c.status = "dead";
          logQueue.push({ msg: `[味方] [!] ${c.name}は毒で力尽きた！` });
        }
      }
    });
  }

  playBattleLogs(logQueue, 0);
}

export function playBattleLogs(queue, index) {
  if (index >= queue.length) {
    checkCombatStatus();
    return;
  }

  const log = queue[index];

  if (log.sound) playSound(log.sound);
  if (log.shake && renderer) renderer.triggerShake(log.shake, 250);
  if (log.flash && renderer) renderer.triggerFlash(200);
  if (log.floatText && renderer) renderer.addDamageText(log.floatText, log.floatColor);

  addLog(log.msg);
  updateUI();

  if (log.runEscape) {
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  if (log.escapeToTown) {
    setTimeout(() => {
      state.gameState = "town";
      state.x = START_X;
      state.y = START_Y;
      state.dir = DIR_N;
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  if (log.giveCrystal) {
    state.inventory.push("ANTIGRAVITY_CRYSTAL");
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 3000);
    return;
  }

  if (log.triggerChest) {
    setTimeout(() => {
      state.gameState = "chest";
      setupChestState();
    }, 1500);
    return;
  }

  if (log.endCombat) {
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  const delay = log.msg.startsWith("[!]") || log.msg.includes("[★]") ? 1200 : 700;
  setTimeout(() => {
    playBattleLogs(queue, index + 1);
  }, delay);
}

export function checkCombatStatus() {
  if (!state.combatState) return;

  const monsters = state.combatState.monsters;
  const allMonstersDead = monsters.every(m => m.hp <= 0);
  const allPartyDead = state.party.every(c => c.status === "dead");

  if (allMonstersDead) {
    // 勝利時の処理は resolveCombatRound のログ再生を通して非同期に実行されているため、
    // 二重処理を防ぐために早期リターンします。
    return;
  } else if (allPartyDead) {
    // 全滅
    triggerGameOver();
  } else {
    // 次のターンへ
    state.combatState.phase = "choose_actions";
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    advanceActionSelection();
  }
}

export function triggerGameOver() {
  playSound("game_over");
  state.gameState = "gameover";
  addLog("**************************************************");
  addLog("パーティは全滅した。");
  addLog("冒険者たちの旅は深い暗闇の中で途絶えた。");
  addLog("「おしろから再開」または「最初からやり直す」を選択してください。");
  addLog("**************************************************");
  // Allow reload or reset from sub-menu
  openSubmenu("gameover_main", "全滅：次のオプションを選択してください");
  // Hide normal back button
  document.getElementById("btn-submenu-back").style.display = "none";
}
