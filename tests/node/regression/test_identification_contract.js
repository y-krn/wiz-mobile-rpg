import assert from "node:assert/strict";
import * as identificationFacade from "../../../src/systems/identification.js";
import * as identificationOwner from "../../../src/systems/identification.ts";
import { identifyLegacyInput } from "../fixtures/typescript/identification_legacy_input.ts";

for (const exportName of [
  "identifyEquipment",
  "observeEquipment",
  "observeCarriedEquipment",
  "revealEquipmentOnEquip",
  "purifyEquipmentCurse"
]) {
  assert.strictEqual(
    identificationFacade[exportName],
    identificationOwner[exportName],
    `identification facade preserves ${exportName} identity`
  );
}

const identified = identifyLegacyInput();
assert.deepEqual(identified, { ok: true, cursed: false });

const invalidInputs = [null, undefined, "legacy-item", 0];
for (const input of invalidInputs) {
  assert.deepEqual(
    identificationFacade.observeEquipment(input),
    { changed: false, stage: "full" },
    "invalid item remains fail-closed"
  );
  assert.deepEqual(
    identificationFacade.revealEquipmentOnEquip(input),
    { revealed: false, cursed: false },
    "invalid item does not reveal"
  );
}

const legacyArray = [];
assert.deepEqual(identificationFacade.observeEquipment(legacyArray), {
  changed: true,
  stage: "observation",
  hintTag: null
});
assert.equal(legacyArray.observationCount, 1, "legacy array input keeps object semantics");

const legacyArrayTrial = [];
assert.deepEqual(identificationFacade.revealEquipmentOnEquip(legacyArrayTrial), {
  revealed: false,
  cursed: false
});
assert.equal(legacyArrayTrial.trialCount, 1, "legacy array trial semantics remain unchanged");

const legacyArrayIdentification = [];
assert.deepEqual(
  identificationFacade.identifyEquipment({ identifyTickets: 1 }, legacyArrayIdentification),
  { ok: true, cursed: false }
);

let rngCalls = 0;
const noPowder = { identifyTickets: 0 };
assert.deepEqual(
  identificationFacade.identifyEquipment(noPowder, { identified: false }, null, () => {
    rngCalls++;
    return 0;
  }),
  { ok: false, reason: "insufficient_powder" }
);
assert.equal(rngCalls, 0, "powder check precedes discount RNG");

const observed = {
  identified: false,
  tags: ["blade", "curse"],
  hintTags: ["blade"],
  observationCount: 0
};
assert.deepEqual(identificationFacade.observeEquipment(observed), {
  changed: true,
  stage: "observation",
  hintTag: "curse"
});
assert.equal(observed.observationCount, 1);
assert.deepEqual(observed.observedHintTags, ["blade", "curse"]);
assert.deepEqual(identificationFacade.observeEquipment(observed), {
  changed: false,
  stage: "observation"
});
assert.deepEqual(identificationFacade.observeEquipment({ identified: true, tags: ["blade"] }), {
  changed: false,
  stage: "full"
});
const trial = { identified: false, knowledgeStage: "trial", trialCount: 2 };
assert.deepEqual(identificationFacade.revealEquipmentOnEquip(trial), {
  revealed: false,
  cursed: false
});
assert.equal(trial.trialCount, 2);

const carriedInventory = { identified: false, tags: ["blade"] };
const carriedParty = { equipment: { weapon: { identified: false, tags: ["curse"] } } };
assert.equal(
  identificationFacade.observeCarriedEquipment({ inventory: [carriedInventory], party: [carriedParty] }),
  2
);

const cursed = {
  identified: false,
  tags: ["blade", "curse"],
  curseEffectId: "curse_hollow_soul",
  curseLocked: false
};
assert.deepEqual(identificationFacade.revealEquipmentOnEquip(cursed), {
  revealed: false,
  cursed: true
});
assert.deepEqual(identificationFacade.purifyEquipmentCurse(cursed), { ok: true });
assert.deepEqual(cursed.tags, ["blade"]);
assert.deepEqual(identificationFacade.purifyEquipmentCurse({ tags: ["blade"] }), {
  ok: false,
  reason: "not_cursed"
});

console.log("[PASS] identification facade identity, legacy input, and boundary regression");
