# Export `find_all_files_path` — design

Issue: #16 — "Expose file discovery for non-source artifacts (.dsl.txt) so
downstream can drop its last hand-rolled walker."

## Problem

`construct3-chef` keeps one hand-rolled recursive file walker (`findDslFiles` in
`src/c3/navigationGraph.ts`) only because no exported c3source finder can be
pointed at a non-source filename. That copy has no `uistate/` skip and will
re-diverge on the next traversal fix (exactly the drift #12/#14 fought). It
wants c3source to own the recursion, the directory-skip rules, and the ordering
for arbitrary file criteria.

## Decision

Promote the existing internal primitive `find_all_files_path(dir, predicate)` to
a public export. Every `find_all_*_path` collector is already a thin wrapper over
it, so this exposes the exact capability with no behavior change.

Rejected: a named `.dsl.txt` finder (bakes a downstream artifact convention into
this library) and a glob-based finder (adds parsing surface for no benefit over a
predicate).

## Change

- `src/c3source.ts`: `function find_all_files_path` → `export function`. Signature
  unchanged: `(dir: string, predicate: (filename: string) => boolean) => string[]`.
  The predicate receives the **basename** (matches existing internal callers).
  `src/index.ts`'s `export *` re-exports it automatically.
- Behavior is exactly today's: fully recursive through subdirectories, skips
  `uistate/` subfolders, per-level `readdirSync().sort()` DFS ordering. Visibility
  change only — no logic change.

## Docs

- Rewrite the JSDoc on the function as public API (it currently says consumers go
  through the named collectors). Document that the predicate sees the basename and
  that the walk owns recursion + the `uistate/` skip + deterministic sort order.
- `CLAUDE.md` Architecture section: it calls `find_all_files_path` "an internal"
  primitive; note it's now exported as the generic primitive the named collectors
  wrap.

## Tests

New cases (in `test/findLayouts.test.ts`):

- Finds arbitrary-extension files by predicate (`.dsl.txt`) — proves it isn't
  bound to source filenames.
- Recurses into real subfolders.
- Skips `uistate/` subfolders — the drift-protection the issue wants.
- Returns deterministic sorted order.

## Non-goals

No new dependencies. No change to the named collectors' behavior. Single commit,
one newly exported symbol.
