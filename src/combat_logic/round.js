import {
  MONSTERS,
  getCharStr, getCharAgi, getCharVit,
  getCharWeaponAtk, getCharDef,
  getCharAffixSum, getCharMaxHp, getCharMaxMp
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
  applyPartyDamage,
  applyKillAffixEffects,
  tryApplyHitFlinch,
  tryThornCounter,
  logCoreActivation
} from "./damage.js";
import {
  addMonsterBuff,
  tickMonsterBuffs,
  wakeSleepingMonsterOnDamage,
  wakeSleepingCharOnDamage,
  consumeCharIncapacitation,
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
import { getCharCoreParams, getFollowUpChance, getStatusEffectChance } from "../rules/affix_rules.js";

function findMonsterTemplate(name) {
  return MONSTERS.find(m => m.name === name);
}

function applyFleePartingAttack(state, monsters, logQueue) {
  const attacker = monsters.find(mon => mon.hp > 0);
  const target = state.party.find(char => char.status !== "dead");
  if (!attacker || !target) return;

  const finalAtk = getEffectiveAtk(attacker) + Math.floor(Math.random() * 4);
  const finalDef = Math.max(0, getCharDef(target) + Math.floor(getCharVit(target) / 4));
  let dmg = Math.max(1, finalAtk - finalDef);
  dmg = reduceIncomingDamage(target, dmg, { logQueue });
  target.hp = Math.max(0, target.hp - dmg);
  const recovered = wakeSleepingCharOnDamage(target);
  logQueue.push({
    msg: `[ 敵 ] ${attacker.name}の追撃！${target.name}は${dmg}のダメージを受けた。${recovered ? `${target.name}は状態異常から回復した！` : ""}`,
    sound: "hit",
    shake: 8,
    floatText: `${dmg}`,
    floatColor: "#ff3b30"
  });
  if (target.hp === 0) {
    target.status = "dead";
    recordCharDeath(state, target, `${attacker.name}の逃走追撃`);
    logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
  }
}

function applyFleeRetreat(state) {
  const retreat = state.combatState.retreatPosition;
  if (!retreat) return false;
  state.x = retreat.x;
  state.y = retreat.y;
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
  const openedGates = originalState.openedGates ? [...originalState.openedGates] : [];
  
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
    openedGates
  };
  let escaped = false;
  const roundNumber = state.combatState.roundNumber || 1;

  const currentLivingParty = state.party.filter(c => c.status !== "dead");
  currentLivingParty.forEach(char => {
    char.combatLastSurvivor = currentLivingParty.length === 1;
  });
  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status !== "dead") {
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
  const firstMonsterIndex = turns.findIndex(turn => turn.type === "monster");
  turns.forEach((turn, index) => {
    if (turn.type === "char") {
      turn.char.combatFirstStrikeActive = roundNumber === 1
        && (firstMonsterIndex === -1 || index < firstMonsterIndex);
    }
  });

  // Run each action
  turns.forEach(turn => {
    if (escaped) return;
    const livingNow = state.party.filter(char => char.status !== "dead");
    state.party.forEach(char => {
      char.combatLastSurvivor = livingNow.length === 1 && livingNow[0] === char;
    });
    if (turn.type === "char") {
      const char = turn.char;
      if (["sleep", "paralyze", "paralyzed"].includes(char.status)) {
        logQueue.push({ msg: `[味方] ${char.name}は動けない！`, sound: "miss" });
        consumeCharIncapacitation(char, logQueue);
        return;
      }
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
          const firstTurnAttack = roundNumber === 1 ? getCharAffixSum(char, "firstTurnAttack") : 0;
          const weaponAtk = getCharWeaponAtk(char) + firstTurnAttack;
          const str = getCharStr(char);
          const buffAtk = getBuffTotal(char, "atk") + getBuffTotal(char, "str");
          const randRoll = Math.floor(Math.random() * 5); // 0-4
          const meleeMod = getMeleeModifiers(char, turn.idx, { state, logQueue });
          const def = getEffectiveDef(finalTarget);
          dmg = Math.max(1, Math.floor(((weaponAtk + buffAtk) * 1.5 + (str - 10) + randRoll - Math.floor(def / 2)) * meleeMod));
          
          if (char.status === "blind") {
            dmg = Math.max(1, Math.floor(dmg / 2));
          }
          
          if (finalTarget.physResist) {
            dmg = Math.max(1, Math.round(dmg * (1 - finalTarget.physResist)));
          }
          dmg = applyTargetedDamageBonus(char, finalTarget, dmg, { floor: state.floor, maxHp: getCharMaxHp(char), state, logQueue });
          if (guard?.mon === finalTarget && guard.mon.guard?.damageRate) {
            dmg = Math.max(1, Math.round(dmg * guard.mon.guard.damageRate));
          }

          let isCritical = false;
          if (char.class === "Ninja" && !finalTarget.isBoss) {
            const criticalChance = Math.min(0.15, 0.05 + 0.01 * char.level);
            if (Math.random() < criticalChance) {
              isCritical = true;
            }
          }

          if (isCritical) {
            dmg = Math.max(1, dmg * 3);
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            tryApplyHitFlinch(char, finalTarget, logQueue);
            msg = `[味方] 【🗡️急所攻撃！】${char.name}の必殺の一撃！${finalTarget.name}に${dmg}の大ダメージ！`;
            if (wakeSleepingMonsterOnDamage(finalTarget)) msg += `${finalTarget.name}は目を覚ました！`;
            floatText = `${dmg}`;
            sound = "kill";
            shake = 15;
          } else {
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            tryApplyHitFlinch(char, finalTarget, logQueue);
            msg = `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。`;
            if (finalTarget.physResist && dmg <= 2) {
              msg += "（攻撃が弾かれている！）";
            }
            if (wakeSleepingMonsterOnDamage(finalTarget)) {
              msg += `${finalTarget.name}は目を覚ました！`;
            }
            floatText = `${dmg}`;

            // 毒脈の呪いなどによる毒付与チャンス
            if (finalTarget.hp > 0 && finalTarget.status !== "poisoned") {
              const poisonAtkChance = getCharAffixSum(char, "poisonAtk") / 100;
              if (poisonAtkChance > 0 && Math.random() < poisonAtkChance) {
                finalTarget.status = "poisoned";
                logQueue.push({
                  msg: `[味方] [!] ${char.name}の攻撃により、${finalTarget.name}は毒に侵された！`,
                  sound: "poison"
                });
              }
            }
          }

          if (hasTrait(finalTarget, "reflectPhysical") && dmg > 0) {
            const reflected = Math.max(1, Math.floor(dmg * (finalTarget.physicalReflect?.rate ?? 0.3)));
            char.hp = Math.max(0, char.hp - reflected);
            wakeSleepingCharOnDamage(char);
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

          if (hasTrait(finalTarget, "counterSpell") && finalTarget.hp > 0 && Math.random() < (finalTarget.counterSpell?.chance ?? 0.2)) {
            let counterDmg = Math.floor(Math.random() * 11) + 5;
            counterDmg = reduceIncomingDamage(char, counterDmg, { spell: true, logQueue });
            char.hp = Math.max(0, char.hp - counterDmg);
            wakeSleepingCharOnDamage(char);
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
            const opener = char.combatFirstStrikeActive
              ? getCharCoreParams(char, "CORE_OPENER")
              : null;
            const followUpChance = getFollowUpChance(
              char,
              getCharAffixSum(char, "followUp"),
              char.combatFirstStrikeActive
            );
            if (followUpChance > 0 && Math.random() * 100 < followUpChance) {
              if (opener) {
                logCoreActivation(state, logQueue, char, "CORE_OPENER", { once: false });
              }
              const followUpDmgRand = Math.floor(Math.random() * 3);
              const firstTurnAttack = roundNumber === 1 ? getCharAffixSum(char, "firstTurnAttack") : 0;
              const weaponAtk = getCharWeaponAtk(char) + firstTurnAttack;
              const str = getCharStr(char);
              const meleeMod = getMeleeModifiers(char, turn.idx, { state, logQueue });
              const def = getEffectiveDef(finalTarget);
              let followUpDmg = Math.max(1, Math.floor((weaponAtk * 1.5 + (str - 10) + followUpDmgRand - Math.floor(def / 2)) * 0.7 * meleeMod));
              if (finalTarget.physResist) {
                followUpDmg = Math.max(1, Math.round(followUpDmg * (1 - finalTarget.physResist)));
              }
              followUpDmg = applyTargetedDamageBonus(char, finalTarget, followUpDmg, { floor: state.floor, maxHp: getCharMaxHp(char), state, logQueue });
              finalTarget.hp = Math.max(0, finalTarget.hp - followUpDmg);
              tryApplyHitFlinch(char, finalTarget, logQueue);
              const followUpMp = getCharAffixSum(char, "followUpMp");
              if (followUpMp > 0) {
                char.mp = Math.min(getCharMaxMp(char), char.mp + followUpMp);
              }
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
          applyKillAffixEffects(char, finalTarget, state, logQueue);
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
        applyFleePartingAttack(state, monsters, logQueue);
        const retreated = applyFleeRetreat(state);
        logQueue.push({
          msg: retreated
            ? "[味方] 追撃を受けながら戦闘から逃れ、1マス後退した！"
            : "[味方] 追撃を受けながら戦闘から逃れた！後退先がないため、その場に留まった。",
          sound: "miss",
          runEscape: true
        });
        escaped = true;
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      if (mon.flinched) {
        mon.flinched = false;
        logQueue.push({ msg: `[ 敵 ] ${mon.name}は怯んで動けない！`, sound: "miss" });
        return;
      }

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
          if (Math.random() >= getStatusEffectChance(targetSelect.c, 1)) {
            logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は不屈の意志で沈黙を退けた！`, sound: "miss" });
          } else {
            targetSelect.c.silenceTurns = 2;
            logQueue.push({ msg: `[ 敵 ] ${mon.name}は封呪の気配を放った！${targetSelect.c.name}は沈黙した。`, sound: "cast_spell" });
          }
          return;
        }
      }

      if (hasTrait(mon, "antiHeal") && Math.random() < (mon.traitChance ?? 0.3)) {
        const targetSelect = pickTarget(state.party, "lowHp");
        if (targetSelect) {
          if (Math.random() >= getStatusEffectChance(targetSelect.c, 1)) {
            logQueue.push({ msg: `[ 敵 ] ${targetSelect.c.name}は不屈の意志で呪いを退けた！`, sound: "miss" });
          } else {
            targetSelect.c.antiHealTurns = 2;
            logQueue.push({ msg: `[ 敵 ] ${mon.name}は命を喰らう呪いを刻んだ！${targetSelect.c.name}への回復量が半減する。`, sound: "cast_spell" });
          }
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
                wakeSleepingCharOnDamage(c);
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
                wakeSleepingCharOnDamage(c);
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
          wakeSleepingCharOnDamage(target);
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
              wakeSleepingCharOnDamage(c);
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
        const rearEvasion = targetSelect.i >= 2 ? getCharAffixSum(target, "rearEvasion") / 100 : 0;
        if ((target.class === "Ninja" && Math.random() < 0.25) || (rearEvasion > 0 && Math.random() < rearEvasion)) {
          isEvaded = true;
        }

        if (isEvaded) {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！しかし、${target.name}は身軽に回避した！`,
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
          const frontGuard = targetSelect.i < 2 ? getCharAffixSum(target, "frontGuard") : 0;
          const firstStrikeDefense = target.combatFirstStrikeActive ? getCharAffixSum(target, "firstStrikeDefense") : 0;
          const finalDef = Math.max(0, (getCharDef(target) + Math.floor(getCharVit(target) / 4) + getBuffTotal(target, "def") + frontGuard + firstStrikeDefense) - (target.tempDefDown || 0));
          let dmg = Math.max(1, finalAtk - finalDef);
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          
          // Blind target receives 1.5x damage
          if (target.status === "blind") {
            dmg = Math.max(1, Math.round(dmg * 1.5));
          }

          const isMonDragon = mon.spriteType === "dragon" || (mon.tags && mon.tags.includes("dragon"));
          dmg = reduceIncomingDamage(target, dmg, { dragon: isMonDragon, logQueue });
          target.hp = Math.max(0, target.hp - dmg);
          const wakeSuffix = wakeSleepingCharOnDamage(target) ? `${target.name}は目を覚ました！` : "";
          
          const attackMsg = isSnipeAttack
            ? `[ 敵 ] ${mon.name}の狙撃！${target.name}に${dmg}のダメージ！`
            : `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`;
          
          logQueue.push({
            msg: `${attackMsg}${wakeSuffix}`,
            sound: "hit",
            shake: isSnipeAttack ? 12 : 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });

          tryThornCounter(target, mon, targetSelect.i, state, logQueue);
          if (mon.hp === 0) {
            applyKillAffixEffects(target, mon, state, logQueue);
            logQueue.push({ msg: `[味方] [!] ${mon.name}を反撃で倒した！` });
            processMonsterDefeat(monsters, mon, logQueue);
            return;
          }

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
          if (mon.isPoisonous && target.hp > 0 && target.status === "ok" && Math.random() < getStatusEffectChance(target, poisonChance)) {
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
          if (mon.isParalyzing && target.hp > 0 && target.status === "ok" && Math.random() < getStatusEffectChance(target, paralyzeChance)) {
            target.status = "paralyzed";
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は麻痺を受け、麻痺状態になった！`,
              sound: "chest_trap"
            });
          }

          // Apply sleep effect if monster can induce sleep and target survives
          const sleepChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isSleepInflicting && target.hp > 0 && target.status === "ok" && Math.random() < getStatusEffectChance(target, sleepChance)) {
            target.status = "sleep";
            target.sleepTurns = 2;
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は眠りに落ちた！`,
              sound: "chest_trap"
            });
          }

          // Apply blind effect if monster is blinding and target survives
          const blindChance = mon.statusChance !== undefined ? mon.statusChance : 0.35;
          if (mon.isBlinding && target.hp > 0 && target.status === "ok" && Math.random() < getStatusEffectChance(target, blindChance)) {
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

  let allMonstersDead = monsters.every(m => m.hp <= 0);
  if (!allMonstersDead) {
    // モンスターのターン終了時毒ダメージ
    monsters.forEach(m => {
      if (m.status === "poisoned" && m.hp > 0) {
        const pDmg = Math.floor(Math.random() * 3) + 2; // 2-4 damage
        m.hp = Math.max(0, m.hp - pDmg);
        logQueue.push({
          msg: `[ 敵 ] [!] 毒のダメージ！${m.name}は${pDmg}のダメージを受けた。`,
          sound: "hit",
          floatText: `${pDmg}`,
          floatColor: "#ff3b30"
        });
        if (m.hp === 0) {
          logQueue.push({ msg: `[味方] [!] ${m.name}を毒で倒した！` });
          processMonsterDefeat(monsters, m, logQueue);
        }
      }
    });
    allMonstersDead = monsters.every(m => m.hp <= 0);
  }

  const allPartyDeadNow = state.party.every(c => c.status === "dead");

  if (allPartyDeadNow) {
    // 相互全滅：最後の敵と味方全員が同一ラウンドで倒れた場合、勝利より全滅を優先する。
    // 勝利報酬(endCombat)を出すと checkCombatStatus に届く前に戦闘が「勝利」で終わり、
    // ゲームオーバーが発火しない。報酬はスキップし、後段の checkCombatStatus に委ねる。
  } else if (allMonstersDead) {
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

    state.combatState.allParalyzedTurns = 0;
  }

  state.combatState.roundNumber = roundNumber + 1;
  state.party.forEach(char => {
    delete char.combatLastSurvivor;
    delete char.combatFirstStrikeActive;
    delete char.combatFloor;
  });
  return { logQueue, state };
}
