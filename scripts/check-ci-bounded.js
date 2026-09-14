import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULTS = {
  attempts: 36,
  intervalSeconds: 10,
  maxSeconds: 360
};

const BUCKETS = new Set(["pass", "fail", "pending", "skipping", "cancel"]);

function positiveInteger(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS, target: null, repo: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo" || argument === "-R") {
      options.repo = argv[++index];
      if (!options.repo) throw new Error("--repo requires a value");
    } else if (argument === "--max-attempts") {
      options.attempts = positiveInteger(argv[++index], "--max-attempts", 100);
    } else if (argument === "--interval-seconds") {
      options.intervalSeconds = positiveInteger(argv[++index], "--interval-seconds", 60);
    } else if (argument === "--max-seconds") {
      options.maxSeconds = positiveInteger(argv[++index], "--max-seconds", 1800);
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (options.target === null) {
      options.target = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  return options;
}

function normalizedBucket(check) {
  const bucket = String(check.bucket || "").toLowerCase();
  if (BUCKETS.has(bucket)) return bucket;
  const state = String(check.state || "").toLowerCase();
  if (["success", "completed", "neutral"].includes(state)) return "pass";
  if (["failure", "error"].includes(state)) return "fail";
  if (["cancelled", "canceled"].includes(state)) return "cancel";
  if (["queued", "in_progress", "pending"].includes(state)) return "pending";
  return "unknown";
}

export function summarizeChecks(checks) {
  const buckets = { pass: 0, fail: 0, pending: 0, skipping: 0, cancel: 0, unknown: 0 };
  for (const check of checks) buckets[normalizedBucket(check)] += 1;
  const failures = checks.filter((check) => ["fail", "cancel"].includes(normalizedBucket(check)));
  const pending = checks.filter((check) => ["pending", "unknown"].includes(normalizedBucket(check)));
  const complete = checks.length > 0 && pending.length === 0 && failures.length === 0;
  return { total: checks.length, buckets, failures, pending, complete };
}

function fetchChecks(options) {
  const cliArguments = ["pr", "checks"];
  if (options.target) cliArguments.push(options.target);
  if (options.repo) cliArguments.push("--repo", options.repo);
  cliArguments.push("--required", "--json", "bucket,name,state,workflow,link");
  const result = spawnSync("gh", cliArguments, { encoding: "utf8" });
  if (result.error) return { error: result.error.message };
  const output = result.stdout.trim();
  if (!output) {
    return { error: result.stderr.trim() || "gh returned no required checks" };
  }
  try {
    const checks = JSON.parse(output);
    if (!Array.isArray(checks)) return { error: "gh returned a non-array check result" };
    return { checks };
  } catch {
    return { error: result.stderr.trim() || output.slice(0, 500) };
  }
}

function printCheckNames(prefix, checks) {
  for (const check of checks) {
    const name = check.name || check.workflow || "unnamed check";
    console.log(`${prefix} ${name}`);
  }
}

function sleep(seconds) {
  spawnSync("sleep", [String(seconds)]);
}

function printHelp() {
  console.log("Usage: npm run check:ci -- [PR|URL|BRANCH] [options]");
  console.log("Options: --repo OWNER/REPO --max-attempts N --interval-seconds N --max-seconds N");
  console.log("Exit codes: 0 pass, 1 failed/cancelled, 2 pending timeout, 3 query error");
}

export function run(options) {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const result = fetchChecks(options);
    if (result.error) {
      console.error(`[ci-check] query-error: ${result.error}`);
      return 3;
    }
    const summary = summarizeChecks(result.checks);
    const { buckets } = summary;
    console.log(
      `[ci-check] attempt=${attempt}/${options.attempts} total=${summary.total}`
      + ` pass=${buckets.pass} pending=${buckets.pending}`
      + ` fail=${buckets.fail} cancel=${buckets.cancel} unknown=${buckets.unknown}`
    );
    if (summary.failures.length > 0) {
      printCheckNames("[ci-check] failed:", summary.failures);
      return 1;
    }
    if (summary.complete) {
      console.log("[ci-check] result=pass");
      return 0;
    }
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const remainingSeconds = options.maxSeconds - elapsedSeconds;
    if (attempt === options.attempts || remainingSeconds <= 0) {
      console.error(`[ci-check] result=pending-timeout max_seconds=${options.maxSeconds}`);
      printCheckNames("[ci-check] unresolved:", summary.pending);
      return 2;
    }
    sleep(Math.min(options.intervalSeconds, Math.max(1, Math.ceil(remainingSeconds))));
  }
  return 2;
}

if (process.argv[1] && process.argv[1].endsWith("check-ci-bounded.js")) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    process.exitCode = run(options);
  } catch (error) {
    console.error(`[ci-check] argument-error: ${error.message}`);
    process.exitCode = 3;
  }
}
