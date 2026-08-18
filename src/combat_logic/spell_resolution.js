import { SPELLS } from "../data.js";
import { recordCharDeath, recordMonsterResistanceDiscovery } from "../state.js";
import { getEffectiveMagicResist, applyMagicResistBuffs, applyKillAffixEffects, logCoreActivation } from "./damage.js";
import { hasTrait, processMonsterDefeat } from "./monster_traits.js";
import { clearCharIncapacitationOnDamage, wakeSleepingMonsterOnDamage } from "./status_effects.js";
import { getSpellPayment, paySpellCost } from "../rules/affix_rules.js";
import { getClassPassiveBonus } from "../rules/class_rules.js";
import { getCharMaxMp } from "../rules/character_stats.js";

/**
 * Resolves player spell casting logic.
 */

/**
 * #267: 攻撃呪文が spellCycleMp 回ヒットするごとにMPを1返す。
 * ボス戦は単体戦のため killMp（撃破時MP+1）が発動せず、後衛は
 * B5到達時点で残MP1.64-2.95、ボス戦の呪文使用は1turn未満だった。
 * miss・反射・回復呪文は数えない（ダメージが出たヒットのみ）。
 */
function creditSpellCycleMp(char, hits) {
  if (hits <= 0) return 0;
  const cycle = getClassPassiveBonus(char, "spellCycleMp");
  if (cycle <= 0) return 0;

  char.spellHitStreak = (char.spellHitStreak || 0) + hits;
  const gained = Math.floor(char.spellHitStreak / cycle);
  if (gained <= 0) return 0;

  char.spellHitStreak -= gained * cycle;
  const maxMp = getCharMaxMp(char);
  const before = char.mp;
  char.mp = Math.min(maxMp, char.mp + gained);
  return char.mp - before;
}
function tryReflectMagic(target) {
  if (!hasTrait(target, "reflectMagic")) return 0;
  if (Math.random() >= (target.magicReflect?.chance ?? 0.5)) return 0;
  return Math.floor(Math.random() * 11) + 5;
}

function applyReflectionDamage(char, state, sources, logQueue) {
  const total = sources.reduce((sum, source) => sum + source.damage, 0);
  char.hp = Math.max(0, char.hp - total);
  clearCharIncapacitationOnDamage(char);
  if (char.hp === 0) {
    char.status = "dead";
    const cause = sources.length === 1 ? `${sources[0].name}の魔法反射` : "魔法反射";
    recordCharDeath(state, char, cause, {
      type: "combat",
      source: sources.length === 1 ? sources[0].name : "魔法反射"
    });
  }

  const sourceText = sources.length === 1
    ? `${sources[0].name}は呪文を反射した！`
    : `${sources.map(source => source.name).join("、")}は呪文を反射した！`;
  logQueue.push({
    msg: `[ 敵 ] ${sourceText}${char.name}に${total}の反射ダメージ！`,
    sound: "cast_spell",
    shake: 8,
    floatText: `${total}`,
    floatColor: "#ff3b30"
  });
}

export function resolvePlayerSpell(char, act, state, monsters, logQueue) {
  const spell = SPELLS[act.spellName];

  if (char.silenceTurns > 0) {
    logQueue.push({ msg: `[味方] ${char.name}は沈黙していて呪文を唱えられない！` });
    return;
  }
  
  const payment = getSpellPayment(char, spell.cost);
  if (!payment.canCast) {
    logQueue.push({ msg: `[味方] ${char.name}は${spell.name}を唱えようとしたが、MPもHPも足りない！` });
    return;
  }
  paySpellCost(char, spell.cost);
  if (payment.resource === "hp") {
    logCoreActivation(state, logQueue, char, "CORE_BLOOD_WAND", { once: false });
  }
  char.combatFloor = state.floor;

  if (spell.target === "single_enemy") {
    let target = monsters[act.targetIdx];
    if (target.hp <= 0) {
      const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
      if (livingTargetIdx === -1) return;
      target = monsters[livingTargetIdx];
    }
    
    const reflected = tryReflectMagic(target);
    if (reflected > 0) {
      applyReflectionDamage(char, state, [{ name: target.name, damage: reflected }], logQueue);
      return;
    }

    recordMonsterResistanceDiscovery(target, "magic", state);
    const originalMagicResist = target.magicResist;
    target.magicResist = getEffectiveMagicResist(target);
    const appliedMagicResist = target.magicResist;
    const result = spell.effect(char, target, state.party, {
      telemetryEnabled: Boolean(state.combatFormulaTelemetry),
      state
    });
    result.coreIds?.forEach(coreId => logCoreActivation(state, logQueue, char, coreId));
    if (originalMagicResist === undefined) delete target.magicResist;
    else target.magicResist = originalMagicResist;
    // #611: 攻撃呪文ダメージの計装。既定 no-op、乱数消費・分岐は変更しない。
    if (state.combatFormulaTelemetry && Number.isFinite(result.damage)) {
      state.combatFormulaTelemetry.spellHits.push({
        floor: state.floor,
        spellName: act.spellName,
        casterClass: char.class,
        magicResist: appliedMagicResist,
        damageBeforeMagicResist: result.preMagicResistDamage,
        damage: result.damage,
        formula: result.formulaTelemetry || null
      });
    }
    target.hp = Math.max(0, target.hp - result.damage);
    const wakeSuffix = result.damage > 0 && wakeSleepingMonsterOnDamage(target) ? `${target.name}は目を覚ました！` : "";
    logQueue.push({
      msg: `[味方] ${result.log}${wakeSuffix}`,
      sound: "hit",
      shake: 12,
      floatText: `${result.damage}`,
      floatColor: target.color
    });

    const cycledMp = creditSpellCycleMp(char, result.damage > 0 ? 1 : 0);
    if (cycledMp > 0) {
      logQueue.push({ msg: `[味方] ${char.name}は詠唱の余韻でMPを${cycledMp}回復した。` });
    }

    if (target.hp === 0) {
      applyKillAffixEffects(char, target, state, logQueue);
      logQueue.push({ msg: `[味方] [!] ${target.name}を倒した！` });
      processMonsterDefeat(monsters, target, logQueue);
    }
  } else if (spell.target === "all_enemies") {
    const reflectedSources = monsters
      .filter(mon => mon.hp > 0)
      .map(mon => ({ monster: mon, damage: tryReflectMagic(mon) }))
      .filter(source => source.damage > 0);
    const reflectedMonsters = new Set(reflectedSources.map(source => source.monster));
    const affectedMonsters = monsters.filter(mon => !reflectedMonsters.has(mon));
    affectedMonsters
      .filter(mon => mon.hp > 0)
      .forEach(mon => recordMonsterResistanceDiscovery(mon, "magic", state));
    const beforeHp = monsters.map(mon => mon.hp);
    const result = applyMagicResistBuffs(
      affectedMonsters,
      () => spell.effect(char, affectedMonsters, state.party, {
        telemetryEnabled: Boolean(state.combatFormulaTelemetry),
        state
      })
    );
    result.coreIds?.forEach(coreId => logCoreActivation(state, logQueue, char, coreId));
    // #611: 範囲攻撃呪文の計装。既定 no-op、乱数消費・分岐は変更しない。
    if (state.combatFormulaTelemetry) {
      monsters.forEach((mon, idx) => {
        if (!affectedMonsters.includes(mon) || beforeHp[idx] <= 0) return;
        const hit = result.damageByTarget?.find(entry => entry.target === mon);
        if (!hit) return;
        state.combatFormulaTelemetry.spellHits.push({
          floor: state.floor,
          spellName: act.spellName,
          casterClass: char.class,
          magicResist: getEffectiveMagicResist(mon),
          damageBeforeMagicResist: hit.preMagicResistDamage,
          damage: hit.dmg,
          formula: hit.formulaTelemetry || null
        });
      });
    }
    const wokeNames = monsters
      .filter((mon, idx) => beforeHp[idx] > mon.hp && wakeSleepingMonsterOnDamage(mon))
      .map(mon => mon.name);
    const wakeSuffix = wokeNames.length > 0 ? ` ${wokeNames.join("、")}は目を覚ました！` : "";
    logQueue.push({
      msg: `[味方] ${result.log}${wakeSuffix}`,
      sound: "cast_spell",
      shake: 15,
      flash: true
    });
    if (reflectedSources.length > 0) {
      applyReflectionDamage(
        char,
        state,
        reflectedSources.map(source => ({ name: source.monster.name, damage: source.damage })),
        logQueue
      );
    }

    const damagedCount = monsters.filter((mon, idx) => beforeHp[idx] > mon.hp).length;
    const cycledMp = creditSpellCycleMp(char, damagedCount);
    if (cycledMp > 0) {
      logQueue.push({ msg: `[味方] ${char.name}は詠唱の余韻でMPを${cycledMp}回復した。` });
    }

    monsters.forEach(m => {
      if (m.hp === 0 && !m.loggedDeath) {
        m.loggedDeath = true;
        applyKillAffixEffects(char, m, state, logQueue);
        logQueue.push({ msg: `[味方] [!] ${m.name}を倒した！` });
        processMonsterDefeat(monsters, m, logQueue);
      }
    });
  } else if (spell.target === "single_ally") {
    const target = state.party[act.targetIdx];
    const result = spell.effect(char, target, state.party);
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
  } else if (spell.target === "all_allies") {
    const result = spell.effect(char, state.party, state.party);
    const floatText = spell.name === "MADI" ? (result.heal ? `+${result.heal}` : "HEAL") : "BARRIER";
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "heal",
      floatText,
      floatColor: "#00ff66"
    });
  }
}
