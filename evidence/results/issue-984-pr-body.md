Closes #984

## Summary

This PR is measurement-only. It does not change production enemy HP/ATK, Mage stats, the defense formula, encounter pools, or production encounter generation.

It uses PR #983's exclusive `pure_raw_damage` classification as the baseline and runs the existing production-backed combat path at B8/B13/B18/B21/B25/B30 with the four existing Mage builds and six controlled fixtures. N=500 is used for every build × encounter × depth × condition cell with shared paired case seeds.

Evidence:

- [JSON evidence](evidence/results/issue-984-pure-raw-decomposition.json)
- [Markdown evidence](evidence/results/issue-984-pure-raw-decomposition.md)

## Result

The current-main baseline re-run produced 31,472 pure raw deaths in 72,000 controlled paired runs (43.71% incidence). PR #983's reference classification remains 26,683 / 41,512 = 64.28% within its legacy raw-death denominator; these are different denominators and are both retained.

Paired counterfactuals:

| Condition | Pure-raw reduction | Total-death reduction | Interpretation |
| --- | ---: | ---: | --- |
| C4 normal physical damage ×0.50 | 22.96pp | 23.11pp | largest isolated effect: single-hit damage |
| C3 enemy HP ×0.50, ATK unchanged | 16.13pp | 24.68pp | material effect: fight duration / processing time |
| C1 multi-enemy fixtures reduced to one | 5.54pp | 25.39pp | material overall effect, but fixture/build dependent |
| C2 one action per enemy per round | -2.12pp | -1.30pp | no improvement; label shifts expose why |

C2 suppresses only the multi-action extra action and does not reduce ordinary enemy count. Its pure-raw increase is partly a causal-label shift from action-economy-mediated deaths into pure raw; total deaths also increase slightly, so action count is not supported as the main lever by this experiment.

## Required answers

1. **主因:** single-hit normal physical damage is the largest isolated pure-raw contributor (C4, 22.96pp). Fight duration (C3, 16.13pp) and enemy count/concentration (C1, 5.54pp) are also material. Action count (C2) is not supported as a primary cause.

2. **寄与順位:** C4 single-hit damage > C3 fight duration > C1 enemy count/concentration > C2 action count. The order is an experiment ranking, not an additive decomposition.

3. **Build差:** yes. Baseline pure-raw incidence is AoE Burst 21.33%, Single Efficient 50.72%, Sustain 35.22%, Hybrid/Fallback 67.58%. Pure-raw death structures are therefore not interchangeable; the full 144-cell matrix includes hit size, received hit count, total normal damage, rounds, enemy count, and HP-removal speed per build × encounter × depth.

4. **Depth差:** B8→B30 pure-raw incidence rises 22.46%→57.96%. Among pure-raw deaths, mean normal hit rises 5.16→7.82, lethal hit 5.70→8.37, and normal damage total 19.77→23.48. Initial controlled-fixture enemy count stays 2.33 on average, while received normal attacks and rounds do not rise. All-run enemy HP removal speed rises 60.15→67.19 per round. The dominant depth signal is therefore stronger hits, with fight duration/processing capacity as a secondary interaction.

5. **Fixture極端さ:** the six controlled fixtures are fixed hand-picked stress cases, not dungeon-frequency samples. They average 2.33 enemies with count distribution 1/6 one-enemy, 2/6 two-enemy, 3/6 three-enemy. Production generation sampled at the same target depths averages 1.64 enemies; its three-enemy share is 0–4.4% by depth, versus 50% of controlled fixtures. Production compositions are included separately in the JSON. Controlled results must not be read as global death rates.

6. **次に本番で触るレバー:** none yet. Do not tune enemy HP/ATK, Mage, defense, encounter pools, or action rules from this controlled result alone. The next measurement should apply production-frequency weighting and then test whether a targeted lever preserves build differentiation.

7. **#973 Build Confidence:** **Revise**. Build interaction is real and strongly different across fixtures/depths, but the former raw label concealed a large pure-raw component and the controlled fixture mix over-represents extreme multi-enemy/stress compositions.

## Verification

- `npm run lint`
- `npm run test:unit` — 148 passed, 3 skipped
- `npm run build`
- `node --check` for the Issue #984 runner, #983 runner, and combat round module
- N=500 paired measurement with clean-tree provenance; source SHA and baseline SHA are recorded in the JSON/Markdown evidence
