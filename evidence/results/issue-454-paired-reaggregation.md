# Issue #454 paired 再集計

再現コマンド: `CI=true SIM_RUNS=2200 SIM_CALIBRATION_RUNS=100 SIM_DIAGNOSTICS=off SIM_ISSUE446_CONDITION=<base|unlimited|slots-affix-capped|affix-volume> node scratch/simulations/sim_issue_446_slot_vs_affix.js` を各条件で実行後、`node scratch/measure_issue_454_paired.js`。

PR #447 と同じ4条件の raw run（現行 runner で再取得）を、対応 run の CI と独立2標本 CI の両方で再集計した。必要N95は、観測した効果を95% CIで0から分離する近似値。N<30は結論に使わない。

## 判定規則

生成構成を変えず、生成後変換で乱数列を保存する条件だけを paired 候補とする。対応キーと randomSequenceId が完全一致しない場合は、コードが独立2標本へフォールバックする。軌跡が分岐する条件は、同一生成runから得た outcome 差として paired 化するが、介入後の軌跡が同一だとは解釈しない。

raw SHA: base=eb2deebc870e8f955e82c23b5510f5a18fa14812385e39a792e5232b68ec2cae
- unlimited=5354e89bc0c2bf6a1ef713c76b4b6fe2f7b3aeea233d4e23c3909fb6a485a56d
- slots-affix-capped=e5cac12983ae0ff12e28d925519582914c9add92927de2bd06f40234a53731a5
- affix-volume=8116c6f40e3476bf2cac129a53fafe9298f45ef050a177c0257f896a710c08ec

### unlimited slots

- classifier: method=paired, stage=post-generation, randomConsumption=preserved, trajectory=diverges
- row audit: base=15400, condition=15400, common=15400, randomSequenceId一致=yes

| endpoint（condition−base、全run） | 採用法 | 現在N | CI | 独立N95 | paired N95 | N低下 |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| B5突破（全run） | paired | 15400 | 0.034 [0.029, 0.039] | 512 | 300 | 41.4% |
| B5死亡（全run） | paired | 15400 | -0.018 [-0.023, -0.014] | 1130 | 869 | 23.1% |
| 到達floor（全run） | paired | 15400 | 0.246 [0.217, 0.276] | 564 | 220 | 61.0% |

### (1) slots↑ / affix総量据え置き

- classifier: method=paired, stage=post-generation, randomConsumption=preserved, trajectory=diverges
- row audit: base=15400, condition=15400, common=15400, randomSequenceId一致=yes

| endpoint（condition−base、全run） | 採用法 | 現在N | CI | 独立N95 | paired N95 | N低下 |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| B5突破（全run） | paired | 15400 | 0.071 [0.066, 0.076] | 139 | 77 | 44.6% |
| B5死亡（全run） | paired | 15400 | -0.016 [-0.020, -0.012] | 1516 | 969 | 36.1% |
| 到達floor（全run） | paired | 15400 | 0.733 [0.702, 0.765] | 73 | 29 | 60.3% |

### (2) slots据え置き / affix総量↑

- classifier: method=independent, stage=generation, randomConsumption=changed, trajectory=diverges
- row audit: base=15400, condition=15400, common=15400, randomSequenceId一致=yes

| endpoint（condition−base、全run） | 採用法 | 現在N | CI | 独立N95 | paired N95 | N低下 |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| B5突破（全run） | independent | 15400 | 0.014 [0.008, 0.020] | 2737 | 2737 | 0.0% |
| B5死亡（全run） | independent | 15400 | -0.004 [-0.009, 0.001] | 28431 | 28431 | 0.0% |
| 到達floor（全run） | independent | 15400 | 0.151 [0.107, 0.196] | 1344 | 1344 | 0.0% |

## 結論

生成後変換の unlimited slots / affixless duplicate は paired CI を採用し、生成構成変更の affix-volume は独立2標本へ戻る。必要Nの低下は上表の実測値を採用根拠とし、paired は対応 run の集合・乱数列が完全一致する場合だけ使う。
