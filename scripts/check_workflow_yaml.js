import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_DIRECTORY = path.join(ROOT, ".github", "workflows");

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function lineFor(error) {
  return error.linePos?.[0]?.[0] ?? 1;
}

function diagnostic(filePath, line, message) {
  return { file: toRepoPath(filePath), line, message };
}

function getWorkflowFiles() {
  if (!fs.existsSync(WORKFLOW_DIRECTORY)) return [];
  return fs.readdirSync(WORKFLOW_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(WORKFLOW_DIRECTORY, entry.name))
    .sort();
}

function checkWorkflow(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const document = YAML.parseDocument(source, { prettyErrors: true });
  const diagnostics = document.errors.map((error) => diagnostic(filePath, lineFor(error), `YAML syntax: ${error.message}`));
  if (diagnostics.length > 0) return diagnostics;

  const workflow = document.toJS();
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return [diagnostic(filePath, 1, "workflow must be a YAML mapping")];
  }

  if (typeof workflow.name !== "string" || workflow.name.trim() === "") {
    diagnostics.push(diagnostic(filePath, 1, "workflow requires a non-empty name"));
  }
  if (!("on" in workflow)) {
    diagnostics.push(diagnostic(filePath, 1, "workflow requires an on trigger"));
  }
  if (!workflow.jobs || typeof workflow.jobs !== "object" || Array.isArray(workflow.jobs) || Object.keys(workflow.jobs).length === 0) {
    diagnostics.push(diagnostic(filePath, 1, "workflow requires a non-empty jobs mapping"));
    return diagnostics;
  }

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      diagnostics.push(diagnostic(filePath, 1, `job "${jobId}" must be a mapping`));
      continue;
    }

    if (typeof job.uses === "string") continue;
    if (typeof job["runs-on"] !== "string" || job["runs-on"].trim() === "") {
      diagnostics.push(diagnostic(filePath, 1, `job "${jobId}" requires runs-on or uses`));
    }
    if (!Array.isArray(job.steps)) {
      diagnostics.push(diagnostic(filePath, 1, `job "${jobId}" requires a steps array`));
      continue;
    }

    job.steps.forEach((step, index) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) {
        diagnostics.push(diagnostic(filePath, 1, `job "${jobId}" step ${index + 1} must be a mapping`));
        return;
      }
      const hasRun = typeof step.run === "string" && step.run.trim() !== "";
      const hasUses = typeof step.uses === "string" && step.uses.trim() !== "";
      if (hasRun === hasUses) {
        diagnostics.push(diagnostic(filePath, 1, `job "${jobId}" step ${index + 1} requires exactly one non-empty run or uses`));
      }
    });
  }

  return diagnostics;
}

const diagnostics = getWorkflowFiles().flatMap(checkWorkflow);
if (diagnostics.length > 0) {
  for (const item of diagnostics) console.error(`${item.file}:${item.line}: ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(`Workflow YAML OK (${getWorkflowFiles().length} files).`);
}
