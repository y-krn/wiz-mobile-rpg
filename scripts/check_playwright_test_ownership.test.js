import assert from 'node:assert/strict';
import { checkOwnership } from './check_playwright_test_ownership.js';

const file = (name, source = '') => ({ name: `tests/${name}`, source });

assert.deepEqual(
  checkOwnership([
    file('combat.spec.js', "import { test } from './fixtures/browser-health.js';\nimport './combat-flow.cases.js';"),
    file('combat-flow.cases.js'),
  ]),
  []
);

assert.deepEqual(
  checkOwnership([
    file('combat.spec.js', "import {\n  test,\n} from './fixtures/browser-health.js';\nimport './combat-flow.cases.js';"),
    file('combat-flow.cases.js'),
  ]),
  []
);

assert.deepEqual(
  checkOwnership([file('combat-flow.cases.js')]),
  ['tests/combat-flow.cases.js: case module must be imported by exactly one .spec.js entrypoint']
);

assert.deepEqual(
  checkOwnership([
    file('combat.spec.js', "import './combat-flow.cases.js';"),
    file('inventory.spec.js', "import './combat-flow.cases.js';"),
    file('combat-flow.cases.js'),
  ]),
  ['tests/combat-flow.cases.js: case module must have exactly one .spec.js owner (found 2)']
);

assert.deepEqual(
  checkOwnership([
    file('combat.spec.js', "import './combat-flow.cases.js';\nimport './combat-flow.cases.js';"),
    file('combat-flow.cases.js'),
  ]),
  ['tests/combat-flow.cases.js: case module must be imported once by tests/combat.spec.js (found 2 imports)']
);

assert.deepEqual(
  checkOwnership([file('combat.spec.js', "import './missing.cases.js';")]),
  ['tests/combat.spec.js: imported case module does not exist: ./missing.cases.js']
);

assert.deepEqual(
  checkOwnership([
    file('combat.spec.js', "import './combat-flow.cases.js';"),
    file('combat-flow.cases.js', "import './nested.cases.js';"),
    file('nested.cases.js'),
  ]),
  [
    'tests/combat-flow.cases.js: case modules must be imported by a .spec.js entrypoint',
    'tests/nested.cases.js: case module must be imported by exactly one .spec.js entrypoint',
  ]
);
