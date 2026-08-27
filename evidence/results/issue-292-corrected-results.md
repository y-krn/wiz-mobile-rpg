# Issue #292 訂正後の分離測定結果

測定日: 2026-08-03
基点: `origin/main` / `e3c16c7d7b1ce465865d973222cb0f706ea1f842`
測定機: Node `v26.5.1`、`availableParallelism()=15`

## 結論

採用するのは、出力を変えない次の2点だけとする。

- `scratch/simulations/sim_parallel.js` の動的 task queue
- local は `availableParallelism()`、`CI=true` は4を既定値とする分離

`scenario × targetDepth × class` 分割は見送る。実測最大は既定6条件で Pmax 1.10x、`workshop-complete` で1.58x（P1比でも2.70x/1.91x）であり、依頼の採用基準4xに届かない。これにより出力と直近の測定基準を壊す費用を正当化できない。

## 1. 現行 main（静的分割、scenario単位）

### depth: 既定6シナリオ、`SIM_RUNS=1000`、seed=231

stdout SHA-256: `bf161c2f6f2f9eb03a5adbf8440bdd264a3b12946a9a7fead740060c149d02c2`

| 並列度 | 時間 |
| ---: | ---: |
| P1 | 204.59s（既取得値を再利用） |
| P4 | 104.41s |
| P8 | 82.03s |
| Pmax=15 | 82.97s |

### depth: `SIM_SCENARIOS=workshop-complete`、`SIM_RUNS=2000`、seed=231

stdout SHA-256: `637b0fc353ea2657913fa5fc840e8b1d5644c5b50aeaac2fc94d3fa84091fccf`

| 並列度 | 時間 |
| ---: | ---: |
| P1 | 99.54s（既取得値を再利用） |
| P4 | 82.08s |
| P8 | 82.24s |
| Pmax=15 | 82.06s |

### workshop progression: 50 trials × 50 runs、seed=278234

stdout SHA-256: `d2b028710ff8e3bdf752dd8fff19099790e416b675e96ed360338355ccf78185`

| 並列度 | 時間 |
| ---: | ---: |
| P1 | 865.99s（既取得値を再利用） |
| P4 | 268.68s |
| P8 | 183.91s |
| Pmax=15 | 147.38s |

## 2. 動的 queue のみ（scenario粒度は変更しない）

depthのtask構築と乱数初期化は現行 main のままにし、`sim_parallel.js` だけを動的 queue/CI既定値へ差し替えた測定。P1は既取得の現行 main値を再利用した。

### depth: 既定6シナリオ、`SIM_RUNS=1000`、seed=231

| 並列度 | 時間 | stdout SHA-256 |
| ---: | ---: | --- |
| P1 | 204.59s（再利用） | `bf161c2f…` |
| P4 | 104.10s | `bf161c2f…` |
| P8 | 83.19s | `bf161c2f…` |
| Pmax=15 | 82.56s | `bf161c2f…` |

完全SHA: `bf161c2f6f2f9eb03a5adbf8440bdd264a3b12946a9a7fead740060c149d02c2`。現行 mainと一致。

### depth: `SIM_SCENARIOS=workshop-complete`、`SIM_RUNS=2000`、seed=231

| 並列度 | 時間 | stdout SHA-256 |
| ---: | ---: | --- |
| P1 | 99.54s（再利用） | `637b0fc3…` |
| P4 | 83.24s | `637b0fc3…` |
| P8 | 82.93s | `637b0fc3…` |
| Pmax=15 | 83.53s | `637b0fc3…` |

完全SHA: `637b0fc353ea2657913fa5fc840e8b1d5644c5b50aeaac2fc94d3fa84091fccf`。現行 mainと一致。

### workshop progression: 50 trials × 50 runs、seed=278234

このscriptは従来どおりtrial単位のtaskで、trial内runは分割していない。

| 並列度 | 時間 | stdout SHA-256 |
| ---: | ---: | --- |
| P1 | 865.97s（既取得値） | `d2b02871…` |
| P4 | 264.78s | `d2b02871…` |
| P8 | 188.94s | `d2b02871…` |
| Pmax=15 | 146.11s | `d2b02871…` |

完全SHA: `d2b028710ff8e3bdf752dd8fff19099790e416b675e96ed360338355ccf78185`。現行 mainと一致。

### 動的 queue 単独の効果

scenario task数が少ないため、既定6条件は Pmax 82.97→82.56s、`workshop-complete` は82.06→83.53sで、測定誤差の範囲または悪化だった。つまり、出力を変えずに得られる改善は実質ない。動的 queueは、より細かいtaskを採用する将来のための負荷分散基盤として残す。

決定性の小N検証（`SIM_RUNS=100`、seed=231）でも、現行 mainと動的 queueのみで完全一致した。

- 既定6条件: `c80a69d07089ca2d13372947cbe9f0dc452fc87f971124b285ccb6351b2542ae`
- `workshop-complete`: `ddb9b4d61b9fe1f1eede73358756a119be459fa687c9a3a8d2f66677735b7608`

## 3. 動的 queue + `scenario × targetDepth × class`（採用しない測定）

scratch-onlyの実験版で、既定6条件は96 task、単一 `workshop-complete` は16 taskへ分割した。各class taskはround-robinで担当するrun indexだけを実行し、class別accumulatorをmain threadで統合した。task seedにclassを追加したため、現行mainとのstdout SHAは変わる。

### depth: 既定6シナリオ、`SIM_RUNS=1000`、seed=231

| 並列度 | 時間 | 実験版 stdout SHA-256 |
| ---: | ---: | --- |
| P4 | 100.65s | `1e2e6571…` |
| P8 | 83.06s | `1e2e6571…` |
| Pmax=15 | 75.65s | `1e2e6571…` |

P1=204.59sを基準にしたPmaxは2.70x、現行main Pmax比は1.10x。

### depth: `SIM_SCENARIOS=workshop-complete`、`SIM_RUNS=2000`、seed=231

| 並列度 | 時間 | 実験版 stdout SHA-256 |
| ---: | ---: | --- |
| P4 | 60.40s | `7b762612…` |
| P8 | 53.91s | `7b762612…` |
| Pmax=15 | 52.07s | `7b762612…` |

P1=99.54sを基準にしたPmaxは1.91x、現行main Pmax比は1.58x。

小N=100のP1/P4/P8/Pmax内部SHAは一致した。

- 既定6条件: `a99e60d07089ca2d13372947cbe9f0dc452fc87f971124b285ccb6351b2542ae`
- `workshop-complete`: `2438eed78630ff27a053eb7355aadb574f60b78325d05e5d12cb920c44dd2f13`

### task時間分布とcritical path

Pmax=15、task bodyの実行時間（worker起動・main threadのaccumulator統合・stdout生成を除く）を計測した。

| 条件 | class task数 | 最小 | 中央値 | P95 | 最長class task | class task合計 | 最長/合計 | milestone |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 既定6 | 96 | 1.69s | 2.52s | 4.87s | 5.43s | 296.12s | 1.8% | 10.84s |
| workshop-complete | 16 | 3.09s | 4.78s | 9.00s | 9.05s | 101.56s | 8.9% | 20.75s |

単純なPmax下限は既定6で`max(296.12/15, 5.43, 10.84)=19.74s`、workshopで`max(101.56/15, 9.05, 20.75)=20.75s`だが、観測wall timeは75.65s/52.07sだった。class taskの最長だけが律速ではなく、main threadのaccumulator統合・結果整形・出力とworker起動費も支配的だった。職まで割っても、run単位へさらに分割しなければ4xには届かない。run単位分割は状態/乱数設計を作り直す別issueとする。

## CI既定値

localの既定は`availableParallelism()`（この測定機では15）、`CI=true`の既定は4。`SIM_PARALLEL`明示値は従来どおり優先する。`ubuntu-latest`のpublic repository標準runnerは4 CPU/16 GBであるため、CIで15 workerを起動しない（[GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)）。

## 未決論点

- 動的 queue単独は旧stdoutとSHA一致するが、scenario taskのままでは性能改善がほぼない。将来さらに細粒度化する場合は、旧基準値を保持するためのRNG stream/checkpoint設計を別issueで扱う。
- class分割は出力を変更し、#264 / #271 / #275 / #329 と#392の既存測定値を全て取り直す必要があるが、今回の効果では見合わない。

## 検証

- `node scratch/tests/regression/test_sim_reward_paths.js`
- `npm run lint`
- `npm run test:unit`
- `node --check scratch/simulations/sim_depth_material_ev.js`

上記は実装を動的 queueのみへ戻した後に再実行する。
