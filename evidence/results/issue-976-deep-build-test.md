# Issue #976: deep Build Test measurement

## Scope and validity

- Runner: `scratch/measurements/issue973_build_sensitivity.js`, `issue973-build-sensitivity-v5`, schema 5.
- Source/base: `fb5ebe98aa20a48ccf5dbe539472c06f69e03fba` (PR #975 baseline).
- Selected after source: `54b0651` (`4a2b942` full HEAD, including tests).
- Same seed: `issue974-v0`; N=500 per build × encounter × depth; B8/B13/B18; 4 Mage builds × 6 fixtures.
- Baseline raw SHA-256: `5f78dac2c5c36b9422384ace753d0d2f8624f27ca23862f6827daca10cda9d67`.
- After raw SHA-256: `f2473b6aa6d2a03dbd8f8212e907721f40143fcf6a6b51f5afa622c09851e5fc`.
- `node --check` and N=1 smoke passed before measurement. Both N=500 runs used clean-tree provenance and the same runner/configuration.

The runner models production monster data, depth scaling, combat round resolution, auto-action, spell/affix/core/status rules. It omits map traversal, manual input, consumables/retreat, shops, loot/economy, and between-encounter progression.

## Diagnosis

The #975 baseline reproduced the deep wall: `14,784 / 17,686 = 83.59%` primary raw damage pressure. By depth, the raw share was B8 `81.14%`, B13 `83.67%`, and B18 `83.52%`.

The main contributors were composition cells where the encounter's mechanic could not pay off before ordinary attacks ended the fight:

- B13/B18 `magic-denial`: raw share `92.24% / 94.18%`.
- B13/B18 `mp-pressure`: `97.29% / 94.77%`.
- B13/B18 `durable-single-target`: `100.00% / 100.00%`.
- B13/B18 `protected-formation`: `100.00% / 100.00%`; the guard mechanic did not fire in this Mage spell-only fixture.
- `swarm-action-pressure` retained action-economy attribution (`8.53% / 10.41%` raw share), and `attrition-recovery-denial` retained resource/denial differences. These are the useful build-test interactions rather than a universal raw wall.

Depth scaling before/after for the enemy multiplier was:

| Depth | HP multiplier before | HP multiplier after | ATK multiplier | Interpretation |
| --- | ---: | ---: | ---: | --- |
| B8 | 1.313 | 1.313 | 1.182 | unchanged |
| B13 | 1.576 | 1.387 | 1.334 | HP growth stops at B10; ATK depth pressure remains |
| B18 | 1.858 | 1.387 | 1.498 | B18 remains harder than B13 through ATK and composition |

This separates the long-fight HP contribution from ATK/depth pressure without changing player HP/DEF, Mage abilities, or enemy ATK globally.

## Tuning sweep

All candidates were run at N=500 with the same seed. `reversal` is strict paired outcome+utility reversal; `deep raw` is B13+B18 primary raw damage share.

| Candidate | Deep raw | Strict reversal | Result |
| --- | ---: | ---: | --- |
| #975 baseline | 83.59% | 44 | reference |
| ATK growth `.40` | 83.01% | 40 | rejected: sensitivity loss |
| ATK growth `.25` | 82.00% | 34 | rejected: larger sensitivity loss |
| B10 cap for HP + ATK | 81.92% | 38 | rejected: B13/B18 became the same stat cell |
| B5 HP cap in all depths | 80.80% | 38 | rejected: changed B8 and weakened early baseline |
| **B11+ HP cap at B10; ATK unchanged** | **83.30%** | **50** | **selected Pareto-safe minimum** |

The selected lever improves deep raw deaths from `14,784` to `12,751` and deep deaths from `17,686` to `15,308`, while keeping B8 unchanged and increasing strict reversals. It does not claim the 60% red flag is solved.

## Before / after aggregate indicators

| Metric | Before | After |
| --- | ---: | ---: |
| Strict significant paired reversals | 44 | 50 |
| Raw clear-rate reversals (supplemental) | 40 | 39 |
| Deep raw damage pressure | 14,784/17,686 = 83.59% | 12,751/15,308 = 83.30% |
| Deep failure: action economy | 2,629 | 2,285 |
| Deep failure: reflection/counter | 245 | 252 |
| Deep failure: spell denial | 15 | 15 |
| Deep failure: MP starvation | 9 | 1 |
| Deep failure: status lock | 3 | 4 |
| Deep failure: unknown/mixed | 1 | 0 |
| Max resource-signature distance | 0.845 | 0.809 |
| Dominant-build best cells | Sustain 9, AoE 9 | Sustain 10, AoE 8 |

Depth-average resource signatures (HP after / MP after / spell actions / physical actions) were:

| Depth | Before | After |
| --- | --- | --- |
| B8 | 0.433 / 0.706 / 2.950 / 0.000 | 0.433 / 0.706 / 2.950 / 0.000 |
| B13 | 0.278 / 0.688 / 2.916 / 0.004 | 0.337 / 0.707 / 2.855 / 0.001 |
| B18 | 0.189 / 0.683 / 2.787 / 0.003 | 0.307 / 0.719 / 2.715 / 0.000 |

## After clear/death by encounter × build × depth

Each entry is `clear/death` over N=500.

| Depth | Encounter | AoE Burst | Single Efficient | Sustain | Hybrid Fallback |
| --- | --- | ---: | ---: | ---: | ---: |
| B13 | swarm-action-pressure | 81.6/18.4 | 0.8/99.2 | 89.2/10.8 | 8.2/91.8 |
| B13 | magic-denial | 17.6/82.4 | 8.0/92.0 | 3.4/96.6 | 0.0/100.0 |
| B13 | mp-pressure | 38.8/61.2 | 3.6/96.4 | 24.8/75.2 | 0.0/100.0 |
| B13 | durable-single-target | 15.8/84.2 | 47.8/52.2 | 78.8/21.2 | 0.0/100.0 |
| B13 | protected-formation | 84.0/16.0 | 40.4/59.6 | 83.0/17.0 | 7.4/92.6 |
| B13 | attrition-recovery-denial | 88.2/11.8 | 46.0/54.0 | 99.0/1.0 | 37.6/62.4 |
| B18 | swarm-action-pressure | 78.0/22.0 | 1.4/98.6 | 87.4/12.6 | 7.2/92.8 |
| B18 | magic-denial | 13.8/86.2 | 3.0/97.0 | 2.6/97.4 | 0.0/100.0 |
| B18 | mp-pressure | 33.8/66.2 | 2.4/97.6 | 17.4/82.6 | 0.0/100.0 |
| B18 | durable-single-target | 19.2/80.8 | 49.0/51.0 | 80.4/19.6 | 0.0/100.0 |
| B18 | protected-formation | 84.6/15.4 | 33.2/66.8 | 68.6/31.4 | 0.0/100.0 |
| B18 | attrition-recovery-denial | 88.4/11.6 | 31.0/69.0 | 99.2/0.8 | 33.8/66.2 |

## Decision

1. **主因:** depth HP scaling が長期戦を伸ばし、magic denial / MP pressure / durable / protected compositions で mechanic が発火・蓄積する前に通常攻撃で死亡していた。単純な全敵 ATK 一律過剰ではない。
2. **変更:** B11+ enemy HP multiplier を B10 水準で cap。HP/DEF、Mage、trait、encounter size は変更せず、ATK scaling は保持した。
3. **改善:** deep raw share `83.59%→83.30%`、raw-attributed deep deaths `14,784→12,751`。
4. **Strict reversal:** `44→50` で維持・増加。
5. **Dominance / hard counter:** best cells は Sustain 10 / AoE 8 の分散で、80% dominance なし。新規 hard-counter flag なし。ただし Hybrid の denial cells 0% clear は既存の弱点として残る。
6. **B11+ の評価:** B13/B18 の clear/death と build差は明確に広がり、単なる数値壁からは一歩近づいた。ただし raw share は 60% red flag を大きく上回るため、完全な Build Test とはまだ言えない。
7. **#973 Build Confidence:** **Revise**。encounter-conditioned build confidence と strict reversal は支持するが、深層では raw wall がなお支配的で、仮説は「build test が常に主役」ではなく「HP wall を越えた後に build cost が露呈する」形へ修正が必要。
