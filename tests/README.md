# Test ownership

All executable tests live under the repository-level `tests/` directory.

| Location | Ownership | Discovery |
| --- | --- | --- |
| `tests/*.spec.js` | Playwright browser/mobile entrypoints | `playwright.config.js` |
| `tests/*.cases.js` | browser test case modules imported by specs | explicit imports from specs |
| `tests/node/run_tests.js` | Node unit/regression suite entrypoint | `npm run test:unit*` |
| `tests/node/unit/` | deterministic source-level contracts | `tests/node/run_tests.js` |
| `tests/node/regression/` | boundary, historical regression, runner, and preflight contracts | `tests/node/run_tests.js` |
| `tests/node/fixtures/` | shared Node test fixtures | explicit imports |

`scratch/` is intentionally not a test owner. It contains simulations,
measurements, and benchmarks only. Historical summaries and raw-result evidence
belong in `evidence/`.

Permanent Node tests are named for the contract they protect rather than the
Issue that introduced them. Issue-numbered historical simulation/measurement
runners keep their separately declared lifecycle under `scratch/`.

The ownership contract is enforced by
`tests/node/regression/test_scratch_ownership.js`, including the requirement
that `tests/node/` must not be recreated.
