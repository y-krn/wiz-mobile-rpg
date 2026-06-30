import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const EXCLUDE_LIST = [
  'test_balance_simulation.js',
  'test_economy_simulation.js',
  'test_reachability_loop.js',
  'test_unidentified.js',
  'run_tests.js'
];

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
