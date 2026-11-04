---
type: decision-context
title: "ADR 0039 — detectManifestDrift takes an options parameter: skipFileSections skips the seven rootFileFolders sections"
description: detectManifestDrift gains a third parameter, the exported ManifestDriftOptions, with one boolean skipFileSections. When true, neither the manifest walk nor the disk walk of the seven rootFileFolders sections runs, and the result carries no rootFileFolders entry in sections, duplicates or links. The skip is silent (no result field), strays stay ungated, and the absent versus empty rootFileFolders asymmetry is documented and not changed.
tags: [adr, manifest, drift-detection, api-surface]
status: stable
generated: { by: process:maintain-wiki, at: 2026-11-04T12:00:00Z }
sources:
  - id: issue-119-upstream
    resource: https://github.com/GenvidTechnologies/c3source/issues/119
    title: "c3source#119 — an optional section scope for detectManifestDrift"
---

# ADR 0039 — `detectManifestDrift` takes an options parameter: `skipFileSections` skips the seven `rootFileFolders` sections

**Status:** accepted
**Date:** 2026-11-04
**Issue:** [#119](https://github.com/GenvidTechnologies/c3source/issues/119)

## Context

Since [ADR 0035](/decisions/0035-file-folder-drift-walks-undeclared-subdirectories.md), `detectManifestDrift` walks every non-editor-local subdirectory of each `rootFileFolders` category on disk, and the manifest side of those sections is walked too[^issue-119-upstream]. A caller that has no use for the file sections still pays for both walks. construct3-chef is such a caller. It works around the cost today by stripping `rootFileFolders` from the manifest view it passes in, which makes the file sections vanish from the result.

The function had no options parameter, so the caller had no supported way to ask for the skip.

## Decision

**`detectManifestDrift(projectDir, manifest?, options?: ManifestDriftOptions)`.** `ManifestDriftOptions` has one member, `skipFileSections?: boolean`. It is chosen over the alternatives below.

Option A: `skipFileSections` boolean, file sections only.

- When `skipFileSections` is true, the seven `rootFileFolders.<category>` sections are not checked. Neither their manifest walk nor their disk walk runs.
- The result has no `rootFileFolders.*` entry in `sections`, `duplicates` or `links`.
- `inSync` keeps its definition. No result field records the skip.
- `ManifestDrift.degraded` is unchanged in meaning: a skipped section is absent from the result and is not listed in `degraded`.
- `C3Project.detectManifestDrift(options?)` forwards `options` to the free function together with the cached manifest.

**`ManifestDriftOptions` is exported.** It follows `ReferenceIntegrityOptions` and not the unexported inline `walkUndeclared` type of ADR 0035, because two public signatures name it: the free function and the `C3Project` method.

**The absent versus empty asymmetry is documented, not changed.** The function JSDoc and the [Project Manifest](/project-manifest.md#drift-detection) page state four points:

- with `rootFileFolders` absent, the file sections are not walked;
- with `rootFileFolders: {}`, they are walked;
- with a name-section key absent, its folder is still walked;
- `skipFileSections` is the supported skip.

[ADR 0037](/decisions/0037-link-safe-disk-walks.md) already states the absent half. Changing the behaviour is outside this record.

**Release.** The change is additive, so it ships as a minor, targeted at 3.2.0.

## Compromise

- **Option B: a per-group selector** over file sections, containers and images. Rejected. Containers cost nothing, being manifest-only. Images already fail soft into `degraded`, and their parse cost is unmeasured. ADR 0025's E-alt3 states its test for strays only: it rejects an option that gates something costing nothing. Applying that test to containers and images is this record's own inference. By it, the extra groups fail the test of [ADR 0025](/decisions/0025-section-item-hood-and-stray-files.md)'s E-alt3, and nobody asked for them. If a measured cost appears later, a `skipImages?: boolean` stays an additive minor.
- **Option C: a per-section exclude list** keyed by `SectionDrift.section`. Rejected. It needs a new exported union of 16 members. A typo from a JavaScript caller is a silent no-op. Excluding `models3d` still leaves the stray walk reading `models3d/`.
- **Naming forks.** `fileSections?: boolean` defaulting to true is rejected, because its default is the opposite of the falsy value. `skip?: Array<"fileSections">` is rejected, because it is a vocabulary of one member.
- **A `skipped?` result field.** Rejected. The caller asked for the skip, and `degraded` is for failures nobody requested ([ADR 0023](/decisions/0023-pre-r402-image-serialization-drift-degradation.md)). The skip result must equal what construct3-chef's workaround already produces, which is a result with no `rootFileFolders` sections.
- **Strays stay ungated.** `detectStrayFiles` re-walks the name-section roots. Read from the code but not tested: it throws only where the name-section walk already threw, so a gate would protect against no failure. This is the reasoning of ADR 0025's E-alt3: "it gates something that costs nothing — `detectStrayFiles` is a plain walk with no throw risk (see its own JSDoc on why it needs no degradation guard), so there is no failure mode an opt-out would protect against."

## Consequences

- A caller can skip the file-section walks with a supported option. The public API grows by one type, `ManifestDriftOptions`, and one optional parameter on two signatures. No name is removed.
- A skipped run and a project with no file sections give the same result shape. A reader of the result cannot tell the two apart, by design.
- If the images walk is later shown to cost enough to matter, `skipImages?: boolean` can join `ManifestDriftOptions` without a break.

## Related

- [ADR 0035 — File-folder drift walks undeclared subdirectories](/decisions/0035-file-folder-drift-walks-undeclared-subdirectories.md) — the walks the option skips.
- [ADR 0037 — Disk walks never follow links below a walk root](/decisions/0037-link-safe-disk-walks.md) — states the absent `rootFileFolders` half of the asymmetry.
- [ADR 0025 — Section item-hood and stray files](/decisions/0025-section-item-hood-and-stray-files.md) — E-alt3, the test the extra groups fail.
- [ADR 0023 — Pre-r402 image serialization and drift degradation](/decisions/0023-pre-r402-image-serialization-drift-degradation.md) — what `degraded` is for.
- [Project Manifest](/project-manifest.md#drift-detection) and [C3Project Handle](/c3project-handle.md) — the shipped behaviour.

[^issue-119-upstream]: c3source#119 — an optional section scope for detectManifestDrift
