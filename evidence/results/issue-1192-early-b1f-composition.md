# Issue #1192 — early B1F composition pool / ordering / cadence

## Question and scope

This measurement asks whether the fresh B1F opening loss is better addressed by
opening pair cadence, composition identity, or ordering. It uses the production
encounter, initiative, combat, flee, reward, and map traversal paths. No
production balance value is changed by this Issue.

- base SHA: `47ba14467669ff18a71bb7c813e9452c4b468fa9` (`origin/main`, fetched and verified)
- measured source SHA: `f26cafcc55af70ce96dec78029d63f9a50952c6d`
- primary: fresh save + `vanguard`, fight policy, N=1000, seed=1192
- fixed panel: all 43 legal B1F regular two-monster compositions × HP 100/75/50/25 × fight/immediate-flee, N=1000 per case, seed=1151
- runner: `scratch/measurements/early_b1f_composition_diagnostic.js`, version `issue1192-early-b1f-composition-v1`
- provenance: source and runner SHA `f26cafc…`; gameplay baseline `47ba144…`; origin-main ancestor true; stale tree false; clean tree true
- raw report: temporary artifact, not committed; reproduce with the workflow `.github/workflows/early-b1f-composition-diagnostic.yml`

The modeled player is the production auto-fight policy with no departure
consumables or craft. Manual comprehension, merchant policy, and deeper-floor
policy are omitted from the simulation.

## Matched result

| Candidate | B1F death | B2 arrival | E1 generated/effective pair | E2 generated/effective pair | E1 first action not executed | Meaningful reward | Build opportunity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| production baseline | 91.60% | 8.40% | 26.90% / 26.90% | 14.60% / 14.60% | 2.60% | 93.90% | 89.60% |
| cadence: first pair suppressed (control) | 90.40% | 9.60% | 26.90% / 0.00% | 16.30% / 16.30% | 2.39% | 97.20% | 93.00% |
| composition pool redistribution | 91.10% | 8.90% | 26.90% / 26.90% | 14.60% / 14.60% | 2.39% | 94.50% | 90.20% |
| ordering: defer named pair | 91.30% | 8.70% | 26.90% / 26.90% | 14.60% / 15.60% | 2.39% | 94.50% | 90.00% |

The baseline early pair surface was not explained by count alone. The three
largest early death contributors selected by the runner were:

- `コボルトの斥候 + 群れネズミ`: 18 early exposures / 17 deaths; fixed HP100 fight death 31.4%
- `かみつき蟲 + マッドスライム`: 17 / 15; fixed HP100 fight death 88.2%
- `分裂スライム + 火薬コウモリ`: 16 / 15; fixed HP100 fight death 65.8%

The fixed panel therefore separates production exposure from composition
identity. The pool candidate preserved pair count but concentrated 59 early
effective-pair exposures into `かみつき蟲 + 泥の呪い子`; the ordering candidate
concentrated 39. That concentration is a diversity risk even when B2 arrival
moves slightly.

The production flee reference was: selected 580, executed 535, preempted 45,
survived 499, parting-attack deaths 36, execution survival 93.27%, encounter-2
reach 60.10%. This remains a counterfactual reference, not a default policy.

## Decision

Do not ship the cadence control: its gain comes from removing the first pair
opportunity entirely. Do not ship the broad pool redistribution: it improves
the aggregate only marginally and collapses early composition diversity.

The smallest credible production direction is an ordering-only follow-up that
defers only a narrowly selected fixed-panel high-cost pair until after the
first learning window, while preserving the legal pool, pair count, production
combat/flee semantics, and later exposure. The current three-pair diagnostic
profile is evidence for the direction, not a production blacklist. Production
implementation, rollback, and the before/after fresh-save manual gate belong in
a separate child Issue.

Rollback for that child is a one-commit removal of the ordering candidate; no
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

No death occurred in these short manual runs, so a death-cause statement was
not invented. The follow-up production candidate must repeat this gate before
and after the ordering change and record why the player died (if they die),
what next action they can name, and whether a meaningful Cost judgment remains.

## Reproduction

```sh
node scratch/measurements/early_b1f_composition_diagnostic.js \
  --ref main --runs 1000 --fixed-runs 1000 \
  --seed 1192 --fixed-seed 1151 \
  --purpose "#1192 matched early B1F composition pool ordering cadence comparison" \
  --output /tmp/issue1192/report.json \
  --summary /tmp/issue1192/summary.md \
  --manifest /tmp/issue1192/manifest.json
```
