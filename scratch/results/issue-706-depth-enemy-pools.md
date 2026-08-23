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
- Measurement source for the authoritative floor/status rerun:
  `d752dfcba39ee8bd4d6081a198afc49da13e61a7` (the exact current branch and
  remote head at measurement time). The preceding
  `d1a2c8ec72f39d7d1147a2d134adff4b47de0a83`,
  `9dc1a7bf5b338223d7443dd54adf2c4705d8bf79`, and
  `1de47098c2eb3bd524a8b8be66eeb649d6748183` sources are historical. This
  markdown update is a later docs-only commit; it is not the measurement
  source and does not change the runner or its output.
- `origin/main` matched the supplied base and was an ancestor of the measured
  source; stale-tree override was not used. Node: `v26.7.0`;
  `SIM_PARALLEL` omitted, runtime parallelism `15`.
- The earlier implementation source `6351f22181cb0275109d3b74fdabb431e0a0dbf5`
  and post-review measurement source `ccd463a7f5af263c33ad0a825c4d565c4727fa95`
  are pre-fix historical artifacts only. The `ccd463a` → `1de47098` range
  changed only `scratch/issue624_commit_depth.js` and this summary; it did not
  change `src/`, `scratch/sim_depth_material_ev.js`, or the Issue #706 runner.
  The prior `1de47098c2eb3bd524a8b8be66eeb649d6748183` and
  `9dc1a7bf5b338223d7443dd54adf2c4705d8bf79` measurements are also historical;
  current floor/status evidence was rerun directly at `d752dfc`.
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
- The historical post-review full-depth artifact at `ccd463a7f5af263c33ad0a825c4d565c4727fa95`
  produced Fighter `7.0300` / Thief `8.9240` / Priest `4.0440` / Mage
  `9.8800`, again N=500 per class; raw SHA-256
  `9bbe26e3f08ff6582a53e4735603d5273156480f328eaadf813a7ba47aa83d05`,
  env hash `5831171ec0ff70bc`, and baseline measurement guard PASS. It is
  retained as historical full-depth context, not as current-head evidence.
- Exact baseline command/config:
  `node scratch/issue624_commit_depth.js`; `SIM_SEED=231`,
  `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`,
  `STATUS_CURE_POLICY=ev`, `FLEE_POLICY=ev`,
  `TRAP_POLICY=conservative`, powder identification,
  `DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`,
  six observed workshop scenarios, `SIM_PARALLEL` and
  `SIM_MAP_CACHE_ENTRIES` omitted (runtime defaults).
- Current-head floor/status runner: `scratch/issue706_depth_enemy_pools.js`,
  B1-B5 traversal to B6, 500 runs per scenario and 100 calibration runs per
  scenario (3,000 total; 750 per class). Output schema is
  `issue706-depth-enemy-pools-v1`. At current HEAD
  `d752dfcba39ee8bd4d6081a198afc49da13e61a7`, two self-contained reruns with
  conflicting ambient simulation and provenance inputs overridden by the runner
  before import
  produced byte-identical stdout and stderr:
  - stdout JSONL SHA-256 (both runs): `121de170cff2210ac88a93b2be255c18566f015fd9fce669b64d9de5765e51f6`
  - stderr SHA-256 (both runs): `96bf558f1abe9b00002737fa324f2f8da0782f1ac33bc845da2eb6f40f567510`
  - stderr report on both runs:
    `ISSUE706_JSON_SHA256=121de170cff2210ac88a93b2be255c18566f015fd9fce669b64d9de5765e51f6`
  The result reports `sourceCommit=d752dfcba39ee8bd4d6081a198afc49da13e61a7`,
  `originMainAncestor=true`, and `staleTreeAllowed=false`. The earlier
  `bcbd5b9731d1f45d936723bf01ab9af3a9db9d01ed191eb8eb9bcf0e8239c48e` output
  SHA is retained as historical evidence from source `1de47098`; it is not
  current-head evidence.
- N=1 smoke under the same conflict family passed before the full runs. Its
  stdout/stderr SHA-256 values were
  `89f75f06998c366d5c1ebcefb5a9398e2ccf36bb9cbc21baf9a00680e4f0f066` /
  `ecf5c1c47e66ff3ba94701e7a7a63f08ccceacf6b0a4cc1dab4719c93f760440`.
  It resolved `SIM_RUNS=1`, `SIM_CALIBRATION_RUNS=1`,
  `SIM_EXPLORATION_FACTOR=1.4`, `SIM_737_DAMAGE_AUDIT=0`,
  `SIM_INDEPENDENT_RUN_RANDOM=1`, EV/conservative/powder policies, and
  `sourceCommit=d752dfcba39ee8bd4d6081a198afc49da13e61a7`,
  `originMainAncestor=true`, `staleTreeAllowed=false`.
- Exact current-head command, run twice with identical conflicts and with
  stdout/stderr captured outside the repository:

  ```sh
  env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin SIM_RUNS=999 SIM_CALIBRATION_RUNS=777 SIM_SEED=999 SIM_EXPLORATION_FACTOR=9 SIM_737_DAMAGE_AUDIT=1 SIM_INDEPENDENT_RUN_RANDOM=0 SIM_SKIP_PROVENANCE=1 SIM_ALLOW_STALE_TREE=1 SIM_PROVENANCE_BASE_REF=refs/heads/other SIM_PROVENANCE_BASE_COMMIT=0000000000000000000000000000000000000000 SIM_PROVENANCE_BASE_REF_REASON=ambient-conflict SIM_PROVENANCE_TEST_FIXTURE=1 STATUS_CURE_POLICY=none FLEE_POLICY=none TRAP_POLICY=aggressive IDENTIFICATION_POLICY=manual SIM_EQUIPMENT_POLICY=all SIM_PRESET=conflicting SIM_SCENARIOS=conflicting SIM_PARALLEL=1 SIM_MAP_CACHE_ENTRIES=1 TRAP_BONUS_OVERRIDE=999 node scratch/issue706_depth_enemy_pools.js
  ```

  The resolved `config` object was identical in both outputs:

  ```json
  {
    "SIM_SEED": "231",
    "SIM_RUNS": "500",
    "SIM_CALIBRATION_RUNS": "100",
    "DEPARTURE_CRAFT_IDS": "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
    "TRAP_POLICY": "conservative",
    "TRAP_AVOIDANCE_POLICY": "ev",
    "TRAP_DAMAGE_MULTIPLIER": "1",
    "IDENTIFICATION_POLICY": "powder",
    "IDENTIFICATION_STARTING_POWDER": "2",
    "IDENTIFICATION_COST_OVERRIDE": "1",
    "STATUS_CURE_POLICY": "ev",
    "STATUS_CURE_HP_THRESHOLD": "1",
    "STATUS_CURE_MERCHANT_POLICY": "missing",
    "HEAL_POTION_MERCHANT_POLICY": "missing",
    "FLEE_POLICY": "ev",
    "FLEE_HP_THRESHOLD": "0.20",
    "HEAL_POTION_THRESHOLD": "0.55",
    "MANA_POTION_THRESHOLD": "0.55",
    "PORTAL_HP_THRESHOLD": "0.35",
    "PORTAL_MAX_HEAL_POTIONS": "0",
    "PORTAL_MIN_FLOOR": "3",
    "ELITE_POLICY": "avoid",
    "BLOOD_WAND_HP_PAYMENT_MIN_RATE": "0.50",
    "SIM_CORE_SCORE_DROP_TOLERANCE": "0",
    "SIM_440_CONDITION": "current",
    "SIM_ISSUE646_CAMP_LEVEL": "",
    "SIM_INDEPENDENT_RUN_RANDOM": "1",
    "SIM_737_DAMAGE_AUDIT": "0",
    "SIM_728_HIT_EVASION": "0",
    "SIM_DIALMA_CANDIDATE": "1",
    "SIM_MADI_CANDIDATE": "1",
    "SIM_MADI_HEAL_MIN": "",
    "SIM_MADI_HEAL_MAX": "",
    "SIM_MADI_COST": "",
    "SIM_MERCHANT_MANA_COST": "",
    "SIM_MERCHANT_EYE_DROPS": "0",
    "SIM_MERCHANT_RETURN_WING": "0",
    "SIM_MERCHANT_RETURN_WING_COST": "",
    "SIM_RETURN_WING_MODE": "special",
    "SIM_SCENARIOS": "",
    "SIM_PRESET": "",
    "SIM_CORE_ENCOUNTER_CEILING": "",
    "SIM_CORE_WORKSHOP_GATE": "",
    "SIM_SUPPORT_SUPPLY_CEILING": "none",
    "SIM_EQUIPMENT_SLOT_MODE": "standard",
    "SIM_EQUIPMENT_SLOT_AFFIX_MODE": "retain",
    "SIM_AFFIXLESS_DUPLICATE_COUNT": "2",
    "SIM_AFFIXLESS_DUPLICATE_SLOT": "",
    "SIM_EQUIPMENT_POLICY": "individual-score",
    "SIM_MATCHING_DEFINITION": "exact",
    "SIM_CURSE_LOCK_MODE": "current",
    "SIM_EXPLORATION_FACTOR": "1.4",
    "SIM_MAP_STATS": "0",
    "SIM_DAMAGE_PROBE": "0",
    "TRAP_BONUS_OVERRIDE": "",
    "ISSUE538_SPELL_POLICY": "",
    "SIM_EXPLORE_SPELLS": "",
    "SIM_CURSE_BASE_CHANCE_OVERRIDE": "",
    "SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE": "",
    "SIM_CURSE_MAX_CHANCE_OVERRIDE": "",
    "SIM_CURSE_CORE_BONUS_OVERRIDE": "",
    "SIM_CURSE_DETECT_BASE_OVERRIDE": "",
    "SIM_CURSE_DETECT_DECAY_OVERRIDE": "",
    "SIM_CURSE_DETECT_MIN_OVERRIDE": "",
    "SIM_PARALLEL": "<omitted; runtime default>",
    "SIM_MAP_CACHE_ENTRIES": "<omitted; runtime default 1024>",
    "SIM_SKIP_PROVENANCE": "<omitted>",
    "SIM_ALLOW_STALE_TREE": "<omitted>",
    "SIM_PROVENANCE_OVERRIDES": "<omitted>"
  }
  ```

  The runner owns the complete `ISSUE706_MEASUREMENT_DEFAULTS` set before
  importing `sim_depth_material_ev.js`, and deletes the ambient omitted and
  provenance override keys. Thus the conflicting values above cannot alter a
  direct measurement; `ISSUE706_SMOKE=1` is the explicit N=1 path, while test
  entrypoints remain exempt from the measurement main.

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

The historical full-depth four-class run gives these matched progression
endpoints (context only; not the current-head floor/status measurement):

| class | B5 entrant | B5 death / entrant | B10 arrival |
| --- | ---: | ---: | ---: |
| all | 1427→1401 | 358/1427 (25.09%) → 373/1401 (26.62%) | 631/2000 (31.55%) → 619/2000 (30.95%) |
| Fighter | 352→336 | 42/352 (11.93%) → 42/336 (12.50%) | 144/500 (28.8%) → 137/500 (27.4%) |
| Thief | 477→463 | 162/477 (33.96%) → 184/463 (39.74%) | 210/500 (42.0%) → 204/500 (40.8%) |
| Priest | 172→181 | 106/172 (61.63%) → 100/181 (55.25%) | 35/500 (7.0%) → 39/500 (7.8%) |
| Mage | 426→421 | 48/426 (11.27%) → 47/421 (11.16%) | 242/500 (48.4%) → 239/500 (47.8%) |

The historical candidate point estimate is a small B5 mortality increase of 1.54pp overall
and a B10 arrival decrease of 0.60pp. The corresponding Wilson intervals
overlap (`25.09% [22.91,27.40]` vs `26.62% [24.38,29.00]`; `31.55%
[29.55,33.62]` vs `30.95% [28.96,33.01]`). The class split is mixed: Priest
improves, Thief worsens, and Fighter/Mage are near-flat. This is reported as a
historical measured impact, not as proof that the pool change improves overall
difficulty.

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
env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin ISSUE706_SMOKE=1 SIM_RUNS=1 SIM_CALIBRATION_RUNS=1 node scratch/issue706_depth_enemy_pools.js
node scratch/test_issue_706_enemy_pools.js
env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin node scratch/issue706_depth_enemy_pools.js
node scratch/issue624_commit_depth.js
npm run lint
npm run test:unit
node scripts/check_doc_paths.js
git diff --check
```

Raw JSONL and large one-off output remain outside the repository. The focused
test confirms B1 gating, local-floor unlock, unchanged biome identity, and
normal weights. The two current-head reruns confirm B1 blind/sleep applications
remain zero while B2-B5 use the unlocked status-capable pools. Gameplay source
was unchanged, so the prior source build remains valid and a new build is
unnecessary.
