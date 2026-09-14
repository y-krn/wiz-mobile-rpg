import { closeSync, openSync, readSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULTS = {
  maxBytes: 64 * 1024,
  maxLines: 80,
  maxMatches: 100
};

export const HELP = `Usage: npm run inspect:bounded -- <diff|search|log|file> [arguments] [options]

Modes:
  diff [REF]                  Show bounded stat (use --patch for a bounded patch)
  search PATTERN [PATH...]   Search with bounded matches, excluding generated output
  log [REF]                  Show bounded one-line history
  file PATH                  Show the beginning of one file only

Options:
  --max-lines N              Maximum displayed lines (default: 80)
  --max-bytes N              Maximum command/file bytes (default: 65536)
  --max-matches N            Maximum matches for search (default: 100)
  --patch                    Include a bounded diff patch
  --help                     Show this help

The wrapper never enables binary diff output and never reads a file beyond the byte limit.`;

function positiveInteger(value, name, maximum = 1024 * 1024) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS, mode: null, patch: false, positional: [] };
  let endOptions = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!endOptions && argument === "--") {
      endOptions = true;
      continue;
    }
    if (!endOptions && (argument === "--help" || argument === "-h")) {
      options.help = true;
      continue;
    }
    if (!endOptions && argument === "--patch") {
      options.patch = true;
      continue;
    }
    if (!endOptions && ["--max-lines", "--max-bytes", "--max-matches"].includes(argument)) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      const key = {
        "--max-lines": "maxLines",
        "--max-bytes": "maxBytes",
        "--max-matches": "maxMatches"
      }[argument];
      options[key] = positiveInteger(value, argument);
      continue;
    }
    if (!endOptions && argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    }
    options.positional.push(argument);
  }

  if (options.help) return options;
  options.mode = options.positional.shift() ?? null;
  if (!options.mode) throw new Error("mode is required");
  if (!["diff", "search", "log", "file"].includes(options.mode)) {
    throw new Error(`unknown mode: ${options.mode}`);
  }
  if (options.mode === "diff" || options.mode === "log") {
    if (options.positional.length > 1) throw new Error(`${options.mode} accepts at most one REF`);
  }
  if (options.mode === "file" && options.positional.length !== 1) {
    throw new Error("file requires exactly one PATH");
  }
  if (options.mode === "search" && options.positional.length < 1) {
    throw new Error("search requires PATTERN");
  }
  if (options.mode !== "diff" && options.patch) {
    throw new Error("--patch is valid only with diff");
  }
  return options;
}

export function buildCommand(options) {
  const [first, ...rest] = options.positional;
  if (options.mode === "diff") {
    const args = ["diff", "--no-ext-diff"];
    args.push(options.patch ? `--unified=3` : "--stat");
    if (first) args.push(first);
    return { command: "git", args };
  }
  if (options.mode === "log") {
    const args = ["log", `--max-count=${options.maxLines}`, "--format=%h %ad %d %s", "--date=short"];
    if (first) args.push(first);
    return { command: "git", args };
  }
  if (options.mode === "search") {
    return {
      command: "rg",
      args: [
        "--line-number",
        "--color=never",
        "--max-count",
        String(options.maxMatches),
        "--glob",
        "!dist/**",
        "--glob",
        "!build/**",
        "--glob",
        "!.next/**",
        "--glob",
        "!coverage/**",
        "--",
        first,
        ...(rest.length ? rest : ["."])
      ]
    };
  }
  return null;
}

export function truncateLines(text, maxLines) {
  const lines = text.split(/\r?\n/);
  const hasMore = lines.length > maxLines;
  return {
    text: lines.slice(0, maxLines).join("\n").replace(/\n+$/, ""),
    hasMore
  };
}

export function readBoundedFile(filePath, maxBytes, maxLines, root = process.cwd()) {
  const absolutePath = resolve(root, filePath);
  const relativePath = relative(root, absolutePath);
  if (relativePath.startsWith("..") || relativePath.includes("/../")) {
    throw new Error("file path must remain inside the repository");
  }
  const size = statSync(absolutePath).size;
  const bytesToRead = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(bytesToRead);
  const descriptor = openSync(absolutePath, "r");
  try {
    readSync(descriptor, buffer, 0, bytesToRead, 0);
  } finally {
    closeSync(descriptor);
  }
  const bounded = truncateLines(buffer.toString("utf8"), maxLines);
  return {
    ...bounded,
    truncated: size > maxBytes || bounded.hasMore,
    size,
    bytesRead: bytesToRead
  };
}

function runCommand(command, args, maxBytes) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: maxBytes,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error && result.error.code !== "ENOBUFS") throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    capped: result.error?.code === "ENOBUFS"
  };
}

function printCommandResult(result, maxLines, maxBytes) {
  const bounded = truncateLines(result.stdout, maxLines);
  if (bounded.text) console.log(bounded.text);
  if (result.stderr) {
    const error = truncateLines(result.stderr, 20);
    console.error(error.text);
  }
  if (bounded.hasMore || result.stdout.length > maxBytes || result.capped) {
    console.log(`[bounded-inspect] output capped: ${maxLines} lines / ${maxBytes} bytes`);
  }
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.mode === "file") {
    const result = readBoundedFile(options.positional[0], options.maxBytes, options.maxLines);
    if (result.text) console.log(result.text);
    if (result.truncated) {
      console.log(`[bounded-inspect] file capped: ${result.bytesRead}/${result.size} bytes, ${options.maxLines} lines`);
    }
    return 0;
  }

  const { command, args } = buildCommand(options);
  const result = runCommand(command, args, options.maxBytes);
  if (options.mode === "search" && result.status === 1 && !result.stderr) {
    console.log("No matches.");
    return 0;
  }
  printCommandResult(result, options.maxLines, options.maxBytes);
  return result.status === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("inspect-bounded.js")) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`[bounded-inspect] ${error.message}`);
    console.error("Use --help for usage.");
    process.exitCode = 2;
  }
}
