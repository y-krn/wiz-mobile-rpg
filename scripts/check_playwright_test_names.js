import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_SUFFIXES = ['.spec.js', '.cases.js'];
const forbiddenFile = /(?:^|[\\/])(?:issue-|ui-issue-|verify-).*(?:\.spec|\.cases)\.js$/i;
const forbiddenTitle = /\bIssue\s*#\d+\b|\btest(?:\.describe)?\s*\([^\n]*\bverify[- ]/i;

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

export function checkFile(name, source) {
  const failures = [];
  if (forbiddenFile.test(name)) failures.push(`${name}: Issue/verify filename is not allowed`);
  if (forbiddenTitle.test(source)) failures.push(`${name}: Issue/verify naming is not allowed in spec text`);
  return failures;
}

export function findFailures(root) {
  return collectFiles(root)
    .filter(file => SOURCE_SUFFIXES.some(suffix => file.endsWith(suffix)))
    .flatMap(file => checkFile(relative(root, file), readFileSync(file, 'utf8')));
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  const failures = findFailures(join(process.cwd(), 'tests'));
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
