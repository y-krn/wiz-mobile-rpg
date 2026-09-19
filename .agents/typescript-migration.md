# TypeScript migration contract

This contract governs incremental JavaScript and TypeScript migration. It
defines safety boundaries and review questions; source, tests, package
configuration, and CLI help remain the executable source of truth.

## Ownership and interop

- JavaScript and TypeScript may coexist during migration.
- Each migrated contract has one canonical TypeScript owner. Existing
  JavaScript consumers remain supported through a compatibility facade only
  when needed.
- Keep compatibility facades thin: preserve the established import boundary
  and delegate to the canonical owner rather than duplicating behavior.
- Place domain types near the owner of the domain contract. Do not create a
  large shared `types.ts` as a migration shortcut.
- Inspect the migrated contract's consumers before widening the owner or
  changing the boundary.

## Runtime boundary

- Treat runtime, save, and external input as `unknown` until validated.
- Preserve runtime validation as an executable guard. Do not replace it with
  TypeScript annotations or type assertions.
- Move data through the boundary as raw input → validated data → typed
  internal contract. Validation must establish the invariant used by the
  typed layer.
- Prefer discriminated unions when variants have different contracts. Keep
  invalid and unsupported variants rejected at the boundary.
- Use assertions only for invariants already established by a runtime guard
  or an unavoidable platform boundary. Do not use broad `any` or `as any` as
  a migration technique.

## Compatibility requirements

- A type-only migration must not change gameplay or runtime semantics.
- Preserve object identity, state-owned references, mutation ownership, and
  hot-path cost unless a separate Issue explicitly authorizes the change.
- Preserve save compatibility, persistence validation, legacy-data handling,
  and fail-safe behavior.
- Prove import compatibility for every reached runtime, including Node, Vite,
  browser, and simulation entrypoints when applicable.
- Keep one Issue's boundary narrow. Do not expand migration scope to unrelated
  modules or refactor ordinary JavaScript without a typed-boundary reason.

## Stop conditions

Stop and resolve the boundary before proceeding when the canonical owner is
unclear, a consumer relies on undocumented runtime behavior, validation would
be weakened, a facade would duplicate semantics, a runtime import path is
untested, or behavior, performance, identity, or persistence compatibility
cannot be demonstrated.
