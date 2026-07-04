import {
  MONSTERS,
  getCharStr, getCharAgi, getCharVit,
  getCharWeaponAtk, getCharDef,
  getCharAffixSum
} from "../data.js";
import {
  hasLivingEnemyFrontRow,
  canMeleeTargetEnemy,
  findMeleeFallbackTarget,
  findAdjacentGuard,
  getLivingTargetCandidates,
  pickTarget
} from "./targeting.js";
import {
  getMeleeModifiers,
  getEffectiveDef,
  getEffectiveAtk,
  applyTargetedDamageBonus,
  reduceIncomingDamage,
  applyPartyDamage
} from "./damage.js";
import {
  addMonsterBuff,
  tickMonsterBuffs,
  wakeSleepingMonsterOnDamage,
  getBuffTotal,
  tickCharBuffs
} from "./status_effects.js";
import {
  hasTrait,
  processMonsterDefeat
} from "./monster_traits.js";

import { applyCombatRewards } from "./rewards.js";
import { recordCharDeath } from "../state.js";

import { resolveBossAction } from "./boss_actions.js";
import { resolvePlayerItem } from "./item_resolution.js";
import { resolvePlayerSpell } from "./spell_resolution.js";

function findMonsterTemplate(name) {
  return MONSTERS.find(m => m.name === name);
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

  // 全員麻痺のときの警告メッセージ
  const currentLivingParty = state.party.filter(c => c.status !== "dead");
  const currentAllParalyzed = currentLivingParty.length > 0 && currentLivingParty.every(c => c.status === "paralyzed");
  if (currentAllParalyzed) {
    logQueue.push({ msg: "全員が麻痺して動けない！" });
    logQueue.push({ msg: "敵の攻撃を受けるしかない。" });
  }

  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status === "ok" || char.status === "poisoned" || char.status === "blind") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const speed = getCharAgi(char) + getBuffTotal(char, "agi") + Math.floor(Math.random() * 10) + getCharAffixSum(char, "firstStrike");
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
      if (hasTrait(mon, "multiAction") && mon.multiActionQueued) {
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

        let dmg;
        let msg;
        let floatText;
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
          const weaponAtk = getCharWeaponAtk(char);
          const str = getCharStr(char);
          const buffAtk = getBuffTotal(char, "atk") + getBuffTotal(char, "str");
          const randRoll = Math.floor(Math.random() * 5); // 0-4
          const meleeMod = getMeleeModifiers(char, turn.idx);
          const def = getEffectiveDef(finalTarget);
          dmg = Math.max(1, Math.floor(((weaponAtk + buffAtk) * 1.5 + (str - 10) + randRoll - Math.floor(def / 2)) * meleeMod));
          
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
            if (wakeSleepingMonsterOnDamage(finalTarget)) {
              msg += `${finalTarget.name}は目を覚ました！`;
            }
            floatText = `${dmg}`;
          }

          if (!isDecap && hasTrait(finalTarget, "reflectPhysical") && dmg > 0) {
            const reflected = Math.max(1, Math.floor(dmg * (finalTarget.physicalReflect?.rate ?? 0.3)));
            char.hp = Math.max(0, char.hp - reflected);
            if (char.hp === 0) {
              char.status = "dead";
              recordCharDeath(state, char, `${finalTarget.name}の物理反射`);
            }
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
            if (char.hp === 0) {
              char.status = "dead";
              recordCharDeath(state, char, `${finalTarget.name}の反撃ハリト`);
            }
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
              const weaponAtk = getCharWeaponAtk(char);
              const str = getCharStr(char);
              const meleeMod = getMeleeModifiers(char, turn.idx);
              const def = getEffectiveDef(finalTarget);
              let followUpDmg = Math.max(1, Math.floor((weaponAtk * 1.5 + (str - 10) + followUpDmgRand - Math.floor(def / 2)) * 0.7 * meleeMod));
              if (finalTarget.physResist) {
                followUpDmg = Math.max(1, Math.round(followUpDmg * (1 - finalTarget.physResist)));
              }
              followUpDmg = applyTargetedDamageBonus(char, finalTarget, followUpDmg);
              finalTarget.hp = Math.max(0, finalTarget.hp - followUpDmg);
              const wakeSuffix = wakeSleepingMonsterOnDamage(finalTarget) ? `${finalTarget.name}は目を覚ました！` : "";
              logQueue.push({
                msg: `[味方] 【🗡️追撃】${char.name}の素早い追加攻撃！${finalTarget.name}に${followUpDmg}のダメージ。${wakeSuffix}`,
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
        resolvePlayerSpell(char, act, state, monsters, logQueue);
      } else if (act.type === "item") {
        const res = resolvePlayerItem(char, act, state, logQueue);
        if (res.escaped) {
          escaped = true;
          return;
        }
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

      if (mon.multiActionQueued) {
        mon.multiActionQueued = false;
      }

      if (mon.status === "sleep" || mon.status === "paralyzed" || mon.status === "paralyze") {
        mon.chargeQueued = false;
        mon.selfDestructQueued = false;
        mon.lahalitoQueued = false;
        mon.madaltoQueued = false;
        mon.tiltowaitQueued = false;
        mon.dragonBreathQueued = false;
        mon.multiActionQueued = false;
        mon.summonQueued = false;
        mon.snipeQueued = false;
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}は動けない！`,
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
        if (mon.summonQueued) {
          mon.summonQueued = false;
          const livingMonsterCount = monsters.filter(m => m.hp > 0).length;
          const summonLimit = mon.summon?.maxAllies ?? 5;
          if (livingMonsterCount < summonLimit) {
            const template = findMonsterTemplate(mon.summon?.name || "ゴブリンの呪術師");
            if (template) {
              monsters.push({ ...template, hp: template.hp, maxHp: template.hp });
              logQueue.push({ msg: `[ 敵 ] ${mon.name}は${template.name}を召喚した！` });
              return;
            }
          }
        } else {
          mon.turnCount = (mon.turnCount || 0) + 1;
          const livingMonsterCount = monsters.filter(m => m.hp > 0).length;
          const summonLimit = mon.summon?.maxAllies ?? 5;
          if (mon.turnCount % 3 === 0 && livingMonsterCount < summonLimit) {
            mon.summonQueued = true;
            logQueue.push({ msg: `[警告] ${mon.name}が怪しい声で呪文を唱え始めた！次のターン、召喚の予兆！`, sound: "cast_spell" });
            return;
          }
        }
      }

      if (hasTrait(mon, "multiAction")) {
        if (!mon.multiActionQueued && Math.random() < (mon.traitChance ?? 0.35)) {
          mon.multiActionQueued = true;
          logQueue.push({ msg: `[警告] ${mon.name}の目が血走り、凶暴化している！次のターン、連続攻撃の予兆！`, sound: "cast_spell" });
          return;
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

      // ボス固有の行動判定と実行
      if (resolveBossAction(mon, state, combatSelection, monsters, logQueue)) {
        return;
      }

      // Check if monster heals its allies first (35% chance if spellcaster healer)
      const isSilenced = mon.silenceTurns > 0;
      if (isSilenced) {
        mon.lahalitoQueued = false;
        mon.madaltoQueued = false;
        if (mon.name === "いにしえの竜") {
          mon.tiltowaitQueued = false;
        }
      }

      const healSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.35;
      if (!isSilenced && mon.name !== "いにしえの竜" && mon.spell && ["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < healSpellChance) {
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
      let targetCandidates;
      let targetSelect = null;
      let isSnipeAttack = false;

      if (mon.isSniper || hasTrait(mon, "targetBackRow")) {
        if (mon.snipeQueued) {
          mon.snipeQueued = false;
          isSnipeAttack = true;
          const targetChar = state.party[mon.snipeTargetIdx];
          if (targetChar && targetChar.hp > 0 && targetChar.status !== "dead") {
            const idx = state.party.indexOf(targetChar);
            targetSelect = { c: targetChar, i: idx };
          } else {
            targetCandidates = getLivingTargetCandidates(state.party, "back");
            if (targetCandidates.length > 0) {
              targetSelect = targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
            }
          }
        } else {
          if (Math.random() < (mon.traitChance ?? 0.35)) {
            targetCandidates = getLivingTargetCandidates(state.party, "back");
            if (targetCandidates.length > 0) {
              const selected = targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
              mon.snipeQueued = true;
              mon.snipeTargetIdx = selected.i;
              logQueue.push({
                msg: `[警告] ${mon.name}が後列の${selected.c.name}を狙い定めている！次のターン、狙撃の予兆！`,
                sound: "cast_spell"
              });
              return;
            }
          }
        }
      }

      if (!targetSelect) {
        targetCandidates = hasTrait(mon, "targetLowHp")
          ? getLivingTargetCandidates(state.party, "lowHp")
          : (mon.isSniper || hasTrait(mon, "targetBackRow"))
            ? getLivingTargetCandidates(state.party, "back")
            : getLivingTargetCandidates(state.party, "front");

        if (targetCandidates.length === 0) return;
        targetSelect = hasTrait(mon, "targetLowHp") ? targetCandidates[0] : targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
      }

      const target = targetSelect.c;

      // Attack spells (HALITO, LAHALITO etc., excluding healer spells)
      const attackSpellChance = mon.spellChance !== undefined ? mon.spellChance : 0.20;
      let isLahalitoForced = !isSilenced && mon.spell === "LAHALITO" && mon.lahalitoQueued;
      let isMadaltoForced = !isSilenced && mon.spell === "MADALTO" && mon.madaltoQueued;

      if (isLahalitoForced || isMadaltoForced || (!isSilenced && mon.name !== "いにしえの竜" && mon.spell && !["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < attackSpellChance)) {
        if (isLahalitoForced || mon.spell === "LAHALITO") {
          if (mon.lahalitoQueued) {
            mon.lahalitoQueued = false;
            logQueue.push({
              msg: `[ 敵 ] ${mon.name}は激しい炎の息（ラハリト）を吹き出した！`,
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
                if (c.hp === 0) {
                  c.status = "dead";
                  recordCharDeath(state, c, `${mon.name}のラハリト`);
                }
                logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(半減)" : ""}` });
              }
            });
          } else {
            mon.lahalitoQueued = true;
            logQueue.push({
              msg: `[警告] ${mon.name}の周囲に炎が渦巻く！次のターン、ラハリトの予兆！`,
              sound: "cast_spell"
            });
          }
          return;
        } else if (isMadaltoForced || mon.spell === "MADALTO") {
          if (mon.madaltoQueued) {
            mon.madaltoQueued = false;
            logQueue.push({
              msg: `[ 敵 ] ${mon.name}はマダルトを唱えた！氷の嵐が吹き荒れる！`,
              sound: "cast_spell",
              shake: 15,
              flash: true
            });
            state.party.forEach((c, charIdx) => {
              if (c.status !== "dead") {
                const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
                let dmg = Math.floor(Math.random() * 20) + 15;
                if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
                dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: mon.tags?.includes("dragon"), logQueue });
                c.hp = Math.max(0, c.hp - dmg);
                if (c.hp === 0) {
                  c.status = "dead";
                  recordCharDeath(state, c, `${mon.name}のマダルト`);
                }
                logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。${isDefending ? "(半減)" : ""}` });
              }
            });
          } else {
            mon.madaltoQueued = true;
            logQueue.push({
              msg: `[警告] ${mon.name}の周囲の温度が急激に下がっていく！次のターン、マダルトの予兆！`,
              sound: "cast_spell"
            });
          }
          return;
        } else if (mon.spell === "HALITO") {
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
              if (c.hp === 0) {
                c.status = "dead";
                recordCharDeath(state, c, `${mon.name}のティルトウェイト`);
              }
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
          const baseAtk = getEffectiveAtk(mon);
          let finalAtk;
          if (isSnipeAttack) {
            finalAtk = Math.round(baseAtk * 1.5) + Math.floor(Math.random() * 4);
          } else {
            finalAtk = baseAtk + Math.floor(Math.random() * 4);
          }
          const finalDef = Math.max(0, (getCharDef(target) + Math.floor(getCharVit(target) / 4) + getBuffTotal(target, "def")) - (target.tempDefDown || 0));
          let dmg = Math.max(1, finalAtk - finalDef);
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          
          // Blind target receives 1.5x damage
          if (target.status === "blind") {
            dmg = Math.max(1, Math.round(dmg * 1.5));
          }

          const isMonDragon = mon.spriteType === "dragon" || (mon.tags && mon.tags.includes("dragon"));
          dmg = reduceIncomingDamage(target, dmg, { dragon: isMonDragon, logQueue });
          target.hp = Math.max(0, target.hp - dmg);
          
          const attackMsg = isSnipeAttack
            ? `[ 敵 ] ${mon.name}の狙撃！${target.name}に${dmg}のダメージ！`
            : `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`;
          
          logQueue.push({
            msg: attackMsg,
            sound: "hit",
            shake: isSnipeAttack ? 12 : 8,
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
        let deathCause = `${mon.name}の攻撃`;
        if (isSnipeAttack) {
          deathCause = `${mon.name}の狙撃`;
        } else if (mon.spell) {
          deathCause = `${mon.name}の${mon.spell}`;
        }
        recordCharDeath(state, target, deathCause);
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
    }
  });

  tickMonsterBuffs(monsters);
  tickCharBuffs(state.party);
  state.party.forEach(char => {
    if (char.tempDefDown) char.tempDefDown = Math.max(0, char.tempDefDown - 1);
    if (char.magicVulnerableTurns) char.magicVulnerableTurns = Math.max(0, char.magicVulnerableTurns - 1);
    if (char.silenceTurns) char.silenceTurns = Math.max(0, char.silenceTurns - 1);
    if (char.antiHealTurns) char.antiHealTurns = Math.max(0, char.antiHealTurns - 1);
    if (char.mabarrierTurns) char.mabarrierTurns = Math.max(0, char.mabarrierTurns - 1);
  });

  if (escaped) {
    return { logQueue, state };
  }

  const allMonstersDead = monsters.every(m => m.hp <= 0);
  if (allMonstersDead) {
    applyCombatRewards(state, monsters, logQueue);
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
          recordCharDeath(state, c, "毒のダメージ");
          logQueue.push({ msg: `[味方] [!] ${c.name}は毒で力尽きた！` });
        }
      }
    });

    // 味方各キャラクターの麻痺自然回復判定
    state.party.forEach(c => {
      if (c.status === "paralyzed" && c.hp > 0) {
        if (Math.random() < 0.20) { // 20% の確率で回復
          c.status = "ok";
          logQueue.push({
            msg: `[味方] ${c.name}は麻痺から回復した！`,
            sound: "heal"
          });
        }
      }
    });

    // 全員麻痺の判定と全滅処理
    const nextLivingParty = state.party.filter(c => c.status !== "dead");
    const nextAllParalyzed = nextLivingParty.length > 0 && nextLivingParty.every(c => c.status === "paralyzed");

    if (nextAllParalyzed) {
      state.combatState.allParalyzedTurns = (state.combatState.allParalyzedTurns || 0) + 1;
      logQueue.push({
        msg: `[警告] 全員麻痺状態が続いている！（${state.combatState.allParalyzedTurns}/3ターン）`
      });
      if (state.combatState.allParalyzedTurns >= 3) {
        logQueue.push({
          msg: "全員が麻痺したまま力尽きた…"
        });
        state.party.forEach(c => {
          c.hp = 0;
          c.status = "dead";
          recordCharDeath(state, c, "麻痺による衰弱");
        });
      }
    } else {
      if (state.combatState) {
        state.combatState.allParalyzedTurns = 0;
      }
    }
  }

  return { logQueue, state };
}
