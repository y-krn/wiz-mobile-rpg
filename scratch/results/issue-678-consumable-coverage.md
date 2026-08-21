# Issue #678: 深度simの消耗品カバレッジ棚卸し

## 結論

消耗品18種を、simに使用経路があり実際に消費された **A**、使用経路はあるが
今回の固定条件では消費されなかった **B**、simに使用経路がない **C** に分類した。
Cは測定不能であり、Bの「使用経路はあるが未使用」と混同しない。

計測はカウンタ追加だけで、乱数を消費せず、ゲーム本体のルール・消耗品の定義・値を
変更していない。`src/` は変更していない。

## 計測条件

- base: `26ec3f3ae48e7280d57579f7ae5b93b1156c09c6`
- 計測コミット（sim本体）: `a2cc95ab0e9be8f906fc615cfb5754c4eb9f6b5a`
- baseには #684（#677の魔力草戦闘使用）と #685（dead craft実行経路整理）が
  取り込まれている。`useManaPotionIfNeeded` 周辺とcraft整理はリベースで取り込んだだけで、
  本Issueの変更ではない。
- `SIM_SEED=231`, `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`
- `SIM_PARALLEL` は指定しなかった
- 到達階の受入条件は #624 固定環境で計測した
- 固定環境の `DEPARTURE_CRAFT_IDS` は
  `TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`

## A / B / C 分類

入手数・消費数は、固定環境の4職×500 run、計2,000 runの合計である。

| 分類 | 品目 | ID | 入手数 | 消費数 | sim側の判定根拠 |
| --- | --- | --- | ---: | ---: | --- |
| A | 傷薬 | `HEAL_POTION` | 9259 | 8337 | `useHealPotionIfNeeded` |
| A | 上薬 | `GREATER_HEAL` | 1464 | 1347 | `useHealPotionIfNeeded` |
| A | 魔力草 | `MANA_POTION` | 514 | 111 | `getCombatManaPotionAction` / `useManaPotionIfNeeded` |
| A | 帰還の翼 | `TOWN_PORTAL` | 2000 | 1015 | `useTownPortalIfNeeded` |
| A | 祝福の聖水 | `HOLY_WATER` | 1722 | 288 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| A | 剛力の薬 | `STR_POTION` | 1770 | 92 | ボス／中ボス開幕の戦闘行動選択 |
| A | 守りの薬 | `GUARD_POTION` | 2000 | 91 | ボス／中ボス開幕の戦闘行動選択 |
| A | 疾風の薬 | `HASTE_POTION` | 1721 | 87 | ボス／中ボス開幕の戦闘行動選択 |
| A | 罠外しキット | `TRAP_KIT` | 1769 | 1655 | `resolveChestTrapForSimulation` の罠解除行動 |
| B | 解毒薬 | `ANTIDOTE` | 3027 | 0 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| B | 目薬 | `EYE_DROPS` | 854 | 0 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| B | 解痺薬 | `PARALYZE_CURE` | 573 | 0 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| B | 覚醒薬 | `WAKE_POWDER` | 1007 | 0 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| B | 万能薬 | `PANACEA` | 1407 | 0 | `STATUS_CURE_ITEMS` → `useStatusCureIfNeeded` |
| C | 鳴らし玉 | `NOISE_BALL` | 0 | 0 | simに使用経路なし |
| C | 魔力の雫 | `ETHER` | 1402 | 0 | simに使用経路なし |
| C | 離脱のスクロール | `ESCAPE_SCROLL` | 0 | 0 | simに使用経路なし |
| C | エリクサー | `ELIXIR` | 0 | 0 | simに使用経路なし |

`HOLY_WATER` は `STATUS_CURE_ITEMS` の毒治療候補として、
`useStatusCureIfNeeded` から使用される。
`STR_POTION`、`GUARD_POTION`、`HASTE_POTION` は一覧に載るだけではなく、ボス／
中ボス戦の戦闘行動として選択され、在庫が減ることを確認した。

## 入手経路

### 出発準備の craft レシピ

`src/craft.js` の出発準備レシピにある品目:

`HEAL_POTION`, `ANTIDOTE`, `HOLY_WATER`, `MANA_POTION`, `TRAP_KIT`,
`TOWN_PORTAL`, `GREATER_HEAL`, `GUARD_POTION`, `EYE_DROPS`

### 宝箱プール

`src/rules/chest_rules.js` の宝箱候補にある品目:

`HEAL_POTION`, `ANTIDOTE`, `EYE_DROPS`, `PARALYZE_CURE`, `WAKE_POWDER`,
`MANA_POTION`, `HOLY_WATER`, `TOWN_PORTAL`, `TRAP_KIT`, `GREATER_HEAL`,
`ETHER`, `PANACEA`, `STR_POTION`, `HASTE_POTION`

### 両方の入手元にない品目

`NOISE_BALL`（鳴らし玉）、`ESCAPE_SCROLL`（離脱のスクロール）、`ELIXIR`
（エリクサー）。これらは「simの使用経路がない」こととは別に、現行の出発準備・
宝箱プールから通常入手できないことを明示する。

`GUARD_POTION`（守りの薬）は宝箱にはないが、出発準備の craft レシピにあるため、
入手不能品には含めない。

## `ITEM_EFFECTS` と特殊処理

18種中16種には `src/systems/item_effects.js` のエントリがある。18種に
`campOnly` が付いたものはない。

| 品目 | `ITEM_EFFECTS` | `campOnly` |
| --- | --- | --- |
| 傷薬 `HEAL_POTION` | あり | なし |
| 上薬 `GREATER_HEAL` | あり | なし |
| 魔力草 `MANA_POTION` | あり | なし |
| 帰還の翼 `TOWN_PORTAL` | あり | なし |
| 祝福の聖水 `HOLY_WATER` | あり | なし |
| 解毒薬 `ANTIDOTE` | あり | なし |
| 守りの薬 `GUARD_POTION` | あり | なし |
| 罠外しキット `TRAP_KIT` | なし | なし |
| 万能薬 `PANACEA` | あり | なし |
| 解痺薬 `PARALYZE_CURE` | あり | なし |
| 剛力の薬 `STR_POTION` | あり | なし |
| 覚醒薬 `WAKE_POWDER` | あり | なし |
| 疾風の薬 `HASTE_POTION` | あり | なし |
| 目薬 `EYE_DROPS` | あり | なし |
| エリクサー `ELIXIR` | あり | なし |
| 魔力の雫 `ETHER` | あり | なし |
| 離脱のスクロール `ESCAPE_SCROLL` | なし | なし |
| 鳴らし玉 `NOISE_BALL` | あり | なし |

- `ESCAPE_SCROLL`: `ITEM_EFFECTS` にはない。`src/systems/item_resolution.js` の
  専用処理で、アイテムを消費し、敏捷度による成功判定を行い、成功時に
  `fleeCombat` へ進む。ゲーム側では実装済みだが、深度simは
  `FLEE_POLICY` による抽象的な逃走を使い、アイテム固有の使用経路は持たない。
- `TRAP_KIT`: `ITEM_EFFECTS` にはない。`src/chest.js` の `useTrapKit()` が
  宝箱UIからアイテムを消費して罠を解除する。深度simには罠回復の専用経路があり、
  `resolveChestTrapForSimulation` の罠解除行動で使用される。汎用の戦闘アイテム
  効果としては扱われない。
- `NOISE_BALL`: `src/menu/explore_actions.js` の探索方向選択から、鳴らし玉の
  専用イベントへ進むゲーム側経路がある。探索方向・徘徊敵操作は深度simの対象外。

## C の判定

- `ETHER`: **モデル化の欠落**。宝箱から入手でき、ゲーム側にはMP回復効果がある。
  しかし現行simの自動MP回復経路は `MANA_POTION` に限定され、`ETHER` を選ぶ経路がない。
  後続Issueで品目単位にモデル化する対象。
- `NOISE_BALL`: **意図的な対象外**。探索方向と徘徊敵の操作をsimがモデル化していない。
  それらをシミュレーション対象にする場合に再評価する。
- `ESCAPE_SCROLL`: **現行抽象化では意図的な対象外**。simはアイテム固有の逃走判定ではなく
  `FLEE_POLICY` で戦闘逃走を抽象化している。アイテム別の逃走経済を対象にする場合に再評価する。
- `ELIXIR`: **意図的な対象外**。現行の出発準備・宝箱プールに供給元がなく、深度simの通常条件で
  個体が生成されない。供給元が追加された場合に再評価する。

## 到達性の確認

ゲーム側については `rg` の参照だけで結論を出さず、`npm run build` の本番バンドルを確認した。
生成された `dist/assets/index-DDCh48S9.js` で固定文字列を確認した結果:

| 固定文字列 | 本番バンドル hits |
| --- | ---: |
| `傷薬`（陽性対照） | 3 |
| `鳴らし玉` | 2 |
| `魔力の雫` | 1 |
| `離脱のスクロール` | 2 |
| `罠外しキット` | 4 |
| `エリクサー` | 2 |

各hitはアイテム定義・効果、探索メニュー、宝箱UI、または専用アイテム解決経路に対応し、
未説明のバンドルhitは残っていない。動的import、barrel export、文字列ディスパッチ、
inline handler、`window`/`globalThis`/`eval`/`new Function` の経路も対象ファイルで確認した。
sim側はbundle対象外のため、静的な5つの使用関数の確認と実行時カウンタで判定した。

## 基準線と決定性

最新base（#684・#685取り込み後）の固定条件の到達階平均:

| 職 | 実測 | 基準線 |
| --- | ---: | ---: |
| 戦士 | 5.8720 | 5.8720 |
| 盗賊 | 4.8980 | 4.8980 |
| 僧侶 | 4.5980 | 4.5760（#684前） |
| 魔術師 | 6.4800 | 6.4800 |

戦士・盗賊・魔術師は基準線と一致した。僧侶の **+0.0220** は、観測追加ではなく
baseに取り込まれた #684（#677）の魔力草戦闘使用による既知の差分である。#684自身の
結果にも同じ `4.5760 → 4.5980` が記録されている。#684前のbase=`d2e83bd`での
観測追加計測では、4職すべて基準線と一致した。

同じseed・条件で `scratch/sim_depth_material_ev.js` を2回実行したstdoutのSHA-256は、
次の値で2回とも一致した。

`70af47bbadc40567b6288b227e7d62b10d608a88dc6312a58fc61d1cfa6e8b43`

固定環境の `scratch/sim_commit_depth_624.js` は実行時間フィールドを含むためstdout全体の
SHA-256は `f87f32a4cf80cdd5180d3f5d7b845c10db4bc72a69e0ac3cb0ed8ef6d74f9360` /
`4b6582674ada1e6b61b1c8fbdf727697b388e9014253eaee064b0fecec70e29a` となったが、
`rows` の正規化JSON SHA-256は2回とも
`e7b938ba5fc21da9e683349a1b3868af6d0edf17ab31f676ed489e67eeab6e3e` で一致した。

## 検証

- `node --check scratch/sim_depth_material_ev.js`: PASS
- `node --check scratch/sim_commit_depth_624.js`: PASS
- `SIM_RUNS=1 SIM_CALIBRATION_RUNS=1 ... node scratch/sim_depth_material_ev.js`: PASS
- `node scratch/test_sim_reward_paths.js`: PASS（65 files）
- `npm run lint`: PASS
- `npm run test:unit`: PASS（85 executed / 3 skipped）
- `npm run build`: PASS

長時間simの生出力は `/private/tmp` に保存し、コミットにはこの要約とSHA-256のみを含めた。

## #692 訂正 addendum（2026-08-21）

上の棚卸しと分類は履歴として保持する。特に、当時の B 分類 5 種を上書きせず、
誤分類だった事実と原因をここへ追記する。

### 事実訂正と原因

Issue #689 / PR #690 の固定条件の再集計で、状態回復経路の実消費は 0 ではなかった。
`statusCureItemsUsed` の run 横断合算は PR #690 で追加済みだったが、消費カウンタの
対象は `recordConsumableConsumption` へ到達していなかった。現行 base
`8e61958b1cab3e0287713bf52c153861771f5338` では、`useStatusCureIfNeeded` の実消費直後
（`scratch/sim_depth_material_ev.js:6282`）と combat item の状態治療直後
（同 `:6075`）に `recordTrackedConsumableConsumption` の呼出し自体は存在する。
しかし当時の helper は `MANA_POTION` / `HOLY_WATER` だけを tracked 定義に持ち、専用
5 種を per-item 消費表へ記録しなかった。このため「呼出しが無い」と静的に分類するのは
現行 main については不正確であり、実際の欠落は専用 5 種を汎用消費表へ接続する計装境界
だった。

### A / B / C の再分類

下表の実測値は #689 / PR #690 の同一固定条件（4 職×500、seed 231、calibration 100）を
使用する。入手数は変わらず、消費数だけを訂正した。

| 旧分類 | 新分類 | 品目 | ID | 入手数 | 訂正後消費数 | 根拠 |
| --- | --- | --- | --- | ---: | ---: | --- |
| B | A | 解毒薬 | `ANTIDOTE` | 3027 | 1963 | 状態治療で実消費あり |
| B | A | 万能薬 | `PANACEA` | 1407 | 179 | 状態治療で実消費あり |
| B | A | 目薬 | `EYE_DROPS` | 854 | 126 | 状態治療で実消費あり |
| B | B | 覚醒薬 | `WAKE_POWDER` | 1007 | 0 | 経路あり、固定条件で未消費 |
| B | B | 解痺薬 | `PARALYZE_CURE` | 573 | 0 | 経路あり、固定条件で未消費 |

したがって、旧 A の `HOLY_WATER`（1722 / 288）は A のまま、専用 5 種の合計は
6,868 / 2,268 となる。C 4 種の判定（`NOISE_BALL`, `ETHER`, `ESCAPE_SCROLL`,
`ELIXIR`）は変わらない。なお #692 の現行 source audit では、同じ `statusCureItemsUsed`
と per-item tracked consumption を N=500 の全 30 case で比較し、`HOLY_WATER` と専用
5 種の全セルが一致した（0 も測定された 0 として一致）。

### 全 consumable consumption endpoint と tracking

「消費」は在庫が実際に減る地点で判定した。`recordStatusCureConsumption` は
`HOLY_WATER` だけ既存の source-queue helper を一度呼び、専用 5 種は generic per-item
counter へ一度だけ送るため、`statusCureItemsUsed` との二重計上はない。

| consumption endpoint | 対象 | tracking | 備考 |
| --- | --- | --- | --- |
| combat `resolvePlayerItem` / `runEncounter` round | `HEAL_POTION`, `GREATER_HEAL`, `MANA_POTION`, `HOLY_WATER`, 専用5種、`STR_POTION`, `GUARD_POTION`, `HASTE_POTION` | あり | 実 round の在庫差分を使い、専用 hook は generic fallback から除外して一度だけ記録 |
| combat mana action | `MANA_POTION` | あり | `getCombatManaPotionAction` → `resolvePlayerItem`; combat log hook |
| combat recovery action | `HEAL_POTION`, `GREATER_HEAL` | あり | round 後の在庫差分を `recordHealPotionConsumption` / `recordGreaterHealConsumption` へ接続 |
| combat status-cure action | `HOLY_WATER` + 専用5種 | あり | `runEncounter` の `simStatusBefore` と実在庫差分、`recordStatusCureConsumption` |
| post-combat / post-flee healing | `HEAL_POTION`, `GREATER_HEAL` | あり | `useHealPotionIfNeeded` の splice 直後 |
| post-combat / post-flee mana | `MANA_POTION` | あり | `useManaPotionIfNeeded` の splice 直後 |
| post-trap / post-combat / post-flee status cure | `HOLY_WATER` + 専用5種 | あり | `useStatusCureIfNeeded` の splice 直後 |
| portal retreat / floor transition | `TOWN_PORTAL` | あり | `useTownPortalIfNeeded` の splice 直後 |
| chest trap kit | `TRAP_KIT` | あり | production `src/chest.js:546`、sim `resolveChestTrapForSimulation` |
| selected combat buff item | `STR_POTION`, `GUARD_POTION`, `HASTE_POTION` | あり | actual inventory delta fallback; sim selects only modeled boss/midboss actions |
| production-only trap-kit UI path | `TRAP_KIT` | sim対応 | game-side `useTrapKit()` is modeled by the sim-specific trap endpoint, not generic item effect |
| production `ESCAPE_SCROLL` resolution | `ESCAPE_SCROLL` | 意図的なsim抽象化 gap | game source `item_resolution.js` consumes it; depth sim uses `FLEE_POLICY`, not item-specific escape |
| production `ETHER` combat use | `ETHER` | 意図的なsim抽象化 gap | effect and chest supply exist; sim mana policy intentionally models `MANA_POTION` only |
| exploration `NOISE_BALL` | `NOISE_BALL` | 意図的なsim抽象化 gap | exploration-direction / roaming-enemy interaction is outside depth sim |
| `ELIXIR` use | `ELIXIR` | 意図的なsim抽象化 gap | no normal supply in current departure/chest conditions; no sim use path |

Equipment replacement/discard `splice` is not a consumable endpoint and is excluded. The
current sim intentionally models the player-side mitigations required by the balance rules:
`TOWN_PORTAL`, healing recovery, mana potion use, status cures, and trap kits. It does not turn
the four listed abstraction gaps into measured zeroes.

### #412 impact

The structural #412 assumption is unchanged: the item catalog is still 18 usable items,
recovery is 4 and status cure is 5, and no item definition, threshold, supply rule, or material
value changed. The evidence-level conclusion does change: the five dedicated cures are not all
unused; `ANTIDOTE`, `PANACEA`, and `EYE_DROPS` have measured use, while only `WAKE_POWDER` and
`PARALYZE_CURE` remain B under this condition. This strengthens the case for measuring thin
categories before adding more recovery/cure variants, but does not invalidate #412's priority
of exploration aids and conditional buffs or require a new item.

### #692 verification record

- worktree: `/private/tmp/issue-692-consumable-tracking`; branch: `fix/692-consumable-tracking`
- `CODEX_BASE_SHA` / `origin/main`: `8e61958b1cab3e0287713bf52c153861771f5338`; ancestor: yes
- fresh measurement source commit: `7ce4f7cc601316c888b36ffb5ddbc503712a4eda`
- command: `env -u SIM_PARALLEL SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 SIM_SEED=231 node scratch/sim_depth_material_ev.js`
- N=1 smoke: PASS; focused audit: PASS (30 observations; HOLY_WATER + five dedicated items)
- N=500 raw stdout SHA-256: `c3336eddb264ca235e5e1bab11264f235cf2263ff236bed9da0dacef26164227`
  (identical on the repeated run; raw files remain untracked in `/private/tmp`)
- #624-compatible current-main harness used the same full command recorded in the #689
  section above (`env -u SIM_PARALLEL`, seed 231, runs 500, calibration 100, independent-run
  random, departure craft, conservative/EV/smart policies, `SIM_EXPLORATION_FACTOR=1.4`, and
  `ISSUE689_DETERMINISTIC=1 node scratch/sim_commit_depth_624.js`); 2,000 rows and focused audit
  PASS. The raw stdout
  SHA-256 was `8b71fb2c6e0fdffe1050bf0504427719dda639ac27743d56481ba8ccbe53c9bd` on both
  runs. Its current-main depth averages were Fighter 6.0840 / Thief 7.8340 / Priest 5.0480 /
  Mage 9.5920; these are reported separately because current main includes later depth-model
  changes, while the historical #678/#689 baseline table above is retained unchanged.
- In that same current-main harness, the six status-cure totals were
  `HOLY_WATER 2492/611`, `ANTIDOTE 3260/2146`, `PANACEA 2230/320`, `EYE_DROPS 764/102`,
  `PARALYZE_CURE 932/0`, `WAKE_POWDER 1286/0` (acquired/consumed). Every per-item total matched
  `statusCureItemsUsed`; the focused test checked all 2,000 rows, including zero-consumption
  rows.
- The focused test also accepts the direct runner's observation records and the harness JSON;
  raw output files remain untracked in `/private/tmp`.
- `node --check` for runner/test: PASS; `git diff --check`: PASS
- modeled: real `generateRunFloor` depth path, status cures, healing, mana, portals, trap kits,
  combat item resolution and reward/level-up path; omitted: the four intentional sim gaps above
- no build/browser run: no UI or production bundle paths changed

## 未確認・保留

分類、入手元、ゲーム側の特殊処理について判断できなかった点はない。
最新baseの受入基準線だけは #684 の取り込みで僧侶が変わっており、#685では変わらず、観測計装の影響と
切り分け済みである。#655のsim出力整理が先に入った場合は、同じ条件で再ベース・再計測する。
