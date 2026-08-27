# Issue #713 separate-axis sweep

These cases use the same fresh-before command and raw baseline run as
`issue-713-trap-calibration-before.md`; each override changes only one
requested calibration axis. The current-source Thief cap is 90 for this
baseline sweep.

| axis case | Thief avg depth | B5 entrant→B6 | B10 entrant→B11 | cap binding | avg equipment points | equipment active |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| max 95 | 5.6700 | 18.00% | 76.36% | 34.05% | 1.79 | 6.64% |
| max 100 | 5.7760 | 19.11% | 75.00% | 8.08% | 1.84 | 9.73% |
| base 75 | 5.5560 | 17.34% | 73.08% | 70.43% | 1.69 | 4.38% |
| base 70 | 5.5560 | 17.34% | 73.08% | 70.43% | 1.69 | 4.38% |
| passive 10 | 5.5760 | 17.34% | 73.08% | 79.10% | 6.72 | 20.90% |
| passive 5 | 4.8300 | 14.56% | 78.38% | 37.67% | 0.90 | 6.83% |
| equipment off | 5.5480 | 17.34% | 73.08% | 66.12% | 0.00 | 0.00% |

The max-100 axis is selected: it preserves the passive and formula shape,
removes most cap binding, and restores a measurable equipment contribution.
Base changes did not move this real-run progression path. Passive changes are
not acceptable because they alter the preserved #671 class value and passive-5
also weakens Thief progression.

Raw baseline SHA-256 (repeated identical runs):
`11917ea63e1d5bb98b080bf769d8d7a042b1fbc7e4dcd85f842467eef4df2bdd`.
