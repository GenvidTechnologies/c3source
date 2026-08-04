# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Only list docs that exist.
-->

## Project context

- `../CLAUDE.md` — overview, commands, architecture, formatting & CI conventions
- `design-patterns.md` — reusable patterns (single-source event counter, thin file-walker wrappers, real-export-vs-inline test strategy, collect-then-throw-first validation)
- `api-guide.md` — usage reference for SID traversal and editor-local classification; links to manifest/drift doc
- `api-guide-manifest.md` — project manifest model, strict vs tolerant parsing, shape validation, canonical serialization/writing, drift detection types, walk primitives, and 0.x migration (#19 #21 #57 #58)
- `api-guide-project.md` — C3Project handle and openProject(root) factory: path fields, presence checks, file finders, drift delegation, manifest write surface + write-through cache rule (#36 #57 #58)
- `api-guide-extraction.md` — event-sheet extraction API: visitEvents, extractScriptsFromSheet, extractFunctions, extractIncludes, walkScriptActions, isFunctionDefinition, isEventVarReference/getEventVarReferenceName, extractExpressionReferences, validateForEditor/EDITOR_FIELD_RULES
- `api-guide-addons.md` — addon domain layer: usedAddons manifest support, addon attribution (behaviorTypes/effectTypes), findAllAddons, readAddonPackage, parseAcesModel/parseAddonMetadata (#44)
- `api-guide-references.md` — reference-integrity detection: the five ReferenceIssue kinds, C3_PSEUDO_OBJECT_CLASSES/NON_ATTRIBUTABLE_ADDON_TYPES domain-fact tables, the four pure detectors + detectReferenceIntegrity orchestrator, C3Project.detectReferenceIntegrity, error policy, ownership boundary vs. construct3-chef (#60)
- `domain-fact-audit.md` — 14-project corpus-scan results for the six domain-fact tables: corpus inventory, per-table findings, two defects found and fixed, bounds on what a corpus can prove, and the editor.construct.net validation channel (#68)

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
- `decisions/0014-sdk-submodule-recursive-ci-checkout.md` — keep the Construct Addon SDK submodule read-only; recursive CI checkout via the shared workflow's `submodules` input (#49 #50)
- `decisions/0015-canonical-c3-reference-fixture.md` — adopt standalone `construct3-sample` as the canonical, tag-pinned-submodule C3 reference fixture; c3source validates, it does not own (#51)
- `decisions/0016-c3-source-json-serialization-form.md` — c3source owns the C3 source-JSON write form (tab indent, no trailing newline); new `src/serialize.ts` leaf, `C3Project` write surface, write-through-never-invalidate cache rule (#57)
- `decisions/0017-tolerant-manifest-read.md` — lenient `project.c3proj` parse plus collected `ManifestValidationIssue[]`; strict stays default; shared shape-rule collector; write path stays deliberately un-gated (#58)
- `decisions/0018-brush-json-minified-source-not-editor-local.md` — `*.brush.json` is minified project source, not editor-local; `EDITOR_LOCAL_EXCLUSIONS` deliberately unchanged; new `isMinifiedSourcePath` domain fact (#59)
- `decisions/0019-hermetic-fixture-materialization.md` — materialize the canonical fixture from the `construct3-sample` submodule's tracked HEAD content (`git archive`) instead of its working tree, so the corpus no longer differs between a developer machine and CI (#64)
- `decisions/0020-caller-controlled-walk-descent.md` — `find_all_files_path` gains an optional `descend` parameter so callers can opt a directory (e.g. `ts-defs/`) back into reachability without narrowing `EDITOR_LOCAL_EXCLUSIONS`; classification stays unchanged (#63)
- `decisions/0021-reference-integrity-detection.md` — reference-integrity detection lives in a new `src/references.ts` module/DAG tier with its own `ReferenceIssue` type, not folded into `detectManifestDrift`/`DriftEntry` (#60)
