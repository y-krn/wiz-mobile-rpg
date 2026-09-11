import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIRECTORY = path.join(ROOT, ".agents", "skills");

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function diagnostic(filePath, line, message) {
  return { file: toRepoPath(filePath), line, message };
}

function getSkillFiles() {
  if (!fs.existsSync(SKILLS_DIRECTORY)) return [];
  return fs.readdirSync(SKILLS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIRECTORY, entry.name, "SKILL.md"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function checkSkill(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);
  const skillDirectory = path.basename(path.dirname(filePath));
  const diagnostics = [];

  if (lines[0] !== "---") {
    return [diagnostic(filePath, 1, "Skill requires YAML frontmatter")];
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    return [diagnostic(filePath, 1, "Skill frontmatter requires a closing ---")];
  }

  const document = YAML.parseDocument(lines.slice(1, closingIndex).join("\n"), { prettyErrors: true });
  for (const error of document.errors) {
    diagnostics.push(diagnostic(filePath, error.linePos?.[0]?.[0] ?? 1, `YAML syntax: ${error.message}`));
  }
  if (diagnostics.length > 0) return diagnostics;

  const frontmatter = document.toJS();
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    return [diagnostic(filePath, 1, "Skill frontmatter must be a YAML mapping")];
  }
  if (frontmatter.name !== skillDirectory) {
    diagnostics.push(diagnostic(filePath, 1, `Skill name must match directory "${skillDirectory}"`));
  }
  if (typeof frontmatter.description !== "string" || frontmatter.description.trim() === "") {
    diagnostics.push(diagnostic(filePath, 1, "Skill requires a non-empty description"));
  }
  if (lines.slice(closingIndex + 1).join("\n").trim() === "") {
    diagnostics.push(diagnostic(filePath, closingIndex + 2, "Skill requires non-empty content after frontmatter"));
  }
  return diagnostics;
}

const skillFiles = getSkillFiles();
const diagnostics = skillFiles.flatMap(checkSkill);
if (diagnostics.length > 0) {
  for (const item of diagnostics) console.error(`${item.file}:${item.line}: ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(`Skill frontmatter OK (${skillFiles.length} files).`);
}
