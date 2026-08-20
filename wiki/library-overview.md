---
type: reference
title: Library Overview
description: c3source is a TypeScript library of typed interfaces and traversal/formatting functions for Construct 3 project source files on disk, consumed by build tools, code generators, and analyzers outside the C3 editor.
tags: [overview, architecture, consumers, c3source]
status: stable
stale_after: 2027-08-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
  - id: api-guide
    resource: ../raw/docs-api-guide-2026-08-20.md
    title: "docs/api-guide.md (c3source API guide, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Library Overview

## What c3source is

c3source is a TypeScript library of typed interfaces and traversal/formatting
functions for **Construct 3 (C3) project source files on disk**[^claude-md] —
layouts, layers, instances, object types, and event sheets. It is consumed by
build tools, code generators, and analyzers that inspect or mutate C3 JSON
outside the C3 editor[^claude-md]. There is no runtime application; it ships
as a library[^claude-md].

## Scope: folder-projects only

Every c3source function that reads or writes `project.c3proj`, or walks a
project directory, works with **folder-projects only** — the on-disk
directory layout C3 exports — never the single-file `.c3p` archive
export[^api-guide]. This boundary is stated explicitly wherever the
manifest/traversal functions are documented; it is a hard scope limit, not an
incidental gap.

## Known downstream consumers

Three consumers are checked out under `C:\repos` on the maintainer's dev
machine, all depending on the published `@genvidtech/c3source`[^claude-md]:

- **burbank** — the monorepo c3source was extracted from; still consumes it
  via `bin/` scripts.
- **construct3-chef** — the heaviest consumer; MCP server + generators.
- **c3-domain-manager** — domain index + `list-uncategorized`.

Because the package is public, this list is a **floor rather than a
census**[^claude-md] — but it is the set whose breakage is *observable from
this machine*, which is what makes the operating rule practical: **measure
the blast radius of an API change by grepping all three, not by reasoning
about what a hypothetical caller might do**[^claude-md].

That measurement is what settles policy questions, not intuition about who
"might" rely on something. Issue #76 is the worked example: the question
"would anyone rely on the permissive collectors?" turned, once measured, into
"six call sites across two of the three consumers pipe permissive output
straight into `JSON.parse` with no guard" — which inverted the answer from *a
capability someone may depend on* to *a latent crash*, and decided the
direction of the fix[^claude-md].

The consumers' own decision records are evidence too, and can be
**blocking**: on #76, c3-domain-manager's own ADR 0017 recorded this
library's inconsistency as "a platform fact this repo does not own and is not
free to unify by itself" — which is what ruled out a documentation-only
answer to the issue[^claude-md].

## C3-version pinning caveat

c3source's exported C3 domain-fact tables (e.g. the event-variable ACE table,
the image file-type-extension map, the editor-loader field-requirement table)
are pinned observations about specific C3 releases, not permanent truths
about the platform. Each carries a confidence label —
`AUDITED`/`KNOWN INCOMPLETE`/`UNVALIDATED`/`NOT CORPUS-AUDITABLE` — paired
with the blast radius of being wrong, because that blast radius differs
sharply per table: some contaminate every drift result, some throw, some are
silent false negatives or purely cosmetic[^claude-md].

Deliberately, **numbers never go in JSDoc**: JSDoc ships to consumers inside
`dist/*.d.ts`, where a claim like "audited against 14 projects" goes false the
day a 15th project is scanned. Counts, release lists, and scan dates live in
the maintainer's own audit doc instead; JSDoc carries only the confidence
label and a pointer. A **release pin** (e.g. `r402`, `r437`) is the one
exception allowed in JSDoc, because it names a fixed historical fact rather
than a rotting count[^claude-md].

## Built on undocumented internals

C3 has no published on-disk file-format specification. c3source's domain
facts are derived by reading real project fixtures (a maintained local
corpus of real C3 projects), by bisecting C3's own hosted editor bundle
(`editor.construct.net/r{NNN}/`) release by release, and — where a fact
concerns runtime editor behavior rather than serialized shape — by running
live-editor experiments[^claude-md]. This is why the corpus-plus-bundle audit
discipline exists at all: a corpus scan alone can prove *what values occur*,
but only the bundle can prove *what the mechanism is* — a corpus cannot
structurally distinguish "value X never occurred" from "value X is
impossible." A domain-fact table can therefore be wrong in its *shape*, not
just its *values*, and the audit convention exists to catch both[^claude-md].

## Related

- [Module Architecture](/module-architecture.md) — the module DAG this library is built from, and the verification tooling that guards its public API surface.
- [Layout Traversal](/layout-traversal.md) — the canonical recursive walk and its three orthogonal classification axes.
- [Project Manifest](/project-manifest.md) — the `project.c3proj` model and drift detection this library provides.
- [C3Project Handle](/c3project-handle.md) — the root-bound convenience handle over the free-function API.
- [Event-Sheet Extraction](/event-sheet-extraction.md) — script, function, and reference extraction from event sheets.
- [Serialization Form](/serialization-form.md) — the on-disk write form this library reproduces exactly.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
[^api-guide]: docs/api-guide.md (c3source API guide, 2026-08-20 capture)
