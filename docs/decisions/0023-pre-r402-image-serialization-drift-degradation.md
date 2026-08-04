# 0023. Pre-r402 image serialization and drift degradation

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #68

## Context

`deriveExpectedImageNames` threw `"malformed object type: missing fileType"`
on image nodes carrying no `fileType` MIME. That is factually wrong: C3
before **r402** emits no `fileType` at all, and the on-disk file is a
perfectly ordinary image — `docs/domain-fact-audit.md`'s corpus scan found 15
such nodes across two real, pre-r402 projects (`c3-tutorial`, release 37900;
`construct3-poc`, release 39700). Real corpus projects hit this — throwing on
a direct `detectImageDrift(projectDir)` call and, worse, **silently dropping
the images section** via `detectManifestDrift`'s best-effort catch
(`src/manifest.ts:868-873`).

## Decision

- New exports `ExpectedImage {stem, ext?, context}` and
  `deriveExpectedImages()`; `deriveExpectedImageNames` becomes a one-line
  renderer over it (`src/manifest.ts:1018`, `:1091`). An **absent** MIME
  yields `ext: undefined`; a present-but-**unmapped** MIME still throws
  (#29's rationale stands — an unrecognized `fileType` is a genuinely unknown
  format, not a legacy omission).
- `C3_LEGACY_IMAGE_EXTENSION = "png"` (`src/manifest.ts:985`). **Its
  justification is the key point:** this is not a guess the corpus failed to
  discriminate — C3's own project loader applies the identical fallback
  (`t.fileType ?? "image/png"`, unchanged r402 → r447, confirmed against
  `editor.construct.net`'s `projectResources.js`). c3source matches the
  editor rather than inventing a default.
- **The two read paths deliberately differ.** `deriveExpectedImageNames`
  answers "what filename would C3 have written?" so it must return a
  concrete name and uses the default; `detectImageDrift` answers "is
  anything missing or orphaned?" so it must not fabricate a finding, and
  matches legacy entries on their **stem** rather than the defaulted full
  filename (`src/manifest.ts:1111-1119`). The detector is strictly the more
  conservative of the two paths, so the default can never *manufacture*
  drift.
- **`ManifestDrift.degraded?: DriftDegradation[]`** (`src/manifest.ts:111`,
  `:132`) makes the previously-silent swallow observable: a caught
  `detectImageDrift` throw is now reported as `{section: "images", message}`
  instead of vanishing. `inSync` is unchanged in meaning — a degradation is
  not drift. `C3Project.detectImageDrift()` still throws on a direct call —
  that *is* the caller's request (ADR 0021's policy, applied consistently).
  The degrading-vs-throwing split itself is preserved; only its
  **visibility** changed.

## Compromise

- **Version-gating on `savedWithRelease`** — rejected decisively: an absent
  `fileType` is self-evidently the legacy shape, needing no version lookup,
  and threading a manifest through `deriveExpectedImages`/
  `deriveExpectedImageNames` would destroy their purity (the reason they are
  unit-testable without a project on disk). Note `projectFormatVersion` is
  uniformly `1` from r379 to r495 in the corpus, so there is no cheap version
  signal available even if this were wanted.
- **Returning a set of candidate names** (`.png|.jpg|.svg|.webp`) —
  rejected: `diffNameMaps` (the manifest-drift diff engine) has no notion of
  alternatives and would emit false `missing` entries per legacy node —
  one real filename can never satisfy a set of candidates without ad hoc
  matching logic bleeding into the diff engine.
- **Keeping the throw** — rejected: it misclassified a valid, real C3
  serialization form as malformed input.
- **Adding a `detector-error` to `DriftEntry.kind`** — rejected: that union
  is `switch`ed exhaustively downstream, the same reasoning [ADR
  0021](0021-reference-integrity-detection.md) used to keep layout effects
  out of `AddonAttribution.source`. A separate optional field
  (`ManifestDrift.degraded`) breaks nothing for an existing exhaustive
  switch over `DriftKind`.

**A plausible-looking wrong fix, warned off explicitly:** `exportFormat` is
**not** a MIME proxy. It is an export re-encoding setting
(`"lossless"`/`"lossy"`), not the source format — one corpus project carries
`exportFormat: "lossy"` on thousands of nodes whose source is PNG
(`src/manifest.ts:981-983`). Reading it as a `fileType` substitute would be
wrong in the majority case, not just the edge case.

## Consequences

- **Public API impact:** three pure additions (`ExpectedImage`,
  `deriveExpectedImages`, `C3_LEGACY_IMAGE_EXTENSION`) plus one behavioural
  loosening (`deriveExpectedImageNames` no longer throws on an absent
  `fileType`). No previously-working caller breaks — a caller that never hit
  the pre-r402 case sees no change; a caller that did was previously
  crashing. Semver **minor**.
- `detectManifestDrift` callers that were silently missing image-section
  coverage on a pre-r402 project now see it surface via `degraded` instead —
  a caller ignoring the new optional field observes no behavior change
  beyond the fixed throw.
- Corpus evidence for the boundary: `docs/domain-fact-audit.md`'s
  [`IMAGE_FILE_TYPE_EXTENSIONS`](../domain-fact-audit.md#image_file_type_extensions)
  section — 8,485 image nodes across 8 releases, 15 absent-`fileType` nodes,
  all in releases 37900/39700, both pre-r402.
