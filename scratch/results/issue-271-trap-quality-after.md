# Issue #271 罠の質依存測定

## 曝露率（最初）

- trapBonus 1x / max現行 / smart: 到達率=73.6% [73.4%, 73.8%]; 遭遇/発動/解除試行/探知成功=21.829/16.693/5.872/4.139 全run、26.801/20.140/7.568/5.172 到達run; floor/chest遭遇=762481/2511915
- trapBonus 1x / max現行 / never: 到達率=73.5% [73.2%, 73.7%]; 遭遇/発動/解除試行/探知成功=21.619/16.512/5.837/4.093 全run、26.551/19.910/7.542/5.117 到達run; floor/chest遭遇=754707/2488160

全run分母とB3到達run分母を分離。順序は罠遭遇/罠発動/解除試行/探知成功。解除試行は床・宝箱の実解除判定とTRAP_KIT使用を含む。

## クランプ飽和

- trapBonus 1x / max現行 / smart: trapBonus disarm rate cap-hit=4208/735602 (0.6%), trapSense detect cap-hit=7/762481 (0.0%)
- trapBonus 1x / max現行 / never: trapBonus disarm rate cap-hit=4241/728130 (0.6%), trapSense detect cap-hit=16/754707 (0.0%)
B5 entrant affix分布（主状態・選択条件合算）: trapBonus=0:64839 / 10:1537 / 15:396 / 20:6 / 25:4 / trapSense=0:66073 / 5:484 / 10:223 / 15:2。
trapBonus maxは現行=非apt60/apt90、上界=非apt/apt100。trapSense capは現行0.95、上界1.00。

## sim罠方針

TRAP_POLICY=conservative / TRAP_AVOIDANCE_POLICY=ev。`calculateFloorDisarmEvThreshold` と `calculateFloorTrapAvoidanceEv` をsrc/rules/trap_rules.jsから呼ぶ実装を確認。
強度変更はscenario trapOverrideのみ。有群の実値にだけ適用し、無群は0のまま。
- trapBonus 1x / max現行 / smart: plan={"force":392909,"disarm":200992,"trigger":141701}, avoid=26879/139106, reject=112227, disarm=880805
- trapBonus 1x / max現行 / never: plan={"trigger":140770,"disarm":199634,"force":387726}, avoid=26577/136649, reject=110072, disarm=875541
方針が追随: trapBonusはdisarm/force比率、trapSenseはdetection/avoidance比率で条件別監査。

## A / B判定（主状態 workshop-core-pools）

trapBonus: A=trapBonus-1x-current / reachedFloor / trapBonus; B=未観測; 窓=A観測・B未観測（下限のみ）。
trapSense: A=未観測; B=未観測; 窓=未観測/未確定。
Aはsmart/never双方で同符号・95% CI非0のB5 endpoint。BはB5 entrant内の対策なし群生存率<20%。N<30は未確定。
クランプを上げた上界でA未観測なら、中間強度の掃引は打ち切り。未観測を効果なしと同一視しない。

## 掃引表（主状態）

- trapBonus 1x / max現行 / smart: B5 N=33513, 有/なし=951/32562, なし生存=58.6% [58.1%, 59.2%], Δfloor=+0.27 [0.14, 0.40], Δ死亡=+0.01 [-0.02, 0.04], Δ突破=+0.06 [0.03, 0.09], 全run生存=49.6% [49.3%, 49.8%], 全run平均floor=3.58 [3.57, 3.59]
- trapBonus 1x / max現行 / never: B5 N=33269, 有/なし=992/32277, なし生存=58.5% [57.9%, 59.0%], Δfloor=+0.29 [0.17, 0.42], Δ死亡=-0.01 [-0.04, 0.02], Δ突破=+0.06 [0.03, 0.08], 全run生存=49.7% [49.4%, 49.9%], 全run平均floor=3.57 [3.56, 3.58]

## 宝箱副作用（主状態）

解除成功率は宝箱罠の解除試行を分母とし、罠被害HP/run・宝箱素材/runは全run平均。各値に95% CIを付与。
- trapBonus 1x / max現行 / smart / 全職: 解除成功率=86.7% [86.6%, 86.8%] (試行=679813, 成功=589351), 罠被害HP/run=39.05 [38.90, 39.20], 素材/run=46.03 [45.87, 46.19], 開封/run=22.54 [22.46, 22.61]
- trapBonus 1x / max現行 / smart / Fighter: 解除成功率=100.0% [99.9%, 100.0%] (試行=6021, 成功=6021), 罠被害HP/run=38.75 [38.58, 38.91], 素材/run=36.69 [36.55, 36.84], 開封/run=18.07 [18.00, 18.14]
- trapBonus 1x / max現行 / smart / Thief: 解除成功率=86.1% [86.0%, 86.1%] (試行=648959, 成功=558503), 罠被害HP/run=19.98 [19.86, 20.10], 素材/run=52.27 [52.01, 52.54], 開封/run=25.62 [25.49, 25.75]
- trapBonus 1x / max現行 / smart / Priest: 解除成功率=100.0% [99.9%, 100.0%] (試行=18109, 成功=18103), 罠被害HP/run=56.60 [56.13, 57.08], 素材/run=56.31 [55.81, 56.81], 開封/run=27.38 [27.14, 27.61]
- trapBonus 1x / max現行 / smart / Mage: 解除成功率=100.0% [99.9%, 100.0%] (試行=6724, 成功=6724), 罠被害HP/run=40.89 [40.73, 41.05], 素材/run=38.84 [38.69, 38.99], 開封/run=19.09 [19.02, 19.16]
- trapBonus 1x / max現行 / never / 全職: 解除成功率=86.7% [86.7%, 86.8%] (試行=675907, 成功=586338), 罠被害HP/run=38.61 [38.46, 38.76], 素材/run=45.63 [45.48, 45.79], 開封/run=22.36 [22.29, 22.44]
- trapBonus 1x / max現行 / never / Fighter: 解除成功率=100.0% [99.9%, 100.0%] (試行=6027, 成功=6027), 罠被害HP/run=38.27 [38.11, 38.43], 素材/run=36.29 [36.14, 36.44], 開封/run=17.88 [17.81, 17.95]
- trapBonus 1x / max現行 / never / Thief: 解除成功率=86.1% [86.0%, 86.2%] (試行=645064, 成功=555504), 罠被害HP/run=19.66 [19.55, 19.78], 素材/run=52.01 [51.75, 52.28], 開封/run=25.48 [25.36, 25.61]
- trapBonus 1x / max現行 / never / Priest: 解除成功率=100.0% [100.0%, 100.0%] (試行=18193, 成功=18192), 罠被害HP/run=55.94 [55.47, 56.41], 素材/run=55.65 [55.16, 56.15], 開封/run=27.14 [26.90, 27.37]
- trapBonus 1x / max現行 / never / Mage: 解除成功率=99.9% [99.8%, 99.9%] (試行=6623, 成功=6615), 罠被害HP/run=40.57 [40.41, 40.73], 素材/run=38.58 [38.43, 38.72], 開封/run=18.95 [18.88, 19.02]

## 対策なし群の安定性

- trapBonus trapBonus-1x-current / smart: base→current 58.6% [58.1%, 59.2%]→58.6% [58.1%, 59.2%], Δ=+0.000 [-0.008, 0.008], stable=yes
- trapBonus trapBonus-1x-current / never: base→current 58.5% [57.9%, 59.0%]→58.5% [57.9%, 59.0%], Δ=+0.000 [-0.008, 0.008], stable=yes
CI非重複はoverrideが無群へ作用した可能性として再監査対象。無群の生存率が条件間で安定していることを判定する。

## 7シナリオ確認

- workshop-core-pools: trapBonus-1x-current/smart有/なし=951/32562, なし生存=58.6% [58.1%, 59.2%], 全run生存=49.6% [49.3%, 49.8%], 平均floor=3.58 [3.57, 3.59] / trapBonus-1x-current/never有/なし=992/32277, なし生存=58.5% [57.9%, 59.0%], 全run生存=49.7% [49.4%, 49.9%], 平均floor=3.57 [3.56, 3.58]

各シナリオは同じcondition/cure構成で測定。entrant条件付きendpointとは別に、全run生存率・平均到達floorを無条件指標として保持。

## 多重比較・群偏り・N設計

endpoint検定数=6、α=0.05期待偽陽性=0.3本。符号不一致・単発CI非交差はsignal扱いしない。
主状態 B5 entrant率=0.2218。最小実測有群率 trapBonus=0.0284 (951/33513), trapSense=0.0000 (0/0)。
N≥200逆算: trapBonus=31,778, trapSense=NA run/cell。 実測RUNS=150000/cell。
有/なしN比は各掃引行に併記。entrant選別は到達runを条件付けるため因果効果とは解釈せず、全run指標を併記。

## 実行監査

seed=271、基本4職、1 scenario、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL未指定（解決値=4）、IDENTIFICATION_POLICY=powder、FLEE_POLICY=threshold。
trapPolicy=conservative / trapAvoidancePolicy=ev。採用値をsourceへ反映した実装後の確認。
raw JSONL SHA-256: d5d2af237079f57115f2105733a152d3f6777e879df781b0090f5530019f5ab9
summary JSON SHA-256: 0bd845dddfcea9dbdcb205d03fc4d6b7b1151fbbfc968daf2e370269af5c527f
calibration wall-clock 3.159s / simulation wall-clock 1451.463s / total CPU 6103.530s。
