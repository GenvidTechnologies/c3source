# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Only list docs that exist.
-->

## Project context

- `../CLAUDE.md` — overview, commands, architecture, formatting & CI conventions
- `design-patterns.md` — reusable patterns (single-source event counter, thin file-walker wrappers, real-export-vs-inline test strategy)
- `api-guide.md` — usage reference for SID traversal and editor-local classification; links to manifest/drift doc
- `api-guide-manifest.md` — project manifest model, drift detection types, walk primitives, and 0.x migration (#19 #21)
- `api-guide-project.md` — C3Project handle and openProject(root) factory: path fields, presence checks, file finders, drift delegation (#36)
- `api-guide-extraction.md` — event-sheet extraction API: visitEvents, extractScriptsFromSheet, extractFunctions, extractIncludes, walkScriptActions, isFunctionDefinition, isEventVarReference/getEventVarReferenceName, extractExpressionReferences, validateForEditor/EDITOR_FIELD_RULES

## Decision Records

Architecture Decision Records (ADRs) in `decisions/` — see [`decisions/README.md`](decisions/README.md). Backfilled 2026-07-17 from commit history.

- `decisions/0001-single-module-esm-library.md` — single-module, ESM-only library (`type:module`, NodeNext, `.js` imports); module-layout superseded by 0012
- `decisions/0002-canonical-event-numbering.md` — one canonical event-numbering counter in `visitEvents` (#3)
- `decisions/0003-github-actions-oidc-publishing.md` — CI/publish via GitHub Actions + npm + OIDC trusted publishing (#6)
- `decisions/0004-dist-entry-points-no-publishconfig.md` — package entry points at `dist/`, not `src/*.ts` via `publishConfig` (#8)
- `decisions/0005-single-canonical-traversal-walk.md` — one canonical recursive walk per traversal; collectors/finders/visitors are thin consumers (#10 #14 #16)
- `decisions/0006-editor-local-classifier.md` — single canonical editor-local classifier; skip C3 r487 `uistate/` (#12 #19)
- `decisions/0007-coordinate-bearing-returns.md` — structured, coordinate-bearing returns over bare values (#21)
- `decisions/0008-c3-domain-fact-tables.md` — C3 domain facts owned as exported tables (#26 #28 #29 #33 #39)
- `decisions/0009-editor-strict-validation.md` — lenient parse types + separate editor-strictness validation (#33)
- `decisions/0010-c3project-root-handle.md` — `C3Project`/`openProject` root handle; derive paths from mapping tables, no I/O at construction (#36 #38)
- `decisions/0011-c3-expression-tokenizer.md` — C3-expression tokenizer for reference extraction; flat source-ordered `ExpressionToken[]` (#43)
- `decisions/0012-per-area-module-split.md` — split `c3source.ts` into `layouts.ts`/`eventSheets.ts`/`manifest.ts`/`project.ts` behind an internal barrel, supersedes 0001's module-layout (#47)
- `decisions/0013-fflate-dependency-c3addon-reader.md` — depend on `fflate` for `.c3addon` zip reading, partially revising 0001's no-runtime-deps stance (#44)
