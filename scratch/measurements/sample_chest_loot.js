/* global console */
import { rollChestReward, rollChestAccessory, rollChestTrap } from "../../src/rules/chest_rules.js";
import { createStartingKitCharacter } from "../../src/state/initial_state.js";
const N = 2000;
for (let floor = 1; floor <= 5; floor++) {
  const stats = { none: 0, consumable: 0, rune: 0, equip: 0, core: 0, curse: 0, bases: {}, supports: {}, cores: {}, rarity: {}, acc: 0, accCore: 0 };
  for (let i = 0; i < N; i++) {
    const party = [createStartingKitCharacter("vanguard")];
    const run = { trialProfile: "phase3-equipment", equipmentFound: [{}], chestsOpened: 5, b1ChestsOpened: 5, b1EquipFound: 1 };
    const trap = rollChestTrap(floor, Math.random);
    const { item } = rollChestReward({ floor, rng: Math.random, party, currentRun: run, trap, firstChestGuaranteed: true });
    if (!item) stats.none++;
    else if (typeof item === "string") { if (/RUNE/.test(item)) stats.rune++; else stats.consumable++; stats.bases[item] = (stats.bases[item] || 0) + 1; }
    else {
      stats.equip++; stats.bases[item.baseId] = (stats.bases[item.baseId] || 0) + 1; stats.rarity[item.rarity] = (stats.rarity[item.rarity] || 0) + 1;
      if (item.curseEffectId) stats.curse++;
      for (const a of item.affixes || []) { if (a.kind === "core") { stats.cores[a.id] = (stats.cores[a.id] || 0) + 1; } else stats.supports[a.id] = (stats.supports[a.id] || 0) + 1; }
      if ((item.affixes || []).some(a => a.kind === "core")) stats.core++;
    }
    const acc = rollChestAccessory(floor, Math.random, party, undefined, "phase3-equipment");
    if (acc && typeof acc === "object") { stats.acc++; if ((acc.affixes || []).some(a => a.kind === "core")) stats.accCore++; }
  }
  const pct = v => (100 * v / N).toFixed(1) + "%";
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${pct(v)}`).join(" ");
  console.log(`B${floor}: none ${pct(stats.none)} equip ${pct(stats.equip)} (core ${pct(stats.core)}, curse ${pct(stats.curse)}) consumable ${pct(stats.consumable)} rune ${pct(stats.rune)} | accessory ${pct(stats.acc)} (core ${pct(stats.accCore)})`);
  console.log(`  rarity ${top(stats.rarity)}`);
  console.log(`  bases ${top(stats.bases)}`);
  console.log(`  supports ${top(stats.supports)}`);
  console.log(`  cores ${top(stats.cores)}`);
}
