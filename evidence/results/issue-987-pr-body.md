Closes #987

## Summary

- Added a measurement-only Issue #987 runner using the production `generateEncounter()` path.
- Sampled B8/B13/B18/B21/B25/B30 at N=5,000 generated encounters per depth.
- Replayed each generated encounter with the same seed across AoE Burst, Single-target Efficient, Sustain, and Hybrid/Fallback.
- Preserved #983's exclusive death categories: `pure_raw_damage`, `mechanic_mediated_raw_lethal`, `direct_mechanic_death`, and `unknown_or_mixed`.
- Added fixed W1/W2/W3 counterfactual probes. W3 caps total enemy actions after speed ordering while preserving encounter identity, composition, and traits.
- Saved complete JSON evidence, including encounter composition/identity/role/trait catalogs and all required slices, plus a Markdown summary.
- No production enemy HP/ATK, Mage balance, defense formula, encounter pool, trait, spell, core, or affix was changed.

## Measurement provenance

- Production baseline: `1043e5147c2f43f3c7869a29e80dac522fac28e0` (latest `origin/main` at measurement setup)
- Runner source: `e288cf28675b386908c935c0c9d1737536c2e9f9`
- Seed: `987-production-frequency`
- Environment signature: `b8ce5a65042dab88`
- Weighted arm: 6 depths × 5,000 generated encounters × 4 builds = 120,000 runs per condition
- Controlled arm: 6 named stress fixtures × 6 depths × 500 repetitions × 4 builds = 72,000 runs per condition
- Builds and counterfactuals use paired encounter/seed conditions.

## Results

### A. Production-frequency weighted

- Pure raw: 46,213 / 120,000 = **38.51%**
- Clear: **47.63%**; death: **52.36%**
- Exclusive death counts: pure raw 46,213; mechanic-mediated raw lethal 6,834; direct mechanic death 9,515; unknown/mixed 276.
- Normal hit damage: mean/p50/p90/p95 **6.6561 / 6 / 11 / 12**.
- Lethal physical hit / maxHP: mean/p50/p90/p95 **0.5103 / 0.5000 / 0.7857 / 0.8571**.
- Normal attacks received: mean/p50/p90/p95 **2.008 / 2 / 4 / 4**.
- Total normal damage: mean/p50/p90/p95 **13.367 / 14 / 29 / 37**.
- Rounds: mean/p50/p90/p95 **2.127 / 2 / 3 / 4**.
- Total enemy actions per round: mean/p50/p90/p95 **1.591 / 1.667 / 2 / 2**.
- Player HP removal speed: mean **5.894**; enemy HP removal speed: mean **61.573**.
- Post-combat HP/MP ratio: mean **0.462 / 0.759**.

Build result (pure raw / clear / post HP / post MP):

| Build | Pure raw | Clear | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: |
| AoE Burst | 18.07% | 56.89% | 0.5610 | 0.7045 |
| Sustain | 37.28% | 52.50% | 0.4921 | 0.7408 |
| Single-target Efficient | 43.77% | 46.52% | 0.4558 | 0.7854 |
| Hybrid/Fallback | 54.92% | 34.64% | 0.3408 | 0.8068 |

Depth pure raw rates are B8 **0.40%**, B13 **16.16%**, B18 **27.92%**, B21 **51.42%**, B25 **65.66%**, B30 **69.50%**. Production encounter size distributions (N=5,000 each) were:

| Depth | Mean enemy count | 1 enemy | 2 enemies | 3 enemies |
| --- | ---: | ---: | ---: | ---: |
| B8 | 1.7630 | 29.02% | 65.66% | 5.32% |
| B13 | 1.7006 | 34.54% | 60.86% | 4.60% |
| B18 | 1.6992 | 34.80% | 60.48% | 4.72% |
| B21 | 1.2764 | 72.36% | 27.64% | 0.00% |
| B25 | 1.7866 | 25.94% | 69.46% | 4.60% |
| B30 | 1.7934 | 25.40% | 69.86% | 4.74% |

The JSON `compositionCatalog` records every observed composition with monster identity, role, traits, tags, spell/status metadata, and stats. The Markdown and JSON contain the complete depth, enemy-count, and encounter-family slices.

### B. Controlled stress fixtures

- Pure raw: 31,320 / 72,000 = **43.50%**
- Clear: **23.03%**
- Normal hit damage mean/p50/p90/p95 **6.380 / 6 / 10 / 11**.
- Normal attacks received mean **2.897**; total normal damage mean **18.481**.
- Rounds mean **2.724**; total enemy actions per round mean **2.074**.
- Post-combat HP/MP mean **0.206 / 0.695**.
- Build pure raw / clear: AoE **21.39% / 42.22%**, Sustain **34.95% / 34.29%**, Single-target **50.67% / 11.12%**, Hybrid **66.99% / 4.49%**.

The controlled count slices are not count-only causal estimates: fixture identity, composition, role/trait, targeting, and interaction are confounded, consistent with the #984/#986 correction. They remain stress probes only.

## Controlled versus weighted

Controlled pure raw is **4.99 percentage points higher** than production-frequency weighted (43.50% vs 38.51%). It overstates the stress population's exposure: normal attacks received 2.897 vs 2.008, total normal damage 18.481 vs 13.367, rounds 2.724 vs 2.127, and enemy actions/round 2.074 vs 1.591. It also gives equal weight to hand-picked durable, recovery-denial, protected, reflection, split, and multi-action probes that are not equally frequent in `generateEncounter()`.

The controlled arm does not show that each normal hit is larger: its normal-hit mean is slightly lower. Its overstatement is primarily exposure/duration and high-pressure composition selection, not a uniform single-hit inflation.

## Counterfactuals (measurement-only)

Production-weighted paired results:

| Condition | Pure raw | Clear-rate delta vs baseline | HP preservation delta | MP preservation delta |
| --- | ---: | ---: | ---: | ---: |
| W1 normal damage ×0.75 | 32.69% | +5.69pp | +5.39pp | -2.58pp |
| W2 enemy HP ×0.75 | 33.75% | +6.48pp | +6.29pp | +2.71pp |
| W3 max 1 enemy action/round | 33.96% | +7.02pp | +6.70pp | -6.04pp |

W1 gives the largest pure-raw reduction (5.82pp), while W3 gives the largest clear-rate improvement (7.02pp). W3 is intentionally artificial; it preserves generated monsters, traits, roles, and composition but suppresses lower-priority turns after speed ordering. The observational baseline action-rate slices are therefore the natural interpretation of total exposure.

## Build Sensitivity

Production-weighted paired clear-rate differences (left minus right): AoE vs Single **+10.37pp**, AoE vs Sustain **+4.39pp**, AoE vs Hybrid **+22.25pp**, Single vs Sustain **-5.98pp**, Single vs Hybrid **+11.88pp**, Sustain vs Hybrid **+17.86pp**. HP/MP preservation differences are retained in the JSON and Markdown tables.

- Strict significant reversals: **153 weighted** versus **18 controlled** (paired 95% CI excludes zero in both compared slices and signs reverse).
- Best-cell dominance, weighted: AoE 74/160 (**46.25%**), Single 24, Sustain 38, Hybrid 24.
- Best-cell dominance, controlled: AoE 25/54 (**46.30%**), Single 6, Sustain 17, Hybrid 6.

Build sensitivity remains meaningful at production frequency: one build wins some generated depth/family cells while another wins others. AoE is the most frequent best build, but no build dominates all cells or the aggregate trade-off; Sustain is better than Single on clear rate while Single preserves more MP.

## Required decisions

1. Controlled vs weighted pure raw: **43.50% vs 38.51%, +4.99pp controlled**.
2. Is normal-hit strength still a main cause? **Yes, as a causal component, not the sole cause**: W1 removes 5.82pp pure raw, the largest of W1/W2/W3, and the weighted lethal-hit ratio remains substantial.
3. Fight duration effect: **material**. Controlled has 2.724 vs 2.127 rounds and 2.074 vs 1.591 enemy actions/round; W3 produces the largest clear-rate gain.
4. Enemy count/actions: production count-1 is 26.89% pure raw / 64.55% clear / 1.016 actions per round; count-2 is 45.22% / 38.00% / 1.874; count-3 is 47.12% / 33.19% / 2.733. Count and action exposure rise together, but family and identity are confounded.
5. Build strengths/weaknesses at actual generated frequency: **yes**, with significant pairwise differences and reversals.
6. One average-dominant build: **no**. AoE wins the most cells at 46.25%, not a universal majority; Sustain, Single, and Hybrid each win distinct cells.
7. Proceed directly to production tuning: **no, not from this Issue alone**. First validate against full-run encounter frequencies and retain the causal separation in a dedicated tuning issue.
8. If tuning proceeds after that validation: investigate the **normal physical damage/exposure lever first**, with enemy-action exposure and depth/family-specific behavior as the next diagnostic axis. Do not apply these counterfactual values as a production change here.
9. #973 Build Confidence: **Revise**. Production weighting confirms meaningful build trade-offs, but the generated-distribution/full-run gap and strong depth/family interactions prevent Keep; the evidence does not justify Reject.

## Verification

- `npm run lint` ✅
- `npm run build` ✅
- `npm run test:unit` ✅ `148 passed / 3 skipped / 0 failed`
- `node scratch/tests/unit/test_build_sensitivity.js` ✅
- Full measurement command is recorded in `evidence/results/issue-987-production-frequency.md`.
