import { reduceIncomingDamage, recordReceivedDamage } from "./damage.js";
import { recordCharDeath, queueCharDeathLog, recordMonsterAction, recordMonsterCondition } from "../state.js";
import { getStatusEffectChance } from "../rules/affix_rules.js";
import {
  applyStatusEffect,
  clearCharIncapacitationOnDamage,
  STATUS_EFFECT_IDS
} from "./status_effects.js";
import {
  getMilestoneBossRule,
  shouldBreakMilestoneBossGuard
} from "../rules/boss_rules.js";
import { resolveGuardMitigation, resolveGuardStatusChance } from "../rules/guard_rules.js";
import { COMBAT_LOG_PRESENTATION_KINDS } from "../combat_log_semantics.js";

const ANCIENT_DRAGON_NAME = "いにしえの竜";

function getAncientDragonCycleStep(mon) {
  const step = Number.isInteger(mon.ancientDragonCycleStep)
    ? mon.ancientDragonCycleStep
    : 0;
  return ((step % 4) + 4) % 4;
}

export function ensureAncientDragonCycleStep(mon) {
  if (mon.name !== ANCIENT_DRAGON_NAME) return;
  mon.ancientDragonCycleStep = getAncientDragonCycleStep(mon);
}

export function advanceAncientDragonCycleStep(mon) {
  if (mon.name !== ANCIENT_DRAGON_NAME) return;
  mon.ancientDragonCycleStep = (getAncientDragonCycleStep(mon) + 1) % 4;
}

/** Resolves only an already-queued ancient-dragon special. */
export function resolveQueuedAncientDragonAction(mon, state, combatSelection, logQueue, options = {}) {
  if (mon.name !== ANCIENT_DRAGON_NAME) return false;

  const rng = options.rng || Math.random;
  const measurement = options.measurement || null;
  const recordAction = action => recordMonsterAction(mon, action, state, measurement);
  const isSilenced = mon.silenceTurns > 0;

  if (mon.tiltowaitQueued && !isSilenced) {
    mon.tiltowaitQueued = false;
    advanceAncientDragonCycleStep(mon);
    recordAction("TILTOWAIT");
    logQueue.push({
      msg: `[ 敵 ] いにしえの竜はティルトウェイトを唱えた！極大爆裂が襲いかかる！(防御で大幅軽減可能)`,
      sound: "cast_spell",
      shake: 25,
      flash: true
    });
    state.party.forEach((c, charIdx) => {
      if (c.status !== "dead") {
        const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
        let dmg = Math.floor(rng() * 31) + 45; // 45-75 DMG
        if (isDefending) {
          dmg = resolveGuardMitigation(c, dmg, {
            isDefending,
            attackType: "special",
            baseMultiplier: 0.4,
            telemetry: state.combatFormulaTelemetry
          });
          logQueue.push({ msg: `[ 敵 ] ${c.name}は身を守り、爆裂ダメージを大幅に軽減した！` });
        } else {
          dmg = resolveGuardMitigation(c, dmg, {
            attackType: "special",
            telemetry: state.combatFormulaTelemetry
          });
        }
        const rawDamage = dmg;
        const playerHpBefore = c.hp;
        dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue, state });
        c.hp = Math.max(0, c.hp - dmg);
        recordReceivedDamage(state, c, "いにしえの竜", rawDamage, dmg, playerHpBefore, { attackType: "special", isDefending, measurement });
        const recovered = clearCharIncapacitationOnDamage(c);
        logQueue.push({
          msg: `[ 敵 ] ${c.name}は${dmg}の爆裂ダメージを受けた。${recovered ? `${c.name}は状態異常から回復した！` : ""}`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
        });
        if (c.hp === 0) {
          c.status = "dead";
          const deathLog = recordCharDeath(state, c, "いにしえの竜のティルトウェイト", { type: "combat", source: "いにしえの竜" });
          queueCharDeathLog(logQueue, deathLog);
        }
      }
    });
    return true;
  }

  if (mon.dragonBreathQueued) {
    if (isSilenced) {
      mon.tiltowaitQueued = false;
      mon.madaltoQueued = false;
    }
    mon.dragonBreathQueued = false;
    advanceAncientDragonCycleStep(mon);
    recordAction("炎の息");
    logQueue.push({
      msg: `[ 敵 ] いにしえの竜は激しい炎の息を吐き出した！`,
      sound: "cast_spell",
      shake: 15,
      flash: true
    });
    state.party.forEach((c, charIdx) => {
      if (c.status !== "dead") {
        const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
        let dmg = Math.floor(rng() * 13) + 12; // 12-24 DMG
        dmg = resolveGuardMitigation(c, dmg, {
          isDefending,
          attackType: "breath",
          telemetry: state.combatFormulaTelemetry
        });
        const rawDamage = dmg;
        const playerHpBefore = c.hp;
        dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue, state });
        c.hp = Math.max(0, c.hp - dmg);
        recordReceivedDamage(state, c, "いにしえの竜", rawDamage, dmg, playerHpBefore, { attackType: "breath", isDefending, measurement });
        const recovered = clearCharIncapacitationOnDamage(c);
        logQueue.push({
          msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(軽減)" : ""}${recovered ? `${c.name}は状態異常から回復した！` : ""}`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
        });
        if (c.hp === 0) {
          c.status = "dead";
          const deathLog = recordCharDeath(state, c, "いにしえの竜の炎の息", { type: "combat", source: "いにしえの竜" });
          queueCharDeathLog(logQueue, deathLog);
        }
      }
    });
    return true;
  }

  if (mon.madaltoQueued && !isSilenced) {
    mon.madaltoQueued = false;
    advanceAncientDragonCycleStep(mon);
    logQueue.push({
      msg: `[ 敵 ] いにしえの竜はマダルトを唱えた！氷の嵐が吹き荒れる！`,
      sound: "cast_spell",
      shake: 15,
      flash: true
    });
    recordAction("MADALTO");
    state.party.forEach((c, charIdx) => {
      if (c.status !== "dead") {
        const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
        let dmg = Math.floor(rng() * 21) + 15; // 15-35 DMG
        dmg = resolveGuardMitigation(c, dmg, {
          isDefending,
          attackType: "spell",
          telemetry: state.combatFormulaTelemetry
        });
        const rawDamage = dmg;
        const playerHpBefore = c.hp;
        dmg = reduceIncomingDamage(c, dmg, { spell: true, dragon: true, logQueue, state });
        c.hp = Math.max(0, c.hp - dmg);
        recordReceivedDamage(state, c, "いにしえの竜", rawDamage, dmg, playerHpBefore, { attackType: "spell", isDefending, measurement });
        const recovered = clearCharIncapacitationOnDamage(c);
        logQueue.push({
          msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。${isDefending ? "(軽減)" : ""}${recovered ? `${c.name}は状態異常から回復した！` : ""}`,
          presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
        });
        if (c.hp === 0) {
          c.status = "dead";
          const deathLog = recordCharDeath(state, c, "いにしえの竜のマダルト", { type: "combat", source: "いにしえの竜" });
          queueCharDeathLog(logQueue, deathLog);
        }
      }
    });
    return true;
  }

  return false;
}

function resolveB5MilestoneBossAction(mon, state, logQueue) {
  const rule = getMilestoneBossRule(
    state.floor,
    mon.name,
    { isBoss: state.combatState?.isBoss }
  );
  if (!rule) return false;

  if (
    !mon.b5GuardBroken &&
    mon.lahalitoQueued &&
    shouldBreakMilestoneBossGuard(mon, rule)
  ) {
    mon.lahalitoQueued = false;
    mon.b5GuardBroken = true;
    mon.b5ExposureTurns = rule.exposureTurns;
    logQueue.push({
      msg: `[敵] ${mon.name}の詠唱が崩れ、装甲が砕けた！攻撃の隙が生まれている！`,
      sound: "hit",
      shake: 15
    });
    return true;
  }

  if (mon.b5GuardBroken && (mon.b5ExposureTurns || 0) > 0) {
    mon.b5ExposureTurns -= 1;
    logQueue.push({ msg: `[敵] ${mon.name}は砕けた装甲を立て直せず、攻撃できない！` });
    return true;
  }

  return false;
}

/**
 * Executes a scoped milestone action or a boss custom action.
 * Returns true if a custom action was executed, false otherwise.
 */
export function resolveBossAction(mon, state, combatSelection, monsters, logQueue, options = {}) {
  const rng = options.rng || Math.random;
  const measurement = options.measurement || null;
  const recordAction = (monster, action) => recordMonsterAction(monster, action, state, measurement);
  const recordCondition = (monster, condition) => recordMonsterCondition(monster, condition, state, measurement);
  if (resolveB5MilestoneBossAction(mon, state, logQueue)) return true;

  // フラック独自のギミック行動
  if (mon.name === "フラック") {
    const isSilenced = mon.silenceTurns > 0;
    if (isSilenced) {
      mon.lahalitoQueued = false;
    }

    if (!isSilenced && mon.lahalitoQueued) {
      recordAction(mon, "LAHALITO");
      mon.lahalitoQueued = false;
      logQueue.push({
        msg: `[ 敵 ] フラックは激しい炎の息（ラハリト）を吹き出した！`,
        sound: "cast_spell",
        shake: 15,
        flash: true
      });
      state.party.forEach((c, charIdx) => {
        if (c.status !== "dead") {
          const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
          let dmg = Math.floor(rng() * 16) + 10; // 10-25 DMG
          dmg = resolveGuardMitigation(c, dmg, {
            isDefending,
            attackType: "spell",
            telemetry: state.combatFormulaTelemetry
          });
          const rawDamage = dmg;
          const playerHpBefore = c.hp;
          dmg = reduceIncomingDamage(c, dmg, { spell: true, logQueue, state });
          c.hp = Math.max(0, c.hp - dmg);
          recordReceivedDamage(state, c, "フラック", rawDamage, dmg, playerHpBefore, { attackType: "spell", isDefending, measurement });
          const recovered = clearCharIncapacitationOnDamage(c);
          logQueue.push({
            msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(軽減)" : ""}${recovered ? `${c.name}は状態異常から回復した！` : ""}`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
          });
          if (c.hp === 0) {
            c.status = "dead";
            const deathLog = recordCharDeath(state, c, "フラックのラハリト", { type: "combat", source: "フラック" });
            queueCharDeathLog(logQueue, deathLog);
          }
        }
      });
      return true;
    }

    const hpPct = mon.hp / mon.maxHp;
    const r = rng();
    let action = (() => {
      if (hpPct <= 0.25) {
        if (r < 0.10) return "flee";
        if (r < 0.20) return "suicide";
        if (r < 0.60) return "lahalito";
        if (r < 0.90) return "attack";
        return "gaze";
      }
      if (hpPct <= 0.50) {
        if (r < 0.40) return "lahalito";
        if (r < 0.90) return "attack";
        return "gaze";
      }
      if (r < 0.70) return "attack";
      if (r < 0.90) return "lahalito";
      return "gaze";
    })();

    if (isSilenced && action === "lahalito") {
      action = "attack";
    }

    if (action === "flee") {
      recordAction(mon, "逃走");
      mon.hp = 0;
      mon.fled = true;
      logQueue.push({
        msg: `[ 敵 ] [!] フラックは煙に巻いて逃げ出した！`,
        sound: "miss"
      });
      return true;
    } else if (action === "suicide") {
      recordAction(mon, "自爆");
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
          let dmg = Math.floor(rng() * 16) + 15; // 15-30 DMG
          dmg = resolveGuardMitigation(c, dmg, {
            isDefending,
            attackType: "spell",
            telemetry: state.combatFormulaTelemetry
          });
          const rawDamage = dmg;
          const playerHpBefore = c.hp;
          dmg = reduceIncomingDamage(c, dmg, { spell: true, logQueue, state });
          c.hp = Math.max(0, c.hp - dmg);
          recordReceivedDamage(state, c, "フラック", rawDamage, dmg, playerHpBefore, { attackType: "spell", isDefending, measurement });
          const recovered = clearCharIncapacitationOnDamage(c);
          logQueue.push({
            msg: `[ 敵 ] ${c.name}は${dmg}の自爆ダメージを受けた。${recovered ? `${c.name}は状態異常から回復した！` : ""}`,
            presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
          });
          if (c.hp === 0) {
            c.status = "dead";
            const deathLog = recordCharDeath(state, c, "フラックの自爆", { type: "combat", source: "フラック" });
            queueCharDeathLog(logQueue, deathLog);
          }
        }
      });
      return true;
    } else if (action === "lahalito") {
      mon.lahalitoQueued = true;
      logQueue.push({
        msg: `[警告] フラックの周囲に炎が渦巻く！次のターン、ラハリトの予兆！`,
        sound: "cast_spell"
      });
      return true;
    } else if (action === "gaze") {
      const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok");
      if (livingChars.length > 0) {
        recordAction(mon, "呪いの眼光");
        const targetChar = livingChars[Math.floor(rng() * livingChars.length)];
        const target = targetChar.c;
        const isDefending = combatSelection.actions.some(a => a.actorIdx === targetChar.i && a.type === "defend");
        
        logQueue.push({
          msg: `[ 敵 ] フラックは${target.name}を呪わしき眼光で見つめた！`,
          sound: "cast_spell"
        });

        const guardedChance = resolveGuardStatusChance(
          target,
          getStatusEffectChance(target, 1, { telemetry: state.combatFormulaTelemetry }),
          { isDefending, telemetry: state.combatFormulaTelemetry }
        );
        if (rng() >= guardedChance) {
          logQueue.push({ msg: isDefending
            ? `[ 敵 ] しかし、${target.name}は身を守り呪いを防いだ！`
            : `[ 敵 ] ${target.name}は不屈の意志で呪いを退けた！` });
        } else {
          const gazeRoll = rng();
          if (gazeRoll < 0.50) {
            applyStatusEffect(target, STATUS_EFFECT_IDS.BLIND, { source: "boss_gaze" });
            recordCondition(mon, "盲目を受けた");
            logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は盲目になった！` });
          } else {
            applyStatusEffect(target, STATUS_EFFECT_IDS.PARALYZED, { source: "boss_gaze" });
            recordCondition(mon, "麻痺を受けた");
            logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は麻痺した！` });
          }
        }
      }
      return true;
    }
  }

  // いにしえの竜独自のギミック行動
  if (mon.name === ANCIENT_DRAGON_NAME) {
    ensureAncientDragonCycleStep(mon);
    const isSilenced = mon.silenceTurns > 0;
    if (isSilenced) {
      mon.tiltowaitQueued = false;
      mon.madaltoQueued = false;
    }

    if (resolveQueuedAncientDragonAction(mon, state, combatSelection, logQueue, { rng, measurement })) return true;

    const currentStep = getAncientDragonCycleStep(mon);
    let action = "attack";
    if (currentStep === 1) {
      action = rng() < 0.5 ? "breath" : "madalto";
    } else if (currentStep === 2) {
      action = "tiltowait_queue";
    }

    if (isSilenced) {
      if (action === "madalto") {
        action = "breath";
      } else if (action === "tiltowait_queue") {
        action = "attack";
      }
    }

    if (action === "tiltowait_queue") {
      mon.tiltowaitQueued = true;
      logQueue.push({
        msg: `[警告] いにしえの竜の角に極大の魔力集まっている…！次のターン、ティルトウェイトの予兆！身を守れ！`,
        sound: "cast_spell",
        flash: true
      });
      return true;
    } else if (action === "breath") {
      mon.dragonBreathQueued = true;
      logQueue.push({
        msg: `[警告] いにしえの竜の顎から黒煙が立ち上る！次のターン、炎の息の予兆！身を守れ！`,
        sound: "cast_spell"
      });
      return true;
    } else if (action === "madalto") {
      mon.madaltoQueued = true;
      logQueue.push({
        msg: `[警告] いにしえの竜の周囲に冷気が渦巻く！次のターン、マダルトの予兆！身を守れ！`,
        sound: "cast_spell"
      });
      return true;
    }
  }

  return false;
}
