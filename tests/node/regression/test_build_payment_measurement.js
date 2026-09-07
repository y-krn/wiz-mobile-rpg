import assert from "node:assert/strict";
import {
  ISSUE1096_SCHEMA_VERSION,
  validateIssue1096Report
} from "../../../scratch/measurements/issue1096_build_payment.js";
import { STANDARD_BALANCE_CONFIG } from "../../../scratch/measurements/balance_measurement.js";
import { classifyBuildPaymentAction } from "../../../scratch/simulations/sim_depth_material_ev.js";

const n = STANDARD_BALANCE_CONFIG.runs;
assert.equal(classifyBuildPaymentAction({ type: "defend" }), "guard");
assert.equal(classifyBuildPaymentAction({ type: "item", itemKey: "GUARD_POTION" }), "item");
assert.equal(classifyBuildPaymentAction({ type: "unknown" }), "noop");
const distribution = () => ({ n });
const resourceState = () => ({
  hpRate: { n: 0 },
  mpRate: { n: 0 },
  inventorySlots: { n: 0 },
  inventoryFreeSlots: { n: 0 },
  carriedMaterials: { n: 0 }
});
const payment = {
  combat: { rounds: distribution() },
  resources: {
    damageTakenHp: distribution(),
    healingHp: distribution(),
    mpSpent: distribution(),
    finalHp: distribution(),
    finalHpRate: distribution(),
    finalMp: distribution(),
    finalMpRate: distribution(),
    finalMpOverMax: distribution()
  },
  guard: {
    mitigationHp: distribution(),
    mitigationEvents: distribution(),
    statusMitigationEvents: distribution(),
    statusMitigationSource: "combatFormulaTelemetry.statusMitigations"
  },
  loot: {
    finalBagSlots: distribution(),
    equipmentDisposition: { status: "not_modeled", left: null, discarded: null }
  },
  terminalResourceState: {
    hpRate: distribution(),
    mpRate: distribution(),
    mpOverMax: distribution(),
    inventorySlots: distribution(),
    inventoryFreeSlots: distribution(),
    carriedMaterials: distribution()
  },
  portal: { useEvents: 0, milestoneDecisions: 0, resourceState: resourceState() }
};

const cases = STANDARD_BALANCE_CONFIG.scenarioIds.flatMap(scenarioId =>
  STANDARD_BALANCE_CONFIG.targetDepths.flatMap(targetDepth =>
    STANDARD_BALANCE_CONFIG.fixtureIds.map(fixtureId => ({
      scenarioId,
      targetDepth,
      fixtureId,
      runs: n,
      startingBuildSnapshot: { schemaVersion: 1, identity: `start:${fixtureId}` },
      endingBuildSnapshotDistribution: {
        runs: n,
        byIdentity: {
          [`end:${fixtureId}`]: {
            count: n,
            snapshot: { schemaVersion: 1, identity: `end:${fixtureId}` }
          }
        }
      },
      outcome: { outcomeDistribution: { retreat: n } },
      payment
    }))
  )
);

assert.equal(
  validateIssue1096Report({
    schemaVersion: ISSUE1096_SCHEMA_VERSION,
    config: STANDARD_BALANCE_CONFIG,
    decision: {
      numericBalanceChange: "none",
      additionalObservation: ["object loot lifecycle is not modeled"],
      balanceIssueCandidates: [],
      basis: "explicit post-measurement review"
    },
    measurement: { determinism: { checked: true, matching: true } },
    cases
  }),
  true
);
assert.throws(
  () => validateIssue1096Report({
    schemaVersion: ISSUE1096_SCHEMA_VERSION,
    config: { ...STANDARD_BALANCE_CONFIG, runs: 499 },
    cases
  }),
  /N>=500/
);
console.log("PASS Build Snapshot payment measurement contract");
