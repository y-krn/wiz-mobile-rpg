import assert from "node:assert/strict";
import { getItemData, getCharAffixSum } from "../../../src/rules/item_rules.js";
import { getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import { ITEM_EFFECTS } from "../../../src/systems/item_effects.js";
import {
  KNOWLEDGE_STAGES,
  getKnowledgeHintTags,
  getKnowledgeStage,
  getKnowledgeStageLabel,
  setKnowledgeStage
} from "../../../src/rules/identification_rules.js";
import {
  identifyEquipment,
  observeCarriedEquipment,
  observeEquipment,
  revealEquipmentOnEquip
} from "../../../src/systems/identification.js";
import { generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";

const item = generateRandomEquipment(3, {
  forceRarity: "rare",
  rng: (() => {
    let value = 7;
    return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000);
  })()
});

assert.equal(getKnowledgeStage(item), KNOWLEDGE_STAGES.DISCOVERY);
assert.equal(getKnowledgeStageLabel(item), "発見");
assert.ok(getKnowledgeHintTags(item).every(tag => item.tags.includes(tag)));
assert.match(getItemData(item).desc, /兆候:/);
assert.match(getItemData(item).desc, /付与効果は不明/);

const observation = observeEquipment(item);
assert.equal(observation.changed, true);
assert.equal(getKnowledgeStage(item), KNOWLEDGE_STAGES.OBSERVATION);
assert.equal(item.observationCount, 1);
assert.ok(getKnowledgeHintTags(item).every(tag => item.tags.includes(tag)));
assert.match(getItemData(item).desc, /観察:/);

const stateLike = { inventory: [item], party: [] };
assert.equal(observeCarriedEquipment(stateLike), 0, "already observed loot should not retrigger");
const beforeAtk = getCharWeaponAtk({
  str: 15,
  class: "Fighter",
  level: 1,
  equipment: { weapon: item, shield: null, armor: null, accessory: null }
});
assert.equal(
  beforeAtk,
  getItemData({ ...item, identified: true }).atk,
  "hidden affixes remain active while equipped"
);

revealEquipmentOnEquip(item);
assert.equal(getKnowledgeStage(item), KNOWLEDGE_STAGES.TRIAL);
assert.equal(item.trialCount, 1);
assert.match(getItemData(item).desc, /試用:/);
assert.ok(getItemData(item).primaryEffect, "trial exposes a main effect without exposing all affixes");
assert.doesNotMatch(getItemData(item).primaryEffect, /\d/, "trial keeps exact hidden values undisclosed");
assert.deepEqual(getItemData(item).affixes, []);

const holder = { identifyTickets: 1 };
assert.equal(identifyEquipment(holder, item).ok, true);
assert.equal(getKnowledgeStage(item), KNOWLEDGE_STAGES.FULL);
assert.equal(item.identified, true);
assert.equal(item.halfIdentified, true);
assert.ok(item.affixes.length > 0);

const cursedItem = {
  kind: "equipment",
  baseId: "SHORT_SWORD",
  identified: false,
  curseEffectId: "curse_blood_thirst",
  cursePower: 1,
  tags: ["blade", "curse"],
  affixes: []
};
const waterTarget = {
  name: "Tester",
  hp: 1,
  maxHp: 20,
  status: "ok",
  equipment: { weapon: cursedItem }
};
ITEM_EFFECTS.HOLY_WATER({ char: waterTarget });
assert.equal(cursedItem.curseEffectId, "curse_blood_thirst", "Holy Water must not universally remove curses");
assert.ok(getCharWeaponAtk(waterTarget) > 9, "representative curse grants its strong power while equipped");
assert.equal(getCharAffixSum(waterTarget, "devotion"), -20, "representative curse keeps its binding constraint");

const legacyUnknown = {
  kind: "equipment",
  baseId: "SHORT_SWORD",
  identified: false,
  affixes: [{ type: "atk", value: 4 }],
  tags: ["blade"],
  hintTags: ["blade"]
};
const normalized = normalizeSavePayload({
  version: SAVE_VERSION,
  party: [],
  inventory: [legacyUnknown],
  storage: [],
  activeMerchantStock: [],
  codex: { equipment: {}, monsters: {}, events: {}, stats: {} }
});
assert.equal(normalized.inventory[0].knowledgeStage, KNOWLEDGE_STAGES.DISCOVERY);
assert.deepEqual(normalized.inventory[0].observedHintTags, ["blade"]);

console.log("[PASS] identification knowledge stages, trial disclosure, and save backfill");
