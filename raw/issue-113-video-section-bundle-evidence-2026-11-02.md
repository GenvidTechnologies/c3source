# Issue #113 — editor bundle evidence for file-entry `type`, info keys and the `video` section (capture)

Captured 2026-11-02 for GenvidTechnologies/c3source#113 (file-entry `type` for
the `video` section). Provenance: the Construct 3 editor bundle at two releases,
`https://editor.construct.net/r495/` and `https://editor.construct.net/r460/`.
Two files were read from each: `main.js` and `projectResources.js`.

**Method.** The bundle files were fetched and read as untrusted text. They were
never executed, imported or run. Excerpts were pulled with `indexOf` and `slice`
in a Node script. The registration table in section 1 was produced by a script
that parses the `Vf(...)` call text; it does not evaluate it. Minified names
(`Vf`, `zfs`, `s5e`, ...) change between releases and are quoted as found.

**Labels.** Every claim carries `[bundle r495]` or `[bundle r460]`. A line that
begins "Inference:" is the capturer's reading and is not bundle text. This
capture makes **no claim about what an editor save writes to disk**; that is a
separate capture.

**Relation to an earlier capture.** `raw/issue-86-file-entry-type-evidence-2026-10-01.md`
(section "Inherited from the analyst") says the bundle has no extension -> MIME
table for file entries and that the serializer writes `type: <getter>`. This
capture qualifies that statement. See section 10.

## 1. The MIME registry in `main.js`

`[bundle r495]` The registry is a `Map` filled by calls to a helper
`Vf(type, extOrExts, label, flags?)`. Each call builds one `MimeType` and stores
it under its type string. The registry starts with
`jf=new Of.MimeType("application/octet-stream",[],"Binary")`, which is the
fallback object. There are **51** `Vf` registrations.

`[bundle r460]` The same helper is named `cf`, the fallback is
`af=new tf.MimeType("application/octet-stream",[],"Binary")`, and there are
**49** registrations. The 49 are the r495 list minus `model/glb` and
`model/gltf`; the other 49 entries and their order are the same.

Excerpt, `[bundle r495]` (audio and video block):

```
Vf("audio/webm; codecs=opus","webm","WebM Opus",Df),Vf("audio/mp4","m4a","MPEG-4 AAC",Df),
Vf("audio/wav","wav","WAV"),Vf("audio/flac","flac","FLAC",Df),Vf("audio/mpeg","mp3","MP3",Df),
Vf("audio/midi",["mid","midi","kar"],"MIDI"),Vf("video/webm","webm","WebM",Df),
Vf("video/ogg","ogv","Ogg video",Df),Vf("video/mp4","mp4","MPEG-4 video",Df),
Vf("video/mpeg",["mpg","mpeg"],"MPEG video",Df),Vf("video/quicktime",["mov","qt"],"Quicktime movie",Df),
Vf("video/avi","avi","AVI")
```

`[bundle r495]` Registration order, type -> extensions (r460 is identical except
that it lacks the last two rows):

| # | type | extensions |
|---|---|---|
| 1 | `text/html` | html, htm |
| 2 | `application/javascript` | js |
| 3 | `text/javascript` | js |
| 4 | `application/typescript` | ts |
| 5 | `text/typescript` | ts |
| 6 | `text/css` | css |
| 7 | `application/json` | json, scon |
| 8 | `text/xml` | xml, scml |
| 9 | `text/csv` | csv |
| 10 | `text/tab-separated-values` | tsv |
| 11 | `text/plain` | txt |
| 12 | `text/markdown` | md |
| 13 | `text/x-ini` | ini |
| 14 | `image/png` | png |
| 15 | `image/apng` | apng |
| 16 | `image/jpeg` | jpg, jpeg |
| 17 | `image/jxl` | jxl |
| 18 | `image/svg+xml` | svg |
| 19 | `image/webp` | webp |
| 20 | `image/gif` | gif |
| 21 | `image/tiff` | tif, tiff |
| 22 | `image/bmp` | bmp |
| 23 | `image/x-icon` | ico |
| 24 | `image/avif` | avif, avifs |
| 25 | `audio/ogg; codecs=opus` | opus |
| 26 | `audio/ogg; codecs=vorbis` | ogg |
| 27 | `audio/webm; codecs=opus` | webm |
| 28 | `audio/mp4` | m4a |
| 29 | `audio/wav` | wav |
| 30 | `audio/flac` | flac |
| 31 | `audio/mpeg` | mp3 |
| 32 | `audio/midi` | mid, midi, kar |
| 33 | `video/webm` | webm |
| 34 | `video/ogg` | ogv |
| 35 | `video/mp4` | mp4 |
| 36 | `video/mpeg` | mpg, mpeg |
| 37 | `video/quicktime` | mov, qt |
| 38 | `video/avi` | avi |
| 39 | `application/font-woff` | woff |
| 40 | `font/woff2` | woff2 |
| 41 | `application/font-sfnt` | ttf, otf |
| 42 | `application/vnd.ms-fontobject` | eot |
| 43 | `application/pdf` | pdf |
| 44 | `application/zip` | zip, c3p, capx |
| 45 | `application/wasm` | wasm |
| 46 | `application/wast` | wast |
| 47 | `application/octet-stream` | mem |
| 48 | `application/x-construct3-addon` | c3addon |
| 49 | `application/x-construct2-addon` | c2addon |
| 50 | `model/glb` | glb (r495 only) |
| 51 | `model/gltf` | gltf (r495 only) |

`[bundle r495]` `[bundle r460]` Three extensions are registered under two types:
`webm` (`audio/webm; codecs=opus` first, then `video/webm`), `js`
(`application/javascript` first, then `text/javascript`) and `ts`
(`application/typescript` first, then `text/typescript`). Every other extension
maps to one type. Both statements come from the parsed registration list in both
releases.

`[bundle r495]` `[bundle r460]` `application/octet-stream` appears twice: as the
fallback object, with no extensions, and as the type registered for `mem`.

## 2. The lookup `MimeType.zfs(ext, hint)`

`[bundle r495]` Excerpt:

```
static zfs(t,i){Of.bp(t),Of.Aut(i),t.length&&"."===t[0]&&(t=t.substr(1)),t=t.toLowerCase();
const e=[];for(const i of zf.values())for(const s of i.lgi())s===t&&e.push(i);
if(!e.length)return Wf();if(1===e.length||!i)return e[0];
for(const t of e)if(t.d$t().toLowerCase().includes(i.toLowerCase()))return t;return e[0]}
```

`[bundle r495]` In plain words: strip one leading dot and lower-case the
extension. Collect every registration that lists the extension, in registration
order. With no match, return the fallback (`Wf()` returns `jf`,
`application/octet-stream`). With exactly one match, or with no hint, return the
first match. Otherwise return the first match whose type string contains the hint
(case-insensitive). If none contains the hint, return the first match.

`[bundle r460]` The same body, with the lookup named `ILt`.

Output of the parsed registry run through this rule, `[bundle r495]`: `.webm`
with hint `video/` gives `video/webm`. `.webm` with hint `audio/`, `font`,
`image/` or `""` gives `audio/webm; codecs=opus`. `.ogv` gives `video/ogg` and
`.mp4` gives `video/mp4` with every hint. `.js` and `.ts` give the
`application/...` type with every hint.

## 3. The section hint

`[bundle r495]` In `projectResources.js`, the class for a project folder has:

```
s5e(){switch(this.DJ()){case"sound":case"music":return"audio/";case"video":return"video/";
case"font":return"font";case"icon":return"image/";default:return""}}
```

`[bundle r495]` `DJ()` returns the folder's section kind. The hint is `audio/`
for `sound` and `music`, `video/` for `video`, `font` for `font`, `image/` for
`icon`, and `""` for everything else (`script`, `general`).

`[bundle r460]` The same switch, named `bEs`.

Inference: with the registry order in section 1 and the lookup in section 2, an
extension-driven lookup gives `video/webm` for `.webm` only when the hint is
`video/`, that is, in the `video` section. In every other section `.webm` gives
`audio/webm; codecs=opus`.

## 4. The folder map

`[bundle r495]` `[bundle r460]` Both releases hold this literal:

```
new Map([["script","scripts"],["sound","sounds"],["music","music"],["video","videos"],
["font","fonts"],["icon","icons"],["general","files"]])
```

The constructor of the folder class throws `invalid project file kind` for a kind
that is not a key of this map. Section kind -> folder name: `video` -> `videos`.

## 5. The item serializer and the info keys

`[bundle r495]` Serializer excerpt:

```
zO(t){... const e={name:this.G6(),type:this.afs.d$t()};
if("copy"!==s&&(e.sid=this.pl()),"icon"===this.DJ()){const t=this.I8();
  if(e["icon-info"]={purpose:t},"screenshot"===t){... e["icon-info"]["screenshot-label"]=...
    e["icon-info"]["screenshot-form-factor"]=...}}
else"script"===this.DJ()?e["script-info"]={purpose:this.M8()}:e["file-info"]={purpose:this.U8()};
```

`[bundle r495]` In plain words: the entry gets `name`, then `type`, which is the
type string of the item's stored `MimeType` object (`this.afs`), then `sid` unless
the mode is `copy`. Then the info key depends on the section kind:
`icon` -> `icon-info`, `script` -> `script-info`, every other kind (including
`video`, `sound`, `music`, `font`, `general`) -> `file-info`, each as
`{purpose: ...}`. `icon-info` adds `screenshot-label` and
`screenshot-form-factor` only when the purpose is `screenshot` and the value is
non-empty.

`[bundle r460]` The same serializer shape (`xT`), the same three keys, the same
`type: this.kVt.mA()`.

`[bundle r495]` `[bundle r460]` Default purpose, from the item constructor: all
three purpose fields start as `"none"` (icon, script and file purposes).

`[bundle r495]` Valid purpose sets (the setter throws on a value outside its set):

- icon purpose: `none`, `app-icon`, `app-icon-maskable`, `loading-logo`,
  `adaptive-foreground`, `adaptive-background`, `storyboard-splash`,
  `android-splash-icon`, `screenshot`.
- screenshot form factor: `""`, `narrow`, `wide`.
- script purpose: `none`, `main`, `imports-for-events`.
- file purpose: `none`, `html-head-end`, `html-body-start`, `html-body-end`,
  `stylesheet`, `import-map`.
- A second set, `html-head-end`, `html-body-start`, `html-body-end`, `import-map`,
  gates a rule that clears the same purpose from other files when one file takes
  it.

`[bundle r460]` The same icon, form-factor, script, file and gating sets are
present in the same order.

`[bundle r495]` `[bundle r460]` Load rule for icons. When an `icon` entry has an
`icon-info` key, its `purpose` (default `"none"` when missing) is applied. When it
has no `icon-info`, the item name decides: a name matching `/icon\-\d+\.png/i` ->
`app-icon`; `loading-logo.png` -> `loading-logo`; `storyboard-splash.png` ->
`storyboard-splash`. A `script` entry reads `script-info.purpose` and other kinds
read `file-info.purpose`, each only when the key is present.

## 6. Three ways an item gets its `MimeType`

1. **Disk scan of a project folder** `[bundle r495]`. The rescan loop computes
   `MimeType.zfs(extension, this.s5e())` for each file found, then admits the file
   by the category of that type (first segment of the type string): `sound` and
   `music` need `audio`, `video` needs `video`, `icon` needs `image`, `font`
   needs a font predicate on the type (`ILt()`), `script` accepts only `.js`
   (skipped when a `.ts` of the same name exists), and `general` accepts the rest
   (skipping a `.js` that has a same-name `.ts`). The admitted file becomes a new
   item with that `MimeType`. `[bundle r460]` The same loop with `ILt(r, bEs())`.
2. **Import dialog / drop of a `Blob`** `[bundle r495]`:
   ```
   static rai(t){... const i=t.name?extension(t.name).slice(1):"",e=t.type;
   if(!i)return e?MimeType.te(e):Wf(); if(!e)return MimeType.zfs(i);
   for(let t of zf.values())if(t.d$t()===e)for(let e of t.lgi())if(e===i)return t;
   return MimeType.zfs(i)}
   ```
   In plain words: with a browser `File.type`, the registered type whose string
   equals it is used when that type lists the file's extension. Otherwise the
   result is `zfs(ext)` **with no hint**. `[bundle r460]` The same, named `_Es`.
3. **Loading an existing item** `[bundle r495]`: `static te(t){return zf.get(t)||Wf()}`.
   Project load calls `MimeType.te(entry.type)`. The lookup is by exact type
   string, and a string that is not registered gives `application/octet-stream`.
   `[bundle r460]` The same, named `Ke`, used by the same load paths.

Excerpt, the Import Audio dialog `[bundle r495]`: the transcoded file is built
with `{type:"audio/webm; codecs=opus"}` set explicitly, and the output name ends
in `.webm`. `[bundle r460]` The same call is present.

Inference: path 2 passes no section hint, so an Import-dialog `.webm` whose
browser `File.type` is empty or not registered for `webm` resolves to
`audio/webm; codecs=opus`. A browser `File.type` of `video/webm` is registered for
`webm` and is kept. The bundle text alone does not say what type a given browser
reports.

## 7. Import-dialog extension sets

`[bundle r495]` The Import Files dialog declares these sets:

```
hW=new Set([".js",".ts"]), oW=new Set([".wav",".flac",".m4a",".ogg",".opus"]),
aW=new Set([".webm",".ogv",".mp4"]), lW=new Set([".png",".jpeg",".jpg",".svg"]),
cW=new Set([".woff",".woff2",".ttf",".otf",".eot"])
```

Script `.js .ts`; audio `.wav .flac .m4a .ogg .opus`; video `.webm .ogv .mp4`;
image `.png .jpeg .jpg .svg`; font `.woff .woff2 .ttf .otf .eot`.
`[bundle r460]` The audio, video, image and font sets are the same. The script
set was not read at r460.

## 8. Admission of files by content

`[bundle r495]` The folder-import dialog passes an `_us` callback to the file
walker. It is a switch on the target section kind:

```
_us: async t => { switch(i.DJ()){
  case"icon": return await Scs(t);   case"script": return jws(t);
  case"sound": case"music": return await Acs(t) && !await Ocs(t);
  case"video": return await Ocs(t);  case"font": return await Gws(t);
  default: return n?._us ? await n._us(t) : !await Scs(t) && !await Acs(t) && !await Ocs(t) && !await Gws(t) && !jws(t) } }
```

`sound` and `music` accept a file that is audio (`Acs`) and not video (`Ocs`).
`video` accepts a file for which `Ocs` is true. The default (`general`) accepts a
file that none of the icon, audio, video, font and script checks claim, unless a
caller supplies its own callback. `[bundle r460]` The same switch.

`[bundle r495]` `Acs(file)`: returns false unless the file looks like audio or
video by `File.type` (or by registry type of the file name when `File.type` is
empty). It then reads the first 128 bytes and switches on the file's type
(`MimeType.Xoi(file)`: when `File.type` passes a check named `Q0` (not read;
Inference: a string test), the `File.type` text up to the first `;`; else the
registry type for the file name's extension):

- `audio/ogg`, `video/ogg`: magic `1332176723` (`OggS`); the first 64 KiB, decoded
  as text, contains `OpusHead`, or contains `vorbis` and not `theora`.
- `audio/webm`, `video/webm`: magic `440786851` (EBML); the first 64 KiB, decoded
  as text, contains `A_OPUS`, or contains `A_VORBIS` and none of `V_VP8`, `V_VP9`,
  `V_AV1`.
- `audio/wav`: RIFF magic at 0 and `WAVE` at 8. `audio/flac`: `fLaC` at 0.
  `audio/mpeg` and `video/mpeg`: optional ID3 header, then an MPEG frame sync.
  `audio/midi`: `MThd` at 0.
- `audio/mp4`, `video/mp4`: a comparison written `1718909296===!e.getUint32(4,!1)`.
  Inference: the right side is a boolean, so the comparison is never true, and
  control falls through to the default case.
- default: a browser `<audio>` metadata load and a `<video>` metadata load run
  together. The result is true when the audio element loads and the video element
  reports no positive width and height.

`[bundle r495]` `Ocs(file)`: false unless the file looks like audio or video, then:

- `video/webm`, `audio/webm`: EBML magic, and the first 64 KiB contains `V_VP8`,
  `V_VP9` or `V_AV1`.
- `video/ogg`, `audio/ogg`: `OggS` magic, and the first 64 KiB contains `theora`.
- `video/avi`: RIFF magic at 0 and `AVI ` at 8.
- `video/mpeg`, `audio/mpeg`: MPEG program stream pack header `442` at 0 and a
  video stream start code (`0x000001E0` to `0x000001EF`).
- `video/quicktime`, `video/mp4`, `audio/mp4`: `ftyp` (`1718909296`) at offset 4,
  then falls through to the default.
- default: a browser `<video>` metadata load; true when the element reports a
  positive width and height.

`[bundle r460]` The `Acs` and `Ocs` equivalents contain the same magic numbers
and the same marker strings (`A_OPUS`, `A_VORBIS`, `V_VP8`, `V_VP9`, `V_AV1`,
`OpusHead`, `theora`). Their full bodies were not compared line by line.

Inference: these checks decide **which section accepts a file**, for example a
`.webm` with a VP8, VP9 or AV1 track is accepted by `video` and refused by
`sound` and `music`. They do not appear in the path that picks the stored
`type` string (sections 2, 3 and 6).

## 9. Cross-check at r460

What was compared, `[bundle r460]` against `[bundle r495]`:

- the registry: parsed `cf(...)` list, 49 entries, equal to the r495 list minus
  `model/glb` and `model/gltf`, with the same order and the same duplicates
  (`webm`, `js`, `ts`);
- the lookup body (`ILt`), the Blob path (`_Es`), the exact lookup (`Ke`);
- the section hint switch, the folder map literal and the serializer shape;
- the icon, form-factor, script and file purpose sets and the `"none"` defaults;
- the Import dialog audio, video, image and font sets, the `_us` switch and the
  Import Audio `{type:"audio/webm; codecs=opus"}`;
- the presence of the content markers inside the `Acs` and `Ocs` bodies.

Not compared at r460: the exact `Acs`/`Ocs` bodies beyond those markers, and the
script extension set.

## 10. What this capture supports

`[bundle r495]` `[bundle r460]` The stored `type` string of a file entry comes
from the registry in section 1, by extension, narrowed by the section hint in
section 3 when the item is created by a disk scan, or by a registered
`File.type` or the unhinted lookup when it is created by the Import dialog, or by
the exact stored string when an item is loaded. The serializer writes that
`MimeType` object's type string. The bundle text shows an extension -> type
registry for file entries and a hint that separates the two `.webm`
registrations. The content checks in section 8 decide which section accepts a
file; no content check appears in the type lookup.

This qualifies, and does not replace, the "Inherited from the analyst" paragraph
of `raw/issue-86-file-entry-type-evidence-2026-10-01.md` ("there is no
extension -> MIME table for file entries in either release"). That earlier
capture is left unedited as the record of what was believed on 2026-10-01.

Unchanged by this capture: the saves observed in the issue-86 capture; whether a
real editor save in the `video` section writes `video/webm`. That is a claim
about editor output and needs its own capture.

## Not confirmed from the bundle text

- The meaning of the font predicate `ILt()` used for the `font` scan admission
  (only its call site was read).
- The r460 script extension set in the Import dialog.
- The browser `File.type` value for any given file; it depends on the browser.
- The exact r460 `Acs`/`Ocs` bodies line by line.
