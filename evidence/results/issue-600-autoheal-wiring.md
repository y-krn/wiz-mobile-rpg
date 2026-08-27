# Issue #600 僧侶オート回復配線 before/after深度比較

## 結論

Wilson 95% CI が重ならない指標は無い。配線修正（実プレイの僧侶オート戦闘に `DIOS`/`MADIOS` 自動回復を発火させる）による深度指標への影響は、統計的に有意とまでは言えない小さい変化にとどまる。

理由: `getRecoveryPotionItem` / `useHealPotionIfNeeded` によるHP回復ポーション（`HEAL_POTION`/`GREATER_HEAL`）使用が、修正前後どちらの条件でも同じ `healPotionThreshold`（既定0.55）で既に機能しており、僧侶の主回復手段として働いている。呪文による自動回復はその上乗せに過ぎず、限界効果が小さい。

他3職（Fighter/Thief/Mage）の対応run監査: 全シナリオ・全指標で完全一致（`diff` IDENTICAL）。選択ロジック由来の測定側バグなし。

## 固定条件・実行記録

- 既定条件（`CURRENT_SIM_ENV_DEFAULTS`）: `SIM_SEED=231`, `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`, `HEAL_POTION_THRESHOLD=0.55`（変更なし）
- `SIM_INDEPENDENT_RUN_RANDOM=1`（before/after共通）: Priestの行動変化が共有RNGストリームを介してFighter/Thief/Mageの結果を動かす測定アーティファクトを排除するため使用
- source commit（after）: `53a1ebd50e335a5a7f395035231eaf6f2ed2e806`（`fix: simだけだった僧侶自動回復をUIへ接続`）
- origin/main ancestor: `true`
- after raw SHA-256: `27768310167bc335d00681c10e442c41564d0d231625b42fa7bb526aad11bf2e`（保存なし）
- before raw SHA-256: `5de6a20df53b9776958b6a1f87db2f5a76ff6279c2ad2c7c140aa69ce33a6785`（保存なし）
- before再現方法: `scratch/simulations/sim_depth_material_ev.js` の `getDiosCombatAction` 内 `const healingTargetIdx = getAutoHealTargetIdx(character, state.simPolicy.healPotionThreshold);` を一時的に `const healingTargetIdx = null;` にパッチして実行（修正前=配線漏れ状態の再現）。測定後パッチは復元済み（`git diff --stat` で無変更を確認）。
  - 補足: 当初 `HEAL_POTION_THRESHOLD=0` 環境変数で回復を無効化しようとしたが、この変数は `getRecoveryPotionItem`/`useHealPotionIfNeeded`/`useTrapRecoveryIfNeeded` など全職業共通のHP回復ポーション使用判定にも使われており、Fighter/Thief/Mageの結果まで変えてしまうことが判明したため採用しなかった（測定手法の訂正）。
- before simulation: 20.883s wall（`SIM_INDEPENDENT_RUN_RANDOM=1`、パッチ適用）
- after simulation: 20.784s wall（`SIM_INDEPENDENT_RUN_RANDOM=1`、パッチなし）
- `SIM_PARALLEL` は未指定（runtime default）

再現コマンド:

```bash
# after（このPRの状態そのまま）
SIM_INDEPENDENT_RUN_RANDOM=1 node scratch/simulations/sim_depth_material_ev.js

# before（getDiosCombatAction の healingTargetIdx を null に一時パッチしてから）
SIM_INDEPENDENT_RUN_RANDOM=1 node scratch/simulations/sim_depth_material_ev.js
```

## Priest指標（既定7ワークショップシナリオ集約、N=125/シナリオ×7=875）

分母は全run（N=875）。B5系指標の分母は各シナリオのB5 entrant数（シナリオ別N、下表内訳参照）。

| 指標 | before | after | 判定 |
|---|---|---|---|
| 全run生還率（=撤退率）, N=875 | 24/875 = 2.74% [1.85%, 4.05%] | 26/875 = 2.97% [2.04%, 4.32%] | CI重複、有意差なし |
| B5 entrant率, N=875 | 116/875 = 13.26% [11.17%, 15.67%] | 140/875 = 16.00% [13.72%, 18.58%] | CI微重複（13.72–15.67%）、有意差は確認できず |
| B5突破率（entrant分母） | 35/116 = 30.17% | 39/140 = 27.86% | 参考値（各シナリオNが10〜24と小さくWilson CIは個別に「未確定」） |
| B5死亡率（entrant分母） | 78/116 = 67.24% | 98/140 = 70.00% | 同上 |
| B5撤退率（entrant分母） | 3/116 = 2.59% | 3/140 = 2.14% | 同上 |
| 平均到達階（7シナリオ単純平均） | 2.2871 | 2.4586 | +0.171（参考値、CI未算出） |

シナリオ別内訳（workshop-empty, workshop-stats, workshop-gear, workshop-blood-wand, workshop-blood-wand-spells, workshop-core-pools, workshop-complete の順）:

- before B5 entrant/125: 13, 13, 17, 13, 24, 16, 20
- after B5 entrant/125: 15, 15, 20, 21, 23, 23, 23
- before 全run撤退/125: 3, 4, 3, 3, 2, 5, 4
- after 全run撤退/125: 2, 2, 3, 4, 7, 5, 3

## 他3職監査（測定側バグ確認）

`awk` で職業別B5/B10テーブル（Fighter/Thief/Mage、全7シナリオ）を抽出し `diff` で突合。**完全一致（IDENTICAL）**。`SIM_INDEPENDENT_RUN_RANDOM=1` により、Priestの行動変化が他職の乱数消費順序へ波及する経路を遮断できていることを確認した。

## Verification

- `npm run lint`: 成功
- `npm run test:unit`: 81 passed / 0 failed / 3 skipped
- `npm run test:browser`: 159 passed
- 追加した統合テスト（`scratch/tests/unit/test_auto_combat_action.js` の "UI auto combat selects healing for a low HP Priest"）の逆転チェック: `action_selection.js` の `healingTargetIdx: getAutoHealTargetIdx(character)` を `healingTargetIdx: null` に戻すと exit 1 で失敗することを確認（`type: 'fight'` が返り `spellName: 'DIOS'` が欠落）。確認後は元のコードへ復元し、`git status --porcelain` で無変更を確認。

## Design Canon Gate

`.agents/game-design.md` に僧侶自動回復閾値・オート戦闘方針の既存記載なし。本変更は「sim と実UIが既に共有していた `chooseAutoCombatAction` の呼び出し漏れを配線した」バグ修正であり、呪文の優先順位・値・候補は変更していない。深度指標の変化も統計的有意性が確認できない小ささのため、`.agents/game-design.md` の更新は不要と判断。
