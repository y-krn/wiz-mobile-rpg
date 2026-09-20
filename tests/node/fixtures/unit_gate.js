import { HEAVY_TEST_MANIFEST } from './heavy_test_manifest.js';

export const PR_CONDITIONAL_TEST_PATHS = new Set(
  HEAVY_TEST_MANIFEST
    .filter(entry => entry.ownership === 'PR_CONDITIONAL')
    .map(entry => entry.file),
);

export const MAIN_PUSH_TEST_PATHS = new Set(
  HEAVY_TEST_MANIFEST
    .filter(entry => entry.ownership === 'MAIN_PUSH')
    .map(entry => entry.file),
);

export const SCHEDULED_TEST_PATHS = new Set(
  HEAVY_TEST_MANIFEST
    .filter(entry => entry.ownership === 'SCHEDULED')
    .map(entry => entry.file),
);

export const MANUAL_MEASUREMENT_TEST_PATHS = new Set(
  HEAVY_TEST_MANIFEST
    .filter(entry => entry.ownership === 'MANUAL_MEASUREMENT')
    .map(entry => entry.file),
);

export function resolveUnitMode({ unitMode, prUnit } = {}) {
  if (unitMode) return unitMode;
  return prUnit ? 'pull-request' : 'local';
}

export function getUnitExclusions({ unitMode, prUnit } = {}) {
  const mode = resolveUnitMode({ unitMode, prUnit });
  const excluded = new Set();
  if (mode === 'pull-request' || mode === 'merge-group') {
    for (const file of PR_CONDITIONAL_TEST_PATHS) excluded.add(file);
    for (const file of MAIN_PUSH_TEST_PATHS) excluded.add(file);
    for (const file of SCHEDULED_TEST_PATHS) excluded.add(file);
    for (const file of MANUAL_MEASUREMENT_TEST_PATHS) excluded.add(file);
  }
  if (mode === 'main-push') {
    for (const file of MAIN_PUSH_TEST_PATHS) excluded.add(file);
    for (const file of SCHEDULED_TEST_PATHS) excluded.add(file);
    for (const file of MANUAL_MEASUREMENT_TEST_PATHS) excluded.add(file);
  }
  return excluded;
}
