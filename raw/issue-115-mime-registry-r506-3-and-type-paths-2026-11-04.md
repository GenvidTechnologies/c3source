# Issue #115 — editor MIME registry at r506-3 and the paths that set a file entry's `type` (capture)

Captured 2026-11-04 for GenvidTechnologies/c3source#115 (file-entry `type` for
extensions that have no row in `EXTENSION_FILE_TYPES`). Provenance: the
Construct 3 editor bundle at three releases, fetched from
`https://editor.construct.net/`. Four files were read:

| Release | Files | Size (bytes) | SHA-256 |
|---|---|---|---|
| r495 | `https://editor.construct.net/r495/main.js` | 1405263 | `17cb8bb085a004e70d7177e6acbda4030515d60a89270e680d4ad43ce3c87f95` |
| r495 | `https://editor.construct.net/r495/projectResources.js` | 1883174 | `fd5f971408a019098d72edf97200ff462df593ccdd337d37c62f141ed195b0f7` |
| r506-3 | `https://editor.construct.net/r506-3/main.js` | 1439846 | `66e55058d1941d20680fb75871b70de3fdad5efdee4cb97c4c7908fd8df9ee1f` |
| r509 | `https://editor.construct.net/r509/main.js` | 1448763 | `6950431ec472751ae18df9f6b522fdf607ef244266183d1028d51450d7857ac4` |

**How the newest release was found.** Observation, 2026-11-04: the
`editor.construct.net` page labels the stable release with the number 506 and
the revision 3, and serves its assets under `/r506-3/`. An HTTP HEAD request for
`/rNNN/main.js` returned 200 for r504, r505, r506, r506-3, r507, r508 and r509.
It returned 404 for r510, r511 and r520. Whether r507, r508 and r509 are beta
releases is not established by anything read here. They are quoted as releases
that exist at that URL on that date.

**Method.** The bundle files were fetched and read as untrusted text. They were
never executed, imported or run. The script below reads a file as a string,
finds the first registration call, and cuts the following comma-separated calls
by counting parentheses and skipping string literals. It does not evaluate the
call text. The helper name is an argument because the minifier renames it: `Vf`
at r495, `Zf` at r506-3 and `ip` at r509. The scope table in section 4 was
produced by a second script that reads the same call text and the
`EXTENSION_FILE_TYPES` literal in `src/manifest.ts` as text. Excerpts of the
lookup and of the entry paths were cut with `grep -o` and a fixed number of
context characters.

```js
// usage: node extract-reg.mjs <main.js> <helperName>
// Reads the bundle as text. Never evaluates it.
import { readFileSync } from "node:fs";
const [file, name] = process.argv.slice(2);
const src = readFileSync(file, "utf8");
const start = src.indexOf(name + '("text/html"');
if (start < 0) throw new Error("first call not found");
const calls = [];
let i = start;
while (src.startsWith(name + "(", i)) {
  let j = i + name.length + 1;
  let depth = 1;
  let q = null;
  for (; j < src.length && depth > 0; j++) {
    const c = src[j];
    if (q) {
      if (c === "\\") j++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  calls.push(src.slice(i, j));
  if (src[j] === ",") i = j + 1;
  else break;
}
for (const c of calls) console.log(c);
console.error("count=" + calls.length);
```

**Labels.** Every claim carries `[bundle r495]`, `[bundle r506-3]` or
`[bundle r509]`. A line that begins "Inference:" is the capturer's reading and
is not bundle text. Minified names (`zfs`, `rai`, `te`, `s5e`, ...) change
between releases and are quoted as found. This capture makes **no claim about
what an editor save writes to disk**. That needs its own capture.

**Relation to earlier captures.** The registry, the lookup, the section hint and
the load rule at r495 were first captured in
`raw/issue-113-video-section-bundle-evidence-2026-11-02.md`. This capture adds
the r506-3 and r509 registries, and it traces every place a file item's
`MimeType` is set.

## 1. The r506-3 registrations

`[bundle r506-3]` The registry is filled by calls to a helper
`Zf(type, extOrExts, label, flags?)`. The fallback object is
`new $f.MimeType("application/octet-stream",[],"Binary")`. The parser found
**53** `Zf` registrations, from `Zf("text/html"` to `Zf("model/obj"`. Verbatim
call text, in registration order:

```
Zf("text/html",["html","htm"],"HTML",Hf)
Zf("application/javascript","js","JavaScript",zf)
Zf("text/javascript","js","JavaScript",zf)
Zf("application/typescript","ts","TypeScript",zf)
Zf("text/typescript","ts","TypeScript",zf)
Zf("text/css","css","CSS",Hf)
Zf("application/json",["json","scon"],"JSON",zf|Hf)
Zf("text/xml",["xml","scml"],"XML",Hf)
Zf("text/csv","csv","CSV",Hf)
Zf("text/tab-separated-values","tsv","Tab-separated values",Hf)
Zf("text/plain","txt","Text",Hf)
Zf("text/markdown","md","Markdown",Hf)
Zf("text/x-ini","ini","INI configuration file",Hf)
Zf("image/png","png","PNG",jf|Wf)
Zf("image/apng","apng","APNG",jf|Wf)
Zf("image/jpeg",["jpg","jpeg"],"JPEG",jf)
Zf("image/jxl","jxl","JPEG XL",jf)
Zf("image/svg+xml","svg","SVG",zf|Hf)
Zf("image/webp","webp","WebP",jf|Wf)
Zf("image/gif","gif","GIF",jf|Wf)
Zf("image/tiff",["tif","tiff"],"TIFF")
Zf("image/bmp","bmp","Bitmap")
Zf("image/x-icon","ico","Icon")
Zf("image/avif",["avif","avifs"],"AVIF",jf|Wf)
Zf("audio/ogg; codecs=opus","opus","Ogg Opus",jf)
Zf("audio/ogg; codecs=vorbis","ogg","Ogg Vorbis",jf)
Zf("audio/webm; codecs=opus","webm","WebM Opus",jf)
Zf("audio/mp4","m4a","MPEG-4 AAC",jf)
Zf("audio/wav","wav","WAV")
Zf("audio/flac","flac","FLAC",jf)
Zf("audio/mpeg","mp3","MP3",jf)
Zf("audio/midi",["mid","midi","kar"],"MIDI")
Zf("video/webm","webm","WebM",jf)
Zf("video/ogg","ogv","Ogg video",jf)
Zf("video/mp4","mp4","MPEG-4 video",jf)
Zf("video/mpeg",["mpg","mpeg"],"MPEG video",jf)
Zf("video/quicktime",["mov","qt"],"Quicktime movie",jf)
Zf("video/avi","avi","AVI")
Zf("application/font-woff","woff","Web font",Vf|jf)
Zf("font/woff2","woff2","Web font",Vf|jf)
Zf("application/font-sfnt",["ttf","otf"],"TrueType/OpenType font",Vf)
Zf("application/vnd.ms-fontobject","eot","Embedded OpenType",Vf)
Zf("application/pdf","pdf","PDF",Hf)
Zf("application/zip",["zip","c3p","capx"],"ZIP",jf|Hf)
Zf("application/wasm","wasm","WebAssembly",Hf)
Zf("application/wast","wast","WebAssembly Text format",zf|Hf)
Zf("application/octet-stream","mem","asm.js memory",Hf)
Zf("application/x-construct3-addon","c3addon","Construct addon",jf|qf)
Zf("application/x-construct2-addon","c2addon","Construct 2 addon",jf|qf)
Zf("model/glb","glb","GLB",Kf)
Zf("model/gltf","gltf","GLTF",Kf)
Zf("model/fbx","fbx","fbx",Kf)
Zf("model/obj","obj","obj",Kf)
```

`[bundle r506-3]` Three extensions are registered under two types: `js`
(`application/javascript` first, then `text/javascript`), `ts`
(`application/typescript` first, then `text/typescript`) and `webm`
(`audio/webm; codecs=opus` first, then `video/webm`). The 53 registrations list
63 distinct extensions. 60 of them map to one type.

## 2. Difference from r495 and r509

`[bundle r495]` The same helper is named `Vf`. The parser found **51**
registrations, from `Vf("text/html"` to `Vf("model/gltf"`. Compared by type,
extension list and label (the flag argument is a minified identifier that
differs by release and was not compared), the 51 are equal to the first 51 of
the r506-3 list, in the same order. r495 is an exact prefix of r506-3.

`[bundle r506-3]` The two registrations after the r495 prefix are
`Zf("model/fbx","fbx","fbx",Kf)` and `Zf("model/obj","obj","obj",Kf)`.

`[bundle r509]` The helper is named `ip`. The parser found **54**
registrations. Compared by type, extension list and label, the first 53 equal
the r506-3 list in the same order, except for four labels:

| Type | Label at r506-3 | Label at r509 |
|---|---|---|
| `model/glb` | `GLB` | `GL Binary` |
| `model/gltf` | `GLTF` | `GL Transmission Format` |
| `model/fbx` | `fbx` | `Filmbox` |
| `model/obj` | `obj` | `Wavefront Object format` |

The 54th registration is
`ip("model/mtl","mtl","Wavefront Material Template Library",Xf)`. The type
strings and extension lists of the 53 shared registrations did not change
between r506-3 and r509. r506-3 is an exact prefix of r509 by type and
extension.

## 3. The lookup rule

`[bundle r495]` Static method `zfs`:

```
static zfs(t,i){Of.bp(t),Of.Aut(i),t.length&&"."===t[0]&&(t=t.substr(1)),t=t.toLowerCase();const e=[];for(const i of zf.values())for(const s of i.lgi())s===t&&e.push(i);if(!e.length)return Wf();if(1===e.length||!i)return e[0];for(const t of e)if(t.d$t().toLowerCase().includes(i.toLowerCase()))return t;return e[0]}
```

`[bundle r506-3]` The same body under the name `mYt`:

```
static mYt(t,i){$f.ib(t),$f.hJ(i),t.length&&"."===t[0]&&(t=t.substr(1)),t=t.toLowerCase();const e=[];for(const i of Yf.values())for(const s of i.wCs())s===t&&e.push(i);if(!e.length)return Qf();if(1===e.length||!i)return e[0];for(const t of e)if(t.Slt().toLowerCase().includes(i.toLowerCase()))return t;return e[0]}
```

`[bundle r509]` The same body under the name `OXt`:

```
static OXt(t,i){Vf.ty(t),Vf.o3(i),t.length&&"."===t[0]&&(t=t.substr(1)),t=t.toLowerCase();const e=[];for(const i of Jf.values())for(const s of i.zZi())s===t&&e.push(i);if(!e.length)return tp();if(1===e.length||!i)return e[0];for(const t of e)if(t.oht().toLowerCase().includes(i.toLowerCase()))return t;return e[0]}
```

`[bundle r495]` `[bundle r506-3]` `[bundle r509]` Normalized statement of the
three bodies. Take the extension and an optional hint. Remove one leading dot.
Lower-case the extension. Collect every registration that lists the extension,
in registration order. With no registration, return the fallback object
(`application/octet-stream`). With exactly one registration, or with no hint,
return the first. Otherwise return the first registration whose type string
contains the hint, compared case-insensitively. If none contains the hint,
return the first. Only the minified names differ: the registry map, the
extension-list getter, the type getter and the fallback function. The
control-flow text is the same in the three releases.

## 4. Extensions with one registration and the flat table

`[bundle r506-3]` The scope question for #115 is which extensions have a single
registration and no row in the flat `EXTENSION_FILE_TYPES` of
`src/manifest.ts`. That table has **20** rows (read from the source file):
`.css .html .json .png .js .ts .ttf .webm .plist .txt .xml .vtt .jpg .jpeg
.gif .svg .webp .mp4 .mp3 .m4a`.

**Multi-registration extensions (3):** `js`, `ts` and `webm`. The lookup result
for each depends on the hint (section 3). Each has a flat row.

**Single-registration extensions that already have a flat row (15):** `html`,
`css`, `json`, `xml`, `txt`, `png`, `jpg`, `jpeg`, `svg`, `webp`, `gif`, `m4a`,
`mp3`, `mp4` and `ttf`. For each, the flat row is byte-equal to the single
registered type. The flat table also holds `.plist` and `.vtt`, which have no
registration at r506-3 (both rows hold `application/octet-stream`).

**In scope (45).** 60 single-registration extensions minus the 15 above. Each
row is the registered type at r506-3:

| Extension | Type |
|---|---|
| `htm` | `text/html` |
| `scon` | `application/json` |
| `scml` | `text/xml` |
| `csv` | `text/csv` |
| `tsv` | `text/tab-separated-values` |
| `md` | `text/markdown` |
| `ini` | `text/x-ini` |
| `apng` | `image/apng` |
| `jxl` | `image/jxl` |
| `tif` | `image/tiff` |
| `tiff` | `image/tiff` |
| `bmp` | `image/bmp` |
| `ico` | `image/x-icon` |
| `avif` | `image/avif` |
| `avifs` | `image/avif` |
| `opus` | `audio/ogg; codecs=opus` |
| `ogg` | `audio/ogg; codecs=vorbis` |
| `wav` | `audio/wav` |
| `flac` | `audio/flac` |
| `mid` | `audio/midi` |
| `midi` | `audio/midi` |
| `kar` | `audio/midi` |
| `ogv` | `video/ogg` |
| `mpg` | `video/mpeg` |
| `mpeg` | `video/mpeg` |
| `mov` | `video/quicktime` |
| `qt` | `video/quicktime` |
| `avi` | `video/avi` |
| `woff` | `application/font-woff` |
| `woff2` | `font/woff2` |
| `otf` | `application/font-sfnt` |
| `eot` | `application/vnd.ms-fontobject` |
| `pdf` | `application/pdf` |
| `zip` | `application/zip` |
| `c3p` | `application/zip` |
| `capx` | `application/zip` |
| `wasm` | `application/wasm` |
| `wast` | `application/wast` |
| `mem` | `application/octet-stream` |
| `c3addon` | `application/x-construct3-addon` |
| `c2addon` | `application/x-construct2-addon` |
| `glb` | `model/glb` |
| `gltf` | `model/gltf` |
| `fbx` | `model/fbx` |
| `obj` | `model/obj` |

Notes on the table. `fbx` and `obj` are in scope at r506-3 and were not
registered at r495. `mtl` (r509 only) is not in the table, because the table is
the r506-3 registry. `mem` is registered as `application/octet-stream`, the
same string as the fallback, so for `mem` the registry and the fallback agree.
The scope test uses only the flat table. The doc comment of
`EXTENSION_FILE_TYPES` in `src/manifest.ts` says the section-specific table
`SECTION_EXTENSION_FILE_TYPES` holds cells for `.webm`, `.ogv` and `.mov`, so
`ogv` and `mov` are counted here although they have a section-specific cell.

## 5. Where a file item's type is set (r495)

All excerpts in this section are `[bundle r495]`. The item class is
`window.WJ=class t extends self.JX`, in `projectResources.js`.

**The class stores the type once.** The constructor is
`constructor(t,s,e,i){if(rn.Bt(t,self.US),rn.Bt(s,rn.MimeType),rn.bp(e),rn.Bt(i,Blob),super(t),...this.afs=s,this.oAi=e,...`.
The second argument must be a `MimeType`. A search of `projectResources.js` for
`.afs=` found one assignment, `this.afs=s` in that constructor. A search of
`main.js` found none. The getter is `m$t(){return this.afs}`. The serializer
writes `type:this.afs.d$t()`. Observation: nothing in the two files reassigns
the type after construction.

**The lookup helpers.** `rai` (a `MimeType` static taking a `Blob`):

```
static rai(t){Of.Bt(t,Blob);const i=t.name?Of.VHt(t.name).slice(1):"",e=t.type;if(!i)return e?Of.MimeType.te(e):Wf();if(!e)return Of.MimeType.zfs(i);for(let t of zf.values())if(t.d$t()===e)for(let e of t.lgi())if(e===i)return t;return Of.MimeType.zfs(i)}
```

Normalized. With no extension: use `te(File.type)` when `File.type` is set,
else the fallback. With an extension and an empty `File.type`: `zfs(ext)`, with
no hint. With both: the registration whose type equals `File.type` and that
lists the extension. Otherwise `zfs(ext)`, with no hint. `te` is
`static te(t){return zf.get(t)||Wf()}`: the registry is keyed by type string,
so a registered string returns its registration and any other string returns
the fallback.

**Every construction of the item class that was found:**

1. **Add a `Blob` to a folder, new name.** `n5e(t,s)` renames until the name is
   free, then runs `const i=wn.MimeType.rai(t),n=wn.m(gn,e,i,s,t)`. Its caller
   `SJt(t)` is `return wn.ocs(t),this.n5e(t,wn.asi(t.name))`. The type is
   `rai(Blob)`.
2. **Add or replace a `Blob` under a given name.** `Qct(t,s,e,i)` and its
   async twin `o5e(t,s,e,i)` look up an item with that name. If one exists they
   run `r.k2e(t)` (path 6). Otherwise, with no filter callback or when the
   callback accepts the blob, they run `const e=wn.MimeType.rai(t);return
   r=wn.m(gn,n,e,s,t)`. The type is `rai(Blob)`. Callers found: `r5e` calls
   `Qct`; `h5e` calls `o5e`; `uJt(t,s)` calls `r5e` once per file; two callers
   in the dialog code run `n.uJt(t)` and `t.uJt(s)`; the scripting method
   `AddOrReplaceProjectFile(t,i,e="general")` in `main.js` ends with
   `s.Qct(t,r)`; and the icon generators run
   `this.iVt().Qct(i,s.Rrt(".icon",e)+".png")` and
   `this.iVt().Qct(e,s(".loading-logo")+".png")`.
3. **Drag and drop.** In `main.js`, `async uj(t)` handles a drop with
   `t.dataTransfer.files`. For a single file it switches on the extension.
   `capx`, `caproj`, `c3p`, `c3proj`, `zip`, `c3addon` and the image, `svg`
   and `glb`/`gltf` cases open a project, an addon or an object flow. The
   `wav`, `webm`, `flac`, `opus`, `ogg` and `m4a` cases call the ImportAudio
   dialog method `ous`, which runs `n.uJt(t)` (path 2). Other single files go
   to `fZe`/`pZe`, and a drop of several files takes another branch. Neither
   was read further. A drop on the Import Files dialog runs `oSr`, which calls
   `LSr`, which calls `$Sr` per file. `$Sr` shows a type in the table row with
   `n=t.type?qz.MimeType.te(t.type):qz.MimeType.zfs(s.ext,this.cSr.s5e())`. The
   `s5e()` hint is the section hint of the target folder (see the earlier
   capture). Inference: that row shows a type for the user and the added item
   gets its type from `rai` (path 2), so the row and the stored type can
   differ.
4. **Disk rescan of a project folder.**
   `const r=wn.VHt(t).toLowerCase(),o=wn.MimeType.zfs(r,this.s5e());` followed
   by a switch on the section kind, then
   `i=wn.m(gn,this.Ie(),o,t,e)`. The type is `zfs(ext, hint)`, with the
   section hint.
5. **Duplicate.** `f$t(t)` runs
   `const r=wn.m(gn,s,t.m$t(),n+i,t.sI())`. The new item gets the same
   `MimeType` object as the source (`t.m$t()`).
6. **Replace or reload a blob.** `k2e(t,s=!0,e=!1)` returns early if
   `this.lBi===t`, else sets `this.lBi=t` and raises
   `projectfileblobchange`. It has no `afs` assignment. The type is kept.
7. **Project load.** `static async K2e(s,e,i,n)` runs
   `const r=e.name,h=e.type,...const l=rn.MimeType.te(h)` and then
   `rn.m(t,o,l,t.R2e(r,o,s,n),c)`. The type is `te(stored string)`.
8. **A record that carries `audioProjectFile`.** `static async Y2e(s,e)` runs
   `r=e.type,h=rn.MimeType.te(r)` and `rn.m(t,i,h,n,o)`. Its caller tests
   `t.hasOwnProperty("audioProjectFile")&&t.audioProjectFile&&t.audioProjectFile.blobData`
   and picks the sound or music folder from `t.audioType`. The type is
   `te(stored string)`.
9. **An XML-driven loader.** `static async Z2e(s,e,i,n)` reads
   `h=e.YMt("name"),o=rn.VHt(h),a=rn.MimeType.zfs(o)`, looks the file up as
   `` `Files\\${h}` `` and runs `rn.m(t,r,a,t.R2e(h,r,null,n),f)`. The type is
   `zfs(ext)` with no hint. Inference: this is the legacy Construct 2 project
   import, because it reads XML elements and a `Files\` path. The code does not
   name it.
10. **Switching a script between JavaScript and TypeScript.** The code builds
    the new item with `c=En.MimeType.te("typescript"===s?"application/typescript":"application/javascript")`
    and `En.m(globalThis.WJ,t,c,a,l)`. The type is one of two fixed strings.

The seven textual `m(gn,` calls are in path 1 (one), path 2 (four, two in
each of the two methods), path 4 (one) and path 5 (one). The three static loaders (paths 7 to 9) and the language switch (path
10) construct the class by other names. A search for the other aliases of
`self.WJ` in `projectResources.js` found no further construction.

**What the trace shows.** For an extension with exactly one registration,
`zfs` returns that registration with or without a hint (section 3). Paths 4, 5,
6 and 9 therefore give that registration, or keep the one the item already has.
In `rai`, the branch that matches `File.type` can return only a registration
that lists the extension. For a single-registration extension that is the same
registration, so the branch cannot give another type. When `File.type` is empty
or matches no registration that lists the extension, `rai` falls back to
`zfs(ext)`, which gives the registration too. A file with no extension returns
`te(File.type)`, which can be any registered type. That file has no extension,
so it is outside the scope of section 4. Paths 7 and 8 keep any registered
stored string, whatever the file's extension. Observation from the code: for a
single-registration extension, no path that creates an item from a file name
records a type other than the registered one. Paths 7 and 8 record whatever
registered string was stored.

## 6. The load finding

`[bundle r495]` Project load calls `te` on the stored `type` string (path 7 in
section 5). `te` is a lookup by exact type string. A registered string returns
its registration. A string that is not registered returns the fallback
`application/octet-stream`. Nothing in `K2e` compares the stored string with
the type that `zfs` would give for the file's extension.

Inference: a registered stored type survives load unchanged, even when it
differs from the type the extension lookup would give, and the editor does not
re-derive the type from the extension at load. Inference: a stored type that
no registration holds is replaced by `application/octet-stream` at load. The
second reading is a consequence of `te`; the bundle text does not show a
later step that would restore the stored string.

This finding is about load. It does not say what a later save writes. The
serializer writes `this.afs.d$t()` (section 5), so the written string is the
registration's type string. A save test would be needed to confirm it.

## Not confirmed from the bundle text

- Only r495 was traced for the entry paths. `projectResources.js` was not
  fetched for r506-3 or r509. The `rai` and `te` bodies in the r506-3 and
  r509 `main.js` files were not compared with r495.
- The registry flag arguments (`Uf`, `Hf`, `Xf`, ...) are minified identifiers
  and were not mapped between releases.
- No editor save tests these paths. Nothing here says what the editor writes
  to `project.c3proj`.
- Lazily loaded bundle files were not read. A construction of the item class
  in a file other than `main.js` and `projectResources.js` would not appear
  here.
- The drop branches for several files and for single files with other
  extensions (`fZe`, `pZe`) were not read. The caller chain from the Import
  Files dialog to `uJt` was not traced to one call site.
- The browser `File.type` value for any given file depends on the browser and
  was not observed.
- Whether r507, r508 and r509 are beta releases is not established.
