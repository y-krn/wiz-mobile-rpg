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

export function wakeSleepingCharOnDamage(char, rng = Math.random) {
  if (char.status !== "sleep" || char.hp <= 0) return false;
  if (rng() >= 0.5) return false;
  char.status = "ok";
  delete char.sleepTurns;
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

export function tickCharSleep(party, logQueue = []) {
  party.forEach(char => {
    if (char.status === "sleep" && char.hp > 0) {
      char.sleepTurns = Math.max(0, (char.sleepTurns ?? 1) - 1);
      if (char.sleepTurns === 0) {
        char.status = "ok";
        delete char.sleepTurns;
        logQueue.push({
          msg: `[味方] ${char.name}は目を覚ました！`,
          sound: "heal"
        });
      }
    } else if (char.sleepTurns) {
      delete char.sleepTurns;
    }
  });
}
