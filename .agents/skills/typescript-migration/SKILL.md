---
name: typescript-migration
description: Use for incremental JavaScript-to-TypeScript migration, typed boundary or facade changes, and TypeScript soundness review; not for ordinary non-TypeScript refactors.
---

# TypeScript migration

Load `.agents/typescript-migration.md` and `.agents/file-map.md`. Keep current
implementation details in source, tests, package configuration, and CLI help.
This Skill adds migration-specific review; Issue lifecycle, generic CI, and
independent PR review remain owned by their existing Skills and references.

## Trigger

Load this Skill when work includes:

- JavaScript-to-TypeScript migration
- a canonical typed owner or runtime boundary
- a typed compatibility facade or JavaScript/TypeScript interop change
- TypeScript soundness or assertion/`any` review

## Boundary gate

- Identify every raw runtime, save, and external input crossing the changed
  boundary.
- Trace each input through `unknown` → runtime validation → typed internal
  contract. Confirm the validator remains executable and rejects malformed or
  unsupported variants before live use.
- Prefer discriminated unions for variant contracts. Use assertions only after
  a guard proves the invariant; reject broad `any` and `as any` shortcuts.
- Keep domain types near their canonical owner and inspect consumers before
  widening that owner.

## Interop gate

- Confirm whether JavaScript and TypeScript coexist at the boundary.
- Select one canonical owner and keep any compatibility facade thin and
  behavior-delegating.
- Exercise or inspect every reached runtime import path, including Node, Vite,
  browser, and simulation entrypoints when applicable.
- Preserve established import contracts while consumers migrate.

## Preservation gate

Check evidence for unchanged behavior and runtime cost. Pay special attention
to object identity, state-owned references, hot paths, save compatibility,
persistence validation, legacy-data handling, and fail-safe behavior. A
type-only migration does not authorize gameplay or runtime semantic changes.

## Stop conditions

Stop when validation is replaced by static typing, the owner or consumer
boundary is unclear, a facade duplicates behavior, an import path is not
proven, or behavior, performance, identity, or persistence compatibility is
unresolved. Keep unrelated refactors outside the Issue.

## Report

Report the boundary map, canonical owner and facade decision, runtime import
evidence, preservation checks, unresolved risks, and a `pass`, `pass with
notes`, or blocked disposition. Do not duplicate lifecycle, generic CI, or
independent-review procedures here.
