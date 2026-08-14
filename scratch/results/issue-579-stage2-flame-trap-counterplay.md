# Issue #579 段階2: B5F火炎の罠の軽減・予告回避

## 結論

- `triggerFlameTrap()` を `applyTrapGuardToEffect` 経由にし、既存のクラス固有
  `trapGuard`（Fighter=40、Mage=60）をB5F火炎の罠にも適用した。
- 5%の発火判定、B5F限定、5ターンcooldownは維持した。発火成立後に既存装備の
  `trapBonus` + `trapSense` を `getCharTrapBonus` で合算し、予告回避率を算出する。
- 予告回避率は `getPartyFlameTrapWarningAvoidanceChance` の線形式
  `min(0.74, max(0, getCharTrapBonus) * 0.8)`。投資0は0%、現実的な2〜3枠（合算
  0.6〜0.9想定）は48〜72%となり、上限は75%未満にした。
- 予告は既存ログパネルへ「熱気の気配」として表示し、回避成功時は被弾しない。
  新しいCSS/DOM/UI状態は追加していない。
- simはsrcの予告回避率・火炎ダメージ・`applyTrapGuardToEffect`を呼び、段階1の
  火炎専用override（`FLAME_TRAP_*`）と独自ダメージ再計算を削除した。5%発火判定→
  cooldown消費→予告回避→ダメージの乱数順もsrcに合わせた。

## 実測結果

### 条件

- scope: `run`、`generateRunFloor` 経由
- command:

  ```sh
  SIM_PRESET=balance-main SIM_SEED=579 SIM_RUNS=500 \
    SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-complete \
    node scratch/sim_depth_material_ev.js
  ```

- `SIM_PARALLEL` は未指定。4職をround-robinで各125 run、全体500 run。
- B5F gateは **B20撤退条件** の表を採用した。B5撤退条件はB5F到達直前で止まるため、
  B5F endpointの分母には使っていない。
- B5 entrant列の分母は全run（N=500）。B5突破/死亡/撤退列の分母はB5F entrant
  （全職N=142、職別は下表）。平均到達階・生還率は全run分母。
- 生還率はsimのB20撤退条件における全runの生還（撤退）率。

### B5F gate

| 対象 | 全run N | B5F entrant（全run分母） | B5突破（entrant分母） | B5死亡（entrant分母） | B5撤退（entrant分母） | 平均到達階（全run分母） | 生還率（全run分母） |
|---|---:|---:|---:|---:|---:|---:|---:|
| 全職合算 | 500 | 28.4% (N=500) | 38.7% [31.1,46.9] (N=142) | 47.9% [39.8,56.1] (N=142) | 13.4% [8.7,20.0] (N=142) | 3.64 | 14.6% [11.8,18.0] (N=500) |
| Fighter | 125 | 39.2% (N=125) | 53.1% [39.4,66.3] (N=49) | 30.6% [19.5,44.5] (N=49) | 16.3% [8.5,29.0] (N=49) | 4.66 | 24.8% [18.1,33.0] (N=125) |
| Thief | 125 | 36.8% (N=125) | 15.2% [7.6,28.2] (N=46) | 69.6% [55.2,80.9] (N=46) | 15.2% [7.6,28.2] (N=46) | 3.60 | 15.2% [10.0,22.5] (N=125) |
| Priest | 125 | 20.8% (N=125) | 46.2% [28.8,64.5] (N=26) 未確定 | 53.8% [35.5,71.2] (N=26) 未確定 | 0.0% [0.0,12.9] (N=26) 未確定 | 2.90 | 5.6% [2.7,11.1] (N=125) |
| Mage | 125 | 16.8% (N=125) | 47.6% [28.3,67.6] (N=21) 未確定 | 33.3% [17.2,54.6] (N=21) 未確定 | 19.0% [7.7,40.0] (N=21) 未確定 | 3.42 | 12.8% [8.0,19.8] (N=125) |

Wilson 95% CI。職別Priest/MageのB5 entrant N<30セルは未確定。

全職B5死亡率47.9%は、段階1のoverride baseline 67.9%から20.0pt低下した。一方、
#271 A1の30.9%を下回らず、B5Fの関門は残った。今回の実生成装備では予告回避は
Thief 0.02回/entrant、Mage 0.05回/entrant（Fighter/Priest 0.00回/entrant）で、
主な効果はtrapGuard軽減だった。装備投資があるrunでは同じhelperで回避判定される。

### 火炎の罠診断（B20撤退条件）

| 職 | 発動/run | 予告回避/run | 被害HP/run | 死亡者/run | 試行対象歩/run |
|---|---:|---:|---:|---:|---:|
| Fighter | 1.38 | 0.00 | 9.94 | 0.06 | 27.28 |
| Thief | 0.90 | 0.01 | 10.55 | 0.20 | 22.36 |
| Priest | 0.63 | 0.00 | 7.45 | 0.08 | 12.76 |
| Mage | 0.59 | 0.01 | 2.78 | 0.02 | 12.92 |

## 再現性情報

- worktree: `.claude/worktrees/issue-579-stage2`
- branch: `fix/579-flame-trap-counterplay`
- source commit: `b4780bc2d5c0c4d6fb6b1f9130844637c4e456a1`
- `origin/main` ancestor: `true`
- env hash: `44a43cf8665cff48`
- captured output SHA-256: `b9917fcea72a07b82ee2f9b4bb1e0c98f11285753dc859a08b6fee44df5972df`
- raw outputは `/tmp` に保存し、リポジトリへは追加していない。

## 検証

- `node --check scratch/sim_depth_material_ev.js`: pass
- `SIM_RUNS=1 SIM_CALIBRATION_RUNS=1` smoke: pass
- focused `test_solo_class_engines.js`, `test_sim_reward_paths.js`, `test_traps.js`: pass
- `npm run lint`: pass
- `npm run test:unit`: pass（91/91、skip 0）
- `npm run build`: pass
- `npm run test:browser`: pass（155/155）。既存の360x800 / 390x844 / 430x932系を含む。
