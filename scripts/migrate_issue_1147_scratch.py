from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

RENAME_MAP = {
    "scratch/measurements/issue1012_observability.js": "scratch/measurements/observability_measurement.js",
    "scratch/measurements/issue1096_build_payment.js": "scratch/measurements/build_payment_measurement.js",
    "scratch/measurements/issue1100_build_payment_stake.js": "scratch/measurements/build_payment_stake_measurement.js",
    "scratch/measurements/issue1139_starting_kit_diagnostic.js": "scratch/measurements/starting_kit_diagnostic.js",
    "scratch/measurements/issue816_chest_telemetry.js": "scratch/measurements/chest_telemetry_measurement.js",
    "scratch/measurements/issue973_build_sensitivity.js": "scratch/measurements/build_sensitivity_measurement.js",
    "scratch/measurements/issue984_pure_raw_decomposition.js": "scratch/measurements/pure_raw_decomposition_measurement.js",
    "scratch/measurements/issue987_production_frequency.js": "scratch/measurements/production_frequency_measurement.js",
    "scratch/measurements/issue990_partial_information_progression.js": "scratch/measurements/partial_information_progression_measurement.js",
    "scratch/measurements/issue990_phase3_stage1.js": "scratch/measurements/persona_population_measurement.js",
    "scratch/measurements/issue990_phase3_stage1_5.js": "scratch/measurements/shallow_combat_diagnostic.js",
    "scratch/measurements/issue990_phase3_stage2_combat_personas.js": "scratch/measurements/combat_policy_sensitivity_measurement.js",
    "scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js": "scratch/measurements/checkpoint_continuation_measurement.js",
    "scratch/measurements/issue990_reached_run.js": "scratch/measurements/reached_run_measurement.js",
    "scratch/simulations/sim_issue_793_bleeding.js": "scratch/simulations/sim_bleeding_measurement.js",
    "scratch/simulations/sim_commit_depth_624.js": "scratch/simulations/sim_commit_depth.js",
}

DELETE_PATHS = {
    "scratch/measurements/coverage_report_595.js",
    "scratch/measurements/issue1078_loot_supply.js",
    "scratch/measurements/issue612_exp_pace_env.js",
    "scratch/measurements/issue624_commit_depth.js",
    "scratch/measurements/issue700_gate_metrics.js",
    "scratch/measurements/issue706_depth_enemy_pools.js",
    "scratch/measurements/issue816_from_drop_sim.js",
    "scratch/simulations/sim_issue_1056_pending_rewards.js",
    "scratch/simulations/sim_issue_1064_unknown_trial.js",
    "scratch/simulations/sim_issue_461_baseline.js",
    "scratch/simulations/sim_issue_499_shallow_recovery_dose_sweep.js",
    "scratch/simulations/sim_issue_499_shallow_recovery_supply.js",
    "scratch/simulations/sim_issue_508_heal_unit_density.js",
    "scratch/simulations/sim_issue_516_class_sustain.js",
    "scratch/simulations/sim_issue_528_class_sustain_phase2.js",
    "scratch/simulations/sim_issue_599_explore_spells.js",
    "scratch/simulations/sim_issue_599_level_distribution.js",
    "scratch/simulations/sim_issue_612_exp_pace.js",
    "scratch/simulations/sim_issue_713_trap_calibration.js",
    "scratch/simulations/sim_issue_825_vulnerable.js",
    "tests/node/regression/test_heal_unit_density.js",
}

TEXT_SUFFIXES = {".js", ".mjs", ".cjs", ".json", ".md", ".toml", ".yml", ".yaml"}


def migrate_paths():
    for old, new in RENAME_MAP.items():
        source = ROOT / old
        target = ROOT / new
        if source.exists():
            if target.exists():
                raise SystemExit(f"rename target already exists: {new}")
            target.parent.mkdir(parents=True, exist_ok=True)
            source.rename(target)

    for rel in DELETE_PATHS:
        path = ROOT / rel
        if path.exists():
            path.unlink()


def replace_active_references():
    replacements = []
    for old, new in RENAME_MAP.items():
        replacements.append((old, new))
        replacements.append((Path(old).name, Path(new).name))

    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith("evidence/") or rel.startswith(".git/") or "node_modules/" in rel:
            continue
        if rel == ".github/workflows/issue-1147-scratch-audit.yml":
            continue
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in replacements:
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def update_manifest():
    path = ROOT / "scratch/simulations/simulation_manifest.js"
    text = path.read_text(encoding="utf-8")

    retired = {
        rel for rel in DELETE_PATHS
        if rel.startswith("scratch/measurements/") or rel.startswith("scratch/simulations/")
    }
    lines = [line for line in text.splitlines() if not any(rel in line for rel in retired)]
    text = "\n".join(lines) + "\n"

    text = text.replace(
        'new Set(["canonical", "temporary", "historical"])',
        'new Set(["canonical", "reusable", "temporary", "historical"])',
    )

    reusable = set(RENAME_MAP.values())
    lines = []
    for line in text.splitlines():
        if any(f'path: "{rel}"' in line for rel in reusable):
            line = line.replace('lifecycle: "historical"', 'lifecycle: "reusable"')
        lines.append(line)
    text = "\n".join(lines) + "\n"

    anchor = "// candidate, but lifecycle validation must reject it until it is classified."
    addition = (
        anchor
        + "\n// Permanent new runners must be canonical or reusable and use semantic, Issue-independent names."
    )
    if addition not in text:
        text = text.replace(anchor, addition)

    path.write_text(text, encoding="utf-8")


def update_sim_gate():
    path = ROOT / "tests/node/regression/test_sim_follow_gate.js"
    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r'^assert\.equal\(SIMULATION_RUNNER_INVENTORY\.length, 50, "unexpected current runner inventory size"\);\n',
        "",
        text,
        flags=re.M,
    )

    marker = 'assert.ok(discoveredRunners.includes("scratch/simulations/sim_depth_material_ev.js"));\n'
    guard = marker + '''assert.equal(
  SIMULATION_RUNNER_INVENTORY.filter(runner => /(?:^|\\/)(?:sim_)?issue[_-]?\\d|_\\d{3,}\\.js$/.test(runner.path)).length,
  0,
  "permanent runner inventory must use Issue-independent semantic names"
);
assert.ok(
  SIMULATION_RUNNER_INVENTORY.some(runner => runner.lifecycle === "reusable"),
  "promoted reusable runners must remain explicitly classified"
);
'''
    if "permanent runner inventory must use Issue-independent semantic names" not in text:
        if marker not in text:
            raise SystemExit("simulation gate insertion marker missing")
        text = text.replace(marker, guard)
    path.write_text(text, encoding="utf-8")


def update_ownership_gate():
    path = ROOT / "tests/node/regression/test_scratch_ownership.js"
    text = path.read_text(encoding="utf-8")
    marker = 'assert.ok(executablePaths.length > 0, "ownership directories must contain executable assets");\n'
    guard = marker + '''assert.equal(
  executablePaths.filter(file => /(?:^|\\/)(?:sim_)?issue[_-]?\\d|_\\d{3,}\\.js$/.test(file)).length,
  0,
  "permanent scratch assets must use Issue-independent semantic names"
);
'''
    if "permanent scratch assets must use Issue-independent semantic names" not in text:
        if marker not in text:
            raise SystemExit("ownership gate insertion marker missing")
        text = text.replace(marker, guard)
    path.write_text(text, encoding="utf-8")


def update_readme():
    path = ROOT / "scratch/README.md"
    path.write_text("""# Scratch ownership

`scratch/` contains executable development investigation assets, not test suites.
Every executable belongs to exactly one owner directory:

| Directory | Ownership | Naming | Lifecycle |
| --- | --- | --- | --- |
| `simulations/` | balance, progression, formula, map, and simulation infrastructure | `sim_<subject>.js`; infra may use an explicit descriptive name | canonical, reusable, or grandfathered historical; never auto-run by the unit runner |
| `measurements/` | statistical measurement, comparison, provenance, and measurement reports | `<verb>_<subject>.js` or `measurement_<subject>.js` | reusable infrastructure or explicit one-off command |
| `benchmarks/` | performance probes | `bench_<subject>.js` | explicit command only |

All executable tests live under repository-level `tests/`; see `tests/README.md`.
Historical summaries, raw-result references, fixtures, and images belong in
`evidence/` (with generated/raw outputs under `evidence/results/`). Evidence is
preserved for provenance and is not executable test input.

Simulation lifecycle is explicit in `simulations/simulation_manifest.js`.
The production-backed `sim_depth_material_ev.js` is canonical. Reusable runners
that remain part of current regression or measurement infrastructure are named
for their behavior and use the `reusable` lifecycle. Existing generic historical
runners may remain until separately retired.

Issue-specific one-off runners are temporary branch assets: before merge they
must either be deleted after their evidence is recorded or promoted to an
Issue-independent semantic name. Permanent files under `scratch/` must not use
Issue-numbered names or numeric Issue suffixes.

The ownership regression at `tests/node/regression/test_scratch_ownership.js`
enforces these directory and naming boundaries.
""", encoding="utf-8")


def validate():
    bad = []
    pattern = re.compile(r"(?:^sim_)?issue[_-]?\d|_\d{3,}\.js$")
    for base in (ROOT / "scratch/measurements", ROOT / "scratch/simulations"):
        for path in base.glob("*.js"):
            if pattern.search(path.name):
                bad.append(path.relative_to(ROOT).as_posix())
    if bad:
        raise SystemExit("Issue-numbered permanent scratch files remain:\n" + "\n".join(sorted(bad)))


if __name__ == "__main__":
    migrate_paths()
    replace_active_references()
    update_manifest()
    update_sim_gate()
    update_ownership_gate()
    update_readme()
    validate()
