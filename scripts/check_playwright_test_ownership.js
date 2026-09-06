import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRYPOINT_SUFFIX = '.spec.js';
const CASE_SUFFIX = '.cases.js';
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const IMPORT_FROM_RE = /(?:^|\n)\s*import\s+(?!['"])[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function readStaticImports(source) {
  return [
    ...source.matchAll(SIDE_EFFECT_IMPORT_RE),
    ...source.matchAll(IMPORT_FROM_RE),
  ].map(match => match[1]);
}

function resolveImport(importer, specifier) {
  return posix.normalize(posix.join(posix.dirname(importer), specifier));
}

export function checkOwnership(files) {
  const fileNames = new Set(files.map(file => file.name));
  const caseModules = files.filter(file => file.name.endsWith(CASE_SUFFIX));
  const owners = new Map();
  const failures = [];

  for (const file of files) {
    for (const specifier of readStaticImports(file.source)) {
      if (!specifier.startsWith('.') || !specifier.endsWith(CASE_SUFFIX)) continue;

      const importedCase = resolveImport(file.name, specifier);
      if (!fileNames.has(importedCase)) {
        failures.push(`${file.name}: imported case module does not exist: ${specifier}`);
        continue;
      }

      if (!file.name.endsWith(ENTRYPOINT_SUFFIX)) {
        failures.push(`${file.name}: case modules must be imported by a .spec.js entrypoint`);
        continue;
      }

      const imports = owners.get(importedCase) ?? new Map();
      imports.set(file.name, (imports.get(file.name) ?? 0) + 1);
      owners.set(importedCase, imports);
    }
  }

  for (const caseModule of caseModules) {
    const imports = owners.get(caseModule.name) ?? new Map();
    if (imports.size === 0) {
      failures.push(`${caseModule.name}: case module must be imported by exactly one .spec.js entrypoint`);
      continue;
    }
    if (imports.size !== 1) {
      failures.push(`${caseModule.name}: case module must have exactly one .spec.js owner (found ${imports.size})`);
      continue;
    }

    const [owner, importCount] = [...imports.entries()][0];
    if (importCount !== 1) {
      failures.push(`${caseModule.name}: case module must be imported once by ${owner} (found ${importCount} imports)`);
    }
  }

  return failures;
}

export function findFailures(root) {
  const files = collectFiles(root)
    .filter(file => file.endsWith('.js'))
    .map(file => ({
      name: relative(root, file).split(/\\/g).join('/'),
      source: readFileSync(file, 'utf8'),
    }));
  return checkOwnership(files);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  const testsRoot = join(process.cwd(), 'tests');
  const failures = findFailures(testsRoot);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    const files = collectFiles(testsRoot);
    const entrypointCount = files.filter(file => file.endsWith(ENTRYPOINT_SUFFIX)).length;
    const caseCount = files.filter(file => file.endsWith(CASE_SUFFIX)).length;
    console.log(`Playwright test ownership OK (${entrypointCount} entrypoints, ${caseCount} case modules).`);
  }
}
