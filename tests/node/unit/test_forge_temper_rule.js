// The dragon forge's rule (#2063): finds are few and materials many, and the
// furnace reforges what is worn. Here: the chest side of it (fewer pieces,
// more materials) against the mine's.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import { rollChestEncounter } from "../../../src/chest/chest_domain.ts";
import { generateChestMaterials } from "../../../src/chest.js";

const forge = DUNGEONS.find(dungeon => dungeon.id === "dragon_forge");
const forgeFloor = getDungeonEntryFloor(forge.index) + 2;
const mineFloor = 3;
const rule = getDungeonRule(forgeFloor);
assert.equal(forge.built, true);
assert.equal(rule?.id, "temper");
assert.match(rule.line, /^鍛える：/);

function equipmentShare(floor) {
  let pieces = 0;
  const count = 600;
  for (let index = 0; index < count; index++) {
    const chest = rollChestEncounter({
      floor, x: index % 30, y: Math.floor(index / 30), seed: "FORGE-CHEST",
      firstChestGuaranteed: true, currentRun: { b1ChestsOpened: 5, b1EquipFound: 1 }
    });
    if (chest.item?.kind === "equipment") pieces++;
  }
  return pieces / count;
}
const inForge = equipmentShare(forgeFloor);
const inMine = equipmentShare(mineFloor);
assert.ok(inForge < inMine * 0.75, `forge chests hold fewer pieces: ${inForge} vs ${inMine}`);

// A forge chest's material bundle is larger by the rule's bonus.
const bundle = (floor, bonus) => {
  let total = 0;
  for (let index = 0; index < 200; index++) {
    let a = index + 1;
    const rng = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    total += Object.values(generateChestMaterials(floor, rng, bonus)).reduce((sum, qty) => sum + qty, 0);
  }
  return total / 200;
};
assert.ok(bundle(forgeFloor, rule.chestMaterialBonus) - bundle(forgeFloor, 0) > rule.chestMaterialBonus - 0.01);

console.log("[PASS] the forge's chests hold fewer pieces and more materials");
