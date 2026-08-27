import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 測定条件（env変数・seed・N・policy・scenario集合・工房状態など）を
// 決定的にhash化する。時刻・絶対パス・乱数結果は含めないこと
// （同一条件の再実行でhashが変わると比較の道具として機能しなくなる）。

// `// sim-scope: <scope> [— 理由]` 宣言のパーサ。scratch/tests/regression/test_sim_reward_paths.js の
// 強制チェックと各simのenv signatureが同じ正規表現を共有し、
// 宣言と出力scopeが食い違わないようにする（片方だけベタ書きで直すと再発する）。
const SIM_SCOPE_PATTERN = /^[^\S\n]*\/\/[^\S\n]*sim-scope:[^\S\n]*(\S+)[^\S\n]*(.*)$/m;

export function parseSimScopeDeclaration(source) {
  const header = source.split(/\r?\n/).slice(0, 20).join("\n");
  const match = header.match(SIM_SCOPE_PATTERN);
  if (!match) return null;
  return { name: match[1], reason: match[2].replace(/^[—–-]\s*/, "").trim() };
}

// 呼び出し元自身の `import.meta.url` を渡す想定。env signatureのscopeフィールドを
// ファイル先頭の宣言から直接読むことで、ベタ書きコピーとの食い違いを構造的に防ぐ。
export function readSimScopeDeclaration(fileUrl) {
  const source = readFileSync(fileURLToPath(fileUrl), "utf8");
  return parseSimScopeDeclaration(source);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashEnvSignature(fields) {
  return createHash("sha256").update(stableStringify(fields)).digest("hex").slice(0, 16);
}

export function printEnvSignatureBanner(fields, { label = "env" } = {}) {
  const hash = hashEnvSignature(fields);
  console.log(`${label} hash: ${hash}`);
  console.log(`${label} signature: ${JSON.stringify(fields)}`);
  return hash;
}

// 2本の測定のenv signatureを比較し、値が異なるkeyだけを列挙する。
// before/after比較を謳う出力はこれで「hashが違うならどのkeyが違うか」を名指しできる。
export function diffEnvSignatures(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const diffs = [];
  for (const key of keys) {
    const beforeValue = before ? before[key] : undefined;
    const afterValue = after ? after[key] : undefined;
    if (stableStringify(beforeValue) !== stableStringify(afterValue)) {
      diffs.push({ key, before: beforeValue, after: afterValue });
    }
  }
  return diffs.sort((left, right) => left.key.localeCompare(right.key));
}
