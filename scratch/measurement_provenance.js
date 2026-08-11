import { execFileSync, spawnSync } from "node:child_process";

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
  allowStaleTree = process.env.SIM_ALLOW_STALE_TREE === "1"
} = {}) {
  if (fetchOriginMain) gitOutput(["fetch", "origin", "main"], cwd);

  const sourceCommit = gitOutput(["rev-parse", "HEAD"], cwd);
  const ancestorCheck = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "origin/main", "HEAD"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (ancestorCheck.error || ![0, 1].includes(ancestorCheck.status)) {
    const detail = String(ancestorCheck.stderr || "").trim();
    throw new Error(
      `measurement provenance failed: git merge-base --is-ancestor: ${detail || ancestorCheck.error?.message || `exit ${ancestorCheck.status}`}`
    );
  }

  const originMainAncestor = ancestorCheck.status === 0;
  const staleTreeAllowed = !originMainAncestor && allowStaleTree;
  if (!originMainAncestor && !allowStaleTree) {
    throw new Error(
      `Measurement refused before start: HEAD ${sourceCommit} is not a descendant of origin/main. ` +
      "Create a new worktree from origin/main. Set SIM_ALLOW_STALE_TREE=1 only for an intentional stale-tree measurement."
    );
  }

  return Object.freeze({
    sourceCommit,
    originMainAncestor,
    allowStaleTree,
    staleTreeAllowed
  });
}
