---
type: reference
title: Serialization Form
description: c3source's single write owner, serializeC3Json/writeC3JsonFile, reproduces C3's on-disk JSON form exactly — tab-indented with no trailing newline, the inverse of the usual text-file convention — with one documented minified-source exception for tilemap brush files.
tags: [serialization, c3-source-json, writing, c3-domain-facts]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# Serialization Form

## `serializeC3Json`/`writeC3JsonFile`

All file writes in c3source go through `src/serialize.ts`'s
`serializeC3Json`/`writeC3JsonFile` — the **single owner** of the C3
source-JSON write form[^claude-md]. `serialize.ts` is the sole leaf of the
module DAG (see [Module Architecture](/module-architecture.md)): it imports
nothing else from the package, and every other module that writes a file —
notably the manifest writer described in [Project Manifest](/project-manifest.md) —
is built on it.

## Tab-indented, no trailing newline

`C3_JSON_INDENT = "\t"` — C3 source JSON is **tab-indented**, and — the
inverse of the usual text-file convention — written with **no trailing
newline**[^claude-md]. This is a C3 domain fact, not a c3source style
choice: checked against the canonical `construct3-sample` reference fixture,
25 of the 26 non-editor-local `.json`/`.c3proj` files satisfy
`serializeC3Json(JSON.parse(text)) === text`, and none of them ends with a
newline. The one exception is `*.brush.json`, covered below[^claude-md]. See
[ADR 0016](/decisions/0016-c3-source-json-serialization-form.md) for
the full rationale.

## Line-ending normalization

Text drawn from expressions and comments is run through
`normalizeLineEndings` (CRLF → LF) for cross-platform stability before it is
written[^claude-md].

## The minified-source exception: `*.brush.json`

`serialize.ts` also owns the one documented exception to the tab-indented
form: `tilemapBrushes/**/*.brush.json` is project **source** — hand-authored
tilemap brush definitions, with no generator that would recreate them — not
editor-local, but C3 nonetheless writes it in a **second, minified** form
(`JSON.stringify(value)`, no indent, no trailing newline)[^claude-md].

This is orthogonal to the [provenance axis](/layout-traversal.md) that
decides editor-local vs. source: a file's serialization form does not
determine its provenance. The exported domain fact
`C3_MINIFIED_SOURCE_SUFFIXES` (`[".brush.json"]`) and the predicate
`isMinifiedSourcePath` name this exception[^claude-md]. `isMinifiedSourcePath`
answers a narrower question than `isEditorLocalPath`: "is this file project
source that happens to be minified?" — not "is this file minified at all."
`*.uistate.json` files are also minified on disk, but
`isMinifiedSourcePath` returns `false` for them, because they are
editor-local and therefore out of this predicate's scope entirely
(`isEditorLocalPath` already classifies those). Detection only — c3source
ships no minified writer; a caller that needs to write a `.brush.json` file
composes `JSON.stringify(value)` directly. See [ADR
0018](/decisions/0018-brush-json-minified-source-not-editor-local.md)
for the full rationale.

## Related

- [Module Architecture](/module-architecture.md) — `serialize` as the sole leaf of the module DAG.
- [Layout Traversal](/layout-traversal.md) — the provenance axis (`isEditorLocalPath`) this page's minified-source exception is deliberately orthogonal to.
- [Project Manifest](/project-manifest.md) — `writeProjectManifest`, the manifest-specific consumer of this write form.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
</content>
