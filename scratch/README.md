# Scratch ownership

`scratch/` contains executable development investigation assets, not test suites.
Every executable belongs to exactly one owner directory:

| Directory | Ownership | Naming | Lifecycle |
| --- | --- | --- | --- |
| `simulations/` | balance, progression, formula, map, and simulation infrastructure | `sim_<subject>.js`; infra may use an explicit descriptive name | canonical or reusable; never auto-run by the unit runner |
| `measurements/` | statistical measurement, comparison, provenance, and measurement reports | `<verb>_<subject>.js` or `measurement_<subject>.js` | reusable infrastructure or explicit one-off command |
| `benchmarks/` | performance probes | `bench_<subject>.js` | explicit command only |

All executable tests live under repository-level `tests/`; see `tests/README.md`.
Historical summaries, raw-result references, fixtures, and images belong in
`evidence/` (with generated/raw outputs under `evidence/results/`). Evidence is
preserved for provenance and is not executable test input.

Simulation lifecycle is explicit in `simulations/simulation_manifest.js`.
The production-backed `sim_depth_material_ev.js` is canonical. Runners and
helpers that remain part of current regression or measurement infrastructure are
named for their behavior and use the `reusable` lifecycle, including `infra`
dependencies used by a canonical or reusable runner. Current executable
inventory contains only canonical and reusable assets. Past results remain in
`evidence/` for provenance; historical executable runners are not retained.

Issue-specific one-off runners are temporary branch assets: before merge they
must either be deleted after their evidence is recorded or promoted to an
Issue-independent semantic name. Permanent files under `scratch/` must not use
Issue-numbered names or numeric Issue suffixes.

The ownership regression at `tests/node/regression/test_scratch_ownership.js`
enforces these directory and naming boundaries.

## Browser playtest (`measurements/run_browser_playtest.js`)

### 使い方（日本語）

本物のゲームを dev サーバ上でヘッドレスブラウザに自動プレイさせ、到達階・死因・拾った装備・装備判断を記録する。ビルドやテストスイートには含まれない（明示実行のみ）。ファイルは `measurements/run_browser_playtest.js`（ランナー）、`measurements/browser_playtest_driver.js`（ブラウザ側ドライバ）、`measurements/sample_chest_loot.js`（宝箱分布）。

1. dev サーバを起動する。

   ```bash
   npm run dev -- --port 5173
   ```

2. 別ターミナルでシードを指定して回す（シード1〜10、剣キット、装備方針あり）。

   ```bash
   node scratch/measurements/run_browser_playtest.js --url http://localhost:5173 --seeds 1-10 --out /tmp/pt.json
   ```

   1ランごとに1行、最後に「最深階の一覧・B5到達数・守護者の勝利数・Core付き装備を見た数」を表示する。`--out` の JSON に各ランの行動記録（`journal`）・戦利品（`loot`）・装備判断（`equipLog`）・最後の装備が入る。

3. よく使うオプション

   | オプション | 意味 |
   |---|---|
   | `--seeds 1-10` / `--seeds 3,7` | 回すシード。同じシード・同じコードなら同じ結果になる |
   | `--kit vanguard\|scout\|devotion\|arcana` | 開始キット（剣・軽装・祈り・術式） |
   | `--equip greedy\|none` | 装備方針。`greedy` は鑑定・装備・試着・ルーン装着を行う |
   | `--explore 0.6` | HP がこの割合を切るまで探索し、切ったら階段へ（`0` で階段直行） |
   | `--maxFloor 3` | この階の階段で止める |
   | `--boss` | B5 守護者に直接ワープして戦う（`--bossLevel 3 --bossMaxHp 55 --bossHp 40`） |
   | `--headed` | ブラウザを表示して見る |
   | `--speed 1` | 演出を実時間で再生（既定 0.1 = 10倍速） |

4. 修正前後を同じマップで比べる。比較したい ref を別の worktree で別ポートに起動し、`--compare` で並べる。

   ```bash
   git worktree add --detach /tmp/base origin/main
   ln -s "$PWD/node_modules" /tmp/base/node_modules
   (cd /tmp/base && npx vite --port 5174 --strictPort) &
   node scratch/measurements/run_browser_playtest.js --url http://localhost:5174 --compare http://localhost:5173 --seeds 1-10
   ```

   最後に `same B1 map on both sides: n/N` と出れば、両側が同じマップで遊んでいる。戦闘・戦利品の乱数は途中から分岐するので、1ラン同士ではなくシード多数の分布で比べる。

5. 宝箱の中身の分布だけ見たいとき（ブラウザ不要）。

   ```bash
   node --import tsx/esm scratch/measurements/sample_chest_loot.js
   ```

注意: 経路探索はマップ全体を見ている、通常戦でガードしない、HP30%以下で回復薬→なければ逃走、など人間とは違う近道がある（下の Known shortcuts）。結果は傾向として扱う。

---

Not part of the build or the test suites. They drive the real game running on
the Vite dev server, so combat, traps, chests and loot come from production
code in the checked-out revision.

### Seeded runs: `run_browser_playtest.js`

```bash
npm run dev -- --port 5173
node scratch/measurements/run_browser_playtest.js --url http://localhost:5173 \
  --seeds 1-10 --kit vanguard --equip greedy --out /tmp/pt.json
```

Each seed gets a fresh headless Chromium context (empty trial save), a seeded
`Math.random`, and a fixed run seed (`PT-<seed>:run:1700000000000`). The same
seed on the same revision replays the same run exactly (same journal).

Options:

- `--kit vanguard|scout|devotion|arcana`
- `--explore 0.6` — explore the floor until HP falls below this share, then
  head for the stairs (`0` = stairs first)
- `--equip greedy|none` — gear policy (below)
- `--maxFloor N` — stop at the stairs of floor N
- `--speed 0.1` — timer scale for animations (`1` = real time)
- `--boss` (+ `--bossLevel --bossMaxHp --bossHp`) — warp to the B5 guardian
  with a fixed Lv/HP instead of a full run
- `--headed` — watch the browser

#### Before/after on identical maps

Floors are generated from the run seed only, so two revisions see the same
maps. Start a second dev server from another worktree and pass `--compare`:

```bash
git worktree add --detach /tmp/base <ref>
ln -s "$PWD/node_modules" /tmp/base/node_modules
(cd /tmp/base && npx vite --port 5174 --strictPort) &
node scratch/measurements/run_browser_playtest.js --url http://localhost:5174 \
  --compare http://localhost:5173 --seeds 1-10
```

The summary prints `same B1 map on both sides: n/N` (layout fingerprint).
Combat and loot share one `Math.random` stream, so the two sides diverge after
the first point where the revisions consume randomness differently; compare
distributions over many seeds, not single runs.

#### Gear policy `greedy`

After every step in explore mode:

1. spend identify powder on unidentified equipment;
2. equip the best identified item by the game's own equipment preview
   (`attack`/`defense` ×2, `maxHp` ×0.3, `maxMp` ×0.5, …, Core +3, known
   curse −5) — a crude stand-in for a player, not a balance claim;
3. try on one unidentified weapon/armor/shield (one exploration turn) and
   revert if visible ATK+DEF dropped;
4. socket spare Runes into a medium with a free slot.

Output per run: deepest floor, guardian result, cause of death, every object
that entered the bag (`loot`), gear decisions (`equipLog`), the last live
equipment, and the full event journal.

### Known shortcuts

- Pathfinding reads the whole internal map (a human has to explore). It avoids
  discovered traps and cells within two steps of a roaming elite.
- The gear policy calls domain APIs (identify, loadout commit) instead of
  tapping through the equipment overlay.
- No Guard in ordinary fights; in guardian fights it guards once per telegraph.
- HP ≤ 30%: potion, else flee. Always disarms, always drinks from springs.
- `--boss` is not a full-run result: level/HP are set by hand and the walk to
  the guardian uses a repel effect.

### Other

- `browser_playtest_driver.js` can also be copied to `public/__play.js` and used from the
  console (`await import('/__play.js'); await __playRun({ seed: 1 })`). Delete
  the copy afterwards.
- `sample_chest_loot.js`: `node --import tsx/esm scratch/measurements/sample_chest_loot.js`
  samples trial chest loot B1–B5 (2000 rolls per floor) without a browser.
