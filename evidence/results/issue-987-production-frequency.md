# Issue #987 Production-frequency weighted pure raw / Build Sensitivity

- runner: `issue987-production-frequency-v1`
- source commit: `a1623a3feea6b369756dc8338746c4aec6d07ab5`
- production baseline SHA: `1043e5147c2f43f3c7869a29e80dac522fac28e0`
- generated encounters: **N=5000 per depth**; controlled stress: **N=500 per fixture × depth**
- depths: B8, B13, B18, B21, B25, B30; builds: aoe-burst, single-efficient, sustain, hybrid-fallback

## Scope and validity

The weighted arm samples the real production generateEncounter path at each requested depth and reuses each generated encounter, identity, trait, role, and composition for all four Mage builds and all paired counterfactuals. This is a generated-distribution estimate, not a full-run encounter-frequency estimate: traversal, event selection, bosses/midbosses/roaming encounters, survival, retreat, and progression can reweight actual play.

Deaths use #983's exclusive categories. Mechanism firing alone is not promoted to mediated causality; the imported classifier requires corresponding state-degradation evidence. Every death and every legacy raw death has exactly one final category.

## Production encounter distribution

| Depth | Generated N | Mean enemy count | Size distribution |
| --- | ---: | ---: | --- |
| B8 | 5000 | 1.7630 | 1:29.02%, 2:65.66%, 3:5.32% |
| B13 | 5000 | 1.7006 | 1:34.54%, 2:60.86%, 3:4.60% |
| B18 | 5000 | 1.6992 | 1:34.80%, 2:60.48%, 3:4.72% |
| B21 | 5000 | 1.2764 | 1:72.36%, 2:27.64% |
| B25 | 5000 | 1.7866 | 1:25.94%, 2:69.46%, 3:4.60% |
| B30 | 5000 | 1.7934 | 1:25.40%, 2:69.86%, 3:4.74% |

## A. Production-frequency weighted

Overall: **46213 / 120000 = 38.51% pure raw**, clear 47.63%, death 52.36%. Normal hit mean/p50/p90/p95: **6.6561 / 6.0000 / 11.0000 / 12.0000**; lethal hit/maxHP mean: **0.5103**.

### Build

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 30000 | 18.07% | 56.89% | 5.5899 | 2.1589 | 1.6320 | 0.5610 | 0.7045 |
| hybrid-fallback | 30000 | 54.92% | 34.64% | 6.2551 | 1.9108 | 1.6137 | 0.3408 | 0.8068 |
| single-efficient | 30000 | 43.77% | 46.52% | 6.6706 | 1.8132 | 1.5321 | 0.4558 | 0.7854 |
| sustain | 30000 | 37.28% | 52.50% | 7.5457 | 2.6245 | 1.5855 | 0.4921 | 0.7408 |

### Depth

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 13 | 20000 | 16.16% | 79.73% | 4.1844 | 2.3559 | 1.5111 | 0.7866 | 0.7816 |
| 18 | 20000 | 27.92% | 49.53% | 5.5738 | 2.3225 | 1.5904 | 0.4686 | 0.7464 |
| 21 | 20000 | 51.42% | 35.55% | 7.7120 | 2.3996 | 1.3046 | 0.3240 | 0.6809 |
| 25 | 20000 | 65.66% | 17.60% | 8.3359 | 2.0268 | 1.8032 | 0.1666 | 0.7285 |
| 30 | 20000 | 69.50% | 10.29% | 10.6581 | 1.8228 | 1.7899 | 0.1011 | 0.7522 |
| 8 | 20000 | 0.40% | 93.10% | 2.6002 | 1.8336 | 1.5457 | 0.9279 | 0.8667 |

### Enemy count

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 44412 | 26.89% | 64.55% | 7.0326 | 2.0208 | 1.0164 | 0.6205 | 0.7451 |
| 2 | 70792 | 45.22% | 38.00% | 6.6045 | 2.1974 | 1.8738 | 0.3725 | 0.7641 |
| 3 | 4796 | 47.12% | 33.19% | 5.7777 | 2.0680 | 2.7331 | 0.3261 | 0.8228 |

### Encounter family

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| magic_denial | 3936 | 10.44% | 74.77% | 4.2120 | 2.8867 | 1.5614 | 0.7257 | 0.7907 |
| magic_denial+protected_formation | 648 | 62.19% | 21.45% | 6.7524 | 2.2392 | 2.0200 | 0.2019 | 0.7781 |
| magic_denial+summon_split | 304 | 44.74% | 32.89% | 6.1847 | 2.8684 | 1.9487 | 0.3139 | 0.7353 |
| mp_drain | 1364 | 0.07% | 99.93% | 2.7825 | 1.7955 | 1.4698 | 0.9988 | 0.8755 |
| mp_drain+protected_formation | 312 | 0.00% | 100.00% | 2.3501 | 2.2051 | 1.7489 | 0.9997 | 0.8796 |
| multi_action | 4400 | 76.36% | 16.23% | 9.0550 | 2.5980 | 1.6093 | 0.1305 | 0.6432 |
| multi_enemy_ordinary | 20816 | 22.65% | 68.16% | 4.5957 | 2.5048 | 1.7831 | 0.6702 | 0.7691 |
| protected_formation | 11488 | 56.40% | 27.68% | 7.5497 | 2.0889 | 1.9307 | 0.2696 | 0.7663 |
| protected_formation+multi_action | 1988 | 80.84% | 6.59% | 9.4060 | 2.0428 | 2.2043 | 0.0657 | 0.7213 |
| protected_formation+status_pressure | 844 | 58.29% | 2.84% | 9.7443 | 1.9396 | 2.0211 | 0.0279 | 0.7381 |
| protected_formation+summon_split | 824 | 81.92% | 0.00% | 10.0630 | 1.8750 | 2.0581 | 0.0000 | 0.7434 |
| protected_formation+summon_split+status_pressure | 16 | 68.75% | 0.00% | 10.0278 | 1.5000 | 3.0000 | 0.0000 | 0.7833 |
| recovery_denial | 1400 | 73.64% | 14.00% | 10.3300 | 2.4193 | 1.5588 | 0.1254 | 0.6705 |
| recovery_denial+protected_formation | 1000 | 82.50% | 4.20% | 10.5515 | 2.0180 | 2.0284 | 0.0412 | 0.7334 |
| recovery_denial+protected_formation+status_pressure | 20 | 80.00% | 0.00% | 10.4286 | 1.2500 | 3.0000 | 0.0000 | 0.8633 |
| recovery_denial+protected_formation+summon_split | 32 | 87.50% | 0.00% | 10.3067 | 1.4688 | 2.9844 | 0.0000 | 0.8500 |
| recovery_denial+regen | 356 | 83.43% | 3.65% | 11.1765 | 1.6798 | 2.0471 | 0.0337 | 0.7733 |
| recovery_denial+regen+protected_formation | 32 | 81.25% | 3.13% | 10.8451 | 1.2813 | 3.0000 | 0.0313 | 0.8340 |
| recovery_denial+regen+status_pressure | 12 | 75.00% | 8.33% | 10.7600 | 1.6667 | 2.9583 | 0.0833 | 0.8306 |
| recovery_denial+regen+summon_split | 12 | 83.33% | 0.00% | 10.5926 | 1.2500 | 3.0000 | 0.0000 | 0.8444 |
| recovery_denial+status_pressure | 328 | 60.98% | 8.23% | 9.7390 | 1.9695 | 2.0541 | 0.0818 | 0.7347 |
| recovery_denial+summon_split | 352 | 83.24% | 0.00% | 10.1088 | 1.6733 | 2.0425 | 0.0000 | 0.7777 |
| recovery_denial+summon_split+status_pressure | 12 | 83.33% | 0.00% | 9.7241 | 1.1667 | 3.0000 | 0.0000 | 0.8778 |
| reflection_counter | 21360 | 32.65% | 48.85% | 5.8510 | 2.1726 | 1.5386 | 0.4613 | 0.7509 |
| reflection_counter+magic_denial | 564 | 32.27% | 14.54% | 5.7088 | 2.1720 | 2.0227 | 0.1342 | 0.7488 |
| reflection_counter+magic_denial+protected_formation | 72 | 41.67% | 5.56% | 6.1478 | 1.5139 | 2.9907 | 0.0556 | 0.8395 |
| reflection_counter+magic_denial+summon_split | 20 | 85.00% | 15.00% | 6.2031 | 1.5500 | 2.9333 | 0.1500 | 0.8511 |
| reflection_counter+mp_drain | 600 | 0.00% | 84.67% | 1.8867 | 2.1883 | 1.7785 | 0.8430 | 0.8333 |
| reflection_counter+mp_drain+protected_formation | 32 | 0.00% | 65.63% | 2.0345 | 2.3125 | 2.4245 | 0.6538 | 0.8201 |
| reflection_counter+multi_action | 976 | 80.02% | 10.14% | 7.8456 | 2.0061 | 2.2058 | 0.1002 | 0.7334 |
| reflection_counter+protected_formation | 6424 | 68.10% | 16.53% | 7.6558 | 1.9466 | 2.0390 | 0.1615 | 0.7581 |
| reflection_counter+protected_formation+multi_action | 96 | 80.21% | 6.25% | 8.2669 | 1.6563 | 3.0807 | 0.0625 | 0.7929 |
| reflection_counter+protected_formation+status_pressure | 28 | 64.29% | 3.57% | 10.7966 | 1.6429 | 2.9786 | 0.0357 | 0.7679 |
| reflection_counter+protected_formation+summon_split | 28 | 85.71% | 3.57% | 10.9841 | 1.2500 | 2.9786 | 0.0198 | 0.8722 |
| reflection_counter+recovery_denial | 364 | 84.89% | 4.67% | 11.7206 | 1.6484 | 2.0755 | 0.0467 | 0.7837 |
| reflection_counter+recovery_denial+protected_formation | 20 | 85.00% | 5.00% | 10.6667 | 1.3500 | 3.0000 | 0.0500 | 0.8211 |
| reflection_counter+recovery_denial+regen | 8 | 75.00% | 0.00% | 12.1111 | 1.5000 | 3.0000 | 0.0000 | 0.7667 |
| reflection_counter+recovery_denial+summon_split | 20 | 80.00% | 0.00% | 11.0444 | 1.1000 | 3.0000 | 0.0000 | 0.8700 |
| reflection_counter+regen | 376 | 84.84% | 2.93% | 12.0883 | 1.4734 | 2.0598 | 0.0274 | 0.8123 |
| reflection_counter+regen+protected_formation | 24 | 91.67% | 0.00% | 11.8182 | 1.2083 | 3.0000 | 0.0000 | 0.8889 |
| reflection_counter+regen+status_pressure | 4 | 75.00% | 0.00% | 11.7500 | 1.2500 | 3.0000 | 0.0000 | 0.9667 |
| reflection_counter+regen+summon_split | 12 | 83.33% | 0.00% | 11.3704 | 1.0000 | 3.0000 | 0.0000 | 0.8889 |
| reflection_counter+status_pressure | 468 | 67.52% | 3.42% | 11.0507 | 1.6859 | 2.0662 | 0.0341 | 0.7756 |
| reflection_counter+summon_split | 940 | 56.28% | 11.38% | 7.9203 | 1.7500 | 2.0867 | 0.1072 | 0.7769 |
| reflection_counter+summon_split+status_pressure | 20 | 70.00% | 0.00% | 10.5455 | 1.2500 | 3.0000 | 0.0000 | 0.7833 |
| regen | 1532 | 85.84% | 0.46% | 11.3546 | 1.8166 | 1.6843 | 0.0043 | 0.7493 |
| regen+protected_formation | 916 | 82.86% | 2.29% | 11.3586 | 1.7009 | 2.0428 | 0.0218 | 0.7721 |
| regen+protected_formation+status_pressure | 40 | 72.50% | 0.00% | 10.1236 | 1.3000 | 3.0000 | 0.0000 | 0.8483 |
| regen+protected_formation+summon_split | 16 | 81.25% | 0.00% | 10.6389 | 1.2500 | 3.0000 | 0.0000 | 0.8375 |
| regen+status_pressure | 376 | 68.09% | 3.46% | 10.5840 | 1.6835 | 2.0738 | 0.0324 | 0.7814 |
| regen+summon_split | 376 | 83.78% | 0.27% | 10.7892 | 1.4761 | 2.0440 | 0.0027 | 0.8087 |
| regen+summon_split+status_pressure | 20 | 80.00% | 0.00% | 10.2889 | 1.2500 | 3.0000 | 0.0000 | 0.8233 |
| single_aggressor | 22824 | 23.59% | 65.40% | 7.1943 | 1.8420 | 1.0000 | 0.6402 | 0.7566 |
| single_disruptor | 6096 | 2.92% | 93.18% | 4.2135 | 1.6191 | 1.0000 | 0.9156 | 0.8365 |
| status_pressure | 1468 | 48.16% | 4.84% | 8.9797 | 2.2323 | 1.6009 | 0.0417 | 0.6918 |
| summon_split | 2960 | 64.76% | 23.51% | 7.6398 | 2.3669 | 1.7264 | 0.2220 | 0.7288 |
| summon_split+status_pressure | 424 | 58.96% | 0.00% | 9.4014 | 1.8090 | 2.0570 | 0.0000 | 0.7599 |

### Weighted paired counterfactuals

All counterfactual deltas are **candidate − baseline**; positive means improvement.

| Condition | Baseline pure raw | Candidate pure raw | Clear-rate delta (candidate − baseline) | HP delta (candidate − baseline) | MP delta (candidate − baseline) |
| --- | ---: | ---: | ---: | ---: | ---: |
| W1_normal_damage_075 | 38.51% | 32.69% | +5.69pp | +5.39pp | -2.58pp |
| W2_enemy_hp_075 | 38.51% | 33.75% | +6.48pp | +6.29pp | +2.71pp |
| W3_enemy_action_exposure_1 | 38.51% | 33.96% | +7.02pp | +6.70pp | -6.04pp |

### Weighted Build Sensitivity

- strict significant reversal count: **88**
- strict reversal rule: paired outcome + utility bootstrap 95% CIs, both signs reversed; minimum paired N **30**
- insufficient-sample family comparisons excluded: **6210**
- family paired N: **342** build-pair×family entries recorded in JSON
- equal-cell best-build coverage (not encounter-frequency weighted): **aoe-burst**, share **63.70%** across **87** depth×family cells
- production-frequency-weighted best-build share (diagnostic utility): **sustain**, share **28.98%** across **30000** encounter samples

| Build pair | Paired clear difference (left − right) | Paired HP difference (left − right) | Paired MP difference (left − right) |
| --- | ---: | ---: | ---: |
| aoe-burst vs single-efficient | 0.1037 | 0.1051 | -0.0809 |
| aoe-burst vs sustain | 0.0439 | 0.0688 | -0.0363 |
| aoe-burst vs hybrid-fallback | 0.2225 | 0.2201 | -0.1024 |
| single-efficient vs sustain | -0.0598 | -0.0363 | 0.0446 |
| single-efficient vs hybrid-fallback | 0.1188 | 0.1150 | -0.0214 |
| sustain vs hybrid-fallback | 0.1786 | 0.1513 | -0.0660 |

### Family paired sample sizes

Every family/build-pair paired N is recorded here. N<30 is emitted as `insufficient_sample` and cannot enter strict reversal.

| Build pair | Family | Paired N |
| --- | --- | ---: |
| aoe-burst vs hybrid-fallback | magic_denial | 984 |
| aoe-burst vs single-efficient | magic_denial | 984 |
| aoe-burst vs sustain | magic_denial | 984 |
| single-efficient vs hybrid-fallback | magic_denial | 984 |
| single-efficient vs sustain | magic_denial | 984 |
| sustain vs hybrid-fallback | magic_denial | 984 |
| aoe-burst vs hybrid-fallback | magic_denial+protected_formation | 162 |
| aoe-burst vs single-efficient | magic_denial+protected_formation | 162 |
| aoe-burst vs sustain | magic_denial+protected_formation | 162 |
| single-efficient vs hybrid-fallback | magic_denial+protected_formation | 162 |
| single-efficient vs sustain | magic_denial+protected_formation | 162 |
| sustain vs hybrid-fallback | magic_denial+protected_formation | 162 |
| aoe-burst vs hybrid-fallback | magic_denial+summon_split | 76 |
| aoe-burst vs single-efficient | magic_denial+summon_split | 76 |
| aoe-burst vs sustain | magic_denial+summon_split | 76 |
| single-efficient vs hybrid-fallback | magic_denial+summon_split | 76 |
| single-efficient vs sustain | magic_denial+summon_split | 76 |
| sustain vs hybrid-fallback | magic_denial+summon_split | 76 |
| aoe-burst vs hybrid-fallback | mp_drain | 341 |
| aoe-burst vs single-efficient | mp_drain | 341 |
| aoe-burst vs sustain | mp_drain | 341 |
| single-efficient vs hybrid-fallback | mp_drain | 341 |
| single-efficient vs sustain | mp_drain | 341 |
| sustain vs hybrid-fallback | mp_drain | 341 |
| aoe-burst vs hybrid-fallback | mp_drain+protected_formation | 78 |
| aoe-burst vs single-efficient | mp_drain+protected_formation | 78 |
| aoe-burst vs sustain | mp_drain+protected_formation | 78 |
| single-efficient vs hybrid-fallback | mp_drain+protected_formation | 78 |
| single-efficient vs sustain | mp_drain+protected_formation | 78 |
| sustain vs hybrid-fallback | mp_drain+protected_formation | 78 |
| aoe-burst vs hybrid-fallback | multi_action | 1100 |
| aoe-burst vs single-efficient | multi_action | 1100 |
| aoe-burst vs sustain | multi_action | 1100 |
| single-efficient vs hybrid-fallback | multi_action | 1100 |
| single-efficient vs sustain | multi_action | 1100 |
| sustain vs hybrid-fallback | multi_action | 1100 |
| aoe-burst vs hybrid-fallback | multi_enemy_ordinary | 5204 |
| aoe-burst vs single-efficient | multi_enemy_ordinary | 5204 |
| aoe-burst vs sustain | multi_enemy_ordinary | 5204 |
| single-efficient vs hybrid-fallback | multi_enemy_ordinary | 5204 |
| single-efficient vs sustain | multi_enemy_ordinary | 5204 |
| sustain vs hybrid-fallback | multi_enemy_ordinary | 5204 |
| aoe-burst vs hybrid-fallback | protected_formation | 2872 |
| aoe-burst vs single-efficient | protected_formation | 2872 |
| aoe-burst vs sustain | protected_formation | 2872 |
| single-efficient vs hybrid-fallback | protected_formation | 2872 |
| single-efficient vs sustain | protected_formation | 2872 |
| sustain vs hybrid-fallback | protected_formation | 2872 |
| aoe-burst vs hybrid-fallback | protected_formation+multi_action | 497 |
| aoe-burst vs single-efficient | protected_formation+multi_action | 497 |
| aoe-burst vs sustain | protected_formation+multi_action | 497 |
| single-efficient vs hybrid-fallback | protected_formation+multi_action | 497 |
| single-efficient vs sustain | protected_formation+multi_action | 497 |
| sustain vs hybrid-fallback | protected_formation+multi_action | 497 |
| aoe-burst vs hybrid-fallback | protected_formation+status_pressure | 211 |
| aoe-burst vs single-efficient | protected_formation+status_pressure | 211 |
| aoe-burst vs sustain | protected_formation+status_pressure | 211 |
| single-efficient vs hybrid-fallback | protected_formation+status_pressure | 211 |
| single-efficient vs sustain | protected_formation+status_pressure | 211 |
| sustain vs hybrid-fallback | protected_formation+status_pressure | 211 |
| aoe-burst vs hybrid-fallback | protected_formation+summon_split | 206 |
| aoe-burst vs single-efficient | protected_formation+summon_split | 206 |
| aoe-burst vs sustain | protected_formation+summon_split | 206 |
| single-efficient vs hybrid-fallback | protected_formation+summon_split | 206 |
| single-efficient vs sustain | protected_formation+summon_split | 206 |
| sustain vs hybrid-fallback | protected_formation+summon_split | 206 |
| aoe-burst vs hybrid-fallback | protected_formation+summon_split+status_pressure | 4 |
| aoe-burst vs single-efficient | protected_formation+summon_split+status_pressure | 4 |
| aoe-burst vs sustain | protected_formation+summon_split+status_pressure | 4 |
| single-efficient vs hybrid-fallback | protected_formation+summon_split+status_pressure | 4 |
| single-efficient vs sustain | protected_formation+summon_split+status_pressure | 4 |
| sustain vs hybrid-fallback | protected_formation+summon_split+status_pressure | 4 |
| aoe-burst vs hybrid-fallback | recovery_denial | 350 |
| aoe-burst vs single-efficient | recovery_denial | 350 |
| aoe-burst vs sustain | recovery_denial | 350 |
| single-efficient vs hybrid-fallback | recovery_denial | 350 |
| single-efficient vs sustain | recovery_denial | 350 |
| sustain vs hybrid-fallback | recovery_denial | 350 |
| aoe-burst vs hybrid-fallback | recovery_denial+protected_formation | 250 |
| aoe-burst vs single-efficient | recovery_denial+protected_formation | 250 |
| aoe-burst vs sustain | recovery_denial+protected_formation | 250 |
| single-efficient vs hybrid-fallback | recovery_denial+protected_formation | 250 |
| single-efficient vs sustain | recovery_denial+protected_formation | 250 |
| sustain vs hybrid-fallback | recovery_denial+protected_formation | 250 |
| aoe-burst vs hybrid-fallback | recovery_denial+protected_formation+status_pressure | 5 |
| aoe-burst vs single-efficient | recovery_denial+protected_formation+status_pressure | 5 |
| aoe-burst vs sustain | recovery_denial+protected_formation+status_pressure | 5 |
| single-efficient vs hybrid-fallback | recovery_denial+protected_formation+status_pressure | 5 |
| single-efficient vs sustain | recovery_denial+protected_formation+status_pressure | 5 |
| sustain vs hybrid-fallback | recovery_denial+protected_formation+status_pressure | 5 |
| aoe-burst vs hybrid-fallback | recovery_denial+protected_formation+summon_split | 8 |
| aoe-burst vs single-efficient | recovery_denial+protected_formation+summon_split | 8 |
| aoe-burst vs sustain | recovery_denial+protected_formation+summon_split | 8 |
| single-efficient vs hybrid-fallback | recovery_denial+protected_formation+summon_split | 8 |
| single-efficient vs sustain | recovery_denial+protected_formation+summon_split | 8 |
| sustain vs hybrid-fallback | recovery_denial+protected_formation+summon_split | 8 |
| aoe-burst vs hybrid-fallback | recovery_denial+regen | 89 |
| aoe-burst vs single-efficient | recovery_denial+regen | 89 |
| aoe-burst vs sustain | recovery_denial+regen | 89 |
| single-efficient vs hybrid-fallback | recovery_denial+regen | 89 |
| single-efficient vs sustain | recovery_denial+regen | 89 |
| sustain vs hybrid-fallback | recovery_denial+regen | 89 |
| aoe-burst vs hybrid-fallback | recovery_denial+regen+protected_formation | 8 |
| aoe-burst vs single-efficient | recovery_denial+regen+protected_formation | 8 |
| aoe-burst vs sustain | recovery_denial+regen+protected_formation | 8 |
| single-efficient vs hybrid-fallback | recovery_denial+regen+protected_formation | 8 |
| single-efficient vs sustain | recovery_denial+regen+protected_formation | 8 |
| sustain vs hybrid-fallback | recovery_denial+regen+protected_formation | 8 |
| aoe-burst vs hybrid-fallback | recovery_denial+regen+status_pressure | 3 |
| aoe-burst vs single-efficient | recovery_denial+regen+status_pressure | 3 |
| aoe-burst vs sustain | recovery_denial+regen+status_pressure | 3 |
| single-efficient vs hybrid-fallback | recovery_denial+regen+status_pressure | 3 |
| single-efficient vs sustain | recovery_denial+regen+status_pressure | 3 |
| sustain vs hybrid-fallback | recovery_denial+regen+status_pressure | 3 |
| aoe-burst vs hybrid-fallback | recovery_denial+regen+summon_split | 3 |
| aoe-burst vs single-efficient | recovery_denial+regen+summon_split | 3 |
| aoe-burst vs sustain | recovery_denial+regen+summon_split | 3 |
| single-efficient vs hybrid-fallback | recovery_denial+regen+summon_split | 3 |
| single-efficient vs sustain | recovery_denial+regen+summon_split | 3 |
| sustain vs hybrid-fallback | recovery_denial+regen+summon_split | 3 |
| aoe-burst vs hybrid-fallback | recovery_denial+status_pressure | 82 |
| aoe-burst vs single-efficient | recovery_denial+status_pressure | 82 |
| aoe-burst vs sustain | recovery_denial+status_pressure | 82 |
| single-efficient vs hybrid-fallback | recovery_denial+status_pressure | 82 |
| single-efficient vs sustain | recovery_denial+status_pressure | 82 |
| sustain vs hybrid-fallback | recovery_denial+status_pressure | 82 |
| aoe-burst vs hybrid-fallback | recovery_denial+summon_split | 88 |
| aoe-burst vs single-efficient | recovery_denial+summon_split | 88 |
| aoe-burst vs sustain | recovery_denial+summon_split | 88 |
| single-efficient vs hybrid-fallback | recovery_denial+summon_split | 88 |
| single-efficient vs sustain | recovery_denial+summon_split | 88 |
| sustain vs hybrid-fallback | recovery_denial+summon_split | 88 |
| aoe-burst vs hybrid-fallback | recovery_denial+summon_split+status_pressure | 3 |
| aoe-burst vs single-efficient | recovery_denial+summon_split+status_pressure | 3 |
| aoe-burst vs sustain | recovery_denial+summon_split+status_pressure | 3 |
| single-efficient vs hybrid-fallback | recovery_denial+summon_split+status_pressure | 3 |
| single-efficient vs sustain | recovery_denial+summon_split+status_pressure | 3 |
| sustain vs hybrid-fallback | recovery_denial+summon_split+status_pressure | 3 |
| aoe-burst vs hybrid-fallback | reflection_counter | 5340 |
| aoe-burst vs single-efficient | reflection_counter | 5340 |
| aoe-burst vs sustain | reflection_counter | 5340 |
| single-efficient vs hybrid-fallback | reflection_counter | 5340 |
| single-efficient vs sustain | reflection_counter | 5340 |
| sustain vs hybrid-fallback | reflection_counter | 5340 |
| aoe-burst vs hybrid-fallback | reflection_counter+magic_denial | 141 |
| aoe-burst vs single-efficient | reflection_counter+magic_denial | 141 |
| aoe-burst vs sustain | reflection_counter+magic_denial | 141 |
| single-efficient vs hybrid-fallback | reflection_counter+magic_denial | 141 |
| single-efficient vs sustain | reflection_counter+magic_denial | 141 |
| sustain vs hybrid-fallback | reflection_counter+magic_denial | 141 |
| aoe-burst vs hybrid-fallback | reflection_counter+magic_denial+protected_formation | 18 |
| aoe-burst vs single-efficient | reflection_counter+magic_denial+protected_formation | 18 |
| aoe-burst vs sustain | reflection_counter+magic_denial+protected_formation | 18 |
| single-efficient vs hybrid-fallback | reflection_counter+magic_denial+protected_formation | 18 |
| single-efficient vs sustain | reflection_counter+magic_denial+protected_formation | 18 |
| sustain vs hybrid-fallback | reflection_counter+magic_denial+protected_formation | 18 |
| aoe-burst vs hybrid-fallback | reflection_counter+magic_denial+summon_split | 5 |
| aoe-burst vs single-efficient | reflection_counter+magic_denial+summon_split | 5 |
| aoe-burst vs sustain | reflection_counter+magic_denial+summon_split | 5 |
| single-efficient vs hybrid-fallback | reflection_counter+magic_denial+summon_split | 5 |
| single-efficient vs sustain | reflection_counter+magic_denial+summon_split | 5 |
| sustain vs hybrid-fallback | reflection_counter+magic_denial+summon_split | 5 |
| aoe-burst vs hybrid-fallback | reflection_counter+mp_drain | 150 |
| aoe-burst vs single-efficient | reflection_counter+mp_drain | 150 |
| aoe-burst vs sustain | reflection_counter+mp_drain | 150 |
| single-efficient vs hybrid-fallback | reflection_counter+mp_drain | 150 |
| single-efficient vs sustain | reflection_counter+mp_drain | 150 |
| sustain vs hybrid-fallback | reflection_counter+mp_drain | 150 |
| aoe-burst vs hybrid-fallback | reflection_counter+mp_drain+protected_formation | 8 |
| aoe-burst vs single-efficient | reflection_counter+mp_drain+protected_formation | 8 |
| aoe-burst vs sustain | reflection_counter+mp_drain+protected_formation | 8 |
| single-efficient vs hybrid-fallback | reflection_counter+mp_drain+protected_formation | 8 |
| single-efficient vs sustain | reflection_counter+mp_drain+protected_formation | 8 |
| sustain vs hybrid-fallback | reflection_counter+mp_drain+protected_formation | 8 |
| aoe-burst vs hybrid-fallback | reflection_counter+multi_action | 244 |
| aoe-burst vs single-efficient | reflection_counter+multi_action | 244 |
| aoe-burst vs sustain | reflection_counter+multi_action | 244 |
| single-efficient vs hybrid-fallback | reflection_counter+multi_action | 244 |
| single-efficient vs sustain | reflection_counter+multi_action | 244 |
| sustain vs hybrid-fallback | reflection_counter+multi_action | 244 |
| aoe-burst vs hybrid-fallback | reflection_counter+protected_formation | 1606 |
| aoe-burst vs single-efficient | reflection_counter+protected_formation | 1606 |
| aoe-burst vs sustain | reflection_counter+protected_formation | 1606 |
| single-efficient vs hybrid-fallback | reflection_counter+protected_formation | 1606 |
| single-efficient vs sustain | reflection_counter+protected_formation | 1606 |
| sustain vs hybrid-fallback | reflection_counter+protected_formation | 1606 |
| aoe-burst vs hybrid-fallback | reflection_counter+protected_formation+multi_action | 24 |
| aoe-burst vs single-efficient | reflection_counter+protected_formation+multi_action | 24 |
| aoe-burst vs sustain | reflection_counter+protected_formation+multi_action | 24 |
| single-efficient vs hybrid-fallback | reflection_counter+protected_formation+multi_action | 24 |
| single-efficient vs sustain | reflection_counter+protected_formation+multi_action | 24 |
| sustain vs hybrid-fallback | reflection_counter+protected_formation+multi_action | 24 |
| aoe-burst vs hybrid-fallback | reflection_counter+protected_formation+status_pressure | 7 |
| aoe-burst vs single-efficient | reflection_counter+protected_formation+status_pressure | 7 |
| aoe-burst vs sustain | reflection_counter+protected_formation+status_pressure | 7 |
| single-efficient vs hybrid-fallback | reflection_counter+protected_formation+status_pressure | 7 |
| single-efficient vs sustain | reflection_counter+protected_formation+status_pressure | 7 |
| sustain vs hybrid-fallback | reflection_counter+protected_formation+status_pressure | 7 |
| aoe-burst vs hybrid-fallback | reflection_counter+protected_formation+summon_split | 7 |
| aoe-burst vs single-efficient | reflection_counter+protected_formation+summon_split | 7 |
| aoe-burst vs sustain | reflection_counter+protected_formation+summon_split | 7 |
| single-efficient vs hybrid-fallback | reflection_counter+protected_formation+summon_split | 7 |
| single-efficient vs sustain | reflection_counter+protected_formation+summon_split | 7 |
| sustain vs hybrid-fallback | reflection_counter+protected_formation+summon_split | 7 |
| aoe-burst vs hybrid-fallback | reflection_counter+recovery_denial | 91 |
| aoe-burst vs single-efficient | reflection_counter+recovery_denial | 91 |
| aoe-burst vs sustain | reflection_counter+recovery_denial | 91 |
| single-efficient vs hybrid-fallback | reflection_counter+recovery_denial | 91 |
| single-efficient vs sustain | reflection_counter+recovery_denial | 91 |
| sustain vs hybrid-fallback | reflection_counter+recovery_denial | 91 |
| aoe-burst vs hybrid-fallback | reflection_counter+recovery_denial+protected_formation | 5 |
| aoe-burst vs single-efficient | reflection_counter+recovery_denial+protected_formation | 5 |
| aoe-burst vs sustain | reflection_counter+recovery_denial+protected_formation | 5 |
| single-efficient vs hybrid-fallback | reflection_counter+recovery_denial+protected_formation | 5 |
| single-efficient vs sustain | reflection_counter+recovery_denial+protected_formation | 5 |
| sustain vs hybrid-fallback | reflection_counter+recovery_denial+protected_formation | 5 |
| aoe-burst vs hybrid-fallback | reflection_counter+recovery_denial+regen | 2 |
| aoe-burst vs single-efficient | reflection_counter+recovery_denial+regen | 2 |
| aoe-burst vs sustain | reflection_counter+recovery_denial+regen | 2 |
| single-efficient vs hybrid-fallback | reflection_counter+recovery_denial+regen | 2 |
| single-efficient vs sustain | reflection_counter+recovery_denial+regen | 2 |
| sustain vs hybrid-fallback | reflection_counter+recovery_denial+regen | 2 |
| aoe-burst vs hybrid-fallback | reflection_counter+recovery_denial+summon_split | 5 |
| aoe-burst vs single-efficient | reflection_counter+recovery_denial+summon_split | 5 |
| aoe-burst vs sustain | reflection_counter+recovery_denial+summon_split | 5 |
| single-efficient vs hybrid-fallback | reflection_counter+recovery_denial+summon_split | 5 |
| single-efficient vs sustain | reflection_counter+recovery_denial+summon_split | 5 |
| sustain vs hybrid-fallback | reflection_counter+recovery_denial+summon_split | 5 |
| aoe-burst vs hybrid-fallback | reflection_counter+regen | 94 |
| aoe-burst vs single-efficient | reflection_counter+regen | 94 |
| aoe-burst vs sustain | reflection_counter+regen | 94 |
| single-efficient vs hybrid-fallback | reflection_counter+regen | 94 |
| single-efficient vs sustain | reflection_counter+regen | 94 |
| sustain vs hybrid-fallback | reflection_counter+regen | 94 |
| aoe-burst vs hybrid-fallback | reflection_counter+regen+protected_formation | 6 |
| aoe-burst vs single-efficient | reflection_counter+regen+protected_formation | 6 |
| aoe-burst vs sustain | reflection_counter+regen+protected_formation | 6 |
| single-efficient vs hybrid-fallback | reflection_counter+regen+protected_formation | 6 |
| single-efficient vs sustain | reflection_counter+regen+protected_formation | 6 |
| sustain vs hybrid-fallback | reflection_counter+regen+protected_formation | 6 |
| aoe-burst vs hybrid-fallback | reflection_counter+regen+status_pressure | 1 |
| aoe-burst vs single-efficient | reflection_counter+regen+status_pressure | 1 |
| aoe-burst vs sustain | reflection_counter+regen+status_pressure | 1 |
| single-efficient vs hybrid-fallback | reflection_counter+regen+status_pressure | 1 |
| single-efficient vs sustain | reflection_counter+regen+status_pressure | 1 |
| sustain vs hybrid-fallback | reflection_counter+regen+status_pressure | 1 |
| aoe-burst vs hybrid-fallback | reflection_counter+regen+summon_split | 3 |
| aoe-burst vs single-efficient | reflection_counter+regen+summon_split | 3 |
| aoe-burst vs sustain | reflection_counter+regen+summon_split | 3 |
| single-efficient vs hybrid-fallback | reflection_counter+regen+summon_split | 3 |
| single-efficient vs sustain | reflection_counter+regen+summon_split | 3 |
| sustain vs hybrid-fallback | reflection_counter+regen+summon_split | 3 |
| aoe-burst vs hybrid-fallback | reflection_counter+status_pressure | 117 |
| aoe-burst vs single-efficient | reflection_counter+status_pressure | 117 |
| aoe-burst vs sustain | reflection_counter+status_pressure | 117 |
| single-efficient vs hybrid-fallback | reflection_counter+status_pressure | 117 |
| single-efficient vs sustain | reflection_counter+status_pressure | 117 |
| sustain vs hybrid-fallback | reflection_counter+status_pressure | 117 |
| aoe-burst vs hybrid-fallback | reflection_counter+summon_split | 235 |
| aoe-burst vs single-efficient | reflection_counter+summon_split | 235 |
| aoe-burst vs sustain | reflection_counter+summon_split | 235 |
| single-efficient vs hybrid-fallback | reflection_counter+summon_split | 235 |
| single-efficient vs sustain | reflection_counter+summon_split | 235 |
| sustain vs hybrid-fallback | reflection_counter+summon_split | 235 |
| aoe-burst vs hybrid-fallback | reflection_counter+summon_split+status_pressure | 5 |
| aoe-burst vs single-efficient | reflection_counter+summon_split+status_pressure | 5 |
| aoe-burst vs sustain | reflection_counter+summon_split+status_pressure | 5 |
| single-efficient vs hybrid-fallback | reflection_counter+summon_split+status_pressure | 5 |
| single-efficient vs sustain | reflection_counter+summon_split+status_pressure | 5 |
| sustain vs hybrid-fallback | reflection_counter+summon_split+status_pressure | 5 |
| aoe-burst vs hybrid-fallback | regen | 383 |
| aoe-burst vs single-efficient | regen | 383 |
| aoe-burst vs sustain | regen | 383 |
| single-efficient vs hybrid-fallback | regen | 383 |
| single-efficient vs sustain | regen | 383 |
| sustain vs hybrid-fallback | regen | 383 |
| aoe-burst vs hybrid-fallback | regen+protected_formation | 229 |
| aoe-burst vs single-efficient | regen+protected_formation | 229 |
| aoe-burst vs sustain | regen+protected_formation | 229 |
| single-efficient vs hybrid-fallback | regen+protected_formation | 229 |
| single-efficient vs sustain | regen+protected_formation | 229 |
| sustain vs hybrid-fallback | regen+protected_formation | 229 |
| aoe-burst vs hybrid-fallback | regen+protected_formation+status_pressure | 10 |
| aoe-burst vs single-efficient | regen+protected_formation+status_pressure | 10 |
| aoe-burst vs sustain | regen+protected_formation+status_pressure | 10 |
| single-efficient vs hybrid-fallback | regen+protected_formation+status_pressure | 10 |
| single-efficient vs sustain | regen+protected_formation+status_pressure | 10 |
| sustain vs hybrid-fallback | regen+protected_formation+status_pressure | 10 |
| aoe-burst vs hybrid-fallback | regen+protected_formation+summon_split | 4 |
| aoe-burst vs single-efficient | regen+protected_formation+summon_split | 4 |
| aoe-burst vs sustain | regen+protected_formation+summon_split | 4 |
| single-efficient vs hybrid-fallback | regen+protected_formation+summon_split | 4 |
| single-efficient vs sustain | regen+protected_formation+summon_split | 4 |
| sustain vs hybrid-fallback | regen+protected_formation+summon_split | 4 |
| aoe-burst vs hybrid-fallback | regen+status_pressure | 94 |
| aoe-burst vs single-efficient | regen+status_pressure | 94 |
| aoe-burst vs sustain | regen+status_pressure | 94 |
| single-efficient vs hybrid-fallback | regen+status_pressure | 94 |
| single-efficient vs sustain | regen+status_pressure | 94 |
| sustain vs hybrid-fallback | regen+status_pressure | 94 |
| aoe-burst vs hybrid-fallback | regen+summon_split | 94 |
| aoe-burst vs single-efficient | regen+summon_split | 94 |
| aoe-burst vs sustain | regen+summon_split | 94 |
| single-efficient vs hybrid-fallback | regen+summon_split | 94 |
| single-efficient vs sustain | regen+summon_split | 94 |
| sustain vs hybrid-fallback | regen+summon_split | 94 |
| aoe-burst vs hybrid-fallback | regen+summon_split+status_pressure | 5 |
| aoe-burst vs single-efficient | regen+summon_split+status_pressure | 5 |
| aoe-burst vs sustain | regen+summon_split+status_pressure | 5 |
| single-efficient vs hybrid-fallback | regen+summon_split+status_pressure | 5 |
| single-efficient vs sustain | regen+summon_split+status_pressure | 5 |
| sustain vs hybrid-fallback | regen+summon_split+status_pressure | 5 |
| aoe-burst vs hybrid-fallback | single_aggressor | 5706 |
| aoe-burst vs single-efficient | single_aggressor | 5706 |
| aoe-burst vs sustain | single_aggressor | 5706 |
| single-efficient vs hybrid-fallback | single_aggressor | 5706 |
| single-efficient vs sustain | single_aggressor | 5706 |
| sustain vs hybrid-fallback | single_aggressor | 5706 |
| aoe-burst vs hybrid-fallback | single_disruptor | 1524 |
| aoe-burst vs single-efficient | single_disruptor | 1524 |
| aoe-burst vs sustain | single_disruptor | 1524 |
| single-efficient vs hybrid-fallback | single_disruptor | 1524 |
| single-efficient vs sustain | single_disruptor | 1524 |
| sustain vs hybrid-fallback | single_disruptor | 1524 |
| aoe-burst vs hybrid-fallback | status_pressure | 367 |
| aoe-burst vs single-efficient | status_pressure | 367 |
| aoe-burst vs sustain | status_pressure | 367 |
| single-efficient vs hybrid-fallback | status_pressure | 367 |
| single-efficient vs sustain | status_pressure | 367 |
| sustain vs hybrid-fallback | status_pressure | 367 |
| aoe-burst vs hybrid-fallback | summon_split | 740 |
| aoe-burst vs single-efficient | summon_split | 740 |
| aoe-burst vs sustain | summon_split | 740 |
| single-efficient vs hybrid-fallback | summon_split | 740 |
| single-efficient vs sustain | summon_split | 740 |
| sustain vs hybrid-fallback | summon_split | 740 |
| aoe-burst vs hybrid-fallback | summon_split+status_pressure | 106 |
| aoe-burst vs single-efficient | summon_split+status_pressure | 106 |
| aoe-burst vs sustain | summon_split+status_pressure | 106 |
| single-efficient vs hybrid-fallback | summon_split+status_pressure | 106 |
| single-efficient vs sustain | summon_split+status_pressure | 106 |
| sustain vs hybrid-fallback | summon_split+status_pressure | 106 |

## B. Controlled stress fixtures

Equal-weight stress overall: **31320 / 72000 = 43.50% pure raw**, clear 23.03%. This arm is not a production estimate; it retains the six hand-picked #980/#984 probes as stress tests.

### Controlled build

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 18000 | 21.39% | 42.22% | 5.0157 | 2.6467 | 2.1540 | 0.4093 | 0.6482 |
| hybrid-fallback | 18000 | 66.99% | 4.49% | 6.1033 | 2.1597 | 2.2056 | 0.0408 | 0.7775 |
| single-efficient | 18000 | 50.67% | 11.12% | 6.3267 | 2.3214 | 2.0064 | 0.1033 | 0.7390 |
| sustain | 18000 | 34.95% | 34.29% | 7.3040 | 3.7664 | 1.9307 | 0.2688 | 0.6167 |

### Controlled depth

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 13 | 12000 | 35.50% | 31.54% | 5.6331 | 2.9122 | 2.0306 | 0.2802 | 0.6871 |
| 18 | 12000 | 43.86% | 21.21% | 6.2092 | 2.7973 | 2.0711 | 0.1867 | 0.6833 |
| 21 | 12000 | 49.36% | 15.84% | 6.6553 | 2.6720 | 2.0934 | 0.1419 | 0.6901 |
| 25 | 12000 | 51.78% | 12.91% | 7.0751 | 2.5849 | 2.1149 | 0.1145 | 0.6963 |
| 30 | 12000 | 57.52% | 8.53% | 7.8508 | 2.4120 | 2.1588 | 0.0769 | 0.7108 |
| 8 | 12000 | 22.98% | 48.17% | 4.9547 | 2.9629 | 1.9763 | 0.4330 | 0.7044 |

### Controlled enemy count

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12000 | 85.75% | 14.25% | 9.6752 | 2.3702 | 1.0000 | 0.1115 | 0.6688 |
| 2 | 24000 | 46.95% | 17.92% | 6.5269 | 3.0148 | 1.6933 | 0.1661 | 0.6127 |
| 3 | 36000 | 27.11% | 29.37% | 5.5967 | 2.6472 | 2.6861 | 0.2631 | 0.7593 |

### Controlled encounter family

| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mp_drain | 12000 | 27.59% | 4.96% | 5.0945 | 4.1769 | 1.4932 | 0.0402 | 0.4256 |
| protected_formation | 12000 | 66.32% | 30.88% | 7.8676 | 1.8527 | 1.8935 | 0.2921 | 0.7998 |
| recovery_denial | 12000 | 32.07% | 52.20% | 6.3543 | 3.0433 | 2.3145 | 0.4782 | 0.7295 |
| reflection_counter+magic_denial | 12000 | 22.92% | 3.72% | 5.0979 | 1.5745 | 2.9675 | 0.0364 | 0.8237 |
| regen | 12000 | 85.75% | 14.25% | 9.6752 | 2.3702 | 1.0000 | 0.1115 | 0.6688 |
| summon_split+multi_action | 12000 | 26.36% | 32.19% | 5.4014 | 3.3237 | 2.7764 | 0.2748 | 0.7246 |

### Controlled paired counterfactuals

All counterfactual deltas are **candidate − baseline**; positive means improvement.

| Condition | Baseline pure raw | Candidate pure raw | Clear-rate delta (candidate − baseline) | HP delta (candidate − baseline) | MP delta (candidate − baseline) |
| --- | ---: | ---: | ---: | ---: | ---: |
| W1_normal_damage_075 | 43.50% | 33.36% | +9.65pp | +8.77pp | -4.28pp |
| W2_enemy_hp_075 | 43.50% | 37.66% | +9.21pp | +8.63pp | +3.25pp |
| W3_enemy_action_exposure_1 | 43.50% | 32.49% | +14.19pp | +14.06pp | -8.96pp |

### Controlled Build Sensitivity

- strict significant reversal count: **18**
- strict reversal rule: paired outcome + utility bootstrap 95% CIs, both signs reversed; minimum paired N **30**
- insufficient-sample family comparisons excluded: **0**
- family paired N: **36** build-pair×family entries recorded in JSON
- equal-cell best-build coverage (not encounter-frequency weighted): **aoe-burst**, share **56.94%** across **36** depth×family cells
- production-frequency-weighted best-build share (diagnostic utility): **aoe-burst**, share **42.81%** across **18000** encounter samples

| Build pair | Paired clear difference (left − right) | Paired HP difference (left − right) | Paired MP difference (left − right) |
| --- | ---: | ---: | ---: |
| aoe-burst vs single-efficient | 0.3110 | 0.3060 | -0.0908 |
| aoe-burst vs sustain | 0.0793 | 0.1405 | 0.0315 |
| aoe-burst vs hybrid-fallback | 0.3773 | 0.3685 | -0.1294 |
| single-efficient vs sustain | -0.2317 | -0.1654 | 0.1223 |
| single-efficient vs hybrid-fallback | 0.0663 | 0.0626 | -0.0386 |
| sustain vs hybrid-fallback | 0.2979 | 0.2280 | -0.1609 |

### Family paired sample sizes

Every family/build-pair paired N is recorded here. N<30 is emitted as `insufficient_sample` and cannot enter strict reversal.

| Build pair | Family | Paired N |
| --- | --- | ---: |
| aoe-burst vs hybrid-fallback | mp_drain | 3000 |
| aoe-burst vs single-efficient | mp_drain | 3000 |
| aoe-burst vs sustain | mp_drain | 3000 |
| single-efficient vs hybrid-fallback | mp_drain | 3000 |
| single-efficient vs sustain | mp_drain | 3000 |
| sustain vs hybrid-fallback | mp_drain | 3000 |
| aoe-burst vs hybrid-fallback | protected_formation | 3000 |
| aoe-burst vs single-efficient | protected_formation | 3000 |
| aoe-burst vs sustain | protected_formation | 3000 |
| single-efficient vs hybrid-fallback | protected_formation | 3000 |
| single-efficient vs sustain | protected_formation | 3000 |
| sustain vs hybrid-fallback | protected_formation | 3000 |
| aoe-burst vs hybrid-fallback | recovery_denial | 3000 |
| aoe-burst vs single-efficient | recovery_denial | 3000 |
| aoe-burst vs sustain | recovery_denial | 3000 |
| single-efficient vs hybrid-fallback | recovery_denial | 3000 |
| single-efficient vs sustain | recovery_denial | 3000 |
| sustain vs hybrid-fallback | recovery_denial | 3000 |
| aoe-burst vs hybrid-fallback | reflection_counter+magic_denial | 3000 |
| aoe-burst vs single-efficient | reflection_counter+magic_denial | 3000 |
| aoe-burst vs sustain | reflection_counter+magic_denial | 3000 |
| single-efficient vs hybrid-fallback | reflection_counter+magic_denial | 3000 |
| single-efficient vs sustain | reflection_counter+magic_denial | 3000 |
| sustain vs hybrid-fallback | reflection_counter+magic_denial | 3000 |
| aoe-burst vs hybrid-fallback | regen | 3000 |
| aoe-burst vs single-efficient | regen | 3000 |
| aoe-burst vs sustain | regen | 3000 |
| single-efficient vs hybrid-fallback | regen | 3000 |
| single-efficient vs sustain | regen | 3000 |
| sustain vs hybrid-fallback | regen | 3000 |
| aoe-burst vs hybrid-fallback | summon_split+multi_action | 3000 |
| aoe-burst vs single-efficient | summon_split+multi_action | 3000 |
| aoe-burst vs sustain | summon_split+multi_action | 3000 |
| single-efficient vs hybrid-fallback | summon_split+multi_action | 3000 |
| single-efficient vs sustain | summon_split+multi_action | 3000 |
| sustain vs hybrid-fallback | summon_split+multi_action | 3000 |

## Interpretation and required decisions

1. W1/W2/W3 are fixed causal probes, not production proposals; W3 limits total enemy turns after speed ordering and answers exposure sensitivity, not a natural gameplay replacement.
2. Build Confidence uses #975-compatible paired outcome + utility bootstrap reversals, minimum family paired N, aggregate clear/HP/MP, equal-cell coverage, and production-frequency-weighted best-build share.
3. Equal-cell coverage gives every observed depth×family cell one vote; it is not encounter-frequency weighted. The generated-encounter dominance share is the frequency-weighted metric within the requested depth sample.
4. No production balance lever is recommended from this measurement alone. If a later tuning Issue is opened, the first candidate must come from this evidence rather than controlled-fixture averages.

## Reproduction

```sh
node scratch/measurements/issue987_production_frequency.js --runs 5000 --stress-runs 500 --seed 987-production-frequency --output evidence/results/issue-987-production-frequency.json --summary evidence/results/issue-987-production-frequency.md
```
