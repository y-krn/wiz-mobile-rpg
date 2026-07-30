# Issue #271 resistance integrity 比較

実grid `generateRunFloor`、実戦闘関数、工房解放済み、seed=2715。

## baseline

- run=8000, B5 event=2640, attempt=3495
- B5勝率: event 4.9% / 試行 3.7%
- 職別event: Fighter 130/685=19.0% / Thief 0/833=0.0% / Priest 0/712=0.0% / Mage 0/410=0.0%
- 到達: B5 33.0% / B10 0.3% / 平均 B4.02
- 生還 50.8% / boss死÷全死 52.5%
- antiDemon入手: run 0/8000、item 0、全装備比 0.0%
- antiDemon装備: B5 event 0/2640=0.0%
- guardian実効軽減: physical stream 1.1%
- EV/時間: bank EV 47.080 / time 323.47 / 0.14554
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.361 [0.327, 0.394] N=2640
- antiDemon装備×勝利 職内r [95%CI]: n/a
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: -0.000 [-0.038, 0.038] N=2640

## antiDemon B2+/15→25/w1/weapon

- run=8000, B5 event=2642, attempt=3510
- B5勝率: event 5.0% / 試行 3.8%
- 職別event: Fighter 133/680=19.6% / Thief 0/837=0.0% / Priest 0/709=0.0% / Mage 0/416=0.0%
- 到達: B5 33.0% / B10 0.3% / 平均 B4.02
- 生還 50.8% / boss死÷全死 52.5%
- antiDemon入手: run 402/8000、item 425、全装備比 0.3%
- antiDemon装備: B5 event 29/2642=1.1%
- guardian実効軽減: physical stream 1.0%
- EV/時間: bank EV 47.184 / time 323.95 / 0.14565
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.363 [0.330, 0.396] N=2642
- antiDemon装備×勝利 職内r [95%CI]: 0.029 [-0.009, 0.068] N=2642
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: 0.000 [-0.038, 0.038] N=2642

## antiDemon B2+/15→25/w1/weapon+accessory

- run=8000, B5 event=2644, attempt=3520
- B5勝率: event 4.8% / 試行 3.6%
- 職別event: Fighter 126/682=18.5% / Thief 0/833=0.0% / Priest 0/710=0.0% / Mage 0/419=0.0%
- 到達: B5 33.1% / B10 0.3% / 平均 B4.02
- 生還 50.9% / boss死÷全死 52.5%
- antiDemon入手: run 703/8000、item 753、全装備比 0.6%
- antiDemon装備: B5 event 53/2644=2.0%
- guardian実効軽減: physical stream 1.1%
- EV/時間: bank EV 47.154 / time 323.90 / 0.14558
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.352 [0.318, 0.385] N=2644
- antiDemon装備×勝利 職内r [95%CI]: 0.065 [0.027, 0.103] N=2644
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: -0.000 [-0.038, 0.038] N=2644

## antiDemon B3+/30/w1/weapon+accessory

- run=8000, B5 event=2636, attempt=3506
- B5勝率: event 4.8% / 試行 3.6%
- 職別event: Fighter 127/688=18.5% / Thief 0/829=0.0% / Priest 0/705=0.0% / Mage 0/414=0.0%
- 到達: B5 33.0% / B10 0.2% / 平均 B4.02
- 生還 51.1% / boss死÷全死 52.3%
- antiDemon入手: run 514/8000、item 547、全装備比 0.4%
- antiDemon装備: B5 event 48/2636=1.8%
- guardian実効軽減: physical stream 1.0%
- EV/時間: bank EV 47.250 / time 323.55 / 0.14604
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.355 [0.321, 0.388] N=2636
- antiDemon装備×勝利 職内r [95%CI]: 0.054 [0.016, 0.092] N=2636
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: 0.000 [-0.038, 0.038] N=2636

## guardian A: 常時/Fighter20

- run=8000, B5 event=2699, attempt=3666
- B5勝率: event 6.2% / 試行 4.5%
- 職別event: Fighter 166/747=22.2% / Thief 0/833=0.0% / Priest 0/710=0.0% / Mage 0/409=0.0%
- 到達: B5 33.7% / B10 0.5% / 平均 B4.06
- 生還 52.2% / boss死÷全死 52.4%
- antiDemon入手: run 0/8000、item 0、全装備比 0.0%
- antiDemon装備: B5 event 0/2699=0.0%
- guardian実効軽減: physical stream 8.8%
- EV/時間: bank EV 49.153 / time 329.81 / 0.14903
- 前半core遭遇: 70.3%
- B5装備素点×勝利 職内r [95%CI]: 0.377 [0.344, 0.409] N=2699
- antiDemon装備×勝利 職内r [95%CI]: n/a
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: 0.000 [-0.038, 0.038] N=2699

## guardian C: 常時/Fighter10

- run=8000, B5 event=2665, attempt=3586
- B5勝率: event 5.6% / 試行 4.1%
- 職別event: Fighter 148/712=20.8% / Thief 0/833=0.0% / Priest 0/710=0.0% / Mage 0/410=0.0%
- 到達: B5 33.3% / B10 0.4% / 平均 B4.04
- 生還 51.6% / boss死÷全死 52.2%
- antiDemon入手: run 0/8000、item 0、全装備比 0.0%
- antiDemon装備: B5 event 0/2665=0.0%
- guardian実効軽減: physical stream 3.6%
- EV/時間: bank EV 48.135 / time 326.20 / 0.14756
- 前半core遭遇: 70.1%
- B5装備素点×勝利 職内r [95%CI]: 0.368 [0.335, 0.400] N=2665
- antiDemon装備×勝利 職内r [95%CI]: n/a
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: 0.000 [-0.038, 0.038] N=2665

## guardian C: 常時/Fighter0

- run=8000, B5 event=2635, attempt=3475
- B5勝率: event 5.1% / 試行 3.9%
- 職別event: Fighter 135/685=19.7% / Thief 0/832=0.0% / Priest 0/709=0.0% / Mage 0/409=0.0%
- 到達: B5 32.9% / B10 0.3% / 平均 B4.02
- 生還 50.6% / boss死÷全死 52.6%
- antiDemon入手: run 0/8000、item 0、全装備比 0.0%
- antiDemon装備: B5 event 0/2635=0.0%
- guardian実効軽減: physical stream 1.0%
- EV/時間: bank EV 47.004 / time 323.82 / 0.14516
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.364 [0.330, 0.397] N=2635
- antiDemon装備×勝利 職内r [95%CI]: n/a
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: 0.027 [-0.011, 0.065] N=2635

## 実src after

- run=8000, B5 event=2644, attempt=3520
- B5勝率: event 4.8% / 試行 3.6%
- 職別event: Fighter 126/682=18.5% / Thief 0/833=0.0% / Priest 0/710=0.0% / Mage 0/419=0.0%
- 到達: B5 33.1% / B10 0.3% / 平均 B4.02
- 生還 50.9% / boss死÷全死 52.5%
- antiDemon入手: run 703/8000、item 753、全装備比 0.6%
- antiDemon装備: B5 event 53/2644=2.0%
- guardian実効軽減: physical stream 1.1%
- EV/時間: bank EV 47.154 / time 323.90 / 0.14558
- 前半core遭遇: 69.9%
- B5装備素点×勝利 職内r [95%CI]: 0.352 [0.318, 0.385] N=2644
- antiDemon装備×勝利 職内r [95%CI]: 0.065 [0.027, 0.103] N=2644
- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: -0.000 [-0.038, 0.038] N=2644
