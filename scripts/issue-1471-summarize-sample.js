import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const evidenceDir = process.env.ISSUE_1471_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('ISSUE_1471_EVIDENCE_DIR is required');

const readText = filename => {
  const filePath = path.join(evidenceDir, filename);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
};

const browserLog = readText('browser-test.log');
const targetTitle = 'Primary run path reaches Town again through UI actions';
const results = [...browserLog.matchAll(/\[issue-1471-result\] (\{.*\})/g)]
  .map(match => {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  })
  .filter(result => result?.title === `${targetTitle} @e2e @smoke` || result?.title === targetTitle);

const phaseAttempts = readdirSync(evidenceDir)
  .filter(filename => filename.startsWith('phase-timing-') && filename.endsWith('.json'))
  .sort()
  .map(filename => JSON.parse(readFileSync(path.join(evidenceDir, filename), 'utf8')));

const timeoutResults = results.filter(result => result.status === 'timedOut' || result.errors.some(error => /timeout|timed out/i.test(error)));
const failureResults = results.filter(result => result.status !== 'passed');
const health = {
  pageerror: (browserLog.match(/\[issue-1471-browser-health\] pageerror:/g) || []).length,
  consoleError: (browserLog.match(/\[issue-1471-browser-health\] console\.error:/g) || []).length,
  requestFailed: (browserLog.match(/\[issue-1471-browser-health\] requestfailed:/g) || []).length,
};

const artifactFiles = [];
for (const directory of ['test-results', 'playwright-report']) {
  const root = path.resolve(directory);
  if (!existsSync(root)) continue;
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (/\.(zip|webm|png|jpg|jpeg)$/i.test(entry.name)) artifactFiles.push(entryPath);
    }
  };
  visit(root);
}

const sample = {
  schemaVersion: 1,
  sourceUnderTest: process.env.SOURCE_UNDER_TEST,
  measurementWorkflowSha: process.env.MEASUREMENT_WORKFLOW_SHA,
  runId: process.env.GITHUB_RUN_ID,
  job: process.env.GITHUB_JOB,
  sampleId: process.env.ISSUE_1471_SAMPLE,
  mode: process.env.ISSUE_1471_MODE,
  repeat: Number(process.env.ISSUE_1471_REPEAT),
  worker: Number(process.env.PLAYWRIGHT_WORKERS),
  runner: {
    name: process.env.RUNNER_NAME,
    os: process.env.RUNNER_OS,
    arch: process.env.RUNNER_ARCH,
    imageOs: process.env.ImageOS || 'unknown',
    imageVersion: process.env.ImageVersion || 'unknown',
  },
  toolVersions: readText('tool-versions.txt').trim().split(/\r?\n/).filter(Boolean),
  target: {
    attempts: results,
    durationMs: results.map(result => result.durationMs),
    finalStatus: results.at(-1)?.status || 'not-reported',
    sampleFailed: results.at(-1)?.status !== 'passed',
    failedAttemptCount: failureResults.length,
    retryCount: Math.max(0, results.length - 1),
    timeoutCount: timeoutResults.length,
    timeoutLastCompletedPhase: timeoutResults.map(result => {
      const attempt = phaseAttempts.find(candidate => candidate.retry === result.retry);
      return { retry: result.retry, phase: attempt?.lastCompletedPhase || null, activePhase: attempt?.activePhase || null };
    }),
    phaseAttempts,
  },
  browserHealth: health,
  diagnostics: {
    browserCrash: /browserType\.launch|target page, context or browser has been closed|browser has been closed|chromium.*(?:crash|crashed)/i.test(browserLog),
    launchError: /\[playwright-diagnostics\] launch error:/i.test(browserLog),
    portCollision: /port collision target|address already in use|EADDRINUSE/i.test(browserLog),
    workerLine: browserLog.match(/\[playwright-diagnostics\] worker count:.*$/m)?.[0] || null,
    browserHealth: health,
  },
  processSnapshots: phaseAttempts.map(attempt => ({
    retry: attempt.retry,
    start: attempt.processAtStart,
    finish: attempt.processAtFinish,
  })),
  runnerSnapshots: {
    before: readText('processes-before.txt').trim().split(/\r?\n/).filter(Boolean),
    after: readText('processes-after.txt').trim().split(/\r?\n/).filter(Boolean),
    load: readText('load.txt').trim().split(/\r?\n/).filter(Boolean),
  },
  artifacts: {
    traceVideoScreenshotPolicy: 'config unchanged: retain-on-failure / retain-on-failure / only-on-failure',
    files: artifactFiles,
  },
  smokeOutcome: process.env.ISSUE_1471_SMOKE_OUTCOME || 'unknown',
};

writeFileSync(path.join(evidenceDir, 'sample.json'), `${JSON.stringify(sample, null, 2)}\n`);
const phaseSummary = phaseAttempts.map(attempt => `${attempt.retry}: ${attempt.phases.map(phase => `${phase.name}=${phase.durationMs}ms`).join(', ') || `last=${attempt.lastCompletedPhase || 'none'} active=${attempt.activePhase || 'none'}`}`).join('\n');
const summary = [
  '### Issue #1471 sample',
  '',
  `- sample: ${sample.sampleId}`,
  `- source: ${sample.sourceUnderTest}`,
  `- mode: ${sample.mode}`,
  `- worker: ${sample.worker}`,
  `- target status: ${sample.target.finalStatus}`,
  `- target durations ms: ${sample.target.durationMs.join(', ') || 'not reported'}`,
  `- retries: ${sample.target.retryCount}`,
  `- timeouts: ${sample.target.timeoutCount}`,
  `- timeout last phase: ${sample.target.timeoutLastCompletedPhase.map(item => `${item.retry}:${item.phase || 'none'} (active ${item.activePhase || 'none'})`).join(', ') || 'none'}`,
  `- browser health: pageerror=${health.pageerror}, console.error=${health.consoleError}, requestfailed=${health.requestFailed}`,
  '',
  '#### Phase timings',
  '',
  phaseSummary || 'not reported',
  '',
].join('\n');
writeFileSync(path.join(evidenceDir, 'sample.md'), `${summary}\n`);
process.stdout.write(summary);
