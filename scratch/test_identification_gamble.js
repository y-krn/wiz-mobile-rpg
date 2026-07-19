import assert from "node:assert/strict";
import { CURSE_EFFECTS, ITEMS } from "../src/data/items.js";
import { getCharAffixSum, getItemData } from "../src/rules/item_rules.js";
import {
  getIdentificationGambleProfile,
  isCurseLocked
} from "../src/rules/identification_rules.js";
import {
  identifyEquipment,
  purifyEquipmentCurse,
  revealEquipmentOnEquip
} from "../src/systems/identification.js";
import {
  buildUnidentifiedMeta,
  generateRandomEquipment
} from "../src/systems/equipment_generation.js";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { state } from "../src/state/state_core.js";

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sampleSuspicion({ cursed, curseDetectChance = 1, seed, samples = 20000 }) {
  const rng = lcg(seed);
  let suspected = 0;
  for (let i = 0; i < samples; i++) {
    const meta = buildUnidentifiedMeta([], "rare", "剣", rng, {
      curseEffectId: cursed ? "curse_hollow_soul" : null,
      curseDetectChance
    });
    suspected += meta.curseSuspected ? 1 : 0;
  }
  return suspected / samples;
}

function unknownItem({ cursed = false, level = 5 } = {}) {
  return {
    kind: "equipment",
    instanceId: `test_${cursed ? "curse" : "safe"}`,
    baseId: "SHORT_SWORD",
    rarity: "rare",
    level,
    identified: false,
    halfIdentified: false,
    tags: cursed ? ["blade", "curse"] : ["blade"],
    hintTags: ["blade"],
    curseEffectId: cursed ? "curse_hollow_soul" : null,
    cursePower: getIdentificationGambleProfile(level).cursePower,
    curseSuspected: cursed,
    unidentifiedName: "ショートソード（未鑑定）",
    affixes: [{ id: "atk", type: "atk", kind: "support", value: 4 }]
  };
}

function character(equipment = {}) {
  return {
    name: "Tester",
    class: "Fighter",
    hp: 20,
    status: "ok",
    equipment: { weapon: null, shield: null, armor: null, accessory: null, ...equipment }
  };
}

test("生成時に中身を確定し、ベース名だけ表示する", () => {
  const item = generateRandomEquipment(5, { forceRarity: "rare", rng: lcg(150) });
  assert.equal(item.identified, false);
  assert.ok(item.affixes.length > 0);
  assert.ok(item.unidentifiedName.includes(ITEMS[item.baseId].name));
  const masked = getItemData(item);
  assert.deepEqual(masked.affixes, []);
  assert.match(masked.desc, /付与効果は不明/);
});

test("鑑定粉あり/なしで消費と開示を分岐する", () => {
  const noPowder = { identifyTickets: 0 };
  const blocked = unknownItem();
  assert.deepEqual(identifyEquipment(noPowder, blocked), { ok: false, reason: "insufficient_powder" });
  assert.equal(blocked.identified, false);

  const holder = { identifyTickets: 2 };
  const item = unknownItem({ cursed: true });
  assert.deepEqual(identifyEquipment(holder, item), { ok: true, cursed: true });
  assert.equal(holder.identifyTickets, 1);
  assert.equal(item.identified, true);
  assert.equal(isCurseLocked(item), true);
});

test("未鑑定装備の賭けは装備時に開示し、呪いだけ固定する", () => {
  const safe = unknownItem();
  assert.deepEqual(revealEquipmentOnEquip(safe), { revealed: true, cursed: false });
  assert.equal(isCurseLocked(safe), false);

  const cursed = unknownItem({ cursed: true, level: 10 });
  assert.deepEqual(revealEquipmentOnEquip(cursed), { revealed: true, cursed: true });
  assert.equal(cursed.curseLocked, true);
  const char = character({ weapon: cursed });
  const expectedVit = Math.round(CURSE_EFFECTS.curse_hollow_soul.mod.vit * cursed.cursePower);
  assert.equal(getCharAffixSum(char, "vit"), expectedVit);
});

test("解呪処理は支払いを担当せず、固定と負効果だけを除く", () => {
  const item = unknownItem({ cursed: true });
  revealEquipmentOnEquip(item);
  assert.deepEqual(purifyEquipmentCurse(item), { ok: true });
  assert.equal(item.curseEffectId, null);
  assert.equal(item.tags.includes("curse"), false);
  assert.equal(isCurseLocked(item), false);
});

test("save→load roundtripでマスク・確定中身・呪い固定・鑑定粉を保持する", () => {
  const masked = unknownItem({ level: 3 });
  const cursed = unknownItem({ cursed: true, level: 8 });
  revealEquipmentOnEquip(cursed);
  state.party = [character({ weapon: cursed })];
  state.inventory = [masked];
  state.identifyTickets = 2;
  state.gameState = "explore";

  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  state.party = [];
  state.inventory = [];
  state.identifyTickets = 0;
  applySavePayload(payload);

  assert.equal(state.inventory[0].identified, false);
  assert.deepEqual(state.inventory[0].affixes, masked.affixes);
  assert.equal(getItemData(state.inventory[0]).affixes.length, 0);
  assert.equal(state.party[0].equipment.weapon.identified, true);
  assert.equal(state.party[0].equipment.weapon.curseEffectId, cursed.curseEffectId);
  assert.equal(state.party[0].equipment.weapon.cursePower, cursed.cursePower);
  assert.equal(isCurseLocked(state.party[0].equipment.weapon), true);
  assert.equal(state.identifyTickets, 2);
});

test("深度プロファイルは当たり質・呪い率・呪い強度が単調増加する", () => {
  const shallow = getIdentificationGambleProfile(1);
  const deep = getIdentificationGambleProfile(10);
  assert.ok(deep.rareChance > shallow.rareChance);
  assert.ok(deep.epicChance > shallow.epicChance);
  assert.ok(deep.qualityMultiplier > shallow.qualityMultiplier);
  assert.ok(deep.curseChance > shallow.curseChance);
  assert.ok(deep.cursePower > shallow.cursePower);
});

test("呪い検知率は1階0.9から減衰し、11階以降0.4を下限とする", () => {
  assert.equal(getIdentificationGambleProfile(1).curseDetectChance, 0.9);
  assert.equal(getIdentificationGambleProfile(10).curseDetectChance, 0.45);
  assert.equal(getIdentificationGambleProfile(11).curseDetectChance, 0.4);
  assert.equal(getIdentificationGambleProfile(30).curseDetectChance, 0.4);
});

test("呪い検知率と非呪い偽陽性率が期待レンジに収まる", () => {
  const shallowRate = sampleSuspicion({
    cursed: true,
    curseDetectChance: getIdentificationGambleProfile(1).curseDetectChance,
    seed: 17901
  });
  const floorRate = sampleSuspicion({
    cursed: true,
    curseDetectChance: getIdentificationGambleProfile(11).curseDetectChance,
    seed: 17911
  });
  const falsePositiveRate = sampleSuspicion({ cursed: false, seed: 17920 });
  assert.ok(Math.abs(shallowRate - 0.9) <= 0.05, `B1 detect=${shallowRate}`);
  assert.ok(Math.abs(floorRate - 0.4) <= 0.05, `B11 detect=${floorRate}`);
  assert.ok(Math.abs(falsePositiveRate - 0.2) <= 0.05, `false positive=${falsePositiveRate}`);
});

test("疑いロールのrng消費回数は呪い有無で同じ", () => {
  let cursedCalls = 0;
  let safeCalls = 0;
  buildUnidentifiedMeta([], "rare", "剣", () => {
    cursedCalls++;
    return 0.5;
  }, { curseEffectId: "curse_hollow_soul", curseDetectChance: 0.4 });
  buildUnidentifiedMeta([], "rare", "剣", () => {
    safeCalls++;
    return 0.5;
  });
  assert.equal(cursedCalls, 1);
  assert.equal(safeCalls, 1);
});

if (failures > 0) {
  console.error(`${failures} identification gamble test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] identification gamble deterministic suite");
