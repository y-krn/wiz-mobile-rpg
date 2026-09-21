import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const evidenceDir = process.env.ISSUE_1474_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('ISSUE_1474_EVIDENCE_DIR is required');

const readText = filename => {
  const filePath = path.join(evidenceDir, filename);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
};
const readNumber = filename => Number(readText(filename).trim());
const readStatus = filename => Number.parseInt(readText(filename).trim(), 10);

function durationSeconds(log) {
  const matches = [...log.matchAll(/\(([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m)\)/g)];
  const value = matches.at(-1);
  if (!value) return null;
  if (value[2] === 'ms') return Number(value[1]) / 1000;
  return value[2] === 'm' ? Number(value[1]) * 60 : Number(value[1]);
}

function summaryCount(log, name) {
  const match = log.match(new RegExp(`(\\d+)\\s+${name}\\b`, 'i'));
  return match ? Number(match[1]) : 0;
}

function invocation(logFile, statusFile) {
  const log = readText(logFile);
  return {
    logFile,
    status: readStatus(statusFile),
    reportedDurationSeconds: durationSeconds(log),
    passed: summaryCount(log, 'passed'),
    failed: summaryCount(log, 'failed'),
    skipped: summaryCount(log, 'skipped'),
    flaky: summaryCount(log, 'flaky'),
    retries: (log.match(/retry\s*#\d+|retrying/gi) || []).length,
    timeouts: (log.match(/timeout|timed out/gi) || []).length,
    browserHealth: {
      pageerror: (log.match(/pageerror:/gi) || []).length,
      consoleError: (log.match(/console\.error:/gi) || []).length,
      requestFailed: (log.match(/requestfailed:/gi) || []).length,
    },
    diagnostics: {
      browserCrash: /browserType\.launch|target page, context or browser has been closed|browser has been closed|chromium.*(?:crash|crashed)/i.test(log),
      launchError: /\[playwright-diagnostics\] launch error:/i.test(log),
      portCollision: /port collision target|address already in use|EADDRINUSE/i.test(log),
      workerLine: log.match(/\[playwright-diagnostics\] worker count:.*$/m)?.[0] || null,
      isolationPass: log.includes('profile isolation: passed') && log.includes('temp/test-data isolation: passed'),
    },
  };
}

const variant = process.env.ISSUE_1474_VARIANT;
const parity = JSON.parse(readText('parity.json'));
const baseline = invocation('baseline.log', 'baseline-status');
const serial = variant === 'candidate' ? invocation('serial.log', 'serial-status') : null;
const remainder = variant === 'candidate' ? invocation('remainder.log', 'remainder-status') : null;
const candidate = variant === 'candidate';

const timingsMs = {
  setup: readNumber('setup-end-ms') - readNumber('setup-start-ms'),
  installDeps: readNumber('install-deps-end-ms') - readNumber('install-deps-start-ms'),
  job: readNumber('job-end-ms') - readNumber('job-start-ms'),
  smoke: candidate
    ? readNumber('candidate-end-ms') - readNumber('candidate-start-ms')
    : readNumber('baseline-end-ms') - readNumber('baseline-start-ms'),
  serial: candidate ? readNumber('serial-end-ms') - readNumber('serial-start-ms') : null,
  remainder: candidate ? readNumber('remainder-end-ms') - readNumber('remainder-start-ms') : null,
};

const sampleFailed = candidate ? serial.status !== 0 || remainder.status !== 0 : baseline.status !== 0;
const sample = {
  schemaVersion: 1,
  sourceUnderTest: process.env.SOURCE_UNDER_TEST,
  measurementWorkflowSha: process.env.MEASUREMENT_WORKFLOW_SHA,
  latestMainSha: process.env.LATEST_MAIN_SHA,
  runId: process.env.GITHUB_RUN_ID,
  job: process.env.GITHUB_JOB,
  sampleId: `${variant}-r${process.env.ISSUE_1474_REPEAT}`,
  variant,
  repeat: Number(process.env.ISSUE_1474_REPEAT),
  runner: {
    name: process.env.RUNNER_NAME,
    os: process.env.RUNNER_OS,
    arch: process.env.RUNNER_ARCH,
    imageOs: process.env.ImageOS || 'unknown',
    imageVersion: process.env.ImageVersion || 'unknown',
  },
  toolVersions: readText('tool-versions.txt').trim().split(/\r?\n/).filter(Boolean),
  browserCacheHit: process.env.PLAYWRIGHT_CACHE_HIT === 'true',
  browserInstallMode: process.env.PLAYWRIGHT_CACHE_HIT === 'true' ? 'install-deps chromium' : 'install --with-deps chromium',
  timingsMs,
  tests: {
    baseline: parity.lists.baseline.count,
    serial: candidate ? parity.lists.serial.count : null,
    remainder: candidate ? parity.lists.remainder.count : null,
    total: parity.parity.baselineCount,
  },
  invocations: { baseline, serial, remainder },
  sampleFailed,
  parity: parity.parity,
  policy: {
    retries: 'CI default 2; unchanged',
    traceVideoScreenshot: 'trace=retain-on-failure; video=retain-on-failure; screenshot=only-on-failure; unchanged',
    assertionsTagsSemantics: 'unchanged; selection only via grep for measurement lanes',
    browserHealthFixture: 'unchanged',
    webServerPreflight: 'unchanged; Playwright webServer and dependency-preflight retained',
  },
};
writeFileSync(path.join(evidenceDir, 'sample.json'), `${JSON.stringify(sample, null, 2)}\n`);

const duration = item => item?.reportedDurationSeconds == null ? 'n/a' : `${item.reportedDurationSeconds}s`;
const summary = [
  '### Issue #1474 sample',
  '',
  `- sample: ${sample.sampleId}`,
  `- source: ${sample.sourceUnderTest}`,
  `- workflow: ${sample.measurementWorkflowSha}`,
  `- runner: ${sample.runner.imageOs} ${sample.runner.imageVersion} / ${sample.toolVersions.join(', ')}`,
  `- setup / install-deps / job: ${timingsMs.setup}ms / ${timingsMs.installDeps}ms / ${timingsMs.job}ms`,
  `- total smoke wall: ${timingsMs.smoke}ms`,
  `- lane wall: serial=${timingsMs.serial ?? 'n/a'}ms, remainder=${timingsMs.remainder ?? 'n/a'}ms`,
  `- reported duration: baseline=${duration(baseline)}, serial=${duration(serial)}, remainder=${duration(remainder)}`,
  `- tests: baseline=${sample.tests.baseline}, serial=${sample.tests.serial ?? 'n/a'}, remainder=${sample.tests.remainder ?? 'n/a'}`,
  `- final status: ${sampleFailed ? 'FAIL' : 'PASS'}`,
  `- retries: baseline=${baseline.retries}, serial=${serial?.retries ?? 0}, remainder=${remainder?.retries ?? 0}`,
  `- timeouts: baseline=${baseline.timeouts}, serial=${serial?.timeouts ?? 0}, remainder=${remainder?.timeouts ?? 0}`,
  `- browser health: pageerror=${baseline.browserHealth.pageerror + (serial?.browserHealth.pageerror || 0) + (remainder?.browserHealth.pageerror || 0)}, console.error=${baseline.browserHealth.consoleError + (serial?.browserHealth.consoleError || 0) + (remainder?.browserHealth.consoleError || 0)}, requestfailed=${baseline.browserHealth.requestFailed + (serial?.browserHealth.requestFailed || 0) + (remainder?.browserHealth.requestFailed || 0)}`,
  `- diagnostics: crash=${[baseline, serial, remainder].some(item => item?.diagnostics.browserCrash)}, launch=${[baseline, serial, remainder].some(item => item?.diagnostics.launchError)}, port=${[baseline, serial, remainder].some(item => item?.diagnostics.portCollision)}`,
  `- parity: total104=${parity.parity.totalExactly104}, baseline=union=${parity.parity.baselineEqualsUnion}, disjoint=${parity.parity.serialRemainderDisjoint}, missing=${parity.parity.missing.length}, duplicate=${parity.parity.duplicate.acrossLanes.length}`,
].join('\n');
writeFileSync(path.join(evidenceDir, 'sample.md'), `${summary}\n`);
process.stdout.write(`${summary}\n`);
