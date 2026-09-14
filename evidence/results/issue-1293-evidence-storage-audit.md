# Issue #1293 — evidence/ Git 実コストと保存方針監査

## 結論

**Policy change warranted.** evidence/ 自体を削除する根拠はないが、現行 tree の 96.67% が raw/generated JSON、現行 checkout の約 123.7 MiB が evidence/ であり、同種 raw output の更新も継続している。今後は summary・provenance・required fixture を Git に残し、bulk raw JSON と visual review capture は artifact storage を基本にする hybrid policy が妥当である。

この Issue では evidence の大量削除、history rewrite、Git LFS migration、workflow artifact redesign、gameplay/balance/renderer 変更を行っていない。

## Scope と base

- repository: y-krn/wiz-mobile-rpg
- branch: codex/issue-1293-evidence-storage-audit
- base SHA: 5b46f85ed7580a63d2fb7f2d3c4298177e72f2ed
- START_SHA: 5b46f85ed7580a63d2fb7f2d3c4298177e72f2ed
- REMOTE_MAIN_SHA (git ls-remote origin refs/heads/main): 5b46f85ed7580a63d2fb7f2d3c4298177e72f2ed
- ORIGIN_MAIN_SHA (git rev-parse origin/main): 5b46f85ed7580a63d2fb7f2d3c4298177e72f2ed
- freshness: REMOTE_MAIN_SHA == ORIGIN_MAIN_SHA。これを fixed base とした。

開始時の git status --short --branch は clean。開始時の object baseline は count 935、loose size 8.14 MiB、in-pack 17,791、packs 5、size-pack 44.60 MiB、prune-packable 0、garbage 1 / 64 bytes だった。

managed worktree の .git は共有 Git directory への link であり、worktree 側 .git は 4.0 KiB。共有 repository metadata は .git 57M、objects 53M、refs 124K。GitHub CLI の repository diskUsage は 33,259 KB だった。この GitHub 値は参考値であり、local Git object、evidence blob、working tree のサイズとは同一視しない。

## Current evidence tree

du、find、stat、git ls-tree -r -l HEAD -- evidence/ で計測した。logical bytes は file content の byte 数で、Git compression を含まない。

| metric | value |
| --- | ---: |
| current evidence bytes | 129,750,206 bytes / 123.739 MiB |
| current evidence files | 236 |

### Directory breakdown

| directory | files | logical bytes | share |
| --- | ---: | ---: | ---: |
| evidence/results | 224 | 129,699,347 | 99.9608% |
| evidence/protocols | 10 | 43,670 | 0.0337% |
| evidence/fixtures | 1 | 341 | 0.0003% |
| other (evidence/issue737_ev_damage_summary.md) | 1 | 6,848 | 0.0053% |
| total | 236 | 129,750,206 | 100% |

### Extension breakdown

| class | files | logical bytes | share |
| --- | ---: | ---: | ---: |
| .md | 185 | 2,446,140 | 1.89% |
| .json | 14 | 125,431,436 | 96.67% |
| .png | 37 | 1,872,630 | 1.44% |
| .webp | 0 | 0 | 0% |
| .jpg / .jpeg | 0 | 0 | 0% |
| other binary | 0 | 0 | 0% |
| other text | 0 | 0 | 0% |
| total | 236 | 129,750,206 | 100% |

All 236 current files are tracked。 .gitignore は evidence/results/*.json を含むが、既存 tracked file は削除されない。git check-ignore --no-index では新規 result JSON が ignore 対象であることを確認した。

上記の current tree は audit record 自身を追加する前の baseline である。この Markdown は 22,485 bytes なので、監査 record を含む作業 tree は 237 files / 129,772,691 bytes となる。

## Large-file audit

file で type を確認した。reproducible は runner/source/seed/provenance から再実行可能という意味で、PNG の byte-identical を全環境で保証する意味ではない。source-of-truth は durable decision/provenance であり production code ではない。

| rank | path | bytes | type / category | reproducible? | test/workflow reference | source-of-truth? |
| ---: | --- | ---: | --- | --- | --- | --- |
| 1 | evidence/results/issue-990-phase2.json | 83,089,724 | JSON / raw generated | conditional: source SHA + historical runner | measurement output; regression は path-only allowlist | no; companion MD |
| 2 | evidence/results/issue-987-production-frequency.json | 15,444,999 | JSON / raw generated | yes, runner + config + seed | later measurement runners が直接読む | no; companion MD |
| 3 | evidence/results/issue-990-reached-run.json | 11,133,803 | JSON / raw generated | yes, runner + config + seed | producer output; direct production/test read なし | no |
| 4 | evidence/results/issue-984-pure-raw-decomposition.json | 6,673,696 | JSON / raw generated | yes, runner + config | producer output; direct production/test read なし | no |
| 5 | evidence/results/issue-1100-build-payment-stake.json | 5,886,846 | JSON / raw generated | yes; summary says determinism pass | producer output; production read なし | no; decision JSON + MD |
| 6 | evidence/results/issue-990-phase3-stage1.5.json | 1,903,430 | JSON / raw generated | conditional: source SHA + historical runner | producer output | no |
| 7 | evidence/results/issue-990-phase3-stage3.json | 546,188 | JSON / structured generated | conditional: source SHA + historical runner | producer output | no; companion MD |
| 8 | evidence/results/issue-990-phase3-stage1.json | 429,755 | JSON / structured generated | conditional: source SHA + historical runner | producer output | no |
| 9 | evidence/results/issue-990-phase3-stage2.json | 312,941 | JSON / structured generated | conditional: source SHA + historical runner | producer output | no |
| 10 | evidence/results/issue-612-exp-pace.md | 141,509 | UTF-8 / audit result | N/A, derived | no direct code/test read | yes |
| 11 | evidence/results/issue-494-combat-policy-default.md | 114,981 | UTF-8 / audit result | N/A, derived | no direct code/test read | yes |
| 12 | evidence/results/issue-611-combat-formula.md | 106,429 | UTF-8 / audit result | N/A, derived | no direct code/test read | yes |
| 13 | evidence/results/issue-489-heal-flee-threshold.md | 96,605 | UTF-8 / audit result | N/A, derived | no direct code/test read | yes |
| 14 | evidence/results/issue-1230-pixi/pixi-straight-430.png | 78,385 | PNG / visual review | yes, capture provenance | linked from issue-1230-pixi.md | no |
| 15 | evidence/results/issue-1230-pixi/pixi-combat-entry-hit-danger-390.png | 76,113 | PNG / visual review | yes, capture provenance | linked from issue-1230-pixi.md | no |
| 16 | evidence/results/issue-1230-pixi/pixi-production-b1f-minimap-390.png | 73,671 | PNG / visual review | yes, capture provenance | linked from issue-1230-pixi.md | no |
| 17 | evidence/results/issue-496-in-run-recovery-supply.md | 71,567 | UTF-8 / audit result | N/A, derived | no direct code/test read | yes |
| 18 | evidence/results/issue-1238-pixi/pixi-forward-before.png | 70,667 | PNG / visual review | yes, capture provenance | linked from issue-1238-pixi.md | no |
| 19 | evidence/results/issue-1238-pixi/pixi-reduced-motion.png | 69,567 | PNG / visual review | yes, capture provenance | linked from issue-1238-pixi.md | no |
| 20 | evidence/results/issue-1238-pixi/pixi-turn-left-before.png | 69,567 | PNG / visual review | yes, capture provenance | linked from issue-1238-pixi.md | no |

issue-1100-build-payment-stake.json は 5.89 MB の raw dump。companion Markdown は runner version、source/baseline SHA、N、seed、fixtures、scenarios、determinism、decision、modeling boundary を記録している。したがって durable surface は Markdown と 779-byte decision JSON であり、raw dump は再生成可能な generated output である。

PNG は binary という理由だけで削除候補にはしない。現行は #1220 9 files、#1228 3 files、#1230 15 files、#1238 10 files の四つの visual-review family。対応 Markdown からリンクされるが、runtime input や deterministic fixture input ではない。

### #990 raw JSON の再生成可能性

#990 の raw JSON は source SHA、seed、configuration、runner version を記録しているため、履歴上は再生成可能である。各 source commit に当時の Issue-specific runner が存在することも tree で確認した。

- phase2 source 629ae43f512c7373c4299dd0c68c525a2e487009: scratch/measurements/issue990_partial_information_progression.js
- stage1 / stage1.5 source 6445a4bd228bba3763b27ebbe180aa312b98b161: scratch/measurements/issue990_phase3_stage1.js と issue990_phase3_stage1_5.js
- stage2 source c589a8f8fcf1af5fa0ff4e286944e2250a7bb3ae: scratch/measurements/issue990_phase3_stage2_combat_personas.js
- stage3 source 98672f5789c7ec322e56095ea95eb225e9d82f66: scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js

current base ではこれらは issue-independent 名へ移動している。phase2 は partial_information_progression_measurement.js、stage1/1.5 は persona_population_measurement.js、stage2 は combat_policy_sensitivity_measurement.js、stage3 は checkpoint_continuation_measurement.js である。

したがって companion Markdown の #990 reproduction command は current checkout ではそのまま実行できず、記録された source commit を checkout するか、current runner へ同じ設定を mapping する必要がある。評価は「traceable / historically reproducible、ただし current base で turnkey ではない」とする。この command drift は raw artifact を Git に残す根拠ではなく、summary に source/runner/config/hash を保持し、artifact を取得または再生成できる workflow を必要とする根拠である。

## Git object/history cost

### Definitions

- current tree は HEAD の unique blob ID と path logical bytes を分けて計測した。
- main history は git rev-list --objects origin/main -- evidence/ の evidence blob を unique ID 化し、git cat-file --batch-check で計測した。
- 要求された git rev-list --objects --all も実行した。この managed checkout の --all は main 以外の local/remote topic refs も含むため、上限寄りの補助値として記録する。
- %(objectsize) は logical blob size。%(objectsize:disk) と verify-pack の size-in-pack-file は compressed stored-object contribution。delta object では reconstructed blob が大きくても delta payload は小さくなり得る。

| scope | unique evidence blobs | logical bytes | per-object disk sum | interpretation |
| --- | ---: | ---: | ---: | --- |
| current paths | 228 | 129,489,985 | 9,451,007 (~9.01 MiB) | 236 paths との差は 8 duplicate paths、260,221 bytes |
| origin/main all evidence history | 261 | 324,122,195 (~324.12 MB) | 12,505,673 (~11.92 MiB) | main ancestry |
| origin/main historical-only | 33 | 194,632,210 (~194.63 MB) | 3,054,666 (~2.91 MiB) | old/replaced or no-longer-current |
| local --all history | 312 | 335,392,836 (~335.39 MB) | 12,597,475 (~12.01 MiB) | topic refs を含む補助上限 |
| local --all historical-only | 84 | 205,902,851 (~205.90 MB) | 3,146,468 (~3.00 MiB) | all-ref upper scope |

current path logical bytes は 129,750,206。history logical bytes は同時 checkout size ではなく、主に prior generated JSON versions を含む。

### Packed-size interpretation

local pack total は git count-objects の 44.60 MiB。これは commits、trees、source、tests、all refs、pack index 等を含むため evidence cost ではない。evidence-only の per-object disk sum は object-local の概算で、shared pack header/index、delta base、repack effects を除く exact exclusive slice ではない。

| blob | logical bytes | verify-pack observation |
| --- | ---: | --- |
| current #990 phase2 | 83,089,724 | 5,866,902 packed bytes |
| previous #990 phase2 | 83,088,761 | 4,584-byte delta |
| earlier #990 phase2 | 51,583,760 | 2,424,376 packed bytes |
| current #1100 | 5,886,846 | 402,212 packed bytes |
| previous #1100 | 5,317,708 | 24,221-byte delta |
| earlier #1100 | 5,317,510 | 371-byte delta |
| current #987 | 15,444,999 | 525-byte delta |
| current #984 | 6,673,696 | 297-byte delta |

既存 history の old logical 194.63 MB は一対一で reclaim できない。main の historical-only per-object contribution は約 2.91 MiB である。

## History growth pattern

main first-parent で evidence-touching commit は 50。observed ancestry で evidence が現れ始めたのは 2026-08-27。new blob bytes は first-parent snapshot で初めて現れた unique blob の logical bytesであり、既存 path の generated output refresh も含む。

| date | commit / issue | files after wave | new blob bytes | category |
| --- | --- | ---: | ---: | --- |
| 2026-08-27 | merge #922 / scratch ownership | 129 | 2,391,523 | inherited MD + PNG |
| 2026-08-30 | #984 | 137 | 6,699,529 | raw decomposition JSON |
| 2026-08-30 | #987/#988 | 140 | 15,498,028 | production-frequency raw JSON |
| 2026-08-30 | #990/#993 | 143 | 11,156,453 | reached-run / phase-3 raw JSON |
| 2026-08-30 | merge #995 / #990 phase2 | 145 | 83,102,016 | very large phase2 raw refresh |
| 2026-08-30 | merge #997 / #990 stage1 | 150 | 2,378,378 | stage JSON + summary |
| 2026-08-31 | #990 stage2/stage3 | 154 | 905,503 | continued stage JSON/corrections |
| 2026-09-07 | #1116 | 160 | 5,896,854 | #1100 raw JSON refresh |
| 2026-09-13 | #1220/#1223 | 185 | 490,296 | Pixi visual family |
| 2026-09-13 | #1232 | 201 | 720,726 | more Pixi captures |
| 2026-09-13 | #1242 | 217 | 386,459 | motion-comfort captures |

Raw JSON は継続的な主 growth source。#990 では phase2 の追加後に refresh/replacement と stage outputs が続いた。#1100 も current 5.89 MB と約 5.32 MB の old revisions がある。同種 PNG は 2026-09-13 に増えたが、current bytes は 1.87 MB / 1.44% に留まる。

## Duplicate / near-duplicate audit

exact duplicate は同一 Git blob SHA で判定した。7 SHA groups が複数 evidence path に現れる。

| SHA | bytes | paths |
| --- | ---: | --- |
| 00c0d89c42d6f24f1b619e4af0bb21468f192582 | 58,955 | #1220 canvas-straight-390.png; #1230 canvas-straight-390.png |
| 295597ca12b0d73b798318b385fc8eff4693a1ff | 69,567 | #1238 pixi-forward-after.png, pixi-reduced-motion.png, pixi-turn-left-before.png |
| 305430654032ad8020f23491f87d9e9802b06b48 | 57,071 | #1238 pixi-turn-left-after.png, pixi-turn-right-before.png |
| 0091256770b0f7eae6f65d864f685ea41454fe5e | 1,547 | #271 after/before phase1 Markdown |
| e5929903d776aaf77fb35a39b3247ea3a80507f0 | 975 | #271 after/before phase2 Markdown |
| e35e881d86cf53c3fa536ab57e64e55b497fc914 | 1,553 | #271 resistance accessory / source-after phase1 |
| 9f5a83ef06c88f1d8a1532731d7a455eed3d1593 | 986 | #271 resistance accessory / source-after phase2 |

PNG duplicate path overhead は 255,160 bytes、全 duplicate path overhead は 260,221 bytes。near-duplicate 画像の pixel analysis は未実施。name/size pattern で repeated visual family を分類した。git log --find-renames では evidence path rename event は検出されなかったため、cross-path groups は exact duplicate として扱い rename とは断定しない。

## Dependency audit

検索範囲は src/、tests/、scratch/、.github/workflows/、.agents/、docs/、package.json、.gitignore。 .git/、node_modules/、evidence payload 自身は除外した。

| class | findings |
| --- | --- |
| A. runtime dependency | src/ に production の evidence/ direct read はなし。 |
| B. regression fixture | test_bleeding_measurement_provenance.js が 341-byte issue-793 provenance fixture を直接読む。test_world_class_proof_protocol.js が protocol README/task-cards/schema を直接読む。これらは tracked contract fixture/protocol。test_partial_information_progression.js の #990 path は changed-file allowlist のみで、83 MB JSON は読まない。 |
| C. workflow / measurement dependency | measurement runners は result paths を write。partial_information_progression_measurement.js と reached_run_measurement.js は issue-987-production-frequency.json を downstream input として直接読む。sim_bleeding_measurement.js は #793 output を write するが output は ignored/generated で current tracked file ではない。 |
| D. documentation / provenance link | .agents/balance-simulation.md は #1096/#1100 family、.agents/mobile-ui-ux.md は #1228 visual evidence を参照。result Markdown は #1220/#1228/#1230/#1238 PNG と runner/source/seed/provenance を参照。 |
| E. generated output only | bulk result JSON、measurement dump、PNG は production から読まれない。#987 downstream input 以外は summary/decision/provenance が durable meaning を担う generated payload。 |

.github/workflows/ と package.json に tracked evidence file を直接読む entry はない。workflow にある /tmp/equipment-load-measurement/report.json は別の input である。

## Storage classification

| family | classification | recommendation |
| --- | --- | --- |
| evidence/protocols/**, evidence/fixtures/** | A long-lived source-of-truth / B required fixture | Git に残す |
| result Markdown | A long-lived source-of-truth | Git に残す |
| small decision/provenance JSON | A machine-readable decision | Git に残す |
| raw generated JSON、特に 1 MiB 超 | B/E reproducible generated output | CI artifact。Git は summary + command + SHA/seed/config/hash |
| screenshot / PNG family | C visual review artifact | PR attachment または CI artifact。明示的 canonical baseline だけ Git |
| tests/** の visual regression snapshot | B required fixture | evidence/results とは別管理。今回動かさない |

## Cost interpretation

| surface | evidence | impact |
| --- | --- | --- |
| fresh clone | local no-local clone: .git 28M / pack 27.85 MiB、non-.git working tree 136,340 KB (~133.14 MiB)、evidence は working tree の 92.94% | material |
| fetch / pull | current local pack 44.60 MiB。大きな raw blob wave は圧縮されるが、追加時の network/review payload は大きい | minor today; wave は material |
| worktree creation | object DB は共有だが各 worktree checkout は約 133 MiB | material |
| checkout | 123.739 MiB evidence / 133.14 MiB non-.git clone | material |
| GitHub repository size | diskUsage 33,259 KB。local attribution とは別 metric | minor reference |
| local object DB | shared .git 57M / objects 53M、current evidence per-object 9.45 MB、main history 12.51 MB | minor today; growth control は material |
| review noise | 14 large JSON + 37 PNG、generated content が decision より大きい | material |
| backup/history permanence | main logical history 324.12 MB、historical-only 194.63 MB | material |

clean clone 相当の比較は local git clone --no-local で実測した。ネットワーク clone は行っていない。

## Option comparison

| option | benefit | cost / risk | verdict |
| --- | --- | --- | --- |
| 1. all evidence tracked | offline provenance が単純 | checkout/review payload と permanent history が raw 中心 | no longer preferred |
| 2. summary only | Git footprint 最小 | raw rerun/debug input を失う。required fixture に適用不可 | blanket rule として過剰 |
| 3. hybrid | decision/summary/protocol/fixture/canonical sample を維持し bulk を分離 | artifact retention と downstream input wiring が必要 | recommended |
| 4. Git LFS | large binary checkout を選択的に軽くできる | existing history は消えず、client/server policy が増える。JSON/text に不向き | not recommended |

## Recommended policy

これは forward-looking rule とし、既存 history はこの Issue で rewrite しない。

1. Markdown audit/result、protocol、deterministic regression fixture、small decision/provenance JSON を Git tracking。
2. decision/provenance JSON の Git source-of-truth default upper bound は 10 KiB。観測した compact records は 341–4,317 bytes。
3. evidence/results の raw generated output は 1 MiB 超を artifact storage default。現行は structured JSON 最大 546,188 bytes、その次が 1,903,430 bytes で、5.9–83.1 MB の raw dump へ明確な gap がある。
4. artifact ごとに Git の Markdown summary に runner path/version、source/base commit、seed/config、determinism、content hash、artifact location/retention を残す。
5. downstream input（現状 #987）は artifact retrieval を explicit input にするか upstream を同じ workflow で再生成する。単に untrack して入力を壊さない。
6. screenshots は PR attachment または CI artifact default。明示的な long-lived review/regression contract の canonical sample だけ Git。binary/size だけで削除しない。
7. Git LFS は、artifact storage で満たせない checkout need が実測された場合の別検討とする。

実装（artifact upload/retention、measurement input の変更）は別 workflow Issue とし、ここでは行っていない。

## History rewrite recommendation

**Do not rewrite history in this Issue.** 将来の forward policy 適用後に別 follow-up で検討可能だが、強く推奨はしない。

- apparent recoverable logical content: main historical-only 最大 194.63 MB
- measured historical-only packed contribution: 約 2.91 MiB（shared pack/index/repack effects 前）
- operational risk: high。commit ID、clone、review link、provenance reference を壊し、force push と全 collaborator の再同期が必要
- collaborator impact: existing clones/worktrees と old commit references 全体

194.63 MB は exact reclaim value ではない。delta compression により実保存量は数 MiB 規模であり、rewrite による savings と operational risk の比は現時点で不利。必要なら fresh clone/repack experiment と migration plan を持つ別 Issue にする。

## Self-review

- [x] GitHub metadata と Git object cost を混同していない
- [x] current tree と history logical/packed estimate を分離した
- [x] fixture を generated artifact と誤分類していない
- [x] screenshot を一律削除対象にしていない
- [x] reproducibility と #987 downstream input を記録した
- [x] exact duplicate と near-duplicate と rename を区別した
- [x] Git LFS を安易に採用していない
- [x] history rewrite、force push、大量削除を実施していない
- [x] unrelated cleanup をしていない

## Validation

- npm run lint:tests: pending at authoring time; run before commit
- focused dependency checks: referenced protocol/fixture tests and direct reads were inspected
- design canon impact: unaffected。storage/provenance audit onlyで、gameplay、balance、renderer、test behavior を変更していない。
