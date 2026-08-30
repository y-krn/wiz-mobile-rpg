# Issue #816 — 宝箱 smash 実測・fromDrop sim 記録

## 判定

**#808 の破損率・UI文言は変更しない。** 現行の canonical sim では fromDrop 経路を十分な N で測定できたが、ライブのプレイヤー選択データはこの実行環境に export が無く、実利用率の結論は未確定である。ライブデータ取得後は `issue816_chest_telemetry.js` を同じ入力形式で再実行し、decision-ready になるまで仕様変更の根拠にしない。

## シミュレーション

| 項目 | 値 |
| --- | --- |
| 質問 | 現行の source-backed run simulator が combat-generated `fromDrop` chest の smash 相当分岐へ到達し、通常宝箱と混在せず集計できるか |
| runner | `scratch/measurements/issue816_from_drop_sim.js` → `scratch/simulations/sim_depth_material_ev.js` |
| sim-scope | `run`（`generateRunFloor` → 探索 → 戦闘/報酬 → chest） |
| gameplay/base SHA | `f235c6c6405da6b3f09a1dc01f1451173b8165e4` |
| measured head / runner SHA | `c0c89a445c796882cec34866eec615b5e64c9618` |
| runner diff SHA-256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| seed | `816`（`SIM_INDEPENDENT_RUN_RANDOM=1`） |
| 条件 | B1開始、B10、Fighter/Thief/Priest/Mage、各 N=500、合計 N=2,000、`chestTrapPolicy=legacy`、`trapPolicy=conservative` |
| Node | `v26.8.1` |

| source | chest N | smash N | smash率（Wilson 95% CI） | trap発動 N | reward loss N | lethal run N |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| ordinary | 24,583 | 8,097 | 32.9% [32.4–33.5%] | 17,929 | 1,651 | 0 |
| fromDrop | 1,564 | 433 | 27.7% [25.5–30.0%] | 1,181 | 100 | 10 |

`fromDrop` は combat-generated chest の source-backed candidate pool と、共有された trap/smash loss rule を通る。`TOWN_PORTAL` の special reward は fromDrop では別 special rollにならず、既存の legacy main pool を維持している。ライブUIの入力タイミング・表示・Analytics transportはこのsimの対象外である。

再現コマンド:

```sh
ISSUE816_SIM_N=500 ISSUE816_SIM_TARGET_DEPTH=10 \
  node scratch/measurements/issue816_from_drop_sim.js
```

同一コマンドを2回実行し、JSON出力は完全一致した。保存した一時出力のSHA-256は `da4cad64cb5afd39f75188e5b0aae91c76a445f33ac62c0573da81c73efe0690`（rawは追跡しない）。`node --check scratch/measurements/issue816_from_drop_sim.js` と N=1 smoke も通過した。

## ライブTelemetry集計

集計runnerは PostHog の JSON export / JSONL を受け、`chest_action`、`chest_smash_result`、`run_end` を `ordinary` / `fromDrop` 別に集計する。smash率には全5つの意思決定（open / disarm / trap_kit / smash / leave）を分母に使い、inspect は分母から除外する。floor、trap、報酬カテゴリ、HP帯、TRAP_KIT有無の各軸を保持し、率には Wilson 95% CI を付ける。

- runner: `scratch/measurements/issue816_chest_telemetry.js`
- production source SHA: export対象のリリースSHAを `--production-sha` で明示
- aggregation runner SHA: `--runner-sha` で明示（省略時は現在のHEAD）
- seed: **N/A**（観測データにsimulation seedは無い。runnerは `seedPolicy` に明記）
- 実測状態: **unexecuted**（production export未提供、N=0）
- 判定閾値: N<30 は low-N、N=30–499 は measured-low-N、N>=500 を decision-ready とする

```sh
node scratch/measurements/issue816_chest_telemetry.js \
  --input <posthog-export.jsonl> \
  --production-sha <40-char-release-sha> \
  --runner-sha <40-char-runner-sha> \
  --output /private/tmp/issue-816-chest-telemetry.json \
  --summary /private/tmp/issue-816-chest-telemetry.md
```

## 区分と次の判断

| 経路 | 区分 | 解釈 |
| --- | --- | --- |
| canonical sim ordinary/fromDrop | measured | 同一 seed/config の N=2,000。sim方針の比較材料であり、プレイヤー行動の推定ではない |
| production `chest_action` / `chest_smash_result` | unexecuted | export未提供。実利用率・条件・結果分布は未確定 |
| live UI timing / analytics transport in simulator | structurally omitted | simに追加せず、production event aggregationで測る |
| #808仕様変更 | no change | decision-readyなライブ実測が無いため、現行受入基準を維持 |
