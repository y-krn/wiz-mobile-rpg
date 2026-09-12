import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIPPABLE_EXACT_PATHS = new Set([
  "AGENTS.md",
  "README.md",
  "skills-lock.json",
  "playwright.config.js",
]);

const SKIPPABLE_PREFIXES = [
  ".agents/",
  ".codex/",
  ".github/",
  "tests/",
  "evidence/",
  "scratch/",
];

export function isVercelBuildNeutralPath(filePath) {
  return (
    SKIPPABLE_EXACT_PATHS.has(filePath) ||
    SKIPPABLE_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );
}

export function shouldSkipVercelBuild(changedPaths, previousSha) {
  if (!previousSha) return false;
  return changedPaths.every(isVercelBuildNeutralPath);
}

export function readChangedPaths(previousSha, cwd = process.cwd()) {
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", previousSha, "HEAD", "--"],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
    .split(/\r?\n/)
    .filter(Boolean);
}

export function main() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA;

  if (!previousSha) {
    console.log("Vercel build required: VERCEL_GIT_PREVIOUS_SHA is unavailable.");
    return 1;
  }

  try {
    const changedPaths = readChangedPaths(previousSha);
    const shouldSkip = shouldSkipVercelBuild(changedPaths, previousSha);

    if (shouldSkip) {
      console.log(
        `Vercel build skipped: ${changedPaths.length} changed path(s) are deployment-neutral.`,
      );
      return 0;
    }

    const buildRelevantPaths = changedPaths.filter(
      (filePath) => !isVercelBuildNeutralPath(filePath),
    );
    console.log(
      `Vercel build required: ${buildRelevantPaths.join(", ") || "unknown relevant change"}.`,
    );
    return 1;
  } catch (error) {
    console.warn(`Vercel build required: change detection failed (${error.message}).`);
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  process.exitCode = main();
}
