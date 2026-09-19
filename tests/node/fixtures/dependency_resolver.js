import fs from 'node:fs';
import path from 'node:path';

function candidatePaths(unresolved) {
  const extension = path.extname(unresolved);
  const candidates = [unresolved];

  if (!extension) {
    candidates.push(`${unresolved}.js`, `${unresolved}.ts`, `${unresolved}.tsx`);
  } else if (extension === '.js') {
    candidates.push(`${unresolved.slice(0, -extension.length)}.ts`);
    candidates.push(`${unresolved.slice(0, -extension.length)}.tsx`);
  }

  candidates.push(
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
  );
  return candidates;
}

export function resolveRelativeImport(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const resolved = candidatePaths(unresolved)
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

  if (!resolved) {
    throw new Error(`Unable to resolve "${specifier}" from ${importer}`);
  }

  return resolved;
}

export function findRelativeImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[^'";]*?\s+from\s*)['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith('.')) specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

export function collectRelativeDependencies(entryPath) {
  const dependencies = new Set();
  const visited = new Set();

  function visit(filePath) {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);
    dependencies.add(absolutePath);

    for (const specifier of findRelativeImports(absolutePath)) {
      visit(resolveRelativeImport(absolutePath, specifier));
    }
  }

  visit(entryPath);
  return dependencies;
}
