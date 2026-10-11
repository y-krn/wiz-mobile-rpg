// The workshop's prototypes (#2109): three Cores on plain bases, offered
// without reading the loadout, paid in early materials, used up by the run.
import { strict as assert } from "node:assert";
import {
  PROTOTYPE_COSTS, PROTOTYPE_OFFER_COUNT, canAffordPrototype, createPrototypeItem, getPrototypeOffers, payForPrototype
} from "../../../src/systems/workshop_prototype.js";
import { createDefaultWorkshopState } from "../../../src/systems/workshop.js";
import { CORE_FAMILY_IDS } from "../../../src/data/core_families.js";

const EARLY_MATERIALS = new Set(["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "呪布"]);
const save = (totalRuns, workshop = createDefaultWorkshopState(), extra = {}) => ({ seed: "PROTO", records: { totalRuns }, workshop, ...extra });

// Three offers from three different families, the same for the same save and run.
const offers = getPrototypeOffers(save(0));
assert.equal(offers.length, PROTOTYPE_OFFER_COUNT);
assert.equal(new Set(offers.map(offer => offer.familyId)).size, offers.length);
assert.deepEqual(getPrototypeOffers(save(0)), offers);
// Build-blind: the adventurer and the bag do not change the offer.
assert.deepEqual(getPrototypeOffers(save(0, undefined, { party: [{ equipment: { weapon: "CLAYMORE" } }], inventory: ["X"] })), offers);
// The next run brings a new draw at least once over a few runs.
assert.ok([1, 2, 3].some(run => JSON.stringify(getPrototypeOffers(save(run))) !== JSON.stringify(offers)));

// Every family's cost is payable with materials of the mine's first floors.
for (const familyId of CORE_FAMILY_IDS) {
  const cost = PROTOTYPE_COSTS[familyId];
  assert.ok(cost, `${familyId} has a cost`);
  assert.ok(Object.keys(cost).every(name => EARLY_MATERIALS.has(name)), `${familyId} costs early materials`);
}

// Paying takes exactly the cost; short materials refuse.
const offer = offers[0];
const rich = Object.fromEntries([...EARLY_MATERIALS].map(name => [name, 9]));
assert.equal(canAffordPrototype({}, offer), false);
assert.equal(payForPrototype({}, offer), null);
const paid = payForPrototype(rich, offer);
Object.entries(offer.cost).forEach(([name, quantity]) => assert.equal(paid[name], 9 - quantity));

// The prototype carries its Core and nothing else, identified and uncursed.
for (const run of [0, 1, 2, 3, 4]) {
  for (const candidate of getPrototypeOffers(save(run))) {
    const item = createPrototypeItem(candidate, { rng: () => 0.01 });
    assert.equal(item.baseId, candidate.baseId);
    assert.deepEqual(item.affixes.map(affix => affix.id), [candidate.coreId], `${candidate.baseId} carries only ${candidate.coreId}`);
    assert.equal(item.curseEffectId, null);
    assert.equal(item.knowledgeStage, "full");
    assert.equal(item.workshopPrototype, true);
  }
}

// A remembered Core joins the offer: the trap family has nothing to build
// until the workshop remembers its Cores, and the blood wand comes with its
// memory.
const remembered = { ranks: { pool_trap_eater: 1, pool_tomb_raider: 1, pool_blood_wand: 1 }, lateralUnlocks: [] };
const offered = workshop => {
  const seen = new Set();
  for (let run = 0; run < 60; run++) getPrototypeOffers(save(run, workshop)).forEach(candidate => seen.add(candidate.coreId));
  return seen;
};
const withMemories = offered(remembered);
const without = offered(createDefaultWorkshopState());
for (const coreId of ["CORE_TRAP_EATER", "CORE_TOMB_RAIDER", "CORE_BLOOD_WAND"]) {
  assert.ok(withMemories.has(coreId), `${coreId} is offered once remembered`);
  assert.ok(!without.has(coreId), `${coreId} is not offered before`);
}

console.log("[PASS] workshop prototypes: three build-blind Cores, early materials, Core only, memories widen the offer");
