// sim-scope: run — fixed B1F combat diagnostic for equipment-load initiative
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDefaultCodex, createDefaultCurrentRun, createStartingKitCharacter } from "../../src/state/initial_state.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import { getCharAffixSum, getItemData } from "../../src/rules/item_rules.js";
import { getCharDef, getCharDerivedStats, getCharMaxHp, getCharMaxMp } from "../../src/rules/character_stats.js";
import { runCombatRoundCalculation } from "../../src/combat_logic.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1161-equipment-load-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 500;
export const DEFAULT_SEED = 1161;
export const MAX_ROUNDS = 40;
export const MODEL_IDS = Object.freeze(["production-baseline", "shared-roll-load-counterfactual"]);
export const FIRST_STRIKE_PROFILES = Object.freeze([
  Object.freeze({ id: "none", value: 0, accessory: null }),
  Object.freeze({ id: "small", value: 5, accessory: "SWIFT_BAND" }),
  // The +5 extension is deliberately a measurement-only sensitivity point;
  // no new production item or final affix value is introduced by this runner.
  Object.freeze({ id: "large", value: 10, accessory: "SWIFT_BAND", extra: 5 })
]);
export const ACTION_POLICIES = Object.freeze(["fight", "guard", "flee"]);
export const LOADOUTS = Object.freeze([
  Object.freeze({ id: "light", label: "軽装", weapon: "DAGGER", shield: "BUCKLER", armor: "EXPLORER_CLOAK", loadModifier: 3 }),
  Object.freeze({ id: "standard", label: "標準", weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR", loadModifier: 0 }),
  Object.freeze({ id: "heavy", label: "重装", weapon: "MACE", shield: "KNIGHT_SHIELD", armor: "PLATE_MAIL", loadModifier: -3 })
]);
export const CONTROL_LOADOUTS = Object.freeze([
  Object.freeze({ id: "light-fixed-defense", label: "軽負荷（防御固定）", weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR", loadModifier: 3, controlledDefense: true }),
  Object.freeze({ id: "standard-fixed-defense", label: "標準負荷（防御固定）", weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR", loadModifier: 0, controlledDefense: true }),
  Object.freeze({ id: "heavy-fixed-defense", label: "重負荷（防御固定）", weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR", loadModifier: -3, controlledDefense: true })
]);
export const ALL_LOADOUTS = Object.freeze([...LOADOUTS, ...CONTROL_LOADOUTS]);

// These are the six representative two-enemy pairs from #1151. The single
// and three-enemy cases reuse the same production monster identities.
export const COMPOSITIONS = Object.freeze([
  Object.freeze({ id: "single-kobold-scout", enemyCount: 1, risk: "high", names: ["コボルトの斥候"] }),
  Object.freeze({ id: "single-swarm-rat", enemyCount: 1, risk: "low", names: ["群れネズミ"] }),
  Object.freeze({ id: "high-kobold-scout-rusted-shield", enemyCount: 2, risk: "high", names: ["コボルトの斥候", "錆びた盾兵"] }),
  Object.freeze({ id: "high-kobold-scout-mad-slime", enemyCount: 2, risk: "high", names: ["コボルトの斥候", "マッドスライム"] }),
  Object.freeze({ id: "high-mad-slime-mud-curse-child", enemyCount: 2, risk: "high", names: ["マッドスライム", "泥の呪い子"] }),
  Object.freeze({ id: "low-swarm-rat-rusted-shield", enemyCount: 2, risk: "low", names: ["群れネズミ", "錆びた盾兵"] }),
  Object.freeze({ id: "low-biting-insect-split-slime", enemyCount: 2, risk: "low", names: ["かみつき蟲", "分裂スライム"] }),
  Object.freeze({ id: "low-mud-curse-child-gunpowder-bat", enemyCount: 2, risk: "low", names: ["泥の呪い子", "火薬コウモリ"] }),
  Object.freeze({ id: "triple-high", enemyCount: 3, risk: "high", names: ["コボルトの斥候", "錆びた盾兵", "マッドスライム"] }),
  Object.freeze({ id: "triple-low", enemyCount: 3, risk: "low", names: ["群れネズミ", "かみつき蟲", "火薬コウモリ"] })
]);

const PRODUCTION_PATHS = Object.freeze([
  "src/combat_logic/round.js", "src/combat_logic/damage.js", "src/combat_logic/rewards.js",
  "src/data/items.js", "src/data/monsters.js", "src/rules/character_stats.js",
  "src/rules/depth_scaling.js", "src/rules/item_rules.js", "src/state/initial_state.js"
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  return parsed;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeed(seed, callback) {
  const originalRandom = Math.random;
  Math.random = createRng(seed);
  try { return callback(); } finally { Math.random = originalRandom; }
}

export function buildCaseSeed(seed, compositionId, runIndex) {
  return `issue-1161:${seed}:${compositionId}:${runIndex}`;
}

function wilson(successes, trials) {
  if (!trials) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return [(centre - spread) / denominator, (centre + spread) / denominator];
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return { count: 0, mean: null, p50: null, p95: null };
  const percentile = rate => {
    const position = (sorted.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, p50: percentile(0.5), p95: percentile(0.95) };
}

function createCharacter(loadout, firstStrike) {
  const character = createStartingKitCharacter("vanguard");
  character.startingKit = null;
  character.equipment = {
    weapon: loadout.weapon, shield: loadout.shield, armor: loadout.armor,
    accessory: firstStrike.accessory, accessory2: null
  };
  return character;
}

function createMonsters(composition) {
  return composition.names.map(name => {
    const template = MONSTERS.find(monster => monster.name === name);
    if (!template) throw new Error(`unknown production monster: ${name}`);
    return scaleEnemyForDepth(template, 1);
  });
}

function createState(loadout, firstStrike, composition, model, runSeed) {
  const character = createCharacter(loadout, firstStrike);
  character.hp = getCharMaxHp(character);
  character.mp = getCharMaxMp(character);
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = 1;
  currentRun.deepestFloor = 1;
  return {
    party: [character],
    combatState: {
      monsters: createMonsters(composition), roundNumber: 1, phase: "choose_actions",
      isBoss: false, isMidboss: false, isRoamingFlack: false, retreatPosition: null, allParalyzedTurns: 0
    },
    inventory: [], firstKills: [], codex: createDefaultCodex(), currentRun,
    metaMaterials: {}, roamingMonsters: [], floorChestsTotal: [], floor: 1,
    simPolicy: model === "shared-roll-load-counterfactual"
      ? { measurementInitiative: { rollSize: 20, playerLoadModifier: loadout.loadModifier, playerFirstStrikeModifier: firstStrike.extra || 0, enemySpeedModifier: 0 } }
      : {}
  };
}

function getAction(policy, round) {
  if (policy === "flee") return { type: "run", actorIdx: 0 };
  if (policy === "guard" && round === 1) return { type: "defend", actorIdx: 0 };
  return { type: "fight", actorIdx: 0, targetIdx: 0 };
}

function resolveTrial({ loadout, firstStrike, composition, model, policy, seed }) {
  let state = createState(loadout, firstStrike, composition, model, seed);
  const initialHp = state.party[0].hp;
  const observations = [];
  let rounds = 0;
  let totalEnemyActions = 0;
  let totalDamage = 0;
  let firstAction = null;
  while (rounds < MAX_ROUNDS) {
    const action = getAction(policy, rounds + 1);
    const hpBefore = state.party[0].hp;
    const result = runCombatRoundCalculation(state, { actions: [action] });
    const actionObservations = result.actionObservations || [];
    observations.push(...actionObservations);
    totalEnemyActions += actionObservations.filter(item => item.actor === "monster" && item.executed).length;
    state = result.state;
    totalDamage += Math.max(0, hpBefore - state.party[0].hp);
    rounds++;
    if (!firstAction && rounds === 1) firstAction = actionObservations.find(item => item.actor === "char" && item.actionType === action.type) || null;
    const escaped = result.logQueue.some(entry => entry.runEscape === true);
    const dead = state.party[0].status === "dead" || state.party[0].hp <= 0;
    if (dead || escaped || state.combatState.monsters.every(monster => monster.hp <= 0)) break;
  }
  const dead = state.party[0].status === "dead" || state.party[0].hp <= 0;
  const escaped = observations.some(item => item.actor === "char" && item.actionType === "run" && item.executed) && !state.combatState.monsters.every(monster => monster.hp <= 0);
  const outcome = dead ? "death" : escaped ? "flee" : state.combatState.monsters.every(monster => monster.hp <= 0) ? "victory" : "stalemate";
  const firstEnemyOrder = observations.find(item => item.actor === "monster" && item.executed)?.order ?? null;
  const firstActionExecuted = Boolean(firstAction?.executed);
  const firstActionTiming = !firstActionExecuted ? "not-executed-before-end" : firstEnemyOrder !== null && firstEnemyOrder < firstAction.order ? "after-enemy-action" : "player-before-any-enemy";
  return {
    outcome, rounds, totalEnemyActions, totalDamage, firstActionTiming, firstActionExecuted,
    firstActionHpBeforeExecution: firstAction?.hpBeforeExecution ?? null,
    firstActionPreExecutionDamage: firstAction?.hpBeforeExecution === null || firstAction?.hpBeforeExecution === undefined ? null : Math.max(0, initialHp - firstAction.hpBeforeExecution),
    hpAfter: state.party[0].hp, initialHp,
    fleeSelected: policy === "flee", fleeExecuted: policy === "flee" && firstActionExecuted,
    fleeSurvived: policy === "flee" && outcome === "flee"
  };
}

function createAccumulator(metadata) {
  return { ...metadata, outcomes: {}, firstActionTiming: {}, clear: 0, death: 0, fleeSelected: 0, fleeExecuted: 0, fleeSurvived: 0, firstActionExecuted: 0, firstActionPreExecutionDamage: [], totalDamage: [], rounds: [], enemyActions: [], hpAfterClear: [] };
}

function observe(accumulator, trial) {
  accumulator.outcomes[trial.outcome] = (accumulator.outcomes[trial.outcome] || 0) + 1;
  accumulator.clear += Number(trial.outcome === "victory");
  accumulator.death += Number(trial.outcome === "death");
  accumulator.fleeSelected += Number(trial.fleeSelected);
  accumulator.fleeExecuted += Number(trial.fleeExecuted);
  accumulator.fleeSurvived += Number(trial.fleeSurvived);
  accumulator.firstActionExecuted += Number(trial.firstActionExecuted);
  accumulator.firstActionTiming[trial.firstActionTiming] = (accumulator.firstActionTiming[trial.firstActionTiming] || 0) + 1;
  if (trial.firstActionPreExecutionDamage !== null) accumulator.firstActionPreExecutionDamage.push(trial.firstActionPreExecutionDamage);
  accumulator.totalDamage.push(trial.totalDamage);
  accumulator.rounds.push(trial.rounds);
  accumulator.enemyActions.push(trial.totalEnemyActions);
  if (trial.outcome === "victory") accumulator.hpAfterClear.push(trial.hpAfter);
}

function finalize(accumulator, runs) {
  return {
    ...accumulator, runs,
    clearRate: accumulator.clear / runs, clearRate95Ci: wilson(accumulator.clear, runs),
    deathRate: accumulator.death / runs, deathRate95Ci: wilson(accumulator.death, runs),
    firstActionRate: accumulator.firstActionExecuted / runs, firstActionRate95Ci: wilson(accumulator.firstActionExecuted, runs),
    fleeSelected: accumulator.fleeSelected,
    fleeExecutionRate: accumulator.fleeExecuted / runs,
    fleeSurvivalRate: accumulator.fleeExecuted ? accumulator.fleeSurvived / accumulator.fleeExecuted : null,
    damage: summarize(accumulator.totalDamage), rounds: summarize(accumulator.rounds),
    enemyActions: summarize(accumulator.enemyActions), firstActionPreExecutionDamage: summarize(accumulator.firstActionPreExecutionDamage),
    hpAfterClear: summarize(accumulator.hpAfterClear)
  };
}

export function runEquipmentLoadDiagnostic({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED, allowSmallRunCount = false } = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : DEFAULT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const cases = [];
  for (const model of MODEL_IDS) for (const loadout of ALL_LOADOUTS) for (const firstStrike of FIRST_STRIKE_PROFILES) for (const composition of COMPOSITIONS) for (const policy of ACTION_POLICIES) {
    const accumulator = createAccumulator({ model, loadoutId: loadout.id, firstStrikeProfileId: firstStrike.id, firstStrikeValue: firstStrike.value, compositionId: composition.id, enemyCount: composition.enemyCount, risk: composition.risk, policy });
    for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
      const caseSeed = buildCaseSeed(normalizedSeed, composition.id, runIndex);
      const trial = withSeed(caseSeed, () => resolveTrial({ loadout, firstStrike, composition, model, policy, seed: caseSeed }));
      observe(accumulator, trial);
    }
    cases.push(finalize(accumulator, normalizedRuns));
  }
  return {
    schemaVersion: SCHEMA_VERSION, runnerVersion: RUNNER_VERSION,
    question: "装備負荷を共通ロールへ加えたとき、先手によるCost回避と防御・Guardによる受け止めが分かれるか",
    evidenceScope: "run",
    configuration: {
      floor: 1, runs: normalizedRuns, seed: normalizedSeed,
      seedPolicy: "matched deterministic stream per composition/runIndex; shared across model/loadout/firstStrike/policy",
      models: [...MODEL_IDS],
      loadouts: ALL_LOADOUTS.map(loadout => {
        const character = createCharacter(loadout, FIRST_STRIKE_PROFILES[0]);
        const shield = getItemData(loadout.shield);
        return {
          ...loadout,
          defense: getCharDef(character),
          guardProfile: shield?.guardProfile || null,
          firstStrikeFromGear: getCharAffixSum(character, "firstStrike"),
          derivedStats: getCharDerivedStats(character, { floor: 1 })
        };
      }),
      firstStrikeProfiles: FIRST_STRIKE_PROFILES.map(({ id, value, accessory, extra = 0 }) => ({ id, value, accessory, extra })),
      actionPolicies: [...ACTION_POLICIES], compositions: COMPOSITIONS.map(composition => ({ ...composition })),
      productionMonsterScaling: "scaleEnemyForDepth at B1F",
      combatResolver: "runCombatRoundCalculation",
      baselineInitiative: "player floor(random*10)+firstStrike; enemy 10+floor(random*10)",
      counterfactualInitiative: "each actor floor(random*20)+actor modifier; player modifier=loadModifier+firstStrike",
      bagWeight: "not modeled; inventory is empty and load modifier comes only from equipped loadout",
      startingKitOrClassIdentity: "not used; universal character baseline is stripped of startingKit after construction",
      omitted: ["generated map traversal and encounter frequency", "manual UI input", "enemy speed identity distribution", "production balance tuning"]
    }, cases
  };
}

function renderRate(value) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }

function buildSummary(report) {
  const rows = report.cases.filter(item => item.compositionId === "high-kobold-scout-rusted-shield" && item.policy === "fight");
  const lines = [
    "# Equipment-load initiative diagnostic (#1161)", "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement?.sourceCommit || "not recorded"}\``,
    `- B1F fixed combat; N=${report.configuration.runs}; seed=${report.configuration.seed}`,
    "- All gear IDs are production `ITEMS`; all enemy identities are production `MONSTERS` scaled with the B1F rule.",
    "- `production-baseline` is the current separated 0–9 / 10–19 roll. `shared-roll-load-counterfactual` is measurement-only and does not set final balance values.", "",
    "## #1151 high pair: fight policy", "",
    "| Model | Loadout | FirstStrike | First action before any enemy | First action executed | Clear | Death | Damage p50 | Enemy actions p50 |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(item => `| ${item.model} | ${item.loadoutId} | ${item.firstStrikeProfileId} | ${renderRate((item.firstActionTiming["player-before-any-enemy"] || 0) / item.runs)} | ${renderRate(item.firstActionRate)} | ${renderRate(item.clearRate)} | ${renderRate(item.deathRate)} | ${item.damage.p50?.toFixed(2) ?? "—"} | ${item.enemyActions.p50?.toFixed(2) ?? "—"} |`), "",
    "## Interpretation guardrails", "",
    "- The large FirstStrike point is a sensitivity probe based on the existing Swift Band plus a measurement-only +5; it is not a production item proposal.",
    "- The load modifier is a counterfactual input only. This report does not choose a final formula or tune enemy stats, flee damage, or encounter frequency.",
    "- `bagWeight` is intentionally omitted. Spare gear and loot never enter the initiative calculation.",
    "- Outcomes are fixed-composition combat evidence, not a full-run success estimate. Unobserved paths remain unobserved rather than zero.", "",
    "## Reproduction", "", "```sh",
    "node scratch/measurements/equipment_load_initiative_diagnostic.js --runs 500 --seed 1161 --output /private/tmp/issue-1161-equipment-load.json --summary /private/tmp/issue-1161-equipment-load.md", "```"
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: ["scratch/measurements/equipment_load_initiative_diagnostic.js", ...PRODUCTION_PATHS] });
  const result = runEquipmentLoadDiagnostic({ runs, seed });
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, schemaVersion: SCHEMA_VERSION, seed, runs, models: MODEL_IDS, loadouts: ALL_LOADOUTS.map(loadout => loadout.id), firstStrikeProfiles: FIRST_STRIKE_PROFILES.map(profile => profile.id), compositions: COMPOSITIONS.map(composition => composition.id), policies: ACTION_POLICIES }, { label: "issue1161 equipment-load env" });
  const report = { ...result, measurement: { scope, sourceCommit: provenance.sourceCommit || null, gameplaySourceCommit: provenance.gameplaySourceCommit || null, measurementRunnerCommit: provenance.measurementRunnerCommit || null, measurementRunnerPaths: provenance.measurementRunnerPaths || [], measurementRunnerDiffSha256: provenance.measurementRunnerDiffSha256 || null, originMainAncestor: provenance.originMainAncestor ?? null, workingTreeClean: provenance.workingTreeClean ?? null, environmentHash, productionPaths: [...PRODUCTION_PATHS] } };
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote Issue #1161 diagnostic: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
