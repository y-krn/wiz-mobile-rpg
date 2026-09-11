# Issue #1192 — early B1F composition pool / ordering / cadence

## Question and scope

This measurement asks whether the fresh B1F opening loss is better addressed by
opening pair cadence, composition identity, or ordering. It uses the production
encounter, initiative, combat, flee, reward, and map traversal paths. No
production balance value is changed by this Issue.

- base SHA: `47ba14467669ff18a71bb7c813e9452c4b468fa9` (`origin/main`, fetched and verified)
- measured source SHA: `055f8a9b338fab40a4f24ec18f50bc28ff733ce2`
- profile selection: fresh save + `vanguard`, N=5000, seed=1192
- matched holdout: fresh save + `vanguard`, N=1000, seed=2192
- fixed panel: all 43 legal B1F regular two-monster compositions × HP 100/75/50/25 × fight/immediate-flee, N=1000 per case, seed=1151
- runner: `scratch/measurements/early_b1f_composition_diagnostic.js`, version `issue1192-early-b1f-composition-v2`, schema 2
- B1F size weights: `[0.70, 0.30, 0.00]`; pair replacement uses the production pool/rule-derived residual pair distribution
- provenance: runner/gameplay source `055f8a9…`; gameplay baseline `47ba144…`; origin-main ancestor true; stale tree false; clean tree true
- raw report: temporary artifact, not committed; reproduce with the workflow `.github/workflows/early-b1f-composition-diagnostic.yml`

The modeled player is the production auto-fight policy with no departure
consumables or craft. Manual comprehension, merchant policy, and deeper-floor
policy are omitted from the simulation.

## Target selection and fixed-panel risk

Targets are selected on seed 1192 and are not used to measure candidate effect.
The score is:

`fixed HP100/fight death rate × early pair exposure × (2 - average entry HP rate)`.

The selected pairs were:

| Pair | Selection exposure/deaths | Avg entry HP | Fixed HP100/fight death | Risk-exposure score |
| --- | ---: | ---: | ---: | ---: |
| `マッドスライム + 錆びた盾兵` | 63 / 61 | 0.632 | 99.4% | 85.69 |
| `コボルトの斥候 + 分裂スライム` | 57 / 55 | 0.622 | 99.2% | 77.92 |
| `マッドスライム + 泥の呪い子` | 56 / 52 | 0.692 | 98.7% | 72.30 |

The complete fixed-panel death-rate distribution is retained in the report and
summarized here:

| Panel | p50 | p90 | p95 | p99 | max | >=50% | >=75% | >=90% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HP100 / fight | 40.70% | 98.70% | 99.38% | 99.90% | 100.00% | 19/43 | 12/43 | 10/43 |
| HP75 / fight | 77.90% | 100.00% | 100.00% | 100.00% | 100.00% | 30/43 | 22/43 | 16/43 |
| HP50 / fight | 98.70% | 100.00% | 100.00% | 100.00% | 100.00% | 41/43 | 37/43 | 31/43 |
| HP25 / fight | 100.00% | 100.00% | 100.00% | 100.00% | 100.00% | 43/43 | 43/43 | 42/43 |
| HP100 / immediate flee | 0.00% | 0.00% | 0.54% | 1.20% | 1.40% | 0/43 | 0/43 | 0/43 |
| HP75 / immediate flee | 0.00% | 4.40% | 4.80% | 7.30% | 9.80% | 0/43 | 0/43 | 0/43 |
| HP50 / immediate flee | 0.00% | 11.60% | 13.29% | 16.30% | 21.30% | 0/43 | 0/43 | 0/43 |
| HP25 / immediate flee | 32.30% | 58.60% | 59.76% | 60.20% | 65.40% | 15/43 | 0/43 | 0/43 |

## Matched holdout result

| Candidate | B1F death | B2 arrival | E1 generated/effective pair | E2 generated/effective pair | E1 first action not executed | Meaningful reward | Build opportunity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| production baseline | 90.30% | 9.70% | 28.60% / 28.60% | 13.40% / 13.40% | 1.94% | 92.80% | 88.90% |
| cadence: first pair suppressed (control) | 88.30% | 11.70% | 28.60% / 0.00% | 17.10% / 17.10% | 1.40% | 96.90% | 93.30% |
| composition pool redistribution | 90.00% | 10.00% | 28.60% / 28.60% | 13.50% / 13.50% | 1.94% | 93.50% | 89.70% |
| ordering: opening target reroll only | 90.10% | 9.90% | 28.60% / 28.60% | 13.50% / 13.50% | 1.94% | 93.50% | 89.70% |

Candidate invariants:

- pool redistribution removes target mass at ordinals 1/2 and samples from the 40-pair residual legal production distribution;
- ordering applies the same residual reroll only at ordinal 1; ordinal 2+ uses the normal generated composition, so later eligibility is not forced or suppressed;
- pair count remains matched at 28.60% in E1 for pool/ordering, and ordering E2 remains 13.50% generated/effective;
- replacement selection uses the simulation's production RNG stream; no enemy stats, initiative, combat, flee, reward, or recovery rule is changed.

## Entry HP, lethality, and diversity

Values are p50/p95. E2 entry HP is conditional on reaching encounter 2.

| Candidate | E1 entry HP | E1 survivor HP | E2 entry HP | E1/E2 pair lethality | Unique effective pairs | Top1 / top3 concentration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 64.69% / 78.36% | 43 | 4.76% / 12.38% |
| cadence control | 1.00 / 1.00 | 14 / 19 | 0.46 / 0.90 | 14.34% / 78.36% | 40 | 5.85% / 14.62% |
| pool redistribution | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 59.44% / 75.56% | 40 | 5.46% / 13.78% |
| ordering-only | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 59.44% / 78.52% | 43 | 5.46% / 13.06% |

Normal damage p50/p95 was `7/20` for baseline, pool, and ordering; cadence was
`6/16`. Trap damage and poison applications were respectively baseline
`8349/387`, pool `8433/390`, and ordering `8414/390`.

## Decision

The previous fixed-replacement comparison was invalid because it concentrated
all replacement exposure into one pair and forced the deferred pair into E2.
This revision removes that confounder and keeps the target-selection seed
separate from the candidate-effect holdout.

The cadence control remains a control only: its gain comes from removing the
first pair judgment. Pool redistribution and ordering-only both preserve pair
count and residual diversity; ordering is the smaller opening-window change,
with later eligibility returning to the normal pool. This PR therefore records
the candidate boundary and evidence only. It does not select production values
or close the parent Issue before the production implementation and fresh-save
before/after gate in #1194.

Rollback for #1194 remains a one-commit removal of the ordering candidate; no
enemy stats, recovery, initiative, or global two-enemy rule is involved.

## Manual fresh-save playtest

On 2026-09-11, a fresh browser context at 390×844 selected `鋼の前線キット`
and `B1Fから開始`. The current production flow reached the dungeon and exposed
the intended cost decisions:

- one fresh run remained at B1F with HP 20/20 during the initial movement route;
- another fresh run detected a floor-trap telegraph, forced through it for 7
  damage, and reached `コボルトの斥候 A + コボルトの斥候 B` at HP 13/20;
- the visible log explained the trap cost and encounter identity. No console
  errors were observed in the completed browser run.

No death occurred in these short manual runs. The follow-up production
candidate must repeat this gate before and after the ordering change and record
why the player died (if they die), what next action they can name, and whether
a meaningful Cost judgment remains.

## Reproduction

```sh
node scratch/measurements/early_b1f_composition_diagnostic.js \
  --ref main --runs 1000 --selection-runs 5000 --fixed-runs 1000 \
  --seed 2192 --selection-seed 1192 --fixed-seed 1151 \
  --purpose "#1192 independent target selection and holdout early B1F pool ordering cadence comparison" \
  --output /tmp/issue1192/report.json \
  --summary /tmp/issue1192/summary.md \
  --manifest /tmp/issue1192/manifest.json
```
