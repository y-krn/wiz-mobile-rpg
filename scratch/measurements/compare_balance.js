// sim-scope: infra — compare two saved standard statistical balance measurements
/* global console, process */

import fs from "node:fs";
import { compareBalanceMeasurements, renderComparisonMarkdown } from "./balance_measurement.js";

function parseArgs(argv) {
  const positional = [];
  let output = null;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--output") {
      output = argv[++index];
      if (!output) throw new Error("--output requires a path");
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurements/compare_balance.js baseline.json candidate.json [--output comparison.md]");
      process.exit(0);
    } else {
      positional.push(value);
    }
  }
  if (positional.length !== 2) throw new Error("baseline.json and candidate.json are required");
  return { baselinePath: positional[0], candidatePath: positional[1], output };
}

const options = parseArgs(process.argv.slice(2));
const baseline = JSON.parse(fs.readFileSync(options.baselinePath, "utf8"));
const candidate = JSON.parse(fs.readFileSync(options.candidatePath, "utf8"));
const comparison = compareBalanceMeasurements(baseline, candidate);
const markdown = renderComparisonMarkdown(comparison);
if (options.output) fs.writeFileSync(options.output, markdown);
console.log(markdown);
if (comparison.status === "fail") process.exitCode = 1;
