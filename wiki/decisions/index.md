# Decision Records

This is the index of c3source's Architecture Decision Records (ADRs), in
**MADR-lite** format (Status, Context, Decision, Compromise, Consequences —
the **Compromise** section is the load-bearing one: it preserves the
rejected-alternatives rationale a squashed PR body would otherwise lose).
Each record states the situation *at its date* and is never retro-edited; a
later change to the same decision is recorded as a new, superseding ADR
rather than an edit to the old one, so `status`/`## Related` are how
supersession is tracked, not `stale_after` (ADRs never go stale — see
`docs/wiki-schema.md`'s decay policy).

**Template.** The MADR-lite template is bundled in the `gvt-dev` plugin at
`plugin/docs/decision-record.template.md`; `gvt-dev:tech-writer` fills it
automatically.

**To add or insert a record**, run `/gvt-dev:create-adr` — it handles
numbering, chronological insertion, and renumbering. Do not hand-number
files.

**Backfill note.** Records 0001–0010 were reconstructed retroactively from
the commit history (backfill, 2026-07-17). Their `Date:` fields are the
original decision dates derived from git; the records themselves were
written after the fact.

**Provenance.** Each page below is migrated from an immutable capture under
`raw/adr-<slug>-2026-08-20.md` — see that page's frontmatter `sources` for
the exact capture it mirrors.

## Records

* [ADR 0001 — Single-module ESM library](0001-single-module-esm-library.md) - Nearly all logic lives in a single module, src/c3source.ts, behind a pure re-export barrel, and the package targets ESM with NodeNext resolution (mandatory .js import extensions) rather than CommonJS.
* [ADR 0002 — One canonical event-numbering counter in visitEvents](0002-canonical-event-numbering.md) - The canonical event-numbering counter lives in one walk, visitEvents, and every extractor (scripts, functions, includes) is a thin consumer of it so eventNumber, eventIndex, and generateFunctionName cannot drift apart.
* [ADR 0003 — CI/publish via GitHub Actions + npm + OIDC trusted publishing](0003-github-actions-oidc-publishing.md) - CI runs on GitHub Actions via a shared, secret-free reusable workflow, and publishing to the public npm registry as @genvidtech/c3source is tag-triggered and authenticated via npm OIDC trusted publishing with no long-lived token.
* [ADR 0004 — Package entry points at dist/, not src/*.ts via publishConfig](0004-dist-entry-points-no-publishconfig.md) - package.json's main/types/exports point directly at the built dist/*.js and dist/*.d.ts artifacts, never at src/*.ts rewritten via publishConfig, because npm (unlike pnpm/yarn) ignores that override and ships broken src/ paths.
* [ADR 0005 — One canonical recursive walk per traversal; collectors, finders, and visitors are thin consumers](0005-single-canonical-traversal-walk.md) - Each traversal — file collection, layer walking, manifest walking, SID walking — has one canonical recursive owner, and every collector, finder, and visitor is a thin consumer of it.
* [ADR 0006 — Single canonical editor-local classifier; skip C3 r487 uistate/](0006-editor-local-classifier.md) - There is one canonical definition of editor-local vs. C3 source, isEditorLocalPath backed by the EDITOR_LOCAL_EXCLUSIONS table, consumed uniformly everywhere the four former inline skip sites used to duplicate the rule.
* [ADR 0007 — Structured, coordinate-bearing returns over bare values](0007-coordinate-bearing-returns.md) - Primitives return structured, coordinate-bearing records (path-bearing drift entries, SID paths, signature-carrying extraction results) instead of bare values, so a consumer never has to re-walk the structure to relocate what a primitive already found.
* [ADR 0008 — C3 domain facts owned as exported tables in c3source](0008-c3-domain-fact-tables.md) - Undocumented C3 platform facts (event-variable-reference ACEs, image MIME-to-extension mapping, editor-loader field requirements, comparison operators, the timeline-transitions folder) are owned here as exported, version-pinned tables rather than re-hardcoded downstream.
* [ADR 0009 — Lenient parse types + a separate editor-strictness validation layer](0009-editor-strict-validation.md) - Parse types stay intentionally lenient for reading hand-edited or partial C3 JSON, and a separate, detection-only validateForEditor layer, driven by the extensible EDITOR_FIELD_RULES table, models the stricter C3 editor loader's required-field set.
* [ADR 0010 — C3Project root-bound handle; derive paths from mapping tables, no I/O at construction](0010-c3project-root-handle.md) - openProject(root) is a root-bound handle that derives every on-disk path from the C3_SECTION_FOLDERS/C3_ROOT_FILE_FOLDERS mapping tables at construction, does no I/O until asked, and wraps the free-function finders/detectors additively.
* [ADR 0011 — C3-expression tokenizer for reference extraction](0011-c3-expression-tokenizer.md) - extractExpressionReferences is a single-pass, stateful, never-throwing tokenizer over raw C3 expression text that returns a flat, source-ordered union of reference/systemFunction/variable tokens with nesting metadata, owned once instead of re-rolled by every consumer.
* [ADR 0012 — Per-area module split (supersedes 0001)](0012-per-area-module-split.md) - src/c3source.ts is split into four per-area modules (layouts, eventSheets, manifest, project) along an acyclic import DAG, retained as a 4-line internal re-export barrel so the published API stays byte-identical.
* [ADR 0013 — Depend on fflate for .c3addon zip reading](0013-fflate-dependency-c3addon-reader.md) - c3source adds fflate as its first runtime dependency to read real zip-form .c3addon packages, keeping a pre-read-JSON boundary so the pure ACE-model parser and attribution primitives stay testable without it.
* [ADR 0014 — Keep the Construct Addon SDK submodule read-only; recursive CI checkout via the shared workflow's submodules input](0014-sdk-submodule-recursive-ci-checkout.md) - The Scirra Construct Addon SDK stays a read-only git submodule; CI checks it out recursively via a new optional submodules input added to the shared node-gate.yml reusable workflow, enabling the previously silently-skipped SDK-gated addon tests.
* [ADR 0015 — Adopt construct3-sample as the canonical C3 reference fixture; c3source validates, it does not own](0015-canonical-c3-reference-fixture.md) - A standalone repo, construct3-sample, becomes the single canonical, editor-round-tripped golden C3 project consumed as a tag-pinned git submodule; c3source ships the validators (validateForEditor, detectManifestDrift) but is a peer consumer, not the owner.
* [ADR 0016 — c3source owns the C3 source-JSON write form](0016-c3-source-json-serialization-form.md) - A new leaf module, src/serialize.ts, owns the tab-indented, no-trailing-newline C3 source-JSON write form and a write-through manifest cache rule, so downstream stops re-deriving or duplicating the invariant.
* [ADR 0017 — Tolerant project.c3proj read mode](0017-tolerant-manifest-read.md) - A lenient parse path (validateProjectManifest / parseProjectManifestTolerant / readProjectManifestTolerant) returns a manifest together with a typed list of the shape violations found in it, instead of the existing strict path's all-or-nothing throw.
* [ADR 0018 — *.brush.json is minified project source, not editor-local](0018-brush-json-minified-source-not-editor-local.md) - tilemapBrushes/**/*.brush.json is C3 project source in a second, minified serialization form, not an editor-local artifact; EDITOR_LOCAL_EXCLUSIONS is left unchanged and the knowledge is owned as a new domain fact, C3_MINIFIED_SOURCE_SUFFIXES / isMinifiedSourcePath, in src/serialize.ts.
* [ADR 0019 — Materialize the canonical fixture from the submodule's tracked HEAD content, not its working tree](0019-hermetic-fixture-materialization.md) - scripts/prep-fixture.mjs now materializes test/fixtures/canonical/ via git archive HEAD (extracted in-process with fflate) instead of copying the construct3-sample submodule's working tree, so a developer's untracked/gitignored editor-local files can never leak into the corpus.
* [ADR 0020 — Editor-local classification does not imply walk unreachability](0020-caller-controlled-walk-descent.md) - EDITOR_LOCAL_EXCLUSIONS and isEditorLocalPath are left unchanged; find_all_files_path gains a caller-controlled, defaulted descend parameter so a consumer can enter an otherwise-pruned directory like ts-defs/ without widening what counts as C3 source.
* [ADR 0021 — Reference integrity as a separate module, not an extension of drift detection](0021-reference-integrity-detection.md) - A new src/references.ts module and DAG tier reports five kinds of unresolved name-keyed cross-reference (addon-undeclared, addon-unused, family-member-missing, instance-type-missing, event-class-unresolved) through its own ReferenceIssue type, deliberately not folded into detectManifestDrift's DriftEntry.
* [ADR 0022 — Domain-fact audit convention: confidence labels, evidence not verdicts](0022-domain-fact-audit-convention.md) - Every domain-fact table carries a confidence label (AUDITED / KNOWN INCOMPLETE / UNVALIDATED / NOT CORPUS-AUDITABLE) paired with its blast radius; scripts/scan-domain-facts.mjs reports partitions for a human to judge rather than asserting a table is correct; numbers live in docs/domain-fact-audit.md, labels live in JSDoc.
* [ADR 0023 — Pre-r402 image serialization and drift degradation](0023-pre-r402-image-serialization-drift-degradation.md) - deriveExpectedImages/deriveExpectedImageNames no longer throw on an absent fileType MIME (C3 before r402 emits none, matching the editor's own image/png fallback); a caught detectImageDrift throw now surfaces as ManifestDrift.degraded instead of silently vanishing.
* [ADR 0024 — Script-source domain fact, generated-sibling rule, and dotted-extension convention](0024-script-source-fact-and-dotted-extensions.md) - SCRIPT_SOURCE_EXTENSIONS/isScriptSourceName/isGeneratedScriptOutput/filterAuthoredScriptPaths ship C3's own script-source and generated-.js-sibling rules as exported facts, and every dotted-extension domain fact in the library (breaking the prior undotted image tables) now carries a leading dot uniformly.
* [ADR 0025 — Section item-hood as a named axis, and stray files as diagnostic, not drift](0025-section-item-hood-and-stray-files.md) - A new C3_SECTION_ITEM_EXTENSION/isSectionItemName/find_all_section_items_path axis makes all seven name-section finders uniformly .json-filtered (narrowing find_all_layouts_path/find_all_objectTypes_path, a breaking change), and a new detectStrayFiles reports non-item files under a section root as a diagnostic that is never drift.
* [ADR 0026 — Split the fixture gate into skip-if-absent / throw-if-moved, backed by a computed --forbid-pending](0026-fixture-gate-skip-vs-throw-and-forbid-pending.md) - fixtureProjectAvailable/sdkFixtureAvailable replace bare existsSync gates with a three-way answer (skip if the fixture root is absent, throw if a specific path is missing, else proceed), and a computed .mocharc.cjs arms --forbid-pending only when both gated fixtures are fully materialized.
