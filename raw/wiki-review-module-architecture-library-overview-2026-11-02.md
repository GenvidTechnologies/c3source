# Wiki review — module-architecture.md and library-overview.md against main (capture)

**Captured:** 2026-11-02
**For:** a staleness review of `wiki/module-architecture.md` and `wiki/library-overview.md`, both last edited 2026-08-20, after the 3.0.0 and 3.1.0 releases.
**Source:** commands run against this repo at `main` 9e4bd5b ("feat: section-aware file type and the attested video section (#113) (#118)"), plus reads of two consumers' `package.json` through the GitHub contents API. Outputs are reproduced as printed.
**Nature:** a code read and command outputs, not an editor-bundle capture and not a corpus scan.

---

## 1. Intra-package imports per module

Command: for each `src/*.ts`, the sorted unique set of `from "./<name>.js"` targets.

```
src/addons.ts: layouts
src/c3source.ts: addons eventSheets layouts manifest project references serialize
src/eventSheets.ts: layouts
src/index.ts:
src/layouts.ts: serialize
src/manifest.ts: layouts serialize
src/project.ts: addons eventSheets layouts manifest references
src/references.ts: addons eventSheets layouts manifest
src/serialize.ts:
```

`src/index.ts` prints empty above only because the pattern's name class (`[a-zA-Z]+`) does not match the digit in `c3source`. Its one line, read directly, is `export * from "./c3source.js";`.

`src/project.ts` does not import `./serialize.js`. `git log -S'./serialize.js' -- src/project.ts` printed nothing, so no commit in the file's history added or removed that import.

## 2. Package entry points and scripts

From `package.json` at 9e4bd5b:

```
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
"files": ["dist", "LICENSE", "README.md"],
"type": "module",
"version": "3.1.0",
"prepack": "npm run build && npm run verify-package",
"verify-package": "node scripts/verify-package.mjs",
```

`tsconfig.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.

`scripts/` holds: `api-surface.mjs`, `gitlink-drift.d.mts`, `gitlink-drift.mjs`, `mutate.mjs`, `prep-fixture.mjs`, `scan-domain-facts.mjs`, `scan-references.mjs`, `verify-package.mjs`.

`grep -rn 'api-surface\|verify-package' .github/ package.json` matched only the two `package.json` lines above. `api-surface.mjs` is referenced by neither CI nor an npm script.

## 3. Confidence labels in src/

Occurrence counts over `src/` (`grep -rhoE`):

```
11 AUDITED
 3 KNOWN INCOMPLETE
 2 NOT CORPUS-AUDITABLE
 6 UNVALIDATED
```

Exported table names that `library-overview.md` gives as examples, as found: `IMAGE_FILE_TYPE_EXTENSIONS` (`src/manifest.ts`) and `EDITOR_FIELD_RULES` (`src/eventSheets.ts`). Other exported domain-fact tables present: `SCRIPT_FILE_TYPE_EXTENSIONS`, `EXTENSION_FILE_TYPES`, `SECTION_EXTENSION_FILE_TYPES`, `C3_VIDEO_IMPORT_EXTENSIONS`, `EVENTVAR_REFERENCE_ACES`.

A search of `src/*.ts` for project or release counts in prose (`[0-9]+ projects`, `across [0-9]+`, `[0-9]+ releases`) matched two lines, neither a corpus count: "C3 releases, with no seventh value anywhere" and "Pre-r402 C3 releases serialize image nodes with no `fileType`".

## 4. Where corpus counts live now

`library-overview.md` says counts, release lists and scan dates live in "the maintainer's own audit doc". That doc was `docs/domain-fact-audit.md` (captured as `raw/docs-domain-fact-audit-2026-08-20.md`); `docs/` no longer exists. The counts are now in `wiki/c3-domain-facts.md`, for example: "Re-run 2026-10-27 on the 14 projects of the inventoried …".

## 5. Folder-project scope statement

`src/manifest.ts`, `C3ProjectManifest` JSDoc: "The parsed project.c3proj manifest (folder-project format, NOT the single-file .c3p archive)."
`README.md` carries a "Folder-based projects only" note that names the `.c3p` archive as unsupported.

## 6. Consumer dependency ranges

Through `gh api repos/GenvidTechnologies/<repo>/contents/package.json`:

```
construct3-chef:   "@genvidtech/c3source": "^3.1.0"
c3-domain-manager: "@genvidtech/c3source": "^3.0.0"
burbank:           (the call returned no c3source line; not established here)
```

GitHub code search for `c3source` in burbank returned no results, so the page's "consumes it via `bin/` scripts" was neither confirmed nor refuted by this review.
