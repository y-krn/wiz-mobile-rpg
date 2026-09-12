# #1198 B1F 継戦 resource cadence candidate

## 結論

B1Fの通常宝箱だけで `HEAL_POTION` の重みを1xから2xにする候補をproductionへ適用した。候補item、slot、chest数、回復量は変えず、combat-generated `fromDrop` 宝箱は変更していない。weighted selectorは従来どおり1回のRNG drawである。

同一条件のN=10,000 remeasureでは、2xでB2F arrivalが8.94%→9.58%、E1生存cohortの2戦目前resource opportunityが4.65%→7.76%、E2生存cohortの3戦目前が8.26%→13.46%になった。2xは目的に対する最小候補として採用する。3xは追加改善を示す感度上限であり、2xと同一視せず、今後の別判断用に保存する。

## 測定条件とprovenance

- fresh `vanguard` / `fight` / `production` / B1F、持ち込みresourceなし、targetDepth 2
- N=10,000/case、seed=1198、Node `v26.8.1`
- runner: `issue1198-continuation-resource-v2` / schema 10
- source HEAD: `6bc743386a8e07a94fc794a4566d963240dc948f`
- production gameplay/base: `ab4631e6bdcf1d819987649044e72907ac6ccc1c` (`origin/main` verified)
- environment hash: 1x `83bf861e9de261d2` / 2x `fd3b0723e6ee74db` / 3x `7b5958052c14e73f`
- measurement runner diff SHA-256: `711b5d323e0081ff494307d700b9175d4d17e95545ae585742eba77e34541bf2`
- all reports: `originMainAncestor=true`, `staleTreeAllowed=false`, `workingTreeClean=true`
-同一seedのN=1,000 candidate再実行はreport/summaryとも完全一致

1x/2x/3xは`--chest-heal-potion-weight`のmatched probe。probeはB1F ordinary sourceにだけ適用し、production map、敵、encounter pair、initiative、chest appearance、item chance、回復量を変更しない。

## Candidate comparison

| ordinary B1 HEAL_POTION weight | B1 death | B2 arrival | E1生存 | E2生存 | E3生存 | 2戦目前 resource | 3戦目前 resource |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1x baseline | 91.06% | 8.94% | 6,415 | 2,493 | 744 | 298/6,415 (4.65%) | 206/2,493 (8.26%) |
| 2x adopted | 90.42% | 9.58% | 6,444 | 2,533 | 780 | 500/6,444 (7.76%) | 341/2,533 (13.46%) |
| 3x sensitivity | 89.84% | 10.16% | 6,491 | 2,611 | 829 | 711/6,491 (10.95%) | 506/2,611 (19.38%) |

resource opportunityの分母は直前encounterを生存したcohort。target encounter未到達者は`endedBeforeArrival` / `deathsBeforeArrival`に残す。Wilson 95%区間は1x: E1 4.16–5.19%, E2 7.25–9.41%、2x: E1 7.13–8.44%, E2 12.19–14.85%、3x: E1 10.22–11.74%, E2 17.91–20.94%。

## 継続到達・HP・actual recovery

| weight | 1→2 arrival / cohort | 1→2 next-entry HP p25/p50/p75 (平均) | 2→3 arrival / cohort | 2→3 next-entry HP p25/p50/p75 (平均) | actual HP recovered before E2 / E3 |
|---:|---:|---:|---:|---:|---:|
| 1x | 4,918 / 6,415 | 6 / 10 / 14 (10.13) | 1,627 / 2,493 | 4 / 8 / 12 (8.59) | 2,518 / 2,248 |
| 2x | 4,954 / 6,444 | 6 / 10 / 15 (10.23) | 1,661 / 2,533 | 5 / 8 / 13 (8.85) | 4,059 / 3,685 |
| 3x | 4,993 / 6,491 | 6 / 10 / 15 (10.33) | 1,713 / 2,611 | 5 / 8 / 13 (9.11) | 5,732 / 5,457 |

自然entry HP band（E2/E3合算）は次のとおり。母数は各条件の到達entry数。

| weight | 25% band | 50% band | 75% band | 100% band |
|---:|---:|---:|---:|---:|
| 1x | 2,971 (45.39%) | 2,048 (31.29%) | 1,223 (18.69%) | 303 (4.63%) |
| 2x | 2,958 (44.72%) | 2,071 (31.31%) | 1,252 (18.93%) | 334 (5.05%) |
| 3x | 2,948 (43.96%) | 2,099 (31.30%) | 1,301 (19.40%) | 358 (5.34%) |

### Recovery funnel

| weight / target | cohort / arrived | acquired units | usable runs | beneficial runs | used runs | carried-unused runs | actual HP recovered |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x / E2 | 6,415 / 4,918 | 308 | 297 | 297 | 204 | 72 | 2,518 |
| 1x / E3 | 2,493 / 1,627 | 221 | 206 | 206 | 171 | 22 | 2,248 |
| 2x / E2 | 6,444 / 4,954 | 533 | 499 | 499 | 322 | 141 | 4,059 |
| 2x / E3 | 2,533 / 1,661 | 377 | 340 | 340 | 277 | 48 | 3,685 |
| 3x / E2 | 6,491 / 4,993 | 787 | 710 | 710 | 450 | 223 | 5,732 |
| 3x / E3 | 2,611 / 1,713 | 585 | 506 | 506 | 406 | 73 | 5,457 |

Source splitは循環しないbaselineも保存した。

- 1x: E2 `ordinary 287 / fromDrop 21`; E3 `ordinary 195 / fromDrop 25 / secretRoom 1`
- 2x: E2 `ordinary 511 / fromDrop 22`; E3 `ordinary 349 / fromDrop 27 / secretRoom 1`
- 3x: E2 `ordinary 766 / fromDrop 21`; E3 `ordinary 556 / fromDrop 29`

したがって、変更対象sourceをordinaryに限定する根拠は「変更後のsplit」ではなく、変更前1xでもfromDropが主供給源ではなく、さらにfromDropを変更しない境界を保てることにある。

## Loot / Build breadth and side effects

B1 ordinary main candidate poolは実際のRune込みで19候補。effective unit weightは1x=`1/19`、2x=`2/20`、3x=`3/21`であり、HEAL_POTION以外を候補から削除していない。ただし相対確率は当然低下するため、以下を実測した。

| weight | ordinary main events | HEAL_POTION | Rune | equipment | status cure | Bag peak occupancy p50/p75/p95 | object loot banked/lost |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1x | 22,155 | 633 (2.86%) | 4,056 (18.31%) | 15,414 (69.57%) | 2,052 (9.26%) | 1 / 2 / 3 | 3,834 / 19,677 |
| 2x | 22,251 | 1,196 (5.38%) | 3,905 (17.55%) | 15,177 (68.21%) | 1,973 (8.87%) | 1 / 2 / 3 | 4,022 / 19,190 |
| 3x | 22,430 | 1,800 (8.02%) | 3,745 (16.69%) | 14,984 (66.80%) | 1,901 (8.47%) | 1 / 2 / 3 | 4,187 / 18,809 |

`events`はB1 main reward eventの実測settlement内訳で、first guaranteed equipmentとitem chanceを含む。selector自体の相対確率は上記の19/20/21 weighted poolであり、event内訳をselector確率と混同しない。fromDrop mainは13候補・Runeなしで、HEAL_POTION weightは全条件1xのまま。

Meaningful reward opportunityは全条件92.74%。Build-change opportunityは1x 46.31%、2x 46.03%、3x 46.03%。ordinary内のequipment・Rune・status-cureはいずれも2x/3xで相対供給率が低下するが、候補削除やBag slot数変更ではない。したがって「副作用なし」ではなく、「2xは3xより横幅を抑えた最小candidate」と判定する。

## Fresh-save manual gate and parent #1184

Playwright headed browserでfresh local stateを2回確認した。鋼の前線キットを選び、B1Fを持ち込み0で開始。攻撃対象選択、攻撃、敵からの被ダメージ、逃走、追撃、1マス後退、前進・方向転換・探索を確認した。別runではHP20→8、毒針12 damageと毒、未鑑定レザーアーマー・指輪の獲得/保持、毒死、死因表示、失った戦果、図鑑への知識残存を確認した。

manual gateは#1198について通過と判定する。ただし#1184はcloseしない。#1198はresource carryover / B軸のcandidate・remeasure・manual gateを返却するが、親で残るA（early encounter Cost/cadence）およびD/Fの未完了課題は解消しない。#1184へこの結果を返却し、親IssueはOPEN継続とする。

## Verification

- modified JS `node --check`: pass
- `npm run test:unit`: pass（198 tests / 198 passed）
- `node tests/node/regression/test_starting_kit_diagnostic.js`: pass
- weighted selector unit test: one RNG draw / invalid weight rejection pass
- N=1,000 same-seed repeat: byte-identical report/summary pass
- N=10,000 matched 1x/2x/3x: pass、raw JSON/manifestはcommitせず`/private/tmp/issue-1198-final/`に保存
- current production CIはこの新HEAD push後に再実行する

再現例:

```sh
node scratch/measurements/starting_kit_diagnostic.js \
  --starting-kit vanguard \
  --policy fight \
  --recovery-policy production \
  --runs 10000 \
  --seed 1198 \
  --chest-heal-potion-weight 2 \
  --chest-heal-potion-source ordinary \
  --output /tmp/issue-1198-final/report.json \
  --summary /tmp/issue-1198-final/summary.md \
  --manifest /tmp/issue-1198-final/manifest.json \
  --purpose issue-1198-review-remediation \
  --ref issue/1198-resource-cadence
```
