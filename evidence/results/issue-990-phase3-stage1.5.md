# Issue #990 Phase 3 Stage 1.5 — shallow MP/combat diagnosis

- runner: `issue990-phase3-stage1.5-v1` / schema `2`
- seed: `issue990-phase3-stage1`; N: **500 / persona**
- production-backed, deterministic, B1-start, same-seed, forced-push; retreat behavior is not modeled

These personas are measurement policies, not claims about real player behavior. They measure sensitivity to simple, explainable play priorities.
Stage 1 interpretation: persona differences are concentrated in exploration, equipment evaluation, and recovery thresholds. The basic Mage combat action selector is shared; this is not evidence from five fully distinct combat AIs.
Review response: Stage 1 changed exploration route budget, equipment weights, and HP/MP recovery thresholds. Combat action selection, spell targeting, enemy targeting, HP/MP payment rules, potion effects, and retreat behavior remained common across personas.
Current Mage combat policy: the production-backed simulation selector prefers KATINO on round 1 for multi-enemy encounters, otherwise the legacy Mage path prefers HALITO while payment is available, and falls back to a normal attack when it cannot pay. This Stage 1.5 run observes that policy; it does not make aggressive or cautious combat-specific.

## Table 1 — Reach

| persona | mean depth | B5 | B10 | B15 | B20 | B21 | B25 | B30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cautious | 1.68 | 5.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| aggressive | 1.67 | 4.8% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| explorer | 1.94 | 7.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| stairs-first | 1.68 | 5.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| balanced | 1.68 | 5.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

## Table 2 — Conditional survival

| persona | B5→B10 | B10→B15 | B15→B20 | B20→B21 | B21→B25 | B25→B30 |
| --- | --- | --- | --- | --- | --- | --- |
| cautious | 0.0% (n=25) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) |
| aggressive | 0.0% (n=24) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) |
| explorer | 0.0% (n=37) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) |
| stairs-first | 0.0% (n=25) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) |
| balanced | 0.0% (n=25) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) | n/a (n=0) |

## Table 3 — Resource state (checkpoint mean)

| checkpoint | persona | HP% | MP% | ATK | DEF | build score |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| B5 | cautious | 91.0% | 18.1% | 4.02 | 5.96 | 25.27 |
| B5 | aggressive | 93.1% | 18.3% | 4.13 | 6.00 | 18.63 |
| B5 | explorer | 89.5% | 15.4% | 5.23 | 5.54 | 18.75 |
| B5 | stairs-first | 91.2% | 17.7% | 4.02 | 5.96 | 20.68 |
| B5 | balanced | 91.7% | 17.7% | 4.02 | 5.96 | 18.85 |
| B10 | cautious | n/a | n/a | n/a | n/a | n/a |
| B10 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B10 | explorer | n/a | n/a | n/a | n/a | n/a |
| B10 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B10 | balanced | n/a | n/a | n/a | n/a | n/a |
| B15 | cautious | n/a | n/a | n/a | n/a | n/a |
| B15 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B15 | explorer | n/a | n/a | n/a | n/a | n/a |
| B15 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B15 | balanced | n/a | n/a | n/a | n/a | n/a |
| B20 | cautious | n/a | n/a | n/a | n/a | n/a |
| B20 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B20 | explorer | n/a | n/a | n/a | n/a | n/a |
| B20 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B20 | balanced | n/a | n/a | n/a | n/a | n/a |
| B21 | cautious | n/a | n/a | n/a | n/a | n/a |
| B21 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B21 | explorer | n/a | n/a | n/a | n/a | n/a |
| B21 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B21 | balanced | n/a | n/a | n/a | n/a | n/a |
| B25 | cautious | n/a | n/a | n/a | n/a | n/a |
| B25 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B25 | explorer | n/a | n/a | n/a | n/a | n/a |
| B25 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B25 | balanced | n/a | n/a | n/a | n/a | n/a |
| B30 | cautious | n/a | n/a | n/a | n/a | n/a |
| B30 | aggressive | n/a | n/a | n/a | n/a | n/a |
| B30 | explorer | n/a | n/a | n/a | n/a | n/a |
| B30 | stairs-first | n/a | n/a | n/a | n/a | n/a |
| B30 | balanced | n/a | n/a | n/a | n/a | n/a |

## Table 4 — Exposure

| persona | encounters/floor | steps/floor | normal damage/floor | enemy actions/floor | equipment changes/floor |
| --- | ---: | ---: | ---: | ---: | ---: |
| cautious | 5.70 | 79.43 | 17.08 | 15.44 | 1.54 |
| aggressive | 5.68 | 79.20 | 17.06 | 15.35 | 1.55 |
| explorer | 6.42 | 94.83 | 19.70 | 18.45 | 1.54 |
| stairs-first | 5.70 | 79.35 | 17.11 | 15.46 | 1.54 |
| balanced | 5.69 | 79.24 | 17.06 | 15.41 | 1.55 |

## Table 5 — Death causes

| persona | pure raw | mechanic-mediated | direct mechanic | unknown/mixed |
| --- | ---: | ---: | ---: | ---: |
| cautious | 92 (78.0%) | 1 (0.8%) | 17 (14.4%) | 8 (6.8%) |
| aggressive | 95 (78.5%) | 1 (0.8%) | 17 (14.0%) | 8 (6.6%) |
| explorer | 115 (67.6%) | 4 (2.4%) | 32 (18.8%) | 19 (11.2%) |
| stairs-first | 93 (77.5%) | 2 (1.7%) | 17 (14.2%) | 8 (6.7%) |
| balanced | 93 (76.9%) | 2 (1.7%) | 18 (14.9%) | 8 (6.6%) |

## Table 6 — Persona pair comparison

| pair | left deeper | same depth | right deeper | paired N |
| --- | ---: | ---: | ---: | ---: |
| cautious vs aggressive | 4 | 496 | 0 | 500 |
| cautious vs explorer | 1 | 433 | 66 | 500 |
| cautious vs stairs-first | 0 | 500 | 0 | 500 |
| cautious vs balanced | 1 | 499 | 0 | 500 |
| aggressive vs explorer | 0 | 431 | 69 | 500 |
| aggressive vs stairs-first | 0 | 496 | 4 | 500 |
| aggressive vs balanced | 0 | 497 | 3 | 500 |
| explorer vs stairs-first | 66 | 433 | 1 | 500 |
| explorer vs balanced | 66 | 434 | 0 | 500 |
| stairs-first vs balanced | 1 | 499 | 0 | 500 |

## Checkpoint population

Only reached checkpoint snapshots and at most 50 representative samples per persona × checkpoint are durable evidence. Full encounter histories remain in runner memory only.

- cautious B5: reached=25/500; HP p50=1.00; MP p50=0.11; ATK=4.02; DEF=5.96; equipment changes=3.20
- cautious B10: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- cautious B15: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- cautious B20: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- cautious B21: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- cautious B25: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- cautious B30: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B5: reached=24/500; HP p50=1.00; MP p50=0.12; ATK=4.13; DEF=6.00; equipment changes=3.08
- aggressive B10: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B15: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B20: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B21: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B25: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- aggressive B30: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B5: reached=37/500; HP p50=1.00; MP p50=0.08; ATK=5.23; DEF=5.54; equipment changes=3.35
- explorer B10: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B15: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B20: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B21: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B25: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- explorer B30: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B5: reached=25/500; HP p50=1.00; MP p50=0.11; ATK=4.02; DEF=5.96; equipment changes=3.16
- stairs-first B10: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B15: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B20: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B21: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B25: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- stairs-first B30: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B5: reached=25/500; HP p50=1.00; MP p50=0.11; ATK=4.02; DEF=5.96; equipment changes=3.16
- balanced B10: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B15: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B20: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B21: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B25: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a
- balanced B30: reached=0/500; HP p50=n/a; MP p50=n/a; ATK=n/a; DEF=n/a; equipment changes=n/a

## Answers

1. 到達深度の平均は 1.67〜1.94（幅 0.27）。explorer の B5 到達率は 7.4% で、他の balanced は 5.0%。
2. 最深到達 persona: explorer（平均 1.94 floor）。
3. 全面支配: なし。同一seedで両方向の深度逆転を観測した。
4. 探索量と装備成長: explorer は 94.83 steps/floor、4.78 drops/floor、1.54 changes/floor。balanced は 79.24、4.27、1.55 で、探索増加はdropと変更数を増やす方向だった。
5. 探索量と HP/MP 消耗: explorer の normal damage は 19.70/floor、B5 HP/MP は 89.5%/15.4%。balanced は 17.06/floor、91.7%/17.7% で、探索型の曝露増加と資源低下が同時に観測された。
6. 階段直行: stairs-first の B5 到達率は 5.0%、B5→B10 は 0.0%。この N では生存優位は確認できない。
7. cautious: B5 到達率 5.0%、平均深度 1.68 で、stairs-first/balanced と同程度。深層生存への優位は観測できない。
8. aggressive: 15.35 enemy actions/floor、10.85 rounds/floor。balanced の 15.41/10.87 とほぼ同じで、明確な短縮は確認できない。
9. B21+ population: cautious=B21 0, B25 0, B30 0; aggressive=B21 0, B25 0, B30 0; explorer=B21 0, B25 0, B30 0; stairs-first=B21 0, B25 0, B30 0; balanced=B21 0, B25 0, B30 0。全て unobserved。
10. population bottleneck: B5→B10 は 0.0% (n=37)。B10以降は全personaで分母0のため unobserved。
11. B5 は観測された最後の checkpoint で、explorer は HP/MP 89.5%/15.4%、ATK/DEF 5.23/5.54。B10到達者がいないため、B5→B10の後比較は行わず、deathSummaries に保存した。
12. pure raw: persona別割合は 67.6%〜78.5%。explorerだけ低めだが、全persona共通の増加とは言えない。
13. Phase 2 の「AIが弱すぎただけ」という説明は部分的に残るが、explorer の B5 差に対して全personaが同じ B5→B10 で崩れるため、ゲーム構造側のボトルネックも残る。
14. #973 Build Confidence: **Revise**。Stage 1 は persona run reach の測定であり、#975 encounter-level build confidence を置換しない。
15. #990 は **open のまま**。
16. Stage 2 は checkpoint population をレビューしてから進める。
17. production tuning は **行わない**。production src/ balance は変更していない。

## Stage 1.5 — shallow MP/combat diagnosis

Stage 1.5 measures B1–B9 only. It does not alter Mage combat action selection, production balance, or retreat behavior.
Stage 1 interpretation: these are five measurement policies sharing the same basic combat policy; Stage 1 did not implement five fully distinct combat AIs.
B5 checkpoint values below are conditional on reaching B5 (survivor bias). Floor exit is sampled after floor recovery/camp and before the transition recovery; the next floor entry includes transition recovery.

### Table A — Floor survival

| persona | floor | entered | survived | died | next-floor survival |
| --- | ---: | ---: | ---: | ---: | ---: |
| cautious | B1 | 500 | 168 | 67 | 33.6% |
| cautious | B2 | 168 | 98 | 7 | 58.3% |
| cautious | B3 | 98 | 49 | 14 | 50.0% |
| cautious | B4 | 49 | 25 | 11 | 51.0% |
| cautious | B5 | 25 | 0 | 19 | 0.0% |
| cautious | B6 | 0 | 0 | 0 | n/a |
| cautious | B7 | 0 | 0 | 0 | n/a |
| cautious | B8 | 0 | 0 | 0 | n/a |
| cautious | B9 | 0 | 0 | 0 | n/a |
| aggressive | B1 | 500 | 166 | 69 | 33.2% |
| aggressive | B2 | 166 | 96 | 9 | 57.8% |
| aggressive | B3 | 96 | 48 | 15 | 50.0% |
| aggressive | B4 | 48 | 24 | 11 | 50.0% |
| aggressive | B5 | 24 | 0 | 17 | 0.0% |
| aggressive | B6 | 0 | 0 | 0 | n/a |
| aggressive | B7 | 0 | 0 | 0 | n/a |
| aggressive | B8 | 0 | 0 | 0 | n/a |
| aggressive | B9 | 0 | 0 | 0 | n/a |
| explorer | B1 | 500 | 216 | 74 | 43.2% |
| explorer | B2 | 216 | 140 | 10 | 64.8% |
| explorer | B3 | 140 | 78 | 31 | 55.7% |
| explorer | B4 | 78 | 37 | 23 | 47.4% |
| explorer | B5 | 37 | 0 | 32 | 0.0% |
| explorer | B6 | 0 | 0 | 0 | n/a |
| explorer | B7 | 0 | 0 | 0 | n/a |
| explorer | B8 | 0 | 0 | 0 | n/a |
| explorer | B9 | 0 | 0 | 0 | n/a |
| stairs-first | B1 | 500 | 168 | 68 | 33.6% |
| stairs-first | B2 | 168 | 98 | 7 | 58.3% |
| stairs-first | B3 | 98 | 49 | 15 | 50.0% |
| stairs-first | B4 | 49 | 25 | 11 | 51.0% |
| stairs-first | B5 | 25 | 0 | 19 | 0.0% |
| stairs-first | B6 | 0 | 0 | 0 | n/a |
| stairs-first | B7 | 0 | 0 | 0 | n/a |
| stairs-first | B8 | 0 | 0 | 0 | n/a |
| stairs-first | B9 | 0 | 0 | 0 | n/a |
| balanced | B1 | 500 | 167 | 69 | 33.4% |
| balanced | B2 | 167 | 97 | 8 | 58.1% |
| balanced | B3 | 97 | 49 | 14 | 50.5% |
| balanced | B4 | 49 | 25 | 11 | 51.0% |
| balanced | B5 | 25 | 0 | 19 | 0.0% |
| balanced | B6 | 0 | 0 | 0 | n/a |
| balanced | B7 | 0 | 0 | 0 | n/a |
| balanced | B8 | 0 | 0 | 0 | n/a |
| balanced | B9 | 0 | 0 | 0 | n/a |

### Table B — HP/MP progression

| persona | floor | entry HP% | exit HP% | entry MP% | exit MP% | MP spent | MP recovered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cautious | B1 | 100.0% | 75.5% | 100.0% | 89.7% | 2.86 | 5.90 |
| cautious | B2 | 91.0% | 86.0% | 93.2% | 60.6% | 7.48 | 3.99 |
| cautious | B3 | 95.8% | 77.5% | 65.1% | 30.3% | 9.24 | 3.74 |
| cautious | B4 | 94.5% | 62.8% | 39.8% | 12.3% | 8.67 | 3.84 |
| cautious | B5 | 91.0% | 13.2% | 18.1% | 1.8% | 6.08 | 2.92 |
| cautious | B6 | n/a | n/a | n/a | n/a | n/a | n/a |
| cautious | B7 | n/a | n/a | n/a | n/a | n/a | n/a |
| cautious | B8 | n/a | n/a | n/a | n/a | n/a | n/a |
| cautious | B9 | n/a | n/a | n/a | n/a | n/a | n/a |
| aggressive | B1 | 100.0% | 74.9% | 100.0% | 89.5% | 2.88 | 5.90 |
| aggressive | B2 | 91.0% | 85.0% | 93.1% | 61.5% | 7.24 | 3.86 |
| aggressive | B3 | 96.2% | 76.9% | 65.4% | 31.2% | 9.02 | 3.64 |
| aggressive | B4 | 94.3% | 63.4% | 41.1% | 12.2% | 8.94 | 3.88 |
| aggressive | B5 | 93.1% | 13.8% | 18.3% | 2.0% | 6.13 | 3.04 |
| aggressive | B6 | n/a | n/a | n/a | n/a | n/a | n/a |
| aggressive | B7 | n/a | n/a | n/a | n/a | n/a | n/a |
| aggressive | B8 | n/a | n/a | n/a | n/a | n/a | n/a |
| aggressive | B9 | n/a | n/a | n/a | n/a | n/a | n/a |
| explorer | B1 | 100.0% | 73.6% | 100.0% | 87.0% | 3.61 | 6.37 |
| explorer | B2 | 91.5% | 84.6% | 91.0% | 54.6% | 8.46 | 3.97 |
| explorer | B3 | 94.4% | 71.3% | 61.4% | 25.8% | 9.72 | 3.85 |
| explorer | B4 | 93.9% | 56.1% | 36.0% | 10.0% | 8.85 | 4.46 |
| explorer | B5 | 89.5% | 10.5% | 15.4% | 1.8% | 6.08 | 3.54 |
| explorer | B6 | n/a | n/a | n/a | n/a | n/a | n/a |
| explorer | B7 | n/a | n/a | n/a | n/a | n/a | n/a |
| explorer | B8 | n/a | n/a | n/a | n/a | n/a | n/a |
| explorer | B9 | n/a | n/a | n/a | n/a | n/a | n/a |
| stairs-first | B1 | 100.0% | 75.3% | 100.0% | 89.6% | 2.87 | 5.90 |
| stairs-first | B2 | 91.0% | 86.0% | 93.2% | 60.9% | 7.44 | 3.96 |
| stairs-first | B3 | 95.7% | 77.3% | 65.0% | 30.5% | 9.12 | 3.68 |
| stairs-first | B4 | 94.5% | 62.6% | 40.5% | 12.1% | 8.92 | 3.94 |
| stairs-first | B5 | 91.2% | 13.2% | 17.7% | 1.8% | 5.88 | 2.80 |
| stairs-first | B6 | n/a | n/a | n/a | n/a | n/a | n/a |
| stairs-first | B7 | n/a | n/a | n/a | n/a | n/a | n/a |
| stairs-first | B8 | n/a | n/a | n/a | n/a | n/a | n/a |
| stairs-first | B9 | n/a | n/a | n/a | n/a | n/a | n/a |
| balanced | B1 | 100.0% | 75.1% | 100.0% | 89.5% | 2.87 | 5.90 |
| balanced | B2 | 91.0% | 85.3% | 93.2% | 61.0% | 7.37 | 3.90 |
| balanced | B3 | 95.6% | 78.1% | 64.9% | 30.7% | 9.09 | 3.73 |
| balanced | B4 | 94.5% | 62.9% | 40.5% | 12.2% | 8.96 | 4.00 |
| balanced | B5 | 91.7% | 13.2% | 17.7% | 1.8% | 5.88 | 2.80 |
| balanced | B6 | n/a | n/a | n/a | n/a | n/a | n/a |
| balanced | B7 | n/a | n/a | n/a | n/a | n/a | n/a |
| balanced | B8 | n/a | n/a | n/a | n/a | n/a | n/a |
| balanced | B9 | n/a | n/a | n/a | n/a | n/a | n/a |

### Table C — Combat actions and exposure

| persona | floor | encounters | spell casts | normal attacks | items | rounds | enemy actions | normal hits | normal damage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cautious | B1 | 2752 | 4879 | 0 | 4 | 4921 | 6590 | 3449 | 7850 |
| cautious | B2 | 950 | 1783 | 29 | 5 | 1826 | 2790 | 1227 | 2336 |
| cautious | B3 | 537 | 1169 | 158 | 4 | 1364 | 2366 | 1199 | 2030 |
| cautious | B4 | 247 | 560 | 243 | 6 | 835 | 1401 | 826 | 1274 |
| cautious | B5 | 107 | 225 | 159 | 3 | 422 | 729 | 525 | 914 |
| cautious | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cautious | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cautious | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cautious | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| aggressive | B1 | 2756 | 4889 | 0 | 2 | 4930 | 6604 | 3458 | 7883 |
| aggressive | B2 | 923 | 1723 | 29 | 0 | 1763 | 2687 | 1171 | 2253 |
| aggressive | B3 | 515 | 1124 | 155 | 2 | 1312 | 2269 | 1172 | 2020 |
| aggressive | B4 | 246 | 559 | 233 | 5 | 823 | 1389 | 812 | 1233 |
| aggressive | B5 | 103 | 214 | 179 | 4 | 430 | 725 | 524 | 886 |
| aggressive | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| aggressive | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| aggressive | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| aggressive | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| explorer | B1 | 3130 | 5558 | 0 | 3 | 5605 | 7562 | 3913 | 8656 |
| explorer | B2 | 1329 | 2514 | 67 | 5 | 2598 | 4023 | 1776 | 3327 |
| explorer | B3 | 782 | 1724 | 299 | 5 | 2088 | 3629 | 1917 | 3261 |
| explorer | B4 | 417 | 934 | 481 | 12 | 1477 | 2488 | 1564 | 2592 |
| explorer | B5 | 173 | 355 | 295 | 4 | 712 | 1198 | 875 | 1533 |
| explorer | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| explorer | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| explorer | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| explorer | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| stairs-first | B1 | 2755 | 4883 | 0 | 3 | 4925 | 6598 | 3456 | 7865 |
| stairs-first | B2 | 951 | 1776 | 29 | 4 | 1818 | 2774 | 1211 | 2305 |
| stairs-first | B3 | 529 | 1152 | 161 | 4 | 1348 | 2336 | 1187 | 2010 |
| stairs-first | B4 | 251 | 577 | 262 | 4 | 869 | 1462 | 868 | 1336 |
| stairs-first | B5 | 104 | 219 | 172 | 4 | 430 | 734 | 536 | 914 |
| stairs-first | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| stairs-first | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| stairs-first | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| stairs-first | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced | B1 | 2755 | 4884 | 0 | 2 | 4925 | 6598 | 3455 | 7865 |
| balanced | B2 | 939 | 1751 | 29 | 2 | 1791 | 2735 | 1192 | 2277 |
| balanced | B3 | 522 | 1141 | 154 | 3 | 1325 | 2295 | 1164 | 1983 |
| balanced | B4 | 251 | 573 | 263 | 4 | 866 | 1458 | 865 | 1326 |
| balanced | B5 | 104 | 219 | 173 | 4 | 431 | 736 | 538 | 916 |
| balanced | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Table D — Spell usage

| persona | spell ID | cast count | successful | total MP spent | cast share | target types |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| cautious | HALITO | 5896 | 5843 | 1072 | 68.4% | single_enemy:5896 |
| cautious | LAHALITO | 1120 | 1110 | 210 | 13.0% | all_enemies:1120 |
| cautious | KATINO | 1082 | 1077 | 2154 | 12.6% | all_enemies:1082 |
| cautious | MAHALITO | 518 | 516 | 732 | 6.0% | single_enemy:518 |
| aggressive | HALITO | 5848 | 5795 | 1068 | 68.7% | single_enemy:5848 |
| aggressive | LAHALITO | 1102 | 1092 | 207 | 13.0% | all_enemies:1102 |
| aggressive | KATINO | 1059 | 1053 | 2106 | 12.4% | all_enemies:1059 |
| aggressive | MAHALITO | 500 | 498 | 705 | 5.9% | single_enemy:500 |
| explorer | HALITO | 7218 | 7156 | 1328 | 65.1% | single_enemy:7218 |
| explorer | LAHALITO | 1495 | 1481 | 286 | 13.5% | all_enemies:1495 |
| explorer | KATINO | 1630 | 1623 | 3246 | 14.7% | all_enemies:1630 |
| explorer | MAHALITO | 742 | 740 | 1048 | 6.7% | single_enemy:742 |
| stairs-first | HALITO | 5890 | 5837 | 1073 | 68.4% | single_enemy:5890 |
| stairs-first | LAHALITO | 1122 | 1112 | 208 | 13.0% | all_enemies:1122 |
| stairs-first | KATINO | 1080 | 1075 | 2150 | 12.5% | all_enemies:1080 |
| stairs-first | MAHALITO | 515 | 513 | 731 | 6.0% | single_enemy:515 |
| balanced | HALITO | 5867 | 5814 | 1070 | 68.5% | single_enemy:5867 |
| balanced | LAHALITO | 1116 | 1106 | 204 | 13.0% | all_enemies:1116 |
| balanced | KATINO | 1075 | 1069 | 2138 | 12.5% | all_enemies:1075 |
| balanced | MAHALITO | 510 | 508 | 723 | 6.0% | single_enemy:510 |

### Table E — Combat-entry MP bucket

| persona | bucket | encounters | clear% | death% | pure raw death% | rounds | enemy actions | normal hits | normal damage | spell casts | normal attacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cautious | 0% | 67 | 9.0% | 41.8% | 34.3% | 2.76 | 4.58 | 4.06 | 6.63 | 0.07 | 1.79 |
| cautious | 1-25% | 352 | 89.5% | 1.7% | 0.3% | 3.94 | 6.56 | 4.35 | 7.22 | 2.47 | 1.33 |
| cautious | 26-50% | 327 | 99.4% | 0.3% | 0.3% | 2.24 | 3.85 | 1.66 | 2.60 | 2.23 | 0.00 |
| cautious | 51-75% | 538 | 99.3% | 0.7% | 0.7% | 1.97 | 3.19 | 1.23 | 2.26 | 1.97 | 0.00 |
| cautious | 76-100% | 3309 | 97.8% | 1.9% | 1.9% | 1.81 | 2.50 | 1.27 | 2.83 | 1.80 | 0.00 |
| aggressive | 0% | 64 | 9.4% | 43.8% | 35.9% | 2.86 | 4.78 | 4.23 | 6.94 | 0.08 | 1.88 |
| aggressive | 1-25% | 338 | 89.3% | 1.5% | 0.3% | 4.00 | 6.62 | 4.43 | 7.27 | 2.46 | 1.41 |
| aggressive | 26-50% | 313 | 99.4% | 0.3% | 0.3% | 2.23 | 3.84 | 1.65 | 2.65 | 2.23 | 0.00 |
| aggressive | 51-75% | 527 | 99.2% | 0.8% | 0.8% | 1.98 | 3.20 | 1.24 | 2.26 | 1.98 | 0.00 |
| aggressive | 76-100% | 3301 | 97.6% | 2.0% | 2.0% | 1.81 | 2.50 | 1.27 | 2.83 | 1.80 | 0.00 |
| explorer | 0% | 113 | 11.5% | 40.7% | 34.5% | 2.71 | 4.64 | 4.07 | 6.88 | 0.12 | 1.68 |
| explorer | 1-25% | 634 | 88.2% | 3.0% | 0.3% | 4.16 | 6.96 | 4.68 | 7.97 | 2.52 | 1.50 |
| explorer | 26-50% | 530 | 99.6% | 0.2% | 0.2% | 2.19 | 3.73 | 1.63 | 2.77 | 2.18 | 0.00 |
| explorer | 51-75% | 837 | 99.5% | 0.5% | 0.5% | 1.95 | 3.14 | 1.26 | 2.28 | 1.95 | 0.00 |
| explorer | 76-100% | 3717 | 97.7% | 1.9% | 1.9% | 1.81 | 2.52 | 1.26 | 2.74 | 1.80 | 0.00 |
| stairs-first | 0% | 67 | 9.0% | 43.3% | 34.3% | 2.93 | 4.93 | 4.42 | 7.21 | 0.07 | 1.96 |
| stairs-first | 1-25% | 346 | 89.6% | 1.7% | 0.3% | 4.05 | 6.73 | 4.47 | 7.34 | 2.50 | 1.42 |
| stairs-first | 26-50% | 323 | 99.4% | 0.3% | 0.3% | 2.23 | 3.83 | 1.63 | 2.57 | 2.22 | 0.00 |
| stairs-first | 51-75% | 545 | 99.3% | 0.7% | 0.7% | 1.98 | 3.19 | 1.25 | 2.28 | 1.97 | 0.00 |
| stairs-first | 76-100% | 3309 | 97.7% | 2.0% | 1.9% | 1.81 | 2.50 | 1.27 | 2.82 | 1.80 | 0.00 |
| balanced | 0% | 64 | 9.4% | 43.8% | 34.4% | 3.03 | 5.11 | 4.59 | 7.52 | 0.08 | 2.06 |
| balanced | 1-25% | 348 | 89.9% | 1.7% | 0.3% | 4.00 | 6.64 | 4.40 | 7.23 | 2.48 | 1.40 |
| balanced | 26-50% | 319 | 99.4% | 0.3% | 0.3% | 2.23 | 3.85 | 1.65 | 2.59 | 2.23 | 0.00 |
| balanced | 51-75% | 539 | 99.3% | 0.7% | 0.7% | 1.98 | 3.19 | 1.25 | 2.29 | 1.97 | 0.00 |
| balanced | 76-100% | 3301 | 97.7% | 2.0% | 2.0% | 1.81 | 2.50 | 1.27 | 2.82 | 1.80 | 0.00 |

### Table F — B5 entry MP vs later survival

| persona | B5 entry MP bucket | N | mean reached depth | B6 | B7 | B8 | B9 | B10 | status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| cautious | 0-10% | 12 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| cautious | 10-25% | 6 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| cautious | 25-50% | 5 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| cautious | 50%+ | 2 | 5.00 | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | insufficient |
| aggressive | 0-10% | 11 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| aggressive | 10-25% | 6 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| aggressive | 25-50% | 5 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| aggressive | 50%+ | 2 | 5.00 | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | insufficient |
| explorer | 0-10% | 22 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| explorer | 10-25% | 7 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| explorer | 25-50% | 5 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| explorer | 50%+ | 3 | 5.00 | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | insufficient |
| stairs-first | 0-10% | 12 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| stairs-first | 10-25% | 6 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| stairs-first | 25-50% | 5 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| stairs-first | 50%+ | 2 | 5.00 | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | insufficient |
| balanced | 0-10% | 12 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| balanced | 10-25% | 6 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| balanced | 25-50% | 5 | 5.00 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | observed |
| balanced | 50%+ | 2 | 5.00 | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | 0 (n/a) | insufficient |

### Table G — Persona combat differences (B1–B9)

| persona | spell casts/encounter | MP spent/encounter | normal attacks/encounter | rounds/encounter | enemy actions/encounter |
| --- | ---: | ---: | ---: | ---: | ---: |
| cautious | 1.88 | 0.91 | 0.13 | 2.04 | 3.02 |
| aggressive | 1.87 | 0.90 | 0.13 | 2.04 | 3.01 |
| explorer | 1.90 | 1.01 | 0.20 | 2.14 | 3.24 |
| stairs-first | 1.88 | 0.91 | 0.14 | 2.05 | 3.03 |
| balanced | 1.87 | 0.90 | 0.14 | 2.04 | 3.02 |

Representative samples are capped at 50 snapshots per persona × floor; individual combat telemetry is aggregated in memory and is not stored in evidence.

### Stage 1.5 answers

1. Population bottleneck: cautious=B5 (0.0%); aggressive=B5 (0.0%); explorer=B5 (0.0%); stairs-first=B5 (0.0%); balanced=B5 (0.0%).
2. MP decline: cautious=B1; aggressive=B1; explorer=B1; stairs-first=B1; balanced=B1.
3. HP vs MP: B5 entry survivor means are cautious HP 91.0%, MP 18.1%; aggressive HP 93.1%, MP 18.3%; explorer HP 89.5%, MP 15.4%; stairs-first HP 91.2%, MP 17.7%; balanced HP 91.7%, MP 17.7%; this is conditional on B5 entry.
4. Main spells: cautious=HALITO; aggressive=HALITO; explorer=HALITO; stairs-first=HALITO; balanced=HALITO.
5. MP shortage changing action: blocked decisions=cautious 889, aggressive 875, explorer 1724, stairs-first 918, balanced 911; this is telemetry of denied spell opportunities, not a causal proof.
6. Low-MP combats and rounds: compare Table E means; the observed direction is higher in at least one persona.
7. Low-MP combats and enemy actions: higher in at least one persona.
8. Low-MP combats and normal damage: higher in at least one persona.
9. Low-MP combats and pure raw death: cautious=34.3%; aggressive=35.9%; explorer=34.5%; stairs-first=34.3%; balanced=34.4%; do not treat this association as causation.
10. B5 MP and later survival: see Table F; buckets with N<5 are explicitly insufficient.
11. B5 HP ~90% is survivor-conditioned and cannot be read as the all-run state; floor entrant/death counts in Table A expose that selection.
12. aggressive combat behavior: 1.87 casts/encounter vs balanced 1.87; the shared selector means aggressive was not independently aggressive.
13. cautious MP conservation: 0.91 MP/encounter vs balanced 0.90; cautious did not implement combat-level MP conservation.
14. explorer tradeoff: explorer vs balanced is shown in Tables B/C and Stage 1 exposure; extra exploration should be interpreted as both equipment opportunity and additional exposure, not as a guaranteed benefit.
15. Stage 1 persona comparison confidence: limited to exploration, equipment scoring, and resource thresholds because combat selection was shared.
16. The “AI is merely too weak” explanation is weakened as a complete explanation only insofar as the missing combat-policy variation is now explicit; Stage 1 cannot establish a game-structure conclusion.
17. Next: implement a separately specified combat-persona experiment only after reviewing this diagnosis; do not silently alter this baseline.
18. Checkpoint resampling: not yet; first decide whether the shallow MP/action relationship warrants a combat-persona stage.
19. #973 Build Confidence: **Revise**; this remains a measurement baseline, not a build-confidence replacement.
20. #990 remains **open**.
21. Production tuning: **not recommended from Stage 1.5 alone**; no production balance or combat behavior was changed.

## Reproduction

```sh
node scratch/measurements/issue990_phase3_stage1_5.js --runs 500 --seed issue990-phase3-stage1 --personas cautious,aggressive,explorer,stairs-first,balanced --output evidence/results/issue-990-phase3-stage1.5.json --summary evidence/results/issue-990-phase3-stage1.5.md
```
