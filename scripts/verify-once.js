import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_LEDGER_DIR = "codex-verification";
const TRACKED_ENV = ["NODE_ENV", "PLAYWRIGHT_PORT", "PLAYWRIGHT_WORKERS"];

export const HELP = `Usage: npm run verify:once -- --name NAME [options] -- COMMAND [ARG...]

Run COMMAND once for the current repository evidence target. A successful run
is skipped when NAME, HEAD, changed files, command, and relevant environment
are unchanged.

Options:
  --name NAME       Stable check name, for example lint or browser-smoke
  --ledger PATH     Ledger path (default: temporary repository-scoped ledger)
  --skip-known      Skip only a previously successful identical target
  --force           Run even when the same successful check is recorded
  --help            Show this help`;

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(" ")} failed`).trim());
  }
  return result.stdout.trim();
}

export function parseArgs(argv) {
  const options = { name: null, ledger: null, force: false, skipKnown: false, command: [] };
  let commandStart = -1;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      commandStart = index + 1;
      break;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--skip-known") {
      options.skipKnown = true;
      continue;
    }
    if (argument === "--name" || argument === "--ledger") {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument === "--name" ? "name" : "ledger"] = value;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }
  if (commandStart >= 0) options.command = argv.slice(commandStart);
  if (!options.help && !options.name) throw new Error("--name is required");
  if (!options.help && options.command.length === 0) throw new Error("COMMAND is required after --");
  return options;
}

function parseNullSeparated(output) {
  return output.split("\0").filter(Boolean).sort();
}

function changedFiles(repoRoot) {
  const tracked = parseNullSeparated(git(["diff", "--name-only", "-z", "HEAD"], repoRoot));
  const untracked = parseNullSeparated(git(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot));
  return [...new Set([...tracked, ...untracked])].sort();
}

function digestFile(filePath) {
  return new Promise((resolveDigest, reject) => {
    if (!existsSync(filePath)) {
      resolveDigest("<missing>");
      return;
    }
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveDigest(hash.digest("hex")));
  });
}

export async function createFingerprint({ repoRoot, head, files, command, environment = {} }) {
  const hash = createHash("sha256");
  hash.update(`root\0${repoRoot}\0head\0${head}\0`);
  hash.update(`command\0${JSON.stringify(command)}\0`);
  for (const key of TRACKED_ENV) hash.update(`env:${key}\0${environment[key] ?? ""}\0`);
  for (const file of [...files].sort()) {
    hash.update(`file\0${file}\0`);
    hash.update(await digestFile(resolve(repoRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function defaultLedgerPath(repoRoot) {
  const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
  return join(tmpdir(), DEFAULT_LEDGER_DIR, `${key}.json`);
}

function readLedger(path) {
  if (!existsSync(path)) return { version: 1, checks: {} };
  try {
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    return ledger?.version === 1 && ledger.checks ? ledger : { version: 1, checks: {} };
  } catch {
    return { version: 1, checks: {} };
  }
}

function writeLedger(path, ledger) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function relevantEnvironment() {
  return Object.fromEntries(TRACKED_ENV.map((key) => [key, process.env[key] ?? ""]));
}

export async function run(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  const repoRoot = git(["rev-parse", "--show-toplevel"], cwd);
  const head = git(["rev-parse", "HEAD"], repoRoot);
  const files = changedFiles(repoRoot);
  const environment = relevantEnvironment();
  const fingerprint = await createFingerprint({ repoRoot, head, files, command: options.command, environment });
  const ledgerPath = resolve(options.ledger ?? defaultLedgerPath(repoRoot));
  const ledger = readLedger(ledgerPath);
  const previous = ledger.checks[options.name];
  const sameSuccessfulTarget = previous?.status === 0 && previous.fingerprint === fingerprint;
  if (!options.force && options.skipKnown && sameSuccessfulTarget) {
    console.log(`[verification] SKIP ${options.name}: same successful evidence target`);
    return 0;
  }
  if (!options.force && sameSuccessfulTarget) {
    console.log(`[verification] PRIOR SUCCESS ${options.name}: same target, rerunning by default`);
  }

  console.log(`[verification] RUN ${options.name}`);
  console.log(`[verification] command: ${JSON.stringify(options.command)}`);
  const result = spawnSync(options.command[0], options.command.slice(1), {
    cwd: repoRoot,
    shell: false,
    stdio: "inherit"
  });
  const status = result.error ? 1 : (result.status ?? 1);
  if (status === 0) {
    const afterFiles = changedFiles(repoRoot);
    const afterHead = git(["rev-parse", "HEAD"], repoRoot);
    const afterFingerprint = await createFingerprint({
      repoRoot,
      head: afterHead,
      files: afterFiles,
      command: options.command,
      environment
    });
    ledger.checks[options.name] = {
      status: 0,
      fingerprint: afterFingerprint,
      head: afterHead,
      files: afterFiles,
      command: options.command,
      completedAt: new Date().toISOString()
    };
    writeLedger(ledgerPath, ledger);
    console.log(`[verification] RECORDED ${options.name}: ${afterFiles.length} changed file(s)`);
  } else {
    console.error(`[verification] FAILED ${options.name}: exit ${status}`);
  }
  return status;
}

if (process.argv[1]?.endsWith("verify-once.js")) {
  run().then((status) => {
    process.exitCode = status;
  }).catch((error) => {
    console.error(`[verification] ERROR: ${error.message}`);
    process.exitCode = 2;
  });
}
