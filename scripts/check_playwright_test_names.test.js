import assert from 'node:assert/strict';
import { checkFile } from './check_playwright_test_names.js';

assert.deepEqual(
  checkFile('issue-123.cases.js', 'test("works", async () => {});'),
  ['issue-123.cases.js: Issue/verify filename is not allowed']
);
assert.deepEqual(
  checkFile('combat.cases.js', 'test("Issue #123 works", async () => {});'),
  ['combat.cases.js: Issue/verify naming is not allowed in spec text']
);
assert.deepEqual(
  checkFile('combat.cases.js', 'test("combat works", async () => {});'),
  []
);
