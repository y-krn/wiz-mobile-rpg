import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// `test_` 接頭辞のファイルのみスイート対象。バランス調整用の数値シミュは
// sim_ 接頭辞(例: sim_balance.js)にして命名で除外している。
const EXCLUDE_LIST = [];

const scratchDir = './scratch';
const files = fs.readdirSync(scratchDir);

const testFiles = files.filter(file => 
  file.startsWith('test_') && 
  file.endsWith('.js') && 
  !EXCLUDE_LIST.includes(file)
);

console.log(`Found ${testFiles.length} test files to run.`);

let failed = false;

for (const file of testFiles) {
  console.log(`\n========================================`);
  console.log(`Running: ${file}`);
  console.log(`========================================`);
  try {
    execSync(`node ${path.join(scratchDir, file)}`, { stdio: 'inherit' });
  } catch {
    console.error(`\n[FAIL] ${file} failed`);
    failed = true;
  }
}

if (failed) {
  console.log('\nSome tests failed.');
  process.exit(1);
} else {
  console.log('\nAll tests passed successfully!');
}
