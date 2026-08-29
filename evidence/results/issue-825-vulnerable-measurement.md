# Issue #825: vulnerable multiplier sweep

Runner: `scratch/simulations/sim_issue_825_vulnerable.js`
Source commit: `cbea97be91f4927297c657e96de5399681ea0d28`
Seed: `825`; `N=100` for every mode and candidate; same Mage level 5, `VULNERA` producer,
`MAHALITO` finisher, and deterministic RNG sequence. Targets alternate 50 boss / 50 midboss.

The baseline is the finisher without a vulnerable producer. Immediate casts apply and consume
in the same two-action sequence. Delayed casts tick once before the finisher. Expired casts tick
three times before the finisher.

| Candidate | Baseline mean | Immediate mean / delta | Delayed mean / latency | Expired mean | Contribution |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.15x | 49.59 | 56.59 / +7.00 | 56.59 / 1 turn | 49.59 | 700 |
| 1.25x | 49.59 | 62.18 / +12.59 | 62.18 / 1 turn | 49.59 | 1,259 |
| 1.35x | 49.59 | 67.18 / +17.59 | 67.18 / 1 turn | 49.59 | 1,759 |

Every producer case had 100 attempts and applications, 100 consumes in immediate/delayed mode,
and 100 expiries in expired mode. Qualifying hit type was `spell` in every consume case.
Boss/midboss applications were 50/50 for each producer case. The final build snapshot recorded
`Mage level 5 → VULNERA → MAHALITO`.

Decision: adopt `1.25x`. It creates a measurable timing window and preserves the finite expiry
boundary while avoiding the larger single-hit swing of `1.35x`. No enemy resistance is modeled;
boss and midboss behavior therefore follows the same successful application rule.
