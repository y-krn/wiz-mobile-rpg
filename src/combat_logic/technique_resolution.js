// Resolution of weapon techniques (Build vNext, #1801). A technique reuses
// the shared physical formula (resolveWeaponAttack) with an authored
// multiplier, so displayed units stay the same as the universal attack.
import {
  getPhysicalHitChance,
  getCharWeaponAtk,
  getCharMaxHp,
  getCharMaxMp,
  getCharTrapEaterBonus,
  rollCharWeaponPhysicalRandom,
  combinePhysicalResistances,
  resolveWeaponAttack
} from "../data.js";
import { canMeleeTargetEnemy, findMeleeFallbackTarget } from "./targeting.js";
import {
  getEffectiveDef,
  applyTargetedDamageBonus,
  applyKillAffixEffects,
  recordReceivedDamage
} from "./damage.js";
import { addMonsterBuff, getBuffTotal, wakeSleepingMonsterOnDamage, wakeSleepingCharOnDamage } from "./status_effects.js";
import { clearVulnerableOnDefeat } from "./vulnerable.js";
import { hasTrait, processMonsterDefeat } from "./monster_traits.js";
import { recordCharDeath, queueCharDeathLog } from "../state.js";
import { COMBAT_LOG_PRESENTATION_KINDS } from "../combat_log_semantics.js";
import {
  clearTelegraph,
  commitTechniqueUse,
  getCharTechnique,
  getTechniqueDamageMultiplier,
  isTelegraphing,
  onTechniqueResolved,
  takeNextAttackMultiplier
} from "../rules/technique_rules.js";

function strike(char, target, technique, { state, rng, multiplier, logQueue, monsters }) {
  const hitChance = Math.min(1, getPhysicalHitChance(char, target) + (technique.hitChanceBonus || 0));
  const blindMiss = char.status === "blind" && rng() < 0.5;
  if (blindMiss || (hitChance < 1 && rng() >= hitChance)) {
    logQueue.push({
      msg: `[味方] ${char.name}の${technique.name}！しかし${target.name}に当たらなかった！`,
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL,
      sound: "miss",
      floatText: "外れ",
      floatColor: "#8e8e93",
      floatTarget: monsters.indexOf(target)
    });
    return 0;
  }
  const def = technique.ignoreDefense ? 0 : getEffectiveDef(target);
  const physicalMitigation = getBuffTotal(target, "physicalMitigation");
  const attack = resolveWeaponAttack({
    char,
    weaponAtk: getCharWeaponAtk(char),
    buffAtk: getBuffTotal(char, "atk"),
    randRoll: rollCharWeaponPhysicalRandom(char, rng),
    meleeMod: multiplier,
    def,
    physResist: combinePhysicalResistances(target.physResist, physicalMitigation),
    fixedDamageBonus: getCharTrapEaterBonus(char)
  });
  let dmg = applyTargetedDamageBonus(char, target, attack.damage, {
    floor: state.floor, maxHp: getCharMaxHp(char), state, logQueue
  });
  dmg = Math.max(1, dmg);
  target.hp = Math.max(0, target.hp - dmg);
  let msg = `[味方] ${char.name}の${technique.name}！${target.name}に${dmg}のダメージ。`;
  if (wakeSleepingMonsterOnDamage(target, rng)) msg += `${target.name}は目を覚ました！`;
  logQueue.push({
    msg,
    presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT,
    sound: "hit",
    shake: 10,
    floatText: `${dmg}`,
    floatColor: target.color,
    floatTarget: monsters.indexOf(target)
  });

  if (hasTrait(target, "reflectPhysical") && dmg > 0) {
    const reflected = Math.max(1, Math.floor(dmg * (target.physicalReflect?.rate ?? 0.3)));
    const before = char.hp;
    char.hp = Math.max(0, char.hp - reflected);
    recordReceivedDamage(state, char, target.name, reflected, reflected, before, { attackType: "reflect" });
    wakeSleepingCharOnDamage(char);
    logQueue.push({
      msg: `[ 敵 ] ${target.name}の棘が${char.name}に${reflected}の反射ダメージを与えた！`,
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN,
      sound: "hit"
    });
    if (char.hp === 0) {
      char.status = "dead";
      queueCharDeathLog(logQueue, recordCharDeath(state, char, `${target.name}の物理反射`, { type: "combat", source: target.name }));
    }
  }
  return dmg;
}

function finishKill(char, target, { state, logQueue, monsters }) {
  if (target.hp !== 0) return;
  clearVulnerableOnDefeat(state, target, "defeat");
  applyKillAffixEffects(char, target, state, logQueue);
  logQueue.push({ msg: `[味方] [!] ${target.name}を倒した！` });
  processMonsterDefeat(monsters, target, logQueue);
}

export function resolvePlayerTechnique(char, act, state, monsters, logQueue, { rng = Math.random } = {}) {
  const technique = getCharTechnique(char, state);
  if (!technique) {
    logQueue.push({ msg: `[味方] ${char.name}は技を構えたが、今の武器では出せない。` });
    return { executed: false };
  }
  const use = commitTechniqueUse(state, act.actorIdx);
  if (!use.ok) {
    logQueue.push({ msg: `[味方] ${char.name}の${technique.name}はまだ使えない。` });
    return { executed: false };
  }
  if (use.hpPaid > 0) {
    logQueue.push({
      msg: `[味方] ${char.name}は血を代償に${technique.name}を繰り出す！（HP-${use.hpPaid}）`,
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
    });
  }

  if (technique.target === "self") {
    const maxMp = getCharMaxMp(char);
    const before = char.mp;
    char.mp = Math.min(maxMp, char.mp + (technique.mpRestore || 0));
    char.focusSpellMultiplier = technique.nextSpellMultiplier || 1;
    logQueue.push({
      msg: `[味方] ${char.name}は${technique.name}で魔力を練り上げた。（MP+${char.mp - before}、次の呪文が強まる）`,
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.STATUS_GOOD,
      sound: "heal"
    });
    onTechniqueResolved(char);
    return { executed: true };
  }

  let targetIdx = act.targetIdx;
  if (!canMeleeTargetEnemy(monsters, monsters[targetIdx])) {
    targetIdx = findMeleeFallbackTarget(monsters);
    if (targetIdx === -1) return { executed: true };
  }
  const target = monsters[targetIdx];
  let multiplier = technique.damageMultiplier * getTechniqueDamageMultiplier(char)
    * takeNextAttackMultiplier(char, { technique: true });

  if (technique.interruptsTelegraph && isTelegraphing(target)) {
    multiplier *= (technique.telegraphDamageMultiplier || 1) / technique.damageMultiplier;
    if (!target.isBoss && !target.isMidboss) {
      const cleared = clearTelegraph(target);
      if (cleared.length > 0) {
        logQueue.push({
          msg: `[味方] ${char.name}は${target.name}の動きを見切り、予兆を断ち切った！`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.STATUS_GOOD
        });
      }
    } else {
      logQueue.push({ msg: `[味方] ${char.name}は${target.name}の隙を突いた！` });
    }
  }

  for (let hit = 0; hit < (technique.hits || 1); hit++) {
    if (target.hp <= 0 || char.hp <= 0) break;
    strike(char, target, technique, { state, rng, multiplier, logQueue, monsters });
  }

  if (technique.defDown && target.hp > 0) {
    addMonsterBuff(target, "def", -technique.defDown, technique.defDownTurns || 3);
    logQueue.push({
      msg: `[味方] ${target.name}の守りが砕けた！（防御-${technique.defDown}）`,
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.STATUS_GOOD
    });
  }
  finishKill(char, target, { state, logQueue, monsters });
  onTechniqueResolved(char);
  return { executed: true };
}
