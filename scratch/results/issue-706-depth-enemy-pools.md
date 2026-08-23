# Issue #706 depth-dependent enemy pools

## Decision

Implemented the smallest measured change: biome enemy identity is preserved;
blind- and sleep-capable enemies have weight `0` on local floor 1 and normal
weight `1` from local floor 2 onward. Normal enemies and all encounter-size
weights are unchanged. A broader level-based weighting candidate was rejected
because it reduced the full-depth B10 arrival point estimate from 31.55% to
28.25%.

## Provenance and matched conditions

- Base source: `df08931fb9eb2208acaf4f17e5e430589f270276`.
- Final source: `6351f22181cb0275109d3b74fdabb431e0a0dbf5`.
- `origin/main` matched the supplied base and was an ancestor of both runs;
  stale-tree override was not used.
- Node: `v26.7.0`; `SIM_PARALLEL` omitted, runtime parallelism `15`.
- Seed `231`; `SIM_RUNS=500`; `SIM_CALIBRATION_RUNS=100`; classes
  Fighter/Thief/Priest/Mage; six observed workshop scenarios; powder
  identification; EV flee and status-cure policy; conservative traps; current
  #627/#736-style departure kit with `TOWN_PORTAL`.
- Full-depth runner: `scratch/issue624_commit_depth.js`, baseline-portal-flee,
  B1 start/B21 target, 2,000 rows per condition. Base raw SHA-256
  `0508b18b102b3dcee8e585979d904d233e4a35ad2721b9249325103fc65263bb`;
  final raw SHA-256
  `98eb262fefa8655f18ad4c8b8e53ebb7d817a000ce1bfda5ee4eebdb1d233aad`.
  Both repeated runs produced the same raw SHA. Summary env hashes were
  `0077004b5fa2b729` (base) and `4efccf4cdc6864e3` (final).
- Current four-class baseline validation (base remeasurement):
  `baseline-portal-flee` measured Fighter `7.1700`, Thief `9.1960`,
  Priest `3.8880`, Mage `10.1480`; N=500 per class (2,000 rows).
  Source SHA `df08931fb9eb2208acaf4f17e5e430589f270276`; raw SHA-256
  `0508b18b102b3dcee8e585979d904d233e4a35ad2721b9249325103fc65263bb`;
  env hash `0077004b5fa2b729`; resolved parallelism 15; stale-tree override
  not used. The runner's updated baseline measurement guard passed: all four
  means were finite and all four sample counts were exactly 500.
- The historical #627/#736 tracking tuple
  (Fighter `7.9200` / Thief `8.5500` / Priest `4.9480` / Mage
  `6.9580`) is retained only as historical context; it is not reproduced by
  the supplied current base/source and is no longer used as an assertion.
- Post-review remeasurement at the supplied PR HEAD
  `ccd463a7f5af263c33ad0a825c4d565c4727fa95` produced
  Fighter `7.0300` / Thief `8.9240` / Priest `4.0440` / Mage
  `9.8800`, again N=500 per class; raw SHA-256
  `9bbe26e3f08ff6582a53e4735603d5273156480f328eaadf813a7ba47aa83d05`,
  env hash `5831171ec0ff70bc`, and baseline measurement guard PASS.
- Exact baseline command/config:
  `node scratch/issue624_commit_depth.js`; `SIM_SEED=231`,
  `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`,
  `STATUS_CURE_POLICY=ev`, `FLEE_POLICY=ev`,
  `TRAP_POLICY=conservative`, powder identification,
  `DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`,
  six observed workshop scenarios, `SIM_PARALLEL` and
  `SIM_MAP_CACHE_ENTRIES` omitted (runtime defaults).
- Floor/status runner: `scratch/issue706_depth_enemy_pools.js`, same config,
  B1-B5 traversal to B6, 500 runs per scenario and 100 calibration runs per
  scenario (3,000 total; 750 per class). Output schema is
  `issue706-depth-enemy-pools-v1`; newline-delimited canonical JSON SHA-256 was
  `1ec1b5e46a5f67a1b2e4c69aa1917d8b3cffd7630a21282ac753e777bec3861e` (base)
  and `4afe759ba230da872412396afbed2df1d957541cfbee4e3962194180809acd45`
  (final), each repeated identically.

## Floor-level normal encounter distribution

Counts are enemy units in observed normal encounters across all six scenarios;
they are not biome-collapsed. `before → final after`:

| floor | distribution |
| --- | --- |
| B1 | かみつき蟲 1095→1403; コボルトの斥候 1108→1300; マッドスライム 1064→1391; フラッシュバット 1143→0; 分裂スライム 1288→1536; 錆びた盾兵 575→633; ゴブリンの呪術師 1037→1321; 群れネズミ 1257→1464; 火薬コウモリ 1175→1424; まどろみ胞子 1163→0; 泥の呪い子 1061→1427 |
| B2 | かみつき蟲 1194→1092; コボルトの斥候 1205→1185; マッドスライム 1107→1177; フラッシュバット 1090→1086; 分裂スライム 1249→1228; 錆びた盾兵 771→710; ゴブリンの呪術師 1208→1239; 群れネズミ 1161→1163; 火薬コウモリ 1208→1202; まどろみ胞子 1199→1167; 泥の呪い子 1137→1030 |
| B3 | かみつき蟲 1328→1324; コボルトの斥候 1351→1426; マッドスライム 1360→1352; フラッシュバット 1042→1066; 分裂スライム 1383→1354; 錆びた盾兵 936→1027; ゴブリンの呪術師 1323→1241; 群れネズミ 1183→1253; 火薬コウモリ 1365→1350; まどろみ胞子 1116→1183; 泥の呪い子 1102→1106 |
| B4 | かみつき蟲 1193→1245; コボルトの斥候 1210→1151; マッドスライム 1256→1221; フラッシュバット 1027→1001; 分裂スライム 1199→1215; 錆びた盾兵 1006→987; ゴブリンの呪術師 1273→1217; 群れネズミ 1207→1244; 火薬コウモリ 1133→1242; まどろみ胞子 952→1030; 泥の呪い子 996→1004 |
| B5 | かみつき蟲 1744→1792; コボルトの斥候 1665→1769; マッドスライム 1787→1780; フラッシュバット 1483→1476; 分裂スライム 1663→1661; 錆びた盾兵 1438→1496; ゴブリンの呪術師 1733→1790; 群れネズミ 1862→1879; 火薬コウモリ 1799→1715; まどろみ胞子 1378→1393; 泥の呪い子 1549→1547 |

## Status and outcome measurements

The diagnostic pass counted exact combat-log applications from enemy normal
encounters. Wilson 95% intervals are used; all primary denominators are at
least 30.

| metric | base | final |
| --- | ---: | ---: |
| B1 blind applications | 402 | 0 |
| B1 sleep applications | 147 | 0 |
| B1 deaths / all runs | 193/3000 (6.43%) | 205/3000 (6.83%) |
| B1 retreats / all runs | 0/3000 | 0/3000 |
| Diagnostic B5 deaths / B5 entrants | 585/1956 (29.91%) | 601/1972 (30.48%) |

The full-depth four-class run gives the matched progression endpoints:

| class | B5 entrant | B5 death / entrant | B10 arrival |
| --- | ---: | ---: | ---: |
| all | 1427→1401 | 358/1427 (25.09%) → 373/1401 (26.62%) | 631/2000 (31.55%) → 619/2000 (30.95%) |
| Fighter | 352→336 | 42/352 (11.93%) → 42/336 (12.50%) | 144/500 (28.8%) → 137/500 (27.4%) |
| Thief | 477→463 | 162/477 (33.96%) → 184/463 (39.74%) | 210/500 (42.0%) → 204/500 (40.8%) |
| Priest | 172→181 | 106/172 (61.63%) → 100/181 (55.25%) | 35/500 (7.0%) → 39/500 (7.8%) |
| Mage | 426→421 | 48/426 (11.27%) → 47/421 (11.16%) | 242/500 (48.4%) → 239/500 (47.8%) |

The final point estimate is a small B5 mortality increase of 1.54pp overall
and a B10 arrival decrease of 0.60pp. The corresponding Wilson intervals
overlap (`25.09% [22.91,27.40]` vs `26.62% [24.38,29.00]`; `31.55%
[29.55,33.62]` vs `30.95% [28.96,33.01]`). The class split is mixed: Priest
improves, Thief worsens, and Fighter/Mage are near-flat. This is reported as a
measured impact, not as proof that the pool change improves overall difficulty.

## Design and model limits

Modeled: `generateRunFloor` traversal, real encounter generation, combat,
status application, status cure, flee/retreat, death, rewards, level-up, and
equipment scoring. Omitted: manual UI timing, optional merchant actions outside
policy, and causal attribution of a particular encounter to a later death.
No enemy stats, `statusChance`, encounter size weights, scaling, encounter rate,
enemy, or biome was added or changed.

## Reproduction and verification

```sh
node --check src/data/encounters.js
node --check scratch/issue706_depth_enemy_pools.js
node scratch/test_issue_706_enemy_pools.js
node scratch/issue706_depth_enemy_pools.js   # exact env above
node scratch/issue624_commit_depth.js
```

Raw JSONL and large one-off output remain outside the repository. The focused
test confirms B1 gating, local-floor unlock, unchanged biome identity, and
normal weights.
