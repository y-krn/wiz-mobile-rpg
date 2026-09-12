import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  isVercelBuildNeutralPath,
  readChangedPaths,
  shouldSkipVercelBuild,
} from "../../../scripts/vercel-ignore-build.js";

const previousSha = "0123456789abcdef";

const neutralPaths = [
  ".agents/file-map.md",
  ".codex/environment.toml",
  ".github/workflows/ci.yml",
  "AGENTS.md",
  "README.md",
  "skills-lock.json",
  "playwright.config.js",
  "tests/node/unit/test_example.js",
  "evidence/results/example.md",
  "scratch/measurements/example.js",
];

for (const filePath of neutralPaths) {
  assert.equal(
    isVercelBuildNeutralPath(filePath),
    true,
    `${filePath} should be deployment-neutral`,
  );
}

const buildRelevantPaths = [
  "src/main.js",
  "public/icon.png",
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "vercel.json",
  ".vercelignore",
  "scripts/build-assets.js",
  "future-build-input.txt",
];

for (const filePath of buildRelevantPaths) {
  assert.equal(
    isVercelBuildNeutralPath(filePath),
    false,
    `${filePath} should require a Vercel build`,
  );
}

assert.equal(
  shouldSkipVercelBuild(neutralPaths, previousSha),
  true,
  "neutral-only changes should skip the Vercel build",
);
assert.equal(
  shouldSkipVercelBuild([...neutralPaths, "src/main.js"], previousSha),
  false,
  "mixed changes should require the Vercel build",
);
assert.equal(
  shouldSkipVercelBuild(neutralPaths, undefined),
  false,
  "missing previous SHA should fail open and require the Vercel build",
);
assert.equal(
  shouldSkipVercelBuild([], previousSha),
  true,
  "an empty diff against the previous successful deployment can be skipped",
);

const renameRepo = mkdtempSync(path.join(os.tmpdir(), "vercel-ignore-build-"));
try {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: renameRepo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  git(["init"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Vercel Ignore Test"]);
  mkdirSync(path.join(renameRepo, "src"));
  writeFileSync(path.join(renameRepo, "src", "app.js"), "export const app = true;\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);
  const baseSha = git(["rev-parse", "HEAD"]);

  mkdirSync(path.join(renameRepo, "tests"));
  git(["mv", "src/app.js", "tests/app.js"]);
  git(["commit", "-m", "move production file into tests"]);

  const renamePaths = readChangedPaths(baseSha, renameRepo);
  assert.deepEqual(
    new Set(renamePaths),
    new Set(["src/app.js", "tests/app.js"]),
    "rename detection must expose both the build-relevant source and neutral destination",
  );
  assert.equal(
    shouldSkipVercelBuild(renamePaths, baseSha),
    false,
    "moving a production input into a neutral directory must still require a build",
  );
} finally {
  rmSync(renameRepo, { recursive: true, force: true });
}

console.log("Vercel ignored-build policy checks passed.");
