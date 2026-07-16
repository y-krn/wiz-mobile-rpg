export function getMonsterMainMaterial(monster) {
  const name = monster.name.replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  const isPoisonous = monster.isPoisonous || false;

  if (tags.includes("dragon") || spriteType === "dragon") {
    return "竜鱗";
  } else if (tags.includes("demon") || spriteType === "flack") {
    return "黒角";
  } else if (name.includes("鎧") || name.includes("石") || name.includes("アイアン") || name.includes("ストーン") || name.includes("ゴーレム")) {
    return "鉄片";
  } else if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女")) {
    return "魔石片";
  } else if (tags.includes("spirit") || spriteType === "spirit" || spriteType === "wisp") {
    return "霊粉";
  } else if (tags.includes("undead") || spriteType === "skeleton" || spriteType === "zombie") {
    return "骨片";
  } else if (isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒")) {
    return "毒腺";
  } else {
    return "獣の牙";
  }
}

export function determineMonsterDrop(monster, floor, rng = Math.random, { chanceBonus = 0, guaranteed = false } = {}) {
  const name = monster.name.replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  const isRare = monster.isRare || false;
  const isBoss = monster.isBoss || false;
  const isPoisonous = monster.isPoisonous || false;

  const main = getMonsterMainMaterial(monster);
  let sub;
  
  if (name === "メタルパピー") {
    const rareMat = floor >= 4 ? "竜鱗" : "黒角";
    return {
      "獣の牙": 2,
      "硬い皮": 1,
      [rareMat]: 1
    };
  }
  
  if (tags.includes("dragon") || spriteType === "dragon") {
    sub = "獣の牙";
  } else if (tags.includes("demon") || spriteType === "flack") {
    sub = "魔石片";
  } else if (name.includes("鎧") || name.includes("石") || name.includes("アイアン") || name.includes("ストーン") || name.includes("ゴーレム")) {
    sub = "魔石片";
  } else if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女")) {
    sub = "呪布";
  } else if (tags.includes("spirit") || spriteType === "spirit" || spriteType === "wisp") {
    sub = "魔石片";
  } else if (tags.includes("undead") || spriteType === "skeleton" || spriteType === "zombie") {
    sub = "霊粉";
  } else if (isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒")) {
    sub = "硬い皮";
  } else {
    sub = "硬い皮";
  }

  const drops = {};
  
  let dropChance = 0.45;
  if (isRare) dropChance = 0.85;
  if (isBoss) dropChance = 1.0;

  if (guaranteed || rng() < Math.min(1, dropChance + chanceBonus)) {
    const qty = (isBoss ? 2 : 1) + (isRare ? 1 : 0);
    drops[main] = qty;
    
    if (sub && (isBoss || isRare || rng() < 0.25)) {
      drops[sub] = 1;
    }
  }

  if (isBoss || isRare) {
    const rareMat = floor >= 4 ? "竜鱗" : "黒角";
    drops[rareMat] = (drops[rareMat] || 0) + (isBoss ? 2 : 1);
  }

  return drops;
}
