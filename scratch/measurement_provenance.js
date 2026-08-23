import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { isMainThread } from "node:worker_threads";

function gitOutput(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const detail = String(error.stderr || "").trim();
    throw new Error(
      `measurement provenance failed: git ${args.join(" ")}: ${detail || error.message}`
    );
  }
}

function gitDiffSha256(baseCommit, runnerCommit, cwd, paths = []) {
  try {
    const diff = execFileSync("git", [
      "diff", "--binary", baseCommit, runnerCommit, "--", ...paths
    ], {
      cwd,
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return createHash("sha256").update(diff).digest("hex");
  } catch (error) {
    const detail = String(error.stderr || "").trim();
    throw new Error(
      `measurement provenance failed: git diff --binary ${baseCommit} ${runnerCommit}: ` +
      `${detail || error.message}`
    );
  }
}

export function resolveMeasurementProvenance({
  cwd = process.cwd(),
  fetchOriginMain = true,
  allowStaleTree = process.env.SIM_ALLOW_STALE_TREE === "1",
  baseRef = null,
  measurementRunnerPaths = []
} = {}) {
  const configuredBaseRef = process.env.SIM_PROVENANCE_BASE_REF || null;
  const configuredBaseCommit = process.env.SIM_PROVENANCE_BASE_COMMIT || null;
  const testFixture = process.env.SIM_PROVENANCE_TEST_FIXTURE || null;
  if ((configuredBaseRef || configuredBaseCommit) && !testFixture && !baseRef) {
    throw new Error(
      "measurement provenance failed: explicit base ref/commit requires an explicit test fixture marker"
    );
  }
  if (testFixture && (!configuredBaseRef || !configuredBaseCommit)) {
    throw new Error(
      "measurement provenance failed: test fixture requires SIM_PROVENANCE_BASE_REF and SIM_PROVENANCE_BASE_COMMIT"
    );
  }
  const resolvedBaseRef = baseRef || (testFixture ? configuredBaseRef : null) || "origin/main";
  const baseRefReason = process.env.SIM_PROVENANCE_BASE_REF_REASON || null;
  if ((testFixture || resolvedBaseRef !== "origin/main") && !baseRefReason) {
    throw new Error(
      `measurement provenance failed: explicit base ref ${resolvedBaseRef} requires SIM_PROVENANCE_BASE_REF_REASON`
    );
  }
  if (fetchOriginMain) gitOutput(["fetch", "origin", "main"], cwd);

  const sourceCommit = gitOutput(["rev-parse", "HEAD"], cwd);
  const baseRefCommit = gitOutput(["rev-parse", "--verify", `${resolvedBaseRef}^{commit}`], cwd);
  const baseCommit = configuredBaseCommit
    ? gitOutput(["rev-parse", "--verify", `${configuredBaseCommit}^{commit}`], cwd)
    : baseRefCommit;
  if (configuredBaseCommit && baseCommit !== baseRefCommit) {
    throw new Error(
      `measurement provenance failed: base ref ${resolvedBaseRef} resolves to ${baseRefCommit}, ` +
      `but explicit base commit resolves to ${baseCommit}`
    );
  }
  const ancestorCheck = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", baseCommit, "HEAD"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (ancestorCheck.error || ![0, 1].includes(ancestorCheck.status)) {
    const detail = String(ancestorCheck.stderr || "").trim();
    throw new Error(
      `measurement provenance failed: git merge-base --is-ancestor ${resolvedBaseRef} HEAD: ` +
      `${detail || ancestorCheck.error?.message || `exit ${ancestorCheck.status}`}`
    );
  }

  const originMainAncestor = ancestorCheck.status === 0;
  const staleTreeAllowed = !originMainAncestor && allowStaleTree;
  if (!originMainAncestor && !allowStaleTree) {
    throw new Error(
      `Measurement refused before start: HEAD ${sourceCommit} is not a descendant of ${resolvedBaseRef} (${baseCommit}). ` +
      "Create a new worktree from origin/main. Set SIM_ALLOW_STALE_TREE=1 only for an intentional stale-tree measurement."
    );
  }

  return Object.freeze({
    gameplaySourceCommit: baseCommit,
    measurementRunnerCommit: sourceCommit,
    measurementRunnerDiffSha256: gitDiffSha256(baseCommit, sourceCommit, cwd, measurementRunnerPaths),
    // Compatibility alias for existing measurement records.
    sourceCommit,
    baseRef: resolvedBaseRef,
    baseCommit,
    baseRefReason,
    testFixture,
    originMainAncestor,
    allowStaleTree,
    staleTreeAllowed
  });
}

// 独立系runner（sim_depth_material_ev.jsをimportしない標準単独実行runner）向けの
// 出自確認エントリポイント。unit test配下（SIM_SKIP_PROVENANCE=1、または
// process.argv[1]がtest_*.js）とworker threadの再importでは実行しない。
export function requireRunnerProvenance(options) {
  const isTestProcess = process.env.SIM_SKIP_PROVENANCE === "1" ||
    basename(process.argv[1] || "").startsWith("test_");
  return isMainThread && !isTestProcess
    ? resolveMeasurementProvenance(options)
    : null;
}
