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

Every death has exactly one exclusive final category: `pure_raw_damage`, `mechanic_mediated_raw_lethal`, `direct_mechanic_death`, or `unknown_or_mixed`. Multi-label contributing observations are separate evidence and are never used as the exclusive denominator.

`directCause` is the last lethal event. `contributingCause` is assigned only when the preceding mechanic has matching `stateDegradationEvidence`: silence requires spell opportunity loss, MP drain requires low-MP/cast failure/fallback, reflection requires actual reflect damage, action-economy mechanics require increased enemy actions followed by HP loss, anti-heal requires suppressed recovery, and regen/guard requires observed long-fight survival extension. Mechanic firing alone is not causal.

1. Of the former 83% raw label, **pure raw damage was 26,683 / 41,512 = 64.28%**.
2. **Mechanic-mediated raw lethal deaths were 5,692 / 41,512 = 13.71%**.
3. **Direct mechanic deaths were 8,388 / 41,512 = 20.21%**.
4. **Unknown/mixed deaths were 749 / 41,512 = 1.80%**. The four exclusive categories sum to **41,512 / 41,512 = 100.00%**.
5. Special-mechanic involvement, using only exclusive categories, was **14,080 / 41,512 = 33.92%** (mechanic-mediated raw lethal + direct mechanic death).
6. The largest multi-label contributing evidence among former raw deaths was **`reflection_chain`**, with 5,630 candidate observations; next were `status_lock_chain` 4,126 and `mp_starvation_chain` 1,233. These are evidence counts, not exclusive death counts.
7. Build×encounter×depth differences are substantial and explainable:
   - durable-single-target and protected-formation deaths are almost entirely pure raw walls;
   - swarm-action-pressure is action-economy mediated, especially for Single and Hybrid;
   - magic-denial separates pure physical deaths from silence/reflection-mediated deaths;
   - MP-pressure has the largest unknown/mixed population and longer degradation chains, with Sustain showing the longest mechanic→death mean;
   - the complete 144-cell matrix is in the Markdown evidence.
8. For traces with a preceding mechanism, firing→death latency was mean **1.65 rounds**, p50 **1**, p95 **4**. This is supplemental timing evidence, not the causal criterion.
9. Existing `chooseAutoCombatAction` was used unchanged. Expected spells were observed for all builds. Fallback totals were AoE 65, Single 0, Sustain 96, Hybrid 0; spell-opportunity losses were AoE 448, Single 411, Sustain 738, Hybrid 309. Representative silence, MP-drain, reflection, action-economy, and pure-raw traces show no systematic unnatural fallback. This is not expert-player AI and does not model manual input.
10. Fixtures are valid as controlled tests: all named monsters resolve from production `MONSTERS`, production trait chances/status patterns and resolver conditions remain active, and no synthetic balance values were added. They are **not** dungeon-frequency samples; 60 cells are 0/500 or 500/500 composition-specific extremes.
11. Next action: **B with a measurement follow-up**. Since pure raw is the majority of the old raw label, investigate non-depth raw sources, enemy count, and action count next. The causal measurement direction is **Keep** because it explains direct lethal damage separately from state degradation. #973 Build Confidence is **Revise**: build/encounter interaction is real, but the old raw label concealed both mechanic-mediated chains and a large pure-raw component.

No balance adjustment is proposed by this PR.

## Verification

- `npm run lint`
- `npm run test:unit`: 148 passed, 3 skipped
- `node --check scratch/measurements/issue973_build_sensitivity.js`
- `node --check src/combat_logic/damage.js`
- `node --check src/combat_logic/round.js`
- N=500 measurement completed with clean-tree provenance on the latest main descendant.
