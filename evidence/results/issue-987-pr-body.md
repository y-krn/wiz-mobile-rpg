# Issue #987 measurement follow-up

Closes #987

## Scope

- Re-measured production `generateEncounter()` at B8/B13/B18/B21/B25/B30 with N=5,000 generated encounters per depth.
- Replayed every generated encounter with the same encounter and paired seed across AoE Burst, Single-target Efficient, Sustain, and Hybrid/Fallback.
- Kept controlled stress fixtures separate at N=500 per fixture/depth.
- Preserved #983's exclusive death categories: `pure_raw_damage`, `mechanic_mediated_raw_lethal`, `direct_mechanic_death`, and `unknown_or_mixed`.
- W1/W2/W3 remain fixed measurement-only probes. No production balance tuning or content changes were made.

## Provenance and sample

- Production baseline: `1043e5147c2f43f3c7869a29e80dac522fac28e0` (latest `origin/main`)
- Runner source: `65647b51bcad3e4aedd03ddc34910691b032d78c`
- Seed: `987-production-frequency`
- Environment signature: `b8ce5a65042dab88`
- Production arm: 6 depths × 5,000 generated encounters × 4 builds = 120,000 runs per condition
- Controlled arm: 6 fixtures × 6 depths × 500 repetitions × 4 builds = 72,000 runs per condition
- Counterfactual deltas use `candidate - baseline`; positive means improvement. JSON fields are `clearRateDelta`, `hpPreservationDelta`, and `mpPreservationDelta`.

The JSON `compositionCatalog` records observed enemy count, composition, monster identity, role, traits, tags, spell/status metadata, and stats. Generated encounter frequency is not identical to full-run encounter frequency: traversal, event selection, bosses/midbosses, roaming elites, retreat, and run survival can reweight which encounters are actually reached.

## Results

### A. Production-frequency weighted

- Pure raw: 46,213 / 120,000 = **38.51%**
- Clear: **47.63%**; death: **52.36%**
- Exclusive deaths: pure raw 46,213; mechanic-mediated raw lethal 6,834; direct mechanic death 9,515; unknown/mixed 276.
- Normal hit damage mean/p50/p90/p95: **6.6561 / 6 / 11 / 12**
- Lethal hit/maxHP mean/p50/p90/p95: **0.5103 / 0.5000 / 0.7857 / 0.8571**
- Normal attacks received mean/p50/p90/p95: **2.008 / 2 / 4 / 4**
- Total normal damage mean/p50/p90/p95: **13.367 / 14 / 29 / 37**
- Rounds mean/p50/p90/p95: **2.127 / 2 / 3 / 4**
- Total enemy actions/round mean/p50/p90/p95: **1.591 / 1.667 / 2 / 2**
- Player HP removal speed: **5.894**; enemy HP removal speed: **61.573**
- Post-combat HP/MP: **0.462 / 0.759**

Build pure raw / clear / post HP / post MP:

| Build | Pure raw | Clear | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: |
| AoE Burst | 18.07% | 56.89% | 0.5610 | 0.7045 |
| Sustain | 37.28% | 52.50% | 0.4921 | 0.7408 |
| Single-target Efficient | 43.77% | 46.52% | 0.4558 | 0.7854 |
| Hybrid/Fallback | 54.92% | 34.64% | 0.3408 | 0.8068 |

Production encounter size distribution (N=5,000/depth):

| Depth | Mean enemy count | 1 enemy | 2 enemies | 3 enemies |
| --- | ---: | ---: | ---: | ---: |
| B8 | 1.7630 | 29.02% | 65.66% | 5.32% |
| B13 | 1.7006 | 34.54% | 60.86% | 4.60% |
| B18 | 1.6992 | 34.80% | 60.48% | 4.72% |
| B21 | 1.2764 | 72.36% | 27.64% | 0.00% |
| B25 | 1.7866 | 25.94% | 69.46% | 4.60% |
| B30 | 1.7934 | 25.40% | 69.86% | 4.74% |

### B. Controlled stress fixtures

- Pure raw: 31,320 / 72,000 = **43.50%**
- Clear: **23.03%**
- Normal hit mean/p50/p90/p95: **6.380 / 6 / 10 / 11**
- Normal attacks received mean: **2.897**
- Total normal damage mean: **18.481**
- Rounds mean: **2.724**
- Total enemy actions/round mean: **2.074**
- Post-combat HP/MP: **0.206 / 0.695**

Controlled fixtures over-represented high-pressure composition and exposure. They did not make each normal hit larger; their normal-hit mean was slightly lower. The difference is primarily duration/action exposure and fixture selection.

## Build Sensitivity

Strict reversal now uses the #975-compatible rule: in both compared families, paired outcome and diagnostic utility bootstrap 95% CIs must exclude zero, and both outcome and utility signs must reverse. Utility is clear outcome + post-combat HP/MP preservation + round cost. Minimum paired family N is fixed at **30**; insufficient families are recorded and excluded.

| Arm | Strict significant reversals | Eligible family comparisons | Insufficient-sample comparisons |
| --- | ---: | ---: | ---: |
| Production weighted | **88** | 3,366 | 6,210 |
| Controlled | **18** | 90 | 0 |

The old 153 count is not retained: it counted clear-rate sign reversals without the required utility/resource reversal.

Equal-cell coverage and production-frequency-weighted dominance are separate:

- Production equal-cell best-build coverage: **AoE 63.70% (55.4167/87 cells)**; controlled **AoE 56.94% (20.5/36 cells)**. This gives each depth×family cell equal weight and is **not encounter-frequency weighted**.
- Production-frequency-weighted best-build share, using generated encounter units and fractional diagnostic-utility ties: **Sustain 28.98%, AoE 27.66%, Hybrid 25.04%, Single 18.33%** over 30,000 encounters.
- Controlled utility best share: **AoE 42.81%, Hybrid 23.89%, Single 17.46%, Sustain 15.84%** over 18,000 fixture encounters.

Therefore AoE's old “46.25% dominance” interpretation is removed. It was an equal-cell coverage value, not “AoE is best in 46.25% of actual encounters.” Production-frequency weighted dominance does not show one build dominating: the largest share is Sustain at 28.98%.

Family paired N for every build-pair/family is recorded in the Markdown and JSON. The JSON also contains overall, build, depth, enemy-count, and encounter-family slices, including clear, HP/MP, rounds, normal damage, attacks, and enemy-action exposure.

## Counterfactuals (measurement-only)

All deltas below are **candidate − baseline**, so improvement is positive.

| Arm / probe | Pure raw | Clear-rate delta | HP preservation delta | MP preservation delta |
| --- | ---: | ---: | ---: | ---: |
| Production W1 normal physical damage ×0.75 | 32.69% | **+5.69pp** | **+5.39pp** | -2.58pp |
| Production W2 enemy HP ×0.75 | 33.75% | **+6.48pp** | **+6.29pp** | +2.71pp |
| Production W3 max 1 enemy action/round | 33.96% | **+7.02pp** | **+6.70pp** | -6.04pp |
| Controlled W1 | 33.36% | +9.65pp | +8.77pp | -4.28pp |
| Controlled W2 | 37.66% | +9.21pp | +8.63pp | +3.25pp |
| Controlled W3 | 32.49% | +14.19pp | +14.06pp | -8.96pp |

W1 is the largest pure-raw reduction in the production arm (**-5.82pp**), so normal physical damage remains a major sensitivity, but not the only factor. W2 shortens rounds from 2.127 to 2.017 and improves clear by 6.48pp, showing a material duration effect. W3 reduces actions/round from 1.591 to 1.000 and improves clear by 7.02pp; it is an artificial measurement probe, not a proposal to make production combat one action per round. W3 preserves generated identity, composition, traits, and normal resolution apart from the exposure cap.

## Required conclusions

1. Production-frequency weighted pure raw rate: **38.51%**.
2. Controlled fixture difference: **+4.99pp** pure raw (43.50% vs 38.51%).
3. Normal attack strength remains a major causal component; W1 changes clear by **+5.69pp** and pure raw by **-5.82pp**, but controlled overstatement is not single-hit inflation.
4. Fight duration/action exposure remains material; W2 and W3 both improve outcomes, with W3 the largest clear-rate probe.
5. Enemy count/actions matter: weighted count-1/2/3 pure raw is **26.89% / 45.22% / 47.12%**, with actions/round **1.016 / 1.874 / 2.733**; composition and identity remain confounded.
6. Build strengths/weaknesses remain meaningful at generated frequency: clear, HP/MP, utility, and strict reversals all show encounter-dependent differences.
7. No single build is average-dominant: production utility best share is Sustain **28.98%**, not a majority; AoE is strongest in equal-cell coverage but not universally dominant.
8. #973 Build Confidence: **Revise**. The trade-offs are real, but the generated-distribution/full-run gap and depth/family interactions require continued validation.
9. Do not proceed directly to production tuning from this Issue. If a separate tuning Issue follows, first investigate normal physical damage/exposure with depth/family-specific validation; do not apply W1/W2/W3 values as production changes.

## Verification

- `npm run lint` ✅
- `npm run test:unit` ✅ (148 passed / 3 skipped / 0 failed)
- `npm run build` ✅
- `node scratch/tests/unit/test_build_sensitivity.js` ✅
- `node scratch/tests/regression/test_measurement_provenance.js` ✅
- Full N=5,000/depth measurement command:

```sh
node scratch/measurements/issue987_production_frequency.js --runs 5000 --stress-runs 500 --seed 987-production-frequency --output evidence/results/issue-987-production-frequency.json --summary evidence/results/issue-987-production-frequency.md
```
