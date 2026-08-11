import { resolveMeasurementProvenance } from "./measurement_provenance.js";

// Unit runners deliberately skip git-backed provenance assertions because CI
// checkouts may not have an origin/main ref. Direct invocation still exercises
// the real repository provenance check.
if (process.env.SIM_SKIP_PROVENANCE === "1") {
  console.log("SKIP measurement provenance in unit-test process");
  process.exit(0);
}

const failures = [];
function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

const provenance = resolveMeasurementProvenance({ fetchOriginMain: false });
check("source commit", () => {
  if (!/^[0-9a-f]{40}$/.test(provenance.sourceCommit)) {
    throw new Error(`unexpected commit: ${provenance.sourceCommit}`);
  }
});
check("origin/main ancestry", () => {
  if (provenance.originMainAncestor !== true) {
    throw new Error("current test tree is not a descendant of origin/main");
  }
});
check("stale-tree override", () => {
  if (provenance.staleTreeAllowed !== false) {
    throw new Error("stale-tree override unexpectedly active");
  }
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS measurement provenance");
