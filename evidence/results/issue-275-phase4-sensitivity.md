# Issue #275 フェーズ4 測定仮定検証

## 判定

- N>=30の全主集計で判定可能。 探索係数 1.00 / 1.20 / 1.40 / 1.60 / 1.80 を同一seed・同一条件で掃引。
- `bossPolicy` 実効値は全factor・全rowで `engage`。`avoid` は既定測定に入っていない。
- 実run生成で midboss は0件。B5にmilestone boss 1件。B5→B6の切替は、B6測定から実runのB5へ入ること。
- `EXPLORATION_FACTOR` はゲーム本体の移動処理ではなく、simの synthetic `floorSteps`、route event / trap schedule / elite routeへ伝播する測定仮定。

## 係数感度分析（全職合算）

- factor=1.00: B5歩数 100.54 [98.72,102.37; N=2000] → B10 239.81 [233.51,246.11; N=2000]、B5→B10 paired歩数差 139.27 [133.86,144.68; N=2000]。
  - EV/時間: B5=0.3369 [0.3300,0.3437; N=2000] / B6=0.2233 [0.2186,0.2281; N=2000] / B7=0.2288 [0.2239,0.2338; N=2000] / B8=0.2316 [0.2264,0.2368; N=2000] / B9=0.2328 [0.2275,0.2382; N=2000] / B10=0.2339 [0.2285,0.2394; N=2000]。最大点=B5。
  - B5→B10実測時間: 160.96 [158.26,163.66; N=2000] → 370.21 [360.54,379.89; N=2000]。bossPolicy=engage。
  - raw SHA-256=54640b7dc9a4859a198da91c873e883773883b2f9df6dca972dafd12c7ddf987、summary SHA-256=cec2a1b22d404767996a76f842a78b6ecd4e5eef4375edb6c166302de81dc4c2。

- factor=1.20: B5歩数 122.83 [120.74,124.92; N=2000] → B10 290.69 [283.25,298.12; N=2000]、B5→B10 paired歩数差 167.86 [161.44,174.27; N=2000]。
  - EV/時間: B5=0.2958 [0.2901,0.3014; N=2000] / B6=0.1991 [0.1949,0.2032; N=2000] / B7=0.2041 [0.1998,0.2084; N=2000] / B8=0.2060 [0.2015,0.2105; N=2000] / B9=0.2056 [0.2009,0.2102; N=2000] / B10=0.2065 [0.2017,0.2112; N=2000]。最大点=B5。
  - B5→B10実測時間: 194.07 [191.00,197.15; N=2000] → 445.75 [434.44,457.06; N=2000]。bossPolicy=engage。
  - raw SHA-256=eaf57b3fb8a85334a98c4bd62ef07aef90e2d8ba83b64439835e7151382589e6、summary SHA-256=2ea2e363a53f891680cd17eed7f2e529ec0f9e7df6b3a74c48d7c1f68853f813。

- factor=1.40: B5歩数 140.46 [138.01,142.91; N=2000] → B10 326.33 [317.75,334.91; N=2000]、B5→B10 paired歩数差 185.87 [178.44,193.31; N=2000]。
  - EV/時間: B5=0.2642 [0.2591,0.2693; N=2000] / B6=0.1831 [0.1793,0.1870; N=2000] / B7=0.1871 [0.1831,0.1911; N=2000] / B8=0.1885 [0.1843,0.1926; N=2000] / B9=0.1899 [0.1857,0.1942; N=2000] / B10=0.1907 [0.1863,0.1950; N=2000]。最大点=B5。
  - B5→B10実測時間: 218.36 [214.84,221.87; N=2000] → 495.59 [482.56,508.61; N=2000]。bossPolicy=engage。
  - raw SHA-256=4731c1a4fd0474cf91e106b3b91db2790c57e2e2bde842a259ca7b2d279db57e、summary SHA-256=fbfe137975dc412d5d0c1390b8eb4d9ea58be1316a4c9f059c25ce71733b6604。

- factor=1.60: B5歩数 159.16 [156.54,161.79; N=2000] → B10 367.81 [358.19,377.42; N=2000]、B5→B10 paired歩数差 208.64 [200.26,217.02; N=2000]。
  - EV/時間: B5=0.2418 [0.2372,0.2463; N=2000] / B6=0.1692 [0.1657,0.1727; N=2000] / B7=0.1722 [0.1686,0.1759; N=2000] / B8=0.1731 [0.1694,0.1769; N=2000] / B9=0.1739 [0.1700,0.1777; N=2000] / B10=0.1749 [0.1709,0.1789; N=2000]。最大点=B5。
  - B5→B10実測時間: 243.31 [239.63,246.98; N=2000] → 547.55 [533.32,561.79; N=2000]。bossPolicy=engage。
  - raw SHA-256=d173c866c274f0a5f564577b2d16b383586e5deb28326e83bebea0b86d6fb99b、summary SHA-256=39472f1128a71de4aa86d0b218ca9a81f3ab711887eab19a12a47d56e0a08a7b。

- factor=1.80: B5歩数 175.53 [172.65,178.41; N=2000] → B10 403.17 [392.22,414.11; N=2000]、B5→B10 paired歩数差 227.64 [218.08,237.20; N=2000]。
  - EV/時間: B5=0.2214 [0.2172,0.2256; N=2000] / B6=0.1587 [0.1554,0.1620; N=2000] / B7=0.1620 [0.1586,0.1654; N=2000] / B8=0.1640 [0.1605,0.1675; N=2000] / B9=0.1659 [0.1623,0.1694; N=2000] / B10=0.1667 [0.1630,0.1703; N=2000]。最大点=B5。
  - B5→B10実測時間: 263.76 [259.72,267.79; N=2000] → 592.27 [576.30,608.25; N=2000]。bossPolicy=engage。
  - raw SHA-256=9968d5b55a9149da122193e2729473519ee1648b8da07c5a4200a318dc9d1e15、summary SHA-256=8e9fb730607acee1c3a835bee5787449b81e232aba1b398e5ec35d217051ae66。

## 実装・歩数モデル対照

- 生成map監査（runSeed=461:issue275-phase3:Fighter:0）: midboss floors=なし、milestone boss floors=5,10。
- B5 floor: criticalPath=22.00、boss経由 routeDistance=190.00、static=31.00、route=266.00。
- B5→B6の実run最短必須移動（B5 bossを踏んで階段へ）差=190.00歩。factor=1.40 synthetic予算差=266.00歩。
- B5: 実run最短=95.00、sim予算=134.00。B6: 実run最短=285.00、sim予算=400.00。
- 実装側は `src/movement.js` の成功したforward/backward 1マス移動が `recordExplorationSteps()` を呼ぶ。実装に `EXPLORATION_FACTOR` / `floorSteps` 予算はない。
- sim側は `metrics.bossPolicy = scenario.bossPolicy || "engage"`、`createFloorRoutePlan(..., metrics.bossPolicy)`、`floorSteps = max(round(criticalPath×factor), ceil(routeDistance×factor))`。
- `src/run_map_generator.js` は `generateRandomMap(..., legacyMilestones: false)` 後、5の倍数階だけ `placeMilestoneEvents()` を追加。旧 `src/map_generator.js` のfloor 3 midboss / floor 5 boss分岐は実run経路で使われない。
- したがって、B5→B6の形は実runのB5 milestone追加と、測定側factorによる synthetic歩数倍率が合成されたもの。設計変更前に基準線是正が必要。

## 方法・制約

- seed=461、対象B5/B6/B7/B8/B9/B10、factor=1.00,1.20,1.40,1.60,1.80。各factorは既存Phase 3測定経路を再実行。
- 通常測定: 各職N=500、全職合算 各深度N=2000、calibration N=100。
- 工房分布・報酬・drop・戦闘・撤退・死亡bankはPhase 3固定条件。`SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES`は未指定。B15/B20未測定。
- EV/時間はrun単位のbank素材 / timeCost。歩数差は同一(class, runIndex, scenario) paired。CIは正規近似95%、N<30は未確定。

## 再現

```sh
node --check scratch/measure_issue_275_phase4.js
node --check scratch/simulations/sim_depth_material_ev.js
node --check scratch/measure_issue_275_phase3_steps.js
ISSUE275_PHASE4_SMOKE=1 node scratch/measure_issue_275_phase4.js
node scratch/measure_issue_275_phase4.js
```

## 検証対象の結論

- factor=1.4 baseline B5→B6 paired歩数差: 130.39 [125.48,135.30; N=2000]。B5→B10: 185.87 [178.44,193.31; N=2000]。
- 本測定は仮定検証のみ。src balance値・報酬・design canon変更なし。
