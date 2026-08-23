import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseSimScopeDeclaration } from "./measurement_env_signature.js";

export const BALANCE_DOMAINS = Object.freeze([
  "combat", "status", "equipment", "drops", "chests", "traps",
  "economy", "progression", "maps", "recovery", "merchant", "workshop"
]);

const BALANCE_ALL = Object.freeze([...BALANCE_DOMAINS]);
const historicalRunnerFiles = Object.freeze([
  "sim_balance.js", "sim_camp_recovery.js", "sim_caster_pack.js",
  "sim_commit_depth_624.js", "sim_depth_scaling.js", "sim_early_mortality.js",
  "sim_encounter_rate_options.js", "sim_frontline_formula.js",
  "sim_identification_gamble.js", "sim_inflow_reduction.js", "sim_material_income.js",
  "sim_maze_metrics.js", "sim_new_spells.js", "sim_retreat_access.js",
  "sim_run_floor_templates.js", "sim_solo_b1f.js", "sim_workshop_progression.js"
]);

// Metadata only: the canonical runner imports production rules and exposes
// observable evidence for the mechanisms listed here.
export const SIMULATION_MANIFEST = Object.freeze({
  version: 1,
  canonical: Object.freeze({
    path: "scratch/sim_depth_material_ev.js",
    lifecycle: "canonical",
    scope: "run",
    covers: BALANCE_ALL,
    criticalRuntimeMechanisms: Object.freeze([
      { id: "maps.run-floor-traversal", domain: "maps", evidence: { anyPositive: ["reachedFloor"] } },
      { id: "combat.round-resolution", domain: "combat", evidence: { anyPositive: ["combatRounds"] } },
      { id: "equipment.generation", domain: "equipment", evidence: { anyPositive: ["equipmentFound"] } },
      { id: "chests.open", domain: "chests", evidence: { anyPositive: ["chestsOpenedInRun"] } },
      { id: "drops.reward-materials", domain: "drops", evidence: { anyPositive: ["materialAcquired"] } },
      { id: "progression.experience", domain: "progression", evidence: { anyPositive: ["expGained"] } },
      { id: "recovery.kill-heal", domain: "recovery", evidence: { anyPositive: ["killHeal.killHealActivations"] } }
    ]),
    smoke: Object.freeze({
      modeled: Object.freeze([
        "production run-floor generation", "round combat and reward resolution",
        "equipment generation and upgrade path", "chest opening and material rewards",
        "production recovery effect"
      ]),
      omitted: Object.freeze([
        "merchant purchase policy", "status/trap stochastic firing not guaranteed by one run",
        "UI input, rendering, and analytics transport",
        "statistical balance estimates and Monte Carlo confidence intervals"
      ])
    })
  }),
  // Issue-specific runners remain historical. An unmatched new sim is an error.
  runnerLifecycleRules: Object.freeze([
    { pattern: "scratch/sim_depth_material_ev.js", lifecycle: "canonical", scope: "run" },
    { pattern: "scratch/sim_issue_*.js", lifecycle: "historical" },
    { pattern: "scratch/sim_parallel*.js", lifecycle: "historical" },
    ...historicalRunnerFiles.map(file => ({ pattern: `scratch/${file}`, lifecycle: "historical" }))
  ]),
  balanceImpactPaths: Object.freeze([
    { pattern: "src/combat.js", domains: ["combat"] },
    { pattern: "src/combat_logic.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/**", domains: ["combat", "status"] },
    { pattern: "src/combat_ui/**", domains: BALANCE_ALL },
    { pattern: "src/data.js", domains: BALANCE_ALL },
    { pattern: "src/data/**", domains: BALANCE_ALL },
    { pattern: "src/rules/**", domains: BALANCE_ALL },
    { pattern: "src/systems/**", domains: BALANCE_ALL },
    { pattern: "src/state.js", domains: BALANCE_ALL },
    { pattern: "src/state/**", domains: BALANCE_ALL },
    { pattern: "src/constants/**", domains: BALANCE_ALL },
    { pattern: "src/movement.js", domains: ["maps", "traps", "chests", "recovery", "status"] },
    { pattern: "src/run_map_generator.js", domains: ["maps", "traps", "chests", "combat"] },
    { pattern: "src/map_generator.js", domains: ["maps"] },
    { pattern: "src/chest.js", domains: ["chests", "traps", "drops", "equipment", "recovery", "economy"] },
    { pattern: "src/craft.js", domains: ["workshop", "economy", "equipment"] },
    { pattern: "src/equip.js", domains: ["equipment", "economy"] },
    { pattern: "src/result.js", domains: ["drops", "economy", "progression"] }
  ].map(rule => ({ ...rule, domains: Object.freeze([...rule.domains]) }))),
  balanceImpactNone: Object.freeze([
    "src/ui.js", "src/ui/**", "src/styles/**", "src/style.css", "src/audio.js",
    "src/game.js", "src/main.js", "src/navigation.js", "src/menu.js", "src/menu/**",
    "src/sentry.js", "src/error_context.js", "src/controls_guard.js"
  ])
});

const STALE_SIMULATION_REFERENCE_PATTERNS = Object.freeze([
  { id: "trapSense", pattern: /\b(?:trapSense|trap_sense|TRAP_SENSE|simTrapSense|SIM_TRAP_SENSE)\b/ }
]);

function globToRegExp(glob) {
  let source = "^";
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character === "*" && glob[index + 1] === "*") {
      source += ".*";
      index++;
    } else if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function matches(pattern, filePath) {
  return globToRegExp(pattern).test(normalizePath(filePath));
}

function getPathValue(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function isPositiveEvidence(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export function evaluateRuntimeMechanisms(result, mechanisms = SIMULATION_MANIFEST.canonical.criticalRuntimeMechanisms) {
  return Object.fromEntries(mechanisms.map(mechanism => {
    const fields = mechanism.evidence?.anyPositive || [];
    const fired = fields.some(field => isPositiveEvidence(getPathValue(result, field)));
    return [mechanism.id, { domain: mechanism.domain, fired, evidence: fields }];
  }));
}

export function assertRuntimeMechanismsFired(result, mechanisms = SIMULATION_MANIFEST.canonical.criticalRuntimeMechanisms) {
  const firing = evaluateRuntimeMechanisms(result, mechanisms);
  const missing = Object.entries(firing).filter(([, status]) => !status.fired).map(([id]) => id);
  if (missing.length > 0) throw new Error(`canonical simulation runtime evidence missing: ${missing.join(", ")}`);
  return firing;
}

export function validateSimulationManifest(manifest = SIMULATION_MANIFEST) {
  const errors = [];
  const allowedLifecycles = new Set(["canonical", "temporary", "historical"]);
  const canonical = manifest?.canonical;
  if (!canonical || typeof canonical !== "object") {
    errors.push("canonical runner metadata is missing");
  } else {
    if (canonical.lifecycle !== "canonical") errors.push("canonical runner lifecycle must be canonical");
    if (typeof canonical.path !== "string" || !canonical.path) errors.push("canonical runner path is missing");
    if (canonical.scope !== "run") errors.push("canonical runner scope must be run");
    if (!Array.isArray(canonical.covers) || canonical.covers.length === 0) {
      errors.push("canonical runner coverage is missing");
    } else {
      for (const domain of canonical.covers) {
        if (!BALANCE_DOMAINS.includes(domain)) errors.push(`unknown canonical coverage domain: ${domain}`);
      }
    }
    if (!Array.isArray(canonical.criticalRuntimeMechanisms) || canonical.criticalRuntimeMechanisms.length === 0) {
      errors.push("canonical critical runtime mechanisms are missing");
    } else {
      const ids = new Set();
      for (const mechanism of canonical.criticalRuntimeMechanisms) {
        if (!mechanism?.id || ids.has(mechanism.id)) errors.push(`malformed or duplicate runtime mechanism: ${mechanism?.id || "<missing>"}`);
        ids.add(mechanism?.id);
        if (!canonical.covers?.includes(mechanism?.domain)) errors.push(`runtime mechanism ${mechanism?.id || "<missing>"} has uncovered domain ${mechanism?.domain || "<missing>"}`);
        if (!Array.isArray(mechanism?.evidence?.anyPositive) || mechanism.evidence.anyPositive.length === 0) errors.push(`runtime mechanism ${mechanism?.id || "<missing>"} has malformed evidence metadata`);
      }
    }
  }
  if (!Array.isArray(manifest?.runnerLifecycleRules) || manifest.runnerLifecycleRules.length === 0) {
    errors.push("runner lifecycle metadata is missing");
  } else {
    for (const rule of manifest.runnerLifecycleRules) {
      if (typeof rule?.pattern !== "string" || !rule.pattern) errors.push("runner lifecycle rule pattern is missing");
      if (!allowedLifecycles.has(rule?.lifecycle)) errors.push(`unknown runner lifecycle: ${rule?.lifecycle || "<missing>"}`);
    }
    if (!manifest.runnerLifecycleRules.some(rule =>
      rule.pattern === canonical?.path && rule.lifecycle === "canonical"
    )) errors.push("canonical runner is missing from lifecycle metadata");
  }
  if (!Array.isArray(manifest?.balanceImpactPaths) || manifest.balanceImpactPaths.length === 0) errors.push("balance impact path metadata is missing");
  return errors;
}

export function assertValidSimulationManifest(manifest = SIMULATION_MANIFEST) {
  const errors = validateSimulationManifest(manifest);
  if (errors.length > 0) throw new Error(`malformed simulation manifest: ${errors.join("; ")}`);
  return manifest;
}

export function classifySimulationRunner(filePath, manifest = SIMULATION_MANIFEST) {
  const normalized = normalizePath(filePath);
  const matchesForPath = (manifest.runnerLifecycleRules || []).filter(rule => matches(rule.pattern, normalized));
  return matchesForPath.length === 1 ? matchesForPath[0] : null;
}

function defaultSimulationFiles() {
  return fs.readdirSync(path.dirname(new URL(import.meta.url).pathname))
    .filter(name => /^sim_.*\.js$/.test(name)).map(name => `scratch/${name}`);
}

export function inspectSimulationMetadata({ files = null, sourceByPath = new Map(), manifest = SIMULATION_MANIFEST } = {}) {
  const errors = [];
  for (const file of files || defaultSimulationFiles()) {
    const normalized = normalizePath(file);
    const rule = classifySimulationRunner(normalized, manifest);
    if (!rule) {
      errors.push(`${normalized}: missing or ambiguous lifecycle metadata`);
      continue;
    }
    const source = sourceByPath.has(normalized)
      ? sourceByPath.get(normalized)
      : fs.readFileSync(path.resolve(normalized), "utf8");
    const scope = parseSimScopeDeclaration(source);
    if (!scope) errors.push(`${normalized}: missing sim-scope metadata`);
    else if (rule.scope && scope.name !== rule.scope) errors.push(`${normalized}: lifecycle scope ${rule.scope} disagrees with sim-scope ${scope.name}`);
    if (rule.lifecycle === "canonical" && !source.includes("generateRunFloor")) errors.push(`${normalized}: canonical runner does not reference generateRunFloor`);
  }
  return errors;
}

export function scanStaleSimulationReferences({ files = null, sourceByPath = new Map() } = {}) {
  const findings = [];
  for (const file of files || defaultSimulationFiles()) {
    const normalized = normalizePath(file);
    const source = sourceByPath.has(normalized)
      ? sourceByPath.get(normalized)
      : fs.readFileSync(path.resolve(normalized), "utf8");
    for (const stale of STALE_SIMULATION_REFERENCE_PATTERNS) {
      if (stale.pattern.test(source)) findings.push({ file: normalized, reference: stale.id });
    }
  }
  return findings;
}

function gitNames(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split(/\r?\n/).map(normalizePath).filter(Boolean);
}

export function currentChangedFiles({ baseRef = process.env.BASE_REF || "origin/main" } = {}) {
  return [...new Set([
    ...gitNames(["diff", "--name-only", `${baseRef}...HEAD`]),
    ...gitNames(["diff", "--name-only"]),
    ...gitNames(["diff", "--name-only", "--cached"]),
    ...gitNames(["ls-files", "--others", "--exclude-standard"])
  ])];
}

export function analyzeBalanceImpact(changedFiles, manifest = SIMULATION_MANIFEST) {
  const impacts = [];
  const errors = [];
  for (const rawFile of changedFiles) {
    const file = normalizePath(rawFile);
    if (!file.startsWith("src/")) continue;
    const balanceRule = (manifest.balanceImpactPaths || []).find(rule => matches(rule.pattern, file));
    if (balanceRule) {
      const domains = [...new Set(balanceRule.domains || [])];
      const uncovered = domains.filter(domain => !manifest.canonical.covers.includes(domain));
      impacts.push({ file, domains, uncovered });
      if (uncovered.length > 0) errors.push(`${file}: balance domains not covered by canonical simulation: ${uncovered.join(", ")}`);
      continue;
    }
    if ((manifest.balanceImpactNone || []).some(pattern => matches(pattern, file))) continue;
    errors.push(`${file}: unknown production path; declare balance-impact domains or explicit balance-impact: none`);
  }
  return { impacts, errors };
}

export function assertBalanceImpactCovered(changedFiles, manifest = SIMULATION_MANIFEST) {
  const report = analyzeBalanceImpact(changedFiles, manifest);
  if (report.errors.length > 0) throw new Error(`balance impact coverage gate failed: ${report.errors.join("; ")}`);
  return report;
}
