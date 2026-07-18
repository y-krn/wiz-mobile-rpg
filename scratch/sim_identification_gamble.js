import { generateRandomEquipment } from "../src/systems/equipment_generation.js";

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const samples = 20000;
const rarityScore = { magic: 1, rare: 2, epic: 3 };
const rows = [1, 3, 5, 10, 15].map(floor => {
  const rng = lcg(150000 + floor);
  let cursed = 0;
  let rarityTotal = 0;
  let supportValueTotal = 0;
  let cursePowerTotal = 0;
  for (let i = 0; i < samples; i++) {
    const item = generateRandomEquipment(floor, { rng, allowCores: false });
    cursed += item.curseEffectId ? 1 : 0;
    rarityTotal += rarityScore[item.rarity];
    supportValueTotal += item.affixes.reduce(
      (sum, affix) => sum + (affix.kind === "support" ? affix.value : 0),
      0
    );
    cursePowerTotal += item.cursePower;
  }
  return {
    floor,
    curseRate: `${(cursed / samples * 100).toFixed(2)}%`,
    avgRarityScore: (rarityTotal / samples).toFixed(3),
    avgSupportValue: (supportValueTotal / samples).toFixed(2),
    cursePower: (cursePowerTotal / samples).toFixed(2)
  };
});

console.table(rows);
