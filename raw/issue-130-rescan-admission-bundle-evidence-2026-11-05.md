# Issue #130 — the editor's rescan admission rule for `rootFileFolders` sections: bundle evidence at r495 and r506-3 (capture)

**Captured:** 2026-11-05
**For:** GenvidTechnologies/c3source#130 (export the rule by which the C3 editor decides whether an unlisted file or folder on disk is added to a `rootFileFolders` section when it rescans the project folder)
**Source:** the Construct 3 editor bundle at release r495 (the release the library pins its rule tables to) and at release r506-3 (the newest stable release at capture time), fetched from `https://editor.construct.net/`. The question: which name, position and category rules decide whether the rescan adds an entry, which names are reserved, how the `.ts` twin is looked up, and does the newer release change any of it?
**Nature:** the verbatim minified source around each needle, the method that found it, and a comparison of the rescan code at the two releases. No bundle code was run, imported or evaluated. No editor was run. The only editor observation of rescan admission is the one already recorded in `raw/issue-113-video-section-editor-save-2026-11-02.md` (section 12).

Labels used below:

- **Read:** the text is in the bundle and was read. The code was not executed, so "read" means "the code says so", not "an editor run showed so".
- **Inferred:** drawn from read text by reasoning, not confirmed by an editor run.
- **Not confirmed:** not read, or no authoritative source was found. Section 13 lists them.

---

## 1. Files read

| Release | URL | Bytes | sha256 |
|---|---|---|---|
| r495 | `https://editor.construct.net/r495/main.js` | 1405263 | `17cb8bb085a004e70d7177e6acbda4030515d60a89270e680d4ad43ce3c87f95` |
| r495 | `https://editor.construct.net/r495/projectResources.js` | 1883174 | `fd5f971408a019098d72edf97200ff462df593ccdd337d37c62f141ed195b0f7` |
| r506-3 | `https://editor.construct.net/r506-3/main.js` | 1439846 | `66e55058d1941d20680fb75871b70de3fdad5efdee4cb97c4c7908fd8df9ee1f` |
| r506-3 | `https://editor.construct.net/r506-3/projectResources.js` | 1918709 | `e5efce46d6543dd0e9f5ce20295b68decbbe5b941c747f9bd3519da1a152df4c` |

The three hashes of `main.js` at r495 and r506-3 and of `projectResources.js` at r495 equal the ones in `raw/issue-115-mime-registry-r506-3-and-type-paths-2026-11-04.md`. That capture hashes only `main.js` at r506-3, so the r506-3 `projectResources.js` hash is new here and was not compared with an earlier capture.

**The r495 and r495-2 bundles are different files.** `raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md` read r495-2, whose `main.js` hash begins `18c7a7ce`. Every statement below about "r495" is about the bundle whose `main.js` hash begins `17cb8bb0`. Where the names of that capture differ from the names here, it is because the minifier renamed identifiers between the two builds (for example the name validator is `rRi` at r495-2 and `nsi` at r495).

The r506-3 files were fetched on 2026-11-05 with `curl -sS -f` into a new directory. The sha256 values were measured with `sha256sum` on the saved copies, and again with a hash routine in the extraction script below.

## 2. How the excerpts were extracted

The bundles are one or two very long lines. They were read as text only, never run, imported or loaded as modules:

- A Node script, kept in a different directory from the downloaded files, reads each file with `fs.readFileSync(path, "utf8")`.
- It finds a start needle with `String.prototype.indexOf`, finds the end needle after it, and slices the text between them (end needle included). The "character offset" given with each excerpt is that `indexOf` result: a JavaScript string index, counted in UTF-16 code units from the start of the file. The script counts every `indexOf` match of the start needle and reports the count as "hits"; the excerpt is the first match.
- The script wrote each excerpt into this file without retyping it. The needle is given with each excerpt, so a reader can repeat the search with `indexOf` or `grep -F`.
- Characters that are invisible or whitespace-class are written as `<U+XXXX>`. This is the only change made to an excerpt. Escapes written in the bundle source as text (for example the two characters backslash and `t`) are kept as they are.
- The comparison of the two rescan methods (section 10) was made two ways. One was a brace-matched cut of each method followed by a positional token compare, with identifiers replaced by a placeholder and the unminified names kept. The other was a second token compare by a different tokenizer, repeated when this file was written. A compare that masks identifiers cannot show a swap of two identifiers that is consistent across the whole method. The first compare also checked that the identifier pairing is a one-to-one map.

## 3. The needles

Offsets are in the r495 files unless the file column says r506-3. The hit count is the number of `indexOf` matches of the start needle in that file.

| File | Needle | Hits | Offset |
|---|---|---|---|
| r495 projectResources.js | `async l5e(t,s){` | 1 | 301902 |
| r495 projectResources.js | `async DJt(t){` | 1 | 835403 |
| r495 projectResources.js | `async H_n(t,s){` | 1 | 836007 |
| r495 projectResources.js | `async TZe(t){` | 1 | 836319 |
| r495 main.js | `await h.TYe("webfs-local-folder"` | 1 | 1343837 |
| r495 projectResources.js | `J_n(){` | 1 | 834406 |
| r495 projectResources.js | `await t.J_n()` | 1 | 1867882 |
| r495 main.js | `i.DJt(i.WLt())` | 1 | 1380959 |
| r495 main.js | `Tm.Ccs.HCi=async function` | 1 | 336743 |
| r495 main.js | `Ah.nsi=function` | 1 | 84012 |
| r495 main.js | `Rh=new Set(` | 1 | 83721 |
| r495 main.js | `Ah.hsi=function` | 1 | 84690 |
| r495 main.js | `Zu.rsi=function` | 1 | 213465 |
| r495 main.js | `const Ju=new Set(` | 1 | 213408 |
| r495 projectResources.js | `ln=new Set([` | 1 | 285001 |
| r495 projectResources.js | `static _Lt(t){` | 1 | 288272 |
| r495 projectResources.js | `ELt(t){return(this.yUt` | 1 | 5380 |
| r495 projectResources.js | `hK(){return!this.yUt}` | 1 | 5258 |
| r495 projectResources.js | `ELt(t){return this.hK()?` | 1 | 299222 |
| r495 projectResources.js | `i5e(t){switch(t){` | 1 | 1865139 |
| r495 projectResources.js | `kCi(){return"scripts/"}` | 1 | 1864817 |
| r495 projectResources.js | `jxn(){return"media/"}` | 1 | 1864921 |
| r495 projectResources.js | `Dxn(){return"icons/"}` | 1 | 1864942 |
| r495 projectResources.js | `bn=new Map([["script"` | 1 | 298153 |
| r495 projectResources.js | `ZD(t,s){if(wn.Bt(t,gn)` | 1 | 299286 |
| r495 projectResources.js | `default:if(s?.name&&""===t.ELt()&&self.WJ._Lt(s.name))return!1` | 1 | 1724083 |
| r495 projectResources.js | `if(""===this.cSr.ELt())for(const t of this.Nus)if(self.WJ._Lt(t.name)){` | 1 | 1726946 |
| r495 projectResources.js | `for(const[t,i]of o){` | 1 | 302424 |
| r495 projectResources.js | `k(t){if(h.bp(t),this.hK())throw new Error("cannot rename root folder")` | 1 | 3827 |
| r495 projectResources.js | `Ijs(){return[]}` | 1 | 5230 |
| r495 projectResources.js | `s5e(){switch` | 1 | 298737 |
| r495 main.js | `.VHt=function` | 1 | 85491 |
| r495 main.js | `Lh.fsi=function` | 1 | 85569 |
| r495 main.js | `this.Jwi=t.split("/")[0]` | 1 | 262303 |
| r495 main.js | `j$t(){return this.Jwi}` | 1 | 262729 |
| r495 main.js | `const Of=self.t,Df=1` | 1 | 262014 |
| r495 main.js | `this.egi=!!(s&Df)` | 1 | 262580 |
| r495 main.js | `ILt(){return this.ngi}` | 2 | 262882 |
| r495 main.js | `Vf("application/font-woff"` | 1 | 265815 |
| r495 projectResources.js | `TLt(t){return $y.bp(t)` | 1 | 834098 |
| r495 projectResources.js | `ttt(t){` | 1 | 834017 |
| r495 projectResources.js | `*S6(t=!0){` | 1 | 833413 |
| r495 projectResources.js | `*xJt(t=!0){` | 1 | 833018 |
| r495 projectResources.js | `*ZHt(){const t=this.wjs` | 1 | 7940 |
| r495 projectResources.js | `up(){return 0===this.ajs}` | 1 | 1850 |
| r495 projectResources.js | `P6(t){` | 1 | 291050 |
| r495 projectResources.js | `G6(){return this.oAi}` | 1 | 287119 |
| r495 projectResources.js | `cK(){if(!this.tfs)throw` | 12 | 288693 |
| r495 main.js | `.hM=function` | 1 | 86595 |
| r506-3 projectResources.js | `async KNs(t,s){` | 1 | 321172 |
| r506-3 projectResources.js | `In=new Set([` | 1 | 304190 |
| r506-3 projectResources.js | `static Int(t){` | 1 | 307466 |
| r506-3 main.js | `Ah.Jrs=function` | 1 | 84039 |
| r506-3 projectResources.js | `Cnt(t){return this.fY()` | 1 | 318477 |
| r506-3 projectResources.js | `rlt(t){` | 1 | 310267 |
| r495 projectResources.js | `h.push((async()=>{const s=await n.getFile()` | 1 | 303106 |
| r495 projectResources.js | `for(const t of r.values())t.Tjs(),t.qR(),s.u5e++` | 1 | 302375 |
| r495 projectResources.js | `qR(...t){this.fjs(...t)}` | 1 | 2065 |
| r495 projectResources.js | `fjs(...t){let s=this.up()` | 1 | 2114 |
| r495 projectResources.js | `fjs(){this.xLt()&&this.oM(),super.fjs()}` | 1 | 286823 |

Two rows need a note. The needle `cK(){if(!this.tfs)throw` has 12 matches, because every file class has the same method; the excerpt in section 9.1 is the first match at or after the start of `window.WJ=class` (offset 285717), at offset 288693, and the "Offset" column of that row shows it. The needle `ILt(){return this.ngi}` has 2 matches; the first, in the `MimeType` class of `main.js`, is the one quoted.

---

## 4. The rescan method `l5e` and its callers

### 4.1 The method

`l5e(handle, counters)` is a method of the folder class (`window.UNt=class` in `projectResources.js`). It takes a `FileSystemDirectoryHandle` for the folder and a counters object. `e` is the section name (`this.DJ()`), `i` is the project. **Read.**

Source: r495 projectResources.js, character offset 301902 (first `indexOf` match of the start needle); 1346 characters.
Start needle: `async l5e(t,s){`
End needle (included): `await Promise.all(h)}`

```
async l5e(t,s){const e=this.DJ(),i=this.Ie(),n=new Map([...this.Sj()].map(t=>[t.gh(),t])),r=new Map([...this.items()].map(t=>[t.G6(),t])),h=[],o=new Map,a=new Map;for await(const[e,i]of t.entries()){const t=i.kind;if("directory"===t){const t=n.get(e);t?(n.delete(e),s.c5e++,h.push(t.l5e(i,s))):o.set(e,i)}else if("file"===t){const t=r.get(e);t?(r.delete(e),h.push((async()=>{await t.B2e(i)?s.u5e++:s.c5e++})())):a.set(e,i)}}for(const t of n.values())t.Fjs(),t.qR(),s.u5e++;for(const t of r.values())t.Tjs(),t.qR(),s.u5e++;for(const[t,i]of o){if("script"===e&&this.hK()&&"ts-defs"===t)continue;if(!wn.nsi(t))continue;const n=this.Hj();n.k(t),n.Pjs(),h.push(n.l5e(i,s)),s.u5e++}for(const[t,n]of a){if(!wn.nsi(t))continue;if(""===this.ELt()&&gn._Lt(t))continue;const r=wn.VHt(t).toLowerCase(),o=wn.MimeType.zfs(r,this.s5e());switch(e){case"script":if(".js"!==r)continue;const s=wn.fsi(t,"ts");if(i.TLt(this.ELt()+s))continue;break;case"general":if(".js"===r){const s=wn.fsi(t,"ts");if(i.TLt(this.ELt()+s))continue}break;case"sound":case"music":if("audio"!==o.j$t())continue;break;case"video":if("video"!==o.j$t())continue;break;case"font":if(!o.ILt())continue;break;case"icon":if("image"!==o.j$t())continue}h.push((async()=>{const s=await n.getFile(),e=await wn.vni(s),i=wn.m(gn,this.Ie(),o,t,e);this.ZD(i),i.Pjs()})()),s.u5e++}await Promise.all(h)}
```

**Read**, in the order the method runs:

1. It builds two Maps from the folder's current children: subfolders keyed by their name (`gh()`) and file items keyed by their file name (`G6()`). The match against the disk is an exact string match at that folder level.
2. It iterates the disk entries with `for await ... of t.entries()`. A directory with a listed subfolder of the same name is removed from the subfolder Map and recursed into. A file with a listed item of the same name is removed from the file Map and reloaded through `B2e`. Everything else goes into `o` (unlisted directories) or `a` (unlisted files).
3. Subfolders still in the Map (listed, not on disk) are removed (`Fjs()` then `qR()`), and so are file items still in the Map (`Tjs()` then `qR()`). Each counts once in `u5e`. This runs synchronously, before the loops over `o` and `a`.
4. The loop over `o` decides which unlisted directories are added (section 6).
5. The loop over `a` decides which unlisted files are added (sections 5, 7, 8 and 9).
6. `await Promise.all(h)` waits for every started asynchronous task.

### 4.2 The callers

The method has three callers in `projectResources.js`. **Read.**

Source: r495 projectResources.js, character offset 835403 (first `indexOf` match of the start needle); 440 characters.
Start needle: `async DJt(t){`
End needle (included): `finally{i&&(i.HB(),i=null)}`

```
async DJt(t){if($y.Bt(t,sb),"webfs-local-folder"!==this.THt())throw new Error("not a folder project");const s=this.EHt().folderHandle;if(!(s instanceof FileSystemDirectoryHandle))return;const e={u5e:0,c5e:0};let i=null;try{if(!await this.z_n())return;i=$y.ee.ie.te("Progress"),i.Gh();const n=await $y.Ccs.HCi(s,t.xjs(),!1);await t.l5e(n,e)}catch(s){console.error(`Error reloading project folder '${t.gh()}': `,s)}finally{i&&(i.HB(),i=null)}
```

Source: r495 projectResources.js, character offset 836007 (first `indexOf` match of the start needle); 312 characters.
Start needle: `async H_n(t,s){`
End needle (included): `` console.error(`Error reloading project folder '${t.gh()}': `,s)}} ``

```
async H_n(t,s){if($y.Bt(t,sb),"webfs-local-folder"!==this.THt())throw new Error("not a folder project");const e=this.EHt().folderHandle;if(e instanceof FileSystemDirectoryHandle)try{const i=await $y.Ccs.HCi(e,t.xjs(),!1);await t.l5e(i,s)}catch(s){console.error(`Error reloading project folder '${t.gh()}': `,s)}}
```

Source: r495 projectResources.js, character offset 836319 (first `indexOf` match of the start needle); 169 characters.
Start needle: `async TZe(t){`
End needle (included): `await e.l5e(i,s)}))`

```
async TZe(t){const s={u5e:0,c5e:0};if(await Promise.all([...this.xJt()].map(async e=>{let i=null;try{i=await $y.Ccs.HCi(t,e.xjs(),!1)}catch(t){return}await e.l5e(i,s)}))
```

`DJt` and `H_n` each start with `if("webfs-local-folder"!==this.THt())throw new Error("not a folder project")`, so they run only for a project whose storage kind is `webfs-local-folder`. `TZe` has no such test of its own. Its only call in `main.js` is the folder-project open path, which sets the kind in the statement before it calls `TZe`:

Source: r495 main.js, character offset 1343837 (first `indexOf` match of the start needle); 175 characters.
Start needle: `await h.TYe("webfs-local-folder"`
End needle (included): `"ui.errors.failed-to-open-c3-folder-project",t),t}`

```
await h.TYe("webfs-local-folder",{folderHandle:t}),await this.vZe(h),await h.TZe(t),s.HB(),h}catch(t){return s.hj(),this.SZe("ui.errors.failed-to-open-c3-folder-project",t),t}
```

The batch caller of `H_n` is `J_n`, which also starts with the `webfs-local-folder` test, and `J_n` has one call in `projectResources.js`, in the method `dPr`. The analysis that found the call described `dPr` as the path run before a preview; that description was not traced further here.

Source: r495 projectResources.js, character offset 834406 (first `indexOf` match of the start needle); 134 characters.
Start needle: `J_n(){`
End needle (included): `this.H_n(e,t));`

```
J_n(){if("webfs-local-folder"!==this.THt())return;const t={u5e:0,c5e:0},s=[];for(const e of this.xJt())e.NJt()&&s.push(this.H_n(e,t));
```

Source: r495 projectResources.js, character offset 1867882 (first `indexOf` match of the start needle); 13 characters.
Start needle: `await t.J_n()`
End needle: the start needle alone

```
await t.J_n()
```

`DJt` has one call site in `main.js`, the binding of the reload command:

Source: r495 main.js, character offset 1380959 (first `indexOf` match of the start needle); 14 characters.
Start needle: `i.DJt(i.WLt())`
End needle: the start needle alone

```
i.DJt(i.WLt())
```

**Read.** `DJt` and `H_n` wrap `l5e` in `try ... catch` and log the error with `console.error`. `TZe` has **no `try` around `l5e`**: the `try` in its body covers only the folder-handle lookup and returns on failure. **Inferred:** a rejection from `l5e` during the open-time rescan reaches the catch in the open path and shows as the "failed to open folder project" error.

### 4.3 The handle walk

`HCi` is the function the callers use to get the directory handle for a folder. **Read.** It walks `getDirectoryHandle` along the path and returns the handle. It does no filtering of entries.

Source: r495 main.js, character offset 336743 (first `indexOf` match of the start needle); 212 characters.
Start needle: `Tm.Ccs.HCi=async function`
End needle (included): `return n}`

```
Tm.Ccs.HCi=async function(t,i,e){if(Tm.Bt(t,FileSystemDirectoryHandle),Tm.bp(i),e=!!e,!(i=Tm.Ccs.jCi(i)))return t;const s=i.split("/");let n=t;for(const t of s)n=await n.getDirectoryHandle(t,{create:e});return n}
```

So the rescan iterates the raw `entries()` of the browser's directory handle. Whether the browser hides any entry is not established by the bundle (section 13).

---

## 5. The file name check and the reserved root names

### 5.1 The name check `nsi`

The rescan calls `wn.nsi(name)` first, for both directories and files. A name that fails is skipped without a message. **Read.**

Source: r495 main.js, character offset 84012 (first `indexOf` match of the start needle); 201 characters.
Start needle: `Ah.nsi=function`
End needle (included): `!Ah.hsi(t))))}`

```
Ah.nsi=function(t){if(Ah.bp(t),!t)return!1;const i=[...t.normalize()];return!(i.length>=Fh)&&(!i.some(t=>kh.has(t))&&(!Oh.has(i[0])&&!Ah.rsi(i[0])&&(!Dh.has(i.at(-1))&&!Ah.rsi(i.at(-1))&&!Ah.hsi(t))))}
```

Source: r495 main.js, character offset 83721 (first `indexOf` match of the start needle); 261 characters.
Start needle: `Rh=new Set(`
End needle (included): `Fh=200`

```
Rh=new Set(["con","prn","aux","nul","com1","com2","com3","com4","com5","com6","com7","com8","com9","lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"]),kh=new Set(["\\","/",":","*","?",'"',"<",">","|","~"]),Oh=new Set(["."]),Dh=new Set(["."]),Fh=200
```

Source: r495 main.js, character offset 84690 (first `indexOf` match of the start needle); 59 characters.
Start needle: `Ah.hsi=function`
End needle (included): `toLowerCase())}`

```
Ah.hsi=function(t){return Ah.bp(t),Rh.has(t.toLowerCase())}
```

**Read**, in order: the name is not empty; fewer than 200 code points after NFC (`>=200` fails); no code point is one of the ten forbidden characters (`kh`); the first code point is not `.` and not in the whitespace predicate; the last code point is not `.` and not in the whitespace predicate; and the whole raw name, lower-cased, is not one of the 22 device names (`hsi` lower-cases the argument with `toLowerCase()` without NFC). The function never strips or rewrites: it only returns true or false.

The whitespace predicate `rsi` and its set:

Source: r495 main.js, character offset 213465 (first `indexOf` match of the start needle); 45 characters.
Start needle: `Zu.rsi=function`
End needle (included): `Ju.has(t)}`

```
Zu.rsi=function(t){return Zu.bp(t),Ju.has(t)}
```

Source: r495 main.js, character offset 213408 (first `indexOf` match of the start needle); 57 characters; 17 invisible or whitespace-class characters are written as <U+XXXX> below.
Start needle: `const Ju=new Set(`
End needle (included): `");`

```
const Ju=new Set(" \t\n\r<U+00A0><U+0085><U+2000><U+2001><U+2002><U+2003><U+2004><U+2005><U+2006><U+2007><U+2008><U+2009><U+200A><U+200B>\u2028\u2029<U+202F><U+205F><U+3000>");
```

**Read:** the set holds 23 code points (the same 23 as the set recorded for r495-2 in `raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md`, section 1.4). The set does not hold U+000B, U+000C, U+1680 or U+FEFF.

### 5.2 The 17 reserved names

Source: r495 projectResources.js, character offset 285001 (first `indexOf` match of the start needle); 274 characters.
Start needle: `ln=new Set([`
End needle (included): `"sw.js"])`

```
ln=new Set(["appmanifest.json","c2runtime.js","c3runtime.js","c3main.js","data.json","debug.html","index.html","local.html","modernjscheck.js","offline.json","offlineclient.js","register-sw.js","javascriptinevents.js","typescriptinevents.js","start.js","style.css","sw.js"])
```

Source: r495 projectResources.js, character offset 288272 (first `indexOf` match of the start needle); 45 characters.
Start needle: `static _Lt(t){`
End needle (included): `toLowerCase())}`

```
static _Lt(t){return ln.has(t.toLowerCase())}
```

**Read:** the set holds 17 names, from `appmanifest.json` to `sw.js`, and the test lower-cases the argument. `modernjscheck.js` is one of them. The set starts at character offset 285001 of `projectResources.js`.

### 5.3 Where the reserved-name skip applies

The rescan skips a file when `""===this.ELt()&&gn._Lt(t)` holds. **Read.** `ELt()` is the folder's path prefix:

Source: r495 projectResources.js, character offset 5380 (first `indexOf` match of the start needle); 57 characters.
Start needle: `ELt(t){return(this.yUt`
End needle (included): `"/"}`

```
ELt(t){return(this.yUt?this.yUt.ELt(t):"")+this.gh()+"/"}
```

Source: r495 projectResources.js, character offset 5258 (first `indexOf` match of the start needle); 21 characters.
Start needle: `hK(){return!this.yUt}`
End needle: the start needle alone

```
hK(){return!this.yUt}
```

Source: r495 projectResources.js, character offset 299222 (first `indexOf` match of the start needle); 64 characters.
Start needle: `ELt(t){return this.hK()?`
End needle (included): `super.ELt(t)}`

```
ELt(t){return this.hK()?t?"":wn.QMi.i5e(this.DJ()):super.ELt(t)}
```

Source: r495 projectResources.js, character offset 1865139 (first `indexOf` match of the start needle); 186 characters.
Start needle: `i5e(t){switch(t){`
End needle (included): `default:return""}}`

```
i5e(t){switch(t){case"sound":case"music":case"video":return dq.QMi.jxn();case"font":return dq.QMi.Nxn();case"icon":return dq.QMi.Dxn();case"script":return dq.QMi.tPr();default:return""}}
```

Source: r495 projectResources.js, character offset 1864817 (first `indexOf` match of the start needle); 58 characters.
Start needle: `kCi(){return"scripts/"}`
End needle (included): `tPr(){return this.kCi()+"project/"}`

```
kCi(){return"scripts/"}tPr(){return this.kCi()+"project/"}
```

Source: r495 projectResources.js, character offset 1864921 (first `indexOf` match of the start needle); 21 characters.
Start needle: `jxn(){return"media/"}`
End needle: the start needle alone

```
jxn(){return"media/"}
```

Source: r495 projectResources.js, character offset 1864942 (first `indexOf` match of the start needle); 21 characters.
Start needle: `Dxn(){return"icons/"}`
End needle: the start needle alone

```
Dxn(){return"icons/"}
```

**Read:** on a subfolder, `ELt()` is the parent prefix plus the folder name plus `/`, so it is never empty. On a root folder (`hK()` is true because there is no parent), `ELt()` with no argument returns `i5e(section)`. That is `media/` for `sound`, `music` and `video`, `fonts/` for `font`, `icons/` for `icon`, `scripts/project/` for `script`, and `""` for every other section name, which for the file sections is `general` only. So `""===this.ELt()` holds **only at the root of the `general` section**, and the 17-name skip applies only to files directly in the Files root. It does not apply to subfolders of Files, to the roots of the other sections, or to directories. The `general` section is the disk folder `files`:

Source: r495 projectResources.js, character offset 298153 (first `indexOf` match of the start needle); 144 characters.
Start needle: `bn=new Map([["script"`
End needle (included): `["general","files"]])`

```
bn=new Map([["script","scripts"],["sound","sounds"],["music","music"],["video","videos"],["font","fonts"],["icon","icons"],["general","files"]])
```

### 5.4 The same list is also a general rule for the Files root

The reserved test `_Lt` has more call sites than the rescan. **Read**, with the character offset of each call in `projectResources.js`:

- offset 299486: the add-file method `ZD`, which throws `file name '…' is reserved` for a file added to the Files root;
- offset 302643: the rescan (section 4.1);
- offsets 1724124 and 1727003: two import paths.

(The offsets are those of the match `._Lt(`; the call is one character after the dot.)

Source: r495 projectResources.js, character offset 299286 (first `indexOf` match of the start needle); 255 characters.
Start needle: `ZD(t,s){if(wn.Bt(t,gn)`
End needle (included): `` is reserved`) ``

```
ZD(t,s){if(wn.Bt(t,gn),wn.nW(s),t.tfs)throw new Error("file already belongs to folder");const e=t.G6(),i=this.ELt();if(this.ej.TLt(i+e))throw new Error(`file name '${i+e}' already used`);if(""===i&&gn._Lt(e))throw new Error(`file name '${e}' is reserved`)
```

Source: r495 projectResources.js, character offset 1724083 (first `indexOf` match of the start needle); 62 characters.
Start needle: `default:if(s?.name&&""===t.ELt()&&self.WJ._Lt(s.name))return!1`
End needle: the start needle alone

```
default:if(s?.name&&""===t.ELt()&&self.WJ._Lt(s.name))return!1
```

Source: r495 projectResources.js, character offset 1726946 (first `indexOf` match of the start needle); 148 characters.
Start needle: `if(""===this.cSr.ELt())for(const t of this.Nus)if(self.WJ._Lt(t.name)){`
End needle (included): `"reserved-filename.message",t.name))}`

```
if(""===this.cSr.ELt())for(const t of this.Nus)if(self.WJ._Lt(t.name)){return void qz.ee.ie.te("OK").Gh(nW.A8t("reserved-filename.message",t.name))}
```

So the list is a Files-root file-name fact. The rescan applies it by skipping; the add and import paths apply it by refusing.

---

## 6. Folder admission and the `ts-defs` skip

The loop over unlisted directories **(read)**:

Source: r495 projectResources.js, character offset 302424 (first `indexOf` match of the start needle); 154 characters.
Start needle: `for(const[t,i]of o){`
End needle (included): `s.u5e++}`

```
for(const[t,i]of o){if("script"===e&&this.hK()&&"ts-defs"===t)continue;if(!wn.nsi(t))continue;const n=this.Hj();n.k(t),n.Pjs(),h.push(n.l5e(i,s)),s.u5e++}
```

**Read:** a directory is skipped when the section is `script`, the folder is a root (`hK()`), and the directory name is `ts-defs`. A `ts-defs` directory in a subfolder of `scripts` is not skipped by this test. Then the name check `nsi` runs. The reserved-name list does not apply to directories. An admitted directory becomes a subfolder (`Hj()`), is named with `n.k(t)`, and is rescanned with `l5e`.

The subfolder name setter `k` **(read)** checks the name again:

Source: r495 projectResources.js, character offset 3827 (first `indexOf` match of the start needle); 282 characters.
Start needle: `k(t){if(h.bp(t),this.hK())throw new Error("cannot rename root folder")`
End needle (included): `` already used`) ``

```
k(t){if(h.bp(t),this.hK())throw new Error("cannot rename root folder");if(!h.nsi(t)||this.Ijs().includes(t.toLowerCase()))throw new Error(`invalid folder name '${t}'`);if(this.vUt!==t){if(this.yUt&&!h.hM(this.vUt,t)&&this.yUt.nK(t))throw new Error(`folder name '${t}' already used`)
```

Source: r495 projectResources.js, character offset 5230 (first `indexOf` match of the start needle); 15 characters.
Start needle: `Ijs(){return[]}`
End needle: the start needle alone

```
Ijs(){return[]}
```

**Read:** `k` throws `invalid folder name` when `nsi` fails or the name is in the folder's `Ijs()` list, and throws `folder name '…' already used` when a sibling that is not deleted has the same name under `hM` (case-insensitive after NFC). `Ijs()` returns the empty array in the base folder class. The only other definition found in `projectResources.js` is in the timeline folder class (`["transitions"]`); the search for `Ijs(){` has two hits in all, so no file-section folder class overrides it. **Inferred:** for a file-section folder, the second check in `k` adds no name refusal beyond `nsi`.

---

## 7. The per-section switch, the section hint, the extension and the twin name

### 7.1 The section hint `s5e`

Source: r495 projectResources.js, character offset 298737 (first `indexOf` match of the start needle); 158 characters.
Start needle: `s5e(){switch`
End needle (included): `default:return""}}`

```
s5e(){switch(this.DJ()){case"sound":case"music":return"audio/";case"video":return"video/";case"font":return"font";case"icon":return"image/";default:return""}}
```

**Read:** `"audio/"` for `sound` and `music`, `"video/"` for `video`, `"font"` for `font`, `"image/"` for `icon`, and `""` otherwise. The hint is the second argument of the type lookup `MimeType.zfs(extension, hint)` (the lookup is described in `raw/issue-115-mime-registry-r506-3-and-type-paths-2026-11-04.md`).

### 7.2 The extension `VHt`

Source: r495 main.js, character offset 85491 (first `indexOf` match of the start needle); 77 characters.
Start needle: `.VHt=function`
End needle (included): `t.substr(i)}`

```
.VHt=function(t){Lh.bp(t);let i=t.lastIndexOf(".");return i<1?"":t.substr(i)}
```

**Read:** the extension is the text from the last dot, including the dot. A name whose only dot is at index 0 has no extension (`i<1` gives `""`). The rescan lower-cases it with `toLowerCase()`.

### 7.3 The twin name `fsi`

Source: r495 main.js, character offset 85569 (first `indexOf` match of the start needle); 105 characters.
Start needle: `Lh.fsi=function`
End needle (included): `t.substr(0,e+1)+i}`

```
Lh.fsi=function(t,i){Lh.bp(t),Lh.bp(i);const e=t.lastIndexOf(".");return-1===e?t+"."+i:t.substr(0,e+1)+i}
```

**Read:** `fsi(name, "ts")` keeps the stem and the dot of the name and replaces the text after the last dot, so `A.JS` becomes `A.ts`. The stem keeps its letter case. A name with no dot gets `.ts` appended.

### 7.4 The switch

The switch is in the part of the method quoted in section 4.1. **Read**, by section `e`:

- `script`: skip unless the extension is `.js`; also skip when the twin `fsi(name, "ts")` already exists as a file at this folder prefix (the twin check is section 9).
- `general`: skip a `.js` file when its `.ts` twin exists; admit every other extension.
- `sound` and `music`: skip unless the category of the looked-up type is `audio`.
- `video`: skip unless the category is `video`.
- `font`: skip unless the looked-up type has the font flag (`ILt()`).
- `icon`: skip unless the category is `image`.

The category `j$t()` is the first segment of the type name:

Source: r495 main.js, character offset 262303 (first `indexOf` match of the start needle); 24 characters.
Start needle: `this.Jwi=t.split("/")[0]`
End needle: the start needle alone

```
this.Jwi=t.split("/")[0]
```

Source: r495 main.js, character offset 262729 (first `indexOf` match of the start needle); 22 characters.
Start needle: `j$t(){return this.Jwi}`
End needle: the start needle alone

```
j$t(){return this.Jwi}
```

---

## 8. The font flag and the category lists at r495

### 8.1 The font flag

Source: r495 main.js, character offset 262014 (first `indexOf` match of the start needle); 53 characters.
Start needle: `const Of=self.t,Df=1`
End needle (included): `$f=64`

```
const Of=self.t,Df=1,Ff=2,Lf=4,Bf=8,Uf=16,Nf=32,$f=64
```

Source: r495 main.js, character offset 262580 (first `indexOf` match of the start needle); 53 characters.
Start needle: `this.egi=!!(s&Df)`
End needle (included): `this.ngi=!!(s&Lf)`

```
this.egi=!!(s&Df),this.sgi=!!(s&Ff),this.ngi=!!(s&Lf)
```

Source: r495 main.js, character offset 262882 (first `indexOf` match of the start needle); 22 characters.
Start needle: `ILt(){return this.ngi}`
End needle: the start needle alone

```
ILt(){return this.ngi}
```

**Read:** `ILt()` returns the field set from bit 4 (`Lf=4`) of the flags argument of the `MimeType` constructor. The registrations that carry `Lf` in their flags:

Source: r495 main.js, character offset 265815 (first `indexOf` match of the start needle); 228 characters.
Start needle: `Vf("application/font-woff"`
End needle (included): `Vf("application/vnd.ms-fontobject","eot","Embedded OpenType",Lf)`

```
Vf("application/font-woff","woff","Web font",Lf|Df),Vf("font/woff2","woff2","Web font",Lf|Df),Vf("application/font-sfnt",["ttf","otf"],"TrueType/OpenType font",Lf),Vf("application/vnd.ms-fontobject","eot","Embedded OpenType",Lf)
```

**Read:** four type names carry the font flag: `application/font-woff` (extension `woff`), `font/woff2` (`woff2`), `application/font-sfnt` (`ttf`, `otf`) and `application/vnd.ms-fontobject` (`eot`). The registration text was parsed with a script and not evaluated; the parse found 51 registrations in all.

### 8.2 The category lists

The same parse grouped the extensions of the 51 registrations by the first segment of the type name. **Read** (parsed, not evaluated). The lists are the extensions as registered, without the dot:

- audio: `opus ogg webm m4a wav flac mp3 mid midi kar`
- video: `webm ogv mp4 mpg mpeg mov qt avi`
- image: `png apng jpg jpeg jxl svg webp gif tif tiff bmp ico avif avifs`

`webm` is in both the audio and the video list. The lookup `zfs` takes the section hint as its second argument; how it chooses between two types that share an extension was not re-read for this capture. The extensions of the other categories (`text`, `application`, `font`, `model`) were also parsed and are not needed for the rescan switch.

---

## 9. The `.ts` twin check and what `P6()` returns

The twin check in the switch is `i.TLt(this.ELt()+fsi(name,"ts"))`. **Read.**

Source: r495 projectResources.js, character offset 834098 (first `indexOf` match of the start needle); 37 characters.
Start needle: `TLt(t){return $y.bp(t)`
End needle (included): `!!this.ttt(t)}`

```
TLt(t){return $y.bp(t),!!this.ttt(t)}
```

Source: r495 projectResources.js, character offset 834017 (first `indexOf` match of the start needle); 81 characters.
Start needle: `ttt(t){`
End needle (included): `return null}`

```
ttt(t){$y.bp(t);for(const s of this.S6())if($y.hM(t,s.P6()))return s;return null}
```

Source: r495 projectResources.js, character offset 833413 (first `indexOf` match of the start needle); 51 characters.
Start needle: `*S6(t=!0){`
End needle (included): `yield*s.ZHt()}`

```
*S6(t=!0){for(const s of this.xJt(t))yield*s.ZHt()}
```

Source: r495 projectResources.js, character offset 833018 (first `indexOf` match of the start needle); 121 characters.
Start needle: `*xJt(t=!0){`
End needle (included): `yield this.DCn}`

```
*xJt(t=!0){t&&(yield this.FCn),yield this.OCn,yield this.kCn,yield this.MCn,yield this.jCn,yield this.RCn,yield this.DCn}
```

Source: r495 projectResources.js, character offset 7940 (first `indexOf` match of the start needle); 168 characters.
Start needle: `*ZHt(){const t=this.wjs`
End needle (included): `(yield e)}}`

```
*ZHt(){const t=this.wjs,s=this.Jhi;for(let s=0,e=t.length;s<e;++s){const e=t[s];e.up()&&(yield*e.ZHt())}for(let t=0,e=s.length;t<e;++t){const e=s[t];e.up()&&(yield e)}}
```

Source: r495 projectResources.js, character offset 1850 (first `indexOf` match of the start needle); 25 characters.
Start needle: `up(){return 0===this.ajs}`
End needle: the start needle alone

```
up(){return 0===this.ajs}
```

`S6()` yields every file item of every root file folder of the project, through the seven root folders (`xJt()`) and the recursive walk `ZHt()`. The walk yields only items for which `up()` is true, and `up()` is `0===this.ajs`, the "not deleted" test. So the search is **project-wide, across all file sections**.

### 9.1 What `P6()` returns

There is one definition of `P6` in `projectResources.js`. **Read.** It belongs to the project-file class `window.WJ`.

Source: r495 projectResources.js, character offset 291050 (first `indexOf` match of the start needle); 40 characters.
Start needle: `P6(t){`
End needle (included): `this.G6()}`

```
P6(t){return this.cK().ELt(t)+this.G6()}
```

Source: r495 projectResources.js, character offset 287119 (first `indexOf` match of the start needle); 21 characters.
Start needle: `G6(){return this.oAi}`
End needle: the start needle alone

```
G6(){return this.oAi}
```

Source: r495 projectResources.js, character offset 288693 (first `indexOf` match of the start needle); 82 characters.
Start needle: `cK(){if(!this.tfs)throw`
End needle (included): `return this.tfs}`

```
cK(){if(!this.tfs)throw new Error("file not yet added to folder");return this.tfs}
```

**Read:** `P6()` returns the folder prefix `ELt()` of the file's parent folder (`cK()`) plus the file name (`G6()`). With the prefixes of section 5.3 this is the **full prefixed path**: for a script file `a.ts` in the subfolder `sub` of the script root it is `scripts/project/sub/a.ts`, and for a file `a.ts` at the Files root it is `a.ts`. `P6(true)` drops the section prefix at 13 call sites; `TLt` calls `P6()` with no argument.

The comparison is `hM`:

Source: r495 main.js, character offset 86595 (first `indexOf` match of the start needle); 152 characters.
Start needle: `.hM=function`
End needle (included): `toLowerCase())}`

```
.hM=function(t,i){return Lh.Aut(t),Lh.Aut(i),"string"==typeof t&&"string"==typeof i&&(t===i||t.normalize().toLowerCase()===i.normalize().toLowerCase())}
```

**Read:** two strings are equal when they are identical, or when their NFC forms are equal after `toLowerCase()`.

### 9.2 The twin check, stated exactly

**Read:** `TLt(path)` is true when **any non-deleted project file** has a full prefixed path equal to `path`, where `path` is the entry's folder prefix plus the twin name, and the equality is `hM` (ignoring letter case, after NFC). Every path segment is compared the same way, folder names included. In practice it means the same folder, compared case-insensitively, by full path. It is not a search by file name alone.

**Inferred:** because the search is by path string over the whole project, files in different sections that share a prefix can match each other. `sound`, `music` and `video` all have the prefix `media/`. A Files-section folder chain named like a prefix of another section (for example `scripts/project/…` under the Files root, whose own prefix is `""`) would match as well.

---

## 10. Does the r506-3 rescan equal the r495 rescan? Yes, after renaming

**Read.** At r506-3 the rescan method is `KNs`, and the folder class is `window.ytt=class`.

Source: r506-3 projectResources.js, character offset 321172 (first `indexOf` match of the start needle); 1350 characters.
Start needle: `async KNs(t,s){`
End needle (included): `await Promise.all(h)}`

```
async KNs(t,s){const e=this.Utt(),i=this.ks(),n=new Map([...this.mit()].map(t=>[t.wh(),t])),r=new Map([...this.items()].map(t=>[t.knt(),t])),h=[],o=new Map,a=new Map;for await(const[e,i]of t.entries()){const t=i.kind;if("directory"===t){const t=n.get(e);t?(n.delete(e),s.XNs++,h.push(t.KNs(i,s))):o.set(e,i)}else if("file"===t){const t=r.get(e);t?(r.delete(e),h.push((async()=>{await t.yNs(i)?s.YNs++:s.XNs++})())):a.set(e,i)}}for(const t of n.values())t.mas(),t.sW(),s.YNs++;for(const t of r.values())t.pas(),t.sW(),s.YNs++;for(const[t,i]of o){if("script"===e&&this.fY()&&"ts-defs"===t)continue;if(!On.Jrs(t))continue;const n=this.yit();n.k(t),n.Qrs(),h.push(n.KNs(i,s)),s.YNs++}for(const[t,n]of a){if(!On.Jrs(t))continue;if(""===this.Cnt()&&Fn.Int(t))continue;const r=On.Get(t).toLowerCase(),o=On.MimeType.mYt(r,this.NNs());switch(e){case"script":if(".js"!==r)continue;const s=On.rbs(t,"ts");if(i.Ont(this.Cnt()+s))continue;break;case"general":if(".js"===r){const s=On.rbs(t,"ts");if(i.Ont(this.Cnt()+s))continue}break;case"sound":case"music":if("audio"!==o.Tlt())continue;break;case"video":if("video"!==o.Tlt())continue;break;case"font":if(!o.Snt())continue;break;case"icon":if("image"!==o.Tlt())continue}h.push((async()=>{const s=await n.getFile(),e=await On.Ers(s),i=On.m(Fn,this.ks(),o,t,e);this._Z(i),i.Qrs()})()),s.YNs++}await Promise.all(h)}
```

Position and size: the r495 method `async l5e(t,s){` has one `indexOf` hit, at offset 301902, and the r506-3 method `async KNs(t,s){` has one hit, at offset 321172. The two methods have 1346 and 1350 characters. The first compare (section 2) gave 710 tokens each and STRUCTURE-EQUAL: every keyword, punctuation mark and string literal is identical, and the identifier pairing is a consistent map (no name of three or more characters maps to two names). The second compare, with a different tokenizer, gave 737 tokens each and no difference. The unminified names are the same in both: `Map`, `map`, `items`, `entries`, `kind`, `push`, `values`, `toLowerCase`, `MimeType`, `getFile`, `Promise`, `all`.

**The rename map** (r495 name, then r506-3 name), as found by the two token compares of the rescan method and of the methods it calls:

| r495 | r506-3 | role |
|---|---|---|
| `l5e` | `KNs` | the rescan method |
| `wn` | `On` | the global helper namespace |
| `nsi` | `Jrs` | the name check |
| `ELt` | `Cnt` | the folder prefix |
| `gn._Lt` | `Fn.Int` | the reserved-name test |
| `VHt` | `Get` | the extension |
| `MimeType.zfs` | `MimeType.mYt` | the type lookup |
| `s5e` | `NNs` | the section hint |
| `fsi` | `rbs` | the twin name |
| `TLt` | `Ont` | the twin check |
| `hK` | `fY` | the root test |
| `Hj` | `yit` | the subfolder constructor method |
| `ZD` | `_Z` | the add-file method |
| `u5e`, `c5e` | `YNs`, `XNs` | the counters |
| `P6` | `rlt` | the prefixed path |
| `ttt` | `tjt` | the project-wide lookup |
| `S6` | `yle` | the file-item walk |
| `xJt` | `Vot` | the root-folder walk |
| `i5e` | `VNs` | the root prefix |
| `hM` | `II` (main.js) | the case-insensitive compare |

The pieces that the rescan depends on are equal too. **Read**:

- The reserved-name set at r506-3 (`In`) is equal to `ln` at r495: the same 17 names in the same order, from `appmanifest.json` to `sw.js`. The checker is `static Int(t){return In.has(t.toLowerCase())}`.

Source: r506-3 projectResources.js, character offset 304190 (first `indexOf` match of the start needle); 274 characters.
Start needle: `In=new Set([`
End needle (included): `"sw.js"])`

```
In=new Set(["appmanifest.json","c2runtime.js","c3runtime.js","c3main.js","data.json","debug.html","index.html","local.html","modernjscheck.js","offline.json","offlineclient.js","register-sw.js","javascriptinevents.js","typescriptinevents.js","start.js","style.css","sw.js"])
```

Source: r506-3 projectResources.js, character offset 307466 (first `indexOf` match of the start needle); 45 characters.
Start needle: `static Int(t){`
End needle (included): `toLowerCase())}`

```
static Int(t){return In.has(t.toLowerCase())}
```

- The `ts-defs` skip is equal; only the root test is renamed: r495 `if("script"===e&&this.hK()&&"ts-defs"===t)continue;` against r506-3 `if("script"===e&&this.fY()&&"ts-defs"===t)continue;`. The root test is `hK(){return!this.yUt}` at r495 and `fY(){return!this.VLt}` at r506-3.
- The name check closure in `main.js` is equal. The closure that starts at `{const Ah=self.t,Rh=new Set` has one hit in each file, at offsets 83704 (r495) and 83731 (r506-3), with 567 tokens each and NORMALIZED-EQUAL. It holds the device names, the forbidden characters, the edge-dot sets, the limit 200, `nsi` (`Jrs` at r506-3), the strip function and the device test.

Source: r506-3 main.js, character offset 84039 (first `indexOf` match of the start needle); 201 characters.
Start needle: `Ah.Jrs=function`
End needle (included): `!Ah.Cds(t))))}`

```
Ah.Jrs=function(t){if(Ah.ib(t),!t)return!1;const i=[...t.normalize()];return!(i.length>=Fh)&&(!i.some(t=>Oh.has(t))&&(!kh.has(i[0])&&!Ah.Xrs(i[0])&&(!Dh.has(i.at(-1))&&!Ah.Xrs(i.at(-1))&&!Ah.Cds(t))))}
```

- The whitespace predicate is byte-equal: the 40 characters before each anchor compare equal, and the predicate is `rsi` at r495 and `Xrs` at r506-3.
- The section hint is equal: `NNs(){switch(this.Utt()){...` is the text of `s5e` with renamed identifiers.
- The prefix functions are equal: the root override is `Cnt(t){return this.fY()?t?"":On.Qcs.VNs(this.Utt()):super.Cnt(t)}` at r506-3.

Source: r506-3 projectResources.js, character offset 318477 (first `indexOf` match of the start needle); 65 characters.
Start needle: `Cnt(t){return this.fY()`
End needle (included): `super.Cnt(t)}`

```
Cnt(t){return this.fY()?t?"":On.Qcs.VNs(this.Utt()):super.Cnt(t)}
```

- The prefixed path is `rlt(t){return this.qK().Cnt(t)+this.knt()}` at r506-3 (offset 310267).

Source: r506-3 projectResources.js, character offset 310267 (first `indexOf` match of the start needle); 42 characters.
Start needle: `rlt(t){`
End needle (included): `this.knt()}`

```
rlt(t){return this.qK().Cnt(t)+this.knt()}
```

- The twin lookup and its walks are token-equal: `tjt` (offset 855779) equals `ttt`, `Ont` equals `TLt`, `*yle` (855172) equals `S6`, `*Vot` (854776) equals `xJt`. In `main.js`, `Lh.II` equals `hM`.
- The project-file class (r495 `WJ`, offsets 285727 to 298094; r506-3 offsets 304917 to 317340, 5635 tokens), the base folder class (`window.Jee=class` against `window.ktt=class`) and the base project-object class (`window.JX=class` against `window.xtt=class`) are token-equal.
- The three callers are token-equal (`async Wot`, `async TFe`, `async FFe`).

**The folder class has two real differences from r495, and neither is on the rescan path.** The class is `window.UNt=class` at offset 298298 (r495) and `window.ytt=class` at offset 317545 (r506-3); the token counts of the two classes are 3143 and 3152.

1. The multi-file async add loop. The r495 text has `async a5e(t,s){...const i=await this.h5e(i,s,{IJt:t.length>1});i&&e.push(i)}`, where an inner `i` shadows the loop index. The r506-3 text has `const n=await this.JNs(t[i],s,{Lot:t.length>1});n&&e.push(n)}`. The contexts are at offset 301237 (r495) and 320493 (r506-3).
2. The file-move hook. The r495 hook is `Yjs(t,s){...yn.ZQe(t,"projectfilemove")}`. At r506-3 it is `Vas(t,s){...Mn.nNs(t,"projectfilemove"),e.Zzt()}`, which adds one more call on the project. The needle `"projectfilemove"` has one hit in each file, at offsets 301563 and 320825.

**Conclusion, read:** the rescan loop at r506-3 equals the loop at r495 after renaming. So does every rule it depends on that was compared: the name check, the 17 reserved names, the root-only `ts-defs` skip, the section hint, the prefix, the twin check and the per-section switch. What was **not** compared at r506-3: the `MimeType` registry categories and the font flag (the `raw/issue-115` capture records the r506-3 registry; it was not re-read against this switch), and the `Ijs()` search of section 6 (r495 only).

---

## 11. A case-only name collision: `A.js` on disk, `a.js` listed, same folder

**The question.** The disk holds `A.js` and the project lists `a.js` in the same folder. Does the add throw?

### 11.1 The add path

**Read.** For each unlisted file the loop over `a` pushes this task:

Source: r495 projectResources.js, character offset 303106 (first `indexOf` match of the start needle); 120 characters.
Start needle: `h.push((async()=>{const s=await n.getFile()`
End needle (included): `)()),s.u5e++`

```
h.push((async()=>{const s=await n.getFile(),e=await wn.vni(s),i=wn.m(gn,this.Ie(),o,t,e);this.ZD(i),i.Pjs()})()),s.u5e++
```

The `WJ` constructor throws only when the name check `nsi` fails, and the loop has already filtered those names. The duplicate check is in the folder's add method `ZD` (the excerpt in section 5.4). **Read:** `ZD` throws ``file name '<prefix><name>' already used`` when `TLt(prefix + name)` is true, so when any non-deleted file has the same full path ignoring case. It also throws `file name '…' is reserved` for the Files root (section 5.4).

### 11.2 The ordering in the exact scenario

**Read.** The listed `a.js` is keyed `"a.js"` in the file Map, so `r.get("A.js")` misses. `a.js` stays in the Map and `A.js` goes into `a`. The leftover loop then runs, and it runs synchronously, before the loop over `a`:

Source: r495 projectResources.js, character offset 302375 (first `indexOf` match of the start needle); 48 characters.
Start needle: `for(const t of r.values())t.Tjs(),t.qR(),s.u5e++`
End needle: the start needle alone

```
for(const t of r.values())t.Tjs(),t.qR(),s.u5e++
```

Source: r495 projectResources.js, character offset 2065 (first `indexOf` match of the start needle); 24 characters.
Start needle: `qR(...t){this.fjs(...t)}`
End needle: the start needle alone

```
qR(...t){this.fjs(...t)}
```

Source: r495 projectResources.js, character offset 2114 (first `indexOf` match of the start needle); 103 characters.
Start needle: `fjs(...t){let s=this.up()`
End needle (included): `this.pjs(...t))}`

```
fjs(...t){let s=this.up();++this.ajs,s&&!this.up()&&(r.FYt(this,"projectobjectdelete"),this.pjs(...t))}
```

Source: r495 projectResources.js, character offset 286823 (first `indexOf` match of the start needle); 40 characters.
Start needle: `fjs(){this.xLt()&&this.oM(),super.fjs()}`
End needle: the start needle alone

```
fjs(){this.xLt()&&this.oM(),super.fjs()}
```

**Read:** `qR` calls `fjs`. The base `fjs` increments the deletion counter (`++this.ajs`), after which `up()` is false (`up()` is `0===this.ajs`). The `WJ` override runs its own step first and then calls the base. `ZHt` yields only items for which `up()` is true. The task for `A.js` reaches `ZD` only after `await n.getFile()`, which is after the synchronous leftover loop has finished. So by then `TLt` no longer sees `a.js`.

**Inferred, from the read code: no throw in this scenario.** The rescan removes `a.js` (soft delete) and adds a new item `A.js`. It counts two in `u5e`, one for the removal and one for the add. The twin check for a `.js` file in a script folder looks up `A.ts`, which does not fire unless a `.ts` sibling exists.

### 11.3 When it does throw

**Inferred.** The add throws when a case-twin is still `up()` at the time `ZD` runs. Examples: both `a.js` and `A.js` are on disk and `a.js` is listed (possible only on a case-sensitive file system); two unlisted case-twins are added in the same batch, and whichever finishes `getFile` second throws; a same-path file in another section (section 9.2).

### 11.4 What the throw affects

- **Read:** every loop in `l5e` after the `for await` over the entries is synchronous, so all the tasks of the batch and all subfolder `l5e` calls have already been started when a task throws. The counter `u5e` is incremented outside the task, so the entry was already counted.
- **Inferred (from JavaScript semantics):** `await Promise.all(h)` rejects on the first rejection, so `l5e` rejects, and the rejection reaches the top-level call through the parent's task list. The other tasks are not cancelled and keep adding their entries. So the throw drops only that entry. It does not abort the rest of the batch.
- **Inferred, in contrast:** a new subfolder is named synchronously in the loop over `o`, with `n.k(t)`. The subfolder name setter `k` (section 6) throws ``folder name '…' already used`` when a sibling that is not deleted has the same name under `hM`. That throw would land synchronously and would skip the rest of that folder's loop over `o` and its whole loop over `a`. The folder case was not traced further than this.

### 11.5 Which caller meets the throw

**Read:** `DJt` and `H_n` catch it and log it (section 4.2); `DJt` then still shows the reload notification with the counts. `TZe` has no `try` around `l5e`. **Inferred:** a `ZD` throw during the open-time rescan reaches the folder-project open path (section 4.2) after the folder-project setup step has already run, and shows as the "failed to open folder project" error.

---

## 12. The one editor observation

`raw/issue-113-video-section-editor-save-2026-11-02.md` records an editor run in which a disk scan on project open admitted `clip_disk.webm` and `clip.mov` into the `video` section, as `video/webm` and `video/quicktime`. That capture is the only editor observation of rescan admission in the repository. It agrees with the `video` branch of the switch (section 7.4), because both extensions are in the video category list (section 8.2). This capture adds no editor observation.

## 13. Not confirmed

- **Whether the browser hides an entry.** The rescan iterates `FileSystemDirectoryHandle.entries()`, and `HCi` does no filtering (section 4.3). No source read here says whether the browser's directory iteration hides any entry (for example a dot-file or a system file). The bundle holds no authoritative statement. This stays open.
- **Any editor run of the rescan** other than the video observation of section 12. Nothing here shows what the editor does for a name that the name check refuses, for a reserved root name, or for a case-twin.
- **The r506-3 type registry against the switch.** The category lists and the font flag are read at r495 only (section 8). The rescan code is equal at r506-3, and the r506-3 registry is recorded in the `raw/issue-115` capture, but the lists above were not re-derived at r506-3.
- **The first compare's token count.** The first compare reported 710 tokens per method and the repeat with another tokenizer reported 737. The two tokenizers differ, and the difference was not traced. Both found no difference between the two methods.
- **Case-only collisions between folders**, and the `Ijs()` search at r506-3 (sections 6 and 11.4).
- **The interaction of the batch throw with the progress dialog** of `DJt` (it is closed in `finally`; nothing else was traced).
- **A case-sensitive file system.** Whether the browser and the host file system ever list two names that differ only in case was not examined.
