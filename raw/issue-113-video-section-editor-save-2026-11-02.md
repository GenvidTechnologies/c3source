# Issue #113 — editor save with registered video clips in the `video` section (capture)

Captured 2026-11-02 for GenvidTechnologies/c3source#113 (file-entry `type` for
the `video` section). Provenance: a save made in the Construct 3 editor
**r506.3** on the `construct3-sample` project, landed upstream as
GenvidTechnologies/construct3-sample PR #7 (merge commit
`b76dd458c12634b82cf4b9b7b804c795c968cd4f`), tagged `v1.3.0` (annotated tag,
message `v1.3.0: editor-registered video clips in the Videos section (#7),
savedWithRelease r50603`). The previous tag was `v1.2.0` at `fe53059`.

**Method.** The saved `project/project.c3proj` was read at tag `v1.3.0` with
`gh api repos/GenvidTechnologies/construct3-sample/contents/project/project.c3proj?ref=v1.3.0`.
The block in section 3 is copied from that file. The editor session itself was not
observed by the capturer; its steps come from the user's report.

**Labels.** Every claim about editor output carries `[editor save r50603]`. A claim
about the editor bundle carries `[bundle r495]` or `[bundle r460]` and is quoted
from `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`. A line that begins
"Inference:" is the capturer's reading and was not observed directly.

**Release.** The plan was to save in r495. The user chose the latest editor, so the
save was made in r506.3. `[editor save r50603]` The project's `savedWithRelease`
went from `49502` (v1.2.0) to `50603`.

## 1. The media

Each clip is a 1-second, 160x120 ffmpeg `testsrc` file.

| file | codec | how it was put in the project |
|---|---|---|
| `clip_disk.webm` | VP8 (`libvpx`) | placed in `project/videos/` before the project was opened |
| `clip.mov` | H.264 | placed in `project/videos/` before the project was opened |
| `clip_import.webm` | VP9 | Videos Import dialog |
| `clip.mp4` | H.264 | Videos Import dialog |
| `clip.ogv` | Theora | Videos Import dialog |

A header check before the save confirmed: both `.webm` files have an EBML header
and the markers `V_VP8` (`clip_disk.webm`) or `V_VP9` (`clip_import.webm`); the
`.ogv` contains `theora`; the `.mp4` and the `.mov` have `ftyp` at offset 4.

The browser used for the Import dialog was not recorded. The user reported "All
imported with no problem".

## 2. What the save wrote, per file

`[editor save r50603]` All five entries are in the `video` section, in folder
`videos/`, with info key `file-info` and `{"purpose": "none"}`, and
`"subfolders": []`.

| file | registered by | section | `type` | info key and value | folder |
|---|---|---|---|---|---|
| `clip_disk.webm` | disk scan on project open | `video` | `video/webm` | `file-info` / `none` | `videos/` |
| `clip.mov` | disk scan on project open | `video` | `video/quicktime` | `file-info` / `none` | `videos/` |
| `clip.mp4` | Import dialog | `video` | `video/mp4` | `file-info` / `none` | `videos/` |
| `clip.ogv` | Import dialog | `video` | `video/ogg` | `file-info` / `none` | `videos/` |
| `clip_import.webm` | Import dialog | `video` | `video/webm` | `file-info` / `none` | `videos/` |

The other sections at `v1.3.0` are unchanged from `v1.2.0`. `[editor save r50603]`
The sound and music entries `tone_sound.webm` and `tone_music.webm` keep
`audio/webm; codecs=opus`. The sections present in `rootFileFolders` are `script`,
`sound`, `music`, `video`, `font`, `icon` and `general`.

## 3. Verbatim `rootFileFolders.video`

`[editor save r50603]` Tab-indented as C3 writes it, copied from `v1.3.0`:

```
		"video": {
			"items": [
				{
					"name": "clip_disk.webm",
					"type": "video/webm",
					"sid": 391394951799026,
					"file-info": {
						"purpose": "none"
					}
				},
				{
					"name": "clip.mov",
					"type": "video/quicktime",
					"sid": 981937482953941,
					"file-info": {
						"purpose": "none"
					}
				},
				{
					"name": "clip.mp4",
					"type": "video/mp4",
					"sid": 930839579134811,
					"file-info": {
						"purpose": "none"
					}
				},
				{
					"name": "clip.ogv",
					"type": "video/ogg",
					"sid": 847791372401318,
					"file-info": {
						"purpose": "none"
					}
				},
				{
					"name": "clip_import.webm",
					"type": "video/webm",
					"sid": 808796398799107,
					"file-info": {
						"purpose": "none"
					}
				}
			],
			"subfolders": []
		},
```

## 4. Comparison with the bundle predictions

The predictions are those of `raw/issue-113-video-section-bundle-evidence-2026-11-02.md`.

| prediction `[bundle r495]` `[bundle r460]` | observed `[editor save r50603]` | result |
|---|---|---|
| a disk-scanned `.webm` in the `video` section gets `video/webm` (hint `video/`) | `clip_disk.webm` -> `video/webm` | matches |
| `.ogv` gets `video/ogg` | `clip.ogv` -> `video/ogg` | matches |
| `.mp4` gets `video/mp4` | `clip.mp4` -> `video/mp4` | matches |
| the info key for `video` is `file-info` with purpose `none` | `file-info` / `none` on all five | matches |
| the folder for `video` is `videos` | files in `videos/` | matches |
| the disk scan admits `.mov` through the registry (`video/quicktime`) although the Import dialog set is `.webm .ogv .mp4` | `clip.mov` was registered by the disk scan as `video/quicktime` | matches the disk-scan rule |
| an Import-dialog `.webm` is typed from the browser `File.type` when registered for `webm`, else by the unhinted lookup (`audio/webm; codecs=opus`) | `clip_import.webm` -> `video/webm` | consistent, see the inference below |

Inference: `clip_import.webm` is `video/webm`, and the unhinted lookup would give
`audio/webm; codecs=opus`. So the browser most likely reported `File.type`
`video/webm`, which the Import path keeps. The reported `File.type` was not
observed, and the browser was not recorded.

## 5. Release caveat

The bundle evidence was read at r495 and r460. The save was made in r506.3. The save
attests r506.3 output only. That the save agrees with the bundle predictions is an
observation; it is not proof that r495 or r460 would write the same bytes. No
r506 bundle was read.

## 6. A new property in the save

`[editor save r50603]` The save added a top-level project property
`"saveLLMContextFile": true`. The `v1.2.0` tree (saved in r495) has no such
property. It is outside `rootFileFolders`. The capture does not say what the
property controls.

## 7. Checks run on the `v1.3.0` tree

- Upstream `node scripts/validate.mjs` passed.
- construct3-chef `validate-addons --project-dir project` reported 3 `lang` issues
  on `MyCompany_MyBehavior`. The same 3 were reported on the `v1.2.0` tree (a git
  archive of `fe53059`), so they predate this save.
- Probe against the `dist/` of the #113 branch of c3source: the strict
  `parseProjectManifest` accepts the `v1.3.0` manifest, and `detectManifestDrift`
  reports `inSync: true`.

## Not confirmed

- The browser and its `File.type` for the Import-dialog files.
- Whether r495 or r460 writes the same entries.
- What `saveLLMContextFile` does.
