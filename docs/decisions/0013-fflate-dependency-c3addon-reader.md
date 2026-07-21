# 0013. Depend on `fflate` for `.c3addon` zip reading

- **Status:** accepted (partially revises [ADR 0001](0001-single-module-esm-library.md)'s no-runtime-deps stance)
- **Date:** 2026-07-20
- **Issue:** #44

## Context

The new `.c3addon` package reader (`readAddonPackage`, in `src/addons.ts`)
must read DEFLATE-compressed zip archives — real Construct 3 addon exports
are `.c3addon` zips, not just unpacked directories. `c3source` had held a
zero-runtime-dependency invariant since its inception; [ADR
0001](0001-single-module-esm-library.md) frames the library as a
single-module ESM package and its "Consequences" describe consumers getting
a single entry point with no dependency graph to pull in. DEFLATE cannot be
decompressed correctly or safely without either a large hand-rolled inflate
implementation or a library, and hand-rolling one is outside c3source's
domain (reading/traversing C3 project source, not implementing compression).

## Decision

Add `fflate` (`^0.8.2`, resolved `0.8.3`) as the first entry in
`package.json`'s `dependencies` — a single, flat, itself-zero-dependency,
MIT-licensed, ~8 KB, **synchronous** (`unzipSync`/`zipSync`) ESM package.
`readAddonPackage` is a hybrid reader over `.c3addon`'s two on-disk forms: it
uses `unzipSync` for zip files and plain `readFileSync`/`readdirSync` for
already-extracted directories; both modes share one `AddonPackage` interface
and one BOM-strip + decode path (`stripBom` over `strFromU8`, factored into
the shared `textReaders` helper).

A key structural choice paired with this dependency: the **pre-read-JSON
boundary**. The I/O + zip layer (`readAddonPackage`, which takes a path) is
kept separate from the pure parser layer (`parseAcesModel(json)` /
`parseAddonMetadata(json)`, which take an already-parsed JSON value and never
a path) — so the ACE model, attribution (`attributeObjectType` /
`attributeFamily` / `collectAddonAttribution`), and discovery
(`findAllAddons`) primitives do not depend on `fflate` and remain testable
without it. `fflate` is a normal resolved dependency (not bundled or
vendored); the published tarball still ships only `dist/` (the `files`
allowlist, [ADR 0004](0004-dist-entry-points-no-publishconfig.md), is
unchanged).

Reading real, BOM'd `addon.json`/`aces.json` samples for tests required
vendoring the [Construct Addon
SDK](https://github.com/Scirra/Construct-Addon-SDK) as the `SDK/` git
submodule. Tests that need it (`test/addonReader.test.ts`'s SDK-gated block)
self-skip via `sdkFixtureExists` when the submodule is absent or
non-recursively checked out, so CI must check out submodules recursively for
that block to actually run rather than silently skip.

## Compromise

- **Hand-rolled inflate** — rejected: substantial code and a
  correctness/security surface (DEFLATE decompression) far outside
  c3source's domain, for no benefit over a small, audited library.
- **Caller-supplied-extracted-only** (the reader accepts only pre-extracted
  directories, never zips) — rejected as the whole design: real C3 ships
  `.c3addon` as zip files, so this would merely push the identical zip
  dependency onto every consumer instead of owning it once. Kept only as the
  *directory* half of the hybrid reader, for addon authors working with an
  unpacked source tree.
- **adm-zip / jszip / yauzl** — rejected on size, transitive dependencies, or
  async/callback APIs that would force an async join into c3source's
  otherwise fully-synchronous (`readFileSync`/`readdirSync`) codebase.
- **Not supporting zips at all** (preserve the zero-dependency invariant) —
  rejected: reading `.c3addon` packages is the core requirement of #44: an
  addon reader that cannot read the format C3 actually ships is not useful.

## Consequences

Consumers of `c3source` now transitively install one flat, MIT-licensed
package. The zero-runtime-dependency invariant [ADR
0001](0001-single-module-esm-library.md) established becomes a "minimal,
flat, audited runtime deps" posture instead — this ADR partially revises
ADR 0001's no-runtime-deps stance, the same way [ADR
0012](0012-per-area-module-split.md) notes it amends only ADR 0001's
module-layout half. `fflate`'s synchronous API preserves c3source's sync
style, so no consumer call site becomes async. `fflate` is version-pinned;
a future C3 zip-format change is a dependency bump, not a rewrite. The `SDK/`
submodule must be checked out recursively for the SDK-gated reader tests to
exercise real, BOM'd samples — a non-recursive or absent checkout leaves them
self-skipping rather than failing, which keeps the always-on synthetic-fixture
tests as the non-optional coverage floor for `readAddonPackage`.
