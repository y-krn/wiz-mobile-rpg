# 坑口の街ホームの視覚確認

Issue: #2096。BASE: `adb662a8aa314bb2f24a9f9ffa49fd20bea65715`。

## 画面と表示契約

- `before-390.png`: BASE の新規ゲーム、390×844。
- `after-320.png` / `after-375.png` / `after-390.png` / `after-450.png`: 同じ新規ゲーム状態。順に 320×568、375×667、390×844、450×844。
- `after-death-details-390.png`: 死亡表示の回帰用フィクスチャ。地下3階、保存済みの保全・回収素材が獣の牙3個、失った持ち込み品2個・装備1個、街の素材残高が獣の牙7個・骨片4個・鉄片12個。実プレイの戦果を示す画像ではない。

背景・四つの入口を別レイヤーにし、情報パネル・施設一覧は同じページ内で伸縮する。出発ボタンは下部sticky。既存の通算記録は前回の冒険パネルへ移し、目標案内とログは画面下部に残す。迷宮rendererの障害表示はホームでも隠さない。素材の表示は既存 `MATERIAL_TYPES` の全所有種類で、未知の通貨・素材名は表示しない。

`ui-town-home.cases.js` は死亡・断念・歩いて生還・翼で生還・内訳未記録、既存の近い偉業ロジック（進捗0・同率・進捗あり・全達成）、素材全種類、施設解放0件／6件、4画面幅、safe-area、44pxタップ領域、単一スクロール、再描画時の位置維持、キーボードと各入口を検証する。冒険履歴なし・施設の救出と利用・モーダルのスクロール固定／復元は既存の同領域テストでも検証する。

ルール、経済、偉業の定義・報酬、セーブ形式は変更しない。保存済み履歴に失った素材の内訳はないため、記録された喪失件数と保全・回収分だけを表示する。保全・回収分と偉業の進捗を死亡による持ち帰りとして扱わない。

## 背景アセット

`public/images/town-mine.jpg`。built-in `image_gen` で生成したPNGをJPEG品質85で変換。生成画像に文字・数字・操作UIは含めない。参照元はIssueの構図指定であり、2026-10-10のデザイン案そのものはこのセッションに添付されていない。

生成時のプロンプト:

> Create one production background asset for a Japanese mobile dungeon RPG town home. Portrait 2:3 composition. Detailed low resolution pixel art, crisp square pixels and restrained storybook palette matching a first-person pixel dungeon crawler, not realistic oil painting. Scene: the safe mining town at the mouth of a collapsed mine at dusk. Foreground warm amber lantern-lit timber houses, one lone adventurer seen from behind in a simple travel cloak near lower center facing the distant cold blue mine tunnel. Visible mine timber supports, wooden headframe and winding winch, ore minecart and rails leading into the blue tunnel, rocky mountain around entrance. Absolutely no cathedral, no grand castle gate. Upper center is the recognisable mine entrance with cool pale blue light; sides warm town buildings and lamps. Design the upper half as a clear scenic focal area and lower half quieter stone path suitable for UI overlays. Soft bright enough readable pixels, warm ochre #c69654, cream #f7edcf, brown ink #302b24 and desaturated cold blue #547488. No text, no numbers, no labels, no icons, no buttons, no UI, no borders or frames. Full bleed image. Save generated asset for integration in project.

## 検証の範囲と制限

通常unitは351件通過・失敗0件・skip3件。lint・build通過。全ブラウザ635件は591件通過・44件失敗となり、本変更に起因するホーム／迷宮viewport分離、HUDの小数行高、renderer障害表示を修正した。

修正後の関連175件は169件通過・6件失敗。残る6件は旧HUDの通算B12F要求3件と宝箱visual3件で、固定BASEでも同じ失敗を確認した。旧HUDは既存ソースが「大裂溝 B2F」と表示するのにB12Fを要求する。戦闘visualのボタン7個要求も固定BASEで実際8個となり失敗する。全体visualの完全通過は確認していない。対象外の準備・結果の基準画像は更新しない。
