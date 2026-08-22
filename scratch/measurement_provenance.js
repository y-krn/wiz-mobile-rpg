import { execFileSync, spawnSync } from "node:child_process";
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

export function resolveMeasurementProvenance({
  cwd = process.cwd(),
  fetchOriginMain = true,
  allowStaleTree = process.env.SIM_ALLOW_STALE_TREE === "1",
  baseRef = null
} = {}) {
  const configuredBaseRef = process.env.SIM_PROVENANCE_BASE_REF || null;
  const testFixture = process.env.SIM_PROVENANCE_TEST_FIXTURE || null;
  if (configuredBaseRef && !testFixture && !baseRef) {
    throw new Error(
      "measurement provenance failed: SIM_PROVENANCE_BASE_REF requires an explicit test fixture marker"
    );
  }
  const resolvedBaseRef = baseRef || (testFixture ? configuredBaseRef : null) || "origin/main";
  const baseRefReason = process.env.SIM_PROVENANCE_BASE_REF_REASON || null;
  if (resolvedBaseRef !== "origin/main" && !baseRefReason) {
    throw new Error(
      `measurement provenance failed: explicit base ref ${resolvedBaseRef} requires SIM_PROVENANCE_BASE_REF_REASON`
    );
  }
  if (fetchOriginMain) gitOutput(["fetch", "origin", "main"], cwd);

  const sourceCommit = gitOutput(["rev-parse", "HEAD"], cwd);
  const baseCommit = gitOutput(["rev-parse", "--verify", `${resolvedBaseRef}^{commit}`], cwd);
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
