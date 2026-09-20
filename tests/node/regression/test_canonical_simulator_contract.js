import assert from "node:assert/strict";
import {
  classifyBuildPaymentAction,
  resolveTownPortalSettlement
} from "../../../scratch/simulations/sim_depth_material_ev.js";

for (const [action, expected] of [
  [{ type: "fight" }, "attack"],
  [{ type: "spell" }, "spell"],
  [{ type: "defend" }, "guard"],
  [{ type: "item", itemKey: "GUARD_POTION" }, "item"],
  [{ type: "run" }, "flee"],
  [{ type: "unknown" }, "noop"]
]) {
  assert.equal(classifyBuildPaymentAction(action), expected);
}

for (const source of ["workshop", "departure-craft", "merchant", "chest"]) {
  assert.equal(resolveTownPortalSettlement({ source }), "wing");
}

console.log("[PASS] canonical payment classification and TOWN_PORTAL settlement contracts");
