import { reduceIncomingDamage } from "./damage.js";

/**
 * Executes a boss custom action for Flack or Old Dragon.
 * Returns true if a custom action was executed, false otherwise.
 */
export function resolveBossAction(mon, state, combatSelection, monsters, logQueue) {
  // フラック独自のギミック行動
  if (mon.name === "フラック") {
    const isSilenced = mon.silenceTurns > 0;
    if (isSilenced) {
      mon.lahalitoQueued = false;
    }

    if (!isSilenced && mon.lahalitoQueued) {
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
          let dmg = Math.floor(Math.random() * 16) + 10; // 10-25 DMG
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          dmg = reduceIncomingDamage(c, dmg, { spell: true, logQueue });
          c.hp = Math.max(0, c.hp - dmg);
          if (c.hp === 0) c.status = "dead";
          logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。${isDefending ? "(半減)" : ""}` });
        }
      });
      return true;
    }

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

    if (isSilenced && action === "lahalito") {
      action = "attack";
    }

    if (action === "flee") {
      mon.hp = 0;
      mon.fled = true;
      logQueue.push({
        msg: `[ 敵 ] [!] フラックは煙に巻いて逃げ出した！`,
        sound: "miss"
      });
      return true;
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
      return true;
    }
  }

  // いにしえの竜独自のギミック行動
  if (mon.name === "いにしえの竜") {
    const isSilenced = mon.silenceTurns > 0;
    if (isSilenced) {
      mon.tiltowaitQueued = false;
    }

    if (mon.tiltowaitQueued) {
      mon.tiltowaitQueued = false;
      if (isSilenced) {
        logQueue.push({ msg: `[ 敵 ] いにしえの竜はティルトウェイトを唱えようとしたが、沈黙している！` });
        mon.turnCount = (mon.turnCount || 0) + 1;
        return true;
      }
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
      return true;
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
      return true;
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
      return true;
    }
  }

  return false;
}
