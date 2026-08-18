// sim-scope: infra — retained origin-unknown CLI for manually comparing two sim env signatures; no production, test, or CI caller.
// 2本のsim出力ログから env signature 行を抜き出し、差分keyを名指しする。
// 使い方: node scratch/compare_env_signature.js <fileA.log> <fileB.log> [label]
import { readFileSync } from "node:fs";
import { diffEnvSignatures } from "./measurement_env_signature.js";

function extractSignature(text, label) {
  const re = new RegExp(`^${label} signature: (.+)$`, "m");
  const match = text.match(re);
  if (!match) {
    throw new Error(`"${label} signature:" 行が見つからない`);
  }
  return JSON.parse(match[1]);
}

const [fileA, fileB, labelArg] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error("usage: node scratch/compare_env_signature.js <fileA> <fileB> [label]");
  process.exit(64);
}
const label = labelArg || "env";

const signatureA = extractSignature(readFileSync(fileA, "utf8"), label);
const signatureB = extractSignature(readFileSync(fileB, "utf8"), label);
const diffs = diffEnvSignatures(signatureA, signatureB);

if (diffs.length === 0) {
  console.log(`env hash一致: ${fileA} と ${fileB} は同一測定条件`);
} else {
  console.log(`env hash不一致: ${diffs.length}件のkeyが異なる（${fileA} -> ${fileB}）`);
  diffs.forEach(({ key, before, after }) => {
    console.log(`  ${key}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  });
  process.exitCode = 1;
}
