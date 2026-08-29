import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseSimScopeDeclaration } from "../measurements/measurement_env_signature.js";

export const BALANCE_DOMAINS = Object.freeze([
  "combat", "status", "equipment", "drops", "chests", "traps",
  "economy", "progression", "maps", "recovery", "merchant", "workshop"
]);

const BALANCE_ALL = Object.freeze([...BALANCE_DOMAINS]);
const canonicalRunnerPath = "scratch/simulations/sim_depth_material_ev.js";

// This is an explicit authorization inventory. Discovery may find a new
// candidate, but lifecycle validation must reject it until it is classified.
export const SIMULATION_RUNNER_INVENTORY = Object.freeze([
  { path: canonicalRunnerPath, lifecycle: "canonical", scope: "run" },
  { path: "scratch/measurements/issue624_commit_depth.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/measurements/issue700_gate_metrics.js", lifecycle: "historical", scope: "infra" },
  { path: "scratch/measurements/issue706_depth_enemy_pools.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_balance.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_camp_recovery.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_caster_pack.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_commit_depth_624.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_depth_scaling.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_early_mortality.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_encounter_rate_options.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_frontline_formula.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_identification_gamble.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_inflow_reduction.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_461_baseline.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_499_shallow_recovery_dose_sweep.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_499_shallow_recovery_supply.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_508_heal_unit_density.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_516_class_sustain.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_528_class_sustain_phase2.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_599_explore_spells.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_599_level_distribution.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_612_exp_pace.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_713_trap_calibration.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_issue_793_bleeding.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_material_income.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_maze_metrics.js", lifecycle: "historical", scope: "map" },
  { path: "scratch/simulations/sim_new_spells.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_parallel.js", lifecycle: "historical", scope: "infra" },
  { path: "scratch/simulations/sim_parallel_worker.js", lifecycle: "historical", scope: "infra" },
  { path: "scratch/simulations/sim_retreat_access.js", lifecycle: "historical", scope: "formula" },
  { path: "scratch/simulations/sim_run_floor_templates.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_solo_b1f.js", lifecycle: "historical", scope: "run" },
  { path: "scratch/simulations/sim_workshop_progression.js", lifecycle: "historical", scope: "run" }
]);

export const EXECUTABLE_MEASUREMENT_RUNNERS = Object.freeze(
  SIMULATION_RUNNER_INVENTORY
    .filter(runner => runner.path.startsWith("scratch/measurements/"))
    .map(runner => runner.path)
);
const RUNNER_DISCOVERY_PATTERNS = Object.freeze([
  "scratch/simulations/sim_*.js",
  ...EXECUTABLE_MEASUREMENT_RUNNERS
]);

// Metadata only: the canonical runner imports production rules and exposes
// observable evidence for the mechanisms listed here.
export const SIMULATION_MANIFEST = Object.freeze({
  version: 1,
  canonical: Object.freeze({
    path: canonicalRunnerPath,
    lifecycle: "canonical",
    scope: "run",
    modelDomains: BALANCE_ALL,
    criticalRuntimeMechanisms: Object.freeze([
      { id: "maps.run-floor-traversal", domain: "maps", evidence: { anyPositive: ["floorsTraversed"] } },
      { id: "combat.round-resolution", domain: "combat", evidence: { anyPositive: ["combatRounds"] } },
      { id: "equipment.generation", domain: "equipment", evidence: { callLevel: ["runtimeCalls.equipment.generate"], anyPositive: ["equipmentFound"] } },
      { id: "chests.open", domain: "chests", evidence: { callLevel: ["runtimeCalls.chests.reward-roll"], anyPositive: ["chestsOpenedInRun"] } },
      { id: "drops.reward-materials", domain: "drops", evidence: { anyPositive: ["materialAcquired"] } },
      { id: "progression.experience", domain: "progression", evidence: { anyPositive: ["expGained"] } },
      { id: "status.exploration-poison", domain: "status", evidence: { anyPositive: ["statusObservations.byStatus.poisoned.applications"] } },
      { id: "recovery.kill-heal", domain: "recovery", evidence: { anyPositive: ["killHeal.killHealActivations"] } },
      { id: "recovery.combat-policy", domain: "recovery", evidence: { callLevel: ["runtimeCalls.recovery.combat-policy"] } },
      { id: "traps.chest-roll", domain: "traps", evidence: { callLevel: ["runtimeCalls.traps.chest-roll"] } },
      { id: "economy.material-bank", domain: "economy", evidence: { anyPositive: ["bankedMaterials"] } },
      { id: "workshop.departure-craft", domain: "workshop", evidence: { anyPositive: ["departureCraftEvaluations"] } },
      { id: "workshop.equipment-craft", domain: "workshop", evidence: { callLevel: ["runtimeCalls.workshop.enhance"], anyPositive: ["equipmentCraft.enhanceAttempts"] } }
    ]),
    // Only these domains have a declared runtime evidence path in the
    // lightweight smoke. modelDomains deliberately includes the broader
    // source-domain inventory, while this map is the stricter gate coverage.
    runtimeCoverage: Object.freeze({
      maps: Object.freeze(["maps.run-floor-traversal"]),
      combat: Object.freeze(["combat.round-resolution"]),
      equipment: Object.freeze(["equipment.generation"]),
      chests: Object.freeze(["chests.open"]),
      drops: Object.freeze(["drops.reward-materials"]),
      progression: Object.freeze(["progression.experience"]),
      status: Object.freeze(["status.exploration-poison"]),
      recovery: Object.freeze(["recovery.kill-heal", "recovery.combat-policy"]),
      traps: Object.freeze(["traps.chest-roll"]),
      economy: Object.freeze(["economy.material-bank"]),
      workshop: Object.freeze(["workshop.departure-craft", "workshop.equipment-craft"])
    }),
    smoke: Object.freeze({
      modeled: Object.freeze([
        "production run-floor generation", "round combat and reward resolution",
        "equipment generation and upgrade path", "chest opening and material rewards",
        "hidden-door search, revealed secret-room reward reachability, and search-step cost",
        "fromDrop chest pool and inspect/open/disarm/trap-kit/smash/leave policy outcomes",
        "production recovery effect", "production chest-trap roll",
        "production enhance/polish actions with explicit standard and omitted policies"
      ]),
      omitted: Object.freeze([
        "merchant purchase policy (canonical N=1 ends before milestone floor)",
        "UI input, rendering, and analytics transport",
        "statistical balance estimates and Monte Carlo confidence intervals"
      ])
    })
  }),
  // Issue-specific runners remain historical. This inventory is intentionally
  // exact: an unmatched new sim or executable measurement runner is an error.
  runnerLifecycleRules: Object.freeze(SIMULATION_RUNNER_INVENTORY.map(runner => ({
    pattern: runner.path,
    lifecycle: runner.lifecycle,
    scope: runner.scope
  }))),
  balanceImpactPaths: Object.freeze([
    { pattern: "src/constants/item_categories.js", domains: ["economy"] },
    { pattern: "src/craft.js", domains: ["workshop", "economy"] },
    { pattern: "src/data/items.js", domains: ["maps", "economy"] },
    { pattern: "src/data/milestone_merchant.js", domains: ["economy"] },
    { pattern: "src/menu/explore_actions.js", domains: ["maps", "traps"] },
    { pattern: "src/movement.js", domains: ["maps", "traps"] },
    { pattern: "src/state/state_core.js", domains: ["maps"] },
    { pattern: "src/systems/exploration_items.js", domains: ["maps", "traps"] },
    { pattern: "src/systems/item_effects.js", domains: ["maps"] },
    { pattern: "src/combat.js", domains: ["combat"] },
    { pattern: "src/combat_ui/outcome_rewards.js", domains: ["equipment"] },
    { pattern: "src/combat_ui/spell_menu.js", domains: ["combat"] },
    { pattern: "src/combat_logic.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/auto_action.js", domains: ["combat", "recovery"] },
    { pattern: "src/combat_logic/boss_actions.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/damage.js", domains: ["combat", "status", "recovery"] },
    { pattern: "src/combat_logic/drops.js", domains: ["drops"] },
    { pattern: "src/combat_logic/item_resolution.js", domains: ["combat", "status", "recovery"] },
    { pattern: "src/combat_logic/monster_traits.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/mp_ward.js", domains: ["combat"] },
    { pattern: "src/combat_logic/rewards.js", domains: ["drops", "progression"] },
    { pattern: "src/combat_logic/round.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/spell_resolution.js", domains: ["combat", "status"] },
    { pattern: "src/combat_logic/status_effects.js", domains: ["status"] },
    { pattern: "src/combat_logic/targeting.js", domains: ["combat"] },
    { pattern: "src/data.js", domains: ["combat", "equipment", "maps", "progression", "status", "recovery"] },
    { pattern: "src/data/encounters.js", domains: ["combat", "maps"] },
    // Biome landmark signatures are render-only and intentionally map to no balance domain.
    { pattern: "src/data/biomes.js", domains: [] },
    { pattern: "src/data/equipment_tables.js", domains: ["equipment"] },
    { pattern: "src/data/materials.js", domains: ["drops"] },
    { pattern: "src/data/progression.js", domains: ["progression"] },
    { pattern: "src/rules/character_stats.js", domains: ["combat", "equipment"] },
    { pattern: "src/rules/item_rules.js", domains: ["equipment"] },
    { pattern: "src/systems/identification.js", domains: ["equipment"] },
    { pattern: "src/rules/depth_scaling.js", domains: ["combat", "maps"] },
    { pattern: "src/rules/equipment_slots.js", domains: ["equipment"] },
    { pattern: "src/rules/leveling.js", domains: ["progression"] },
    { pattern: "src/rules/map_queries.js", domains: ["maps"] },
    { pattern: "src/rules/recovery_rules.js", domains: ["recovery"] },
    { pattern: "src/movement.js", domains: ["maps", "traps", "chests", "recovery", "status"] },
    { pattern: "src/run_map_generator.js", domains: ["maps", "traps", "chests", "combat"] },
    { pattern: "src/map_generator.js", domains: ["maps"] },
    { pattern: "src/chest.js", domains: ["chests", "traps", "drops", "equipment", "recovery", "economy"] },
    { pattern: "src/craft.js", domains: ["workshop", "economy", "equipment"] },
    // Equipment preview/rendering changes do not alter economy rules; economy
    // mutations remain covered by their owning action/system modules.
    { pattern: "src/equip.js", domains: ["equipment"] },
    { pattern: "src/result.js", domains: ["drops", "economy", "progression"] },
    { pattern: "src/systems/camp_rest.js", domains: ["recovery"] },
    { pattern: "src/systems/equipment_generation.js", domains: ["equipment"] },
    { pattern: "src/systems/equipment_discard.js", domains: ["equipment"] },
    { pattern: "src/rules/chest_rules.js", domains: ["chests", "equipment", "traps"] },
    { pattern: "src/systems/leveling.js", domains: ["progression"] },
    { pattern: "src/combat_ui/combat_start.js", domains: ["combat"] }
  ].map(rule => ({ ...rule, domains: Object.freeze([...rule.domains]) }))),
  balanceImpactNone: Object.freeze([
    "src/ui.js", "src/ui/**", "src/styles/**", "src/style.css", "src/audio.js",
    "src/combat_ui/spell_summary.js", "src/combat_ui/combat_overlay.js", "src/spell_menu.js",
    "src/combat_ui/action_selection.js",
    "src/game.js", "src/main.js", "src/navigation.js", "src/menu.js", "src/menu/**", "src/renderer.js", "src/rules/map_movement.js", "src/state.js", "src/state/view_state.js",
    "src/sentry.js", "src/sentry_browser.js", "src/state/save_storage.js", "src/state/save_migrations.js", "src/state/save_payload.js",
    "src/error_context.js", "src/controls_guard.js", "src/state/codex_state.js",
    "src/state/initial_state.js", "src/state/records_state.js", "src/result.js",
    "src/data/spells.js", "src/systems/spell_effects.js",
    "src/runtime_diagnostics.js", "src/telemetry.js", "src/systems/traps.js"
  ]),
  // A one-off no-impact declaration is recognized only when its marker is
  // added in the same production diff. This keeps mapped modules such as
  // chest.js balance-covered for later formula or reward changes.
  balanceImpactNoneDiffs: Object.freeze([
    {
      pattern: "src/chest.js",
      marker: "// balance-impact: none",
      reason: "chest phase and transient-state boundary only; reward and trap formulas remain mapped"
    },
    {
      pattern: "src/state/save_payload.js",
      marker: "// balance-impact: none",
      reason: "save/load boundary only; reward and trap formulas remain in their owning modules"
    },
    {
      pattern: "src/combat_ui/round_runner.js",
      marker: "// balance-impact: none",
      reason: "combat round-entry and party state boundary only; resolution rules remain unchanged"
    },
    {
      pattern: "src/combat_ui/combat_state.js",
      marker: "// balance-impact: none",
      reason: "combat callback context boundary only; action resolution remains unchanged"
    },
    {
      pattern: "src/combat_ui/item_menu.js",
      marker: "// balance-impact: none",
      reason: "combat item callback context boundary only; item resolution remains unchanged"
    },
    {
      pattern: "src/combat_ui/target_menu.js",
      marker: "// balance-impact: none",
      reason: "combat target callback context boundary only; target resolution remains unchanged"
    },
    {
      pattern: "src/movement.js",
      marker: "// balance-impact: none",
      reason: "milestone stairs presentation gate only; movement costs and facility rules remain unchanged",
      kind: "presentation"
    },
  ].map(declaration => Object.freeze({ ...declaration }))),
  // Exact paths whose current callers may receive telemetry-only edits. A
  // path is exempt only when every changed hunk passes isTelemetryOnlyDiff.
  telemetryOnlyPaths: Object.freeze([
    "src/combat_ui/combat_start.js"
  ]),
  // Canonical action handlers may intentionally mix a gameplay decision and
  // its telemetry anchor. These paths still require a balance mapping above.
  telemetryGameplayPaths: Object.freeze([
    // Chest action dispatch can change the selected actor/phase while keeping
    // the existing telemetry anchor in this module.
    "src/chest.js",
    "src/equip.js",
    "src/systems/equipment_discard.js",
    "src/menu/explore_actions.js",
    "src/movement.js",
    // Codex observations share combat entry/resolution paths with the
    // existing telemetry anchors but do not change combat formulas.
    "src/combat_ui/combat_start.js",
    "src/combat_logic/round.js",
    "src/result.js"
  ])
});

// This is a known stale-reference regression guard, not a general deleted-
// mechanism detector. Add a guard here only when a retired identifier needs a
// durable regression check.
export const KNOWN_STALE_REFERENCE_GUARDS = Object.freeze([
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
    const callLevel = mechanism.evidence?.callLevel || [];
    const anyPositive = mechanism.evidence?.anyPositive || [];
    const callLevelFired = callLevel.some(field => isPositiveEvidence(getPathValue(result, field)));
    const valueFired = anyPositive.some(field => isPositiveEvidence(getPathValue(result, field)));
    const fired = callLevel.length > 0 ? callLevelFired : valueFired;
    return [mechanism.id, {
      domain: mechanism.domain,
      fired,
      callLevelFired,
      valueFired,
      evidence: { callLevel, anyPositive }
    }];
  }));
}

export function assertRuntimeMechanismsFired(result, mechanisms = SIMULATION_MANIFEST.canonical.criticalRuntimeMechanisms) {
  const firing = evaluateRuntimeMechanisms(result, mechanisms);
  const missing = Object.entries(firing).filter(([, status]) => !status.fired).map(([id]) => id);
  if (missing.length > 0) throw new Error(`canonical simulation runtime evidence missing: ${missing.join(", ")}`);
  return firing;
}

export function evaluateRuntimeDomainCoverage(result, manifest = SIMULATION_MANIFEST) {
  const firing = evaluateRuntimeMechanisms(result, manifest.canonical.criticalRuntimeMechanisms);
  return Object.fromEntries(Object.entries(manifest.canonical.runtimeCoverage || {}).map(([domain, mechanismIds]) => {
    const missing = mechanismIds.filter(id => !firing[id]?.fired);
    return [domain, { mechanisms: mechanismIds, fired: missing.length === 0, missing }];
  }));
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
    if (!Array.isArray(canonical.modelDomains) || canonical.modelDomains.length === 0) {
      errors.push("canonical model coverage is missing");
    } else {
      for (const domain of canonical.modelDomains) {
        if (!BALANCE_DOMAINS.includes(domain)) errors.push(`unknown canonical model domain: ${domain}`);
      }
    }
    const mechanismIds = new Set();
    const mechanismDomains = new Map();
    if (!Array.isArray(canonical.criticalRuntimeMechanisms) || canonical.criticalRuntimeMechanisms.length === 0) {
      errors.push("canonical critical runtime mechanisms are missing");
    } else {
      for (const mechanism of canonical.criticalRuntimeMechanisms) {
        if (!mechanism?.id || mechanismIds.has(mechanism.id)) errors.push(`malformed or duplicate runtime mechanism: ${mechanism?.id || "<missing>"}`);
        mechanismIds.add(mechanism?.id);
        mechanismDomains.set(mechanism?.id, mechanism?.domain);
        if (!canonical.modelDomains?.includes(mechanism?.domain)) errors.push(`runtime mechanism ${mechanism?.id || "<missing>"} has uncovered model domain ${mechanism?.domain || "<missing>"}`);
        const callLevelEvidence = mechanism?.evidence?.callLevel;
        const valueEvidence = mechanism?.evidence?.anyPositive;
        if ((!Array.isArray(callLevelEvidence) || callLevelEvidence.length === 0) &&
          (!Array.isArray(valueEvidence) || valueEvidence.length === 0)) {
          errors.push(`runtime mechanism ${mechanism?.id || "<missing>"} has malformed evidence metadata`);
        }
      }
    }
    if (!canonical.runtimeCoverage || typeof canonical.runtimeCoverage !== "object" || Array.isArray(canonical.runtimeCoverage)) {
      errors.push("canonical runtime coverage is missing");
    } else {
      const mappedMechanisms = new Set();
      for (const [domain, requiredMechanisms] of Object.entries(canonical.runtimeCoverage)) {
        if (!canonical.modelDomains?.includes(domain)) errors.push(`runtime coverage has uncovered model domain: ${domain}`);
        if (!Array.isArray(requiredMechanisms) || requiredMechanisms.length === 0) {
          errors.push(`runtime coverage for ${domain} is missing mechanisms`);
          continue;
        }
        for (const mechanismId of requiredMechanisms) {
          mappedMechanisms.add(mechanismId);
          if (!mechanismIds.has(mechanismId)) errors.push(`runtime coverage ${domain} references unknown mechanism: ${mechanismId}`);
          else if (mechanismDomains.get(mechanismId) !== domain) errors.push(`runtime coverage ${domain} disagrees with mechanism ${mechanismId}`);
        }
      }
      for (const mechanismId of mechanismIds) {
        if (!mappedMechanisms.has(mechanismId)) errors.push(`runtime mechanism is not assigned to a runtime domain: ${mechanismId}`);
      }
    }
  }
  if (!Array.isArray(manifest?.runnerLifecycleRules) || manifest.runnerLifecycleRules.length === 0) {
    errors.push("runner lifecycle metadata is missing");
  } else {
    for (const rule of manifest.runnerLifecycleRules) {
      if (typeof rule?.pattern !== "string" || !rule.pattern) errors.push("runner lifecycle rule pattern is missing");
      if (rule?.pattern?.includes("*")) errors.push(`runner lifecycle rule must be explicit: ${rule.pattern}`);
      if (!allowedLifecycles.has(rule?.lifecycle)) errors.push(`unknown runner lifecycle: ${rule?.lifecycle || "<missing>"}`);
    }
    if (!manifest.runnerLifecycleRules.some(rule =>
      rule.pattern === canonical?.path && rule.lifecycle === "canonical"
    )) errors.push("canonical runner is missing from lifecycle metadata");
  }
  if (!Array.isArray(manifest?.balanceImpactPaths) || manifest.balanceImpactPaths.length === 0) errors.push("balance impact path metadata is missing");
  for (const pattern of manifest?.telemetryOnlyPaths || []) {
    if (typeof pattern !== "string" || !pattern || pattern.includes("*")) {
      errors.push(`telemetry-only path must be exact: ${pattern || "<missing>"}`);
    }
  }
  for (const declaration of manifest?.balanceImpactNoneDiffs || []) {
    if (!declaration || typeof declaration !== "object" || typeof declaration.pattern !== "string" || !declaration.pattern || declaration.pattern.includes("*")) {
      errors.push(`balance-impact none diff path must be exact: ${declaration?.pattern || "<missing>"}`);
    }
    if (typeof declaration?.marker !== "string" || !declaration.marker) {
      errors.push(`balance-impact none diff marker is missing: ${declaration?.pattern || "<missing>"}`);
    }
    if (typeof declaration?.reason !== "string" || !declaration.reason.trim()) {
      errors.push(`balance-impact none diff reason is missing: ${declaration?.pattern || "<missing>"}`);
    }
  }
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

export function isExecutableMeasurementRunner(filePath, source) {
  const normalized = normalizePath(filePath);
  if (matches("scratch/simulations/sim_*.js", normalized)) return true;
  const hasMeasurementMarker = /\b(?:simulateRun|runSimTasks|runDepthMaterialSimulation|SIM_RUNS)\b/.test(source);
  const hasEntryPoint = /\bmain\s*\(\s*\)|process\.argv\[1\]/.test(source);
  return Boolean(parseSimScopeDeclaration(source) && hasMeasurementMarker && hasEntryPoint);
}

function defaultSimulationFiles() {
  const simulationDir = path.dirname(new URL(import.meta.url).pathname);
  const measurementDir = path.resolve(simulationDir, "../measurements");
  const simulationFiles = fs.readdirSync(simulationDir)
    .map(name => `scratch/simulations/${name}`)
    .filter(file => file.endsWith(".js"));
  const measurementFiles = fs.readdirSync(measurementDir)
    .map(name => `scratch/measurements/${name}`)
    .filter(file => file.endsWith(".js"));
  return [...simulationFiles, ...measurementFiles]
    .filter(file => {
      if (RUNNER_DISCOVERY_PATTERNS.some(pattern => matches(pattern, file))) return true;
      return isExecutableMeasurementRunner(file, fs.readFileSync(path.resolve(file), "utf8"));
    });
}

export function discoverSimulationRunnerFiles() {
  return defaultSimulationFiles();
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
    else if (!new Set(["run", "formula", "map", "infra"]).has(scope.name)) errors.push(`${normalized}: unknown sim-scope ${scope.name}`);
    else if (rule.scope && scope.name !== rule.scope) errors.push(`${normalized}: lifecycle scope ${rule.scope} disagrees with sim-scope ${scope.name}`);
    if (rule.lifecycle === "canonical" && !source.includes("generateRunFloor")) errors.push(`${normalized}: canonical runner does not reference generateRunFloor`);
  }
  return errors;
}

export function scanKnownStaleSimulationReferences({ files = null, sourceByPath = new Map() } = {}) {
  const findings = [];
  for (const file of files || defaultSimulationFiles()) {
    const normalized = normalizePath(file);
    const source = sourceByPath.has(normalized)
      ? sourceByPath.get(normalized)
      : fs.readFileSync(path.resolve(normalized), "utf8");
    for (const stale of KNOWN_STALE_REFERENCE_GUARDS) {
      if (stale.pattern.test(source)) findings.push({ file: normalized, reference: stale.id });
    }
  }
  return findings;
}

// Backward-compatible name for existing focused checks. The implementation
// intentionally remains a finite known-reference guard, not a general stale
// mechanism detector.
export const scanStaleSimulationReferences = scanKnownStaleSimulationReferences;

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

const TELEMETRY_CONTEXT_KEYS = new Set([
  "state", "character", "combat", "actorIdx", "targetIdx", "spellName", "itemKey",
  "currentKey", "candidateKey", "preview", "source", "charOriginalIdx", "dir",
  "itemAction", "direction"
]);

function isTelemetryImport(line) {
  return /^import\s+\{[^}]*\btrack[A-Z][A-Za-z0-9]*\b[^}]*\}\s+from\s+["'][^"']*telemetry\.js["'];?$/.test(line.trim());
}

function hasGameplayMutation(line) {
  const trimmed = line.trim();
  if (/(?:\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=|>>>=|\+\+|--)/.test(trimmed)) return true;
  return /(^|[^=!<>])=(?!=|>)/.test(trimmed);
}

function hasNestedCall(line) {
  const outerOpen = line.indexOf("(");
  return outerOpen >= 0 && line.slice(outerOpen + 1).includes("(");
}

function hasComputedPropertyKey(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character !== "]") continue;
    let next = index + 1;
    while (/\s/.test(line[next] || "")) next++;
    if (line[next] === ":") return true;
  }
  return false;
}

function hasUnsafeExpressionSyntax(line) {
  return hasComputedPropertyKey(line)
    || /\b(?:delete|new|throw|void|await|yield)\b/.test(line);
}

const SAFE_TELEMETRY_ARGUMENT_IDENTIFIERS = new Set([
  ...TELEMETRY_CONTEXT_KEYS,
  "char", "character", "combat", "currentChar", "caster", "event", "action", "run", "outcome",
  "currentItemKey", "selectedItem", "oldEq", "undefined"
]);

const SAFE_TELEMETRY_CONTEXT_PATHS = Object.freeze([
  /^state\.combatState$/,
  /^state\.party\[(?:0|equipState\.actorIdx)\]$/,
  /^state\.map\?\.\[state\.y\]\?\.\[state\.x\]\?\.event$/,
  /^preview\?\.oldEq$/,
  /^menuContext\.(?:itemKey|spellName)$/
]);

function stripQuotedContent(value) {
  let result = "";
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      result += " ";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      result += " ";
    } else {
      result += character;
    }
  }
  return result;
}

function hasUnvalidatedMemberRead(line) {
  let code = stripQuotedContent(line);
  for (const pattern of SAFE_TELEMETRY_CONTEXT_PATHS) {
    code = code.replace(new RegExp(pattern.source.replace(/^\^|\$$/g, ""), "g"), "safe_context");
  }
  return /\.\.\.|\?\.|\.[A-Za-z_$][A-Za-z0-9_$]*|\b[A-Za-z_$][A-Za-z0-9_$]*\s*\[/.test(code);
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if ("({[".includes(character)) depth++;
    else if (")}]".includes(character)) depth--;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function getCompleteCallArguments(line) {
  const open = line.indexOf("(");
  if (open < 0) return null;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = open; index < line.length; index++) {
    const character = line[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth === 0) {
        return /^;?$/.test(line.slice(index + 1).trim())
          ? line.slice(open + 1, index)
          : null;
      }
    }
  }
  return null;
}

function isSafeTelemetryArgumentExpression(expression, { allowCurrentRun = false } = {}) {
  const trimmed = expression.trim();
  if (/^(?:null|true|false|undefined|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(trimmed)) {
    return true;
  }
  if (SAFE_TELEMETRY_ARGUMENT_IDENTIFIERS.has(trimmed)) return true;
  if (allowCurrentRun && trimmed === "state.currentRun") return true;
  if (SAFE_TELEMETRY_CONTEXT_PATHS.some(pattern => pattern.test(trimmed))) return true;
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;

  const fields = splitTopLevel(trimmed.slice(1, -1));
  return fields.length > 0 && fields.every(field => {
    if (field.startsWith("...")) return false;
    const separator = field.indexOf(":");
    if (separator < 0) return TELEMETRY_CONTEXT_KEYS.has(field.trim());
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    return TELEMETRY_CONTEXT_KEYS.has(key)
      && isSafeTelemetryArgumentExpression(value);
  });
}

function hasUnsafeTelemetryArgumentSyntax(line) {
  return hasUnvalidatedMemberRead(line)
    || /=>/.test(stripQuotedContent(line));
}

function isPureContextExpression(expression) {
  const trimmed = expression.trim();
  if (/^(?:null|true|false|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(trimmed)) {
    return true;
  }
  if (SAFE_TELEMETRY_ARGUMENT_IDENTIFIERS.has(trimmed)) return true;
  return SAFE_TELEMETRY_CONTEXT_PATHS.some(pattern => pattern.test(trimmed));
}

function isTelemetryCall(line) {
  const trimmed = line.trim();
  const isRunStartCall = /^trackRunStart\s*\(/.test(trimmed);
  if (hasGameplayMutation(trimmed) || hasNestedCall(trimmed) || hasUnsafeExpressionSyntax(trimmed)) return false;
  if (hasUnsafeTelemetryArgumentSyntax(trimmed) && !isRunStartCall) return false;
  if (!/^track[A-Z][A-Za-z0-9]*\s*\([^;]*\)?;?$/.test(trimmed)) return false;

  const argumentsText = getCompleteCallArguments(trimmed);
  if (argumentsText === null) return /(?:\{|,)\s*$/.test(trimmed);
  return splitTopLevel(argumentsText).every(argument =>
    isSafeTelemetryArgumentExpression(argument, { allowCurrentRun: isRunStartCall })
  );
}

function isTelemetryContextLine(line) {
  const trimmed = line.trim();
  if (/^\}\s*,\s*state\);$/.test(trimmed) || /^\}\);$/.test(trimmed)) return true;
  if (hasGameplayMutation(trimmed) || hasNestedCall(trimmed) || hasUnsafeExpressionSyntax(trimmed)) return false;
  const withoutTrailingComma = trimmed.replace(/,\s*$/, "");
  const separator = withoutTrailingComma.indexOf(":");
  if (separator < 0) return TELEMETRY_CONTEXT_KEYS.has(withoutTrailingComma.trim());
  const key = withoutTrailingComma.slice(0, separator).trim();
  const value = withoutTrailingComma.slice(separator + 1).trim();
  return TELEMETRY_CONTEXT_KEYS.has(key) && isPureContextExpression(value);
}

function getTelemetryImportLineIndexes(lines) {
  const indexes = new Set();
  for (let index = 0; index < lines.length; index++) {
    const firstLine = lines[index].slice(1).trim();
    if (!/^import\s*\{/.test(firstLine)) continue;
    let end = index;
    while (end < lines.length && !/from\s+["'][^"']*telemetry\.js["']\s*;?$/.test(lines[end].slice(1).trim())) end++;
    if (end >= lines.length) continue;
    const importText = lines.slice(index, end + 1).map(line => line.slice(1).trim()).join(" ");
    if (/^import\s*\{\s*(?:track[A-Z][A-Za-z0-9]*\s*,?\s*)+\}\s*from\s+["'][^"']*telemetry\.js["']\s*;?$/.test(importText)) {
      for (let lineIndex = index; lineIndex <= end; lineIndex++) indexes.add(lineIndex);
      index = end;
    }
  }
  return indexes;
}

function hasGameplayStateMutation(line) {
  const code = stripQuotedContent(line);
  return /\b(?:state|character|combat)(?:(?:\?\.|\.)[A-Za-z_$][A-Za-z0-9_$]*|\s*\[[^\]]+\])+\s*(?:\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=|>>>=|\+\+|--|=(?!=|>))/.test(code);
}

function isTelemetryWrapperLine(line, file) {
  if (!new Set(["src/menu/milestone_portal.js", "src/menu/stairs_down.js"]).has(file)) return false;
  const trimmed = line.trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*\.addEventListener\("click", \(\) => \{$/.test(trimmed)
    || /^(?:triggerRunResult\([^;]*\)|closeSubmenu\(\));?$/.test(trimmed)
    || /^[A-Za-z_$][A-Za-z0-9_$]*\.addEventListener\("click", \(\) => (?:triggerRunResult|closeSubmenu)\([^;]*\);$/.test(trimmed)
    || /^[A-Za-z_$][A-Za-z0-9_$]*\.addEventListener\("click", closeSubmenu\);$/.test(trimmed)
    || /^\}\);$/.test(trimmed);
}

function isEquipTelemetrySupportLine(line) {
  const trimmed = line.trim();
  return /^(?:function getDiscardTelemetryPreview\(char, itemKey, requestedSlot\) \{|let next;|try \{|} finally \{|} catch \{|return null;|\})$/.test(trimmed)
    || /^char\.equipment\[slot\] = (?:itemKey|oldEq);$/.test(trimmed)
    || /^const next = getDisplayStats\(char\);$/.test(trimmed)
    || /^next = getDisplayStats\(char\);$/.test(trimmed)
    || /^const preview = getEquipPreview\(char, itemKey, requestedSlot\);$/.test(trimmed)
    || /^if \(!preview\) return null;$/.test(trimmed)
    || /^(?:const discardPreview = getDiscardTelemetryPreview\(|state\.party\[equipState\.actorIdx\],|expectedItemKey,|equipState\.selectedSlot|\);)$/.test(trimmed)
    || /^(?:return \{|slot: preview\.slot,|oldEq: preview\.oldEq,|primaryDiff: preview\.primaryDiff,|rows: Array\.isArray\(preview\.rows\)|: \[\],|};)$/.test(trimmed)
    || /^\? preview\.rows\.map\(\(\{ key, current, next, diff \}\) => \(\{ key, current, next, diff \}\)\),?$/.test(trimmed)
    || /^preview\.rows\.map\(\(\{ key, current, next, diff \}\) => \(\{ key, current, next, diff \}\)\)$/.test(trimmed)
    || /^\/\//.test(trimmed);
}

function isEquipTelemetrySupportHunk(lines) {
  const text = lines.map(line => line.slice(1));
  if (!text.some(line => /getDiscardTelemetryPreview|discardPreview/.test(line))) return false;
  return lines
    .filter(line => line[0] === "+" || line[0] === "-")
    .every(line => {
      const value = line.slice(1);
      return !hasGameplayStateMutation(value)
        && !/\b(?:state\.[A-Za-z_$][A-Za-z0-9_$]*\.(?:splice|push|pop)|addLog|saveAutosave|playSound|identifyEquipment)\s*\(/.test(value);
    });
}

function isTelemetryModuleImplementationLine(line) {
  const trimmed = line.trim();
  if (!trimmed || /^\/\//.test(trimmed)) return true;
  if (/^(?:export\s+)?function\s+track[A-Z][A-Za-z0-9]*\s*\(/.test(trimmed)) return true;
  if (/^track[A-Z][A-Za-z0-9]*\s*\(/.test(trimmed) && !isTelemetryCall(trimmed)) return false;
  return !hasGameplayStateMutation(trimmed);
}

function isTelemetryImplementationLine(line, file) {
  if (isTelemetryWrapperLine(line, file)) return true;
  if (file === "src/menu/milestone_portal.js" && line.trim() === 'import { state } from "../state.js";') return true;
  if (file === "src/equip.js" && isEquipTelemetrySupportLine(line)) return true;
  if (file === "src/menu/explore_actions.js" && /^state\.party\.forEach\(\(char(?:, targetIdx)?\) => \{$/.test(line.trim())) return true;
  if (file === "src/menu/explore_actions.js" && /^const itemAction =/.test(line.trim())) {
    return !hasGameplayStateMutation(line) && /menuContext\.itemKey/.test(line);
  }
  return file === "src/telemetry.js" && isTelemetryModuleImplementationLine(line);
}

function isExplorationActionImplementationLine(line) {
  const trimmed = line.trim();
  return !hasGameplayStateMutation(trimmed)
    && !/\b(?:delete|new|throw|void|await|yield)\b/.test(trimmed)
    && !/=>/.test(trimmed);
}

function isTelemetryModuleHunk(lines) {
  return lines
    .filter(line => line[0] === "+" || line[0] === "-")
    .every(line => {
      const text = line.slice(1).trim();
      if (hasGameplayStateMutation(text)) return false;
      if (/^(?:export\s+)?function\s+track[A-Z][A-Za-z0-9]*\s*\(/.test(text)) return true;
      return !(/^track[A-Z][A-Za-z0-9]*\s*\(/.test(text) && !isTelemetryCall(text));
    });
}

function isTelemetryOnlyHunk(lines, { file = null } = {}) {
  const changedLines = lines.filter(line => line[0] === "+" || line[0] === "-");
  if (changedLines.length === 0) return true;
  const hunkText = lines.map(line => line.slice(1));
  const telemetryImportLines = getTelemetryImportLineIndexes(lines);
  const telemetryModuleHunk = file === "src/telemetry.js" && isTelemetryModuleHunk(lines);
  const equipTelemetrySupportHunk = file === "src/equip.js" && isEquipTelemetrySupportHunk(lines);
  const hasTelemetryAnchor = hunkText.some(line => isTelemetryImport(line) || isTelemetryCall(line))
    || telemetryImportLines.size > 0
    || telemetryModuleHunk
    || equipTelemetrySupportHunk
    || changedLines.some(line => isTelemetryImplementationLine(line.slice(1), file));
  const hasItemActionImplementation = hunkText.some(line => /^const itemAction =/.test(line.trim()));
  if (!hasTelemetryAnchor) return false;
  if (telemetryModuleHunk) return true;
  if (equipTelemetrySupportHunk) return true;
  return changedLines.every(line => {
    const lineIndex = lines.indexOf(line);
    const text = line.slice(1);
    return telemetryImportLines.has(lineIndex)
      || isTelemetryImport(text)
      || isTelemetryCall(text)
      || isTelemetryContextLine(text)
      || isTelemetryImplementationLine(text, file)
      || (hasItemActionImplementation && isExplorationActionImplementationLine(text));
  });
}

function hasTelemetryAnchor(diff) {
  if (typeof diff !== "string") return false;
  return diff.split(/\r?\n/).some(line => {
    if (!(line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))
      || line.startsWith("+++") || line.startsWith("---")) return false;
    const text = line.slice(1);
    return isTelemetryImport(text) || /\btrack[A-Z][A-Za-z0-9]*\s*\(/.test(text);
  });
}

function hasChangedTelemetryAnchor(diff) {
  if (typeof diff !== "string") return false;
  return diff.split(/\r?\n/).some(line => {
    if (!(line.startsWith("+") || line.startsWith("-"))
      || line.startsWith("+++") || line.startsWith("---")) return false;
    const text = line.slice(1);
    return isTelemetryImport(text) || /\btrack[A-Z][A-Za-z0-9]*\s*\(/.test(text);
  });
}

function getBalanceImpactNoneDeclaration(diff, file, manifest) {
  if (typeof diff !== "string" || !diff.trim()) return false;
  return (manifest.balanceImpactNoneDiffs || []).find(declaration =>
    matches(declaration.pattern, file) && diff.split(/\r?\n/).some(line =>
      line.startsWith("+") && !line.startsWith("+++") && isStandaloneBalanceImpactNoneDeclaration(line.slice(1), declaration)
    )
  ) || null;
}

function getDeclaredBoundaryDiff(diff, declaration) {
  if (!declaration || typeof diff !== "string") return diff;
  const segments = diff.split(/(?=^diff --git )/m);
  const matchingSegments = segments.filter(segment => segment.split(/\r?\n/).some(line =>
    line.startsWith("+") && !line.startsWith("+++") && isStandaloneBalanceImpactNoneDeclaration(line.slice(1), declaration)
  ));
  return matchingSegments.length > 0 ? matchingSegments.join("\n") : diff;
}

function isStandaloneBalanceImpactNoneDeclaration(text, declaration) {
  const trimmed = text.trim();
  const marker = declaration.marker.trim();
  return trimmed === marker ||
    trimmed.startsWith(`${marker} —`) ||
    trimmed.startsWith(`${marker} -`);
}

const PRESENTATION_BOUNDARY_CALL = /^(?:addLog|playSound|openGuardedSubmenu)\s*\(/;

function hasOnlyPresentationChanges(diff, file) {
  if (file !== "src/movement.js" || typeof diff !== "string") return false;
  return diff.split(/\r?\n/).filter(line =>
    (line.startsWith("+") || line.startsWith("-")) &&
    !line.startsWith("+++") && !line.startsWith("---")
  ).map(line => line.slice(1).trim()).every(text =>
    !text || text.startsWith("//") || text === "return;" ||
    PRESENTATION_BOUNDARY_CALL.test(text)
  );
}

const STATE_BOUNDARY_ROOTS = /\b(?:state\.(?:chestState|gameState|transitioning)|menuContext|menuHistory)\b/;
const STATE_ROOT_ACCESS = /\bstate\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
const ALLOWED_STATE_ROOTS = new Set(["chestState", "gameState", "transitioning"]);
const ARRAY_MUTATOR_CALL = /\.\s*(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\s*\(/;
const BALANCE_MUTATOR_CALL = /\b(?:award|grant|give|add|remove|consume|refund|credit|debit|roll|resolve|trigger|apply|drop|loot|reward|trap|economy|material|currency|inventory|equipment|item|ticket|chestReward)\w*\s*\(/i;
const BOUNDARY_COMPUTED_ACCESS = /\b(?:state\.(?:chestState|gameState|transitioning)|chest|menuContext|menuHistory)\s*\[/;
const AGGREGATE_MUTATOR_CALL = /\b(?:Object\.(?:assign|defineProperty|defineProperties|setPrototypeOf)|Reflect\.(?:set|defineProperty|defineProperties))\s*\(/;
const COMPUTED_AGGREGATE_ACCESS = /\b(?:Object|Reflect)\s*\[/;
const BOUNDARY_CALL_ROOT = /\b(?:state\.(?:chestState|gameState|transitioning)|chest|menuContext|menuHistory)\b/;
const CALL_EXPRESSION = /\b(?:[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*)?[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\?\.)?\s*\(/g;
const CONTROL_KEYWORDS = new Set(["if", "while", "switch", "for", "catch"]);
const KNOWN_BOUNDARY_CALLS = new Set([
  "transitionChestPhase", "getChestPhase", "chestActionAllowed",
  "clearChestInspectionState", "finishChest", "isUsableCombatScreen",
  "hasUsableCombatActor", "isUsableSpellForActor", "getScreenViewState",
  "bindCombatCallback"
]);
const STATE_BOUNDARY_HELPERS = /\b(?:CHEST_PHASES|CHEST_PHASE_TRANSITIONS|transitionChestPhase|getChestPhase|chestActionAllowed|isEligibleChestCharacter|clearChestInspectionState|finishChest|openChestMenu|executeDisarm|smashChest|openChestDirectly)\b/;
const STATE_BOUNDARY_LOCALS = /\b(?:currentPhase|allowedPhases|persistedChestState|recordAction|allowTransition|fromDisarm|smashTrapFired)\b/;
const STATE_BOUNDARY_PROPERTIES = new Set([
  "phase", "fromDrop", "smashTelemetry", "inspected", "identifiedTrap", "inspectChance"
]);
const LITERAL_ONLY_DECLARATION = /^(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:"\s*"|'\s*'|`\s*`|\/\s*\/[A-Za-z]*)\s*;?$/;

function isCombatBoundaryLine(text, file) {
  if (file !== "src/combat_ui/round_runner.js") return false;
  const trimmed = text.trim();
  if (/^import \{[^}]+\} from "\.\.\/state\/view_state\.js";$/.test(trimmed)) {
    const importedNames = trimmed.slice(trimmed.indexOf("{") + 1, trimmed.indexOf("}"))
      .split(",").map(name => name.trim()).filter(Boolean);
    return importedNames.every(name => ["hasCombatRoundActor", "hasUsableCombatActor", "isUsableCombatScreen", "isUsableSpellForActor"].includes(name));
  }
  return new Set([
    'import { isUsableCombatScreen } from "../state/view_state.js";',
    "if (!isUsableCombatScreen(state, menuContext)) return;",
    'if (state.combatState?.phase !== "choose_actions" || !hasUsableCombatActor(state.party)) return;',
    'if (state.transitioning || !isUsableCombatScreen(state, menuContext) ||',
    '      state.combatState?.phase !== "choose_actions" || !hasCombatRoundActor(state.party)) return;',
    'state.combatState?.phase !== "choose_actions" || !hasCombatRoundActor(state.party)) return;',
    'state.party = nextState.party.slice(0, 1);',
    'state.party = nextState.party;'
  ]).has(trimmed)
    || /^state\.combatState\?\.phase !== "choose_actions" \|\| !hasUsableCombatActor\(state\.party\)\) return;$/.test(trimmed);
}

const CALLBACK_CONTEXT_BOUNDARY_FILES = new Set([
  "src/combat_ui/combat_state.js",
  "src/combat_ui/item_menu.js",
  "src/combat_ui/target_menu.js"
]);

function isCallbackContextBoundaryLine(text, file) {
  if (!CALLBACK_CONTEXT_BOUNDARY_FILES.has(file)) return false;
  const trimmed = text.trim();
  if (/^import\s/.test(trimmed) || trimmed.startsWith("//")) return true;
  // Keep the declaration diff-aware: gameplay mutations and telemetry still
  // disqualify a callback-context exemption below.
  if (BALANCE_MUTATOR_CALL.test(trimmed) || /\bstate\.(?!party\b)|\b(?:currentRun|materials|inventory|track[A-Z])\b/.test(trimmed)) return false;
  return true;
}

function isAllowedStateBoundaryLine(text, file) {
  if (!text || text.startsWith("//")) return true;
  const classificationText = maskLiteralsAndNormalizeComments(text);
  if (isCombatBoundaryLine(text, file)) return true;
  if (isCallbackContextBoundaryLine(text, file)) return true;
  if (LITERAL_ONLY_DECLARATION.test(classificationText)) return true;
  if (file === "src/state/save_payload.js" && /^import\s+\{[^}]*\bmenuContext\b[^}]*\bmenuHistory\b/.test(classificationText)) return true;
  if (ARRAY_MUTATOR_CALL.test(classificationText)) return false;
  if (BALANCE_MUTATOR_CALL.test(classificationText)) return false;
  if (BOUNDARY_COMPUTED_ACCESS.test(classificationText)) return false;
  if (AGGREGATE_MUTATOR_CALL.test(classificationText)) return false;
  if (COMPUTED_AGGREGATE_ACCESS.test(classificationText)) return false;
  if (/^(?:state\.party\.includes\((?:char|opener)\)\s*&&|if \(options\.fromDisarm === true && !state\.party\.includes\(opener\)\) return false;)$/.test(classificationText)) return true;
  if ([...classificationText.matchAll(STATE_ROOT_ACCESS)].some(([, root]) => !ALLOWED_STATE_ROOTS.has(root))) return false;
  if (/^\["ok",\s*"poisoned",\s*"blind"\]\.includes\(char\.status\)$/.test(text)) return true;
  if (/^(?:MENU|DISARM_SELECT|OPEN_SELECT|RESOLVING|REWARD|TERMINAL):\s*"[a-z_]+",?$/.test(text)) return true;
  if (/^smash:\s*true,?$/.test(classificationText)) return true;
  if (/^:\s*(?:null|state\.chestState)/.test(classificationText)) return true;
  if (/^(?:if|while|switch)\s*\($/.test(classificationText)) return true;
  if (/^\)\s*return\s+(?:false|true|undefined);$/.test(classificationText)) return true;
  if (/^(?:char\s*&&|return\s+Boolean\(|[{}),;]+|return(?:\s+(?:true|false|undefined))?;?)$/.test(classificationText)) return true;
  if (file === "src/state/save_payload.js" && /^\?\s*\{\s*\.\.\.data\.chestState,\s*phase:\s*"menu"\s*\}$/.test(text)) return true;
  if (/^(?:delete\s+)?chest\.(?:phase|inspected|identifiedTrap|inspectChance)\b/.test(classificationText)) return true;
  if (/^const\s+(?:currentPhase|allowedPhases|persistedChestState)\b/.test(classificationText)) return true;
  if ((STATE_BOUNDARY_LOCALS.test(classificationText) || STATE_BOUNDARY_HELPERS.test(classificationText)) && !/\bstate\./.test(classificationText)) return true;
  if (STATE_BOUNDARY_ROOTS.test(classificationText)) {
    const chestStateAccesses = [...classificationText.matchAll(/\bstate\.chestState(?:\?\.|\.)([A-Za-z_$][A-Za-z0-9_$]*)/g)];
    if (chestStateAccesses.some(([, property]) => !STATE_BOUNDARY_PROPERTIES.has(property))) return false;
    const localChestAccesses = [...classificationText.matchAll(/\bchest\.([A-Za-z_$][A-Za-z0-9_$]*)/g)];
    if (localChestAccesses.some(([, property]) => !STATE_BOUNDARY_PROPERTIES.has(property))) return false;
    return true;
  }
  return false;
}

function getChangedCodeBlocks(diff) {
  const blocks = [];
  let block = [];
  const flush = () => {
    if (block.length > 0) blocks.push(block.join(" "));
    block = [];
  };
  for (const line of diff.split(/\r?\n/)) {
    if (!(line.startsWith("+") || line.startsWith("-")) || line.startsWith("+++") || line.startsWith("---")) {
      flush();
      continue;
    }
    const text = line.slice(1).trim();
    if (!text || text.startsWith("//")) {
      flush();
      continue;
    }
    block.push(text);
  }
  flush();
  return blocks;
}

function maskLiteralsAndNormalizeComments(text) {
  const maskCharacter = char => char === "\n" ? "\n" : " ";
  let processCode;

  const maskQuotedLiteral = (start, quote) => {
    let result = quote;
    let escaped = false;
    let index = start + 1;
    while (index < text.length) {
      const char = text[index];
      result += maskCharacter(char);
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        result += quote;
        index += 1;
        break;
      }
      index += 1;
    }
    return { result, index };
  };

  const regexCanStart = code => {
    const trimmed = code.trimEnd();
    if (!trimmed) return true;
    if (/[=(:,!&|?{}\[\];+\-*%^~<>]$/.test(trimmed)) return true;
    return /(?:^|\s)(?:return|throw|case|delete|void|typeof|in|of)$/.test(trimmed);
  };

  const maskRegexLiteral = start => {
    let result = "/";
    let escaped = false;
    let inCharacterClass = false;
    let index = start + 1;
    while (index < text.length) {
      const char = text[index];
      if (escaped) {
        result += maskCharacter(char);
        escaped = false;
      } else if (char === "\\") {
        result += " ";
        escaped = true;
      } else if (char === "[" && !inCharacterClass) {
        result += " ";
        inCharacterClass = true;
      } else if (char === "]" && inCharacterClass) {
        result += " ";
        inCharacterClass = false;
      } else if (char === "/" && !inCharacterClass) {
        result += "/";
        index += 1;
        while (index < text.length && /[A-Za-z]/.test(text[index])) {
          result += text[index];
          index += 1;
        }
        break;
      } else {
        result += maskCharacter(char);
      }
      index += 1;
    }
    return { result, index };
  };

  const maskTemplateLiteral = start => {
    let result = "`";
    let escaped = false;
    let index = start + 1;
    while (index < text.length) {
      const char = text[index];
      const next = text[index + 1];
      if (escaped) {
        result += maskCharacter(char);
        escaped = false;
        index += 1;
        continue;
      }
      if (char === "\\") {
        result += " ";
        escaped = true;
        index += 1;
        continue;
      }
      if (char === "`") {
        result += "`";
        return { result, index: index + 1 };
      }
      if (char === "$" && next === "{") {
        const expression = processCode(index + 2, true);
        result += "${" + expression.result;
        index = expression.index;
        if (text[index] === "}") {
          result += "}";
          index += 1;
        }
        continue;
      }
      result += maskCharacter(char);
      index += 1;
    }
    return { result, index };
  };

  processCode = (start, stopAtBrace = false) => {
    let result = "";
    let braceDepth = 0;
    let index = start;
    while (index < text.length) {
      const char = text[index];
      const next = text[index + 1];
      if (stopAtBrace && char === "}" && braceDepth === 0) return { result, index };
      if (char === "{") {
        braceDepth += 1;
        result += char;
        index += 1;
        continue;
      }
      if (char === "}") {
        braceDepth -= 1;
        result += char;
        index += 1;
        continue;
      }
      if (char === "/" && next === "/") {
        result += " ";
        index += 2;
        while (index < text.length && text[index] !== "\n") index += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        result += " ";
        index += 2;
        while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
          result += maskCharacter(text[index]);
          index += 1;
        }
        index += 2;
        continue;
      }
      if (char === "\"" || char === "'") {
        const literal = maskQuotedLiteral(index, char);
        result += literal.result;
        index = literal.index;
        continue;
      }
      if (char === "`") {
        const literal = maskTemplateLiteral(index);
        result += literal.result;
        index = literal.index;
        continue;
      }
      if (char === "/" && regexCanStart(result)) {
        const literal = maskRegexLiteral(index);
        result += literal.result;
        index = literal.index;
        continue;
      }
      result += char;
      index += 1;
    }
    return { result, index };
  };

  return processCode(0).result;
}

function hasUnrecognizedBoundaryCall(block) {
  const normalizedBlock = maskLiteralsAndNormalizeComments(block);
  for (const match of normalizedBlock.matchAll(CALL_EXPRESSION)) {
    const fullMatch = match[0];
    const callName = fullMatch.slice(0, fullMatch.lastIndexOf("(")).replace(/\s/g, "").replace(/\?\.$/, "").split(".").pop();
    if (CONTROL_KEYWORDS.has(callName)) continue;
    const openIndex = match.index + fullMatch.lastIndexOf("(");
    let depth = 0;
    let quote = null;
    let escaped = false;
    let hasDirectBoundaryRoot = false;
    for (let index = openIndex; index < normalizedBlock.length; index += 1) {
      const char = normalizedBlock[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
        continue;
      }
      const boundaryAtCurrent = normalizedBlock.slice(index).match(BOUNDARY_CALL_ROOT);
      if (depth === 1 && boundaryAtCurrent?.index === 0) {
        hasDirectBoundaryRoot = true;
        break;
      }
    }
    if (hasDirectBoundaryRoot && !KNOWN_BOUNDARY_CALLS.has(callName)) return true;
  }
  return false;
}

function getNonBoundaryStateDiffLine(diff, file) {
  if (typeof diff !== "string" || !diff.trim()) return false;
  const nonBoundaryLine = diff.split(/\r?\n/).filter(line =>
    (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")
  ).map(line => line.slice(1).trim()).find(text => !isAllowedStateBoundaryLine(text, file));
  if (nonBoundaryLine) return nonBoundaryLine;
  const unsafeBlock = getChangedCodeBlocks(diff).find(hasUnrecognizedBoundaryCall);
  return unsafeBlock || null;
}

function hasOnlyStateBoundaryChanges(diff, file) {
  return getNonBoundaryStateDiffLine(diff, file) === null;
}

export function isTelemetryOnlyDiff(diff, { file = null } = {}) {
  if (typeof diff !== "string" || !diff.trim()) return false;
  const hunks = [];
  let currentHunk = null;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      currentHunk = { lines: [], header: line };
      hunks.push(currentHunk);
      continue;
    }
    if (currentHunk && !line.startsWith("+++") && !line.startsWith("---")
      && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      currentHunk.lines.push(line);
    }
  }
  return hunks.length > 0 && hunks.every(hunk => isTelemetryOnlyHunk(hunk.lines, { file }));
}

function getChangedDiff(file, baseRef = process.env.BASE_REF || "origin/main") {
  const diffs = [];
  for (const args of [
    ["diff", "--function-context", `${baseRef}...HEAD`, "--", file],
    ["diff", "--function-context", "--", file],
    ["diff", "--cached", "--function-context", "--", file]
  ]) {
    try {
      const output = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (output.trim()) diffs.push(output);
    } catch {
      // Missing base refs or an empty optional diff must not create an exemption.
    }
  }
  return diffs.join("\n");
}

export function analyzeBalanceImpact(
  changedFiles,
  manifest = SIMULATION_MANIFEST,
  runtimeResult = undefined,
  { diffByFile = null, baseRef = process.env.BASE_REF || "origin/main" } = {}
) {
  const impacts = [];
  const errors = [];
  const modelDomains = manifest.canonical?.modelDomains || [];
  const runtimeCoverage = manifest.canonical?.runtimeCoverage || {};
  const runtimeDomains = runtimeResult === undefined
    ? null
    : evaluateRuntimeDomainCoverage(runtimeResult, manifest);
  for (const rawFile of changedFiles) {
    const file = normalizePath(rawFile);
    if (!file.startsWith("src/")) continue;
    const diff = diffByFile instanceof Map ? diffByFile.get(file) : diffByFile?.[file] ?? getChangedDiff(file, baseRef);
    const balanceRule = (manifest.balanceImpactPaths || []).find(rule => matches(rule.pattern, file));
    const balanceImpactNone = !balanceRule &&
      (manifest.balanceImpactNone || []).some(pattern => matches(pattern, file));
    const telemetryOnlyPath = (manifest.telemetryOnlyPaths || []).some(pattern => matches(pattern, file));
    const balanceImpactNoneDiff = getBalanceImpactNoneDeclaration(diff, file, manifest);
    const declaredBoundaryDiff = getDeclaredBoundaryDiff(diff, balanceImpactNoneDiff);
    const hasAllowedPresentationChanges = balanceImpactNoneDiff?.kind === "presentation" &&
      hasOnlyPresentationChanges(declaredBoundaryDiff, file);
    if (balanceImpactNoneDiff && !hasAllowedPresentationChanges &&
        !hasOnlyStateBoundaryChanges(declaredBoundaryDiff, file)) {
      const line = getNonBoundaryStateDiffLine(declaredBoundaryDiff, file);
      errors.push(`${file}: balance-impact none declaration contains a non-boundary diff line (${JSON.stringify(line)}); use normal balance mapping`);
      continue;
    } else if (balanceImpactNoneDiff && (hasAllowedPresentationChanges ||
        hasOnlyStateBoundaryChanges(declaredBoundaryDiff, file))) {
      impacts.push({ file, domains: [], balanceImpactNone: true, runtimeUnsupported: [], runtimeUnfired: [] });
      continue;
    }
    if (!balanceRule && !balanceImpactNone && !telemetryOnlyPath) {
      errors.push(`${file}: unknown production path; declare balance-impact domains or explicit balance-impact: none`);
      continue;
    }
    const telemetryOnly = isTelemetryOnlyDiff(diff, { file });
    // Context-only telemetry calls in a no-impact path are not a changed
    // telemetry anchor; newly added telemetry remains subject to this gate.
    const telemetryAnchor = balanceImpactNone ? hasChangedTelemetryAnchor(diff) : hasTelemetryAnchor(diff);
    const telemetryGameplayPath = (manifest.telemetryGameplayPaths || [])
      .some(pattern => matches(pattern, file));
    if (telemetryAnchor && !telemetryOnly && !telemetryGameplayPath) {
      errors.push(`${file}: telemetry anchor mixed with non-telemetry changes; classify the gameplay impact explicitly`);
      continue;
    }
    if (telemetryOnly && (balanceRule || telemetryOnlyPath)) {
      impacts.push({ file, domains: [], telemetryOnly: true, runtimeUnsupported: [], runtimeUnfired: [] });
      continue;
    }
    if (balanceRule) {
      const domains = [...new Set(balanceRule.domains || [])];
      const uncovered = domains.filter(domain => !modelDomains.includes(domain));
      const unsupported = domains.filter(domain => !Object.hasOwn(runtimeCoverage, domain));
      const unfired = runtimeDomains
        ? domains.filter(domain => Object.hasOwn(runtimeCoverage, domain) && !runtimeDomains[domain].fired)
        : [];
      impacts.push({ file, domains, uncovered, runtimeUnsupported: unsupported, runtimeUnfired: unfired });
      if (uncovered.length > 0) errors.push(`${file}: balance domains not covered by canonical model: ${uncovered.join(", ")}`);
      if (unsupported.length > 0) errors.push(`${file}: balance domains have no declared runtime evidence: ${unsupported.join(", ")}`);
      if (runtimeResult === undefined && unsupported.length < domains.length) {
        errors.push(`${file}: canonical runtime evidence result is required for supported domains`);
      }
      if (unfired.length > 0) errors.push(`${file}: declared runtime evidence did not fire: ${unfired.join(", ")}`);
      continue;
    }
    if (balanceImpactNone) continue;
    errors.push(`${file}: telemetry-only path contains non-telemetry changes; classify the gameplay impact explicitly`);
  }
  return { impacts, errors };
}

export function assertBalanceImpactCovered(
  changedFiles,
  manifest = SIMULATION_MANIFEST,
  runtimeResult = undefined,
  options = undefined
) {
  const report = analyzeBalanceImpact(changedFiles, manifest, runtimeResult, options);
  if (report.errors.length > 0) throw new Error(`balance impact coverage gate failed: ${report.errors.join("; ")}`);
  return report;
}
