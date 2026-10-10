# 坑口の街ホームの視覚確認

Issue: #2096。BASE: `adb662a8aa314bb2f24a9f9ffa49fd20bea65715`。

## 画面と表示契約

- `before-390.png`: BASE の新規ゲーム、390×844。
- `after-320.png` / `after-375.png` / `after-390.png` / `after-450.png`: 同じ新規ゲーム状態。順に 320×568、375×667、390×844、450×844。
- `after-death-details-390.png`: 初回実装の保存済み履歴フィクスチャ。旧HEAD `8f8bfabe` の画像であり、「保全・回収分」という原因説明はレビュー後に削除した。
- `after-death-settlement-390.png` / `after-death-castle-390.png`: レビュー後のホーム／城。開始キット、持ち込み品1個、未鑑定装備1個、獣の牙10個、既存の街残高2個を設定し、施設未購入で実際の `triggerRunResult('gameover')` を通した証跡。精算で3個が加算され、街残高は5個となる。テスト用の冒険状態であり、実プレイの戦果を示す画像ではない。

背景・四つの入口を別レイヤーにし、情報パネル・施設一覧は同じページ内で伸縮する。出発ボタンは下部sticky。既存の通算記録は前回の冒険パネルへ移し、目標案内とログは画面下部に残す。迷宮rendererの障害表示はホームでも隠さない。素材の表示は既存 `MATERIAL_TYPES` の全所有種類で、未知の通貨・素材名は表示しない。

`ui-town-home.cases.js` は死亡・断念・歩いて生還・翼で生還・内訳未記録、既存の近い偉業ロジック（進捗0・同率・進捗あり・全達成）、素材全種類、施設解放0件／6件、4画面幅、safe-area、44pxタップ領域、単一スクロール、再描画時の位置維持、キーボードと各入口を検証する。冒険履歴なし・施設の救出と利用・モーダルのスクロール固定／復元は既存の同領域テストでも検証する。

ルール、経済、偉業の定義・報酬、セーブ形式は変更しない。保存済み履歴に失った素材の内訳や街へ加算された素材の由来はないため、記録された喪失件数と「街に残った素材」だけを表示する。施設保全や回収に由来すると断定せず、死亡による持ち帰りとも扱わない。ホームと城は同じ喪失表示ヘルパーを使用する。

死亡・断念でも通常素材30%が加算される現行経済と、最新の core-loop canon の通常素材喪失契約との不一致は未解決。このPRのUI修正で解決済みとはしない。再レビューで合意したとおり、経済仕様の決定は別Issueで扱い、#2096の判断と分離する。推奨は標準全損と施設による例外のみの残存であり、このPRでは現行の経済ルールを変更しない。

## 背景アセット

`public/images/town-mine.jpg`。built-in `image_gen` で生成したPNGをJPEG品質85で変換。生成画像に文字・数字・操作UIは含めない。参照元はIssueの構図指定であり、2026-10-10のデザイン案そのものはこのセッションに添付されていない。

生成時のプロンプト:

> Create one production background asset for a Japanese mobile dungeon RPG town home. Portrait 2:3 composition. Detailed low resolution pixel art, crisp square pixels and restrained storybook palette matching a first-person pixel dungeon crawler, not realistic oil painting. Scene: the safe mining town at the mouth of a collapsed mine at dusk. Foreground warm amber lantern-lit timber houses, one lone adventurer seen from behind in a simple travel cloak near lower center facing the distant cold blue mine tunnel. Visible mine timber supports, wooden headframe and winding winch, ore minecart and rails leading into the blue tunnel, rocky mountain around entrance. Absolutely no cathedral, no grand castle gate. Upper center is the recognisable mine entrance with cool pale blue light; sides warm town buildings and lamps. Design the upper half as a clear scenic focal area and lower half quieter stone path suitable for UI overlays. Soft bright enough readable pixels, warm ochre #c69654, cream #f7edcf, brown ink #302b24 and desaturated cold blue #547488. No text, no numbers, no labels, no icons, no buttons, no UI, no borders or frames. Full bleed image. Save generated asset for integration in project.

## 検証の範囲と制限

通常unitは351件通過・失敗0件・skip3件。lint・build通過。全ブラウザ635件は591件通過・44件失敗となり、本変更に起因するホーム／迷宮viewport分離、HUDの小数行高、renderer障害表示を修正した。

修正後の関連175件は169件通過・6件失敗。残る6件は旧HUDの通算B12F要求3件と宝箱visual3件で、固定BASEでも同じ失敗を確認した。旧HUDは既存ソースが「大裂溝 B2F」と表示するのにB12Fを要求する。戦闘visualのボタン7個要求も固定BASEで実際8個となり失敗する。全体visualの完全通過は確認していない。対象外の準備・結果の基準画像は更新しない。

## 独立レビュー後のLinux視覚確認

旧HEAD `8f8bfabe` の [Linux debug run 38033884422](https://github.com/y-krn/wiz-mobile-rpg/actions/runs/38033884422) は92件通過、28件失敗、1件flaky。`evidence-38033884422-browser-smoke-1-1` の実画像を直接確認した。

- ホーム基準差分1件：新ホームの構図、操作UI、前回の冒険・偉業、sticky出発ボタンを確認し、`golden-town-390-linux.png` だけ更新した。初回と再試行2回の実画像はすべて SHA-256 `3535be5f7bf00232db9e330f63dcfbd3d8af15f00ce3f0a861e2aaf0770e4109` で一致。画像の新規ゲーム状態には履歴がなく、レビュー後の履歴文言変更は描画に影響しない。ホームの基準比較を独立テストに分離し、準備・結果の基準差分と別に判定する。
- Canvasを前提にする出血／脆弱6件、biome6件、Pixi chest1件：固定BASEでも同じ失敗。Canvasの2D contextがnull、またはworld-object数が期待を満たさない。
- Combat Focus5件：固定BASEでも同じ失敗。既存の操作ボタン数8個に対して7個を要求する。
- 鳴らし玉2件とflaky1件：固定BASEでも360／390pxが高さ0で失敗し、430pxは通過。初期化・UI表示の準備完了待ちがない既存の不安定な測定。
- result/event高さ1件：固定BASEでも失敗。イベントの高さ測定に街の操作群を使用し、残り高さを負数としていた。新ホームの高さがさらに差を広げるため、ホームと無関係な測定は探索操作群へ変更。result/eventの高さ条件・4画面幅は維持し、修正後は通過した。
- 旧HUD3件、宝箱visual3件：前述の固定BASE再現と同じ失敗。

BASE再現はmacOS Chromiumであり、Linux BASEの再実行ではない。旧Linux runの失敗原因と同じ断言・エラーを確認した範囲の分類である。Linux全visualの完全通過は確認していない。新HEADの再レビューが済むまでDraftを維持する。

レビュー後のローカル検証は通常unit351件通過・失敗0件・skip3件、関連browser44件通過、ホーム基準／共通viewport3件通過。lint・build・diff checkも通過した。実精算の4状態（死亡・断念・歩いて生還・翼で生還）は履歴の手動差し替えを行わず、結果から街へ戻り、保存を再読込して城へ入る経路を確認した。全browserは初回の一巡結果と対象別の修正・再現確認を保持し、再実行して完全通過としたものではない。

`6c0f5a6d` のPR CIでは城の既存死因表現が変わった1件で失敗した。死因が記録されている場合の「火炎の罠に倒れた」を復元し、喪失・素材の精算表示だけを変更する。既存の城の年代記テストでも死亡に「持ち帰った」が出ないことを固定した。

死因表現の復元後は城の既存2件を含む関連browser46件、城の保存・再開unit、lint・buildが通過した。通常unit351件とホーム基準／viewport3件の結果は、その後の変更が既知死因の一文だけであることと併記する。

## 素材0個と記録欠落の区別

`3adb38cf` の再レビューで、精算結果が全件0個でも「内訳未記録」と表示するP2が指摘された。ホームと城の共通ヘルパーは、素材の記録があり正の数量がない場合を「街に残った素材なし」、記録自体が欠落する旧履歴を「街に残った素材の内訳は未記録」と表示する。

死亡・断念とも、素材3個から実精算で0個になる状態を使用し、結果から街へ戻る、保存の再読込、城の履歴確認を回帰テストに追加した。記録欠落も死亡・断念の両方で確認する。精算ルール・セーブ形式は変更していない。

[Linux診断 38037530508](https://github.com/y-krn/wiz-mobile-rpg/actions/runs/38037530508) は旧HEAD `6c0f5a6d` で完了し、95 PASS / 26 FAIL / 1 flaky。町専用Linux基準比較はPASS。以後の既知死因の文言復元と記録済み0個の表示修正は、冒険履歴のない町専用比較フィクスチャの描画を変更しない。全Linux visualの通過やLinux BASEの完全照合を示す結果ではない。城サブ画面との意匠統一と素材アイコンは非Blockingの後続検討事項。

0個表示修正の最終ローカル確認は関連browserと町専用golden比較40件、城の保存・再開unit、lint、build、diff checkが通過。全suiteの再実行ではなく、変更に対応する対象検証である。


## 最終再レビューで判明した表示の修正

`fb9847af` の固定BASEとの差分全体をCodex CLIの独立レビューで確認し、P2を2件検出した。レビューはNodeによる再現を完了したが、レビュー環境のChromium起動は権限エラーで実行できなかった。

- `lostUnidentifiedCount` は発見した装備の数であり、宝箱で「置いていく」を選んだ装備も含む。ホームと城の喪失件数には使用しない。既存の履歴値・精算ルール・セーブ形式は維持する。上記の死亡ホーム／城画像には旧装備件数表示が含まれ、最新の文言証跡ではない。
- 生還も記録済みの素材0個を「持ち帰った素材なし」と表示し、記録欠落と区別する。持ち込み品の持ち帰り0個／1個を両方検証する。

実際の宝箱の未取得選択→死亡／断念精算→保存・再読込→ホーム→城の2件と、生還の実精算0個の2件を追加した。所有セッションのChromium検証は関連browserと町専用golden比較46 PASS（15.2秒）。lint・build・diff checkも通過した。経済ルールと保存形式は変更していない。
