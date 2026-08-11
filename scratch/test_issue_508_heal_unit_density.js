/* global process */

process.env.SIM_SKIP_PROVENANCE = "1";

const { getDepartureRecoveryCount } = await import("./sim_issue_508_heal_unit_density.js");

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

check(
  "15HP budget is four items every run",
  Array.from({ length: 10 }, (_, index) => getDepartureRecoveryCount(15, index)).every(
    count => count === 4
  )
);
check(
  "25HP budget is 2/3 items with 2.4 mean",
  Array.from({ length: 5 }, (_, index) => getDepartureRecoveryCount(25, index)).join(",") === "3,3,2,2,2" &&
    Array.from({ length: 5 }, (_, index) => getDepartureRecoveryCount(25, index))
      .reduce((sum, count) => sum + count * 25, 0) / 5 === 60
);
check(
  "40HP budget is 1/2 items with 1.5 mean",
  Array.from({ length: 2 }, (_, index) => getDepartureRecoveryCount(40, index)).join(",") === "2,1" &&
    Array.from({ length: 2 }, (_, index) => getDepartureRecoveryCount(40, index))
      .reduce((sum, count) => sum + count * 40, 0) / 2 === 60
);

const failures = checks.filter(({ condition }) => !condition);
if (failures.length > 0) {
  console.error("[FAIL]", failures);
  process.exit(1);
}
