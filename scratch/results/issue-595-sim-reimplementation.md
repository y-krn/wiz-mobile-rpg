# Issue #595 `sim_depth_material_ev.js` / src 再実装棚卸し

調査日: 2026-08-15
対象: `scratch/sim_depth_material_ev.js`（origin/main=`6752ab9` 時点）

## 結論

sim の全定義を機械的に抽出したうえで、src の同名・類似名・呼び出し先と照合した。独立した重複候補は、同じ責務をまとめた単位で18件だった。

| 判定 | 件数 |
| --- | ---: |
| 一致（現在の値・既定経路） | 13 |
| 不一致（sim 拡張を含む） | 5 |
| 未判定 | 0 |
| src へ寄せた件数 | 0 |

重要な不一致は次の5件である。

- `getSimulationHealAmount`: 既定の15/40は一致するが、sim の傷薬量 override は src にはない。
- `applyFloorTransitionHeal`: 既定の15%計算は一致するが、sim は任意回復率を受け取り、src の上限超過ガード・ログ・state参照を再現しない。
- `tickExplorationSpellEffects`: `DUMAPIC` の残りターン減算とヒント消去が欠落している。
- `CAMP_FLOORS`: sim は床2・4だけをキャンプとするが、src はバイオームB2/B4（深度1–20では床6–10・16–20）にキャンプセルを置く。
- `addMaterials`: src の正規化・既知素材限定・非負整数化を行わず、入力をそのまま加算する。

一致項目を機械的に統合することはしなかった。今回の一致には src の非公開ヘルパー、測定用の状態アダプター、将来の変更で乖離しやすい定数が含まれる。5件の不一致も、挙動を変えず安全に統合できる単純な委譲ではない。`src/movement.js` と `src/combat_logic/` は並行作業（#629）の対象でもあるため、統合せず棚卸しで止めた。

## 1. 探索方法

### 1.1 定義の機械的列挙

ファイル先頭の定義だけを対象に、指定された2種類を全件抽出した。

```sh
rg -n '^(?:export )?(?:async )?function [A-Za-z_$][A-Za-z0-9_$]*\s*\(' \
  scratch/sim_depth_material_ev.js
rg -n '^(?:export )?const [A-Z][A-Z0-9_]*\s*=' \
  scratch/sim_depth_material_ev.js
```

結果は `function` 定義293件、トップレベルの大文字 `const` 定義137件、合計430件だった。関数名だけでなく、import、呼び出し文脈、コメント、罠・回復・素材・探索・ルート・商人の定数も別途確認した。

### 1.2 src との照合

src 側の定義を横断抽出し、次を順に行った。

1. 完全一致（camelCaseを含む）を検索。
2. 大文字小文字・区切りを除いた正規化名で照合。
3. `generate`、`calculate`、`resolve`、`apply` などの接頭辞違いを呼び出し先で照合。
4. 名前が違う private 関数・定数は、ロジックの本体と引数・戻り値を読み比べた。
5. 統計集計、ログ整形、scenario override、旧sim互換など、src のゲーム挙動を再実装していないものは対象外に分けた。

完全一致で得た主な名前は `generateRunFloor`、`getScholarMaterialBonus`、`hasSpell`、`getLowestHpEnemyIndex`、`hasHolyTag`、`selectCombatAction`、`applyFloorTransitionHeal`、`getEncounterChance`、`tickExplorationSpellEffects`、`addMaterials` だった。`selectCombatAction` は同名でも src がUIメニュー、sim が自動戦闘ポリシーなので同一挙動とは判定しなかった。`getEncounterChance` は #625（Issue #623）の修正後、sim が src の `calculateEncounterChance` を呼ぶ委譲になっている。

### 1.3 実測

目視だけで済ませず、作業中に一時的な probe で次を実測した。probe 用の一時 export とスクリプトは作業終了時に削除し、sim本体には残していない。

- 階層移動回復の通常入力: src=3、sim=3。
- 探索呪文の光・魔除け: 同じ入力で同じ減算。`DUMAPIC` のみ src は `dumapicTurns=0,dumapicHint=""`、sim は `dumapicTurns=1,dumapicHint="hint"` を保持。
- 既知の整数素材入力: canonicalな素材キーの値は一致。
- 未知キー・負値・小数を含む素材入力: src は正規化して無視/切り捨て、sim は未知キーと小数・負値を保持・加算。
- `getScholarMaterialBonus`、`getEncounterChance`、`generateRunFloor` の委譲: 出力一致。
- 僧侶回復呪文、聖属性対象判定、商人の状態回復薬3種、火炎罠8–16ダメージ: 現行src値と一致。

## 2. 独立した重複候補

「一致」は現在の正典値・通常経路が一致するという意味であり、将来srcだけが変更された場合にも追随することを意味しない。

| # | sim側 | 対応するsrc側 | 判定・根拠 | 影響・将来リスク |
| ---: | --- | --- | --- | --- |
| 1 | `PRIEST_HEALING_SPELL_IDS` (`scratch/sim_depth_material_ev.js:224`) | `src/combat_logic/auto_action.js:15` `PRIEST_HEALING_SPELLS`（private） | 一致。4つのIDと順序が同じ。simの選択候補マスク、支払い予約、使用統計に使う。 | 現行結果の差は未確認。srcの候補追加・順序変更で自動行動とMP支払いが変わり、以後の乱数消費も変わり得る。 |
| 2 | `HOLY_TAGS` (`scratch/sim_depth_material_ev.js:2134`) | `src/combat_logic/auto_action.js:4` `HOLY_TARGET_TAGS`（private） | 一致。`undead`・`spirit`・`demon` が同じ。 | 聖呪文の対象選択に影響する。タグ追加時にsimだけ古くなり、戦闘分岐と乱数列が乖離し得る。 |
| 3 | `STATUS_CURE_ITEMS` (`scratch/sim_depth_material_ev.js:2135-2140`) | `src/systems/item_effects.js:18-80`（`ANTIDOTE`、`EYE_DROPS`、`PARALYZE_CURE`、`WAKE_POWDER`、`HOLY_WATER`、`PANACEA`） | 一致（現在simが追跡する取得可能アイテムの範囲）。各statusから選ぶitemはsrcの効果と一致。`ELIXIR` (`item_effects.js:82`) は現在のsim取得経路の対象外。 | 新しい治療アイテムや取得経路を追加した時、simの選択・所持集計から漏れる。状態治療は行動分岐と戦闘後の乱数消費に影響する。 |
| 4 | `MERCHANT_STATUS_CURE_STOCK` (`scratch/sim_depth_material_ev.js:2143-2147`) | `src/data/milestone_merchant.js:3-8` `MILESTONE_MERCHANT_STOCK` | 一致。simの3エントリはsrcの `antidote`、`wake_powder`、`paralyze_cure` と同じID/itemID。全商人stockの写しではなく、状態治療用の部分集合。 | stock ID/item ID/cost変更時にsimの購入・素材消費だけが古くなる。#271/#304系の供給条件にも波及し得る。 |
| 5 | `hasSpell` (`scratch/sim_depth_material_ev.js:2541`) | `src/combat_logic/auto_action.js:22`（private） | 一致。`character.spells?.includes(spellName) === true` が同じ。 | 現在はlegacy/計測側の補助。srcのspell所持表現を変えるとsim側だけ不一致になる。 |
| 6 | `getLowestHpEnemyIndex` (`scratch/sim_depth_material_ev.js:2692`) | `src/combat_logic/auto_action.js:26`（private） | 一致。生存・predicate・HP最小・同値時の先勝ちが同じ。 | 対象選択の変更頻度が高いsrc側と二重化している。対象順が変わると戦闘ログと乱数消費が変わる。 |
| 7 | `hasHolyTag` (`scratch/sim_depth_material_ev.js:2704`) | `src/combat_logic/auto_action.js:38`（private） | 一致。タグ集合だけsim側の `HOLY_TAGS` を参照している。 | #2と同じく、聖属性対象の変更がsimに反映されないリスク。 |
| 8 | `getSimulationHealAmount` (`scratch/sim_depth_material_ev.js:3026`) / `applySimulationHealItem:3044` | `src/systems/item_effects.js:8-16`、`src/rules/item_rules.js:21` | 不一致（sim拡張）。既定の傷薬15・上薬40と `getEffectiveHealAmount` は一致するが、傷薬だけ固定値・最大HP比・階層比例overrideを受ける。 | #499/#502/#516/#624など回復供給・到達度の感度分析では、overrideをsrc既定と混同してはいけない。srcの基礎回復量変更時、overrideを使わない経路は追随するが、simの基礎値コピーは追随しない。 |
| 9 | `applyFloorTransitionHeal` (`scratch/sim_depth_material_ev.js:5735`) | `src/movement.js:246-255` | 不一致（既定の通常入力では数値一致）。srcはglobal stateの先頭キャラ、15%固定、上限超過時の0返却、ログを持つ。simは任意 `recoveryRate` を受け取り、状態アダプターとしてログを省略し、上限超過の異常入力も同じガードではない。 | #516の「階層移動回復25%」比較、#612/#625の到達floor基準線に関係する。srcの回復率・死亡判定が変わればsimだけ旧式になる。 |
| 10 | `tickExplorationSpellEffects` (`scratch/sim_depth_material_ev.js:5766-5773`) | `src/movement.js:56-78` | 不一致。光と `REPEL` は同じだが、srcにある `dumapicTurns--`、期限切れ時の `dumapicHint=""`、ログがsimにない。 | 現行sim既定は `SIM_EXPLORE_SPELLS` がoffでDUMAPICをcastしないため、既存の深度結果への直接影響は確認できない。探索呪文を有効化・変更する将来測定では stale hint が残る。 |
| 11 | `CAMP_FLOORS` (`scratch/sim_depth_material_ev.js:1308`)、`applySimulatedCampRest:6416` | `src/run_map_generator.js:64-70`、`src/data/biomes.js:35,59,89-95`、回復式は `src/systems/camp_rest.js:11-35` | 不一致。simは床番号 `{2,4}` を固定する。srcはバイオームの `eventSkins.camp` を見て配置し、B2/B4は深度1–20では床6–10・16–20に対応する。回復式0.4とCORE_CAMP_MASTER倍率は一致するが、対象階の判定が違う。 | #275のcamp歩数/寄与、#419のCAMP_MASTER、#534/#624の深度・core分布、#499/#502の「既存B2/B4 camp」、#516のcamp比較の結論は、camp配置を使うセルを再監査すべき。現時点で再測定はしていない。 |
| 12 | `ROUTE_DIRECTIONS` (`scratch/sim_depth_material_ev.js:5784-5789`) | `src/run_map_generator.js:7-12` `DIRECTIONS`（private） | 一致。4方向の値・順序が同じ。 | 現在は乱数を消費しない。srcの方向順変更でBFSの同距離タイブレーク、イベント配置・経路上の測定対象が変わる。 |
| 13 | `routeKey` (`scratch/sim_depth_material_ev.js:5791`) | `src/run_map_generator.js:17-19` `keyOf`（private） | 一致。`x,y` 文字列化が同じ。 | ルート・障害セルの対応キーが変わる場合に乖離する。乱数直接影響はない。 |
| 14 | `findFloorCell` (`scratch/sim_depth_material_ev.js:5795-5802`) | `src/run_map_generator.js:21-28` `findCell`（private） | 一致。行優先・列優先の最初の一致を返す。 | 階段・ボス候補の選択順がsrc変更でずれるリスク。 |
| 15 | `canTraverseRouteEdge` (`scratch/sim_depth_material_ev.js:5804-5813`) | `src/run_map_generator.js:95-116` `getDistances` 内の辺判定 | 一致。境界、進入禁止、secret door、壁、反対面の `blockEnter` を同じ順で判定。 | map traversalの仕様変更にsimが追随しない。経路が変わると後続の遭遇・罠・イベント位置が変わり、間接的に乱数列も変わる。 |
| 16 | `findShortestFloorPath` (`scratch/sim_depth_material_ev.js:5815-5844`) | `src/run_map_generator.js:95-118` `getDistances` | 一致（目的は違う）。同じ方向順・辺判定でBFSし、simは前駆を戻してpathを作る。 | srcは距離map、simはpathなのでAPI統合は不要だが、壁・一方通行の仕様変更時に二重化する。 |
| 17 | `FLAME_TRAP_MODEL` (`scratch/sim_depth_material_ev.js:821-827`)、`resolveFlameTrapAtStep:6206-6275` | 発動条件 `src/movement.js:849-861`、ダメージ定数/効果 `src/rules/trap_effect_rules.js:14-15,41-47` | 一致（現行の発動値・乱数域）。床5、5%、cooldown5、ダメージ8–16が同じ。simはsrcの `resolveFlameTrapEffect` を呼ぶ。UIログ・演出・game overは測定アダプターとして省略。 | B5火炎罠（#578および#595のcoverage測定）の重要な乱数経路。発動率、warning判定、partyごとのダメージrollのいずれかがsrcだけ変更されると、到達floorとB5死亡原因が同時にずれる。 |
| 18 | `addMaterials` (`scratch/sim_depth_material_ev.js:6915-6919`) | `src/rules/material_rules.js:152-167` | 不一致。srcはbalanceを全素材キーで正規化し、未知キーを無視し、数量を非負整数にして新オブジェクトを返す。simはtargetを直接変更し、未知キー・負値・小数を保持する。現行の既知・非負整数dropでは値だけ一致。 | #271/#481/#595/#624の素材EV・bank素材・供給判定に関係する。現在の通常入力では差が表面化していないが、素材定義追加、異常値、報酬経路変更でsimだけ別の経済を測る。値の差は商人購入や方針分岐を通じて後続乱数にも影響し得る。 |

## 3. 同名でも独立再実装ではないもの

以下は横断検索で候補になったが、simがsrcの挙動を写経しているものとしては数えなかった。

| sim位置 / 名前 | src位置 | 判定理由 |
| --- | --- | --- |
| `generateRunFloor:84` | `src/run_map_generator.js:172` | simはmap統計を記録してから `generateRunFloorSource` を呼ぶだけ。生成ロジックの二重化ではない。 |
| `getScholarMaterialBonus:278` | `src/rules/material_rules.js:207` | simはmonster配列の集計器で、1体分の期待値はimport済みsrc関数を呼ぶ。 |
| `getEncounterChance:5757` | `src/movement.js:40-54` | #625後は `calculateEncounterChance` の委譲。`encounterRateOverride` は#612用のsim感度軸。 |
| `getSimulationDetectRate:1467` | `src/rules/trap_rules.js:221` | 通常経路はsrc `calculateDetectRate` を呼ぶ。`certain` とcap/startFloor変更はsim-only what-if。 |
| `calculateSimulationFloorTrapSuccessRate:1522` | `src/rules/trap_rules.js:190` | overrideがない通常経路はsrc関数を呼ぶ。上限変更ブランチは明示的な感度分析。 |
| `selectCombatAction:3139` | `src/combat_ui/action_selection.js:69` | srcは手動メニューのaction type選択、simは逃走・回復・状態治療・ボス薬の自動ポリシー。名前一致だけでは同等でない。 |
| `applyFloorTrapEffect:4597` / `resolveFloorTrapAtPath:6295` | `src/systems/traps.js:229-293`、`src/rules/trap_effect_rules.js` | effect計算はsrc `resolveFloorTrapEffect` を利用し、sim側はHP/MP/metricsへ適用する状態アダプター。simの `TRAP_DAMAGE_MULTIPLIER`、方針分岐、ログ・noise event・UI/game over省略は測定モデルの範囲。 |
| `applyChestTrapEffect:4518` / `resolveChestTrapForSimulation:6534` | `src/chest.js:384-460,503-524`、`src/rules/trap_effect_rules.js` | disarm/action EVとeffectはsrc helperを利用する。simはteleporterで座標を再経路化せずmetricsだけ増やすなど、明示した測定近似であり、srcのchest UI flowの写しではない。 |
| `descendToNextFloor:7478` | `src/movement.js:186-255` | simの同期的なrun state更新。階層移動回復の計算部分だけは表2の `applyFloorTransitionHeal` として別判定した。 |
| `castExplorationSpell:2609`、`getExpectedDiosHeal:2954`、`tryAddInventoryItem:2729` | `src/systems/spell_effects.js`、`src/combat_logic/auto_action.js`、`src/state.js` | それぞれ `SPELL_EFFECTS`、auto-action、inventory helperを呼ぶ委譲。 |
| `AUTO_SPELL_IDS:2565`、`EXPLORATION_SPELL_IDS:2591`、`ENCOUNTER_GROUPS/BANDS:623-633`、`RECOVERY_LEVEL_BANDS:2779` | 対応するsrcのspell分類・monster分類 | 統計の列・表示順・集計バケット。ゲーム挙動を再実装する定数ではない。新しい分類を追加した時の集計漏れリスクはあるが、今回の対象条件（src挙動の独自再実装）からは除外した。 |
| `subtractMaterials:6921`、`getNewQuestRewards:6947` | `src/rules/material_rules.js:234-263`、`src/systems/run_quests.js` | simの差分・報酬集計用。保存残高の正典更新経路を置き換えていない。 |

## 4. 不一致が過去の測定へ与える影響

### CAMP_FLOORS

これは単なる将来リスクではなく、現行simの階層条件とsrcの配置条件が異なる。`src/run_map_generator.js` は `getBiomeForFloor(floor).theme.eventSkins.camp` がある時だけcampを置き、`src/data/biomes.js` のB2/B4定義を `getBiomeIndexForFloor` で5階ごとに適用する。simの `{2,4}` は「B2/B4」を床番号として取り違えた形に見える。

影響候補は、campを供給・回復・core発動として使う #275、#419、#534、#624、既存B2/B4 campを前提にする #499/#502、全職camp比較を含む #516、および `.agents/balance-simulation.md:668-684` のsustain結論である。今回これらを再測定していないため、CAMP関連の点推定を正典と確定しない。

### `tickExplorationSpellEffects`

探索呪文を既定で無効化している現行の深度simでは、DUMAPIC状態が生成されないため過去の深度結果への影響は特定できなかった。srcのDUMAPICをsim探索方針へ組み込む測定では、必ずこの不一致を先に解消または明示する。光・REPELだけを使う測定は、今回の比較範囲では一致している。

### `addMaterials`

現行の通常drop・quest・chest入力は既知素材の非負整数なので、probeではcanonicalな値が一致した。ただしsrcの `normalizeMaterialBalance` が保証している不変条件をsimが持たない。将来の素材追加、報酬の小数期待値、unknown key、負の差分が入る測定では、素材EV、bank率、商人購入可能性が変わり得る。対象候補として #271/#481/#595/#624 の素材・供給結果を再監査対象にするが、今回再実行はしていない。

### 回復量

`getSimulationHealAmount` のoverrideと `applyFloorTransitionHeal` の任意率は、#516の階層移動回復25%など、明示した反実仮想を測るためのsim機能である。既定srcの変更と感度分析の変更を混同しないこと。#612/#625の1x到達階平均（戦士6.14 / 盗賊5.22 / 僧侶4.83 / 魔術師6.44）は、今回srcを変更していないので再基準線を取り直していない。

## 5. 将来乖離リスク（現時点で一致しているもの）

| 対象 | リスク | 乱数消費への関係 |
| --- | --- | --- |
| 僧侶回復呪文ID、聖属性タグ、private auto-action helper | 高。変更頻度の高い戦闘選択ロジックをsimが値・関数単位で複製。 | 直接rollはないが、選択・戦闘ターン数が変わり、以後の乱数列が変わる。 |
| 状態治療item map、商人状態治療stock | 中〜高。item追加・stock cost変更が片側だけに反映される。 | 購入・使用の有無が戦闘・逃走分岐を変え、間接的に消費順が変わる。 |
| ルート方向・BFS helper | 中。現状はsrc privateの写しで、乱数を直接使わない。 | 経路とイベント遭遇位置が変われば、後続の遭遇rollの回数・順序が変わる。 |
| 火炎罠のモデル定数 | 高。B5の発動roll、warning roll、party damage rollを含む。 | 直接的。発動/非発動、warning、party人数分のdamage rollが乱数列を分岐させる。 |
| `generateRunFloor`、`getScholarMaterialBonus`、`getEncounterChance` の委譲 | 低。現状はsrcを呼ぶ。 | `getEncounterChance` のoverrideを明示しない通常経路では同じ。 |

`.agents/balance-simulation.md:57-78,175-186,492` が要求する「実src経路」「乱数消費順」「source commit」の扱いに照らすと、値が一致しているだけでは将来の安全性を保証できない。

## 6. srcへ寄せなかった理由

- 今回の目的は棚卸しであり、一致項目を機械的に統合しない指定だった。
- privateなsrc helper（`auto_action.js`、`run_map_generator.js`）は、公開API化の設計が必要で、このIssueの安全な小修正ではない。
- `tickExplorationSpellEffects`、camp配置、階層移動回復、素材正規化は現在のsimとsrcで責務・state境界が異なる。不一致を委譲へ置換すると測定結果と乱数列を変えるため、先に個別Issueで仕様を決める必要がある。
- `src/movement.js` と `src/combat_logic/` は#629の並行作業対象であり、今回は触れていない。
- したがって、寄せた件数は0。寄せ前後の#612基準線比較も実施していない。#625で確認済みの基準線は参照値としてのみ記録した。

## 7. 再現コマンド

次のコマンドで定義列挙と候補の再確認を行える。出力ダンプは成果物に含めず、行番号とこのレポートを照合する。

```sh
git fetch origin main
git rev-parse origin/main

rg -n '^(?:export )?(?:async )?function [A-Za-z_$][A-Za-z0-9_$]*\s*\(' \
  scratch/sim_depth_material_ev.js
rg -n '^(?:export )?const [A-Z][A-Z0-9_]*\s*=' \
  scratch/sim_depth_material_ev.js

rg -n '^(?:export )?(?:async )?function [A-Za-z_$][A-Za-z0-9_$]*\s*\(|^(?:export )?const [A-Z][A-Z0-9_]*\s*=' \
  src --glob '*.js' --glob '!node_modules/**' --glob '!dist/**'

rg -n 'PRIEST_HEALING|HOLY_TARGET|STATUS_CURE|MILESTONE_MERCHANT|CAMP|DUMAPIC|FLAME_TRAP|addMaterials|calculateEncounterChance|generateRunFloor|tickExploration' \
  scratch/sim_depth_material_ev.js src --glob '*.js'

npm run lint
npm run test:unit
```

判定時は、既定値だけでなく、status mapの各item、floor 2のlight減算、DUMAPIC期限切れ、既知/未知/負/小数素材、floor 5火炎罠のroll域、src生成mapのcamp配置を小入力で突き合わせる。統合を行う場合だけ、`.agents/balance-simulation.md` とPR #625の手順に従い、#612基準線（戦士6.14 / 盗賊5.22 / 僧侶4.83 / 魔術師6.44）を変更前後で再現する。

## 8. 検証と変更ファイル

- 変更ファイル: `scratch/results/issue-595-sim-reimplementation.md` のみ。
- `scratch/sim_depth_material_ev.js`、src配下は変更していない。
- 実測: 一時probeで一致・不一致の代表入力を確認。
- 最終検証: `npm run lint`、`npm run test:unit` を実行する。
- 未実施: `npm run build`、`npm run test:browser`（UI変更なし）、#612基準線の変更前後比較（src統合なし）。

封印機構の露出0確認・`GUARD_POTION` 不使用の方針アーティファクトは別途要確認 （本Issueのスコープ外）
