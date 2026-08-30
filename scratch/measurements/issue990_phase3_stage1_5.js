// sim-scope: run — production-backed shallow MP/combat diagnosis
/* global process */
import "../simulations/simulation_preflight.js";
import { main } from "./issue990_phase3_stage1.js";
import { pathToFileURL } from "node:url";

export const RUNNER_VERSION = "issue990-phase3-stage1.5-v1";
export const SCHEMA_VERSION = 2;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2), { stage15: true });
}
