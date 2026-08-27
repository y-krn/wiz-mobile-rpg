// sim-scope: report — identifies uncovered production paths for open Issue #595; retained until that Issue closes.
// Usage: node scratch/measurements/coverage_report_595.js <coverage-dir> [sim-log] [output.md]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_DIRS = [
  "src/rules",
  "src/systems",
  "src/combat_logic",
  "src/constants"
];
const TRAP_TYPES = Object.freeze({
  DAMAGE: "damage",
  MP_DRAIN: "mpDrain",
  ALARM: "alarm",
  PITFALL: "pitfall"
});

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const separator = arg.indexOf("=");
    if (separator >= 0) {
      options[arg.slice(2, separator)] = arg.slice(separator + 1);
    } else {
      options[arg.slice(2)] = argv[++index];
    }
  }
  return {
    coverageDir: positional[0],
    simLog: positional[1] || null,
    output: positional[2] || null,
    ...options
  };
}

function walkJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }
  return files;
}

function relativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function sourceLine(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function pathFromCoverageUrl(url) {
  if (!url) return null;
  try {
    if (url.startsWith("file:")) return fileURLToPath(url);
  } catch {
    return null;
  }
  return url;
}

function resolveTargetRelativePath(url, targetFilesByRelative) {
  const coveragePath = pathFromCoverageUrl(url);
  if (!coveragePath) return null;
  const absolutePath = path.resolve(coveragePath.split("?")[0]);
  const direct = relativePath(absolutePath);
  if (targetFilesByRelative.has(direct)) return direct;

  const normalized = absolutePath.split(path.sep).join("/");
  return [...targetFilesByRelative.keys()].find(candidate =>
    normalized.endsWith(`/${candidate}`)
  ) || null;
}

function parseFunctionNodes(source) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    range: true,
    loc: true
  });
  const functions = [];
  const functionTypes = new Set([
    "ArrowFunctionExpression",
    "FunctionDeclaration",
    "FunctionExpression"
  ]);

  const propertyName = node => {
    if (!node) return null;
    if (node.type === "Identifier") return node.name;
    if (node.type === "Literal") return String(node.value);
    return null;
  };

  const inferName = (node, parent) => {
    if (node.id?.name) return node.id.name;
    if (parent?.type === "VariableDeclarator" && parent.init === node) {
      return propertyName(parent.id);
    }
    if (parent?.type === "Property" && parent.value === node) {
      return propertyName(parent.key);
    }
    if (parent?.type === "MethodDefinition" && parent.value === node) {
      return propertyName(parent.key);
    }
    return "<anonymous>";
  };

  const visit = (node, parent = null) => {
    if (!node || typeof node !== "object") return;
    if (functionTypes.has(node.type)) {
      functions.push({
        name: inferName(node, parent),
        startOffset: node.range[0],
        line: node.loc.start.line,
        count: 0
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue;
      if (Array.isArray(value)) {
        value.forEach(child => visit(child, node));
      } else {
        visit(value, node);
      }
    }
  };

  visit(ast);
  return functions;
}

function readCoverageFiles(coverageDir) {
  return walkJsonFiles(coverageDir).map(filePath => ({
    filePath,
    payload: JSON.parse(fs.readFileSync(filePath, "utf8"))
  }));
}

function walkJsonFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

function aggregateCoverage(coverageFiles, targetFilesByRelative) {
  const byFile = new Map();
  let blockCoverageScripts = 0;
  let targetCoverageScripts = 0;

  for (const { payload } of coverageFiles) {
    for (const script of payload.result || []) {
      const relative = resolveTargetRelativePath(script.url, targetFilesByRelative);
      if (!relative) continue;
      targetCoverageScripts++;
      const functions = byFile.get(relative) || new Map();
      for (const functionCoverage of script.functions || []) {
        if (functionCoverage.isBlockCoverage) blockCoverageScripts++;
        const rootRange = functionCoverage.ranges?.[0];
        if (!rootRange || rootRange.startOffset === 0) continue;
        const key = `${rootRange.startOffset}:${rootRange.endOffset}`;
        const current = functions.get(key) || {
          name: functionCoverage.functionName || "<anonymous>",
          startOffset: rootRange.startOffset,
          endOffset: rootRange.endOffset,
          count: 0,
          ranges: new Map()
        };
        current.count += rootRange.count;
        for (const range of functionCoverage.ranges) {
          const rangeKey = `${range.startOffset}:${range.endOffset}`;
          current.ranges.set(
            rangeKey,
            (current.ranges.get(rangeKey) || 0) + range.count
          );
        }
        functions.set(key, current);
      }
      byFile.set(relative, functions);
    }
  }

  return { byFile, blockCoverageScripts, targetCoverageScripts };
}

function getFileFunctions(relative, source, coverageFunctions) {
  if (coverageFunctions) {
    return [...coverageFunctions.values()]
      .map(functionCoverage => ({
        name: functionCoverage.name,
        startOffset: functionCoverage.startOffset,
        line: sourceLine(source, functionCoverage.startOffset),
        count: functionCoverage.count
      }))
      .sort((left, right) => left.startOffset - right.startOffset);
  }

  try {
    return parseFunctionNodes(source);
  } catch (error) {
    return [{
      name: `<parse error: ${error.message}>`,
      startOffset: 0,
      line: 1,
      count: 0
    }];
  }
}

function findTrapBranches(source) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    range: true,
    loc: true
  });
  const branches = new Map();
  const visit = (node, insideResolver = false) => {
    if (!node || typeof node !== "object") return;
    const isResolver = node.type === "FunctionDeclaration" &&
      node.id?.name === "resolveFloorTrapEffect";
    const inResolver = insideResolver || isResolver;
    if (inResolver && node.type === "IfStatement") {
      const testText = source.slice(node.test.range[0], node.test.range[1]);
      const type = Object.values(TRAP_TYPES).find(value =>
        testText.includes(`"${value}"`) || testText.includes(`'${value}'`)
      );
      if (type && node.consequent?.range) {
        branches.set(type, {
          startOffset: node.consequent.range[0],
          line: node.loc.start.line
        });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue;
      if (Array.isArray(value)) {
        value.forEach(child => visit(child, inResolver));
      } else {
        visit(value, inResolver);
      }
    }
  };
  visit(ast);
  return branches;
}

function calculateTrapCounts(source, coverageFunctions) {
  const branches = findTrapBranches(source);
  const counts = Object.fromEntries(
    Object.values(TRAP_TYPES).map(type => [type, 0])
  );
  let total = 0;
  const resolverFunctions = [...coverageFunctions?.values() || []]
    .filter(functionCoverage => functionCoverage.name === "resolveFloorTrapEffect");
  for (const functionCoverage of resolverFunctions) {
    total += functionCoverage.count;
    for (const [type, branch] of branches) {
      const branchCount = [...functionCoverage.ranges.entries()]
        .filter(([key]) => key.startsWith(`${branch.startOffset}:`))
        .reduce((sum, [, count]) => sum + count, 0);
      counts[type] += branchCount;
    }
  }
  counts[TRAP_TYPES.ALARM] = total -
    counts[TRAP_TYPES.DAMAGE] -
    counts[TRAP_TYPES.MP_DRAIN] -
    counts[TRAP_TYPES.PITFALL];
  return {
    counts,
    total,
    branches: Object.fromEntries(
      [...branches].map(([type, branch]) => [type, branch.line])
    )
  };
}

function parseSimulationLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return {};
  const log = fs.readFileSync(logPath, "utf8");
  const runs = log.match(/試行数: 各ケース N=(\d+)/)?.[1];
  const calibrationRuns = log.match(/core価値calibration: B1→B20 N=(\d+)/)?.[1];
  const depthRows = [];
  for (const line of log.split("\n")) {
    const match = line.match(/^((?:B\d+撤退)|(?:B\d+→B\d+))\s+\|\s+([0-9.]+)\s+\|/);
    if (match) depthRows.push({ label: match[1], averageReachedFloor: Number(match[2]) });
  }
  return { runs, calibrationRuns, depthRows };
}

function formatPercent(executed, total) {
  return total === 0 ? "N/A" : `${((executed / total) * 100).toFixed(1)}%`;
}

function formatFunction(functionData) {
  return `${functionData.name} (L${functionData.line})`;
}

function buildReport({
  coverageDir,
  coverageFiles,
  targetFilesByRelative,
  coverage,
  simulation,
  duration,
  parallel
}) {
  const fileResults = [];
  for (const [relative, filePath] of targetFilesByRelative) {
    const source = fs.readFileSync(filePath, "utf8");
    const functions = getFileFunctions(relative, source, coverage.byFile.get(relative));
    const executed = functions.filter(functionData => functionData.count > 0);
    fileResults.push({
      relative,
      directory: TARGET_DIRS.find(directory => relative.startsWith(`${directory}/`)),
      functions,
      executed,
      unexecuted: functions.filter(functionData => functionData.count === 0)
    });
  }
  fileResults.sort((left, right) => left.relative.localeCompare(right.relative));

  const directoryResults = TARGET_DIRS.map(directory => {
    const files = fileResults.filter(file => file.directory === directory);
    const functions = files.flatMap(file => file.functions);
    const executed = functions.filter(functionData => functionData.count > 0);
    return { directory, files, functions, executed };
  });

  const trapFile = "src/rules/trap_effect_rules.js";
  const trapSource = fs.readFileSync(targetFilesByRelative.get(trapFile), "utf8");
  const trap = calculateTrapCounts(trapSource, coverage.byFile.get(trapFile));
  const lines = [
    "# Issue #595 V8カバレッジ測定レポート",
    "",
    "## 測定条件",
    "",
    `- 正典sim: \`scratch/simulations/sim_depth_material_ev.js\``,
    `- N: ${simulation.runs || "不明"}（各ケース）`,
    `- calibration N: ${simulation.calibrationRuns || "不明"}`,
    `- 並列: ${parallel || "SIM_PARALLEL未指定（既定worker並列）"}`,
    `- 所要時間: ${duration ? `${duration}秒` : "未記録"}`,
    `- V8 coverage JSON: ${coverageFiles.length}件（対象script entry ${coverage.targetCoverageScripts}件、block coverage function entry ${coverage.blockCoverageScripts}件）`,
    "- coverage方式: `NODE_V8_COVERAGE` のNode標準V8 JSON。対象外の `src/renderer.js` / `src/ui/` は集計していない。",
    "- 再現コマンド: `NODE_V8_COVERAGE=<coverage-dir> node scratch/simulations/sim_depth_material_ev.js`",
    "",
    "## ディレクトリ別関数カバー率",
    "",
    "| 対象 | 実行済み / 全関数 | カバー率 |",
    "|---|---:|---:|",
    ...directoryResults.map(result =>
      `| \`${result.directory}\` | ${result.executed.length} / ${result.functions.length} | ${formatPercent(result.executed.length, result.functions.length)} |`
    ),
    "",
    "## 一度も実行されなかった関数",
    "",
    "V8の関数entryが存在しない未ロードファイルは、追加依存なしで既に利用可能なespreeで静的列挙し、全件を未実行として扱った。関数名はV8の `functionName`、または静的推定名。",
    ""
  ];

  for (const result of directoryResults) {
    lines.push(`### ${result.directory}`);
    lines.push("");
    const filesWithUnexecuted = result.files.filter(file => file.unexecuted.length > 0);
    if (filesWithUnexecuted.length === 0) {
      lines.push("- なし");
      lines.push("");
      continue;
    }
    for (const file of filesWithUnexecuted) {
      lines.push(`- \`${file.relative}\``);
      for (const functionData of file.unexecuted) {
        lines.push(`  - ${formatFunction(functionData)}`);
      }
    }
    lines.push("");
  }

  lines.push("## TRAP_TYPES別発火回数");
  lines.push("");
  lines.push("`src/rules/trap_effect_rules.js:resolveFloorTrapEffect` のblock coverageを合算した。DAMAGE/MP_DRAIN/PITFALLは各分岐body、ALARMは同関数総呼出数から3分岐を引いた残差。したがって4種の合計は同関数の実発動呼出数になる。");
  lines.push("");
  lines.push("| TRAP_TYPES | 発火回数 | 分岐行 |");
  lines.push("|---|---:|---:|");
  lines.push(`| DAMAGE (\`damage\`) | ${trap.counts[TRAP_TYPES.DAMAGE]} | L${trap.branches[TRAP_TYPES.DAMAGE] || "-"} |`);
  lines.push(`| MP_DRAIN (\`mpDrain\`) | ${trap.counts[TRAP_TYPES.MP_DRAIN]} | L${trap.branches[TRAP_TYPES.MP_DRAIN] || "-"} |`);
  lines.push(`| ALARM (\`alarm\`) | ${trap.counts[TRAP_TYPES.ALARM]} | 残差 |`);
  lines.push(`| PITFALL (\`pitfall\`) | ${trap.counts[TRAP_TYPES.PITFALL]} | L${trap.branches[TRAP_TYPES.PITFALL] || "-"} |`);
  lines.push(`| 合計 | ${trap.total} | resolveFloorTrapEffect総呼出数 |`);
  lines.push("");
  const zeroTraps = Object.entries(trap.counts)
    .filter(([, count]) => count === 0)
    .map(([type]) => type);
  lines.push(zeroTraps.length > 0
    ? `0件の種別: ${zeroTraps.join(", ")}（未モデル化・未到達候補として要確認）`
    : "0件の種別: なし");
  lines.push("");

  lines.push("## 到達深度の補足");
  lines.push("");
  if (simulation.depthRows?.length) {
    lines.push("simログの深度表に出た平均到達階（分布そのものではなく、正典simが出力する代表値）:");
    lines.push("");
    for (const row of simulation.depthRows) {
      lines.push(`- ${row.label}: ${row.averageReachedFloor.toFixed(2)}階`);
    }
  } else {
    lines.push("simログから平均到達階を抽出できなかった。");
  }
  lines.push("");
  lines.push("PITFALLはmap_generator.jsの通常trap抽選と別条件で選ばれるため、0件なら対象階への到達不足または発動経路未到達を疑う。本計測では全scenarioのB1開始系列とマイルストーン系列の平均到達階を上記に記録した。");

  return lines.join("\n") + "\n";
}

const options = parseArgs(process.argv.slice(2));
if (!options.coverageDir) {
  throw new Error("usage: node scratch/measurements/coverage_report_595.js <coverage-dir> [sim-log] [output.md]");
}
const coverageDir = path.resolve(options.coverageDir);
if (!fs.statSync(coverageDir).isDirectory()) {
  throw new Error(`coverage directory not found: ${coverageDir}`);
}

const targetFilesByRelative = new Map();
for (const directory of TARGET_DIRS) {
  for (const filePath of walkJavaScriptFiles(path.join(REPO_ROOT, directory))) {
    targetFilesByRelative.set(relativePath(filePath), filePath);
  }
}
const coverageFiles = readCoverageFiles(coverageDir);
const coverage = aggregateCoverage(coverageFiles, targetFilesByRelative);
const simulation = parseSimulationLog(options.simLog);
const report = buildReport({
  coverageDir,
  coverageFiles,
  targetFilesByRelative,
  coverage,
  simulation,
  duration: options.duration,
  parallel: options.parallel
});

if (options.output) {
  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, report);
}
process.stdout.write(report);
