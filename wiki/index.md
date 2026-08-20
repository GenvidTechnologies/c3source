---
okf_version: "0.2"
---

<!-- `okf_version` is the ONLY frontmatter key permitted here (§8/§12) — this
     file scaffolds the bundle-root index (`wiki/index.md`, the OKF
     bundle root per ADR-0022). A `wiki/<subdir>/index.md` carries NO
     frontmatter at all. -->

# Wiki Index

This is the wiki's table of contents — every page under `wiki/`,
grouped under section headings, one line each. `/gvt-dev:maintain-wiki`
keeps this list current: a new page is added here when it's created, and
`lint` flags any page listed in **no** index — here, or in a
subdirectory's own `index.md`. Each entry's description is the linked
page's frontmatter `description`, so the index and the page can't drift.
See `docs/wiki-schema.md` for the page format and maintenance rules.

## Library

* [Library Overview](library-overview.md) - c3source is a TypeScript library of typed interfaces and traversal/formatting functions for Construct 3 project source files on disk, consumed by build tools, code generators, and analyzers outside the C3 editor.
* [Module Architecture](module-architecture.md) - c3source's logic is split across seven per-area modules imported in an acyclic DAG, re-exported through a thin internal barrel, published as built dist/ artifacts, and verified byte-identical across refactors by a dedicated API-surface script.

## Layouts & Manifest

* [Layout Traversal](layout-traversal.md) - find_all_files_path is the single canonical recursive disk walk underneath c3source's layout, section-item, and script-source collectors, with provenance, reachability, and item-hood kept as three deliberately orthogonal axes, plus the layer-visitor mutation contract built on the same walk pattern.
* [Project Manifest](project-manifest.md) - c3source models project.c3proj with strict and tolerant parse paths that share one shape-rule collector, a byte-faithful serializer/writer, and structured drift detection covering missing/untracked/moved items, timeline transitions, image derivation, and stray files.
* [C3Project Handle](c3project-handle.md) - openProject(root) is a no-I/O-at-construction, root-bound handle over the full canonical set of C3 on-disk subfolders, wrapping the free-function finders and detectors and adding a write-through, never-invalidate manifest cache.

## Event Sheets

* [Event-Sheet Extraction](event-sheet-extraction.md) - visitEvents is the single canonical depth-first event-numbering walk that every c3source extractor (scripts, functions, includes, SIDs, editor-strictness validation) consumes, with lexical scope, event-variable references, and raw expression text each handled by a dedicated, thin, never-throwing collector.

## Serialization

* [Serialization Form](serialization-form.md) - c3source's single write owner, serializeC3Json/writeC3JsonFile, reproduces C3's on-disk JSON form exactly — tab-indented with no trailing newline, the inverse of the usual text-file convention — with one documented minified-source exception for tilemap brush files.

## Addons & References

* [Addon Domain Layer](addon-domain-layer.md) - c3source models and discovers .c3addon plugin/behavior/effect packages — attribution from an item's own declared fields, package reading with directory-vs-zip auto-detection via fflate, and a pure ACE-model parser — while validation, diffing, and rendering stay the consumer's job.
* [Reference Integrity](reference-integrity.md) - detectReferenceIntegrity finds unresolved name-keyed cross-references a project's own manifest and source data imply — addon, family-member, instance-type, and event-objectClass edges — via four pure detectors plus one I/O orchestrator, distinct from editor-observed rejections.

## C3 Domain Knowledge

* [C3 Domain Facts](c3-domain-facts.md) - c3source owns exported tables naming undocumented C3 platform facts, each carrying a confidence label paired with its blast radius, validated via two evidence channels — a corpus scan of real projects and C3's own editor bundle — that answer different questions and must never be conflated when a table's findings mix both provenances.
* [Canonical Reference Fixture](canonical-fixture.md) - construct3-sample is the tag-pinned, editor-round-tripped golden C3 project c3source validates against rather than owns, materialized hermetically into the gitignored test fixture directory and enriched only upstream, never by hand-authoring the overlay.
* [Design Patterns](design-patterns.md) - Reusable engineering patterns c3source has settled on — single-source counters, thin traversal wrappers, traversal-vs-rendering splits, path-bearing drift diffing, collect-then-throw-first validation, evidence-bearing audit tooling, and a real-export-ground-truth testing strategy — each kept with its motivating problem and trade-off.

## Decision Records

* [Decision Records](decisions/index.md) - Architecture Decision Records (MADR-lite: Status, Context, Decision, Compromise, Consequences) for c3source, migrated from docs/decisions/ into the wiki, one page per record plus a subdirectory index.

## Process

* [Development Workflow](development-workflow.md) - c3source's day-to-day working conventions — npm/Node, the four checks and the gate that chains them, mocha/chai/tsx test invocation, the hard rule against running Prettier, the file:line citation policy, and the ephemeral-work-doc / durable-record split.
* [CI & Publishing](ci-and-publishing.md) - c3source's CI runs the shared, secret-free node-gate reusable workflow on GitHub Actions; publishing to the public npm registry as @genvidtech/c3source is tag-triggered and uses OIDC trusted publishing with no long-lived token, and CHANGELOG.md must have Unreleased moved into a dated section before a tag is pushed.
