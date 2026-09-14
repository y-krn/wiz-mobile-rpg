import test from "node:test";
import assert from "node:assert/strict";
import { buildCommand, parseArgs, truncateLines } from "./inspect-bounded.js";

test("parses bounded search options", () => {
  const options = parseArgs(["search", "TODO", "src", "--max-lines", "12", "--max-matches", "7"]);
  assert.equal(options.mode, "search");
  assert.equal(options.maxLines, 12);
  assert.equal(options.maxMatches, 7);
  assert.deepEqual(options.positional, ["TODO", "src"]);
});

test("builds safe search command with generated output excluded", () => {
  const command = buildCommand(parseArgs(["search", "needle", "src"]));
  assert.equal(command.command, "rg");
  assert.ok(command.args.includes("--no-such-option") === false);
  assert.ok(command.args.includes("--fixed-strings"));
  assert.deepEqual(command.args.slice(-2), ["needle", "src"]);
  assert.ok(command.args.includes("!dist/**"));
});

test("requires an explicit opt-in for regular expressions", () => {
  const command = buildCommand(parseArgs(["search", "foo.*bar", "--regex"]));
  assert.equal(command.args.includes("--fixed-strings"), false);
});

test("diff defaults to stat and patch is explicitly bounded by line output", () => {
  assert.ok(buildCommand(parseArgs(["diff"])).args.includes("--stat"));
  assert.ok(buildCommand(parseArgs(["diff", "--patch"])).args.includes("--unified=3"));
  assert.equal(truncateLines("a\nb\nc", 2).hasMore, true);
});
