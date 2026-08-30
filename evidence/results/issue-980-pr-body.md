## Summary

Closes #980.

This PR adds causal attribution to the existing production-backed deep Mage measurement. It does not change enemy HP/ATK, Mage stats, encounter balance, auto-action policy, or classification thresholds.

The PR #978 production baseline was reproduced first: runner v6 at `67592f5d741988748119083577e389935f4555ed`, shared seed policy, B13+ deaths 49,333, legacy `raw_damage_pressure` 41,520 / 49,333 = **84.16%**.

The causal run uses the latest `origin/main` descendant, N=500 per build×encounter×depth, B8/B13/B18/B21/B25/B30, four Mage builds, six fixtures, and the shared seed `974-build-confidence`. It records bounded death traces with round, HP/MP, player/enemy actions, statuses/silence, MP drain, reflect, anti-heal, regen, summon, guard, multi-action, spell opportunity loss, physical fallback, damage source, and lethal event.

Evidence:

- [causal JSON](evidence/results/issue-980-causal-attribution.json)
- [causal Markdown and full 144-cell matrix](evidence/results/issue-980-causal-attribution.md)

## Results

The latest-main causal run has 49,319 deep deaths and 41,512 legacy raw-labeled deaths. The denominator differs by 8 from the reproduced #978 baseline because the causal run is executed on the latest main gameplay source; the old baseline remains separately reproduced and unchanged.

1. Of the former 83% raw label, **pure raw damage was 25,409 / 41,512 = 61.21%**.
2. **Mechanic-mediated raw deaths were 7,715 / 41,512 = 18.58%**.
3. The largest contributing cause among former raw deaths was **`reflection_chain`**, with 5,630 multi-label candidate observations; next were `action_economy_chain` 4,366 and `sustain_failure_chain` 1,262. These are evidence counts, not exclusive buckets.
4. Build×encounter×depth differences are substantial and explainable:
   - durable-single-target and protected-formation deaths are almost entirely pure raw walls;
   - swarm-action-pressure is action-economy mediated, especially for Single and Hybrid;
   - magic-denial separates pure physical deaths from silence/reflection-mediated deaths;
   - MP-pressure has the largest unknown/mixed population and longer degradation chains, with Sustain showing the longest mechanic→death mean;
   - the complete 144-cell matrix is in the Markdown evidence.
5. For traces with a preceding mechanism, firing→death latency was mean **1.53 rounds**, p50 **1**, p95 **4**.
6. Existing `chooseAutoCombatAction` was used unchanged. Expected spells were observed for all builds. Fallback totals were AoE 65, Single 0, Sustain 96, Hybrid 0; spell-opportunity losses were AoE 448, Single 411, Sustain 738, Hybrid 309. Representative silence, MP-drain, reflection, action-economy, and pure-raw traces show no systematic unnatural fallback. This is not expert-player AI and does not model manual input.
7. Fixtures are valid as controlled tests: all named monsters resolve from production `MONSTERS`, production trait chances/status patterns and resolver conditions remain active, and no synthetic balance values were added. They are **not** dungeon-frequency samples; 60 cells are 0/500 or 500/500 composition-specific extremes.
8. Next action: **B with a measurement follow-up**. Since pure raw is the majority of the old raw label, investigate non-depth raw sources, enemy count, and action count next. Keep the causal measurement because it identifies the 18.58% mechanic-mediated share and the 11.33% unknown/mixed share of the former raw denominator. #973 Build Confidence is **Revise**: build/encounter interaction is real, but the old raw label concealed both mechanic-mediated chains and a large pure-raw component.

No balance adjustment is proposed by this PR.

## Verification

- `npm run lint`
- `npm run test:unit`: 148 passed, 3 skipped
- `node --check scratch/measurements/issue973_build_sensitivity.js`
- `node --check src/combat_logic/damage.js`
- `node --check src/combat_logic/round.js`
- N=500 measurement completed with clean-tree provenance on the latest main descendant.
