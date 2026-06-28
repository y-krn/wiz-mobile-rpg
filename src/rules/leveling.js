export function rollInclusive(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pickClassGrowthStat(className, rng = Math.random) {
  const growthStats = {
    Fighter: ["str", "vit"],
    Thief: ["agi", "luk"],
    Priest: ["pie", "vit"],
    Mage: ["int", "luk"],
    Samurai: ["str", "int"],
    Bishop: ["int", "pie"],
    Ranger: ["agi", "pie"],
    Ninja: ["agi", "luk"]
  }[className] || ["vit"];
  return growthStats[Math.floor(rng() * growthStats.length)];
}
