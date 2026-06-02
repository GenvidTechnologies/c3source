# Plan: Structured (path-bearing) manifest drift detection — issue #21

> Prep scaffolding. Removed at PR creation (per CLAUDE.md). Durable record = issue #21 / PR.
> Requirements + decisions: `docs/superpowers/issue-21-requirements.md` (D1–D11).

**Branch:** `feat/structured-manifest-drift` · **Version:** 0.6.0 → **1.0.0** (breaking) · **Base:** `main` @ `09ff95d`

## Goal

Replace the flat `{missingOnDisk, untracked}` drift result with a tagged, path-bearing
`DriftEntry[]` so construct3-chef's `runSync` can place nested mutations from the result
alone. One canonical path-preserving walk; detection-only. **Breaking major** (drops the
flat shape + the `collectManifest*Names` flatteners; #46 oracle must migrate).

## Verified baseline (run against the enriched fixture)

6 tests are **RED on `main`** before any feature work — the enriched fixture diverges from
what they pin. P-steps repair this; it is a precondition, not regression budget.
- R-C2 (layouts.items), R-C12 (not inSync: `Layout 1` untracked + `tsconfig.json`),
  R-C13, R-C14 (layouts), R-C15 (`.ts` + `tsconfig.json`), `collectManifestFileNames` (`.ts`).

## Fixture notes (discovered during planning)

- `objectTypes` subfolders carry `name` (`global`/`images`/`tiles`); `timelines.subfolders[0]`
  is the degenerate **nameless** empty case — the walk must not crash on it.
- `containers`: `[{members:["Sprite2","Text2"]}]`. Images: `9patch.png`/`tiledbackground.png`/
  `tilemap.png` (1:1) + `sprite*` frames (animations).
- `.gitignore` ignores `*.uistate.json` (root editor files) and `ts-defs`. The
  `layouts/uistate/*.instancesBar.json` files are NOT matched (different suffix) and stay
  tracked — they exercise the `uistate/` dir skip. **`ts-defs/` must be force-added** (a
  representative slice) so its skip is verifiable in CI.
- `tilemapBrushes/` is an **undeclared** derived folder — not a manifest section, harmlessly
  ignored by the detector. Out of scope (future derived-content target, like `images/`).

---

## Tasks (one commit each; P before F)

### P1 — Repair fixture + baseline tests · ts-implementer
Commit the user's fixture enrichment as the foundation. The clean fixture is already
in-sync for layouts: `Layout 1.json` was **removed from disk** (D9 resolved by deletion,
not manifest-add), so disk = manifest (`Main`/`Second`/`Templates Layout`). Align stale
test expectations to the enriched fixture (R-C2 → 3 layouts; `collectManifestFileNames` →
`.ts`; R-C13/R-C14 drop the `Layout 1` premise). Leave `tsconfig.json`-related failures
(R-C12/R-C15) for P2.
**Files:** `test/fixtures/sample-project/**`, `test/projectManifest.test.ts`
**Commit:** `test(fixtures): enrich sample-project export and align baseline expectations (#21)`

### P2 — Editor-local exclusions: `tsconfig.json` + `ts-defs/` · ts-implementer
Add an `exactNames` set to `EDITOR_LOCAL_EXCLUSIONS` (exact-name match for `tsconfig.json`,
NOT a suffix) and `ts-defs` to `dirs`; `isEditorLocalPath` consumes both. Force-add a
representative `ts-defs/` slice to the fixture so CI can verify the skip. Flip R-C12/R-C15
to green. (D4/D11/R6)
**Files:** `src/c3source.ts`, `test/fixtures/sample-project/scripts/ts-defs/**`, `test/projectManifest.test.ts`
**Commit:** `feat: classify tsconfig.json and ts-defs/ as editor-local (#21)`

### P3 — `name?` on folders + typed `C3Container` · ts-implementer
Add `name?: string` to `C3NameFolder`/`C3FileFolder`; asserters accept `string|undefined`
(reject non-string), tolerate the nameless `timelines` subfolder. Add `C3Container
{members: string[]}`; `containers: C3Container[]`; `assertContainer` in the parser. (P3/D5)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: add name? to folder models and type C3Container (#21)`

### P4 — `families` + `models3d` section coverage · ts-implementer
Add `families`/`models3d` to `C3_SECTION_FOLDERS`; delete stale "intentionally absent" /
"objectTypes unconfirmed/flat" comments. Confirm clean fixture stays in-sync. (R4/D2)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: cover families and models3d sections (#21)`

### F1 — Path-walk primitives + types + `diffNameMaps` · ts-implementer
Add `ManifestPathSegment`, `DriftKind`, `DriftEntry`, `formatManifestPath` (mirrors
`formatSidPath`). Add path-preserving walks — `walkManifestNameTree`/`walkManifestFileTree`
(use `folder.name`; nameless → document/skip), `walkDiskNameTree` (readdir recursion,
section-root-**relative** paths, `isEditorLocalPath`-filtered — NOT `find_all_files_path`),
`walkDiskFileTree(dir, declaredSubfolders)` (recurse declared subfolder names only, D3).
`diffNameMaps` builds per-side `Map<name,path>` → `missing`/`untracked`/`moved`. Unit-test
each primitive in isolation. Public detector unchanged this step. (R1/R3/R10)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: add path-bearing drift types, tree walks, and diffNameMaps engine (#21)`

### F2 — Rewrite `detectManifestDrift`; replace `SectionDrift` (BREAKING) · ts-implementer
`SectionDrift`: drop `missingOnDisk`/`untracked`, add `entries: DriftEntry[]`. Remove
internal `diskNameFolderItems`/`diskFileFolderNames`/`diffNames` and the exported
`collectManifestItemNames`/`collectManifestFileNames` flatteners. Rewrite the detector onto
F1 primitives. Update CLAUDE.md Piece-C paragraph (new shape, declared-subfolder recursion,
drop stale objectTypes note). Migrate R-C12–R-C15 + flatteners tests to `.entries`/`kind`.
(D1/D7/R9)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`, `CLAUDE.md`
**Commit:** `feat!: replace flat drift shape with structured DriftEntry list (#21)`

### F3 — Container referential-integrity (`dangling-ref`) · ts-implementer
Collect manifest objectType names (via `walkManifestNameTree`); for each container member
not found, emit `DriftEntry{kind:"dangling-ref", name}`; push `SectionDrift{section:
"containers", folder:"", entries}` when any. No disk walk. (F3/D5/R7)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: detect dangling container member references (#21)`

### F4 — Image-derived drift (`detectImageDrift`) · ts-implementer
`deriveExpectedImageNames(objectTypeJsonPath)`: `image` field → `<lowercased-name>.png`;
`animations` tree → `<lowercased-name>-<animation name>-<frame3>.png` per frame (collapse
animation subfolders, zero-pad frame); neither → none. `detectImageDrift(projectDir,
manifest)` derives expected vs `readdirSync(images/)` via `diffNameMaps`; returns a
`SectionDrift|null`. Wire into detector always-on-if-`images/`-present, **try-guarded**
(degrade to omitted, never throw). Unit-test `detectImageDrift` **directly** (so the guard
can't mask bugs). Document plugin coverage limits in JSDoc. (F4/D6/D8/D10/R8)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: add image-derived drift detection (#21)`

### F5 — Folder-level drift (`folder-missing`/`folder-untracked`) · ts-implementer
Compare manifest subfolder names vs on-disk dirs per name-section; emit `folder-missing`
(manifest-only, `manifestPath`) / `folder-untracked` (disk-only, `diskPath`) alongside
item entries. Integrate into the name-section loop. (F5/R2)
**Files:** `src/c3source.ts`, `test/projectManifest.test.ts`
**Commit:** `feat: add folder-level drift entries (#21)`

### DOC1 — `docs/api-guide.md` drift section · tech-writer
Document new types, `formatManifestPath`, moved-entry example, families/models3d coverage,
container `dangling-ref`, images coverage table, `name?` on folders, and the breaking
removals (with the `entries.filter(...).map(e=>e.name)` migration recipe).
**Commit:** `docs: update api-guide.md for structured drift (#21)`

### DOC2 — `docs/design-patterns.md` · tech-writer
Replace the "shallow file-folder walk" section with "declared-subfolder recursion"; add a
"path-bearing drift / move-via-unique-names" pattern (sibling to the SID walk split).
**Commit:** `docs: document declared-subfolder recursion and path-bearing drift patterns (#21)`

### REL1 — Version bump · ts-implementer
`package.json` 0.6.0 → 1.0.0 (so CI's `npm publish --dry-run` validates at the right
version). Actual tag/publish is human-triggered, NOT part of this work.
**Commit:** `chore: bump to 1.0.0 for breaking drift shape change (#21)`

### V1 — Full gate · validator
`npm run lint && npm run typecheck && npm run test && npm run build`.

---

## Risks
- **Breaking #46 oracle** + `collectManifest*Names` removal → flag in PR body; migration is
  `entries.filter(e=>e.kind==="missing").map(e=>e.name)`.
- **Nameless `timelines` subfolder** → walk must not crash (unit test it).
- **`diskPath` must be section-root-relative**, not absolute (assert in F1 tests).
- **Image try-guard** can hide bugs → test `detectImageDrift` directly.
- **`moved` correctness** relies on per-category name uniqueness (C3 invariant; documented).
- **`ts-defs/` gitignored** → force-add a slice or its skip test is vacuous in CI (P2).

## Sessions
~5: (P1–P4) → F1 → F2 → (F3+F4+F5) → (DOC1+DOC2+REL1+V1).
