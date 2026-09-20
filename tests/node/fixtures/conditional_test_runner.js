import { HEAVY_TEST_MANIFEST } from './heavy_test_manifest.js';
import { runHeavyTest, runHeavyTestPool } from './heavy_test_runner.js';
import {
  collectChangedFiles,
  selectTestsForChanges,
} from './dependency_resolver.js';

export const PR_CONDITIONAL_MANIFEST = HEAVY_TEST_MANIFEST.filter(
  entry => entry.ownership === 'PR_CONDITIONAL',
);

export function selectConditionalTests({ repoRoot, changedFiles }) {
  return selectTestsForChanges({
    manifest: PR_CONDITIONAL_MANIFEST,
    repoRoot,
    changedFiles,
  });
}

export function resolveConditionalSelection({
  repoRoot,
  baseRef = 'origin/main',
  headRef = 'HEAD',
  includeWorkingTree = true,
}) {
  try {
    const changedFiles = collectChangedFiles({
      repoRoot,
      baseRef,
      headRef,
      includeWorkingTree,
    });
    return {
      ...selectConditionalTests({ repoRoot, changedFiles }),
      changedFiles,
      resolverError: null,
    };
  } catch (error) {
    return {
      selected: new Set(PR_CONDITIONAL_MANIFEST.map(entry => entry.file)),
      results: [],
      changedFiles: null,
      resolverError: error,
    };
  }
}

export function createConditionalTasks({ selected, ci = false }) {
  return PR_CONDITIONAL_MANIFEST
    .filter(entry => selected.has(entry.file))
    .flatMap(entry => {
      const shardCount = ci ? 1 : entry.shardCount;
      return Array.from({ length: shardCount }, (_, shardIndex) => ({
        file: entry.file,
        ...(shardCount === 1 ? {} : { shardIndex, shardCount }),
      }));
    });
}

export const runConditionalTest = runHeavyTest;
export const runConditionalPool = runHeavyTestPool;
