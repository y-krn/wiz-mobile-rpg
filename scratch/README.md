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
   | `--dungeon mine\|catacomb\|nest\|library\|forge` | 行き先の迷宮（既定 `mine`＝崩れた坑道）。`catacomb`（忘れられた地下墓地）・`nest`（大裂溝の巣窟）・`library`（水没した魔導書庫）・`forge`（竜火の鍛造殿）は、計測のために解放済みとして入る。迷宮は地下5階までで、守護者を倒したら帰還の門から帰る。結果の `depth` は迷宮の中の階（1〜5）、`cleared` は守護者を倒して生還したか |
   | `--equip greedy\|none` | 装備方針。`greedy` は鑑定・装備・試着・ルーン装着を行う |
   | `--explore 0.6` | HP がこの割合を切るまで探索し、切ったら階段へ（`0` で階段直行） |
   | `--recovery on\|off\|always` | HP が `--explore` を切ったあとの動き。`on`（既定）は、その階の踏破回復が残っていて HP が3割以上なら未踏マスを歩き続ける。`always` は3割未満でも歩き続ける。`off` はすぐ階段へ向かう |
   | `--rooms use\|leave\|rescue` | 特殊な部屋の扱い。`use`（既定）は今回の冒険に効くものだけ使う。`leave` は素通り。`rescue` は番人も助け出し、引き返して歩いて連れ帰る（#2062） |
   | `--cores on\|off` | Core 別の立ち回り（返しの構え・血の型）を使うか（既定 `on`） |
   | `--roundTrip on` | 古い指定。#2062 からすべての冒険が往復で、至宝を取るか引き返すと決めたら、上り階段を歩いて地上へ出る |
   | `--turnBack 0.3` | 往復のとき、傷薬も踏破回復も無く HP がこの割合を切ったら引き返す（`0` で自分からは引き返さない） |
   | `--maxFloor 3` | この階の階段で止める |
   | `--boss` | B5 守護者に直接ワープして戦う（`--bossLevel 3 --bossMaxHp 55 --bossHp 40`） |
   | `--headed` | ブラウザを表示して見る |
   | `--speed 1` | 演出を実時間で再生（既定 0.1 = 10倍速） |
   | `--seedTimeout 900` | 1シードの上限秒数（`0` で無制限）。超えたらその時点の状態（`snapshot`）を残して1回だけ再試行し、それでも失敗したら `error` として記録して次のシードへ進む |
   | `--allowHmr` | Vite の HMR リロードを遮断しない（既定では遮断する。下の注意を参照） |
   | `--jobs 4` | 同時に回すラン数（既定は CPU 数）。ランごとに別のブラウザを使う |
   | `--ref origin/main` | そのコミットを測る。一時的な作業ツリーに取り出し、空いたポートで dev サーバーを立てて回し、終わったら片付ける。結果はシードごとに保存し、次から使い回す（下の「計測の使い回し」） |
   | `--compareRef HEAD` | `--ref` と並べて比べるコミット（`--compare` のコミット版） |
   | `--fresh` | 保存した結果を使わずに回し直す（結果は保存し直す） |
   | `--fps 1` | ゲームの描画を秒 n 回に間引く（既定はヘッドレスで 1、`--headed` では間引かない。`0` で間引かない） |

   計測を速く回すには `--jobs` を付ける。ゲームは毎フレーム画面を描き直すので、GPU の無い環境では描画が CPU を使い切る。`--fps` の既定（秒1回）で描画の負荷がほぼ無くなり、並列に回せるようになる。間引きと並列の有無で、同じシードの展開（戦闘・戦利品・到達階・死因）は変わらない。`--jobs` は CPU のコア数の2倍までを目安にする。それを超えると各ランが遅くなり、`journal` のうち自動プレイがタップの前後に書き留める行（ログの写しや階段到着時の状態）が1〜2行抜けたり増えたりすることがある。最後に `N runs in Ns` と所要時間が出る。

4. 修正前後を同じマップで比べる。比較したい ref を別の worktree で別ポートに起動し、`--compare` で並べる。

   ```bash
   git worktree add --detach /tmp/base origin/main
   ln -s "$PWD/node_modules" /tmp/base/node_modules
   (cd /tmp/base && npx vite --port 5174 --strictPort) &
   node scratch/measurements/run_browser_playtest.js --url http://localhost:5174 --compare http://localhost:5173 --seeds 1-10
   ```

   最後に `same B1 map on both sides: n/N` と出れば、両側が同じマップで遊んでいる。戦闘・戦利品の乱数は途中から分岐するので、1ラン同士ではなくシード多数の分布で比べる。

   コミット同士を比べるなら、作業ツリーとサーバーの用意は `--ref` に任せられる。

   ```bash
   node scratch/measurements/run_browser_playtest.js --ref origin/main --compareRef HEAD --seeds 1-10
   ```

5. 宝箱の中身の分布だけ見たいとき（ブラウザ不要）。

   ```bash
   node --import tsx/esm scratch/measurements/sample_chest_loot.js
   ```

### 計測の使い回し（#2079）

`--ref` / `--compareRef` で測った結果は、シードごとに git の共通ディレクトリ（`.git/playtest-cache/`。すべての作業ツリーで共有、コミットされない）へ保存される。同じ鍵のシードは回さずに保存した結果を出す（行の末尾に `(cached)`、最後に `N from cache`）。

- 鍵は「そのコミットのゲームのソース（`src`・`public`・`index.html`・`vite.config.js`・`package-lock.json`）」「いま手元にあるランナーとボット（`run_browser_playtest.js`・`browser_playtest_driver.js`）」「展開を変える指定（`--kit` `--dungeon` `--explore` `--equip` `--maxFloor` `--speed` `--recovery` `--rooms` `--cores` `--roundTrip` `--turnBack` `--boss` 系）」「シード」。
- ゲームのソースに触れないコミット（設計文書・テスト・scratch だけの変更）では鍵が変わらないので、main が進んでも変更前の計測をそのまま使える。
- ボットはどちらの側も手元のものを使う。ボットを直すと、保存した結果はすべて使われなくなる（新しいボットで測り直す）。
- 10本のあと `--seeds 1-30` にすると、足りない20本だけ回す。
- 失敗・タイムアウト・HMR を遮断したランは保存しない。
- まとめて消すときは `.git/playtest-cache/` を消す。

注意（dev サーバのリロード）: Vite はリポジトリ内のファイル（`src/` の編集やブランチ切替など）が変わると、開いている全ページをフルリロードする。実行中のランが破棄されないよう、ランナーは既定でブラウザ側の HMR メッセージを捨てる。遮断したシードには `hmrSuppressed` が付き、最後に `source changed during seeds [...]` と表示される（以降のシードは新しいコードで動いている）。比較用の計測は、編集されない別 worktree の dev サーバで回すのが確実（`--ref` はこれを自動で行う）。

`--out` はシードが終わるたびに書き直され、Ctrl-C で中断したときもそこまでの結果を `complete: false` で残す。ゲーム側の例外（クリック処理内のエラーなど）は各ランの `pageErrors` に記録され、最後に件数付きで表示される。

最後の2行目に「止まったシード・生還数・買った傷薬の数・部屋で取った行動の数・`cannot equip` の数」が出る。各ランの JSON には `returned`（生還）・`companions`（連れ帰った相手）・`roomActions`・`purchases`・`eliteFlees`（階ごとの強敵からの逃走回数）・`eliteFightsForced`・`bloodUses`・`riposteGuards` が入る。

自動プレイの方針（#1881）:

- **探索をやめる条件**: HP が `--explore` 以上なら探索を続ける。切ったら、その階の踏破回復（未踏マス1つにつき最大HPの2%、階ごとに最大HPの半分まで）が残っていて HP が3割以上のあいだは未踏マスを歩き、そうでなければ階段へ向かう。同じ階で強敵から2回逃げたら、HP に関係なく階段へ向かう。
- **見つけた罠**: 探索の目的地にしない。ほかに道が無いときだけ通る（通るときは解除を試みる）。
- **守護者の前**: 踏破回復が残っていれば先に歩いて回復し、それから傷薬、泉や野営の順に使う。
- **守護者を倒した後**: 獣の牙があれば深層商人で傷薬を6個まで買い足す。守護者を倒すと至宝を持つので、来た道を歩いて帰る。`--rooms rescue` で同行者がいれば、その時点で引き返す。
- **特殊な部屋**: `use` は支給品を受け取る、HP 8割未満なら休む、墓標に祈る、状態異常なら浄める、素材が費用の2倍以上あれば鍛え直し・繕い、HP 6割以上なら鉱脈を掘る。強敵と戦う選択肢・誓約・献灯・写本・発破・鏡・見取り図（ボットは地図を最初から読める）は選ばない。`rescue` はこれに加えて、番人のいる部屋へ向かい、掘り出す・水を抜く・火を入れる・（HP 7割以上なら）血を捧げる、を選ぶ。繭を切る（強敵と戦う）は選ばない。
- **音（坑道のルール、#2063）**: 坑道では、鉱脈を掘るのは HP 8割以上のときだけ（ほかの迷宮は6割）。物音が残っている間に始まった戦闘を数え、結果の `noiseFights` と、`journal` の戦闘行の `[noise]` に残す。
- **呪い（#2063）**: 呪いと分かった装備も、プレビューの数字（呪いの良い面と悪い面を含む）が今の装備を 4 点以上上回れば着る（外せなくなる分を差し引く）。地下墓地の祭壇では、素材が足りれば呪いを解く（着ている物が先）。結果の `equipLog` に `CURSE:` 付きの装備、`roomActions` に解呪が残る。
- **装備の評価**: 戦い方に合わせて重みを変える。杖を持っているあいだは魔力と最大MPを重く、攻撃力を軽く見る。剣の冒険者は杖に持ち替えず、杖の冒険者は剣に持ち替えない（以前は剣キットが杖を拾って持ち替え、術式キットが杖をメイスに替えて呪文を失っていた）。
- **Core 別の立ち回り**: 返しの構えは、攻撃の技が待ち時間のあいだ防御して技を戻し、次の技を1.5倍で打つ（魔力集中のような自分に使う技では行わない）。血の型は、守護者戦に限り、払ったあと HP が半分以上残るなら HP を払って技を打つ。罠喰いは宝箱を必ず開ける方針がそのまま当てはまる。
- **瓦礫**: 階段・守護者・商人などへの道が瓦礫でしか通じないときは掘って進む。道が無いときは理由（瓦礫の先／強敵が道をふさいでいる／通れる道が無い）を `journal` に残す。
- **往復（#2062 からすべての冒険）**: 至宝を取った後と、引き返すと決めた後は、各階の上り階段へまっすぐ向かう（寄り道しない）。追跡者からは逃げる。結果に `stepsBy`（行き `down:階`・帰り `up:階` の手数）、`turnBackAt`（引き返した階）、`hunterMin`（階ごとに追跡者がいちばん近づいた距離）、`returnFlees`（帰り道で追いつかれた回数）、`roundTrip.treasure`（至宝を持ち帰ったか）が入る。要約の3行目に、歩いて生還した数・至宝を持ち帰った数・帰りで死んだ数・追いつかれた回数・最接近の中央値が出る。
- **強敵が唯一の道をふさぐとき**: ふだんは強敵から逃げる。強敵が階段や守護者への唯一の道にいるときは、その場で40手ほど待つ。それでも道が開かなければ、その階では逃げずに戦って通る（`eliteFightsForced` に階が入る。#2056）。

注意: 経路探索はマップ全体を見ている、通常戦では（返しの構えを除き）ガードしない、HP30%以下で回復薬→なければ逃走、など人間とは違う近道がある（下の Known shortcuts）。結果は傾向として扱う。

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
- `--recovery on|off|always` — what to do once HP is under `--explore`. `on`
  (default): keep walking unvisited cells while the floor still gives HP back
  for it and HP is at least 30%. `always`: the same without the 30% limit.
  `off`: head for the stairs at once
- `--rooms use|leave|rescue` — special rooms. `use` (default) takes what helps
  this run; `leave` walks past; `rescue` also frees keepers and turns back to
  walk out with them (#2062)
- `--cores on|off` — Core-specific combat habits (Riposte, Blood; default `on`)
- `--roundTrip on` — kept for old command lines: since #2062 every run is a
  round trip, and the bot walks back up and out once the run holds the
  treasure or has decided to turn back
- `--turnBack 0.3` — on a round trip, turn back when HP is under this share
  with no potion and no walking recovery left (`0` = never on its own)
- `--dungeon mine|catacomb` — which dungeon to enter (default `mine`). The
  catacomb is opened directly for the measurement. A dungeon is five floors;
  with the guardian down the bot goes home through the gate. The result has
  `depth` (the floor inside the dungeon, 1-5) and `cleared` (beat the guardian
  and came home)
- `--equip greedy|none` — gear policy (below)
- `--maxFloor N` — stop at the stairs of floor N
- `--speed 0.1` — timer scale for animations (`1` = real time)
- `--boss` (+ `--bossLevel --bossMaxHp --bossHp`) — warp to the B5 guardian
  with a fixed Lv/HP instead of a full run
- `--headed` — watch the browser
- `--seedTimeout 900` — wall-clock limit per seed in seconds (`0` = none). A
  failed seed is retried once, then recorded with `error` (and a `snapshot` of
  where the bot was) and the run moves on
- `--allowHmr` — let Vite HMR reload the page. By default the runner drops HMR
  messages in the browser so a source edit or branch switch does not destroy a
  running seed; affected seeds carry `hmrSuppressed`
- `--jobs N` — play N runs at once, each in its own browser (default 1).
  Results stay in seed order per side
- `--fps N` — hand the page N animation frames per second (default 1
  headless, no limit with `--headed`; `0` = no limit). The game redraws every
  frame, so without a GPU the drawing, not the game logic, uses up the CPU.

Neither option changes how a seed plays out (fights, loot, depth, cause of
death). Keep `--jobs` at about twice the CPU cores: past that every run slows
down, and the journal's bookkeeping lines (the log line or status the bot
samples around a tap) can gain or lose a line.

`--out` is rewritten after every seed and on Ctrl-C (`complete: false` until
all seeds finish). Uncaught page exceptions are kept per seed in `pageErrors`.

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
   (`attack`/`defense` ×2, `maxHp` ×0.3, …, Core +3, relative to the item
   already in the slot, change only when the gain is ≥ 0.5; a known curse is
   never put on) — a crude stand-in for a player, not a balance claim. The
   weights follow how the adventurer fights: holding a spell medium (wand,
   staff) `magic` ×2, `maxMp` ×1 and `attack` ×0.5 instead, and neither side
   swaps a weapon for one of the other kind (#1881: before this the sword kit
   picked up wands and the spell kit dropped its wand for a mace);
3. try on one unidentified weapon/armor/shield (one exploration turn) and
   revert if visible ATK+DEF dropped (never a weapon of the other kind);
4. socket spare Runes into a medium with a free slot.

Build vNext trial (#1801) behavior, in every policy:

- the weapon technique is used whenever it is ready and free (self techniques
  only when MP is missing), aimed at a telegraphing enemy first;
- the first chest's pick-one build seed takes the option with the best gear
  score (`--equip none` leaves all three).

Output per run: deepest floor, guardian result, cause of death, every object
that entered the bag (`loot`), gear decisions (`equipLog`), technique uses
(`techniqueUses`), the build seed offer and pick (`seedChoice`), the last live
equipment, and the full event journal. The run policy adds `returned`,
`companions`, `roomActions`, `purchases`, `eliteFlees` (per floor),
`eliteFightsForced`, `bloodUses` and `riposteGuards`; the summary's second line counts stuck seeds, returns,
potions bought, room actions and refused equips.

#### Run policy (#1881)

Measurement policy, not game rules.

- Stop exploring: at or above `--explore` HP the bot explores. Below it, it
  keeps walking unvisited cells only while the floor's walking recovery (2% of
  max HP per new cell, half of max HP per floor) is not spent and HP is at
  least 30%; otherwise it heads for the stairs. Two escapes from a roaming
  elite on one floor also send it to the stairs.
- A discovered trap is never an exploration target; it is crossed (with a
  disarm attempt) only when nothing else leads on.
- Before a guardian: walk off the remaining recovery first, then potions, then
  a spring or camp.
- After a guardian: buy heal potions at the deep merchant up to six (one fang
  each), stop exploring that floor, descend. With `--rooms rescue` and a
  companion, leave through the return gate instead.
- Special rooms, `use`: take a supply, rest under 80% HP, pray at a grave,
  cleanse a status, temper or mend with twice the material cost in hand, dig a
  vein at 60% HP or more. Never an optional fight, the oath, an offering, a
  copy, blasting, a mirror or a floor plan (the bot reads the map anyway).
  `rescue` adds: walk to the keeper's room, dig out / drain / fuel, and pay
  blood at 70% HP or more. It does not cut the cocoon (an elite fight).
- Cores: Riposte guards while an attack technique cools down, then strikes at
  1.5x (not with a self technique such as focus mana).
  Blood pays HP for the technique only against a guardian and only with half
  the HP left afterwards. Trap Eater needs no habit: every chest is opened.
- Rubble is dug only when the stairs, guardian, merchant or gate cannot be
  reached otherwise. A missing path is journaled with its reason.
- Round trip (every run since #2062): once going home the bot heads straight for
  each floor's up stairs (no detours) and flees the hunter. The run records
  `stepsBy` (`down:<floor>` / `up:<floor>`), `turnBackAt`, `hunterMin` (the
  hunter's closest approach per floor), `returnFlees` (times it was caught on
  the way back) and `roundTrip.treasure`; the summary's third line counts
  walk-outs, treasures carried out, deaths on the way back, catches and the
  median closest approach.
- Roaming elites are fled from. When one stands on the only way to the stairs
  or the guardian, the bot waits about forty steps; if the way stays shut it
  walks into the elite and fights it out on that floor (`eliteFightsForced`
  lists the floor, #2056).

Run measurements against a dev server whose source is not being edited (for
example a separate worktree of a commit): an HMR reload destroys the running
page. The runner retries a seed once after such a reload.

### Known shortcuts

- Pathfinding reads the whole internal map (a human has to explore). It avoids
  discovered traps and cells within two steps of a roaming elite. The rescue
  policy walks straight to a keeper's room for the same reason.
- The gear policy calls domain APIs (identify, loadout commit) instead of
  tapping through the equipment overlay.
- No Guard in ordinary fights (except the Riposte habit); in guardian fights
  it guards once per telegraph.
- HP ≤ 30%: potion, else flee (it does not cast or fight on). Always disarms,
  always drinks from springs, always opens chests (mimics included).
- Routes around closed seals and collapsed ledges instead of pulling levers,
  and digs rubble only as a last resort.
- A chest met while paralysed is left behind and not revisited.
- `--boss` is not a full-run result: level/HP are set by hand and the walk to
  the guardian uses a repel effect.

### Other

- `browser_playtest_driver.js` can also be copied to `public/__play.js` and used from the
  console (`await import('/__play.js'); await __playRun({ seed: 1 })`). Delete
  the copy afterwards.
- `sample_chest_loot.js`: `node --import tsx/esm scratch/measurements/sample_chest_loot.js`
  samples trial chest loot B1–B5 (2000 rolls per floor) without a browser.
