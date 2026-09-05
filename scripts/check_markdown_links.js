import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "test-results", "playwright-report", "output"]);
const LINK_RE = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/g;

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function isWithinRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function findMarkdownFiles(directoryPath = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...findMarkdownFiles(path.join(directoryPath, entry.name)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(directoryPath, entry.name));
  }
  return files.sort();
}

function withoutCodeFences(source) {
  const lines = source.split(/\r?\n/);
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : line;
  }).join("\n");
}

function isExternal(destination) {
  return destination === "" || destination.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith("//");
}

function checkMarkdown(filePath) {
  const source = withoutCodeFences(fs.readFileSync(filePath, "utf8"));
  const diagnostics = [];
  for (const match of source.matchAll(LINK_RE)) {
    const rawDestination = match[1].replace(/^<|>$/g, "");
    const destination = rawDestination.split("#", 1)[0].split("?", 1)[0];
    if (isExternal(destination)) continue;

    let decoded;
    try {
      decoded = decodeURIComponent(destination);
    } catch {
      decoded = destination;
    }
    const fileRelativeTarget = path.resolve(path.dirname(filePath), decoded);
    // Evidence reports historically use repository-root-relative destinations
    // without a leading slash. Prefer normal Markdown file-relative links,
    // then accept that repository convention when the root target exists.
    const targets = [fileRelativeTarget, path.resolve(ROOT, decoded)];
    if (targets.some((target) => isWithinRoot(target) && fs.existsSync(target))) continue;
    const line = source.slice(0, match.index).split("\n").length;
    diagnostics.push({ file: toRepoPath(filePath), line, message: rawDestination });
  }
  return diagnostics;
}

const diagnostics = findMarkdownFiles().flatMap(checkMarkdown);
if (diagnostics.length > 0) {
  for (const item of diagnostics) console.error(`${item.file}:${item.line}: broken relative link ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(`Markdown links OK (${findMarkdownFiles().length} files).`);
}
