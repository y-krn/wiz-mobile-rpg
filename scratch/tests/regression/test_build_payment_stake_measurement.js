import assert from "node:assert/strict";
import {
  ISSUE1100_SCHEMA_VERSION,
  validateIssue1100Report
} from "../../measurements/issue1100_build_payment_stake.js";
import { resolveTownPortalSettlement } from "../../simulations/sim_depth_material_ev.js";
import { STANDARD_BALANCE_CONFIG } from "../../measurements/balance_measurement.js";

for (const source of ["workshop", "departure-craft", "merchant"]) {
  assert.equal(
    resolveTownPortalSettlement({ source }),
    "wing",
    `TOWN_PORTAL settlement must be Wing for ${source}`
  );
}
console.log("PASS TOWN_PORTAL workshop/departure-craft/merchant sources share Wing settlement semantics");

const n = STANDARD_BALANCE_CONFIG.runs;
const distribution = () => ({ n, mean: 1, min: 0, max: 1 });
const resourceState = () => Object.fromEntries([
  "hpRate", "mpRate", "inventorySlots", "inventoryFreeSlots", "carriedMaterials"
].map(name => [name, { n: 0 }]));
const stakePoint = events => ({
  events,
  settlementOutcomeCounts: { none: events },
  unconfirmedObjectCount: { n: events, mean: 1, min: 0, max: 2 },
  composition: {}
});
const payment = {
  combat: { rounds: distribution() },
  resources: {
    damageTakenHp: distribution(), healingHp: distribution(), mpSpent: distribution(),
    finalHp: distribution(), finalHpRate: distribution(), finalMp: distribution(),
    finalMpRate: distribution(), finalMpOverMax: distribution()
  },
  guard: {
    mitigationHp: distribution(), mitigationEvents: distribution(),
    statusMitigationEvents: distribution(),
    statusMitigationSource: "combatFormulaTelemetry.statusMitigations"
  },
  loot: { finalBagSlots: distribution() },
  terminalResourceState: {
    hpRate: distribution(), mpRate: distribution(), mpOverMax: distribution(),
    inventorySlots: distribution(), inventoryFreeSlots: distribution(), carriedMaterials: distribution()
  },
  portal: { useEvents: 0, milestoneDecisions: 0, resourceState: resourceState() },
  stake: {
    schemaVersion: 1,
    ownershipSource: "currentRun.unbankedObjectLoot",
    identitySource: "currentRun.unbankedObjectLoot[].id",
    points: {
      pending_reward_resolution: stakePoint(n),
      push_decision: stakePoint(n),
      portal_decision: stakePoint(n),
      wing_salvage_before: stakePoint(n),
      terminal_settlement_before: stakePoint(n),
      terminal_settlement_after: stakePoint(n)
    },
    lifecycle: {
      status: "production_ledger_and_pending_disposition",
      counts: {
        found: n,
        bagged: n,
        consumed: 0,
        discarded: 0,
        left: 0,
        banked: n,
        salvaged: 0,
        lost: 0
      },
      omittedStages: []
    }
  }
};
const cases = STANDARD_BALANCE_CONFIG.scenarioIds.flatMap(scenarioId =>
  STANDARD_BALANCE_CONFIG.targetDepths.flatMap(targetDepth =>
    STANDARD_BALANCE_CONFIG.fixtureIds.map(fixtureId => ({
      scenarioId, targetDepth, fixtureId, runs: n,
      outcome: { outcomeDistribution: { retreat: n } }, payment
    }))
  )
);

assert.equal(validateIssue1100Report({
  schemaVersion: ISSUE1100_SCHEMA_VERSION,
  config: STANDARD_BALANCE_CONFIG,
  decision: {
    numericBalanceChange: "none",
    additionalObservation: ["stake measured"],
    balanceIssueCandidates: [],
    basis: "explicit post-measurement review"
  },
  measurement: { determinism: { checked: true, matching: true } },
  cases
}), true);
console.log("PASS Issue #1100 Build Snapshot stake measurement contract");
