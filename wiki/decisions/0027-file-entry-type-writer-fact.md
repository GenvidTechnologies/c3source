---
type: decision-context
title: "ADR 0027 — File-entry type as a writer-direction domain fact: EXTENSION_FILE_TYPES, C3_DEFAULT_FILE_TYPE, fileTypeForName"
description: c3source exports an open EXTENSION_FILE_TYPES table (extension to the MIME the C3 editor records on a rootFileFolders file entry), a C3_DEFAULT_FILE_TYPE fallback, and a case-insensitive fileTypeForName accessor — the first writer-direction MIME fact, with AUDITED and UNVALIDATED tiers inside one flat table.
tags: [adr, domain-facts, manifest, mime]
status: stable
generated: { by: process:maintain-wiki, at: 2026-10-05T12:00:00Z }
sources:
  - id: issue-86-evidence
    resource: ../../raw/issue-86-file-entry-type-evidence-2026-10-01.md
    title: "Issue #86 file-entry type evidence (capture, 2026-10-01)"
    last_modified: 2026-10-01
  - id: issue-86
    resource: https://github.com/GenvidTechnologies/c3source/issues/86
    title: "c3source#86 — a writer-direction MIME table for file entries"
---

# ADR 0027 — File-entry type as a writer-direction domain fact: EXTENSION_FILE_TYPES, C3_DEFAULT_FILE_TYPE, fileTypeForName

**Status:** accepted
**Date:** 2026-10-01
**Issue:** [#86](https://github.com/GenvidTechnologies/c3source/issues/86)

## Context

Every MIME table c3source owned before this one maps MIME to extension, for
**reading** a manifest: `IMAGE_FILE_TYPE_EXTENSIONS` and
`SCRIPT_FILE_TYPE_EXTENSIONS` ([ADR 0008](/decisions/0008-c3-domain-fact-tables.md),
[ADR 0024](/decisions/0024-script-source-fact-and-dotted-extensions.md)). A tool
that **writes** `rootFileFolders` entries, as a sync does, needs the opposite
direction: given a file name, what `type` would the editor have recorded?

Without an owned answer, a consumer hardcodes one, and the copies drift.
construct3-chef's local `MIME_MAP` is the worked example (chef#236): it lacks
the image, audio, and video extensions, and maps `.plist` to `text/xml` where
the editor records `application/octet-stream`[^issue-86-evidence].

The evidence is thinner than for a reading table. The editor bundle's
file-entry serializer writes `{name, type}` with `type` read from an opaque
getter; `projectResources.js` at r460 and r495 holds no extension-to-MIME table
for file entries[^issue-86-evidence]. The values are therefore **observed, not
specified**: what the editor wrote in real saves.

## Decision

**Option B: an exported open table, a default constant, and an accessor.**

- `EXTENSION_FILE_TYPES` is an exported open `Record<string, string>` keyed by a
  dotted, lowercase extension. It lives in the manifest module beside its two
  reading-direction siblings.
- `C3_DEFAULT_FILE_TYPE` is `application/octet-stream`, the value the editor
  was observed to record for `.plist` and `.vtt`. Whether the editor uses it for
  *every* extension it doesn't recognise is not established; it is the chosen
  default, not an observed rule.
- `fileTypeForName(name)` resolves a name through the table. It is
  case-insensitive, accepts a bare name or a `/`- or `\`-separated path (only
  the basename counts), and returns the default for a name with no extension or
  an unlisted one.

**Two tiers inside one table**, labelled with the existing [ADR
0022](/decisions/0022-domain-fact-audit-convention.md) labels and no new ones.
**AUDITED** means observed in two or more independent editor-saved projects;
**UNVALIDATED** means seen in one project or one editor save. The table as a
whole is **KNOWN INCOMPLETE**. The tier of each extension is recorded in the
table's JSDoc as a label; the counts live in
[C3 Domain Facts](/c3-domain-facts.md), per ADR 0022's numbers-never-in-JSDoc
rule.

**A third fallback policy.** The siblings differ on an unknown key:
`IMAGE_FILE_TYPE_EXTENSIONS` throws through its accessor,
`SCRIPT_FILE_TYPE_EXTENSIONS` yields `undefined`. This table, indexed directly,
yields `undefined`, and its accessor `fileTypeForName` yields the default. The
reason is the direction: a writer must emit *some* `type`, and octet-stream is
what the editor recorded for the two observed extensions it gave no specific
type (`.plist`, `.vtt`).

**The table is flat across sections.** A per-section table was a live
possibility until the maintainer's experiment of 2026-10-01 (C3 r49502): the
same audio `.webm` and `.ttf` were saved in the media sections
(`sound`/`music`/`font`) **and** under `files/` (`general`), and both recorded
identical strings, `audio/webm; codecs=opus` and `application/font-sfnt`. No
extension has ever been observed with two different types in any section across
all 38 manifests on the maintainer machine[^issue-86-evidence].

A browser `File.type` would not yield the `; codecs=opus` parameter, so the
value is **probably** probed from the file's content by the editor. That is an
inference from the output, not something read from the bundle, which hides the
mechanism behind the getter.

**Residuals, untested:** a `.webm` carrying video, and operating systems other
than the one the experiment ran on.

## Compromise

Six alternatives were rejected.

**A. Table and constant only, no accessor.** Every consumer then re-parses
extensions itself (case, paths, a trailing dot, no extension at all) and the
copies drift in exactly the way the table exists to prevent.

**C. An accessor over a private table.** This violates ADR 0008's rule that
domain facts are *exported* tables, and it removes the extension point ADR 0024
Compromise 5 kept open: a consumer that meets an extension the editor has
started writing cannot extend the table.

**D. Depend on `mime-db` / `mime-types`.** Measured against the editor, a
general-purpose MIME library diverges: `.ttf` is `font/ttf` (editor:
`application/font-sfnt`), `.webm` is `video/webm` (editor: `audio/webm;
codecs=opus`), `.vtt` is `text/vtt` (editor: `application/octet-stream`), `.ts`
is `video/mp2t` (editor: `application/typescript`), and `.plist` is absent
(editor: `application/octet-stream`)[^issue-86-evidence]. The point of the table
is to reproduce what the editor wrote, which is not what the web calls the
type. It would also add a dependency to cover about twenty rows.

**A per-section table.** The flat-table experiment shows the editor does not
vary the type by section, so per-section keys would duplicate every row for no
information.

**Two exported tier tables** (one AUDITED, one UNVALIDATED). Surface bloat for a
distinction a JSDoc label already carries, and a consumer would have to merge
them to look anything up.

**A `fallback` parameter on `fileTypeForName`.** YAGNI. A caller that wants
`undefined` for an unknown extension indexes the table directly, which already
yields it.

## Consequences

- **A minor release.** The change is additive: three new exports, no change to
  an existing signature.
- **construct3-chef#236 adopts it.** Nine of chef's ten keys are byte-identical
  to this table; `.plist` flips from `text/xml` to `application/octet-stream`
  **by design**, because the editor records the latter.
- **The table will drift from C3 as it ages**, as every domain fact does. The
  UNVALIDATED rows, each backed by a single save, are the likeliest to move; the
  tier label is how a consumer sees that.
- **Evidence collection is split across two channels.** The corpus scan
  (`scripts/scan-domain-facts.mjs` probe 10) refreshes the numbers; the
  editor-save experiment cannot be refreshed by the scanner and must be repeated
  by hand, the same two-provenance warning
  [C3 Domain Facts](/c3-domain-facts.md) already carries.
- **Complements, supersedes nothing.** ADRs 0008, 0022, and 0024 are extended,
  not revised.

## Related

- [ADR 0008 — C3 domain facts owned as exported tables in c3source](/decisions/0008-c3-domain-fact-tables.md) — the exported-table rule this table follows.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md) — the confidence labels reused for the two tiers.
- [ADR 0024 — Script-source domain fact, generated-sibling rule, and dotted-extension convention](/decisions/0024-script-source-fact-and-dotted-extensions.md) — the dotted-extension key convention and the open-table extension point.
- [C3 Domain Facts](/c3-domain-facts.md) — the evidence numbers behind the tiers.
- [Project Manifest](/project-manifest.md) — where the three exports sit beside their reading-direction siblings.

[^issue-86-evidence]: Issue #86 file-entry type evidence (capture, 2026-10-01)
