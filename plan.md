# Plan: `C3Project` / `openProject(root)` — own project root + structure (issue #36)

Branch: `feat/c3project-open-project`

## Goal

Introduce a root-bound `C3Project` handle (factory `openProject(root)`) that owns
the project root + canonical subfolder structure, so consumers stop reconstructing
subfolder paths by hand (`construct3-chef` ~15 sites, `c3-domain-manager`). Additive
and non-breaking: the existing `find_all_*_path` finders stay; the handle is new.

Verified unbuilt: `openProject`/`C3Project` do not exist. Mechanism check passes —
`C3_SECTION_FOLDERS`, `C3_ROOT_FILE_FOLDERS`, and the `find_all_*_path` finders
exist exactly as the issue describes.

## API

```ts
export interface C3Project {
  readonly root: string;
  // canonical subfolder paths — derived from C3_SECTION_FOLDERS / C3_ROOT_FILE_FOLDERS, NOT re-hardcoded
  readonly manifestPath: string;    // <root>/project.c3proj
  readonly eventSheetsDir: string;  // <root>/eventSheets
  readonly layoutsDir: string;      // <root>/layouts
  readonly objectTypesDir: string;  // <root>/objectTypes
  readonly familiesDir: string;     // <root>/families
  readonly scriptsDir: string;      // <root>/scripts  (from C3_ROOT_FILE_FOLDERS.script)

  // existence — fresh existsSync on call
  hasEventSheets(): boolean;
  hasLayouts(): boolean;
  hasObjectTypes(): boolean;
  hasFamilies(): boolean;
  hasScripts(): boolean;

  manifest(): C3ProjectManifest;     // lazy, cached via closure

  // rooted finders — optional `sub` appended to the section dir (default ""), graceful [] when absent
  findAllEventSheets(sub?: string): string[];   // delegates to find_all_eventsheets_path
  findAllLayouts(sub?: string): string[];       // delegates to find_all_layouts_path
  findAllObjectTypes(sub?: string): string[];   // delegates to find_all_objectTypes_path
  findAllFamilies(sub?: string): string[];      // NEW collector (.json, name-section)
  findAllScripts(sub?: string): string[];       // NEW collector (.ts source, excludes generated ts-defs)

  // rooted drift — thin delegators, reuse cached manifest
  detectManifestDrift(): ManifestDrift;
  detectImageDrift(): SectionDrift | null;
}

export function openProject(root: string): C3Project;
```

- **No I/O at construction** — store `root`, compute path strings from the tables.
  `manifest()` reads lazily on first call and caches.
- **`sub` param** — `path.join(this.<section>Dir, sub)`; `sub = ""` is a no-op join
  (whole section). Preserves the existing finders' partial-walk capability
  (e.g. `findAllEventSheets("Common")`). `sub` narrows where the walk starts, not
  what it matches (predicates unchanged).

## Key design decisions / friction

1. **Thin consumer, zero new literals.** `*Dir` from `C3_SECTION_FOLDERS`
   (eventSheets/layouts/objectTypes/families) and `C3_ROOT_FILE_FOLDERS.script`
   (scripts). `manifest()` → `readProjectManifest`; drift → existing detectors;
   3 finders reused as-is.
2. **Graceful-empty** for absent subfolders: `findAll*()` return `[]` instead of
   letting `readdirSync` throw ENOENT. Diverges from the raw finders (which throw);
   deliberate for a root-bound handle. Pinned by tests.
3. **`findAllFamilies()` filters `.json`** (like eventsheets), a deliberate
   divergence from layouts/objectTypes (which don't filter). Families are pure
   `<Name>.json` with no sub-assets.
4. **`findAllScripts()` excludes generated `ts-defs/`.** Predicate
   `endsWith(".ts") && !endsWith(".d.ts") && !isEditorLocalPath`. Gated by a fixture
   test asserting exactly the 2 declared scripts. If `ts-defs/` holds non-`.d.ts`
   files, escalate to a dir-name exclusion.
5. **No new standalone snake_case finders** — families/scripts discovery is
   handle-only (camelCase). Reversible.

## Test criteria (against `test/fixtures/c3source-fixture/`, drift-free per R-C12)

- Path fields equal the table-derived joins (no hardcoded literals).
- `manifest()` deep-equals `readProjectManifest(manifestPath)`; cached (no second read).
- `findAllEventSheets/Layouts/ObjectTypes()` equal the raw finder on the joined subdir.
- `findAllFamilies()` → the 2 family files (`TextFamily`, `LevelMaps`).
- `findAllScripts()` → exactly `importsForEvents.ts` + `main.ts` (ts-defs excluded).
- `sub` scoping: `findAllObjectTypes("tiles")` ⊂ `findAllObjectTypes()`; non-existent
  `sub` → `[]`.
- `has*()` true for present subfolders; `findAll*()` → `[]` for a synthetic root
  missing that subfolder.
- `detectManifestDrift().inSync === true`; `detectImageDrift()` matches standalone.

## Tasks (one commit each, TDD)

- **P1** — Core handle: `C3Project` interface + `openProject` factory (path fields
  from tables, `has*()`, lazy-cached `manifest()`). Tests. [ts-implementer]
- **F1** — Rooted finders for the 3 existing sections with optional `sub` +
  graceful-empty, delegating to `find_all_*_path`. Tests. [ts-implementer]
- **F2** — New collectors `findAllFamilies()` (`.json`) + `findAllScripts()`
  (`.ts`, ts-defs excluded), both with `sub`. Tests incl. ts-defs gate. [ts-implementer]
- **F3** — Rooted `detectManifestDrift()` / `detectImageDrift()` delegators
  (reuse cached manifest). Tests. [ts-implementer]
- **D1** — Docs: CLAUDE.md architecture paragraph + `docs/api-guide-*` entry for
  `openProject`/`C3Project`. [tech-writer]

Protocol: implementer stages but does not commit → validator → commit on green.
`code-reviewer` at the end.

## Notes

- No ADR — full-proposal shortcut compressed Phase 2 (threshold not met). The
  factory-vs-class rationale goes in the PR body.
- `plan.md` removed at PR creation per CLAUDE.md.
- `resolveRootFolder` (root discovery) is out of scope — belongs in `@genvid/mcp-utils`;
  `openProject` takes an already-resolved absolute path.
