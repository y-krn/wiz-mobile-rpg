import assert from "node:assert/strict";
import {
  STATUS_TREATMENT_ROLES,
  STATUS_TREATMENT_ROLE_LIST,
  STATUS_TREATMENT_ITEM_ROLE
} from "../../../src/data/status_treatments.js";

assert.equal(STATUS_TREATMENT_ROLE_LIST.length, 3);
assert.deepEqual(
  STATUS_TREATMENT_ROLES.PERSISTENT_HAZARD.statusIds,
  ["poisoned"]
);
assert.deepEqual(
  STATUS_TREATMENT_ROLES.BROAD_CLEANSE.statusIds,
  ["poisoned", "blind", "paralyzed", "sleep"]
);
assert.equal(STATUS_TREATMENT_ITEM_ROLE.ANTIDOTE, "persistent_hazard");
assert.equal(STATUS_TREATMENT_ITEM_ROLE.HOLY_WATER, "persistent_hazard");
assert.equal(STATUS_TREATMENT_ITEM_ROLE.PANACEA, "broad_cleanse");
assert.equal(STATUS_TREATMENT_ITEM_ROLE.ELIXIR, "broad_cleanse");
assert.equal(STATUS_TREATMENT_ITEM_ROLE.WAKE_POWDER, "targeted_fallback");

const catalogItems = new Set(Object.keys(STATUS_TREATMENT_ITEM_ROLE));
assert.deepEqual(
  [...catalogItems].sort(),
  ["ANTIDOTE", "ELIXIR", "EYE_DROPS", "HOLY_WATER", "PANACEA", "PARALYZE_CURE", "WAKE_POWDER"]
);

console.log("[PASS] status treatment roles catalog");
