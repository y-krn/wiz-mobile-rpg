# Issue #1192 — early B1F composition pool / ordering / cadence

## Question and scope

This measurement asks whether the fresh B1F opening loss is better addressed by
opening pair cadence, composition identity, or ordering. It uses production
encounter, Trial, initiative, combat, flee, reward, and map traversal paths.
No production balance value is changed by this Issue.

- base SHA: `47ba14467669ff18a71bb7c813e9452c4b468fa9` (`origin/main`, fetched and verified)
- measured source SHA: `39a3c887f1a6554e457bd70197e7a9f5c568f60c`
- profile selection: fresh save + `vanguard`, N=5000, seed=1192
- matched holdout: fresh save + `vanguard`, N=1000, seed=2192
- fixed panel: all 43 legal B1F regular two-monster compositions × HP 100/75/50/25 × fight/immediate-flee, N=1000 per case, seed=1151
- runner: `scratch/measurements/early_b1f_composition_diagnostic.js`, version `issue1192-early-b1f-composition-v4`, schema 4
- B1F size weights: `[0.70, 0.30, 0.00]`
- replacement/reroll weights: production `getEncounterPoolForFloor(floor, { trial })` and encounter rules, conditionally re-normalized per run/floor Trial
- provenance: runner/gameplay source `39a3c88…`; gameplay baseline `47ba144…`; origin-main ancestor true; stale tree false; clean tree true; environment hash `d14f90a56bdf2a4b`
- raw report: temporary artifact, not committed; reproduce with the workflow `.github/workflows/early-b1f-composition-diagnostic.yml`

The modeled player is the production auto-fight policy with no departure
consumables or craft. Manual comprehension, merchant policy, and deeper-floor
policy are omitted from the simulation.

## Target selection, coverage, and fixed-panel risk

Targets are selected on seed 1192 and are not used to measure candidate effect.
The score is:

`fixed HP100/fight death rate × early pair exposure × (2 - average entry HP rate)`.

The top-3 target set was `マッドスライム + 錆びた盾兵`,
`コボルトの斥候 + 分裂スライム`, and `マッドスライム + 泥の呪い子`.
Sensitivity coverage was:

| Profile | Target count | Early pair exposure share | Early pair death share | Baseline pair mass |
| --- | ---: | ---: | ---: | ---: |
| top3 | 3 | 8.29% | 11.22% | 7.72% |
| top5 | 5 | 13.85% | 18.17% | 12.81% |
| fixed risk ≥90% | 10 | 23.04% | 30.79% | 22.53% |

The selected top-3 pairs had selection exposure/deaths and fixed HP100/fight
risk of `63/61, 99.4%`; `57/55, 99.2%`; and `56/52, 98.7%` respectively.

The complete fixed-panel death-rate distribution is retained in the report:

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

HP100/fight has a broad tail: 19/43 pairs are at least 50% lethal and 10/43
are at least 90% lethal. At natural E2 entry HP p50 0.45, the HP50/fight panel
has p50 death 98.7% and 41/43 pairs at least 50% lethal. This does not support
a top-3-only production boundary.

## Matched holdout result

| Candidate | B1F death | B2 arrival | E1 generated/effective pair | E2 generated/effective pair | E1 first action not executed | Meaningful reward | Build opportunity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| production baseline | 90.30% | 9.70% | 28.60% / 28.60% | 13.40% / 13.40% | 1.94% | 92.80% | 88.90% |
| cadence: first pair suppressed (control) | 88.30% | 11.70% | 28.60% / 0.00% | 17.10% / 17.10% | 1.40% | 96.90% | 93.30% |
| pool redistribution (top3) | 90.30% | 9.70% | 28.60% / 28.60% | 13.70% / 13.70% | 1.94% | 93.10% | 89.20% |
| ordering top3 | 90.30% | 9.70% | 28.60% / 28.60% | 13.70% / 13.70% | 1.94% | 93.20% | 89.20% |
| ordering top5 | 90.40% | 9.60% | 28.60% / 28.60% | 13.60% / 13.60% | 2.15% | 93.00% | 89.10% |
| ordering fixed risk ≥90% | 90.30% | 9.70% | 28.60% / 28.60% | 14.10% / 14.10% | 1.83% | 93.90% | 90.10% |

Pool and ordering preserve pair count. Ordering rerolls only ordinal 1; ordinal
2+ remains normal generated production composition, and the Trial-weighted
residual distribution is recomputed per run/floor. Cadence E1 effective pair
lethality is intentionally unobserved (`—`); its generated-pair cohort
lethality is 14.34% after suppression and must not be called effective pair
lethality.

## Entry HP, lethality, and diversity

Values are p50/p95. E2 entry HP is conditional on reaching encounter 2.

| Candidate | E1 entry HP | E1 survivor HP | E2 entry HP | E1/E2 effective pair lethality | Unique effective pairs | Top1 / top3 concentration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 64.69% / 78.36% | 43 | 4.76% / 12.38% |
| cadence control | 1.00 / 1.00 | 14 / 19 | 0.46 / 0.90 | — / 78.36% | 40 | 5.85% / 14.62% |
| pool top3 | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 60.49% / 78.83% | 40 | 5.44% / 13.71% |
| ordering top3 | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 60.84% / 78.83% | 43 | 4.96% / 12.53% |
| ordering top5 | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 61.89% / 78.68% | 43 | 5.45% / 13.74% |
| ordering risk ≥90% | 1.00 / 1.00 | 13 / 19 | 0.45 / 0.85 | 54.55% / 78.01% | 42 | 4.68% / 13.58% |

Normal damage p50/p95 was `7/20` for baseline, pool, and all ordering cases;
cadence was `6/16`. Trap damage / poison applications were baseline `8349/387`,
pool `8408/389`, ordering top3 `8387/390`, top5 `8384/389`, and risk≥90%
`8491/392`.

The v4 runner records candidate action counts, replacement Trial identity, and
global simulation RNG state around each replacement. All replacement rows had
zero Trial mismatches and zero global RNG state shifts; reroll selection uses a
stable auxiliary value derived from run seed, floor, ordinal, and candidate id.

## Decision

The fixed panel and sensitivity holdout show that the risk is broad after
resource carryover, not a stable top-3-only composition boundary. After
isolating reroll randomness, ordering effects remain modest with coverage:
top3 changes B2 arrival by 0.0pp, top5 by -0.1pp, and risk≥90% by 0.0pp versus
baseline; Build opportunity changes by +0.3pp, +0.2pp, and +1.2pp respectively.

Do not advance a narrow ordering candidate to production from this evidence.
The next decision should return to the broader #1184 A/B/C boundary: early
encounter cost (A), resource carryover (B), and reaching Loot/Build opportunity
before death (C). Cadence is an encounter-side candidate under A, not a #1184
C label. The first-action and Cost judgment must remain visible. #1194 is
updated as a blocked follow-up rather than a production approval. No enemy
stats, recovery, initiative, or global two-enemy rule is changed here.

## Manual fresh-save playtest

On 2026-09-11, a fresh browser context at 390×844 selected `鋼の前線キット`
and `B1Fから開始`. The current production flow reached the dungeon and exposed
the intended cost decisions:

- one fresh run remained at B1F with HP 20/20 during the initial movement route;
- another fresh run detected a floor-trap telegraph, forced through it for 7
  damage, and reached `コボルトの斥候 A + コボルトの斥候 B` at HP 13/20;
- the visible log explained the trap cost and encounter identity. No console
  errors were observed in the completed browser run.

No death occurred in these short manual runs. No production candidate is being
approved by this Issue; a future broader candidate needs its own before/after
fresh-save gate.

## Reproduction

```sh
node scratch/measurements/early_b1f_composition_diagnostic.js \
  --ref main --runs 1000 --selection-runs 5000 --fixed-runs 1000 \
  --seed 2192 --selection-seed 1192 --fixed-seed 1151 \
  --purpose "#1192 Trial-aware early B1F candidate sensitivity with isolated reroll RNG" \
  --output /tmp/issue1192/report.json \
  --summary /tmp/issue1192/summary.md \
  --manifest /tmp/issue1192/manifest.json
```
