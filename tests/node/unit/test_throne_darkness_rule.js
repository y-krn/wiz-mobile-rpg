// The abyssal throne's rule (#2063): the adventurer may put out their own
// light. In the dark monsters notice later, chests are better, and what is
// beside the adventurer goes unnoticed; a light spell lights it again.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import {
  applyDarknessToEncounterChance,
  getDarknessChestRarityBonus,
  getDarknessDetectionFactor,
  getDungeonDarkRule,
  isDark,
  toggleDarkness
} from "../../../src/systems/darkness.js";
import { calculateEncounterChance } from "../../../src/movement.js";
import { rollChestEncounter } from "../../../src/chest/chest_domain.ts";

const throne = DUNGEONS.find(dungeon => dungeon.id === "abyssal_throne");
const floor = getDungeonEntryFloor(throne.index) + 1;
const rule = getDungeonDarkRule(floor);
assert.equal(throne.built, true);
assert.equal(getDungeonRule(floor)?.id, "darkness");
assert.match(rule.line, /^闇：/);
assert.equal(getDungeonDarkRule(3), null);

// Only the throne lets the light go out, and a light spell lights it again.
{
  const mine = { floor: 3, darkness: false };
  assert.equal(toggleDarkness(mine), null);
  assert.equal(isDark(mine), false);
  const state = { floor, darkness: false, lightTurns: 5, lightPower: "milwa" };
  assert.equal(toggleDarkness(state), true);
  assert.deepEqual([state.lightTurns, state.lightPower, isDark(state)], [0, "", true]);
  state.lightTurns = 3;
  assert.equal(isDark(state), false, "a light spell lights the dark");
  state.lightTurns = 0;
  assert.equal(toggleDarkness(state), false);
  assert.equal(isDark(state), false);
}

// In the dark, monsters notice later and chests are better.
{
  const dark = { floor, darkness: true, lightTurns: 0 };
  const lit = { floor, darkness: false, lightTurns: 0 };
  assert.equal(applyDarknessToEncounterChance(0.04, dark), 0.04 * rule.encounterFactor);
  assert.equal(applyDarknessToEncounterChance(0.04, lit), 0.04);
  assert.equal(calculateEncounterChance(40, dark), calculateEncounterChance(40, lit) * rule.encounterFactor);
  assert.equal(getDarknessDetectionFactor(dark), rule.detectionFactor);
  assert.equal(getDarknessDetectionFactor(lit), 1);
  assert.equal(getDarknessChestRarityBonus(dark), rule.chestRarityBonus);
  assert.equal(getDarknessChestRarityBonus(lit), 0);
}

// A chest opened in the dark never holds a lowest-grade random piece.
{
  const rank = { magic: 0, rare: 1, epic: 2 };
  const grades = bonus => {
    const out = [];
    for (let index = 0; index < 300; index++) {
      const chest = rollChestEncounter({
        floor, x: index % 20, y: Math.floor(index / 20), seed: "DARK-CHEST", rarityBonus: bonus,
        firstChestGuaranteed: true, currentRun: { b1ChestsOpened: 5, b1EquipFound: 1 }
      });
      if (chest.item?.kind === "equipment") out.push(rank[chest.item.rarity]);
    }
    return out;
  };
  const inDark = grades(rule.chestRarityBonus);
  const inLight = grades(0);
  assert.ok(inDark.length > 0 && inLight.some(grade => grade === 0));
  assert.ok(inDark.every(grade => grade >= 1), "dark chests hold rare or better");
}

console.log("[PASS] the throne's dark: fewer monsters, better chests, a light spell lights it");
