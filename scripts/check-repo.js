import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_PACKAGE = "wiz-mobile-rpg";
const REQUIRED_MARKERS = ["package.json", "src", "scripts", "vite.config.js", "playwright.config.js"];

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return { ok: false, value: "", error: (result.stderr || "git command failed").trim() };
  return { ok: true, value: result.stdout.trim(), error: "" };
}

export function evaluateRepo({ cwd, gitRoot, insideWorkTree, packageName, head, markers }) {
  const failures = [];
  if (!insideWorkTree) failures.push("not inside a Git worktree");
  if (gitRoot !== cwd) failures.push(`run from repository root: ${gitRoot || "unknown"}`);
  if (packageName !== EXPECTED_PACKAGE) {
    failures.push(`package name mismatch: expected ${EXPECTED_PACKAGE}, got ${packageName || "missing"}`);
  }
  if (!head) failures.push("HEAD is unavailable");
  for (const marker of REQUIRED_MARKERS) {
    if (!markers.includes(marker)) failures.push(`required marker missing: ${marker}`);
  }
  return { ok: failures.length === 0, failures };
}

export function run({ cwd = process.cwd() } = {}) {
  const absoluteCwd = realpathSync(resolve(cwd));
  const rootResult = git(["rev-parse", "--show-toplevel"], absoluteCwd);
  const gitRoot = rootResult.ok ? realpathSync(rootResult.value) : "";
  const insideResult = git(["rev-parse", "--is-inside-work-tree"], absoluteCwd);
  const headResult = git(["rev-parse", "HEAD"], absoluteCwd);
  const branchResult = git(["branch", "--show-current"], absoluteCwd);
  let packageName = "";
  const markers = [];
  try {
    const packageJson = JSON.parse(readFileSync(resolve(absoluteCwd, "package.json"), "utf8"));
    packageName = packageJson.name ?? "";
  } catch {
    // The evaluator reports the missing package marker and package mismatch.
  }
  for (const marker of REQUIRED_MARKERS) {
    if (existsSync(resolve(absoluteCwd, marker))) markers.push(marker);
  }

  const evaluation = evaluateRepo({
    cwd: absoluteCwd,
    gitRoot,
    insideWorkTree: insideResult.value === "true",
    packageName,
    head: headResult.ok ? headResult.value : "",
    markers
  });
  if (!evaluation.ok) {
    console.error("[repo-preflight] FAIL");
    for (const failure of evaluation.failures) console.error(`- ${failure}`);
    return 1;
  }
  console.log("[repo-preflight] PASS");
  console.log(`root: ${gitRoot}`);
  console.log(`package: ${packageName}`);
  console.log(`branch: ${branchResult.value || "(detached)"}`);
  console.log(`HEAD: ${headResult.value}`);
  return 0;
}

if (process.argv[1]?.endsWith("check-repo.js")) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`[repo-preflight] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
