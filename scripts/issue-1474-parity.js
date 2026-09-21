import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const evidenceDir = process.env.ISSUE_1474_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('ISSUE_1474_EVIDENCE_DIR is required');
mkdirSync(evidenceDir, { recursive: true });

const playwright = path.resolve('node_modules/@playwright/test/cli.js');
const target = 'Primary run path reaches Town again through UI actions';
const selections = {
  baseline: ['test', '--grep', '@smoke', '--grep-invert', '@visual', '--list'],
  serial: ['test', '--grep', target, '--list'],
  remainder: ['test', '--grep', '@smoke', '--grep-invert', `@visual|${target}`, '--list'],
};

function listTests(args) {
  const output = execFileSync(process.execPath, [playwright, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tests = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.includes('›'));
  const totalMatch = output.match(/Total:\s+(\d+)\s+tests?\b/);
  return {
    args,
    tests,
    count: tests.length,
    reportedCount: totalMatch ? Number(totalMatch[1]) : null,
  };
}

const lists = Object.fromEntries(
  Object.entries(selections).map(([name, args]) => [name, listTests(args)]),
);

function counts(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].filter(([, count]) => count > 1).map(([test, count]) => ({ test, count }));
}

const baseline = new Set(lists.baseline.tests);
const serial = new Set(lists.serial.tests);
const remainder = new Set(lists.remainder.tests);
const union = new Set([...serial, ...remainder]);
const intersection = [...serial].filter(test => remainder.has(test));
const missing = [...baseline].filter(test => !union.has(test));
const unexpected = [...union].filter(test => !baseline.has(test));
const parity = {
  baselineCount: lists.baseline.count,
  serialCount: lists.serial.count,
  remainderCount: lists.remainder.count,
  totalExactly104: lists.baseline.count === 104 && union.size === 104,
  serialExactly1: lists.serial.count === 1,
  remainderExactly103: lists.remainder.count === 103,
  baselineEqualsUnion: baseline.size === union.size && missing.length === 0 && unexpected.length === 0,
  serialRemainderDisjoint: intersection.length === 0,
  missing,
  unexpected,
  duplicate: {
    baseline: counts(lists.baseline.tests),
    serial: counts(lists.serial.tests),
    remainder: counts(lists.remainder.tests),
    acrossLanes: counts([...lists.serial.tests, ...lists.remainder.tests]),
  },
};

const result = {
  schemaVersion: 1,
  sourceUnderTest: process.env.SOURCE_UNDER_TEST || 'unknown',
  measurementWorkflowSha: process.env.MEASUREMENT_WORKFLOW_SHA || 'unknown',
  target,
  lists,
  parity,
};
writeFileSync(path.join(evidenceDir, 'parity.json'), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(evidenceDir, 'parity.txt'), [
  `baseline=${parity.baselineCount}`,
  `serial=${parity.serialCount}`,
  `remainder=${parity.remainderCount}`,
  `totalExactly104=${parity.totalExactly104}`,
  `baselineEqualsUnion=${parity.baselineEqualsUnion}`,
  `serialRemainderDisjoint=${parity.serialRemainderDisjoint}`,
  `missing=${parity.missing.length}`,
  `unexpected=${parity.unexpected.length}`,
  `duplicates=${parity.duplicate.acrossLanes.length}`,
].join('\n') + '\n');

console.log(JSON.stringify({ sourceUnderTest: result.sourceUnderTest, parity }, null, 2));
