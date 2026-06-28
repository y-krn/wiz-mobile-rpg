export function determineMonsterDrop(monster, floor, rng = Math.random) {
  const name = monster.name.replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  const isRare = monster.isRare || false;
  const isBoss = monster.isBoss || false;
  const isPoisonous = monster.isPoisonous || false;

  let main = "";
  let sub = "";
  
  if (tags.includes("dragon") || spriteType === "dragon") {
    main = "竜鱗";
    sub = "獣の牙";
  } else if (tags.includes("demon") || spriteType === "flack") {
    main = "黒角";
    sub = "魔石片";
  } else if (name.includes("鎧") || name.includes("石") || name.includes("アイアン") || name.includes("ストーン") || name.includes("ゴーレム")) {
    main = "鉄片";
    sub = "魔石片";
  } else if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女")) {
    main = "魔石片";
    sub = "呪布";
  } else if (tags.includes("spirit") || spriteType === "spirit" || spriteType === "wisp") {
    main = "霊粉";
    sub = "魔石片";
  } else if (tags.includes("undead") || spriteType === "skeleton" || spriteType === "zombie") {
    main = "骨片";
    sub = "霊粉";
  } else if (isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒")) {
    main = "毒腺";
    sub = "硬い皮";
  } else {
    main = "獣の牙";
    sub = "硬い皮";
  }

  const drops = {};
  
  let dropChance = 0.45;
  if (isRare) dropChance = 0.85;
  if (isBoss) dropChance = 1.0;

  if (rng() < dropChance) {
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
