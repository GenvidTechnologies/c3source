# Changelog

All notable changes to `@genvidtech/c3source` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **This file was introduced at 2.0.0.** Every entry below it is **reconstructed
> from git history and the linked issues/PRs**, in the same spirit as the ADR
> backfill recorded in [`docs/decisions/README.md`](docs/decisions/README.md) —
> accurate as to *what shipped*, but written after the fact rather than at
> release time. Two consequences worth knowing:
>
> - [ADR 0024](docs/decisions/0024-script-source-fact-and-dotted-extensions.md)
>   states "with no CHANGELOG.md in this repo" as part of its reasoning. That was
>   true when it was accepted and is left unedited — an accepted ADR records the
>   state faced at its date, not later revisions.
> - **The package changed scope at 1.6.0, so its history spans two npm names.**
>   `0.0.1` through `1.5.0` were published as **`@genvid/c3source`**; `1.6.0`
>   onward are **`@genvidtech/c3source`**, following the org transfer
>   ([#41](https://github.com/GenvidTechnologies/c3source/issues/41)). Every
>   version below shipped to one registry name or the other — the git tags and the
>   registry agree throughout. Each scope also carries its own `0.0.1`, the
>   one-time bootstrap publish that claims a package name (npm's OIDC
>   trusted-publishing flow excludes a first publish, so it needs a short-lived
>   token).
>
>   **`@genvid/c3source` is frozen at 1.5.0 and is not the package you want.**
>   It is still installable and still resolves `latest` to 1.5.0, so a consumer
>   on the old name silently misses every release from 1.6.0 on — including two
>   majors' worth of breaking changes. Depend on `@genvidtech/c3source`.
>
> Ranges below are per git tag. Detailed rationale for architectural decisions
> lives in [`docs/decisions/`](docs/decisions/), not here — this file records
> *what changed*, the ADRs record *why*.

## [Unreleased]

## [2.0.0] - 2026-08-12

Two breaking changes ship together. The second rode this major at no extra cost
because the first was still untagged when it landed.

### Changed — BREAKING

- **Every extension-valued domain fact now carries a leading dot** (`".png"`, not
  `"png"`). Affects `IMAGE_FILE_TYPE_EXTENSIONS`, `SCRIPT_FILE_TYPE_EXTENSIONS`,
  `C3_LEGACY_IMAGE_EXTENSION` and `ExpectedImage.ext`
  ([#73](https://github.com/GenvidTechnologies/c3source/issues/73),
  [#74](https://github.com/GenvidTechnologies/c3source/issues/74)) — see
  [ADR 0024](docs/decisions/0024-script-source-fact-and-dotted-extensions.md).
- **`find_all_layouts_path` and `find_all_objectTypes_path` (and the `C3Project`
  methods over them) return only `.json` section items.** They previously
  returned every non-editor-local file. All seven name-section finders now share
  one policy ([#76](https://github.com/GenvidTechnologies/c3source/issues/76)) —
  see [ADR 0025](docs/decisions/0025-section-item-hood-and-stray-files.md).

  The split they had was never designed: it was inherited drift from three
  separately hand-written collectors, and the rationale later offered for it
  (that these folders hold non-`.json` companion assets) is measurably false.
  `README.md` had documented these functions as collecting `.json` files since
  the initial release, so this makes the code match its own published contract.

  **Migration:** the previous behaviour is recoverable verbatim as
  `find_all_files_path(dir, (f) => !isEditorLocalPath(f))`. Consumers that piped
  finder output straight into `JSON.parse` need **no change** — those calls were
  previously unguarded and are now safe by construction.

### Added

- `C3_SECTION_ITEM_EXTENSION`, `isSectionItemName`, `find_all_section_items_path`
  — item-hood as a named walk axis alongside provenance (`isEditorLocalPath`) and
  reachability (`descend`) ([#76](https://github.com/GenvidTechnologies/c3source/issues/76)).
- `StrayFile`, `detectStrayFiles`, `ManifestDrift.strays`,
  `C3Project.detectStrayFiles()` — non-item files under a name-section root
  reported as a **diagnostic, never drift**. `inSync` keeps its definition,
  `DriftKind` is unchanged, and `strays` is omitted when empty, so a clean
  project's result object is unchanged from 1.9.0.
- `SCRIPT_SOURCE_EXTENSIONS`, `isScriptSourceName`, `isGeneratedScriptOutput`,
  `filterAuthoredScriptPaths`, `SCRIPT_FILE_TYPE_EXTENSIONS` — C3 script-source
  facts, including the generated-`.js`-sibling rule
  ([#73](https://github.com/GenvidTechnologies/c3source/issues/73),
  [#74](https://github.com/GenvidTechnologies/c3source/issues/74)).
- `scripts/scan-domain-facts.mjs` covers all nine domain-fact tables
  ([#77](https://github.com/GenvidTechnologies/c3source/issues/77)).

## [1.9.0] - 2026-08-04

### Added

- Reference-integrity detection — unresolved addon, family-member, instance-type
  and event-class references
  ([#60](https://github.com/GenvidTechnologies/c3source/issues/60)); see
  [ADR 0021](docs/decisions/0021-reference-integrity-detection.md).
- `project.c3proj` serializer and tolerant read mode — `serializeProjectManifest`,
  `writeProjectManifest`, `parseProjectManifestTolerant`
  ([#57](https://github.com/GenvidTechnologies/c3source/issues/57),
  [#58](https://github.com/GenvidTechnologies/c3source/issues/58)); see
  [ADR 0016](docs/decisions/0016-c3-source-json-serialization-form.md) and
  [ADR 0017](docs/decisions/0017-tolerant-manifest-read.md).
- Caller-controlled descent for `find_all_files_path`, making `ts-defs/`
  reachable without narrowing the editor-local classifier
  ([#63](https://github.com/GenvidTechnologies/c3source/issues/63)); see
  [ADR 0020](docs/decisions/0020-caller-controlled-walk-descent.md).
- `custom-ace-name-required` editor-strictness rule, verified by a direct
  C3-editor import experiment
  ([#70](https://github.com/GenvidTechnologies/c3source/issues/70)).

### Changed

- Adopted `construct3-sample` as the canonical C3 reference fixture and retired
  the committed one ([#55](https://github.com/GenvidTechnologies/c3source/issues/55),
  [#56](https://github.com/GenvidTechnologies/c3source/issues/56)); see
  [ADR 0015](docs/decisions/0015-canonical-c3-reference-fixture.md).

### Fixed

- `*.brush.json` is classified as minified project **source**, not editor-local
  ([#59](https://github.com/GenvidTechnologies/c3source/issues/59)); see
  [ADR 0018](docs/decisions/0018-brush-json-minified-source-not-editor-local.md).
- The canonical fixture materializes from tracked `HEAD`, not the submodule
  working tree ([#64](https://github.com/GenvidTechnologies/c3source/issues/64));
  see [ADR 0019](docs/decisions/0019-hermetic-fixture-materialization.md).

## [1.8.0] - 2026-07-21

### Added

- `.c3addon` domain layer — package reader, ACE model, `usedAddons`, attribution
  and discovery ([#44](https://github.com/GenvidTechnologies/c3source/issues/44)).
  Introduces the package's first runtime dependency, `fflate`; see
  [ADR 0013](docs/decisions/0013-fflate-dependency-c3addon-reader.md).
- `extractExpressionReferences` — a tokenizer over raw C3 expression strings
  ([#43](https://github.com/GenvidTechnologies/c3source/issues/43)).

### Changed

- `src/c3source.ts` split into per-area modules, with the public API surface
  proven byte-identical
  ([#47](https://github.com/GenvidTechnologies/c3source/issues/47)); see
  [ADR 0012](docs/decisions/0012-per-area-module-split.md).
- CI checks out submodules recursively, so SDK-gated addon tests actually run
  ([#49](https://github.com/GenvidTechnologies/c3source/issues/49)).

## [1.7.0] - 2026-06-29

### Added

- `COMPARISON_OPERATORS` / `comparisonSymbol` and operator annotation in the DSL
  renderer ([#39](https://github.com/GenvidTechnologies/c3source/issues/39)).

## [1.6.0] - 2026-06-26

**The scope rename.** First version published as `@genvidtech/c3source`;
everything from 0.0.1 to 1.5.0 shipped as `@genvid/c3source`.

### Added

- `C3Project` handle completed with every canonical section directory
  ([#38](https://github.com/GenvidTechnologies/c3source/issues/38)).

### Changed

- Package renamed to the `@genvidtech` scope; repository URLs updated after the
  org transfer ([#41](https://github.com/GenvidTechnologies/c3source/issues/41)).

## [1.5.0] - 2026-06-17

### Added

- `C3Project` / `openProject(root)` — a root-bound handle owning project
  structure ([#36](https://github.com/GenvidTechnologies/c3source/issues/36)).

## [1.4.0] - 2026-06-09

### Added

- `validateForEditor` / `validateEventForEditor` and the extensible
  `EDITOR_FIELD_RULES` table
  ([#33](https://github.com/GenvidTechnologies/c3source/issues/33)).

## [1.3.0] - 2026-06-03

### Fixed

- Image extensions resolve from the `fileType` MIME rather than an assumed
  `.png` ([#29](https://github.com/GenvidTechnologies/c3source/issues/29)).
- `timelines/transitions` modelled as an unnamed subfolder in drift detection
  ([#28](https://github.com/GenvidTechnologies/c3source/issues/28)).

## [1.2.0] - 2026-06-03

### Added

- `isEventVarReference` / `getEventVarReferenceName` and the
  `EVENTVAR_REFERENCE_ACES` fact table
  ([#26](https://github.com/GenvidTechnologies/c3source/issues/26)).

## [1.1.0] - 2026-06-02

### Added

- `ExtractedFunction` carries its `params`/`returnType` signature; new
  `extractIncludes` ([#23](https://github.com/GenvidTechnologies/c3source/issues/23),
  [#24](https://github.com/GenvidTechnologies/c3source/issues/24)).

## [1.0.0] - 2026-06-02

### Changed — BREAKING

- `project.c3proj` drift detection returns structured, path-bearing entries
  ([#21](https://github.com/GenvidTechnologies/c3source/issues/21)).

## [0.6.0] - 2026-06-02

### Added

- SID walking, the editor-local classifier, and the `project.c3proj` manifest
  model ([#18](https://github.com/GenvidTechnologies/c3source/issues/18),
  [#19](https://github.com/GenvidTechnologies/c3source/issues/19)).

## [0.5.0] - 2026-06-01

### Added

- `find_all_files_path` exported for non-source artifact discovery
  ([#16](https://github.com/GenvidTechnologies/c3source/issues/16)); see
  [ADR 0005](docs/decisions/0005-single-canonical-traversal-walk.md).

## [0.4.0] - 2026-05-31

### Added

- Early-exit layer finders and the shared `walkLayerEntries` generator
  ([#10](https://github.com/GenvidTechnologies/c3source/issues/10)).

### Changed

- The three `find_all_*_path` collectors collapsed onto one recursive walk
  ([#14](https://github.com/GenvidTechnologies/c3source/issues/14)).

### Fixed

- C3 r487 `uistate/` subfolders skipped during source traversal
  ([#12](https://github.com/GenvidTechnologies/c3source/issues/12)).

## [0.3.1] - 2026-05-30

### Fixed

- Package entry points point at `dist/` so the package actually installs
  ([#8](https://github.com/GenvidTechnologies/c3source/issues/8)). npm ignores
  the `publishConfig.{main,types,exports}` overrides that pnpm/yarn honour, so
  the `src/` paths had been leaking into the tarball.

## [0.3.0] - 2026-05-30

### Added

- Initial release, extracted from the `burbank` monorepo — layout traversal,
  layer/instance visitors, and event-sheet extraction.

## 0.0.1 — *published under both scopes, never tagged*

A bootstrap publish that claims a package name on npm, made with a short-lived
token because npm's OIDC trusted-publishing flow excludes a first publish; the
token is revoked once the trusted publisher is configured. It carries no
meaningful library content. There are two of these — one under `@genvid` at the
project's start, and one under `@genvidtech` when the scope rename at 1.6.0
needed the new name claimed the same way.

[Unreleased]: https://github.com/GenvidTechnologies/c3source/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.9.0...v2.0.0
[1.9.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/GenvidTechnologies/c3source/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/GenvidTechnologies/c3source/compare/v0.6.0...v1.0.0
[0.6.0]: https://github.com/GenvidTechnologies/c3source/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/GenvidTechnologies/c3source/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/GenvidTechnologies/c3source/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/GenvidTechnologies/c3source/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/GenvidTechnologies/c3source/releases/tag/v0.3.0
