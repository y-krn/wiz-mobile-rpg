# Balance Review Standard

## Role and ownership

Review progression, economy, combat difficulty, rewards, and run pacing with
evidence that is appropriate to the claim. This document owns durable balance
principles: what makes evidence trustworthy and what conclusions each evidence
type can support.

The layers have different responsibilities:

- `.agents/balance-simulation.md` defines review principles and evidence quality.
- `.agents/skills/balance-simulation/SKILL.md` defines the conditional workflow
  for running a measurement.
- Source, simulation, measurement, manifest, and test files define the current
  executable rules and implementation details.
- Issues, commits, and evidence records preserve the rationale and history of
  particular decisions.

Do not copy a current runner inventory, manifest schema, parser rule, allowlist,
temporary exception, or historical result into this standard. A review that
does not need a simulation does not need to load the measurement skill or the
full harness contract.

## Scope

- Progression, economy, materials, drops, enemies, rewards, difficulty, growth,
  and run pacing
- The interaction of data, rules, systems, combat, map, chest, and quest paths
  when they affect a balance claim
- Reproducible evidence, outcome distributions, resource pressure, and
  uncertainty

Route source discovery through `.agents/file-map.md`. Expand only to the
changed balance path, its authoritative callers, and the smallest verification
surface that can support the claim.

## Claim and evidence discipline

Every balance conclusion should state the question, population, comparison,
metric, and decision it is intended to inform. Choose the smallest evidence
scope that can support that conclusion:

| Evidence scope | Can support | Cannot establish by itself |
| --- | --- | --- |
| `formula` | An isolated formula, threshold, cost, mitigation, or local contribution | Floor reachability, run pacing, reward pressure, or end-to-end balance |
| `map` | Generator composition, density, topology, and reachability properties | Combat difficulty, reward economy, or player policy outcomes |
| `infra` | Runner, dependency, provenance, metadata, and harness behavior | A player-facing balance conclusion |
| `run` | Production-path depth, progression, resource pressure, reward, and outcome distributions under a declared policy | Mechanics that the run cannot reach or scenarios whose omissions materially change the conclusion |

A narrow formula result must not be presented as an end-to-end result. A map
result must not be used to infer combat or economy. A smoke or reachability run
can show that a path executes, but it is not a statistically meaningful balance
measurement.

## Durable principles

### Production fidelity

- Measure the production path for progression, depth, economy, reward, or
  difficulty claims. Reuse authoritative generation, resolution, settlement,
  and scoring paths rather than maintaining a hand-written approximation.
- A result is evidence only for the mechanisms and policy that actually ran.
  Distinguish a measured zero, an unobserved outcome, an unexecuted path, and an
  intentionally omitted mechanic.
- Reachability is part of validity. A result from a disconnected or unreachable
  path cannot support a conclusion about the player experience.
- Keep balance values and deterministic rules in data, rule, or system
  ownership. Do not hide them in presentation, input, or unrelated orchestration
  code where they become difficult to review and measure.

### Reproducibility and provenance

- Prefer deterministic seeds and repeatable inputs over anecdotal play results
  when a decision depends on comparison or distribution.
- Record enough provenance to identify the source revision, baseline revision,
  runner and configuration, environment, seed policy, dataset or fixture, and
  whether the measured tree was valid for the intended comparison.
- Baseline and candidate measurements must use the same metric definition,
  population, configuration, seed policy, dataset, runner contract, and
  modeled mitigations. A source revision may differ because it contains the
  candidate change; the measurement conditions must not drift silently.
- Observation, telemetry, inspection, save/load, and reporting must not reroll
  gameplay randomness, mutate gameplay state, or change the measured policy.

### Modeled and omitted mechanics

- State the player decisions and mitigations included in a run: recovery,
  retreat, status treatment, equipment choices, consumable use, and other
  policies that can change the measured outcome.
- State meaningful omissions and explain how they limit interpretation. An
  omitted mechanic is not evidence that the mechanic has no effect.
- Use the real reward, level-up, settlement, and ownership paths. Directly
  invoking a downstream effect can double-count or bypass the pressure being
  measured.
- Treat a mechanism that does not fire in a small run as unobserved unless the
  measurement contract explicitly makes that path part of the decision.

### Statistical adequacy and uncertainty

- Choose sample size for the decision: a smoke check, reachability check,
  diagnostic, and distributional balance comparison have different evidence
  requirements.
- Compare distributions and progression or reward pressure, not only a single
  favorable example. Use conditional denominators that match the question and
  report intervals or other uncertainty where sampling affects the conclusion.
- Separate observed difference, instability, uncertainty, and lack of
  observations. Do not turn a small sample, a noisy difference, or an omitted
  path into a precise balance claim.
- Pair baseline and candidate measurements only when their correspondence and
  random-input conditions are valid; otherwise use an appropriate independent
  comparison and say why.

### Change classification and ownership

- A balance-sensitive production change needs an evidence path capable of
  measuring its claimed effect. A state, persistence, presentation, or
  observation-only change is not a balance change merely because it touches a
  broad module; classify it by the changed behavior.
- One authoritative rule path should own a balance value or settlement effect.
  Callers may coordinate that path but must not create a second formula,
  reward shortcut, or policy-specific shadow implementation.
- Current harness rules belong in source, scripts, manifests, workflows, and
  regression tests. Documentation should point reviewers to those owners and
  explain the principle they protect, not restate their exact fields or parser
  logic.

## Review method

1. Define the balance question, affected phase of progression, metric,
   population, comparison, and decision threshold.
2. Route to the authoritative data/rule/system path using `.agents/file-map.md`.
   Check whether the diff changes balance behavior or only state, presentation,
   persistence, or observation.
3. Select `formula`, `map`, `infra`, or `run` evidence according to the claim.
   Use a production-backed run for depth, EV, progression, reward, or difficulty
   conclusions.
4. Record the modeled policy, omitted mechanics, source and environment
   provenance, sample size, and uncertainty before interpreting the result.
5. Compare matched cases and inspect whether the relevant production side
   effects and paths were actually reached.
6. Report the supported conclusion, limitations, and whether additional
   measurement is needed. Do not broaden a local result into an unsupported
   player-facing claim.

Load `.agents/skills/balance-simulation/SKILL.md` when this method requires
executing a measurement. The skill owns worktree setup, runner selection,
preflight, smoke, determinism, measurement, and evidence-recording procedure.

## Review checklist

- Is the claim about early, mid, or late progression, and are risk, reward,
  cost, recovery, and player choice represented?
- Are materials, items, experience, quests, rewards, enemy capability, traits,
  and encounter pressure evaluated at the phase where they matter?
- Does the evidence use the production mechanism and authoritative value owner?
- Are player mitigations, modeled policies, and meaningful omissions explicit?
- Are provenance, sample size, denominators, distributions, and uncertainty
  sufficient for the decision?
- Are formula, map, infrastructure, reachability, and end-to-end conclusions
  kept separate?
- Could a UI, action, telemetry, or orchestration diff hide a balance change or
  bypass the authoritative path?
- Are current harness safeguards verified by their executable owner rather than
  inferred from this checklist?

## Must not do

- Do not tune or approve a balance conclusion from feeling alone when a
  reproducible measurement is required.
- Do not infer depth, economy, or progression balance from a narrow formula,
  unreachable path, single smoke run, or omitted mitigation.
- Do not replace a production mechanism with a hand-written simulation loop.
- Do not overstate precision or report an omitted/unobserved mechanism as zero.
- Do not move deterministic balance values into presentation or input code.
- Do not replace executable safeguards with prose, or preserve obsolete parser,
  exception, and historical detail here merely because it once mattered.

## Output

Use the repository review output format from `.agents/README.md`. A balance
review should make the question and evidence scope, modeled and omitted
mechanics, provenance, result and uncertainty, limitations, and decision easy
to find.

## Build Snapshot measurement axis

The current standard balance measurement uses explicit fixture IDs, not the
legacy Fighter/Thief/Priest/Mage class axis. The canonical runner accepts these
fixtures through `scratch/measurements/build_fixtures.js`, runs them through the
same production-backed `simulateRun` path, and emits `axisType: "build-fixture"`
with fixture IDs and resolved Build Snapshot metadata.

The standard fixtures cover light weapon plus shield, heavy two-hand weapon,
one-hand Medium with a shallow Rune and shield, two-hand Medium with multiple
Runes, exploration Support, and a Main-axis conversion Core. Metrics are
reported by fixture persona. Legacy class-mode exports remain available for
historical comparisons but are not the vNext standard axis. CI does not require
an N>=500 simulation; the standard measurement command retains its explicit
N>=500 guard for deliberate measurement runs.
