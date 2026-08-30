Closes #984

## Summary

This PR is measurement-only. It does not change production enemy HP/ATK, Mage stats, the defense formula, encounter pools, or production encounter generation.

It uses PR #983's exclusive `pure_raw_damage` classification as the baseline and runs the existing production-backed combat path at B8/B13/B18/B21/B25/B30 with the four existing Mage builds and six controlled fixtures. N=500 is used for every build × encounter × depth × condition cell with shared paired case seeds.

Evidence:

- [JSON evidence](evidence/results/issue-984-pure-raw-decomposition.json)
- [Markdown evidence](evidence/results/issue-984-pure-raw-decomposition.md)

## Counterfactual scope

- **C1_multi_enemy_to_single:** `monsters.slice(0, 1)`. This simplifies a multi-enemy fixture to its first production monster, changing enemy count, composition, later enemy role/trait, target priority, and multi-enemy interactions together. It is not an enemy-count-only experiment.
- **C2_disable_multi_action_extra:** suppresses only the extra action queued by the `multiAction` trait. Ordinary multiple enemies still retain one normal action each per round; this does not set total enemy actions per round to one. Total enemy-action-count contribution remains unresolved.
- **C3_fight_duration:** enemy HP ×0.50 only; enemy ATK and other enemy stats unchanged.
- **C4_single_hit_damage:** normal physical incoming damage ×0.50 after ordinary mitigation; status-payoff and snipe physical damage unchanged.

All conditions use the exact same derived case seed for paired comparison. The unit regression fixes that baseline reaches a multiAction extra turn, C2 removes only that extra turn, and C2 still retains three ordinary enemy turns for a three-enemy fixture.

## Result

The current-main baseline re-run produced 31,472 pure raw deaths in 72,000 controlled paired runs (43.71% incidence). PR #983's reference classification remains 26,683 / 41,512 = 64.28% within its legacy raw-death denominator; these are different denominators and are both retained.

Paired counterfactuals:

| Condition | Pure-raw reduction | Total-death reduction | Interpretation |
| --- | ---: | ---: | --- |
| C4 normal physical damage ×0.50 | 22.96pp | 23.11pp | largest isolated effect: single-hit normal physical damage |
| C3 enemy HP ×0.50, ATK unchanged | 16.13pp | 24.68pp | material effect: fight duration / processing time |
| C1 multi-enemy → single simplification | 5.54pp | 25.39pp | mixed composition simplification; not enemy-count-only |
| C2 disable multiAction extra | -2.12pp | -1.30pp | multiAction extra action not supported as the main cause in this controlled experiment |

C2 suppresses only the multiAction extra action and does not reduce ordinary enemy count or total enemy actions to one. Its pure-raw increase is partly a causal-label shift from action-economy-mediated deaths into pure raw; this result does not independently measure total enemy-action-count contribution.

## Required answers

1. **Single-hit normal physical damage:** halving ordinary normal physical damage produced the largest isolated pure-raw reduction (22.96pp). This is an experiment result, not a production tuning recommendation.

2. **Fight duration / processing time:** halving enemy HP with ATK unchanged produced a large pure-raw reduction (16.13pp), supporting a material duration/processing effect.

3. **Multi-enemy → single:** the simplification reduced pure raw by 5.54pp, but this combines enemy-count, composition, role/trait, targeting, and multi-enemy-interaction changes. Enemy count alone cannot be assigned 5.54pp.

4. **MultiAction extra action:** C2 did not improve pure raw in this controlled measurement. The supported statement is only that `multiAction`-trait extra actions were not supported as the main pure-raw cause here.

5. **Total enemy action count:** unresolved. C2 does not reduce ordinary one-action-per-living-enemy turns, so this measurement does not independently identify the contribution of total enemy actions per round.

6. **Controlled fixtures vs production generation:** fixtures average 2.33 enemies and have 3-enemy fixtures in 50% of the six cases. A separate `generateEncounter()` distribution sample at the same depths averages 1.64 enemies, with 3-enemy compositions at 0–4.4%. This is generated-distribution sampling, not observed full-run encounter frequency; controlled death rates are not global game death rates.

7. **Next production lever:** do not tune production yet. Run production-frequency-weighted measurement first, then test whether any targeted lever preserves build differentiation.

8. **#973 Build Confidence:** **Revise**. Build interaction is real, but C1/C2 have narrower meanings than their original labels and controlled fixture weighting is not dungeon frequency.

## Verification

- `npm run lint`
- `npm run test:unit` — 148 passed, 3 skipped
- `npm run build`
- `node --check` for the Issue #984 runner, #983 runner, and combat round module
- N=500 paired measurement with seed `974-build-confidence`, clean-tree provenance, latest `origin/main` base `61258b13ed5819ffd5e6fb373cbe9077b29102b0`
