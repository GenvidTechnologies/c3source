# Requirements — Structured (path-bearing) project.c3proj drift detection (issue #21)

> Ephemeral scaffolding (docs/superpowers/). Durable record lives on issue #21 / the PR.
> Status: requirements confirmed with user against the enriched `test/fixtures/sample-project/` export.

## Goal

Upgrade c3source's manifest drift detection from **flat basename lists** to a
**structured, path-bearing** result so construct3-chef's `runSync` can locate
*where* in the manifest tree to apply a mutation without re-walking the tree.
Mirrors the `walkSids`/`formatSidPath` structured-segments pattern from #18.
Stays **detection-only** — no SID minting, no `FileItem` construction, no write-back.

## Ground truth

The enriched fixture `test/fixtures/sample-project/` is authoritative. It overturned
the issue's central premise (see issue #21 correction comment). Confirmed facts:

- **Name sections are flat `<Name>.json` files in named organizational subfolders.**
  objectTypes are NOT per-type directories. Every name section (objectTypes, layouts,
  eventSheets, families, timelines, flowcharts, models3d) follows the same shape:
  flat files at each level + named subfolders mirroring the manifest's `subfolders[]` tree.
- **Manifest subfolders carry a `name` field** when populated
  (`objectTypes.subfolders[].name = "global" | "images" | "tiles"`), matching the
  on-disk subdirectory name 1:1. Degenerate empty subfolders may omit `name`
  (the empty `timelines.subfolders[0]`) → model as `name?: string`.
- **objectTypes on disk**: `objectTypes/Text.json`, `objectTypes/global/JSON.json`,
  `objectTypes/images/Sprite.json`, `objectTypes/tiles/Tilemap.json`.
- **families on disk**: `families/TextFamily.json` (one item, no subfolders).
- **models3d**: declared empty in manifest, no on-disk folder → reports no drift until populated.
- **containers**: `[{ members: ["Sprite2", "Text2"] }]` — declared inline, **no on-disk
  folder**, members reference object types by name.
- **rootFileFolders.script**: declares `main.ts`, `importsForEvents.ts` (match disk).
  Disk also has `tsconfig.json` (top-level, undeclared) and `ts-defs/` (generated tree,
  undeclared) — both **C3-generated/overwritten**, must not be managed.
  - **TS-vs-JS projects**: a project is uniformly TS-typed *or* JS-typed. It has exactly
    one `main.{ts,js}` and one `importsForEvents.{ts,js}`, both sharing the project's type
    — never both extensions. File-folder drift matches on the **full filename including
    extension**, so it is **extension-agnostic** (handles `.ts` and `.js` projects with no
    hardcoded extension) while still treating `main.ts` ≠ `main.js` as genuine drift if
    manifest and disk disagree. No special-casing — exact-name matching covers it. The
    `.ts`-only artifacts (`tsconfig.json`, `ts-defs/`) are simply absent in a JS project,
    so the editor-local exclusion (D4) is harmless there.
- **images/**: derived sprite/animation frames + single images, NOT a manifest name
  section. Naming: 1:1 `<name>.png` for single-image plugins (9patch, TiledBackground,
  Tilemap); `<name>-<animation>-<frame>.png` per frame for sprites. Object-type name is
  **lowercased** in the filename. Animation **subfolders collapse** on disk (a sprite's
  `SubAnimation` manifest folder does not appear in the path). Animation names are unique
  within an object type.
- **Leaf names are unique *per category*, independent of subfolder** — objectTypes are
  unique among objectTypes, layouts among layouts, eventSheets among eventSheets, etc.
  (Additional uniqueness exists inside C3 — functions/groups/root-level global variables
  are unique across all event sheets, and some cross-category overlap is constrained, e.g.
  objectTypes ↔ families share a namespace — but those are intra-file *symbol* rules /
  cross-category constraints, not per-section manifest
  *membership*, so they are **out of scope** for drift detection; extensible later.)
  Per-category uniqueness is exactly the granularity drift runs at: each section is diffed
  independently, so drift can be computed from a **`name → path` map** per side rather than
  by tree-aligning manifest against disk. Diff the name sets; the path of any drifting leaf
  is read directly from whichever side declares it. A leaf with the same name but a
  different path on each side is a **move** (not delete+add), which a sync can apply as a
  relocation. This removes any dependence on subfolder ordering or the nameless-subfolder
  edge case.

## Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Release shape | **Breaking major** — redefine drift entries to carry structured path segments directly (single clean shape). Accepts breaking the #46 oracle + a major bump + downstream pin update. |
| D2 | Name-section coverage | **families + models3d + containers** (all added to the model/detector). |
| D3 | File-folder traversal | **Recurse manifest-declared subfolders only.** Undeclared subfolders (e.g. `ts-defs/`) are never walked. |
| D4 | C3-generated TS artifacts | **Editor-local.** Add `tsconfig.json` + `ts-defs/` to `EDITOR_LOCAL_EXCLUSIONS` so `isEditorLocalPath` filters them everywhere. |
| D5 | containers drift semantics | **Referential integrity** — report container members naming an object type absent from the manifest (dangling reference). No disk diff. |
| D6 | images/ drift | **In scope, best-effort.** Derive expected names from object types: 1:1 `<name>.png` default + sprite frame expansion. Explicitly incomplete/extensible with documented plugin coverage limits. |
| D7 | Result type shape | **Option A — unified tagged `DriftEntry` list.** `SectionDrift.entries: DriftEntry[]`, each `kind: missing\|untracked\|moved\|folder-missing\|folder-untracked\|dangling-ref`, carrying `manifestPath?`/`diskPath?` segment arrays. One shape absorbs every drift kind. |
| D8 | images/ wiring | **Always-on if `images/` present, try-guarded.** `detectManifestDrift` appends an images `SectionDrift` when an `images/` folder exists; a derivation error degrades to "images omitted", never fails core drift. No options flag. |
| D9 | Fixture clean-state | **Resolved by deleting `Layout 1.json` from disk** (the old-fixture leftover); disk now matches the manifest's Main/Second/Templates Layout, so the clean fixture is genuinely in-sync. Clean-fixture tests assert `inSync === true`. |
| D10 | Image-plugin detection | **Structural, not allowlist.** Object type with an `image` field → 1:1 `<name>.png`; with an `animations` tree → sprite frame expansion; neither → no image. Robust to third-party image plugins; document coverage limits. |
| D11 | Script extension | **Extension-agnostic exact-name matching.** Support `.ts` and `.js` projects with no hardcoded extension; `main.ts` ≠ `main.js` is genuine drift if manifest/disk disagree. |

## Requirements

1. **R1 — Path-bearing drift entries.** Each missing/untracked drift entry carries
   structured path segments locating it within the section's subfolder nesting
   (mirroring `SidPathSegment = string | number`; folder segments are subfolder names).
   A caller can place a nested mutation from the result alone, without re-walking the manifest.

2. **R2 — Folder-level drift.** A subfolder present in manifest-but-not-disk (or vice
   versa) is representable as a folder-level add/remove distinct from item-level drift,
   preserving nesting.

   - **R2a — Moves via unique names.** Because leaf names are globally unique within a
     section, drift is computed by diffing `name → path` maps; a same-name/different-path
     leaf surfaces as a **move** (path change), not a delete+add.

3. **R3 — Uniform name-section walk.** All name sections (objectTypes, layouts,
   eventSheets, families, models3d, timelines, flowcharts) use one canonical
   subfolder-tree walk matching manifest `subfolders[].name` to on-disk subdirectories.
   objectTypes get **no** special directory handling.

4. **R4 — Coverage.** Add `families`, `models3d` to the name-section mapping; add
   `containers` handling (D5). (`C3_SECTION_FOLDERS` currently omits families/models3d.)

5. **R5 — File-folder traversal recurses declared subfolders only** (D3), keeping the
   "depth matches manifest" invariant; generated subtrees stay invisible.

6. **R6 — Editor-local extension** (D4): `tsconfig.json` + `ts-defs/` join the canonical
   `EDITOR_LOCAL_EXCLUSIONS`; all skip sites consume `isEditorLocalPath` (no new inline rules).

7. **R7 — Containers referential check** (D5): detect dangling container member references.

8. **R8 — images/ derived-name drift** (D6): derive expected image filenames per object
   type (1:1 default + sprite expansion, lowercased), diff against `images/`. Best-effort;
   document which plugins are covered and that it is intentionally incomplete.

9. **R9 — Detection-only** preserved across all of the above. No writes, no SID minting.

10. **R10 — One canonical walk, thin consumers.** New structured primitive owns the
    traversal; any retained flat helper is a thin consumer (no parallel walk).

## Constraints

- **C1 — Breaking change is accepted (D1)** but must be deliberate: bump major, update
  `docs/api-guide.md`, and note the downstream pin/oracle impact for construct3-chef.
- **C2 — Folder-project format only** (`project.c3proj`, not `.c3p` archive).
- **C3 — All editor-local filtering routes through `isEditorLocalPath`** (one canonical rule).
- **C4 — Strict parser still tolerates absent/empty sections** (don't break previously-valid manifests).
- **C5 — ESM `.js` imports, single `src/c3source.ts` module, tab-indented JSON** (detection
  writes nothing, but keep discipline).
- **C6 — images/ coupling is acknowledged-incomplete** (D6); it must be opt-in or clearly
  separable so its plugin-naming brittleness doesn't destabilize the core name-section drift.

## Touch points

- `src/c3source.ts` "Piece C" (lines ~972–1215): drift types, mapping tables
  (`C3_SECTION_FOLDERS` ~1089, `C3_ROOT_FILE_FOLDERS` ~1104), flatteners (~1145),
  disk walks (`diskNameFolderItems` ~1161, `diskFileFolderNames` ~1174),
  `detectManifestDrift` (~1195). Model types (`C3NameFolder` ~975 needs `name?: string`,
  `C3FileFolder` ~989). `EDITOR_LOCAL_EXCLUSIONS` / `isEditorLocalPath` (for D4).
  Containers model (`C3ProjectManifest.containers: unknown[]` ~1018 → typed). Plugin-id /
  image derivation (new, for R8).
- `src/index.ts` — `export *` already covers new symbols.
- `test/projectManifest.test.ts` — existing R-C12–R-C15 must be revised for the breaking
  shape; new tests for path segments, folder-level drift, families/models3d/containers,
  TS-artifact exclusion, and images derivation.
- `test/fixtures/sample-project/` — already enriched (objectTypes w/ subfolders + sprites +
  animations + tiles, families, containers, TS scripts + ts-defs, images). Authoritative.
- `docs/api-guide.md` (manifest/drift section) + `docs/design-patterns.md` (shallow-walk
  pattern → revise for declared-subfolder recursion) — must be updated.

## Open items for design (not blocking sign-off)

- Exact result type shape for path-bearing + folder-level drift (segments encoding,
  whether one `Drift` list or per-section, how folder-add/remove is tagged).
- How image-bearing plugins are identified (plugin-id allowlist vs. presence of an
  `animations` tree) and how far R8 coverage extends in v1.
- Whether the flat shape is dropped entirely (D1 = major) or a flat view is offered as a
  convenience consumer of the structured result.
