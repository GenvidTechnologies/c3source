# Wiki Log

Record of every `ingest` run: what changed, why, and which `raw/` source
drove it, grouped under `## YYYY-MM-DD` date headings (ISO 8601) with the
**newest date group first**. Entries are prose bullets, e.g. `* **Update**:
…`, `* **Creation**: …`, `* **Deprecation**: …` — the leading bold word is a
convention, not a requirement.

**Add newest first, never edit or remove a prior entry.** "Newest first"
means a new entry (and, if today isn't already the top group, a new
`## YYYY-MM-DD` heading) is *prepended* above everything else — the
insertion point moves from the bottom to the top, but prepending never
touches a prior entry's text, so the append-only guarantee holds exactly as
before. If a past entry itself needs correcting, add a new entry that says
so; never edit or remove the old one in place. See `docs/wiki-schema.md` for
the full maintenance schema.

## 2026-10-05

* **Update**: design-patterns.md — added "Testing a `scripts/*.mjs` helper from a TS test" and "A hermetic git superproject in a test" (first instance `findGitlinkDrift`, #88).
* **Update**: decisions/0028-prep-fixture-warns-on-gitlink-drift.md and canonical-fixture.md — now cite `raw/issue-88-gitlink-drift-2026-10-05.md`; ADR links follow-up #90 for the CI-fatal option.
* **Creation**: decisions/0028-prep-fixture-warns-on-gitlink-drift.md, driven by issue #88 (see the `raw/issue-88-gitlink-drift-2026-10-05.md` capture added in the entry above).
* **Update**: canonical-fixture.md — replaced the manual HEAD-vs-gitlink check and the "proposed" note with the shipped prep-fixture drift warning (#88), linking ADR 0028.
* **Update**: canonical-fixture.md — pin bumped to construct3-sample v1.2.0 (version-history row, 122 materialized files), plus the HEAD-vs-gitlink and gitignored-fixture-dir hazards (#86, #88); project-manifest.md — sound/music/font/general now fixture-validated, only video inferred.
* **Creation**: decisions/0027-file-entry-type-writer-fact.md, driven by `raw/issue-86-file-entry-type-evidence-2026-10-01.md`.
* **Update**: c3-domain-facts.md — added the EXTENSION_FILE_TYPES writer-direction fact (tiers, evidence numbers), the Ten-tables count, and the google/burbank re-run glob warning, driven by `raw/issue-86-file-entry-type-evidence-2026-10-01.md`.
* **Update**: project-manifest.md — added the mapping-direction paragraph for EXTENSION_FILE_TYPES / fileTypeForName / C3_DEFAULT_FILE_TYPE.

## 2026-10-01

* **Creation**: issue-triage.md, driven by `raw/docs-issue-triage-2026-10-01.md`.

## 2026-08-20

* **Update**: module-architecture.md — strengthened the JSDoc-dump asymmetry evidence with a controlled both-halves experiment, driven by `raw/2026-08-20-jsdoc-dump-asymmetry-experiment.md`.
* **Creation**: decisions/0026-fixture-gate-skip-vs-throw-and-forbid-pending.md, driven by `raw/adr-0026-fixture-gate-skip-vs-throw-and-forbid-pending-2026-08-20.md`.
* **Creation**: decisions/0025-section-item-hood-and-stray-files.md, driven by `raw/adr-0025-section-item-hood-and-stray-files-2026-08-20.md`.
* **Creation**: decisions/0024-script-source-fact-and-dotted-extensions.md, driven by `raw/adr-0024-script-source-fact-and-dotted-extensions-2026-08-20.md`.
* **Creation**: decisions/0023-pre-r402-image-serialization-drift-degradation.md, driven by `raw/adr-0023-pre-r402-image-serialization-drift-degradation-2026-08-20.md`.
* **Creation**: decisions/0022-domain-fact-audit-convention.md, driven by `raw/adr-0022-domain-fact-audit-convention-2026-08-20.md`.
* **Creation**: decisions/0021-reference-integrity-detection.md, driven by `raw/adr-0021-reference-integrity-detection-2026-08-20.md`.
* **Creation**: decisions/0020-caller-controlled-walk-descent.md, driven by `raw/adr-0020-caller-controlled-walk-descent-2026-08-20.md`.
* **Creation**: decisions/0019-hermetic-fixture-materialization.md, driven by `raw/adr-0019-hermetic-fixture-materialization-2026-08-20.md`.
* **Creation**: decisions/0018-brush-json-minified-source-not-editor-local.md, driven by `raw/adr-0018-brush-json-minified-source-not-editor-local-2026-08-20.md`.
* **Creation**: decisions/0017-tolerant-manifest-read.md, driven by `raw/adr-0017-tolerant-manifest-read-2026-08-20.md`.
* **Creation**: decisions/0016-c3-source-json-serialization-form.md, driven by `raw/adr-0016-c3-source-json-serialization-form-2026-08-20.md`.
* **Creation**: decisions/0015-canonical-c3-reference-fixture.md, driven by `raw/adr-0015-canonical-c3-reference-fixture-2026-08-20.md`.
* **Creation**: decisions/0014-sdk-submodule-recursive-ci-checkout.md, driven by `raw/adr-0014-sdk-submodule-recursive-ci-checkout-2026-08-20.md`.
* **Creation**: decisions/index.md, driven by `raw/adr-README-2026-08-20.md`.
* **Creation**: decisions/0013-fflate-dependency-c3addon-reader.md, driven by `raw/adr-0013-fflate-dependency-c3addon-reader-2026-08-20.md`.
* **Creation**: decisions/0012-per-area-module-split.md, driven by `raw/adr-0012-per-area-module-split-2026-08-20.md`.
* **Creation**: decisions/0011-c3-expression-tokenizer.md, driven by `raw/adr-0011-c3-expression-tokenizer-2026-08-20.md`.
* **Creation**: decisions/0010-c3project-root-handle.md, driven by `raw/adr-0010-c3project-root-handle-2026-08-20.md`.
* **Creation**: decisions/0009-editor-strict-validation.md, driven by `raw/adr-0009-editor-strict-validation-2026-08-20.md`.
* **Creation**: decisions/0008-c3-domain-fact-tables.md, driven by `raw/adr-0008-c3-domain-fact-tables-2026-08-20.md`.
* **Creation**: decisions/0007-coordinate-bearing-returns.md, driven by `raw/adr-0007-coordinate-bearing-returns-2026-08-20.md`.
* **Creation**: decisions/0006-editor-local-classifier.md, driven by `raw/adr-0006-editor-local-classifier-2026-08-20.md`.
* **Creation**: decisions/0005-single-canonical-traversal-walk.md, driven by `raw/adr-0005-single-canonical-traversal-walk-2026-08-20.md`.
* **Creation**: decisions/0004-dist-entry-points-no-publishconfig.md, driven by `raw/adr-0004-dist-entry-points-no-publishconfig-2026-08-20.md`.
* **Creation**: decisions/0003-github-actions-oidc-publishing.md, driven by `raw/adr-0003-github-actions-oidc-publishing-2026-08-20.md`.
* **Creation**: decisions/0002-canonical-event-numbering.md, driven by `raw/adr-0002-canonical-event-numbering-2026-08-20.md`.
* **Creation**: decisions/0001-single-module-esm-library.md, driven by `raw/adr-0001-single-module-esm-library-2026-08-20.md`.
* **Creation**: addon-domain-layer.md, driven by `raw/docs-api-guide-addons-2026-08-20.md` and `raw/claude-md-2026-08-20.md`.
* **Creation**: reference-integrity.md, driven by `raw/docs-api-guide-references-2026-08-20.md` and `raw/claude-md-2026-08-20.md`.
* **Creation**: c3-domain-facts.md, driven by `raw/docs-domain-fact-audit-2026-08-20.md` and `raw/claude-md-2026-08-20.md`.
* **Creation**: canonical-fixture.md, driven by `raw/claude-md-2026-08-20.md`.
* **Creation**: development-workflow.md, driven by `raw/claude-md-2026-08-20.md`.
* **Creation**: ci-and-publishing.md, driven by `raw/claude-md-2026-08-20.md`.
* **Creation**: design-patterns.md, driven by `raw/docs-design-patterns-2026-08-20.md`.
* **Creation**: library-overview.md, driven by `raw/claude-md-2026-08-20.md` and `raw/docs-api-guide-2026-08-20.md`.
* **Creation**: module-architecture.md, driven by `raw/claude-md-2026-08-20.md`.
* **Creation**: layout-traversal.md, driven by `raw/claude-md-2026-08-20.md` and `raw/docs-api-guide-2026-08-20.md`.
* **Creation**: project-manifest.md, driven by `raw/claude-md-2026-08-20.md` and `raw/docs-api-guide-manifest-2026-08-20.md`.
* **Creation**: c3project-handle.md, driven by `raw/claude-md-2026-08-20.md` and `raw/docs-api-guide-project-2026-08-20.md`.
* **Creation**: event-sheet-extraction.md, driven by `raw/claude-md-2026-08-20.md` and `raw/docs-api-guide-extraction-2026-08-20.md`.
* **Creation**: serialization-form.md, driven by `raw/claude-md-2026-08-20.md`.

<!-- Example — two date groups, newest first, illustrating the ordering.
     Replace with your first real ingest entry, or delete once the log has
     one of its own.

## 2026-08-03

* **Update**: example-topic.md — added X, driven by `raw/example-source.md`.

## 2026-08-01

* **Creation**: example-topic.md, driven by `raw/example-source.md`.
-->
