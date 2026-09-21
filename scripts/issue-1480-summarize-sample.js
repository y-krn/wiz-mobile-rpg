import fs from 'node:fs';
import path from 'node:path';

const evidenceDir = process.env.ISSUE_1480_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('ISSUE_1480_EVIDENCE_DIR is required');

function read(name) {
  try {
    return fs.readFileSync(path.join(evidenceDir, name), 'utf8').trim();
  } catch {
    return '';
  }
}

function readKeyValue(name) {
  return Object.fromEntries(read(name).split('\n').filter(Boolean).map(line => {
    const separator = line.indexOf('=');
    return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

const log = read('browser-test.log');
const timingLines = log.split('\n').filter(line => line.startsWith('ISSUE_1480_TIMING '));
const timing = timingLines.length > 0
  ? JSON.parse(timingLines.at(-1).slice('ISSUE_1480_TIMING '.length))
  : null;
const environment = readKeyValue('environment.txt');
const timingJson = timing ? JSON.stringify(timing, null, 2) : 'null';
fs.writeFileSync(path.join(evidenceDir, 'timing.json'), `${timingJson}\n`);

const phaseLines = (timing?.phases || []).map(phase => `- ${phase.name}: ${phase.durationMs.toFixed(1)} ms`);
const waitLines = (timing?.waits || []).map(wait => `- ${wait.name}: ${wait.durationMs.toFixed(1)} ms`);
const clickLines = (timing?.clicks || []).map(click => (
  `- ${click.name}: click ${click.clickCallMs.toFixed(1)} ms, actionability ${click.actionabilityMs == null ? 'n/a' : `${click.actionabilityMs.toFixed(1)} ms`}, ` +
  `sync handler ${click.synchronousHandlerMs == null ? 'n/a' : `${click.synchronousHandlerMs.toFixed(1)} ms`}, ` +
  `post-dispatch ${click.postDispatchMs == null ? 'n/a' : `${click.postDispatchMs.toFixed(1)} ms`}`
));
const milestoneLines = Object.entries(timing?.browser?.milestones || {})
  .map(([name, timestamp]) => `- ${name}: ${timestamp.toFixed(1)} ms`);

const summary = [
  `# Issue 1480 sample ${process.env.ISSUE_1480_SAMPLE || 'unknown'}`,
  '',
  `- source: ${environment.source || 'unknown'}`,
  `- workflow_sha: ${environment.workflow_sha || 'unknown'}`,
  `- runner: ${environment.runner_name || 'unknown'} / ${environment.image_os || 'unknown'} ${environment.image_version || ''}`,
  `- node: ${read('tool-versions.txt').split('\n')[0] || 'unknown'}`,
  `- worker: ${environment.worker || 'unknown'}`,
  `- outcome: ${timing?.browser?.outcome || process.env.ISSUE_1480_SMOKE_OUTCOME || 'unknown'}`,
  `- target duration: ${timing?.totalWallMs?.toFixed(1) || 'n/a'} ms`,
  '',
  '## Phases',
  ...(phaseLines.length ? phaseLines : ['- unavailable']),
  '',
  '## Click boundaries',
  ...(clickLines.length ? clickLines : ['- unavailable']),
  '',
  '## Assertion and locator waits',
  ...(waitLines.length ? waitLines : ['- unavailable']),
  '',
  '## Browser milestones',
  ...(milestoneLines.length ? milestoneLines : ['- unavailable']),
  '',
  `- max requestAnimationFrame gap: ${timing?.browser?.frames?.maxGap?.toFixed(1) || 'n/a'} ms`,
  `- long tasks: ${timing?.browser?.longTasks?.length ?? 'n/a'}`,
  '',
].join('\n');

fs.writeFileSync(path.join(evidenceDir, 'sample.md'), summary);
console.log(summary);
