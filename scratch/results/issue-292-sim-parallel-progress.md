# Issue #292 バランスsim並列化 進捗

## 2026-07-29 着手

- ブランチ: `perf/sim-parallel`
- 基点: 最新 `origin/main`
- 変更境界: `scratch/` のみ。`src/`、バランス値、測定ロジックは変更しない。
- 必須不変条件: 実src orchestration経路と乱数消費順を維持し、逐次・並列stdoutを完全一致させる。
- 対象:
  - `scratch/sim_depth_material_ev.js`: scenario単位
  - `scratch/sim_workshop_progression.js`: trial単位（trial内runの状態依存は維持）
- 比較予定: `SIM_PARALLEL=1/4/8/最大`

## 2026-07-29 depth変更前 基準測定

- コマンド: `node scratch/sim_depth_material_ev.js`
- 条件: `origin/main`、既定 `SIM_RUNS=500`、seed `231`、全3 scenario
- wall/user/sys: `156.74s / 161.66s / 2.32s`
- 最大RSS: `273,809,408 bytes`
- stdout: 189行 / 22,386 bytes
- stdout SHA-256: `f0aaf11f44a3afc129c2e737960d4620d89a32ca8001a343ab4de144b85280c5`
- 生出力: `scratch/results/issue-292-depth-before.raw.txt`
- time出力: `scratch/results/issue-292-depth-before.time.txt`

## 2026-07-29 depth 小規模決定性確認

- 条件: `SIM_RUNS=5`、seed `231`、全3 scenario
- 比較: `SIM_PARALLEL=1` 対 `SIM_PARALLEL=4`
- `diff -u`: 差分なし
- 両stdout SHA-256: `ca2e73cecbfe391a8e23fdac88231956f66efdbbe82beaacb11b03913538f669`
- RNG分離: workerごとのV8 isolate内でmodule-local `randomState` と `Math.random` を初期化。scenario/milestoneタスク開始時にseedを明示reset。

## 2026-07-29 workshop変更前 基準測定

- コマンド: `SIM_PARALLEL=1 node scratch/sim_workshop_progression.js`
- 条件: 最新 `origin/main` 基点、既定50 trials × 50 runs、seed `278234`、calibration N=100
- wall/user/sys: `788.20s / 806.88s / 7.95s`
- 最大RSS: `294,797,312 bytes`
- stdout: 203行 / 17,936 bytes
- stdout SHA-256: `bcb79c3eba95a5eff1673c33d07b1e3dd94515647fbe10e7d8341de1dc215e41`
- 生出力: `scratch/results/issue-292-workshop-before.raw.txt`
- time出力: `scratch/results/issue-292-workshop-before.time.txt`

## 2026-07-29 workshop 小規模決定性確認

- 条件: 2 trials × 3 runs、seed `278234`、calibration N=3、全12測定ケース
- 比較: `SIM_PARALLEL=1` 対 `SIM_PARALLEL=4`
- `diff -u`: 差分なし
- 両stdout SHA-256: `088e1406d57e8f2dec2405aa84d3c71ca484624891fe215c8e978aa214c1762b`
- trial内runは同workerで順次実行。main集約はcase→trial→runの従来順を維持。
- depth基盤変更後の再確認（N=3）も逐次/4並列差分なし。両SHA-256: `73233b67efb3346b77593f1f3e3252ba7f28c9d635da7b6c5018cda48379b492`

## 2026-07-29 中間静的検証

- `node --check`: 変更4ファイルすべて成功
- `npm run lint`: exit 0
- `git diff --check`: 問題なし
- `git diff --name-only -- src`: 出力なし（`src/`変更なし）
