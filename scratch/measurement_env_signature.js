import { createHash } from "node:crypto";

// 測定条件（env変数・seed・N・policy・scenario集合・工房状態など）を
// 決定的にhash化する。時刻・絶対パス・乱数結果は含めないこと
// （同一条件の再実行でhashが変わると比較の道具として機能しなくなる）。

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
