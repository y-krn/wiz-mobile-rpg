# Issue #271 罠の質依存測定

再現コマンド: `CI=true SIM_RUNS=50000 SIM_CALIBRATION_RUNS=100 SIM_DIAGNOSTICS=off TQ_CONDITIONS=trapBonus-5x-current TQ_SCENARIOS=workshop-core-pools node scratch/sim_issue_271_trap_quality.js`。

## 曝露率（最初）

- trapBonus 5x / max現行 / smart: 到達率=73.1% [72.7%, 73.5%]; 遭遇/発動/解除試行/探知成功=21.633/16.257/6.226/4.089 全run、26.688/19.677/8.049/5.137 到達run; floor/chest遭遇=250856/830791
- trapBonus 5x / max現行 / never: 到達率=73.3% [72.9%, 73.7%]; 遭遇/発動/解除試行/探知成功=21.677/16.330/6.198/4.107 全run、26.669/19.713/7.995/5.142 到達run; floor/chest遭遇=252352/831499

全run分母とB3到達run分母を分離。順序は罠遭遇/罠発動/解除試行/探知成功。解除試行は床・宝箱の実解除判定とTRAP_KIT使用を含む。

## クランプ飽和

- trapBonus 5x / max現行 / smart: trapBonus disarm rate cap-hit=11222/241987 (4.6%), trapSense detect cap-hit=0/250856 (0.0%)
- trapBonus 5x / max現行 / never: trapBonus disarm rate cap-hit=11007/243685 (4.5%), trapSense detect cap-hit=1/252352 (0.0%)
B5 entrant affix分布（主状態・選択条件合算）: trapBonus=0:21500 / 5:545 / 10:128 / trapSense=0:21931 / 5:162 / 10:80。
trapBonus maxは現行=非apt60/apt90、上界=非apt/apt100。trapSense capは現行0.95、上界1.00。

## sim罠方針

TRAP_POLICY=conservative / TRAP_AVOIDANCE_POLICY=ev。`calculateFloorDisarmEvThreshold` と `calculateFloorTrapAvoidanceEv` をsrc/rules/trap_rules.jsから呼ぶ実装を確認。
強度変更はscenario trapOverrideのみ。有群の実値にだけ適用し、無群は0のまま。
- trapBonus 5x / max現行 / smart: plan={"force":127637,"disarm":67923,"trigger":46427}, avoid=8869/45430, reject=36561, disarm=311284
- trapBonus 5x / max現行 / never: plan={"trigger":47016,"disarm":67501,"force":129168}, avoid=8667/45546, reject=36879, disarm=309922
方針が追随: trapBonusはdisarm/force比率、trapSenseはdetection/avoidance比率で条件別監査。

## A / B判定（主状態 workshop-core-pools）

trapBonus: A=trapBonus-5x-current / reachedFloor / trapBonus; B=未観測; 窓=A観測・B未観測（下限のみ）。
trapSense: A=未観測; B=未観測; 窓=未観測/未確定。
Aはsmart/never双方で同符号・95% CI非0のB5 endpoint。BはB5 entrant内の対策なし群生存率<20%。N<30は未確定。
クランプを上げた上界でA未観測なら、中間強度の掃引は打ち切り。未観測を効果なしと同一視しない。

## 掃引表（主状態）

- trapBonus 5x / max現行 / smart: B5 N=11013, 有/なし=328/10685, なし生存=58.3% [57.4%, 59.2%], Δfloor=+0.58 [0.35, 0.80], Δ死亡=-0.03 [-0.07, 0.02], Δ突破=+0.12 [0.07, 0.17], 全run生存=49.0% [48.6%, 49.5%], 全run平均floor=3.56 [3.54, 3.57]
- trapBonus 5x / max現行 / never: B5 N=11160, 有/なし=345/10815, なし生存=58.3% [57.4%, 59.3%], Δfloor=+0.49 [0.26, 0.72], Δ死亡=+0.01 [-0.04, 0.05], Δ突破=+0.10 [0.05, 0.15], 全run生存=49.3% [48.9%, 49.7%], 全run平均floor=3.57 [3.55, 3.59]

## 対策なし群の安定性

- trapBonus trapBonus-5x-current / smart: base→current 58.3% [57.4%, 59.2%]→58.3% [57.4%, 59.2%], Δ=+0.000 [-0.013, 0.013], stable=yes
- trapBonus trapBonus-5x-current / never: base→current 58.3% [57.4%, 59.3%]→58.3% [57.4%, 59.3%], Δ=+0.000 [-0.013, 0.013], stable=yes
CI非重複はoverrideが無群へ作用した可能性として再監査対象。無群の生存率が条件間で安定していることを判定する。

## 7シナリオ確認

- workshop-core-pools: trapBonus-5x-current/smart有/なし=328/10685, なし生存=58.3% [57.4%, 59.2%], 全run生存=49.0% [48.6%, 49.5%], 平均floor=3.56 [3.54, 3.57] / trapBonus-5x-current/never有/なし=345/10815, なし生存=58.3% [57.4%, 59.3%], 全run生存=49.3% [48.9%, 49.7%], 平均floor=3.57 [3.55, 3.59]

各シナリオは同じcondition/cure構成で測定。entrant条件付きendpointとは別に、全run生存率・平均到達floorを無条件指標として保持。

## 多重比較・群偏り・N設計

endpoint検定数=6、α=0.05期待偽陽性=0.3本。符号不一致・単発CI非交差はsignal扱いしない。
主状態 B5 entrant率=0.2203。最小実測有群率 trapBonus=0.0298 (328/11013), trapSense=0.0000 (0/0)。
N≥200逆算: trapBonus=30,488, trapSense=NA run/cell。 実測RUNS=50000/cell。
有/なしN比は各掃引行に併記。entrant選別は到達runを条件付けるため因果効果とは解釈せず、全run指標を併記。

## 実行監査

seed=271、基本4職、1 scenario、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL未指定（解決値=4）、IDENTIFICATION_POLICY=powder、FLEE_POLICY=threshold、SIM_DIAGNOSTICS=off。
trapPolicy=conservative / trapAvoidancePolicy=ev。src変更なし。
raw JSONL SHA-256: 4580c145a13f2da3ec3ad31e6e9b6cc86bc9f73ebe8db681d393adc537373428
summary JSON SHA-256: 4fba92e24fe19059a5e5fcdae8e800bb2669afe9cf97cb8d1263ad555b3b2867
calibration wall-clock 2.894s / simulation wall-clock 388.541s / total CPU 1743.441s。
