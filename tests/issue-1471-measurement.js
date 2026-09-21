import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const ENABLED = process.env.ISSUE_1471_MEASUREMENT === '1';

function processSnapshot() {
  let processes;
  try {
    const output = execFileSync('ps', ['-axo', 'pid=,ppid=,pcpu=,rss=,etime=,command='], {
      encoding: 'utf8',
      timeout: 1_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    processes = output.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /(?:playwright|chromium|chrome-headless|vite|node .*wiz-mobile-rpg)/i.test(line))
      .map(line => line.slice(0, 320))
      .slice(0, 80);
  } catch {
    processes = ['unavailable'];
  }
  return {
    pid: process.pid,
    ppid: process.ppid,
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg(),
    processes,
  };
}

function numeric(value) {
  return Math.round(value * 100) / 100;
}

export function createIssue1471Measurement(testInfo) {
  if (!ENABLED) {
    return {
      enabled: false,
      phase: async (_name, action) => action(),
      finish: () => {},
    };
  }

  const startedAt = performance.now();
  const record = {
    schemaVersion: 1,
    sampleId: process.env.ISSUE_1471_SAMPLE || 'local',
    sourceUnderTest: process.env.SOURCE_UNDER_TEST || 'unknown',
    measurementWorkflowSha: process.env.MEASUREMENT_WORKFLOW_SHA || 'local',
    title: testInfo.title,
    file: testInfo.file,
    retry: testInfo.retry,
    timeoutMs: testInfo.timeout,
    workerIndex: testInfo.workerIndex,
    workerPid: process.pid,
    startedAt: new Date().toISOString(),
    durationMs: null,
    activePhase: null,
    lastCompletedPhase: null,
    phases: [],
    processAtStart: processSnapshot(),
    processAtFinish: null,
    status: 'running',
  };
  const evidenceDir = process.env.ISSUE_1471_EVIDENCE_DIR;
  const recordPath = evidenceDir
    ? path.join(evidenceDir, `phase-timing-${process.env.ISSUE_1471_SAMPLE || 'local'}-retry-${testInfo.retry}.json`)
    : testInfo.outputPath('issue-1471-phase-timing.json');
  mkdirSync(path.dirname(recordPath), { recursive: true });
  const eventPath = evidenceDir ? path.join(evidenceDir, 'phase-events.ndjson') : null;

  const persist = event => {
    const snapshot = { ...record, durationMs: numeric(performance.now() - startedAt), event };
    writeFileSync(recordPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    if (eventPath) appendFileSync(eventPath, `${JSON.stringify(snapshot)}\n`);
    console.log(`[issue-1471-phase] ${JSON.stringify({
      sampleId: record.sampleId,
      event,
      activePhase: record.activePhase,
      lastCompletedPhase: record.lastCompletedPhase,
      durationMs: snapshot.durationMs,
      phaseDurations: record.phases.map(phase => ({ name: phase.name, durationMs: phase.durationMs })),
    })}`);
  };

  persist('test-start');

  return {
    enabled: true,
    phase: async (name, action) => {
      const phaseStart = performance.now();
      record.activePhase = name;
      persist(`phase-start:${name}`);
      try {
        const result = await action();
        const phaseRecord = {
          name,
          durationMs: numeric(performance.now() - phaseStart),
          status: 'completed',
        };
        record.phases.push(phaseRecord);
        record.lastCompletedPhase = name;
        record.activePhase = null;
        persist(`phase-complete:${name}`);
        return result;
      } catch (error) {
        record.status = 'failed';
        persist(`phase-error:${name}`);
        throw error;
      }
    },
    finish: status => {
      record.status = status;
      record.activePhase = null;
      record.durationMs = numeric(performance.now() - startedAt);
      record.processAtFinish = processSnapshot();
      persist('test-finish');
    },
  };
}
