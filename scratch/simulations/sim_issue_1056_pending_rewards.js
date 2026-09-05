// sim-scope: formula — Issue #1056 pending bundle capacity and turn-cost rules
/* global console */

import "./simulation_preflight.js";
import { createDefaultCurrentRun } from "../../src/state/initial_state.js";
import {
  getPendingRewardFinalBagCount,
  resolvePendingRewardPlan
} from "../../src/rules/pending_reward_bundle.js";

const scenarios = [
  { name: "full-bag-three-rewards", bag: 20, takes: 3, discards: 3 },
  { name: "free-bag-pickup", bag: 4, takes: 3, discards: 0 },
  { name: "leave-all", bag: 20, takes: 0, discards: 0 }
];

const results = scenarios.map(scenario => {
  const plan = resolvePendingRewardPlan({
    bagCount: scenario.bag,
    rewardCount: 3,
    takeCount: scenario.takes,
    discardCount: scenario.discards,
    loadoutChanged: false
  });
  return {
    name: scenario.name,
    finalBag: getPendingRewardFinalBagCount(plan),
    valid: plan.ok,
    turnCost: plan.turnCost
  };
});

console.log(JSON.stringify({
  issue: 1056,
  run: createDefaultCurrentRun().pendingRewardBundle,
  scenarios: results
}, null, 2));
