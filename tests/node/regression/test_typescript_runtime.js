import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypedFixture } from '../fixtures/typescript/typed_module.ts';
import { collectRelativeDependencies } from '../fixtures/dependency_resolver.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dependencyFixture = path.join(repoRoot, 'tests/node/fixtures/typescript/dependency_root.js');
const dependencies = collectRelativeDependencies(dependencyFixture);
const tsxFixture = path.join(repoRoot, 'tests/node/fixtures/typescript/tsx_root.js');
const tsxDependencies = collectRelativeDependencies(tsxFixture);

assert.equal(buildTypedFixture('foundation', 3), 'foundation:floor:3');
assert.ok(dependencies.has(path.join(repoRoot, 'tests/node/fixtures/typescript/typed_dependency.ts')));
assert.ok(dependencies.has(path.join(repoRoot, 'src/seed_rng.js')));
assert.ok(tsxDependencies.has(path.join(repoRoot, 'tests/node/fixtures/typescript/typed_component.tsx')));
console.log('[PASS] JS tests import TS modules and dependency traversal resolves TS files');
