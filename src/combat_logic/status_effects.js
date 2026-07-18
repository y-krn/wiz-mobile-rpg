export function getBuffTotal(mon, type) {
  return (mon.buffs || []).reduce((sum, buff) => {
    return buff.type === type ? sum + buff.value : sum;
  }, 0);
}

export function addMonsterBuff(mon, type, value, turns) {
  if (!mon.buffs) mon.buffs = [];
  mon.buffs.push({ type, value, turns });
}

export function tickMonsterBuffs(monsters) {
  monsters.forEach(mon => {
    if (mon.silenceTurns) mon.silenceTurns = Math.max(0, mon.silenceTurns - 1);
    if (mon.status === "sleep") {
      mon.sleepTurns = Math.max(0, (mon.sleepTurns ?? 1) - 1);
      if (mon.sleepTurns === 0) {
        delete mon.status;
        delete mon.sleepTurns;
      }
    } else if (mon.sleepTurns) {
      delete mon.sleepTurns;
    }
    if (!mon.buffs) return;
    mon.buffs = mon.buffs
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);
  });
}

export function wakeSleepingMonsterOnDamage(mon, rng = Math.random) {
  if (mon.status !== "sleep" || mon.hp <= 0) return false;
  if (rng() >= 0.5) return false;
  delete mon.status;
  delete mon.sleepTurns;
  return true;
}

export function clearCharIncapacitationOnDamage(char) {
  if (!["sleep", "paralyze", "paralyzed"].includes(char.status) || char.hp <= 0) return false;
  char.status = "ok";
  delete char.sleepTurns;
  delete char.paralyzeTurns;
  return true;
}

export const wakeSleepingCharOnDamage = clearCharIncapacitationOnDamage;

export function consumeCharIncapacitation(char, logQueue = []) {
  if (!["sleep", "paralyze", "paralyzed"].includes(char.status) || char.hp <= 0) return false;
  const wasSleep = char.status === "sleep";
  char.status = "ok";
  delete char.sleepTurns;
  delete char.paralyzeTurns;
  logQueue.push({
    msg: wasSleep
      ? `[味方] ${char.name}は眠りから目を覚ました！`
      : `[味方] ${char.name}は麻痺から回復した！`,
    sound: "heal"
  });
  return true;
}

export function addCharBuff(char, type, value, turns) {
  if (!char.buffs) char.buffs = [];
  char.buffs.push({ type, value, turns });
}

export function tickCharBuffs(party) {
  party.forEach(char => {
    if (!char.buffs) return;
    char.buffs = char.buffs
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);
  });
}
