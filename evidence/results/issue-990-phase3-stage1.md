# Issue #990 Phase 3 Stage 1 — virtual player population

- runner: `issue990-phase3-stage1-v1` / schema `1`
- seed: `issue990-phase3-stage1`; N: **500 / persona**
- production-backed, deterministic, B1-start, same-seed, forced-push; retreat behavior is not modeled

These personas are measurement policies, not claims about real player behavior. They measure sensitivity to simple, explainable play priorities.

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

## Reproduction

```sh
node scratch/measurements/issue990_phase3_stage1.js --runs 500 --seed issue990-phase3-stage1 --personas cautious,aggressive,explorer,stairs-first,balanced --output evidence/results/issue-990-phase3-stage1.json --summary evidence/results/issue-990-phase3-stage1.md
```
