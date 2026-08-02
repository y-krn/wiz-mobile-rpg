// Future documentation checks (#361): add a function returning diagnostics in
// { file, line, message } form, then append it to CHECKS below. Keep each
// check independent so the runner reports every failure before exiting.
// `.learnings/*.md` is intentionally not part of DOCUMENT_NAMES or DOCUMENT_DIRS.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DOCUMENT_NAMES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "README.md"];
const DOCUMENT_DIRS = [".agents"];
const PATH_PREFIXES = ["src", "tests", "scratch", "scripts", "public"];
const ROOT_PATHS = new Set([
  "index.html",
  "package.json",
  "playwright.config.js",
  "eslint.config.js",
  "stylelint.config.js",
  "vite.config.js",
]);
const IGNORE = [
  // Add exact intentionally missing references here.
];
const IGNORE_SET = new Set(IGNORE);
const INLINE_CODE_RE = /`([^`\r\n]+)`/g;
const FENCE_RE = /^\s*(?:>\s*)*(`{3,}|~{3,})/;
const IGNORE_MARKER = "<!-- doc-path-ignore -->";

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function getDocumentPaths() {
  const documents = [];

  for (const name of DOCUMENT_NAMES) {
    const filePath = path.join(ROOT, name);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      documents.push(filePath);
    }
  }

  for (const directory of DOCUMENT_DIRS) {
    const directoryPath = path.join(ROOT, directory);
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) continue;

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      documents.push(path.join(directoryPath, entry.name));
    }
  }

  return documents.sort((left, right) => left.localeCompare(right));
}

function isPathReference(reference) {
  return PATH_PREFIXES.some((prefix) => reference.startsWith(`${prefix}/`)) || ROOT_PATHS.has(reference);
}

function globToRegExp(pattern) {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }

  return new RegExp(`${source}$`);
}

function getGlobBase(pattern) {
  const wildcardIndex = pattern.search(/[?*]/);
  const prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
  const slashIndex = prefix.lastIndexOf("/");
  return slashIndex === -1 ? "." : prefix.slice(0, slashIndex) || ".";
}

function hasGlobMatch(pattern) {
  const base = getGlobBase(pattern);
  const basePath = path.resolve(ROOT, base);
  if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) return false;

  const matcher = globToRegExp(toPosix(pattern));
  const baseReference = toPosix(path.relative(ROOT, basePath));

  function visit(directoryPath, relativeDirectory) {
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (matcher.test(relativePath)) return true;
      if (entry.isDirectory() && visit(path.join(directoryPath, entry.name), relativePath)) return true;
    }
    return false;
  }

  return visit(basePath, baseReference);
}

function pathExists(reference) {
  if (reference.includes("*")) return hasGlobMatch(reference);
  return fs.existsSync(path.resolve(ROOT, reference));
}

function readInlineReferences(filePath) {
  const relativeFile = toPosix(path.relative(ROOT, filePath));
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const diagnostics = [];
  let fenceCharacter = null;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(FENCE_RE);

    if (fence) {
      const marker = fence[1];
      const character = marker[0];
      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = marker.length;
      } else if (character === fenceCharacter && marker.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }

    if (fenceCharacter !== null || line.trimEnd().endsWith(IGNORE_MARKER)) continue;

    for (const match of line.matchAll(INLINE_CODE_RE)) {
      const reference = match[1].trim();
      if (!isPathReference(reference) || IGNORE_SET.has(reference) || pathExists(reference)) continue;
      diagnostics.push({ file: relativeFile, line: index + 1, message: reference });
    }
  }

  return diagnostics;
}

function checkDocPaths() {
  return getDocumentPaths().flatMap(readInlineReferences);
}

const CHECKS = [checkDocPaths];
const diagnostics = CHECKS.flatMap((check) => check());

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    console.error(`${diagnostic.file}:${diagnostic.line} ${diagnostic.message}`);
  }
  process.exit(1);
}
