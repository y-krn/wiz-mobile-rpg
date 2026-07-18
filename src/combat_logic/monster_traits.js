export function hasTrait(mon, trait) {
  return mon.traits?.includes(trait);
}

export function processMonsterDefeat(monsters, mon, logQueue) {
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
      row: "front",
      hasSplit: true,
      deathProcessed: false,
      fled: false
    });
  }
  logQueue.push({ msg: `[ 敵 ] ${mon.name}は崩れ落ち、${count}体に分裂した！` });
}
