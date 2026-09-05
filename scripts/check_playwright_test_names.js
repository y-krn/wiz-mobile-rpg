import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'tests');
const forbiddenFile = /(?:^|[\\/])(?:issue-|ui-issue-|verify-).*\.spec\.js$/i;
const forbiddenTitle = /\bIssue\s*#\d+\b|\bverify[- ]/i;

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

const failures = [];
for (const file of collectFiles(root).filter(file => file.endsWith('.spec.js'))) {
  const name = relative(root, file);
  const source = readFileSync(file, 'utf8');
  if (forbiddenFile.test(name)) failures.push(`${name}: Issue/verify filename is not allowed`);
  if (forbiddenTitle.test(source)) failures.push(`${name}: Issue/verify naming is not allowed in spec text`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
