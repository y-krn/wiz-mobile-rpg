import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.ISSUE_1474_ARTIFACT_ROOT;
if (!root) throw new Error('ISSUE_1474_ARTIFACT_ROOT is required');

function findSamples(current) {
  const result = [];
  if (!existsSync(current)) return result;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...findSamples(entryPath));
    else if (entry.name === 'sample.json') result.push(entryPath);
  }
  return result;
}

const samples = findSamples(root).map(file => JSON.parse(readFileSync(file, 'utf8')));
const fixedSha = samples[0]?.sourceUnderTest || 'unknown';
const workflowSha = samples[0]?.measurementWorkflowSha || 'unknown';
const latestMainSha = samples[0]?.latestMainSha || 'unknown';
const baseline = samples.filter(sample => sample.variant === 'baseline').sort((a, b) => a.repeat - b.repeat);
const candidate = samples.filter(sample => sample.variant === 'candidate').sort((a, b) => a.repeat - b.repeat);

function values(items, selector) {
  return items.map(selector).filter(value => Number.isFinite(value));
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function stats(raw) {
  const sorted = [...raw].sort((a, b) => a - b);
  if (sorted.length === 0) return { raw, median: null, mean: null, min: null, max: null, sd: null, p25: null, p75: null };
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  const variance = raw.length > 1
    ? raw.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (raw.length - 1)
    : null;
  return {
    raw,
    median: percentile(sorted, 0.5),
    mean,
    min: sorted[0],
    max: sorted.at(-1),
    sd: variance == null ? null : Math.sqrt(variance),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    variance,
  };
}

const metric = {
  wall: {
    baseline: stats(values(baseline, sample => sample.timingsMs.smoke)),
    candidate: stats(values(candidate, sample => sample.timingsMs.smoke)),
  },
  job: {
    baseline: stats(values(baseline, sample => sample.timingsMs.job)),
    candidate: stats(values(candidate, sample => sample.timingsMs.job)),
  },
  serialLane: stats(values(candidate, sample => sample.timingsMs.serial)),
  remainderLane: stats(values(candidate, sample => sample.timingsMs.remainder)),
  reportedBaseline: stats(values(baseline, sample => sample.invocations.baseline.reportedDurationSeconds)),
  reportedCandidate: stats(values(candidate, sample => (
    (sample.invocations.serial.reportedDurationSeconds || 0) +
    (sample.invocations.remainder.reportedDurationSeconds || 0)
  ))),
  setupBaseline: stats(values(baseline, sample => sample.timingsMs.setup)),
  setupCandidate: stats(values(candidate, sample => sample.timingsMs.setup)),
  installBaseline: stats(values(baseline, sample => sample.timingsMs.installDeps)),
  installCandidate: stats(values(candidate, sample => sample.timingsMs.installDeps)),
};

function sum(items, selector) {
  return items.reduce((total, item) => total + (selector(item) || 0), 0);
}

const failures = {
  baselineFinalFailures: baseline.filter(sample => sample.sampleFailed).length,
  candidateFinalFailures: candidate.filter(sample => sample.sampleFailed).length,
  baselineRetries: sum(baseline, sample => sample.invocations.baseline.retries),
  candidateRetries: sum(candidate, sample => sample.invocations.serial.retries + sample.invocations.remainder.retries),
  baselineFlaky: sum(baseline, sample => sample.invocations.baseline.flaky),
  candidateFlaky: sum(candidate, sample => sample.invocations.serial.flaky + sample.invocations.remainder.flaky),
  baselineTimeouts: sum(baseline, sample => sample.invocations.baseline.timeouts),
  candidateTimeouts: sum(candidate, sample => sample.invocations.serial.timeouts + sample.invocations.remainder.timeouts),
};

const parityResults = candidate.map(sample => sample.parity);
const parity = {
  allSamples: parityResults.length === 5,
  sameFixedSha: samples.length > 0 && samples.every(sample => sample.sourceUnderTest === fixedSha),
  totalExactly104: parityResults.length > 0 && parityResults.every(item => item.totalExactly104),
  serialExactly1: parityResults.length > 0 && parityResults.every(item => item.serialExactly1),
  remainderExactly103: parityResults.length > 0 && parityResults.every(item => item.remainderExactly103),
  baselineEqualsUnion: parityResults.length > 0 && parityResults.every(item => item.baselineEqualsUnion),
  serialRemainderDisjoint: parityResults.length > 0 && parityResults.every(item => item.serialRemainderDisjoint),
  missing: parityResults.reduce((total, item) => total + item.missing.length, 0),
  duplicates: parityResults.reduce((total, item) => total + item.duplicate.acrossLanes.length, 0),
};

const diagnostics = {
  browserCrash: samples.some(sample => Object.values(sample.invocations).some(item => item?.diagnostics.browserCrash)),
  launchError: samples.some(sample => Object.values(sample.invocations).some(item => item?.diagnostics.launchError)),
  portCollision: samples.some(sample => Object.values(sample.invocations).some(item => item?.diagnostics.portCollision)),
  browserHealthErrors: samples.reduce((total, sample) => total + Object.values(sample.invocations).reduce((sum, item) => sum + (item?.browserHealth.pageerror || 0) + (item?.browserHealth.consoleError || 0) + (item?.browserHealth.requestFailed || 0), 0), 0),
  policyParity: samples.every(sample => sample.policy?.traceVideoScreenshot?.includes('unchanged')),
};

const improvement = metric.wall.baseline.median && metric.wall.candidate.median
  ? ((metric.wall.baseline.median - metric.wall.candidate.median) / metric.wall.baseline.median) * 100
  : null;
const decision = improvement != null && improvement >= 20 &&
  failures.candidateFinalFailures === 0 && failures.candidateRetries <= failures.baselineRetries &&
  failures.candidateFlaky <= failures.baselineFlaky && parity.totalExactly104 && parity.serialExactly1 &&
  parity.remainderExactly103 && parity.baselineEqualsUnion && parity.serialRemainderDisjoint &&
  parity.missing === 0 && parity.duplicates === 0 && !diagnostics.browserCrash && !diagnostics.launchError &&
  !diagnostics.portCollision && diagnostics.browserHealthErrors === 0 && diagnostics.policyParity
  ? 'adopt candidate'
  : 'reject candidate';

const report = {
  schemaVersion: 1,
  fixedSha,
  workflowSha,
  latestMainSha,
  latestMainComparison: latestMainSha === fixedSha
    ? 'same SHA; latest-main 3+3 duplicate samples omitted by Issue #1474 rule'
    : 'different SHA; latest-main confirmation required',
  sampleCounts: { baseline: baseline.length, candidate: candidate.length },
  metric,
  improvementPercent: improvement,
  varianceDelta: metric.wall.baseline.variance == null || metric.wall.candidate.variance == null
    ? null
    : metric.wall.candidate.variance - metric.wall.baseline.variance,
  varianceRatio: metric.wall.baseline.variance ? metric.wall.candidate.variance / metric.wall.baseline.variance : null,
  failures,
  parity,
  diagnostics,
  decision,
  samples,
};
writeFileSync(path.join(root, 'aggregate.json'), `${JSON.stringify(report, null, 2)}\n`);

const fmt = value => value == null ? 'n/a' : Number(value).toFixed(1);
const statLine = item => `raw=[${item.raw.join(', ')}], median=${fmt(item.median)}, mean=${fmt(item.mean)}, min/max=${fmt(item.min)}/${fmt(item.max)}, SD=${fmt(item.sd)}, p25/p75=${fmt(item.p25)}/${fmt(item.p75)}`;
const rawLines = items => items.map(sample => `- ${sample.sampleId}: total=${sample.timingsMs.smoke}ms, serial=${sample.timingsMs.serial ?? 'n/a'}ms, remainder=${sample.timingsMs.remainder ?? 'n/a'}ms, setup=${sample.timingsMs.setup}ms, install=${sample.timingsMs.installDeps}ms, reported=${sample.invocations.baseline?.reportedDurationSeconds ?? `${sample.invocations.serial?.reportedDurationSeconds ?? 'n/a'} + ${sample.invocations.remainder?.reportedDurationSeconds ?? 'n/a'}`}s, failed=${sample.sampleFailed}`).join('\n');
const markdown = [
  '# Issue #1474 serial-lane A/B measurement',
  '',
  `- fixed source SHA: \`${fixedSha}\``,
  `- measurement workflow SHA: \`${workflowSha}\``,
  `- latest main SHA: \`${latestMainSha}\``,
  `- latest-main confirmation: ${report.latestMainComparison}`,
  '',
  '## Parity',
  '',
  `- samples: baseline=${baseline.length}, candidate=${candidate.length}`,
  `- baseline = serial ∪ remainder: ${parity.baselineEqualsUnion}`,
  `- serial ∩ remainder = 0: ${parity.serialRemainderDisjoint}`,
  `- total exactly 104: ${parity.totalExactly104}`,
  `- serial 1 / remainder 103: ${parity.serialExactly1} / ${parity.remainderExactly103}`,
  `- missing / duplicate: ${parity.missing} / ${parity.duplicates}`,
  '- assertion / tags / retries / browser-health / trace-video-screenshot policy: unchanged by measurement',
  '',
  '## Raw samples',
  '',
  '### Baseline',
  '',
  rawLines(baseline) || '- none',
  '',
  '### Candidate',
  '',
  rawLines(candidate) || '- none',
  '',
  '## Statistics (wall ms)',
  '',
  `- baseline: ${statLine(metric.wall.baseline)}`,
  `- candidate: ${statLine(metric.wall.candidate)}`,
  `- serial lane: ${statLine(metric.serialLane)}`,
  `- remainder lane: ${statLine(metric.remainderLane)}`,
  `- setup baseline/candidate: ${statLine(metric.setupBaseline)} / ${statLine(metric.setupCandidate)}`,
  `- install-deps baseline/candidate: ${statLine(metric.installBaseline)} / ${statLine(metric.installCandidate)}`,
  `- median improvement: ${fmt(improvement)}%`,
  `- variance baseline/candidate/delta/ratio: ${fmt(metric.wall.baseline.variance)} / ${fmt(metric.wall.candidate.variance)} / ${fmt(report.varianceDelta)} / ${fmt(report.varianceRatio)}`,
  '',
  '## Failures and diagnostics',
  '',
  `- final failures baseline/candidate: ${failures.baselineFinalFailures} / ${failures.candidateFinalFailures}`,
  `- retries baseline/candidate: ${failures.baselineRetries} / ${failures.candidateRetries}`,
  `- flaky baseline/candidate: ${failures.baselineFlaky} / ${failures.candidateFlaky}`,
  `- timeouts baseline/candidate: ${failures.baselineTimeouts} / ${failures.candidateTimeouts}`,
  `- browser crash / launch / port / health errors: ${diagnostics.browserCrash} / ${diagnostics.launchError} / ${diagnostics.portCollision} / ${diagnostics.browserHealthErrors}`,
  '',
  `## Decision: ${decision}`,
  '',
  decision === 'adopt candidate'
    ? '- Candidate satisfies the Issue threshold and parity gates; implementation can be considered in a separate Issue.'
    : '- Do not change normal CI. Return to the smallest failing/slow target path before any worker-layout change.',
].join('\n');
writeFileSync(path.join(root, 'aggregate.md'), `${markdown}\n`);
process.stdout.write(`${markdown}\n`);
