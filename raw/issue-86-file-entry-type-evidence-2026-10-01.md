# Issue #86 — file-entry `type` evidence (capture)

Captured 2026-10-01 for GenvidTechnologies/c3source#86 (a writer-direction MIME
table for `rootFileFolders` file entries). Provenance: the orchestrator's
verification run of `scripts/scan-domain-facts.mjs` probe 10 (`fileEntryType`),
the maintainer's editor saves in `construct3-sample` at C3 r49502, and an
analyst's census. Items under "Inherited" were not re-verified at capture time.

## Verified: probe 10 output

Run over the 14 deduplicated inventoried projects (burbank, 8 `c3addon-*/sample`,
`c3-regtest/no-effect`, `c3-tutorial`, `construct3-poc`, `construct3-sample/project`
[the top-level clone, an older commit without upstream #5's files], `ts-example`),
releases 37900–49500:

```
TABLE EXTENSION_FILE_TYPES (fileEntryType): 567 file entr(ies) / 8 releases
  count	projects	ext	section	type	status
  132	3	.ts	script	application/typescript	MATCH
  128	14	.png	icon	image/png	MATCH
  107	1	.webm	sound	audio/webm; codecs=opus	MATCH
  91	1	.png	general	image/png	MATCH
  42	1	.webm	music	audio/webm; codecs=opus	MATCH
  26	1	.jpg	general	image/jpeg	MATCH
  15	4	.json	general	application/json	MATCH
  8	1	.ttf	font	application/font-sfnt	MATCH
  5	4	.html	general	text/html	MATCH
  5	2	.js	script	application/javascript	MATCH
  2	2	.css	general	text/css	MATCH
  2	1	.xml	general	text/xml	MATCH
  1	1	.plist	general	application/octet-stream	MATCH
  1	1	.ts	general	application/typescript	MATCH
  1	1	.txt	general	text/plain	MATCH
  1	1	.vtt	general	application/octet-stream	MATCH
  -> MATCH: 567 / MISMATCH: 0 / UNMAPPED: 0
```

## Verified: construct3-sample editor saves at C3 r49502

These are outside the 14-project scan.

- **Upstream construct3-sample #5** (b3001bd, merged; no tag yet, the planned tag
  is v1.2.0): general `.jpg` image/jpeg, `.jpeg` image/jpeg, `.webp` image/webp,
  `.gif` image/gif, `.svg` image/svg+xml, `.mp4` video/mp4, `.mp3` audio/mpeg,
  `.m4a` audio/mp4, `.plist` application/octet-stream.
- **The maintainer's 2026-10-01 flat-table experiment** (read from the
  project.c3proj): sound `.webm` and music `.webm` -> `audio/webm; codecs=opus`;
  font `.ttf` -> `application/font-sfnt`; general `.webm` ->
  `audio/webm; codecs=opus`; general `.ttf` -> `application/font-sfnt`.

## Tier rule outcome

Independent editor-saved projects counted, the sample included:

- AUDITED (2 or more): `.png` 14, `.json` 4, `.html` 4, `.ts` 3, `.css` 2, `.js` 2.
  Then `.ttf`, `.webm` and `.plist` at 2 each: burbank plus construct3-sample r49502.
- UNVALIDATED (one project or one save):
  - `.txt` and `.xml`: burbank only.
  - `.vtt`: c3addon-gcore-video-plugin only.
  - `.jpg`: burbank's 26 `.jpg` entries were hand-edited, not editor-written
    (burbank `wiki/loading-screen-art.md`, its ADR 0026), so the only editor
    `.jpg` is the sample's.
  - `.jpeg`, `.gif`, `.svg`, `.webp`, `.mp4`, `.mp3`, `.m4a`: one sample save each.
- The 14-project scan shows `.ttf`/`.webm`/`.plist` at 1 project only because it
  does not include the sample's r49502 saves.

## Verified: no conflicts

No extension has ever been observed with two different types in any section,
across all 38 manifests on the machine (duplicates included). The `video`
section is empty corpus-wide.

## Inherited from the analyst (not re-verified at capture time)

- **Deep census:** a depth-7 find gives 38 manifests; burbank appears 6 times
  (including bb-backup/pilot-work x3 and `google/burbank`), the sample 5 times,
  and the addon samples 2 times each.
- **Editor bundle:** projectResources.js (r460 and r495) holds an audio-codec map
  (including `audio/webm; codecs=opus`, `audio/mp4`, `audio/mpeg`) and a font map
  (including `application/font-sfnt`). `application/octet-stream`, `video/mp4`,
  `image/gif` and `text/css` are not literals there. The file-entry serializer
  writes `{name, type: <getter>}` then `file-info: {purpose}`; there is no
  extension -> MIME table for file entries in either release.
- **mime-db divergence list** (read from burbank's node_modules/mime-db/db.json by
  the designer): `.ttf` font/ttf, `.webm` video/webm, `.vtt` text/vtt, `.ts`
  video/mp2t, `.plist` absent.
- **Downstream drift:** construct3-chef#236 — chef's local `MIME_MAP` lacks the
  image/audio/video extensions, and maps `.plist` to `text/xml` where the editor
  writes `application/octet-stream`.
