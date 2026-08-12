import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = path.join(repoRoot, ".claude/hooks/session-brief.sh");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wiz-546-hook-"));

function git(repoDir, ...args) {
  execFileSync("git", args, { cwd: repoDir, stdio: "ignore" });
}

function runHook(projectDir, npmLog, fakeBin) {
  const result = spawnSync(hookPath, [], {
    cwd: projectDir,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      WIZ_546_NPM_LOG: npmLog,
    },
    input: "",
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

try {
  const repoDir = path.join(tempRoot, "repo");
  const emptyWorktree = path.join(tempRoot, "empty-worktree");
  const linkedWorktree = path.join(tempRoot, "linked-worktree");
  const brokenWorktree = path.join(tempRoot, "broken-worktree");
  const fakeBin = path.join(tempRoot, "bin");
  const npmLog = path.join(tempRoot, "npm.log");
  const source = path.join(repoDir, "node_modules");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(repoDir, "README"), "hook test\n");
  fs.writeFileSync(path.join(fakeBin, "npm"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$PWD\" >> \"$WIZ_546_NPM_LOG\"\nmkdir -p \"$PWD/node_modules\"\ntouch \"$PWD/node_modules/.package-lock.json\"\n");
  fs.chmodSync(path.join(fakeBin, "npm"), 0o755);
  fs.writeFileSync(npmLog, "");

  git(repoDir, "init", "-q");
  git(repoDir, "config", "user.email", "wiz-546@example.invalid");
  git(repoDir, "config", "user.name", "wiz-546-test");
  git(repoDir, "add", "README");
  git(repoDir, "commit", "-qm", "init");
  fs.mkdirSync(source);

  git(repoDir, "worktree", "add", "-q", "-b", "hook-empty", emptyWorktree);
  fs.writeFileSync(path.join(emptyWorktree, "package-lock.json"), "{}\n");
  fs.symlinkSync(source, path.join(emptyWorktree, "node_modules"), "dir");
  const emptyOutput = runHook(emptyWorktree, npmLog, fakeBin);
  assert.equal(fs.lstatSync(path.join(emptyWorktree, "node_modules")).isSymbolicLink(), false);
  assert.ok(fs.existsSync(path.join(emptyWorktree, "node_modules/.package-lock.json")));
  assert.match(emptyOutput, /node_modules parent unusable; running npm ci/);
  assert.match(emptyOutput, /node_modules parent entries: 0/);
  assert.equal(fs.readFileSync(npmLog, "utf8").trim().split("\n").length, 1);

  fs.writeFileSync(path.join(source, ".package-lock.json"), "{}\n");
  git(repoDir, "worktree", "add", "-q", "-b", "hook-linked", linkedWorktree);
  fs.writeFileSync(path.join(linkedWorktree, "package-lock.json"), "{}\n");
  const linkedOutput = runHook(linkedWorktree, npmLog, fakeBin);
  assert.equal(fs.lstatSync(path.join(linkedWorktree, "node_modules")).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(linkedWorktree, "node_modules")), fs.realpathSync(source));
  assert.match(linkedOutput, /node_modules parent entries: 1/);
  assert.equal(fs.readFileSync(npmLog, "utf8").trim().split("\n").length, 1);

  git(repoDir, "worktree", "add", "-q", "-b", "hook-broken", brokenWorktree);
  fs.writeFileSync(path.join(brokenWorktree, "package-lock.json"), "{}\n");
  fs.symlinkSync(path.join(tempRoot, "missing-node-modules"), path.join(brokenWorktree, "node_modules"), "dir");
  const brokenOutput = runHook(brokenWorktree, npmLog, fakeBin);
  assert.equal(fs.lstatSync(path.join(brokenWorktree, "node_modules")).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(brokenWorktree, "node_modules")), fs.realpathSync(source));
  assert.match(brokenOutput, /node_modules parent entries: 1/);
  assert.equal(fs.readFileSync(npmLog, "utf8").trim().split("\n").length, 1);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
