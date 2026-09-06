import assert from "node:assert/strict";
import {
  ISSUE1096_SCHEMA_VERSION,
  validateIssue1096Report
} from "../../measurements/issue1096_build_payment.js";
import { STANDARD_BALANCE_CONFIG } from "../../measurements/balance_measurement.js";

const n = STANDARD_BALANCE_CONFIG.runs;
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
    finalMp: distribution()
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
    inventorySlots: distribution(),
    inventoryFreeSlots: distribution(),
    carriedMaterials: distribution()
  },
  portal: { resourceState: resourceState() }
};

const cases = STANDARD_BALANCE_CONFIG.scenarioIds.flatMap(scenarioId =>
  STANDARD_BALANCE_CONFIG.targetDepths.flatMap(targetDepth =>
    STANDARD_BALANCE_CONFIG.fixtureIds.map(fixtureId => ({
      scenarioId,
      targetDepth,
      fixtureId,
      runs: n,
      outcome: { outcomeDistribution: { retreat: n } },
      payment
    }))
  )
);

assert.equal(
  validateIssue1096Report({
    schemaVersion: ISSUE1096_SCHEMA_VERSION,
    config: STANDARD_BALANCE_CONFIG,
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
