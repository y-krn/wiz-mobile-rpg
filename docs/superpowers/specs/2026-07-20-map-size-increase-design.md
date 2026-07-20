# マップ拡大と宝箱調整 設計

## 目的

ダンジョンマップを一回り大きくし、探索の広がりを増やす。あわせて宝箱の
配置数をランダム化し、宝箱のミニマップ予兆表示を廃止する。

## 現状

- サイズは `src/data/floor_templates.js` の階層テンプレで決まる。
  - `shallow` (1-10F): 18x18
  - `middle` (11-20F): 21x21
  - `deep` (21F+): `MAP_WIDTH` / `MAP_HEIGHT` (= 24x24) を参照
- `src/constants/map.js`: `MAP_WIDTH = 24`, `MAP_HEIGHT = 24`,
  `START_X = 1`, `START_Y = 22`
- 宝箱は `src/map_generator.js` で階層非依存の固定値 6 個。泉 2、石板 2 が
  同じ行き止まりリストのオフセットで続く。
- 宝箱はミニマップ上で 4 歩以内に入ると黄色のオーラで予兆表示される
  (`src/renderer.js` のオーラ描画ループ)。

## 変更内容

### 1. マップサイズを各テンプレ +6

- `src/constants/map.js`
  - `MAP_WIDTH` 24 → 30
  - `MAP_HEIGHT` 24 → 30
  - `START_Y` 22 → 28
    (実際の開始位置は grid 内 `stairs-up` の探索結果が優先され、この定数は
    フォールバック値。新サイズの下端 -2 に合わせる)
- `src/data/floor_templates.js`
  - `shallow.size` 18x18 → 24x24
  - `middle.size` 21x21 → 27x27
  - `deep.size` は `MAP_WIDTH` / `MAP_HEIGHT` 参照のため自動で 30x30

面積比: 1.78 倍 / 1.65 倍 / 1.56 倍。

### 2. 宝箱数を 8〜12 のランダムに

- `src/map_generator.js` の宝箱配置で、固定値 6 を廃止する。
- 生成関数内の `rng` で 8 以上 12 以下の整数を抽選し
  `targetChestCount` とする。
- 行き止まりへの配置数は `Math.min(targetChestCount, deadEnds.length)`。
- 行き止まり不足時のフォールバック計算 (`6 - chestCount`) は
  `targetChestCount - chestCount` に置き換える。
- 泉・石板は据え置き (各 2)。行き止まりリスト上のオフセットは実配置済み
  宝箱数を基準とする既存挙動を維持する。
- 隠し部屋は別経路で 75% の確率で宝箱、25% で石板を置く
  (`placeSecretRooms`)。この分は変更せず、フロア全体の宝箱総数は
  8〜12 にテンプレの `secretDoors.room`（1/1/2）分が上乗せされ得る。

### 3. 罠のみ控えめに増量

- `src/data/floor_templates.js` の `gimmickDensity.traps`
  - shallow 5 → 7
  - middle 7 → 9
  - deep 9 → 11
- 部屋数 (`roomCountRange`)、隠し扉 (`secretDoors`)、一方通行
  (`oneWayPassages`)、`criticalPathRange` は据え置き。

### 4. 宝箱のミニマップ予兆を削除

- `src/renderer.js` のミニマップオーラ描画で
  - `hasEvent` 判定から `EVENT_TYPES.CHEST` を除く
  - 宝箱用の黄色グロー分岐を削除する
- 階段の橙、ボス／中ボスの赤、泉・石板・商人等の紫は維持する。

## 影響と互換性

- セーブ互換: マップの grid は保存データ側に格納されるため、進行中の旧
  サイズのランはそのままのサイズで継続する。新サイズは以後生成される階に
  のみ適用される。`src/state/save_migrations.js` は `MAP_WIDTH` /
  `MAP_HEIGHT` を参照するため、旧サイズ grid の読み込みで境界外参照や
  座標クランプの不具合が出ないことを確認する。
- ミニマップ描画は 128px 固定枠 + 中心追従スクロールでクランプ済みのため、
  30x30 でも既存ロジックで表示できる。
- 行き止まり不足時のフォールバックは、マップが広がる分だけ発生しにくく
  なる方向に働く。

## 検証

- `npm run lint`
- `npm run test:unit` (マップ生成・セーブ移行の該当テスト)
- `npm run build`
- `npm run test:browser`
- 宝箱数が複数シードで 8〜12 の範囲に収まることを確認する。
- ミニマップに宝箱のオーラが出ないこと、泉・石板のオーラは残ることを確認
  する。
- 360x800 / 390x844 / 430x932 でミニマップ表示と移動を確認する。
