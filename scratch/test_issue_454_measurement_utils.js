/* global console, process */

import {
  compareConditionRows,
  inferPairingEligibility
} from "./measurement_utils.js";

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push(`${name}: ${actual} !== ${expected}`);
}

const pairedCondition = { slotMode: "unlimited" };
const generationCondition = { affixVolume: "increased-composition" };
const leftRows = [
  { pairId: "a", randomSequenceId: "same-a", value: 5 },
  { pairId: "b", randomSequenceId: "same-b", value: 7 },
  { pairId: "c", randomSequenceId: "same-c", value: 9 }
];
const rightRows = [
  { pairId: "a", randomSequenceId: "same-a", value: 3 },
  { pairId: "b", randomSequenceId: "same-b", value: 6 },
  { pairId: "c", randomSequenceId: "same-c", value: 8 }
];

check("post-generation classifier", inferPairingEligibility(pairedCondition).method, "paired");
check("generation classifier", inferPairingEligibility(generationCondition).method, "independent");
check(
  "matching random sequences use paired",
  compareConditionRows({
    leftRows,
    rightRows,
    selector: row => row.value,
    condition: pairedCondition
  }).method,
  "paired"
);
check(
  "mismatching random sequences fall back",
  compareConditionRows({
    leftRows,
    rightRows: rightRows.map(row => ({ ...row, randomSequenceId: `other-${row.pairId}` })),
    selector: row => row.value,
    condition: pairedCondition
  }).method,
  "independent"
);
check(
  "generation change uses independent",
  compareConditionRows({
    leftRows,
    rightRows,
    selector: row => row.value,
    condition: generationCondition
  }).method,
  "independent"
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`[PASS] ${5} Issue #454 measurement utility checks`);
