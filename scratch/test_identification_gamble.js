import assert from "node:assert/strict";
import { CURSE_EFFECTS, ITEMS } from "../src/data/items.js";
import { getCharAffixSum, getItemData } from "../src/rules/item_rules.js";
import {
  IDENTIFICATION_BALANCE,
  getIdentificationGambleProfile,
  isCurseLocked
} from "../src/rules/identification_rules.js";
import {
  identifyEquipment,
  removeEquipmentCurse,
  revealEquipmentOnEquip
} from "../src/systems/identification.js";
import { generateRandomEquipment } from "../src/systems/equipment_generation.js";
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

test("暫定解呪は高コストで、成功時だけ固定と負効果を除く", () => {
  const item = unknownItem({ cursed: true });
  revealEquipmentOnEquip(item);
  const poor = { identifyTickets: IDENTIFICATION_BALANCE.removeCurseCost - 1 };
  assert.deepEqual(removeEquipmentCurse(poor, item), { ok: false, reason: "insufficient_powder" });
  assert.equal(isCurseLocked(item), true);

  const holder = { identifyTickets: IDENTIFICATION_BALANCE.removeCurseCost };
  assert.deepEqual(removeEquipmentCurse(holder, item), { ok: true });
  assert.equal(holder.identifyTickets, 0);
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

if (failures > 0) {
  console.error(`${failures} identification gamble test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] identification gamble deterministic suite");
