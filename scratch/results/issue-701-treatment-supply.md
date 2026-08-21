# Issue #701 治療供給測定

- source SHA: `2fb9d494d57ae29358a1ff747e6252e74b46a41d`; origin/main/base SHA: `fe5ccc5734aefe6c12a29331665470db83fd7794`; ancestor=true; staleTreeAllowed=false
- runner: `scratch/issue701_treatment_supply.js -> scratch/sim_treatment_supply_701.js -> scratch/sim_depth_material_ev.js` (sim-scope: run; `generateRunFloor` 経由)
- 条件: 4職×500 run、seed=231、calibration=100、SIM_PARALLEL unset、B1→B20、#612 workshop distribution、run-independent hash seed
- raw JSONL: `/private/tmp/issue-701-treatment-supply.raw.jsonl`; SHA-256: `30734a7b0f729d9d79936377e1e0fdabd1486db466b242537e545557aca3dea2`
- reproduction: `node scratch/issue701_treatment_supply.js` (SIM_PARALLEL omitted; raw JSONL is written outside the repository)
- deterministic replicates: replicate 1 and 2 used identical seed/configuration; raw JSONL SHA-256 matched (`30734a7b0f729d9d79936377e1e0fdabd1486db466b242537e545557aca3dea2`); all five condition stdout hashes matched. Summary SHA differs only because wall/CPU timing fields are run-dependent.
- wall/CPU seconds: baseline=cal 30.02/30.55, sim 10.98/163.09; merchant-eye-panacea=cal 30.93/32.01, sim 11.26/167.38; merchant-eye-priced=cal 30.30/31.76, sim 10.69/158.73; departure-eye=cal 34.66/30.00, sim 15.90/233.36; chest-missing-status=cal 30.66/27.01, sim 14.44/202.30

## #692 tracking coverage

#692/PR #776 の tracking 修正後。状態治療の `statusCureItemsUsed` と per-item `consumableUsageByItem` の消費値を同時に集計し、二重計上していない。今回の status cure は実消費地点の専用 counter、mana は既存 source queue + per-item counter を使用。`WAKE_POWDER`/`PARALYZE_CURE` の EV負は unavailable ではなく policy-deferred と分離した。

## 条件別到達・MP・供給

| 条件 | 到達階平均 | 生還率 | MP残率 | MP枯渇率 | 素材chest share | 治療cure chest share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7.924 | 46.0% | 16.5% | 26.6% | 66.7% | 65.4% |
| merchant-eye-panacea | 8.000 | 46.2% | 16.4% | 26.3% | 66.3% | 55.7% |
| merchant-eye-priced | 7.963 | 46.7% | 16.4% | 26.5% | 66.7% | 60.0% |
| departure-eye | 7.446 | 45.9% | 17.4% | 25.6% | 67.3% | 64.4% |
| chest-missing-status | 7.089 | 51.1% | 18.4% | 24.9% | 67.4% | 85.5% |

素材chest share は素材総量に対する宝箱素材の割合（既知の約78%構造との照合）であり、治療品の取得率とは別集計。`治療cure chest share` は治療品取得個数に占める宝箱分で、素材収入へ換算していない。

## 状態別・階層別 unavailable

`decision attempts = selected + unavailable` は在庫有無を評価した全治療判定。`treatment-needed observed` は、在庫が存在してEV評価まで到達した正のEV判定。`available rate = selected / decision attempts` は供給制約の率として状態別に併記し、麻痺/睡眠のEV負（treatment-needed observed=0）は unavailable と混同しない。`observed` は状態付与の実測。

### baseline（現行供給）

| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| poisoned | modelled | 10578 | 6727 | 77742 | 6727 | 71015 | 8.7% | B1:1875 B2:7564 B3:10683 B4:11021 B5:12084 B6:1260 B7:2560 B8:3525 B9:3698 B10:6789 B11:702 B12:1267 B13:1691 B14:1407 B15:1631 B16:520 B17:740 B18:819 B19:643 B20:536 |
| blind | modelled | 4945 | 1375 | 18620 | 1375 | 17245 | 7.4% | B1:2926 B2:1828 B3:1867 B4:1512 B5:2101 B6:876 B7:756 B8:673 B9:727 B10:880 B11:724 B12:564 B13:394 B14:341 B15:318 B16:284 B17:202 B18:96 B19:121 B20:55 |
| paralyzed | modelled | 415 | 0 | 0 | 0 | 0 | — | B1:0 B2:0 B3:0 B4:0 B5:0 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |
| sleep | modelled | 709 | 0 | 190 | 0 | 190 | 0.0% | B1:52 B2:47 B3:31 B4:26 B5:34 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |

### merchant-eye-panacea（深層商人：目薬・万能薬（供給上限））

| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| poisoned | modelled | 10956 | 7365 | 73610 | 7365 | 66245 | 10.0% | B1:1875 B2:7559 B3:10680 B4:11020 B5:12078 B6:453 B7:1488 B8:2737 B9:3280 B10:6776 B11:279 B12:836 B13:1176 B14:1464 B15:1884 B16:310 B17:426 B18:560 B19:666 B20:698 |
| blind | modelled | 5278 | 2318 | 15774 | 2318 | 13456 | 14.7% | B1:2926 B2:1829 B3:1867 B4:1515 B5:2100 B6:100 B7:271 B8:415 B9:482 B10:589 B11:64 B12:143 B13:246 B14:214 B15:223 B16:62 B17:114 B18:158 B19:91 B20:47 |
| paralyzed | modelled | 432 | 0 | 0 | 0 | 0 | — | B1:0 B2:0 B3:0 B4:0 B5:0 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |
| sleep | modelled | 736 | 0 | 189 | 0 | 189 | 0.0% | B1:52 B2:47 B3:31 B4:26 B5:33 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |

### merchant-eye-priced（深層商人：目薬（霊粉1・価格制約））

| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| poisoned | modelled | 10687 | 6906 | 76887 | 6906 | 69981 | 9.0% | B1:1875 B2:7559 B3:10680 B4:11037 B5:12097 B6:1293 B7:2335 B8:3374 B9:3530 B10:6541 B11:647 B12:1232 B13:1525 B14:1355 B15:1682 B16:462 B17:656 B18:764 B19:657 B20:680 |
| blind | modelled | 5122 | 2007 | 16439 | 2007 | 14432 | 12.2% | B1:2926 B2:1829 B3:1867 B4:1510 B5:2105 B6:297 B7:440 B8:501 B9:526 B10:670 B11:107 B12:357 B13:304 B14:279 B15:273 B16:111 B17:137 B18:95 B19:63 B20:35 |
| paralyzed | modelled | 368 | 0 | 0 | 0 | 0 | — | B1:0 B2:0 B3:0 B4:0 B5:0 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |
| sleep | modelled | 713 | 0 | 189 | 0 | 189 | 0.0% | B1:52 B2:47 B3:31 B4:26 B5:33 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |

### departure-eye（出発kit：解毒薬→目薬）

| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| poisoned | modelled | 9752 | 4915 | 87747 | 4915 | 82832 | 5.6% | B1:7112 B2:12594 B3:13290 B4:11982 B5:11993 B6:1328 B7:2663 B8:3376 B9:3359 B10:5842 B11:790 B12:1394 B13:1435 B14:1017 B15:1577 B16:430 B17:657 B18:828 B19:675 B20:490 |
| blind | modelled | 4041 | 2300 | 11029 | 2300 | 8729 | 20.9% | B1:687 B2:698 B3:743 B4:730 B5:1267 B6:586 B7:433 B8:401 B9:574 B10:625 B11:413 B12:287 B13:233 B14:241 B15:269 B16:235 B17:137 B18:51 B19:85 B20:34 |
| paralyzed | modelled | 336 | 0 | 0 | 0 | 0 | — | B1:0 B2:0 B3:0 B4:0 B5:0 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |
| sleep | modelled | 650 | 0 | 195 | 0 | 195 | 0.0% | B1:49 B2:39 B3:34 B4:32 B5:41 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |

### chest-missing-status（宝箱：不足状態治療の補完）

| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| poisoned | modelled | 10630 | 9015 | 31373 | 9015 | 22358 | 28.7% | B1:1877 B2:7788 B3:6898 B4:3515 B5:1464 B6:112 B7:118 B8:168 B9:105 B10:266 B11:20 B12:15 B13:0 B14:11 B15:1 B16:0 B17:0 B18:0 B19:0 B20:0 |
| blind | modelled | 6532 | 4947 | 11491 | 4947 | 6544 | 43.1% | B1:2669 B2:1179 B3:867 B4:611 B5:834 B6:73 B7:48 B8:67 B9:70 B10:50 B11:24 B12:29 B13:10 B14:4 B15:0 B16:9 B17:0 B18:0 B19:0 B20:0 |
| paralyzed | modelled | 260 | 0 | 0 | 0 | 0 | — | B1:0 B2:0 B3:0 B4:0 B5:0 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |
| sleep | modelled | 911 | 0 | 159 | 0 | 159 | 0.0% | B1:51 B2:47 B3:25 B4:20 B5:16 B6:0 B7:0 B8:0 B9:0 B10:0 B11:0 B12:0 B13:0 B14:0 B15:0 B16:0 B17:0 B18:0 B19:0 B20:0 |

## 供給経路と selected/consumed

各条件の cure item は `acquired/consumed`。acquired の source は initial（開始在庫）、departureCraft（出発準備）、workshop（該当なし=0）、chest、merchant、combat。consumed は #692 の実消費地点で item 単位集計。

- **baseline**: ANTIDOTE 3963/3168, EYE_DROPS 755/473, PANACEA 2872/2234, PARALYZE_CURE 1034/0, WAKE_POWDER 1346/0, HOLY_WATER 3126/2226; acquired by source: initial={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; departureCraft={"ANTIDOTE":2000,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; workshop={}; chest={"ANTIDOTE":752,"HOLY_WATER":3126,"PANACEA":2872,"PARALYZE_CURE":296,"EYE_DROPS":755,"WAKE_POWDER":760}; combat={}; merchant={"ANTIDOTE":1211,"WAKE_POWDER":586,"PARALYZE_CURE":738}; selected={"selected":8102,"unavailable":88450,"policy-deferred":1064,"incapacitated":0}; statusesCured={"ANTIDOTE":3168,"HOLY_WATER":2226,"PANACEA":2234,"EYE_DROPS":473}; merchant attempts={"ANTIDOTE":1298,"WAKE_POWDER":590,"PARALYZE_CURE":738} failures={"insufficient_materials":7,"inventory_full":84}; merchant material spend={"獣の牙":431,"硬い皮":738,"毒腺":1211,"骨片":0,"霊粉":586,"魔石片":0,"鉄片":0,"呪布":0,"黒角":0,"竜鱗":0}
- **merchant-eye-panacea**: ANTIDOTE 3985/3185, EYE_DROPS 1966/1356, PANACEA 3826/2866, PARALYZE_CURE 1036/0, WAKE_POWDER 1348/0, HOLY_WATER 3156/2275; acquired by source: initial={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; departureCraft={"ANTIDOTE":2000,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; workshop={}; chest={"ANTIDOTE":752,"HOLY_WATER":3156,"PANACEA":2815,"PARALYZE_CURE":296,"EYE_DROPS":755,"WAKE_POWDER":760}; combat={}; merchant={"ANTIDOTE":1233,"WAKE_POWDER":588,"PARALYZE_CURE":740,"EYE_DROPS":1211,"PANACEA":1011}; selected={"selected":9683,"unavailable":79890,"policy-deferred":1221,"incapacitated":0}; statusesCured={"ANTIDOTE":3185,"HOLY_WATER":2275,"PANACEA":2866,"EYE_DROPS":1356}; merchant attempts={"ANTIDOTE":1320,"WAKE_POWDER":592,"PARALYZE_CURE":740,"EYE_DROPS":1364,"PANACEA":1157} failures={"inventory_full":383,"insufficient_materials":7}; merchant material spend={"獣の牙":427,"硬い皮":740,"毒腺":1233,"骨片":0,"霊粉":588,"魔石片":0,"鉄片":0,"呪布":0,"黒角":0,"竜鱗":0}
- **merchant-eye-priced**: ANTIDOTE 3981/3181, EYE_DROPS 1922/1287, PANACEA 2883/2161, PARALYZE_CURE 1037/0, WAKE_POWDER 1347/0, HOLY_WATER 3151/2283; acquired by source: initial={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; departureCraft={"ANTIDOTE":2000,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; workshop={}; chest={"ANTIDOTE":752,"HOLY_WATER":3151,"PANACEA":2883,"PARALYZE_CURE":296,"EYE_DROPS":755,"WAKE_POWDER":760}; combat={}; merchant={"ANTIDOTE":1229,"WAKE_POWDER":587,"PARALYZE_CURE":741,"EYE_DROPS":1167}; selected={"selected":8913,"unavailable":84602,"policy-deferred":1060,"incapacitated":0}; statusesCured={"ANTIDOTE":3181,"HOLY_WATER":2283,"PANACEA":2161,"EYE_DROPS":1287}; merchant attempts={"ANTIDOTE":1316,"WAKE_POWDER":591,"PARALYZE_CURE":741,"EYE_DROPS":1346} failures={"insufficient_materials":35,"inventory_full":235}; merchant material spend={"獣の牙":429,"硬い皮":741,"毒腺":1229,"骨片":0,"霊粉":1754,"魔石片":0,"鉄片":0,"呪布":0,"黒角":0,"竜鱗":0}
- **departure-eye**: ANTIDOTE 1950/1596, EYE_DROPS 2766/1634, PANACEA 2545/1938, PARALYZE_CURE 928/0, WAKE_POWDER 1304/0, HOLY_WATER 2829/2046; acquired by source: initial={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; departureCraft={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":2000,"PARALYZE_CURE":0,"WAKE_POWDER":0}; workshop={}; chest={"ANTIDOTE":758,"HOLY_WATER":2829,"PANACEA":2545,"EYE_DROPS":766,"PARALYZE_CURE":269,"WAKE_POWDER":766}; combat={}; merchant={"ANTIDOTE":1192,"WAKE_POWDER":538,"PARALYZE_CURE":659}; selected={"selected":7215,"unavailable":91756,"policy-deferred":1010,"incapacitated":0}; statusesCured={"ANTIDOTE":1596,"EYE_DROPS":1634,"PANACEA":1938,"HOLY_WATER":2046}; merchant attempts={"ANTIDOTE":1281,"WAKE_POWDER":539,"PARALYZE_CURE":662} failures={"inventory_full":89,"insufficient_materials":4}; merchant material spend={"獣の牙":404,"硬い皮":659,"毒腺":1192,"骨片":0,"霊粉":538,"魔石片":0,"鉄片":0,"呪布":0,"黒角":0,"竜鱗":0}
- **chest-missing-status**: ANTIDOTE 3733/2927, EYE_DROPS 2953/1793, PANACEA 17326/7477, PARALYZE_CURE 948/0, WAKE_POWDER 1304/0, HOLY_WATER 2687/1764; acquired by source: initial={"ANTIDOTE":0,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; departureCraft={"ANTIDOTE":2000,"HOLY_WATER":0,"PANACEA":0,"EYE_DROPS":0,"PARALYZE_CURE":0,"WAKE_POWDER":0}; workshop={}; chest={"ANTIDOTE":750,"EYE_DROPS":2953,"HOLY_WATER":2687,"PANACEA":17326,"PARALYZE_CURE":282,"WAKE_POWDER":768}; combat={}; merchant={"ANTIDOTE":983,"WAKE_POWDER":536,"PARALYZE_CURE":666}; selected={"selected":13962,"unavailable":29061,"policy-deferred":1071,"incapacitated":0}; statusesCured={"ANTIDOTE":2927,"HOLY_WATER":1764,"PANACEA":7477,"EYE_DROPS":1793}; merchant attempts={"ANTIDOTE":1043,"WAKE_POWDER":540,"PARALYZE_CURE":666} failures={"inventory_full":52,"insufficient_materials":12}; merchant material spend={"獣の牙":594,"硬い皮":666,"毒腺":983,"骨片":0,"霊粉":536,"魔石片":0,"鉄片":0,"呪布":0,"黒角":0,"竜鱗":0}

### 到達階・生還率（職別）

| 条件 | 職 | 到達階平均 | 生還率 | MP残率 | MP枯渇率 | unavailable |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| baseline | Fighter | 7.720 | 73.2% | 3.2% | 0.0% | 31798 |
| baseline | Thief | 8.160 | 41.0% | 0.7% | 0.0% | 2138 |
| baseline | Priest | 4.606 | 10.8% | 33.2% | 42.8% | 18112 |
| baseline | Mage | 11.210 | 58.8% | 28.8% | 63.4% | 36402 |
| merchant-eye-panacea | Fighter | 7.968 | 71.6% | 3.3% | 0.0% | 29291 |
| merchant-eye-panacea | Thief | 8.148 | 42.6% | 0.7% | 0.0% | 1902 |
| merchant-eye-panacea | Priest | 4.724 | 11.0% | 33.0% | 42.8% | 17168 |
| merchant-eye-panacea | Mage | 11.158 | 59.4% | 28.7% | 62.4% | 31529 |
| merchant-eye-priced | Fighter | 7.814 | 73.0% | 3.3% | 0.0% | 30936 |
| merchant-eye-priced | Thief | 8.168 | 41.8% | 0.5% | 0.0% | 1976 |
| merchant-eye-priced | Priest | 4.598 | 12.0% | 33.3% | 42.8% | 17301 |
| merchant-eye-priced | Mage | 11.270 | 59.8% | 28.4% | 63.0% | 34389 |
| departure-eye | Fighter | 6.768 | 72.2% | 2.9% | 0.0% | 32474 |
| departure-eye | Thief | 8.194 | 42.8% | 0.7% | 0.0% | 1455 |
| departure-eye | Priest | 4.232 | 13.2% | 34.7% | 42.4% | 19915 |
| departure-eye | Mage | 10.590 | 55.4% | 31.2% | 59.8% | 37912 |
| chest-missing-status | Fighter | 7.358 | 77.4% | 3.2% | 0.0% | 11671 |
| chest-missing-status | Thief | 6.600 | 48.4% | 0.4% | 0.0% | 748 |
| chest-missing-status | Priest | 4.670 | 14.4% | 33.8% | 44.2% | 8178 |
| chest-missing-status | Mage | 9.728 | 64.4% | 36.3% | 55.4% | 8464 |

### Mana and relevant resource outcomes

- **baseline**: MANA acquired={"starting":0,"departureCraft":0,"chest":532,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":195,"merchant":0,"other":0}; HOLY_WATER acquired={"starting":0,"departureCraft":0,"chest":3126,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":2226,"merchant":0,"other":0}; material sources={"chest":226290,"combat":109478,"quest":2214,"other":1042}
- **merchant-eye-panacea**: MANA acquired={"starting":0,"departureCraft":0,"chest":534,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":195,"merchant":0,"other":0}; HOLY_WATER acquired={"starting":0,"departureCraft":0,"chest":3156,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":2275,"merchant":0,"other":0}; material sources={"chest":228368,"combat":113012,"quest":2235,"other":1035}
- **merchant-eye-priced**: MANA acquired={"starting":0,"departureCraft":0,"chest":535,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":196,"merchant":0,"other":0}; HOLY_WATER acquired={"starting":0,"departureCraft":0,"chest":3151,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":2283,"merchant":0,"other":0}; material sources={"chest":227611,"combat":110491,"quest":2225,"other":902}
- **departure-eye**: MANA acquired={"starting":0,"departureCraft":0,"chest":527,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":184,"merchant":0,"other":0}; HOLY_WATER acquired={"starting":0,"departureCraft":0,"chest":2829,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":2046,"merchant":0,"other":0}; material sources={"chest":211328,"combat":99739,"quest":2109,"other":986}
- **chest-missing-status**: MANA acquired={"starting":0,"departureCraft":0,"chest":0,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":0,"merchant":0,"other":0}; HOLY_WATER acquired={"starting":0,"departureCraft":0,"chest":2687,"merchant":0,"other":0} consumed={"starting":0,"departureCraft":0,"chest":1764,"merchant":0,"other":0}; material sources={"chest":200816,"combat":93894,"quest":2135,"other":1006}

## Counterfactual definition and comparison

- `baseline`: current fixed #691/#736-style depth conditions with departure kit `TOWN_PORTAL + 4×HEAL_POTION + ANTIDOTE + GUARD_POTION` and current source chest/merchant pools.
- `merchant-eye-panacea`: prior measurement-only free-grant upper bound. At each milestone, missing `EYE_DROPS` and `PANACEA` are granted without a source price or material spend; it remains a clearly labeled availability ceiling, not a price recommendation.
- `merchant-eye-priced`: measurement-only price-constrained EYE_DROPS case. It uses canonical `霊粉:1` from `.agents/game-design.md` and the existing merchant affordability, 20-slot inventory-capacity, material-spend, and purchase-path semantics. PANACEA is not included because no authoritative project price was found.
- `departure-eye`: source departure recipe override replaces the one `ANTIDOTE` with one existing `EYE_DROPS` recipe (same one-item kit slot; source craft cost is used).
- `chest-missing-status`: when the source chest roll returns a non-equipment, non-status-cure usable, measurement-only remap gives `EYE_DROPS` on B1–B2 and `PANACEA` on B3+, preserving existing status-cure chest results. This is a supply upper-bound for the missing-depth pool, not a production rule.

| Condition | Δ reached vs baseline | Δ survival | Δ unavailable total | blind available rate | poison available rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| merchant-eye-panacea | 0.075 | 0.2pt | -8560 | 14.7% | 10.0% |
| merchant-eye-priced | 0.038 | 0.7pt | -3848 | 12.2% | 9.0% |
| departure-eye | -0.478 | -0.1pt | 3306 | 20.9% | 5.6% |
| chest-missing-status | -0.835 | 5.2pt | -59389 | 43.1% | 28.7% |

## Decision

Measurement-first conclusion: no production supply change is implemented here. The free-grant merchant upper bound measures the ceiling; the price-constrained EYE_DROPS case measures the current `霊粉:1` affordability/inventory-limited direction. PANACEA remains not decision-ready because no authoritative project price exists; no price was fabricated. The measured comparison supports deciding EYE_DROPS separately from PANACEA, but does not authorize a production stock change or settle desired chest-pool semantics.

## Verification and risks

- Required: node --check, N=1 smoke, N=500/class measurement, raw stdout SHA-256 replicate, npm run lint, npm run test:unit, git diff --check.
- Omitted from this sim (tracked as model gaps, not zero supply): production-only ETHER/noise/escape/elixir paths; combat item choices beyond existing sim policy. The state cure path itself is modelled for all four requested statuses.
- No `src/` changes, no production merchant stock/item-effect/threshold/EV/economy changes, and no `.agents/content-design.md` update because no production content was changed.
- PANACEA pricing: unresolved/not decision-ready. Project canon/source defines its effect and chest availability but does not define an authoritative merchant material price.
