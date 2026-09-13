## Summary

- Closes #1233
- Parent #1184へ、C0/C1/C2/C3 measurement と manual gate の結果を返す。
- Phase 1 は C2（chest trapのみ無効）が retry-hypothesis 阻害に効く可能性を示した。C1はupper-bound probe、C3は弱かった。
- production candidate は B1F chest trap introduction の遅延だけ。floor trap、B2F以降のchest risk/reward、combat/enemy/recovery/starting gear/lootは変更していない。

## Evidence

- [Issue #1233 evidence](evidence/results/issue-1233-first-band-trap-cost.md)
- implementation-start current main SHA: `29cfd914320e29e553d5082f3d4045744f6607e7`
- final measurement source SHA: `7394338772143f3cbf68f8d234a3550d62171802`
- seed `1233`, N=1000/condition, same worldSeed per runIndex, fresh vanguard / Workshopなし / carry recoveryなし / departure craftなし / B1F start。
- candidate後 C0: E1→E2 `.913`, E2→E3 `.766`, meaningful loot `.960`, equipment `.960`, Build `.660`; B1F〜B5F floor trap remains observable.
- manual gate: multiple fresh runs including one death; visible death cause, loot loss, target choice, flee follow-up, and loot→Build trial were confirmed.

## Verification

- `npm run test:unit` — 201/201 pass
- `npm run lint` — pass
- `npm run build` — pass (chunk-size warning only)
- `npm run test:browser` — 88/88 pass
- `PLAYWRIGHT_PORT=15782 npm run test:browser:parallel` — 88/88 pass
- Initial parallel attempt on fixed 15781 hit environment port collision/EPERM; rerun on task-owned port passed. Initial unit failures were resolved by updating two B1-dependent fixtures to B2 and replacing one unstable aggregate ordering assertion with the selector invariant; full rerun passed.

Do not merge from this task; leave the PR awaiting review.
