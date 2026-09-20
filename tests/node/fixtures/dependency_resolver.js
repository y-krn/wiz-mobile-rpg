import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as ts from 'typescript';

const RESOLVABLE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json'];

function candidatePaths(unresolved) {
  const extension = path.extname(unresolved);
  const candidates = [unresolved];

  if (!extension) {
    candidates.push(...RESOLVABLE_EXTENSIONS.map(candidate => `${unresolved}${candidate}`));
  } else if (extension === '.js') {
    candidates.push(`${unresolved.slice(0, -extension.length)}.ts`);
    candidates.push(`${unresolved.slice(0, -extension.length)}.tsx`);
  }

  candidates.push(...RESOLVABLE_EXTENSIONS.map(extensionName =>
    path.join(unresolved, `index${extensionName}`)));
  return candidates;
}

function isInsideRoot(filePath, repoRoot) {
  const relative = path.relative(repoRoot, filePath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function relativeRepoPath(filePath, repoRoot) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/').replace(/^\.\//, '');
}

export function normalizeRepoPath(filePath) {
  return path.normalize(filePath).split(path.sep).join('/').replace(/^\.\//, '');
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
  const extension = path.extname(filePath);
  const scriptKind = extension === '.tsx' || extension === '.jsx'
    ? ts.ScriptKind.TSX
    : extension === '.ts'
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`Unable to parse ${filePath}`);
  }

  const add = node => {
    if (node?.text?.startsWith('.')) specifiers.add(node.text);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return [...specifiers];
}

function resolveSupplementalDependency(repoRoot, dependency) {
  const relativePath = typeof dependency === 'string' ? dependency : dependency.path;
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Supplemental dependency must contain a relative path');
  }

  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!isInsideRoot(absolutePath, repoRoot)) {
    throw new Error(`Supplemental dependency escapes repository root: ${relativePath}`);
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Unable to resolve supplemental dependency "${relativePath}"`);
  }
  return {
    path: absolutePath,
    recursive: typeof dependency === 'object' && dependency !== null
      && (dependency.recursive === true
        || dependency.kind === 'source'
        || dependency.kind === 'child-process'),
  };
}

export function resolveDependencyClosure({ entryPath, repoRoot, supplementalDependencies = [] }) {
  const root = path.resolve(repoRoot || path.dirname(entryPath));
  const dependencies = new Set();
  const unresolved = [];
  const errors = [];
  const visited = new Set();

  function recordUnresolved(message, source = entryPath) {
    unresolved.push({ source: relativeRepoPath(path.resolve(source), root), message });
  }

  function visit(filePath) {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    if (!isInsideRoot(absolutePath, root)) {
      recordUnresolved(`Dependency escapes repository root: ${absolutePath}`, filePath);
      return;
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      recordUnresolved(`Dependency does not exist: ${relativeRepoPath(absolutePath, root)}`, filePath);
      return;
    }

    dependencies.add(absolutePath);
    let specifiers;
    try {
      specifiers = findRelativeImports(absolutePath);
    } catch (error) {
      errors.push({
        source: relativeRepoPath(absolutePath, root),
        message: error.message,
      });
      return;
    }

    for (const specifier of specifiers) {
      try {
        visit(resolveRelativeImport(absolutePath, specifier));
      } catch (error) {
        recordUnresolved(error.message, absolutePath);
      }
    }
  }

  try {
    visit(entryPath);
  } catch (error) {
    errors.push({ source: relativeRepoPath(path.resolve(entryPath), root), message: error.message });
  }

  for (const supplementalDependency of supplementalDependencies) {
    try {
      const resolved = resolveSupplementalDependency(root, supplementalDependency);
      if (resolved.recursive) {
        visit(resolved.path);
      } else {
        dependencies.add(resolved.path);
      }
    } catch (error) {
      unresolved.push({
        source: relativeRepoPath(path.resolve(entryPath), root),
        message: error.message,
      });
    }
  }

  return {
    dependencies,
    unresolved,
    errors,
    safeToSelect: unresolved.length > 0 || errors.length > 0,
  };
}

export function collectRelativeDependencies(entryPath) {
  let repoRoot = path.resolve(path.dirname(entryPath));
  while (!fs.existsSync(path.join(repoRoot, 'package.json')) && path.dirname(repoRoot) !== repoRoot) {
    repoRoot = path.dirname(repoRoot);
  }
  const result = resolveDependencyClosure({ entryPath, repoRoot });
  if (result.unresolved.length > 0) throw new Error(result.unresolved[0].message);
  if (result.errors.length > 0) throw new Error(result.errors[0].message);
  return result.dependencies;
}

export function resolveTestPath(testFile, repoRoot) {
  if (testFile.includes('/')) {
    const absolutePath = path.resolve(repoRoot, testFile);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) return absolutePath;
  }

  return ['unit', 'regression']
    .map(directory => path.join(repoRoot, 'tests/node', directory, testFile))
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

export function collectChangedFiles({ repoRoot, baseRef = 'origin/main', headRef = 'HEAD', includeWorkingTree = true }) {
  const runGit = args => execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).split(/\r?\n/).filter(Boolean);
  const [mergeBase] = runGit(['merge-base', headRef, baseRef]);
  if (!mergeBase) throw new Error(`No merge base found for ${baseRef}`);

  const changedFiles = new Set(runGit(['diff', '--name-only', `${mergeBase}...${headRef}`])
    .map(normalizeRepoPath));
  if (includeWorkingTree) {
    for (const args of [
      ['diff', '--name-only'],
      ['diff', '--name-only', '--cached'],
      ['ls-files', '--others', '--exclude-standard'],
    ]) {
      for (const file of runGit(args)) changedFiles.add(normalizeRepoPath(file));
    }
  }
  return changedFiles;
}

export function selectTestsForChanges({ manifest, repoRoot, changedFiles }) {
  const changed = new Set([...changedFiles].map(normalizeRepoPath));
  const selected = new Set();
  const results = [];

  for (const entry of manifest) {
    const testPath = resolveTestPath(entry.file, repoRoot);
    const testRelativePath = testPath ? relativeRepoPath(testPath, repoRoot) : entry.file;
    const closure = testPath
      ? resolveDependencyClosure({
        entryPath: testPath,
        repoRoot,
        supplementalDependencies: entry.dependencies || [],
      })
      : {
        dependencies: new Set(),
        unresolved: [{ source: entry.file, message: `Heavy test not found: ${entry.file}` }],
        errors: [],
        safeToSelect: true,
      };
    const closurePaths = new Set([...closure.dependencies].map(filePath => relativeRepoPath(filePath, repoRoot)));
    closurePaths.add(testRelativePath);
    const matchedFiles = [...closurePaths].filter(filePath => changed.has(normalizeRepoPath(filePath)));
    const isSelected = closure.safeToSelect || matchedFiles.length > 0;
    if (isSelected) selected.add(entry.file);
    results.push({ entry, closure, closurePaths, matchedFiles, selected: isSelected });
  }

  return { selected, results };
}
