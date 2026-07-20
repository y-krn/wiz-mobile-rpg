import assert from "node:assert/strict";
import {
  describeMonsterTraits,
  MONSTERS,
  MONSTER_TRAIT_LABELS
} from "../src/data/monsters.js";

function run() {
  const flashBat = MONSTERS.find(monster => monster.name === "フラッシュバット");
  assert.ok(flashBat, "フラッシュバット must exist.");
  assert.ok(describeMonsterTraits(flashBat).includes("盲目を付与"));
  assert.ok(describeMonsterTraits(flashBat).includes("妨害役"));

  const demonGuard = MONSTERS.find(monster => monster.name === "デーモンガード");
  assert.ok(demonGuard, "デーモンガード must exist.");
  assert.deepEqual(
    describeMonsterTraits(demonGuard).filter(label => label === "ボス" || label === "中ボス"),
    ["ボス"]
  );

  for (const monster of MONSTERS) {
    for (const trait of monster.traits || []) {
      assert.ok(
        Object.hasOwn(MONSTER_TRAIT_LABELS, trait),
        `${monster.name} has an undefined trait label: ${trait}`
      );
    }
  }

  assert.deepEqual(describeMonsterTraits({ name: "標準モンスター" }), ["標準的なモンスター"]);
  assert.deepEqual(
    describeMonsterTraits({
      name: "複合モンスター",
      statusChance: 0.5,
      isPoisonous: true,
      isParalyzing: true,
      isSleepInflicting: true,
      isBlinding: true,
      isSniper: true,
      fleeChance: 0.25,
      traits: ["buffMagicDef", "multiAction", "unknownTrait"],
      role: "amplifier",
      isBoss: true,
      isMidboss: true,
      isRare: true
    }),
    [
      "高確率で毒を付与",
      "高確率で麻痺を付与",
      "高確率で睡眠を付与",
      "高確率で盲目を付与",
      "後列を狙う",
      "逃走することがある",
      "1ターンに複数回行動",
      "味方の魔法防御を上げる",
      "支援役",
      "ボス",
      "非常に強力な強敵"
    ]
  );
}

try {
  run();
  console.log("[PASS] Monster trait descriptions and label coverage verified.");
} catch (error) {
  console.error("[FAIL] Monster trait description verification failed:", error);
  process.exit(1);
}
