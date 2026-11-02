---
type: decision-context
title: "ADR 0036 — Section-aware file-entry type and info keys: fileTypeForSection, SECTION_EXTENSION_FILE_TYPES, C3_FILE_INFO_KEYS, C3_VIDEO_IMPORT_EXTENSIONS"
description: The editor takes a file entry's type from a MIME registry by extension plus a section hint, so the type is not flat across sections (.webm is video/webm only in the video section). c3source adds a separate fileTypeForSection(section, name) over a per-section override table, a C3_FILE_INFO_KEYS table, a default purpose, and the video import extensions, and leaves fileTypeForName and the flat table unchanged. Amends ADR 0027.
tags: [adr, domain-facts, manifest, mime, video]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-02T12:00:00Z }
sources:
  - id: issue-113-bundle-evidence
    resource: ../../raw/issue-113-video-section-bundle-evidence-2026-11-02.md
    title: "Issue #113 editor bundle evidence for the video section (capture, 2026-11-02)"
    last_modified: 2026-11-02
  - id: issue-113-editor-save
    resource: ../../raw/issue-113-video-section-editor-save-2026-11-02.md
    title: "Issue #113 editor save with registered video clips (capture, 2026-11-02)"
    last_modified: 2026-11-02
  - id: issue-113
    resource: https://github.com/GenvidTechnologies/c3source/issues/113
    title: "c3source#113 — file-entry type, info key and extensions for the video section"
---

# ADR 0036 — Section-aware file-entry type and info keys: `fileTypeForSection`, `SECTION_EXTENSION_FILE_TYPES`, `C3_FILE_INFO_KEYS`, `C3_VIDEO_IMPORT_EXTENSIONS`

**Status:** accepted
**Date:** 2026-11-02
**Issue:** [#113](https://github.com/GenvidTechnologies/c3source/issues/113)

Amends [ADR 0027](/decisions/0027-file-entry-type-writer-fact.md): its mechanism note and its "flat across sections" claim. The `EXTENSION_FILE_TYPES` table, `C3_DEFAULT_FILE_TYPE` and `fileTypeForName` stand unchanged.

## Context

A manifest writer (construct3-chef#358) needs four facts for the `video` section: its folder, its info key, the `type` of each entry, and the extensions it accepts[^issue-113-bundle-evidence].

ADR 0027 recorded the editor's file-entry serializer as writing `type` from an opaque getter, said the value was "probably probed from the file's content", and kept one table flat across sections. The editor bundle contradicts the mechanism note. The serializer writes the type string of the item's stored `MimeType` object [bundle r495] [bundle r460]. That object comes from a registry of 51 registrations at r495 and 49 at r460, looked up by extension. When one extension has several registrations, a section hint picks among them [bundle r495] [bundle r460]. Content checks decide which section accepts a file; no content check appears in the type lookup [bundle r495]. The content checks appear in the folder-import dialog's `_us` callback, and the rescan computes admission by registry category [bundle r495]. Inference: the rescan runs no content check, a reading from absence.

Consequences of the registry for the `video` section:

- `.webm` is registered twice, `audio/webm; codecs=opus` first and `video/webm` second. With the section hint `video/`, the lookup returns `video/webm`. With any other hint, or none, it returns the audio type [bundle r495] [bundle r460].
- `.ogv` and `.mp4` have one registration each, `video/ogg` and `video/mp4` [bundle r495].
- `.mov` is registered as `video/quicktime` [bundle r495]. The disk scan of a folder admits any file whose registry type is in the `video` category, so the bundle predicts a rescan can admit `.mov`, `.mpg` and `.avi` although the Import dialog does not offer them [bundle r495]. Only `.mov` was observed being admitted [editor save r50603].
- The folder for `video` is `videos`. The info key is `file-info` with `{purpose: "none"}`, as for every section except `icon` (`icon-info`) and `script` (`script-info`) [bundle r495] [bundle r460].
- The Import Files dialog offers `.webm`, `.ogv` and `.mp4` for videos [bundle r495] (r460 has the same video set).
- A file added through the Import dialog is typed from the browser's `File.type` when that type is registered for the file's extension, and otherwise from the lookup with no hint [bundle r495]. The result therefore depends on the browser.

An editor save at r506.3 on the `construct3-sample` project, tagged v1.3.0, showed every cell once, in one editor save (UNVALIDATED, one save). A disk-scanned `.webm` recorded `video/webm`, a disk-scanned `.mov` recorded `video/quicktime`, and imported `.mp4`, `.ogv` and `.webm` files recorded `video/mp4`, `video/ogg` and `video/webm`. All five entries sit in `videos/` with `file-info` and `{purpose: "none"}` [editor save r50603][^issue-113-editor-save]. The save is r506.3 output only. It does not show that r495 or r460 would write the same bytes, and no r506 bundle was read. The Import-dialog `.webm` recording `video/webm` most likely reflects a browser `File.type` of `video/webm`. That value and the browser were not recorded in the capture; the maintainer later reported the browser was Chrome.

## Decision

**Option A: a separate `fileTypeForSection(section, name)` over a per-section override table (recommended).** Six exports are added to the manifest module and the barrel. `fileTypeForName` is not touched.

- `C3FileSection` is `keyof C3RootFileFolders`, the type of a root file section.
- `C3_FILE_INFO_KEYS` maps each section to its info key: `script` to `script-info`, `icon` to `icon-info`, and `sound`, `music`, `video`, `font` and `general` to `file-info`. It is declared `as const satisfies Record<C3FileSection, string>`, so a new section added to `C3RootFileFolders` fails to compile until it gets a key.
- `C3_DEFAULT_FILE_INFO_PURPOSE` is the scalar `"none"`, the default purpose of the icon, script and file purposes [bundle r495] [bundle r460]. An `icon` item loaded without an `icon-info` key does not keep it: the editor chooses the purpose from the item name, for example `loading-logo.png` gives `loading-logo` [bundle r495] [bundle r460].
- `SECTION_EXTENSION_FILE_TYPES` is `Partial<Record<C3FileSection, Record<string, string>>>`, a per-section override of the flat table, keyed by dotted lowercase extension. It has one section, `video`: `.webm` to `video/webm`, `.ogv` to `video/ogg`, `.mov` to `video/quicktime`.
- `fileTypeForSection(section, name)` applies the section's row when the extension has one and otherwise returns `fileTypeForName(name)`. Name parsing is the same as `fileTypeForName`: the basename of a `/`- or `\`-separated path, case-insensitive. `fileTypeForSection("video", "a.webm")` is `video/webm`; `fileTypeForSection("sound", "a.webm")` is `audio/webm; codecs=opus`.
- `C3_VIDEO_IMPORT_EXTENSIONS` is `[".webm", ".ogv", ".mp4"]`, the video set of the Import Files dialog [bundle r495].

**Why `.ogv` and `.mov` have section rows.** `.webm` is the only true section override: its video-section type differs from the registry default. `.ogv` and `.mov` are section-scoped additions for extensions the flat table lacks. The bundle registers each once, `video/ogg` and `video/quicktime`, so the hint does not change their result [bundle r495]. They are rows because the flat table has no `.ogv` row, so a writer filtering names with `C3_VIDEO_IMPORT_EXTENSIONS` would otherwise type `.ogv` as `application/octet-stream`, while the registry has `video/ogg` for it [bundle r495]. The `.ogv` row removes that inconsistency between the exported import set and the type lookup. The `.mov` row is the type the editor recorded for a `.mov` in the video section [editor save r50603].

The consequence is a gap. The flat table is frozen, so `fileTypeForSection` returns the editor's type only for extensions in `SECTION_EXTENSION_FILE_TYPES` or the flat table. Any other extension falls back to `C3_DEFAULT_FILE_TYPE`, as `fileTypeForName` does. Registry extensions with a single registration, such as `.mov` outside the `video` section, `.ogv` outside it, and `.avi`, still return `application/octet-stream` from `fileTypeForSection`, although the editor would record a `video/*` type for them [bundle r495].

**Accepted extensions are two different answers, and only one is exported.** The Import dialog accepts `.webm`, `.ogv` and `.mp4`; that is `C3_VIDEO_IMPORT_EXTENSIONS`. A rescan of the `videos/` folder on disk admits a file whose registry type is in the `video` category. That is a rule over the registry, not a list of extensions, and it stays documented in the constant's JSDoc and in [C3 Domain Facts](/c3-domain-facts.md) rather than exported [bundle r495].

**Confidence.** The `.webm`, `.ogv` and `.mov` cells are confirmed by one editor save at r506.3 and by the bundle at r495 for `.webm` and `.ogv`. Under the [ADR 0022](/decisions/0022-domain-fact-audit-convention.md) labels they are UNVALIDATED (one save). The `.mov` cell has no bundle prediction behind it beyond the registry row.

## Compromise

**Option A: a separate `fileTypeForSection(section, name)` over a per-section override table (recommended).** Chosen. Every existing signature and output stays as it was, so the change is purely additive and a minor release. The override table is small and data-shaped, so a new attested cell is one row.

**Option B: an optional second parameter, `fileTypeForName(name, section?)`.** Rejected. It edits the existing body and signature, so the api-surface line for `fileTypeForName` changes and the change is no longer purely additive, and `names.map(fileTypeForName)` becomes a TypeScript compile error, because `map` passes the index as the second argument.

**Option C: model the editor mechanism (hint table plus multi-registration list, reimplementing `zfs`).** Rejected. It adds two more tables whose only current effect is one cell, and it makes c3source track the order of registry entries, which changes between releases (three extensions are registered twice at both releases, and r495 added `model/glb` and `model/gltf`) [bundle r495] [bundle r460].

**Info-key shape.** Chosen: **Key table plus a scalar default purpose (recommended)**, which is `C3_FILE_INFO_KEYS` and `C3_DEFAULT_FILE_INFO_PURPOSE`. Two other shapes were weighed:

- A table of `{key, default: {purpose: "none"}}` objects. Rejected, because an exported shared mutable object could be aliased into every item a writer creates.
- A helper `defaultFileInfo(section)`. Deferred until a second consumer wants it. It is additive, so it can be added later.

**Accepted extensions.** The alternative was to document both answers only and export nothing. The maintainer chose to export `C3_VIDEO_IMPORT_EXTENSIONS` together with an `.ogv` row over that documentation-only alternative, because a writer filtering with the constant would otherwise type `.ogv` as `application/octet-stream`: `.ogv` has no flat row and the flat table is frozen. The disk-scan rule stays documented, not exported.

## Consequences

- **Additive, a minor release.** Six new exports; no existing signature or return value changes. `fileTypeForName` returns what it returned before.
- **A fallback gap remains.** `fileTypeForSection` falls back to `application/octet-stream` for single-registration extensions that are in neither table (see the section-row paragraph above).
- **The flat table is frozen for this issue.** An extension newly attested in one section is added only as a section row. Growing the flat table later is a separate decision, because it changes `fileTypeForName` output for every caller.
- **ADR 0027 is amended, not superseded.** Its flat-table claim held for the sections it tested (`sound`, `music`, `font`, `general`). Its residual, "a `.webm` carrying video", is now answered: the `video` section records `video/webm` [editor save r50603]. Its inference that the editor probes file content is withdrawn for the stored `type`. Content checks decide which section accepts a file, not which type is stored [bundle r495].
- **The canonical fixture pin moved to `construct3-sample` v1.3.0**, whose `savedWithRelease` is `50603`. The fixture now holds editor-registered video entries, so tests can attest the video section against a real save. The hazards of a pin bump are in [Canonical Fixture](/canonical-fixture.md).
- **Disk scan and Import dialog differ.** The bundle predicts a rescan can admit `.mov`, `.mpg` and `.avi` (only `.mov` was observed); the dialog offers three extensions. A consumer that models what an editor user can import uses `C3_VIDEO_IMPORT_EXTENSIONS`; one that models what an editor rescan can admit needs the registry rule, which c3source does not export.
- **The Import-dialog `type` depends on the browser.** The imported `.webm` recorded `video/webm`. The capture lists the browser as not recorded; the maintainer later reported it was Chrome, which is a report, not an observation. A different browser reporting an empty or unregistered `File.type` would yield `audio/webm; codecs=opus` through the unhinted lookup [bundle r495]. The table reproduces the disk-scan result.
- **Evidence is one editor release.** The save is r506.3; the bundle was read at r495 and r460. The cells may move if a later release reorders the registry.
- **Related residuals, not decided here.** The r506.3 save also added a top-level `saveLLMContextFile` project property; what it controls is not established [editor save r50603].

## Related

- [ADR 0027 — File-entry type as a writer-direction domain fact](/decisions/0027-file-entry-type-writer-fact.md) — amended by this record.
- [ADR 0022 — Domain-fact audit convention](/decisions/0022-domain-fact-audit-convention.md) — the confidence labels.
- [ADR 0008 — C3 domain facts owned as exported tables in c3source](/decisions/0008-c3-domain-fact-tables.md) — the exported-table rule the new tables follow.
- [C3 Domain Facts](/c3-domain-facts.md) — the evidence numbers behind the tiers.
- [Project Manifest](/project-manifest.md) — where the exports sit.
- [Canonical Fixture](/canonical-fixture.md) — the v1.3.0 pin.

[^issue-113-bundle-evidence]: Issue #113 editor bundle evidence for the video section (capture, 2026-11-02)
[^issue-113-editor-save]: Issue #113 editor save with registered video clips (capture, 2026-11-02)
