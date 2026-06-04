# Plan — Issue #29: Resolve image extension from `fileType` MIME

## Problem
`deriveExpectedImageNames` (`src/c3source.ts:1641`) hardcodes `.png` in both
branches (line 1644 single `image` field; line 1653 animation frames). Every
non-PNG image produces a false pair in `detectImageDrift`: the assumed `.png`
as *missing*, the real file as *untracked*. The MIME lives at
`objectType.image.fileType` (single-image) and **per-frame** at
`frames[i].fileType` (sprites — frames may differ).

## Decisions (confirmed)
- **No `.png` fallback.** Absent `fileType` → throw (malformed object type).
  Present-but-unmapped MIME → throw (`unknown image fileType "<mime>"`).
- **Fixture image** added for end-to-end coverage (convert existing
  `TiledBackground` → `image/jpeg`, faithful to the issue's real-world evidence).

## Design
1. Export domain fact `IMAGE_FILE_TYPE_EXTENSIONS: Record<string,string>`
   (`image/png`→`png`, `image/jpeg`→`jpg`, `image/svg+xml`→`svg`,
   `image/webp`→`webp`) — a C3 platform fact owned here, mirroring
   `EVENTVAR_REFERENCE_ACES` / `TIMELINE_TRANSITIONS_FOLDER`.
2. Internal `extensionForFileType(fileType, context)`: absent/empty → throw;
   unmapped → throw "unknown"; mapped → bare extension.
3. Wire both branches of `deriveExpectedImageNames`: single-image reads
   `image.fileType`; animation resolves **per frame** from `frame.fileType`.
   Names become `${name}.${ext}` / `${name}-${anim}-${frame3}.${ext}`.
4. Doc updates: drop "assumes `.png`" limitation, document the MIME table +
   throw behavior; note in `detectImageDrift` that a throw propagates and
   `detectManifestDrift`'s try/catch degrades to "images section omitted".

**Friction:** one malformed/unknown-format object type aborts the
`detectImageDrift` loop → entire images section dropped from
`detectManifestDrift` (existing best-effort contract). Accepted per the
"error over skip" decision; surfaced in the doc comment.

## Tasks (branch `fix/29-image-filetype-extension`)
- **Prep:** commit `plan.md`.
- **Task 1** (ts-implementer): `IMAGE_FILE_TYPE_EXTENSIONS` + `extensionForFileType`
  + wire both branches + doc comments; synthetic unit tests (png/jpeg/svg/webp,
  per-frame anim, absent-throws, unknown-throws). Code + unit tests one commit.
  → validator.
- **Task 2** (ts-implementer): fixture — `TiledBackground.json` → `image/jpeg`,
  rename `images/tiledbackground.png` → `.jpg`, end-to-end
  `detectImageDrift`/`detectManifestDrift` jpeg assertions, update F4-4 comment.
  → validator.
- **Gate:** code-reviewer; offer tech-writer on doc gaps.

## Test criteria
- `deriveExpectedImageNames` resolves png/jpeg/svg/webp for single-image and
  per-frame animation; throws on absent and unknown `fileType`.
- Fixture: `detectImageDrift` entries empty and `detectManifestDrift` `inSync`
  true after the jpeg conversion (no false pair).
