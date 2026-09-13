---
name: balance-simulation
description: Use when a progression, economy, difficulty, reward, or pacing claim requires a production-backed simulation; not for formula/spec review, reachability, UI-only work, or ordinary QA.
---

# Balance measurement

Load `.agents/balance-simulation.md` and the matching design canon. Use the
smallest existing production-backed runner that can answer the stated claim;
source, manifests, scripts, and tests own its current contract.

## Evidence gate

State the question, metric, population, comparison, evidence scope, and
decision. Before a distributional result, run a syntax check, one smoke case,
and the same smoke case again. The repeated result must be deterministic and
must exercise the production mechanism.

For baseline/candidate comparisons, keep the runner contract, source revision,
seed policy, dataset, environment, modeled mitigations, and metric definition
matched. Record runner provenance, sample size, uncertainty, omissions, and a
reproduction command. Keep raw artifacts out of the repository.

Do not turn a smoke result into a distributional claim. Distinguish measured
zero, no observation, unexecuted path, and intentionally omitted mechanic. A
measurement is incomplete when determinism, provenance, matched conditions, or
uncertainty is missing.

For a code or harness change, run the affected regression gate. Stop with the
exact missing evidence when the runner bypasses production behavior, source or
ancestry is invalid, conditions are not comparable, or the design canon does
not settle the interpretation.

## Report

Report question/scope, validity, matched comparison, limitations, and a
`pass`, `needs more measurement`, or blocked decision. Include whether each
result is measured, unobserved, omitted, or unreachable through the runner.
