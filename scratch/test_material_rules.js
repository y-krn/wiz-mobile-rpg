import assert from "assert";
import { determineMonsterDrop } from "../src/combat_logic/drops.js";
import {
  getChestMaterialPool,
  getLegacyMonsterGroupClassification,
  getMonsterGroupClassification,
  getRareMaterialForFloor
} from "../src/rules/material_rules.js";

const failures = [];

function check(name, callback) {
  try {
    callback();
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

check("explicit spirit tag beats mage sprite", () => {
  assert.deepEqual(
    getMonsterGroupClassification({
      name: "禁書の番人",
      tags: ["spirit"],
      spriteType: "mage"
    }),
    { group: "spirit", source: "tag" }
  );
});

check("spell metadata fills caster gap", () => {
  assert.deepEqual(
    getMonsterGroupClassification({
      name: "ゴブリンの呪術師",
      tags: [],
      spriteType: "kobold",
      spell: "HALITO"
    }),
    { group: "caster", source: "spell" }
  );
});

check("poison predicate beats zombie sprite", () => {
  assert.deepEqual(
    getMonsterGroupClassification({
      name: "ポイズンジャイアント",
      tags: [],
      spriteType: "zombie",
      isPoisonous: true
    }),
    { group: "poison", source: "predicate" }
  );
});

check("strong armor name fills armor gap", () => {
  assert.deepEqual(
    getMonsterGroupClassification({
      name: "鉄皮のゴブリン",
      tags: [],
      spriteType: "kobold"
    }),
    { group: "armor", source: "predicate" }
  );
});

check("classification audit exposes intended old-to-new changes", () => {
  const monster = {
    name: "禁書の番人",
    tags: ["spirit"],
    spriteType: "mage",
    spell: "LAHALITO"
  };
  assert.equal(getLegacyMonsterGroupClassification(monster).group, "caster");
  assert.equal(getMonsterGroupClassification(monster).group, "spirit");
});

check("explicit beast tag beats dragon sprite", () => {
  const monster = {
    name: "双頭の番犬",
    tags: ["beast"],
    spriteType: "dragon"
  };
  assert.equal(getLegacyMonsterGroupClassification(monster).group, "dragon");
  assert.equal(getMonsterGroupClassification(monster).group, "beast");
});

check("ambiguous kobold remains explicit fallback", () => {
  assert.deepEqual(
    getMonsterGroupClassification({
      name: "コボルトの斥候",
      tags: [],
      spriteType: "kobold"
    }),
    { group: "beast", source: "fallback" }
  );
});

check("rare material gate remains unchanged by default", () => {
  assert.equal(getRareMaterialForFloor(9), "黒角");
  assert.equal(getRareMaterialForFloor(10), "竜鱗");
  assert.equal(getRareMaterialForFloor(3, { rareMaterialFloor: 3 }), "竜鱗");
});

check("early-rare chest profile changes allocation only", () => {
  const pool = getChestMaterialPool(2, { profile: "early-rare" });
  assert.ok(pool.includes("鉄片"));
  assert.ok(pool.includes("竜鱗"));
  assert.equal(pool.length, 6);
});

check("secondary profile preserves total drop quantity", () => {
  const monster = {
    name: "狼",
    tags: ["beast"],
    spriteType: "wolf"
  };
  const baseline = determineMonsterDrop(monster, 2, () => 0, { guaranteed: true });
  const balanced = determineMonsterDrop(monster, 2, () => 0, {
    guaranteed: true,
    secondaryMaterialProfile: "magic-poison"
  });
  assert.equal(
    Object.values(baseline).reduce((sum, quantity) => sum + quantity, 0),
    Object.values(balanced).reduce((sum, quantity) => sum + quantity, 0)
  );
});

check("production defaults keep the legacy material allocation", () => {
  assert.deepEqual(getChestMaterialPool(2), ["獣の牙", "硬い皮", "毒腺", "骨片"]);
  const drops = determineMonsterDrop(
    { name: "狼", tags: ["beast"], spriteType: "wolf" },
    2,
    () => 0,
    { guaranteed: true }
  );
  assert.ok(drops["硬い皮"] >= 1);
  assert.equal(drops["魔石片"] || 0, 0);
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`[PASS] material rules: ${11 - failures.length} assertions`);
