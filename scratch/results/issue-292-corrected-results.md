# Issue #292 訂正実装・再測定結果

測定日: 2026-08-03
基点: `origin/main` / `e3c16c7d7b1ce465865d973222cb0f706ea1f842`
測定機: Node `v26.5.1`、`availableParallelism()=15`

## 実装

- depth taskを従来のscenario単位から `scenario × targetDepth` に分割。既定6条件で24 task、`SIM_SCENARIOS=workshop-complete` 単独で4 task（各policyのmilestone taskは別）。各task内は4職 round-robinとrun順を維持。
- `scratch/sim_parallel.js` を動的task queueへ変更。workerはtask完了後、次taskを取得。結果は元index順へ再構成。
- depth taskの `Math.random` は root seed・policy・scenario・targetDepthからFNV系で決定的seed導出。task内の乱数呼出順、実src呼出経路、測定式は変更していない。
- 並列度未指定時は localで `availableParallelism()`、`CI=true` では4、明示 `SIM_PARALLEL` は優先。GitHub Actionsは全job `ubuntu-latest`で、public repository標準runnerは4 vCPU/16GB（[GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)）。

## depth: 既定6シナリオ、`SIM_RUNS=1000`、seed=231

before stdout SHA-256: `bf161c2f6f2f9eb03a5adbf8440bdd264a3b12946a9a7fead740060c149d02c2`

- P=1: 204.59s
- P=4: 104.41s
- P=8: 82.03s
- P=max(15): 82.97s

after stdout SHA-256: `a037f448c01da2d0cfdc74b8a0764dd30b9e622b99d3a24e25adf330ec689071`

- P=1: 203.74s
- P=4: 98.33s
- P=8: 80.05s
- P=max(15): 72.58s

after P=1/4/8/maxは完全一致。raw/timeは `issue-292-corrected-depth-{p1,p4,p8,pmax}*` と `issue-292-corrected-depth-after-{p1,p4,p8,pmax}*`。

## depth: `SIM_SCENARIOS=workshop-complete`、`SIM_RUNS=2000`、seed=231

before stdout SHA-256: `637b0fc353ea2657913fa5fc840e8b1d5644c5b50aeaac2fc94d3fa84091fccf`

- P=1: 99.54s
- P=4: 82.08s
- P=8: 82.24s
- P=max(15): 82.06s

after stdout SHA-256: `6b3394fd25727f41fb4881494b51b7065579b1b6e8d23b04be1d8cd6f762d1a1`

- P=1: 99.11s
- P=4: 61.10s
- P=8: 47.85s
- P=max(15): 48.57s

after P=1/4/8/maxは完全一致。raw/timeは `issue-292-corrected-workshop-complete-{p1,p4,p8,pmax}*` と `issue-292-corrected-workshop-complete-after-{p1,p4,p8,pmax}*`。

## workshop progression: 既定50 trials × 50 runs、seed=278234

before stdout SHA-256: `d2b028710ff8e3bdf752dd8fff19099790e416b675e96ed360338355ccf78185`

- P=1: 865.99s
- P=4: 268.68s
- P=8: 183.91s
- P=max(15): 147.38s

after stdout SHA-256: `d2b028710ff8e3bdf752dd8fff19099790e416b675e96ed360338355ccf78185`

- P=1: 865.97s
- P=4: 264.78s
- P=8: 188.94s
- P=max(15): 146.11s

after P=1/4/8/maxは完全一致。beforeとも完全一致。trial内のrunは分割していない。raw/timeは `issue-292-corrected-workshop-{p1,p4,p8,pmax}*` と `issue-292-corrected-workshop-after-{p1,p4,p8,pmax}*`。

## 決定性の注意

旧depth実装は1 scenario task内で4 depthを同一module-local RNG streamから順次消費していた。depth分割後はtask境界ごとに決定的seedを導出するため、旧origin/mainのdepth stdout SHAとは一致しない。上記 before/after SHAの差がその証跡。afterの `SIM_PARALLEL=1` と4/8/maxは全条件でbyte完全一致している。

乱数消費順を数字合わせで再現せず、分割単位をseed identityに含めてworker schedulingから独立させた。出力を旧depth値へ戻す設計は採用していない。未解決論点は、depthの旧基準値をbit単位で保持する必要がある場合、共有RNG streamのcheckpoint設計が別途必要になる点。

## 検証

- `node scratch/test_sim_reward_paths.js`: PASS
- `npm run lint`: PASS（依存bundleをESLint対象にしない標準配置で実行）
- `npm run test:unit`: PASS（60 tests / 3 skipped）
- `node --check`（変更3ファイル）: PASS
