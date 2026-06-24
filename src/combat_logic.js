import { 
  SPELLS, ITEMS, MONSTERS,
  generateRandomEquipment, getItemData, getCharStr, getCharAgi, getCharVit,
  getCharWeaponAtk, getCharDef, checkCharLevelUp,
  getItemBaseId, getCharAffixSum
} from "./data.js";

function getMeleeModifiers(char, actorIdx) {
  const classMeleeRates = {
    Fighter: 1.00,
    Samurai: 0.95,
    Ninja: 0.95,
    Ranger: 0.85,
    Thief: 0.75,
    Priest: 0.60,
    Bishop: 0.50,
    Mage: 0.35
  };
  const classRate = classMeleeRates[char.class] ?? 1.00;
  
  let rowRate = 1.00;
  if (actorIdx >= 2) {
    const weaponId = char.equipment.weapon;
    const baseId = getItemBaseId(weaponId);
    if (baseId === "DAGGER" || baseId === "WAND") {
      rowRate = 0.35;
    } else {
      rowRate = 0.50;
    }
  }
  return classRate * rowRate;
}

function hasTrait(mon, trait) {
  return mon.traits?.includes(trait);
}

function getBuffTotal(mon, type) {
  return (mon.buffs || []).reduce((sum, buff) => {
    return buff.type === type ? sum + buff.value : sum;
  }, 0);
}

function getEffectiveDef(mon) {
  return Math.max(0, mon.def + Math.max(-6, Math.min(6, getBuffTotal(mon, "def"))));
}

function getEffectiveMagicResist(mon) {
  const base = mon.magicResist || 0;
  const buff = Math.max(-0.5, Math.min(0.5, getBuffTotal(mon, "magicResist")));
  return Math.max(-1, Math.min(0.9, base + buff));
}

function getEffectiveAtk(mon) {
  return Math.max(1, mon.atk + Math.max(-6, Math.min(6, getBuffTotal(mon, "atk"))));
}

function hasLivingEnemyFrontRow(monsters) {
  return monsters.some(m => m.hp > 0 && (m.row || "front") === "front");
}

function canMeleeTargetEnemy(monsters, target) {
  if (!target || target.hp <= 0) return false;
  if ((target.row || "front") === "front") return true;
  return !hasLivingEnemyFrontRow(monsters);
}

function findMeleeFallbackTarget(monsters) {
  const frontIdx = monsters.findIndex(m => m.hp > 0 && (m.row || "front") === "front");
  if (frontIdx !== -1) return frontIdx;
  return monsters.findIndex(m => m.hp > 0);
}

function findAdjacentGuard(monsters, targetIdx) {
  const candidates = [targetIdx - 1, targetIdx + 1]
    .filter(idx => idx >= 0 && idx < monsters.length)
    .map(idx => ({ idx, mon: monsters[idx] }))
    .filter(x => x.mon.hp > 0 && hasTrait(x.mon, "guardAdjacent"));
  if (candidates.length === 0) return null;
  const guard = candidates.find(x => Math.random() < (x.mon.guard?.chance ?? 0.5));
  return guard || null;
}

function addMonsterBuff(mon, type, value, turns) {
  if (!mon.buffs) mon.buffs = [];
  mon.buffs.push({ type, value, turns });
}

function tickMonsterBuffs(monsters) {
  monsters.forEach(mon => {
    if (!mon.buffs) return;
    mon.buffs = mon.buffs
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);
  });
}

function applyMagicResistBuffs(monsters, callback) {
  const original = monsters.map(mon => mon.magicResist);
  monsters.forEach(mon => {
    mon.magicResist = getEffectiveMagicResist(mon);
  });
  const result = callback();
  monsters.forEach((mon, idx) => {
    if (original[idx] === undefined) delete mon.magicResist;
    else mon.magicResist = original[idx];
  });
  return result;
}

function processMonsterDefeat(monsters, mon, logQueue) {
  if (mon.hp > 0 || mon.deathProcessed) return;
  mon.deathProcessed = true;
  if (!hasTrait(mon, "splitOnDeath") || mon.hasSplit) return;

  const split = mon.split || {};
  const count = split.count ?? 2;
  const hp = Math.max(1, Math.floor(mon.maxHp * (split.hpRate ?? 0.5)));
  for (let i = 0; i < count; i++) {
    monsters.push({
      ...mon,
      name: `${mon.name}の分裂体${i + 1}`,
      hp,
      maxHp: hp,
      exp: Math.max(1, Math.floor(mon.exp * 0.25)),
      gold: Math.max(0, Math.floor(mon.gold * 0.25)),
      row: "front",
      hasSplit: true,
      deathProcessed: false,
      fled: false
    });
  }
  logQueue.push({ msg: `[ 敵 ] ${mon.name}は崩れ落ち、${count}体に分裂した！` });
}

function applyPartyDamage(state, combatSelection, logQueue, sourceName, minDmg, maxDmg, options = {}) {
  state.party.forEach((c, charIdx) => {
    if (c.status === "dead") return;
    const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
    let dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    if (isDefending) dmg = Math.max(1, Math.round(dmg * (options.defendRate ?? 0.5)));
    dmg = reduceIncomingDamage(c, dmg, { spell: options.spell, dragon: options.dragon, logQueue });
    c.hp = Math.max(0, c.hp - dmg);
    if (c.hp === 0) c.status = "dead";
    logQueue.push({ msg: `[ 敵 ] ${sourceName}により${c.name}は${dmg}のダメージを受けた。${isDefending ? "(防御)" : ""}` });
  });
}

function findMonsterTemplate(name) {
  return MONSTERS.find(m => m.name === name);
}

function getLivingTargetCandidates(party, mode = "front") {
  const active = party
    .map((c, i) => ({ c, i }))
    .filter(x => !["dead", "paralyzed", "sleep"].includes(x.c.status));
  if (mode === "back") {
    const back = active.filter(x => x.i >= 2);
    return back.length > 0 ? back : active;
  }
  if (mode === "lowHp") {
    return [...active].sort((a, b) => (a.c.hp / a.c.maxHp) - (b.c.hp / b.c.maxHp));
  }
  const front = active.filter(x => x.i < 2);
  return front.length > 0 ? front : active;
}

function pickTarget(party, mode = "front") {
  const candidates = getLivingTargetCandidates(party, mode);
  if (candidates.length === 0) return null;
  if (mode === "lowHp") return candidates[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function applyTargetedDamageBonus(char, target, dmg) {
  let next = dmg;
  if (target.tags?.includes("undead")) {
    next = Math.round(next * (1 + getCharAffixSum(char, "antiUndead") / 100));
  }
  if (target.tags?.includes("dragon")) {
    next = Math.round(next * (1 + getCharAffixSum(char, "antiDragon") / 100));
  }
  return Math.max(1, next);
}

function reduceIncomingDamage(char, dmg, options = {}) {
  let next = dmg;
  const reductions = [];
  if (options.spell && char.magicVulnerableTurns > 0) {
    next = Math.max(1, Math.round(next * 1.3));
  }
  if (char.hp / char.maxHp <= 0.25) {
    const guardian = getCharAffixSum(char, "guardian");
    if (guardian > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - guardian / 100)));
      if (next < before) reductions.push("守護");
    }
  }
  if (options.spell) {
    const spellGuard = getCharAffixSum(char, "spellGuard");
    if (spellGuard > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - spellGuard / 100)));
      if (next < before) reductions.push("魔除け");
    }
  }
  if (options.dragon) {
    const dragonGuard = getCharAffixSum(char, "antiDragon");
    if (dragonGuard > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - dragonGuard / 100)));
      if (next < before) reductions.push("竜殺し");
    }
  }
  if (options.logQueue && reductions.length > 0) {
    options.logQueue.push({ msg: `[味方] ${char.name}の${reductions.join("・")}がダメージを和らげた。` });
  }
  return next;
}

function addInventoryItem(state, item, options = {}) {
  const allowQuestOverflow = options.allowQuestOverflow ?? false;
  const itemId = getItemBaseId(item);
  
  const isQuestItem = itemId === "ANTIGRAVITY_CRYSTAL" || 
                      itemId === "DRAGON_KEY" || 
                      itemId === "LEGENDARY_SWORD" || 
                      itemId === "LEGENDARY_SHIELD";
  
  if (state.inventory.length >= 20 && !allowQuestOverflow && !isQuestItem) {
    return false;
  }
  
  state.inventory.push(item);
  return true;
}

export function runCombatRoundCalculation(originalState, combatSelection) {
  const logQueue = [];
  
  const party = originalState.party.map(c => ({
    ...c,
    equipment: {...c.equipment},
    spells: c.spells ? [...c.spells] : []
  }));
  const monsters = originalState.combatState.monsters.map(m => ({
    ...m,
    buffs: m.buffs ? m.buffs.map(buff => ({ ...buff })) : undefined
  }));
  const inventory = [...originalState.inventory];
  const firstKills = originalState.firstKills ? [...originalState.firstKills] : [];
  const codex = originalState.codex ? JSON.parse(JSON.stringify(originalState.codex)) : null;
  const currentRun = originalState.currentRun ? JSON.parse(JSON.stringify(originalState.currentRun)) : null;
  const roamingMonsters = originalState.roamingMonsters ? originalState.roamingMonsters.map(rm => ({...rm})) : [];
  const floorChestsTotal = originalState.floorChestsTotal ? [...originalState.floorChestsTotal] : [];
  
  const state = {
    ...originalState,
    party,
    combatState: {
      ...originalState.combatState,
      monsters
    },
    inventory,
    firstKills,
    codex,
    currentRun,
    roamingMonsters,
    floorChestsTotal,
    gold: originalState.gold
  };
  let escaped = false;

  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status === "ok" || char.status === "poisoned" || char.status === "blind") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const speed = getCharAgi(char) + Math.floor(Math.random() * 10) + getCharAffixSum(char, "firstStrike");
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
      if (hasTrait(mon, "multiAction")) {
        turns.push({
          type: "monster",
          mon,
          idx,
          speed: speed - 1
        });
      }
    }
  });

  // Sort by Speed descending
  turns.sort((a, b) => b.speed - a.speed);

  // Run each action
  turns.forEach(turn => {
    if (escaped) return;
    if (turn.type === "char") {
      const char = turn.char;
      if (char.status !== "ok" && char.status !== "poisoned" && char.status !== "blind") return; // Died/slept earlier in the round
      
      const act = turn.action;
      
      if (act.type === "fight") {
        const target = monsters[act.targetIdx];
        if (!canMeleeTargetEnemy(monsters, target)) {
          if (target?.hp > 0 && (target.row || "front") === "back" && hasLivingEnemyFrontRow(monsters)) {
            logQueue.push({ msg: `[味方] 前列の敵に阻まれて、後列の${target.name}には届かない！` });
          }
          // Find another random living target
          const livingTargetIdx = findMeleeFallbackTarget(monsters);
          if (livingTargetIdx === -1) return; // All dead
          act.targetIdx = livingTargetIdx;
        }

        let finalTarget = monsters[act.targetIdx];
        const guard = findAdjacentGuard(monsters, act.targetIdx);
        if (guard) {
          logQueue.push({ msg: `[ 敵 ] ${guard.mon.name}が${finalTarget.name}を庇った！` });
          act.targetIdx = guard.idx;
          finalTarget = guard.mon;
        }
        
        let isBlindMiss = false;
        if (char.status === "blind" && Math.random() < 0.5) {
          isBlindMiss = true;
        }

        let dmg = 0;
        let msg = "";
        let floatText = "";
        let sound = "hit";
        let shake = 8;
        if (!isBlindMiss && hasTrait(finalTarget, "evasive") && Math.random() < (finalTarget.evasionChance ?? 0.3)) {
          isBlindMiss = true;
          msg = `[味方] ${char.name}の攻撃！しかし${finalTarget.name}は霧のようにかわした！`;
          floatText = "AVOID";
          sound = "miss";
          shake = 0;
        } else if (isBlindMiss) {
          msg = `[味方] ${char.name}の攻撃！しかし目がくらんで空振りした！`;
          floatText = "MISS";
          sound = "miss";
          shake = 0;
        } else {
          // Attack math
          const atkVal = getCharStr(char) + getCharWeaponAtk(char);
          const randRoll = Math.floor(Math.random() * 5); // 0-4
          const meleeMod = getMeleeModifiers(char, turn.idx);
          dmg = Math.max(1, Math.floor((atkVal + randRoll - getEffectiveDef(finalTarget)) * meleeMod));
          
          if (char.status === "blind") {
            dmg = Math.max(1, Math.floor(dmg / 2));
          }
          
          if (finalTarget.physResist) {
            dmg = Math.max(1, Math.round(dmg * (1 - finalTarget.physResist)));
          }
          dmg = applyTargetedDamageBonus(char, finalTarget, dmg);
          if (guard?.mon === finalTarget && guard.mon.guard?.damageRate) {
            dmg = Math.max(1, Math.round(dmg * guard.mon.guard.damageRate));
          }

          // Ninja decapitation (instant death)
          let isDecap = false;
          if (char.class === "Ninja" && !finalTarget.isBoss) {
            const decapChance = Math.min(0.15, 0.05 + 0.01 * char.level);
            if (Math.random() < decapChance) {
              isDecap = true;
            }
          }

          if (isDecap) {
            dmg = finalTarget.hp;
            finalTarget.hp = 0;
            msg = `[味方] 【🗡️急所攻撃！】${char.name}の必殺の一撃！${finalTarget.name}の首をはねた！`;
            floatText = "即死";
            sound = "kill";
            shake = 15;
          } else {
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            msg = `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。`;
            if (finalTarget.physResist && dmg <= 2) {
              msg += "（攻撃が弾かれている！）";
            }
            floatText = `${dmg}`;
          }

          if (!isDecap && hasTrait(finalTarget, "reflectPhysical") && dmg > 0) {
            const reflected = Math.max(1, Math.floor(dmg * (finalTarget.physicalReflect?.rate ?? 0.3)));
            char.hp = Math.max(0, char.hp - reflected);
            if (char.hp === 0) char.status = "dead";
            logQueue.push({
              msg: `[ 敵 ] ${finalTarget.name}の棘が${char.name}に${reflected}の反射ダメージを与えた！`,
              sound: "hit",
              floatText: `${reflected}`,
              floatColor: "#ff3b30"
            });
          }

          if (!isDecap && hasTrait(finalTarget, "counterSpell") && finalTarget.hp > 0 && Math.random() < (finalTarget.counterSpell?.chance ?? 0.2)) {
            let counterDmg = Math.floor(Math.random() * 11) + 5;
            counterDmg = reduceIncomingDamage(char, counterDmg, { spell: true, logQueue });
            char.hp = Math.max(0, char.hp - counterDmg);
            if (char.hp === 0) char.status = "dead";
            logQueue.push({
              msg: `[ 敵 ] ${finalTarget.name}はハリトで反撃した！${char.name}に${counterDmg}の炎ダメージ！`,
              sound: "cast_spell",
              floatText: `${counterDmg}`,
              floatColor: "#ff3b30"
            });
          }

          // followUp (追撃)
          if (!isBlindMiss && finalTarget.hp > 0) {
            const followUpChance = getCharAffixSum(char, "followUp");
            if (followUpChance > 0 && Math.random() * 100 < followUpChance) {
              const followUpDmgRand = Math.floor(Math.random() * 3);
              const atkVal = getCharStr(char) + getCharWeaponAtk(char);
              const meleeMod = getMeleeModifiers(char, turn.idx);
              let followUpDmg = Math.max(1, Math.floor((atkVal + followUpDmgRand - getEffectiveDef(finalTarget)) * 0.7 * meleeMod));
              if (finalTarget.physResist) {
                followUpDmg = Math.max(1, Math.round(followUpDmg * (1 - finalTarget.physResist)));
              }
              followUpDmg = applyTargetedDamageBonus(char, finalTarget, followUpDmg);
              finalTarget.hp = Math.max(0, finalTarget.hp - followUpDmg);
              logQueue.push({
                msg: `[味方] 【🗡️追撃】${char.name}の素早い追加攻撃！${finalTarget.name}に${followUpDmg}のダメージ。`,
                sound: "hit",
                shake: 4,
                floatText: `${followUpDmg}`,
                floatColor: finalTarget.color
              });
            }
          }
        }
        
        logQueue.push({
          msg,
          sound,
          shake,
          floatText,
          floatColor: isBlindMiss ? "#8e8e93" : finalTarget.color
        });

        if (finalTarget.hp === 0) {
          logQueue.push({ msg: `[味方] [!] ${finalTarget.name}を倒した！` });
          processMonsterDefeat(monsters, finalTarget, logQueue);
        }
      } else if (act.type === "spell") {
        const spell = SPELLS[act.spellName];

        if (char.silenceTurns > 0) {
          logQueue.push({ msg: `[味方] ${char.name}は沈黙していて呪文を唱えられない！` });
          return;
        }
        
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
          
          if (hasTrait(target, "reflectMagic") && Math.random() < (target.magicReflect?.chance ?? 0.5)) {
            const reflected = Math.floor(Math.random() * 11) + 5;
            char.hp = Math.max(0, char.hp - reflected);
            if (char.hp === 0) char.status = "dead";
            logQueue.push({
              msg: `[ 敵 ] ${target.name}は呪文を反射した！${char.name}に${reflected}の反射ダメージ！`,
              sound: "cast_spell",
              shake: 8,
              floatText: `${reflected}`,
              floatColor: "#ff3b30"
            });
            return;
          }

          const originalMagicResist = target.magicResist;
          target.magicResist = getEffectiveMagicResist(target);
          const result = spell.effect(char, target);
          if (originalMagicResist === undefined) delete target.magicResist;
          else target.magicResist = originalMagicResist;
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
            processMonsterDefeat(monsters, target, logQueue);
          }
        } else if (spell.target === "all_enemies") {
          const result = applyMagicResistBuffs(monsters, () => spell.effect(char, monsters));
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
              processMonsterDefeat(monsters, m, logQueue);
            }
          });
        } else if (spell.target === "single_ally") {
          const target = state.party[act.targetIdx];
          const result = spell.effect(char, target);
          let floatText = undefined;
          if (result.heal) {
            floatText = `+${result.heal}`;
          } else if (spell.name === "LATUMOFIS" || spell.name === "DIALKO" || spell.name === "DIURCO") {
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
        const inventoryIdx = state.inventory.findIndex(key => key === act.itemKey);
        if (inventoryIdx === -1) {
          logQueue.push({ msg: `[味方] ${char.name}は道具を使おうとしたが、もうバッグに残っていない！` });
          return;
        }
        if (act.itemKey === "TOWN_PORTAL") {
          state.inventory.splice(inventoryIdx, 1);
          logQueue.push({
            msg: `[味方] ${char.name}は帰還のスクロールを読んだ！パーティ全員がお城へ導かれる！`,
            sound: "cast_spell",
            escapeToTown: true
          });
          escaped = true;
          return;
        }
        const target = state.party[act.targetIdx];
        const oldHp = target.hp;
        const log = item.effect(target);
        state.inventory.splice(inventoryIdx, 1);
        let floatText = undefined;
        let floatColor = "#00ff66";
        if (act.itemKey === "HEAL_POTION") {
          floatText = `+${Math.max(0, target.hp - oldHp)}`;
        } else if (act.itemKey === "ANTIDOTE") {
          floatText = "CURED";
        } else if (act.itemKey === "HOLY_WATER") {
          floatText = `+${Math.max(0, target.hp - oldHp)}`;
        } else if (act.itemKey === "MANA_POTION") {
          floatText = (target.class === "Priest" || target.class === "Mage") ? "+3 MP" : "無効";
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
        if (state.combatState.isBoss || state.combatState.isMidboss) {
          logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、強敵の前からは逃げられない！` });
        } else {
          const escape = Math.random() < 0.40;
          if (escape) {
            logQueue.push({
              msg: "[味方] パーティは戦闘から逃げ出した！",
              sound: "miss",
              runEscape: true
            });
            escaped = true;
          } else {
            logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、失敗した！` });
          }
        }
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      if (mon.status === "sleep") {
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}は眠っていて動けない。`,
          sound: "miss"
        });
        return;
      }

      if (hasTrait(mon, "regen") && mon.hp < mon.maxHp) {
        const heal = mon.regenAmount ?? Math.max(1, Math.floor(mon.maxHp * 0.12));
        mon.hp = Math.min(mon.maxHp, mon.hp + heal);
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は再生し、HPが${heal}回復した。` });
      }

      // Check if monster flees
      if (mon.fleeChance && Math.random() < mon.fleeChance) {
        mon.hp = 0;
        mon.fled = true;
        logQueue.push({
          msg: `[ 敵 ] [!] ${mon.name}は逃げ出した！`,
          sound: "miss"
        });
        return;
      }

      if (hasTrait(mon, "selfDestruct") && mon.hp / mon.maxHp <= 0.25) {
        if (mon.selfDestructQueued) {
          mon.hp = 0;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は火花を散らして自爆した！`, sound: "cast_spell", shake: 15, flash: true });
          applyPartyDamage(state, combatSelection, logQueue, mon.name, 4, 8, { spell: true });
          return;
        }
        mon.selfDestructQueued = true;
        logQueue.push({ msg: `[警告] ${mon.name}の体が赤く膨らみ、爆ぜる寸前だ！` });
        return;
      }

      if (hasTrait(mon, "chargeAttack")) {
        if (mon.chargeQueued) {
          mon.chargeQueued = false;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は破滅の波動を放った！`, sound: "cast_spell", shake: 20, flash: true });
          applyPartyDamage(state, combatSelection, logQueue, mon.name, 18, 32, { spell: true, defendRate: 0.5 });
          return;
        }
        if (Math.random() < (mon.traitChance ?? 0.35)) {
          mon.chargeQueued = true;
          logQueue.push({ msg: `[警告] ${mon.name}が魔力を集中している！次のターンに大技が来る！`, sound: "cast_spell" });
          return;
        }
      }

      if (hasTrait(mon, "summonAlly")) {
        mon.turnCount = (mon.turnCount || 0) + 1;
        const livingMonsterCount = monsters.filter(m => m.hp > 0).length;
        const summonLimit = mon.summon?.maxAllies ?? 5;
        if (mon.turnCount % 3 === 0 && livingMonsterCount < summonLimit) {
          const template = findMonsterTemplate(mon.summon?.name || "ゴブリンの呪術師");
          if (template) {
            monsters.push({ ...template, hp: template.hp, maxHp: template.hp });
            logQueue.push({ msg: `[ 敵 ] ${mon.name}は${template.name}を召喚した！` });
            return;
          }
        }
      }

      if (hasTrait(mon, "cleanseAlly") && Math.random() < (mon.traitChance ?? 0.35)) {
        const target = monsters.find(m => m.hp > 0 && ((m.buffs || []).some(buff => buff.value < 0) || m.status === "sleep"));
        if (target) {
          target.buffs = (target.buffs || []).filter(buff => buff.value > 0);
          if (target.status === "sleep") delete target.status;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は${target.name}の弱体を祓った！`, sound: "heal" });
          return;
        }
      }

      if (hasTrait(mon, "drainMp") && Math.random() < (mon.traitChance ?? 0.25)) {
        const targetSelect = pickTarget(state.party, "back");
        if (targetSelect && targetSelect.c.mp > 0) {
          const amount = Math.min(targetSelect.c.mp, mon.drainMpAmount ?? 1);
          targetSelect.c.mp -= amount;
          mon.hp = Math.min(mon.maxHp, mon.hp + amount * 3);
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は${targetSelect.c.name}のMPを${amount}吸い取った！` });
          return;
        }
      }

      if (hasTrait(mon, "silence") && Math.random() < (mon.traitChance ?? 0.25)) {
        const targetSelect = pickTarget(state.party, hasTrait(mon, "targetBackRow") ? "back" : "front");
        if (targetSelect) {
          targetSelect.c.silenceTurns = 2;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は封呪の気配を放った！${targetSelect.c.name}は沈黙した。`, sound: "cast_spell" });
          return;
        }
      }

      if (hasTrait(mon, "antiHeal") && Math.random() < (mon.traitChance ?? 0.3)) {
        const targetSelect = pickTarget(state.party, "lowHp");
        if (targetSelect) {
          targetSelect.c.antiHealTurns = 2;
          logQueue.push({ msg: `[ 敵 ] ${mon.name}は命を喰らう呪いを刻んだ！${targetSelect.c.name}への回復量が半減する。`, sound: "cast_spell" });
          return;
        }
      }

      if (hasTrait(mon, "buffPhysicalDef") && Math.random() < (mon.traitChance ?? 0.3)) {
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "def", mon.buffValue ?? 2, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は仲間の守りを固めた！` });
        return;
      }

      if (hasTrait(mon, "buffMagicDef") && Math.random() < (mon.traitChance ?? 0.3)) {
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "magicResist", mon.buffValue ?? 0.3, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は魔法の結界を張った！` });
        return;
      }

      if (hasTrait(mon, "buffAtk") && Math.random() < (mon.traitChance ?? 0.3)) {
        monsters.filter(m => m.hp > 0).forEach(m => addMonsterBuff(m, "atk", mon.buffValue ?? 3, 3));
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は仲間を鼓舞した！` });
        return;
      }

      // フラック独自のギミック行動
      if (mon.name === "フラック") {
        const hpPct = mon.hp / mon.maxHp;
        const r = Math.random();
        let action = "attack";
        
        if (hpPct <= 0.25) {
          if (r < 0.10) action = "flee";
          else if (r < 0.20) action = "suicide";
          else if (r < 0.60) action = "lahalito";
          else if (r < 0.90) action = "attack";
          else action = "gaze";
        } else if (hpPct <= 0.50) {
          if (r < 0.40) action = "lahalito";
          else if (r < 0.90) action = "attack";
          else action = "gaze";
        } else {
          if (r < 0.70) action = "attack";
          else if (r < 0.90) action = "lahalito";
          else action = "gaze";
        }

        if (action === "flee") {
          mon.hp = 0;
          mon.fled = true;
          logQueue.push({
            msg: `[ 敵 ] [!] フラックは煙に巻いて逃げ出した！`,
            sound: "miss"
          });
          return;
        } else if (action === "suicide") {
          mon.hp = 0;
          logQueue.push({
            msg: `[ 敵 ] フラックは禍々しい光を放ち、自爆した！`,
            sound: "cast_spell",
            shake: 25,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 16) + 15; // 15-30 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の自爆ダメージを受けた。` });
            }
          });
          return;
        } else if (action === "lahalito") {
          logQueue.push({
            msg: `[ 敵 ] フラックは激しい炎の息（ラハリト）を吹き出した！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 16) + 10; // 10-25 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。` });
            }
          });
          return;
        } else if (action === "gaze") {
          const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok");
          if (livingChars.length > 0) {
            const targetChar = livingChars[Math.floor(Math.random() * livingChars.length)];
            const target = targetChar.c;
            const isDefending = combatSelection.actions.some(a => a.actorIdx === targetChar.i && a.type === "defend");
            
            logQueue.push({
              msg: `[ 敵 ] フラックは${target.name}を呪わしき眼光で見つめた！`,
              sound: "cast_spell"
            });

            if (isDefending && Math.random() < 0.50) {
              logQueue.push({ msg: `[ 敵 ] しかし、${target.name}は身を守り呪いを防いだ！` });
            } else {
              const gazeRoll = Math.random();
              if (gazeRoll < 0.50) {
                target.status = "blind";
                logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は盲目になった！` });
              } else {
                target.status = "paralyzed";
                logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は麻痺した！` });
              }
            }
          }
          return;
        }
      }

      // いにしえの竜独自のギミック行動
      if (mon.name === "いにしえの竜") {
        if (mon.tiltowaitQueued) {
          mon.tiltowaitQueued = false;
          mon.turnCount = (mon.turnCount || 0) + 1;
          logQueue.push({
            msg: `[ 敵 ] いにしえの竜はティルトウェイトを唱えた！極大爆裂が襲いかかる！(防御で大幅軽減可能)`,
            sound: "cast_spell",
            shake: 25,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 31) + 45; // 45-75 DMG
              if (isDefending) {
                dmg = Math.max(1, Math.round(dmg * 0.4));
                logQueue.push({ msg: `[ 敵 ] ${c.name}は身を守り、爆裂ダメージを大幅に軽減した！` });
              }
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の爆裂ダメージを受けた。` });
            }
          });
          return;
        }

        mon.turnCount = mon.turnCount || 0;
        const currentTurn = mon.turnCount % 4;
        let action = "attack";

        if (currentTurn === 0) {
          action = "attack";
        } else if (currentTurn === 1) {
          action = Math.random() < 0.5 ? "breath" : "madalto";
        } else if (currentTurn === 2) {
          action = "tiltowait_queue";
        } else {
          action = "attack"; // Fallback
        }

        mon.turnCount++;

        if (action === "tiltowait_queue") {
          mon.tiltowaitQueued = true;
          logQueue.push({
            msg: `[警告] いにしえの竜の角に極大の魔力集まっている…！次のターン、ティルトウェイトの予兆！身を守れ！`,
            sound: "cast_spell",
            flash: true
          });
          return;
        } else if (action === "breath") {
          logQueue.push({
            msg: `[ 敵 ] いにしえの竜は激しい炎の息を吐き出した！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 13) + 12; // 12-24 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。` });
            }
          });
          return;
        } else if (action === "madalto") {
          logQueue.push({
            msg: `[ 敵 ] いにしえの竜はマダルトを唱えた！氷の嵐が吹き荒れる！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 21) + 15; // 15-35 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。` });
            }
          });
          return;
        }
      }

      // Check if monster heals its allies first (35% chance if spellcaster healer)
      const healSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.35;
      if (mon.name !== "いにしえの竜" && mon.spell && ["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < healSpellChance) {
        const woundedMonsters = monsters.filter(m => m.hp > 0 && m.hp < m.maxHp);
        if (woundedMonsters.length > 0) {
          woundedMonsters.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
          const healTarget = woundedMonsters[0];
          const healAmount = mon.spell === "DIOS" ? (Math.floor(Math.random() * 6) + 10) : (Math.floor(Math.random() * 15) + 20);
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}は呪文を唱えた！${healTarget.name}のHPが ${healAmount} 回復した。`,
            sound: "heal",
            floatText: `+${healAmount}`,
            floatColor: "#00ff66"
          });
          return;
        }
      }

      // Prioritize living and active characters for physical attacks
      let targetCandidates = [];
      if (hasTrait(mon, "targetLowHp")) {
        targetCandidates = getLivingTargetCandidates(state.party, "lowHp");
      } else if (mon.isSniper || hasTrait(mon, "targetBackRow")) {
        // Snipe back-row characters (idx 2, 3) who are alive and active
        targetCandidates = getLivingTargetCandidates(state.party, "back");
      } else {
        // Prioritize front-row characters (idx 0, 1)
        targetCandidates = getLivingTargetCandidates(state.party, "front");
      }

      if (targetCandidates.length === 0) return;

      const targetSelect = hasTrait(mon, "targetLowHp") ? targetCandidates[0] : targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
      const target = targetSelect.c;

      // Attack spells (HALITO, LAHALITO etc., excluding healer spells)
      const attackSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.20;
      if (mon.name !== "いにしえの竜" && mon.spell && !["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < attackSpellChance) {
        if (mon.spell === "HALITO") {
          let dmg = Math.floor(Math.random() * 10) + 5;
          const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          dmg = reduceIncomingDamage(target, dmg, { spell: true, dragon: mon.tags?.includes("dragon"), logQueue });
          target.hp = Math.max(0, target.hp - dmg);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${isDefending ? "(半減)" : ""}`,
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
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 15) + 10;
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: mon.tags?.includes("dragon"), logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(半減)" : ""}` });
            }
          });
        } else if (mon.spell === "MADALTO") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はマダルトを唱えた！氷の嵐が吹き荒れる！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 20) + 15; // 15-35 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: mon.tags?.includes("dragon"), logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。${isDefending ? "(半減)" : ""}` });
            }
          });
        } else if (mon.spell === "TILTOWAIT") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はティルトウェイトを唱えた！極大爆裂が襲いかかる！`,
            sound: "cast_spell",
            shake: 25,
            flash: true
          });
          state.party.forEach((c, charIdx) => {
            if (c.status !== "dead") {
              const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
              let dmg = Math.floor(Math.random() * 30) + 35; // 35-65 DMG
              if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
              dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: mon.tags?.includes("dragon"), logQueue });
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の爆裂ダメージを受けた。${isDefending ? "(半減)" : ""}` });
            }
          });
        }
      } else {
        // Ninja physical attack evasion (25% chance to balance with row system)
        let isEvaded = false;
        if (target.class === "Ninja" && Math.random() < 0.25) {
          isEvaded = true;
        }

        if (isEvaded) {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！しかし、忍者${target.name}は身軽に回避した！`,
            sound: "miss",
            shake: 0,
            floatText: "AVOID",
            floatColor: "#00ff66"
          });
        } else {
          const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
          const finalAtk = getEffectiveAtk(mon) + Math.floor(Math.random() * 4);
          const finalDef = Math.max(0, (getCharDef(target) + Math.floor(getCharVit(target) / 4)) - (target.tempDefDown || 0));
          let dmg = Math.max(1, finalAtk - finalDef);
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          
          // Blind target receives 1.5x damage
          if (target.status === "blind") {
            dmg = Math.max(1, Math.round(dmg * 1.5));
          }

          const isMonDragon = mon.spriteType === "dragon" || (mon.tags && mon.tags.includes("dragon"));
          dmg = reduceIncomingDamage(target, dmg, { dragon: isMonDragon, logQueue });
          target.hp = Math.max(0, target.hp - dmg);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`,
            sound: "hit",
            shake: 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });

          if (hasTrait(mon, "debuffPhysicalDef") && target.hp > 0 && Math.random() < (mon.traitChance ?? 0.25)) {
            target.tempDefDown = Math.min(6, (target.tempDefDown || 0) + (mon.debuffValue ?? 2));
            logQueue.push({ msg: `[ 敵 ] ${target.name}の守りが崩された！` });
          }

          if (hasTrait(mon, "debuffMagicDef") && target.hp > 0 && Math.random() < (mon.traitChance ?? 0.25)) {
            target.magicVulnerableTurns = 3;
            logQueue.push({ msg: `[ 敵 ] ${target.name}は魔法に弱くなった！` });
          }

          // Apply poison effect if monster is poisonous and target survives
          const poisonChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isPoisonous && target.hp > 0 && target.status === "ok" && Math.random() < poisonChance) {
            const ward = getCharAffixSum(target, "poisonWard");
            if (ward > 0 && Math.random() * 100 < ward) {
              logQueue.push({
                msg: `[ 敵 ] ${target.name}は防毒の備えで毒を退けた！`,
                sound: "miss"
              });
            } else {
              target.status = "poisoned";
              logQueue.push({
                msg: `[ 敵 ] [!] ${target.name}は毒を受け、毒状態になった！`,
                sound: "chest_trap"
              });
            }
          }

          // Apply paralyze effect if monster is paralyzing and target survives
          const paralyzeChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isParalyzing && target.hp > 0 && ["ok", "poisoned", "blind", "sleep"].includes(target.status) && Math.random() < paralyzeChance) {
            target.status = "paralyzed";
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は麻痺を受け、麻痺状態になった！`,
              sound: "chest_trap"
            });
          }

          // Apply blind effect if monster is blinding and target survives
          const blindChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isBlinding && target.hp > 0 && target.status === "ok" && Math.random() < blindChance) {
            target.status = "blind";
            logQueue.push({
              msg: `[ 敵 ] [!] ${mon.name}の放つ閃光により、${target.name}は盲目状態になった！`,
              sound: "chest_trap"
            });
          }
        }
      }

      if (target.hp === 0) {
        target.status = "dead";
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
    }
  });

  tickMonsterBuffs(monsters);
  state.party.forEach(char => {
    if (char.tempDefDown) char.tempDefDown = Math.max(0, char.tempDefDown - 1);
    if (char.magicVulnerableTurns) char.magicVulnerableTurns = Math.max(0, char.magicVulnerableTurns - 1);
    if (char.silenceTurns) char.silenceTurns = Math.max(0, char.silenceTurns - 1);
    if (char.antiHealTurns) char.antiHealTurns = Math.max(0, char.antiHealTurns - 1);
  });

  if (escaped) {
    return { logQueue, state };
  }

  const allMonstersDead = monsters.every(m => m.hp <= 0);
  if (allMonstersDead) {
    const nonFledMonsters = monsters.filter(m => !m.fled);
    const totalExp = nonFledMonsters.reduce((sum, m) => sum + m.exp, 0);
    const totalGold = nonFledMonsters.reduce((sum, m) => sum + m.gold, 0);
    const livingChars = state.party.filter(c => c.status !== "dead");

    // Check First Kill Bonuses
    let bonusExp = 0;
    let bonusGold = 0;
    const firstKilledNames = [];
    
    nonFledMonsters.forEach(m => {
      // Extract base name (remove " A", " B" suffix)
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (state.firstKills && !state.firstKills.includes(baseName)) {
        if (!state.firstKills) state.firstKills = [];
        state.firstKills.push(baseName);
        firstKilledNames.push(baseName);
        // Bonus reward: 100% of base monster rewards
        bonusExp += m.exp;
        bonusGold += m.gold;
      }
    });

    if (state.codex) {
      if (!state.codex.stats) {
        state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
      }
      state.codex.stats.totalKills += nonFledMonsters.length;
      
      if (!state.codex.monsters) state.codex.monsters = {};
      nonFledMonsters.forEach(m => {
        const baseName = m.name.replace(/\s[A-Z]$/, "");
        if (!state.codex.monsters[baseName]) {
          state.codex.monsters[baseName] = { encountered: 1, killed: 0, firstKilled: false };
        }
        state.codex.monsters[baseName].killed++;
        if (firstKilledNames.includes(baseName)) {
          state.codex.monsters[baseName].firstKilled = true;
        }
        
        // 討伐契約の進捗を更新
        if (state.activeContract && state.activeContract.type === "kill" && state.activeContract.targetMonsterName === baseName) {
          state.activeContract.currentValue = (state.activeContract.currentValue || 0) + 1;
        }
      });
    }

    const expShare = livingChars.length > 0 ? Math.round(totalExp / livingChars.length) : 0;
    const bonusExpShare = (livingChars.length > 0 && bonusExp > 0) ? Math.round(bonusExp / livingChars.length) : 0;

    if (state.currentRun) {
      state.currentRun.kills += nonFledMonsters.length;
      state.currentRun.goldGained += (totalGold + bonusGold);
      state.currentRun.expGained += (expShare + bonusExpShare);
      if (state.combatState.isBoss) {
        state.currentRun.bossesKilled += nonFledMonsters.length;
      } else if (state.combatState.isMidboss || state.combatState.isRoamingFlack) {
        state.currentRun.elitesKilled += nonFledMonsters.length;
      } else {
        nonFledMonsters.forEach(m => {
          if (m.isRare) {
            state.currentRun.elitesKilled++;
          }
        });
      }
    }

    logQueue.push({ msg: "======================================" });
    if (nonFledMonsters.length > 0) {
      let msg = "戦闘に勝利した！";
      if (expShare > 0 && totalGold > 0) {
        msg += `パーティは${totalGold}ゴールドを獲得した。`;
      } else if (expShare > 0) {
        msg += `パーティは戦闘経験を積んだ。`;
      } else if (totalGold > 0) {
        msg += `パーティは${totalGold}ゴールドを獲得した。`;
      }
      logQueue.push({
        msg,
        sound: "level_up"
      });

      // Output first kill bonus logs
      if (firstKilledNames.length > 0) {
        logQueue.push({
          msg: `🎉【初回討伐ボーナス！】初めて [${firstKilledNames.join(", ")}] を討伐した！`,
          sound: "gold"
        });
        logQueue.push({
          msg: `  -> 初討伐の追加報酬：パーティ +${bonusGold} ゴールド / 成長値 +${bonusExpShare}`
        });
      }
    } else {
      logQueue.push({
        msg: `敵がすべて逃げ出し、戦闘が終了した。`,
        sound: "miss"
      });
    }

    state.gold += totalGold + bonusGold;

    livingChars.forEach(c => {
      c.exp += (expShare + bonusExpShare);
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

    // 敵撃破時の未鑑定装備ドロップ判定
    let dropEquipment = null;
    if (state.combatState.isBoss) {
      dropEquipment = generateRandomEquipment(state.floor, "epic");
    } else if (state.combatState.isMidboss) {
      const rarity = Math.random() < 0.25 ? "epic" : "rare";
      dropEquipment = generateRandomEquipment(state.floor, rarity);
    } else if (state.combatState.isRoamingFlack) {
      const rarity = Math.random() < 0.30 ? "epic" : "rare";
      dropEquipment = generateRandomEquipment(state.floor, rarity);
    } else {
      const isRare = state.combatState.monsters && state.combatState.monsters.some(m => m.isRare);
      const chance = isRare ? 0.55 : 0.14;
      if (Math.random() < chance) {
        dropEquipment = generateRandomEquipment(state.floor);
      }
    }

    if (dropEquipment) {
      const added = addInventoryItem(state, dropEquipment);
      if (added) {
        if (state.currentRun) {
          state.currentRun.equipmentFound.push(dropEquipment);
        }
        const eqData = getItemData(dropEquipment);
        logQueue.push({
          msg: `モンスターの骸から [${eqData.name}] を手に入れた！`,
          sound: "gold"
        });
      } else {
        logQueue.push({
          msg: `モンスターは何かを落としたが、バッグが満杯で拾えなかった！`,
          sound: "miss"
        });
      }
    }

    if (state.combatState.isBoss) {
      logQueue.push({
        msg: "ついに伝説の [浮遊石 (クリスタル)] を手に入れた！おしろに持ち帰ろう！",
        sound: "gold",
        giveCrystal: true
      });
    } else if (state.combatState.isMidboss) {
      logQueue.push({
        msg: "デーモンガードの骸から [竜の鍵] を手に入れた！これであの扉を開けられるはずだ！",
        sound: "gold",
        giveKey: true
      });
    } else if (state.combatState.isRoamingFlack) {
      // Remove Flack from state.roamingMonsters
      state.roamingMonsters = state.roamingMonsters.filter(
        rm => !(rm.floor === state.floor && rm.x === state.x && rm.y === state.y)
      );
      logQueue.push({
        msg: "強敵「フラック」を見事に撃破した！",
        sound: "gold"
      });
      logQueue.push({
        msg: "フラックの残骸の影に宝箱を見つけた！",
        triggerChest: true
      });
      if (state.floorChestsTotal) {
        state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
      }
    } else {
      if (Math.random() < 0.20) {
        logQueue.push({
          msg: "モンスターが宝箱を残していった！",
          triggerChest: true
        });
        if (state.floorChestsTotal) {
          state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
        }
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

  return { logQueue, state };
}
