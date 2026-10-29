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
so; never edit or remove the old one in place. See [`schema.md`](schema.md) for
the full maintenance schema.

## 2026-10-29

* **Creation**: decisions/0034-declared-empty-item-name-fails-manifest-validation.md (and its entry in decisions/index.md); **Update**: decisions/0031-empty-stem-is-not-a-section-item.md (Status line and a Related bullet only, naming ADR 0034 as superseding its validation paragraph), project-manifest.md and c3-domain-facts.md (the declared-`""` rule is shipped as `name-folder-item-empty`, no longer proposed); driven by `raw/issue-100-empty-name-live-editor-2026-10-28.md` (issues #100, #106).
* **Update**: c3-domain-facts.md — added "Running one" under the live-editor channel (copies outside AppData, a space-free control, outcome words agreed up front, forced save, editor release per result); schema.md — added the rule to clean personal paths from a `raw/` capture before its first merge; driven by `raw/issue-100-empty-name-live-editor-2026-10-28.md` (issue #100, session retro).

## 2026-10-28

* **Update**: c3-domain-facts.md (live-editor result per section for a declared empty item name, the `C3_SECTION_ITEM_EXTENSION` inventory row, the live-editor channel, and the page description naming that channel) and project-manifest.md (the "Manifest validation is unchanged" paragraph, still true, now pointing at the proposed rule in #106); driven by `raw/issue-100-empty-name-live-editor-2026-10-28.md` (issue #100).
* **Update**: development-workflow.md — added the subsection "Tests that spawn `git`" (build the fixture once into a template, `cpSync` per test, per-describe `this.timeout`); driven by `raw/issue-102-gitlinkdrift-hook-timeouts-2026-10-28.md` (issue #102).
* **Update**: design-patterns.md — under "Testing: real-export ground truth + inline legibility", added the mutation-checked-tests note (assert a looked-up result exists before dereferencing it) and pointed it at the promoted `scripts/mutate.mjs` harness; driven by the #97/#101 mutation run, where M97-b failed by `TypeError` (recorded on issue #97).
* **Update**: project-manifest.md — documented `resolveManifestFolders`, the transitions-container `folder-missing` suppression, name-plus-path keying in `diffNameMaps`, and the advisory `ManifestDrift.duplicates?`; removed the false "name uniqueness is a C3 invariant" claim; driven by `raw/issue-97-101-drift-evidence-2026-10-28.md` (issues #97, #101; ADRs 0032, 0033).
* **Update**: c3-domain-facts.md — added the `TIMELINE_TRANSITIONS_FOLDER` inventory row and the sections "The timelines transitions container" and "Item-name uniqueness scope" (scope and case sensitivity marked UNVALIDATED); driven by `raw/issue-97-101-drift-evidence-2026-10-28.md` and `raw/issue-95-empty-stem-evidence-2026-10-27.md`.
* **Update**: design-patterns.md — reworked the name→path drift pattern to key on name plus path; added the advisory-report-fields and origin-keyed-suppression pattern; driven by `raw/issue-97-101-drift-evidence-2026-10-28.md`.

## 2026-10-27

* **Update**: c3-domain-facts.md — rule 2 of "Three validation rules" now says a release-and-section confidence label claims every pair, with the models3d case; driven by `raw/issue-95-empty-stem-evidence-2026-10-27.md` (a session retro on #95).
* **Creation**: decisions/0031-empty-stem-is-not-a-section-item.md, driven by `raw/issue-95-empty-stem-evidence-2026-10-27.md`; indexed in decisions/index.md. Records that `isSectionItemName` rejects an empty stem (3.0.0), and answers whether C3 loads a nameless `.json` item.
* **Update**: c3-domain-facts.md — new section "Item-hood at the empty-stem boundary" with separate bundle and corpus evidence, and the `C3_SECTION_ITEM_EXTENSION` table row; the corpus figure was re-run and deduplicated (the inherited 12,672 was not reproduced and is not quoted); driven by `raw/issue-95-empty-stem-evidence-2026-10-27.md`.
* **Update**: layout-traversal.md (Axis 3) and project-manifest.md (Stray files) — the empty-stem rule, the `.json` stray, and a declared `""` reading as `missing` drift; driven by `raw/issue-95-empty-stem-evidence-2026-10-27.md`.
* **Creation**: schema.md, moved with `git mv` from `docs/wiki-schema.md` and given OKF frontmatter (`type: convention`); driven by `raw/docs-wiki-schema-2026-10-27.md`. The "out-of-bundle link" example now names `../CHANGELOG.md`/`../README.md` instead of files under `docs/`.
* **Update**: issue-triage.md — merged the operational contract (the eight contract sections and full `gh` mutation recipes) into the page, which is now the contract itself, resolved via `paths["docs/issue-triage.md"]`; removed the "why the contract still lives at docs/" section and the editing-workflow note; `type` is now `convention`; driven by `raw/docs-issue-triage-2026-10-01.md` (unchanged capture, byte-identical to the retired `docs/issue-triage.md`).
* **Update**: index.md — added the Schema section, plain-text pointers to `CLAUDE.md`, `CHANGELOG.md` and `README.md` carried over from the retired `docs/TOC.md` (captured as `raw/docs-toc-2026-10-27.md`), and the new Issue Triage description.
* **Deprecation**: `docs/` retired. `docs/TOC.md` is now `wiki/index.md`, `docs/wiki-schema.md` is `wiki/schema.md` and `docs/issue-triage.md` is `wiki/issue-triage.md`, via the `paths` overrides in `.gvt-agent.json` under gvt-dev 4.41.0 (open upstream: gvt-dev #374/#388).

## 2026-10-06

* **Update**: decisions/0028-prep-fixture-warns-on-gitlink-drift.md, decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md, canonical-fixture.md and ci-and-publishing.md — status lines and prose now point to ADR 0030 for strict mode failing on an unverifiable pin and the publish gate opting in (#93).
* **Creation**: decisions/0030-prep-fixture-strict-fails-on-unverifiable-pin.md, driven by issue #93.
* **Update**: decisions/0028-prep-fixture-warns-on-gitlink-drift.md and canonical-fixture.md — status and prose now point to ADR 0029 for the strict-mode (CI-fatal) follow-through; canonical-fixture.md also cites `raw/issue-90-prep-fixture-strict-2026-10-06.md`.
* **Creation**: decisions/0029-prep-fixture-drift-fatal-under-explicit-opt-in.md, driven by issue #90 (see the `raw/issue-90-prep-fixture-strict-2026-10-06.md` capture).

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
