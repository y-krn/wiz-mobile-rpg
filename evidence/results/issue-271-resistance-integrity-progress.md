> 生データは #738 で削除済み。結論と再現条件はこの要約に保持する。

# Issue #271 実装不整合修正 進捗

## 2026-07-30 フェーズ0: 測定準備

- 基点: `origin/main` `5d4663b`
- ブランチ: `fix/271-resistance-integrity`
- seed: 271系の既存B5診断と同じ `2715`
- 主軸: 工房解放済み（帰還の翼あり）
- 予定標本数: 各条件 N=2,000以上
- 並列度: `SIM_PARALLEL=15`
- bossモデル: `a124fbb` を流用。`generateRunFloor` 経由、実戦闘関数、`applyCombatRewards` 1回経路。
- 目標帯: 不整合修正のみのため、B5 event勝率を baseline 4.9% より有意に改善しつつ、職業格差を拡大させない。20–35%には届かない可能性を許容し、数値合わせの追加調整は行わない。

## 2026-07-30 フェーズ1-1: baseline

- N=8,000、B5 event=2,640、attempt=3,495。
- B5勝率: event 4.9%、試行3.7%。既存診断を完全再現。
- 職別event: Fighter 130/685=19.0%、Thief 0/833、Priest 0/712、Mage 0/410。
- boss到達: B5 33.0%、B10 0.3%。既存 `a124fbb` の seed 271（31.3%/0.4%）との差は、詳細診断で既存使用された seed 2715 による。
- boss死/全死 52.5%、平均到達 B4.02、生還50.8%、EV/時間0.14554。
- antiDemon: 入手0、B5装備0/2,640。
- B5装備素点×勝利 職内r=0.361、95%CI [0.327, 0.394]。
- 生出力: `evidence/results/issue-271-resistance-integrity-baseline.raw.txt`
- 生行JSONLは分析後に削除（8条件で約76MB）。再生成は測定scriptの同条件実行。

## 2026-07-30 フェーズ1-2: antiDemon pool候補

- B2+/15→25/weight1/weapon: event 5.0%、試行3.8%、B5装備29/2,642=1.1%、antiDemon×勝利 職内r=0.029 [-0.009, 0.068]。signal非有意。
- B2+/15→25/weight1/weapon+accessory: event 4.8%、試行3.6%、B5装備53/2,644=2.0%、職内r=0.065 [0.027, 0.103]。signal有意。
- B3+/30/weight1/weapon+accessory: event 4.8%、試行3.6%、B5装備48/2,636=1.8%、職内r=0.054 [0.016, 0.092]。signal有意。
- 採用候補: B2+/15→25/weight1/weapon+accessory。`antiBeast`/`antiSpirit` とminFloor・値・weightを一致させ、全4基本職が使えるweapon/accessoryへ供給。B5前の学習・入手機会をB2から確保。
- 全体event勝率は改善せず4.9%→4.8%。Acceptance未達。追加の値・weight調整は行わない。

## 2026-07-30 フェーズ1-3: guardian A/B/C

- A 常時/Fighter20: event 6.2%、試行4.5%。Fighter 22.2%、他3職0%。physical stream軽減8.8%。格差拡大で棄却。
- B HP25%以下の実装維持・説明修正: baseline同一。event 4.9%、試行3.7%。Fighter19.0%、他3職0%。実装と説明の不整合だけ解消するため採用。
- C 常時/Fighter10: event 5.6%、試行4.1%。Fighter20.8%、他3職0%。格差拡大で棄却。
- C 常時/Fighter0: event 5.1%、試行3.9%。Fighter19.7%、他3職0%。改善先がFighterのみで、クラスパッシブも消失するため棄却。
- 組み合わせ: antiDemon採用案 + guardian B。挙動はantiDemon候補と同一。

## 2026-07-30 フェーズ3: 実src再測定

- N=8,000、B5 event=2,644、attempt=3,520。
- B5勝率: event 4.8%、試行3.6%。baseline 4.9%/3.7%から各-0.1pt。
- 職別event: Fighter 126/682=18.5%、Thief 0/833、Priest 0/710、Mage 0/419。Fighterだけの伸長なし。格差は拡大していないが、他職0勝構造も未解決。
- boss到達: B5 33.1%、B10 0.3%。boss死/全死52.5%。
- antiDemon: 入手run 703/8,000、item 753、B5装備53/2,644=2.0%。
- guardian実効軽減: physical stream 1.1%（baseline約1.1%、挙動変更なし）。
- 平均到達B4.02、生還50.9%、EV/時間0.14558、前半core遭遇69.9%。baseline B4.02/50.8%/0.14554/69.9%から悪化なし。
- B5装備素点×勝利 職内r=0.352 [0.318, 0.385]。antiDemon装備×勝利 職内r=0.065 [0.027, 0.103]で有意。
- what-if同一候補との差は0。フェーズ1も一時的な実src差分で測定し、scratch overrideを使わなかったため乱数消費順が同一。
- Acceptance: event勝率改善は未達。職業格差非拡大、species-counter signal有意、他KPI非悪化は達成。20–35%目安には未達。数値合わせの追加調整なし。
- 生出力: `evidence/results/issue-271-resistance-integrity-src-after.raw.txt`
- 生行JSONLは分析後に削除。全文stdoutは統合rawへ保存。

## 2026-07-30 フェーズ4: 検証

- `npm run lint`: exit 0。
- `npm run test:unit`: 56本pass、skip 0、exit 0。
- `SIM_PARALLEL=1 node scratch/simulations/sim_depth_material_ev.js`: exit 0。
- `SIM_PARALLEL=15 node scratch/simulations/sim_depth_material_ev.js`: exit 0。
- 上記逐次/15並列stdout: `cmp` 完全一致。
- `node scratch/simulations/sim_workshop_progression.js`: exit 0。
- `node scratch/tests/regression/test_sim_reward_paths.js`: 23 sim fileすべて単一reward/level path、exit 0。
- `node scratch/simulations/sim_issue_271_resistance_integrity.js`: baseline・全what-if・実src各exit 0。
- `node scratch/analyze_issue_271_resistance_integrity.js`: exit 0。
