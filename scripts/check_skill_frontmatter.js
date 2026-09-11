import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIRECTORY = path.join(ROOT, ".agents", "skills");
const ALLOWED_FRONTMATTER_KEYS = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
const MAX_SKILL_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function diagnostic(filePath, line, message) {
  return { file: toRepoPath(filePath), line, message };
}

function getSkillDirectories() {
  if (!fs.existsSync(SKILLS_DIRECTORY)) return [];
  return fs.readdirSync(SKILLS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIRECTORY, entry.name))
    .sort();
}

function hasUnfinishedTodo(body) {
  let fenceCharacter = null;
  let fenceLength = 0;

  for (const line of body.split(/\r?\n/)) {
    const fence = line.match(/^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const marker = fence[1];
      if (fenceCharacter === null) {
        fenceCharacter = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceCharacter && marker.length >= fenceLength && !fence[2].trim()) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter === null && /^[ ]{0,3}\[TODO:[^\n]*\][ \t]*$/.test(line)) return true;
  }
  return false;
}

export function checkSkillSource(filePath, source) {
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

  const unexpectedKeys = Object.keys(frontmatter).filter((key) => !ALLOWED_FRONTMATTER_KEYS.has(key));
  if (unexpectedKeys.length > 0) {
    diagnostics.push(diagnostic(filePath, 1, `Unexpected frontmatter key(s): ${unexpectedKeys.join(", ")}`));
  }
  if (!("name" in frontmatter)) {
    diagnostics.push(diagnostic(filePath, 1, "Skill frontmatter requires name"));
  } else if (typeof frontmatter.name !== "string") {
    diagnostics.push(diagnostic(filePath, 1, "Skill name must be a string"));
  } else {
    const name = frontmatter.name.trim();
    if (!SKILL_NAME_PATTERN.test(name)) {
      diagnostics.push(diagnostic(filePath, 1, "Skill name must use lowercase letters, digits, and single hyphens"));
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      diagnostics.push(diagnostic(filePath, 1, "Skill name cannot start/end with hyphen or contain consecutive hyphens"));
    }
    if (name.length > MAX_SKILL_NAME_LENGTH) {
      diagnostics.push(diagnostic(filePath, 1, `Skill name exceeds ${MAX_SKILL_NAME_LENGTH} characters`));
    }
    if (name !== skillDirectory) {
      diagnostics.push(diagnostic(filePath, 1, `Skill name must match directory "${skillDirectory}"`));
    }
  }
  if (!("description" in frontmatter)) {
    diagnostics.push(diagnostic(filePath, 1, "Skill frontmatter requires description"));
  } else if (typeof frontmatter.description !== "string") {
    diagnostics.push(diagnostic(filePath, 1, "Skill description must be a string"));
  } else {
    const description = frontmatter.description.trim();
    if (description === "") diagnostics.push(diagnostic(filePath, 1, "Skill requires a non-empty description"));
    if (description.startsWith("[TODO:")) diagnostics.push(diagnostic(filePath, 1, "Skill description contains an unfinished TODO placeholder"));
    if (description.includes("<") || description.includes(">")) diagnostics.push(diagnostic(filePath, 1, "Skill description cannot contain angle brackets"));
    if (description.length > MAX_DESCRIPTION_LENGTH) diagnostics.push(diagnostic(filePath, 1, `Skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters`));
  }
  const body = lines.slice(closingIndex + 1).join("\n");
  if (body.trim() === "") {
    diagnostics.push(diagnostic(filePath, closingIndex + 2, "Skill requires non-empty content after frontmatter"));
  }
  if (hasUnfinishedTodo(body)) diagnostics.push(diagnostic(filePath, closingIndex + 2, "Skill instructions contain an unfinished TODO placeholder"));
  return diagnostics;
}

export function checkSkillDirectory(directoryPath) {
  const filePath = path.join(directoryPath, "SKILL.md");
  if (!fs.existsSync(filePath)) return [diagnostic(filePath, 1, "Skill directory requires SKILL.md")];
  return checkSkillSource(filePath, fs.readFileSync(filePath, "utf8"));
}

export function findSkillFailures() {
  return getSkillDirectories().flatMap(checkSkillDirectory);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  const skillDirectories = getSkillDirectories();
  const diagnostics = skillDirectories.flatMap(checkSkillDirectory);
  if (diagnostics.length > 0) {
    for (const item of diagnostics) console.error(`${item.file}:${item.line}: ${item.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Skill frontmatter OK (${skillDirectories.length} directories).`);
  }
}
