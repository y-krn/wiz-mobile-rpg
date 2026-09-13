## Summary

- Closes #1233
- Parent #1184へ、C0/C1/C2/C3 measurement と manual gate の結果を返す。
- Phase 1 は C2（chest trapのみ無効）が retry-hypothesis 阻害に効く可能性を示した。C1はupper-bound probe、C3は弱かった。
- production candidate は B1F chest trap introduction の遅延だけ。floor trap、B2F以降のchest risk/reward、combat/enemy/recovery/starting gear/lootは変更していない。

## Evidence

- [Issue #1233 evidence](evidence/results/issue-1233-first-band-trap-cost.md)
- implementation-start current main SHA: `29cfd914320e29e553d5082f3d4045744f6607e7`
- final measurement source SHA: `dd731ebabdbf36d8a68fb7fd36e24bcaa04bc496` (B1F trap effect disabled while preserving the legacy one-draw RNG stream)
- seed `1233`, N=1000/condition, same worldSeed per runIndex, fresh vanguard / Workshopなし / carry recoveryなし / departure craftなし / B1F start。
- candidate後 C0: E1→E2 `.922`, E2→E3 `.778`, meaningful loot `.960`, equipment `.960`, Build `.645`; floor trap remains observable (`283` activations, `1.350` HP avg, `.029` MP avg), chest risk/reward remains from B2F.
- C1/C2/C3 counterfactuals were not rerun because measurement-only disabled policies already preserved the legacy draw; fixed Phase 2 was rerun after the production candidate RNG correction.
- manual gate rerun: 2 fresh runs including one death; visible death cause, loot loss, single/pair target choice, shared action-slot log, flee follow-up, and B1F loot→Build trial were confirmed.

## Verification

- `npm run test:unit` — 201/201 pass
- `npm run lint` — pass
- `npm run build` — pass (chunk-size warning only)
- `npm run test:browser` — 88/88 pass
- `PLAYWRIGHT_PORT=15782 npm run test:browser:parallel` — 88/88 pass
- Parallel first attempt on task-owned port `15782` hit environment `EPERM` in preflight; the same command with escalation reran and passed. A P1 rerun exposed `test_sim_follow_gate.js`'s fixed `runIndex=7` no longer reaching experience evidence on the corrected stream; the failure reproduced standalone, so the smoke fixture was moved to stable `runIndex=1`, then full unit rerun passed. Earlier B1-dependent fixture updates and selector invariant remain recorded in the evidence.

Do not merge from this task; leave the PR awaiting review.
