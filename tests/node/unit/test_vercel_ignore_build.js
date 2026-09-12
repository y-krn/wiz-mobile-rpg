import assert from "node:assert/strict";

import {
  isVercelBuildNeutralPath,
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

console.log("Vercel ignored-build policy checks passed.");
