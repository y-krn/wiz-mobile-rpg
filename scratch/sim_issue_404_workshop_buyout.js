// sim-scope: run
// Issue #404: progression-side workshop buyout rate under each affix profile.
// The delegated progression runner uses the generateRunFloor(…) path.

/* global process */

import { pathToFileURL } from "node:url";
import {
  AFFIX_VOLUME_PROFILES,
  applyAffixVolumeProfile
} from "./issue_404_affix_profiles.js";

const profileId = String(process.env.SIM_ISSUE404_PROFILE || "base").trim();
const profile = AFFIX_VOLUME_PROFILES[profileId];
if (!profile) {
  throw new Error(
    `SIM_ISSUE404_PROFILE must be ${Object.keys(AFFIX_VOLUME_PROFILES).join("|")}: ${profileId}`
  );
}

const defaults = {
  SIM_SEED: "444",
  SIM_RUNS: "6600",
  SIM_CALIBRATION_RUNS: "100",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  FLEE_POLICY: "threshold",
  FLEE_HP_THRESHOLD: "0.35",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  DEPARTURE_CRAFT_IDS: ""
};
Object.entries(defaults).forEach(([key, value]) => {
  if (process.env[key] === undefined) process.env[key] = value;
});
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #404 measurement");
}

const { AFFIX_BALANCE } = await import("../src/data/affixes.js");
applyAffixVolumeProfile(AFFIX_BALANCE, profileId);
const { runWorkshopProgressionSimulation } = await import("./sim_workshop_progression.js");

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorkshopProgressionSimulation();
}
