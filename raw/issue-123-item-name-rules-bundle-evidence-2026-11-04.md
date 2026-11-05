# Issue #123 — C3 item-name rules: editor bundle evidence at r495-2 (capture)

**Captured:** 2026-11-04
**For:** GenvidTechnologies/c3source#123 (export the C3 item-name validators: the layout-name rule and the object-class name rules)
**Source:** the Construct 3 editor bundle for release r495-2, fetched from `https://editor.construct.net/r495-2/` (the permanently hosted per-release root; see `wiki/c3-domain-facts.md`, "Two evidence channels"). The question: what exactly do the editor's name rules accept, strip, rewrite and refuse, for layouts (and the other sections that share the layout rule) and for object classes (object types and families)?
**Nature:** the verbatim minified source around each needle, the commands and method that found it, two execution checks that were traced in the bundle text, and the table of System expression names that the object-class "reserved" test matches. Nothing here is a corpus scan, and no bundle code was run.

Labels used below:

- **Observed:** read in the bundle text. The code was not executed, so "observed" means "the code says so", not "an editor run showed so".
- **Inferred:** drawn from observed text by reasoning, not confirmed by an editor run.
- **Not traced:** not read, or read only in part. The "Not traced" section lists them.

---

## Files fetched

| Release | URL | Local name | Bytes | sha256 |
|---|---|---|---|---|
| r495-2 | `https://editor.construct.net/r495-2/projectResources.js` | `projectResources.js` | 1884276 | `e0180c2a41e4f8103e2a6b5a5ab6e8be7eb3d1e97e331b2b18de2969d60b7b43` |
| r495-2 | `https://editor.construct.net/r495-2/main.js` | `main.js` | 1405310 | `18c7a7cee194779da60deba01052a74ae57b8c038eadd0041932ced68794d10c` |
| r495-2 | `https://editor.construct.net/r495-2/plugins/allAces.json` | `allAces.json` | 373639 | `5ad106361687501e583cb2825ac09aef707b306087b92862c1688937ce69ae7b` |
| r495-2 | `https://editor.construct.net/r495-2/plugins/allEditorPlugins.js` | `allEditorPlugins.js` | 225092 | `9644e45e5bfe39d9c72ed4d8acb1dd9368edf5324f30ffe3b6797d9da56c45d7` |

The hashes of `projectResources.js` and `main.js` equal the ones in `raw/issue-95-empty-stem-evidence-2026-10-27.md`. The hashes of `allAces.json` and `allEditorPlugins.js` are new here.

**The r495 and r495-2 bundles are different files.** `raw/issue-115-mime-registry-r506-3-and-type-paths-2026-11-04.md` records the r495 `main.js` with a sha256 that begins `17cb8bb0`. The r495-2 `main.js` above begins `18c7a7ce`. A label that says "r495" does not name the bundle read here. Every statement below is about r495-2.

Each file was fetched with `curl -sS -f -o <local name> <URL>` into its own directory, and the sha256 was measured with `sha256sum` on the saved copy.

## How the excerpts were extracted

The bundles are one or two very long lines, so a plain `grep -o` with a leading `.{0,N}` context is pathologically slow. The files were read as text only, never run, imported or loaded as modules:

- A Node script, kept in a different directory from the downloaded files, reads each file with `fs.readFileSync(path, "utf8")`.
- It finds a start needle with `String.prototype.indexOf`, finds the end needle after it, and slices the text between them. The "character offset" given with each excerpt is that `indexOf` result: a JavaScript string index, counted in UTF-16 code units from the start of the file.
- The script writes the slice into this file without retyping it. The needle is given with each excerpt, so a reader can repeat the search with `indexOf` or `grep -F`.
- Characters that are invisible or are whitespace-class (for example U+00A0, U+00AD, U+200B, U+3000) are written as `<U+XXXX>`, because the raw characters cannot be seen in a review. This is the only change made to an excerpt. Visible non-ASCII characters are kept.
- A backslash-u Unicode escape in the bundle's source text is kept as the six characters of the escape. It is not decoded.
- The guard table and the call census in the Xcs section are computed by a script from the same text. Its parenthesis matcher skips quoted strings.

---

## 1. The layout-name rule (`rRi`, `aRi`, `oRi`, `hRi`)

These are static helpers of one global class in `main.js`, bound as `Ah` (`const Ah=self.t`) in the block below. The section name setters in `projectResources.js` call them through an alias of the same class (`pc`, `zn`, `vi` in the setters below).

### 1.1 The constants

Needle `Rh=new Set(` to `Fh=200`: the device-name set `Rh` (22 members: `con`, `prn`, `aux`, `nul`, `com1` to `com9`, `lpt1` to `lpt9`), the forbidden-character set `kh` (10 characters: `\ / : * ? " < > | ~`; the source writes the backslash as `"\\"`), the two edge-dot sets `Oh` and `Dh` (each holds only `.`), and the length limit `Fh` (200).

Source: main.js, character offset 83721 (first `indexOf` match of the start needle); 261 characters.
Start needle: `Rh=new Set(`
End needle (included): `Fh=200`

```
Rh=new Set(["con","prn","aux","nul","com1","com2","com3","com4","com5","com6","com7","com8","com9","lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"]),kh=new Set(["\\","/",":","*","?",'"',"<",">","|","~"]),Oh=new Set(["."]),Dh=new Set(["."]),Fh=200
```

### 1.2 The validator `rRi`

Source: main.js, character offset 84012 (first `indexOf` match of the start needle); 201 characters.
Start needle: `Ah.rRi=function`
End needle (included): `!Ah.oRi(t))))}`

```
Ah.rRi=function(t){if(Ah.bp(t),!t)return!1;const i=[...t.normalize()];return!(i.length>=Fh)&&(!i.some(t=>kh.has(t))&&(!Oh.has(i[0])&&!Ah.hRi(i[0])&&(!Dh.has(i.at(-1))&&!Ah.hRi(i.at(-1))&&!Ah.oRi(t))))}
```

Observed order of the checks: not empty; fewer than `Fh` (200) code points after NFC (`>=200` fails); none of the `kh` characters; first character is not in `Oh` and not an `hRi` character; last character is not in `Dh` and not an `hRi` character; the name is not a device name.

### 1.3 The device test `oRi`

Source: main.js, character offset 84691 (first `indexOf` match of the start needle); 59 characters.
Start needle: `Ah.oRi=function`
End needle (included): `toLowerCase())}`

```
Ah.oRi=function(t){return Ah.bp(t),Rh.has(t.toLowerCase())}
```

Observed: `oRi` compares the **whole name** lowercased with `toLowerCase()` of the argument (not NFC-normalized) against `Rh`. So `con.txt` and `CONSOLE` pass, and `CON` fails.

### 1.4 The whitespace set `hRi`

Needle `Qu=new Set("0123456789");` to `Ju.has(t)}`. This span holds the digit set `Qu` (used by `nzi`, which the object-class normalizer in section 3 uses), the whitespace set `Ju`, and `hRi`.

Source: main.js, character offset 213316 (first `indexOf` match of the start needle); 173 characters; 17 invisible or whitespace-class characters are written as <U+XXXX> below.
Start needle: `Qu=new Set("0123456789");`
End needle (included): `Ju.has(t)}`

```
Qu=new Set("0123456789");Zu.nzi=function(t){return Zu.bp(t),Qu.has(t)};const Ju=new Set(" \t\n\r<U+00A0><U+0085><U+2000><U+2001><U+2002><U+2003><U+2004><U+2005><U+2006><U+2007><U+2008><U+2009><U+200A><U+200B>\u2028\u2029<U+202F><U+205F><U+3000>");Zu.hRi=function(t){return Zu.bp(t),Ju.has(t)}
```

Observed: the `Ju` literal is a string of 23 code points. In order: U+0020 (space), then a tab, a line feed and a carriage return written as the escapes `\t`, `\n` and `\r` (U+0009, U+000A, U+000D), then U+00A0, U+0085, U+2000 to U+200A (11 code points), U+200B, then U+2028 and U+2029 written in the source as two six-character Unicode escapes (they appear as text in the excerpt above, because the escapes are not decoded), then U+202F, U+205F and U+3000. The excerpt writes the 17 raw invisible characters as `<U+XXXX>`; the two escapes and the four ASCII characters are as in the source.

Observed: not in the set are U+000B, U+000C, U+1680 and U+FEFF.

### 1.5 The strip `aRi`

Source: main.js, character offset 84214 (first `indexOf` match of the start needle); 247 characters.
Start needle: `Ah.aRi=function`
End needle (included): `e.join("")}`

```
Ah.aRi=function(t,i=!0){Ah.bp(t);const e=[...t.normalize()];if(Ah.ote(e,t=>kh.has(t)),i)for(;e.length&&(Dh.has(e.at(-1))||Ah.hRi(e.at(-1)));)e.pop();for(;e.length&&(Oh.has(e[0])||Ah.hRi(e[0]));)e.shift();return e.length>Fh&&Ah.zf(e,Fh),e.join("")}
```

Observed: `aRi(t, i=true)` applies NFC, removes every `kh` character (through `ote`, below), then, when `i` is true (the default), pops trailing `.` and `hRi` characters, then shifts leading `.` and `hRi` characters, then truncates to `Fh` (200) code points through `zf`. It never throws. It can return the empty string.

`ote` removes the elements that match a predicate from the array in place and returns the removed ones; `zf` sets the array length.

Source: main.js, character offset 88147 (first `indexOf` match of the start needle); 143 characters.
Start needle: `Lh.ote=function`
End needle (included): `return Lh.zf(t,s),e}`

```
Lh.ote=function(t,i){Lh.hN(t),Lh.wm(i);let e=[],s=0;for(let n=0,r=t.length;n<r;++n){let r=t[n];i(r)?e.push(r):(t[s]=r,++s)}return Lh.zf(t,s),e}
```

Source: main.js, character offset 87087 (first `indexOf` match of the start needle); 49 characters.
Start needle: `Lh.zf=function`
End needle (included): `t.length=i}`

```
Lh.zf=function(t,i){Lh.hN(t),Lh.ye(i),t.length=i}
```

### 1.6 The case-insensitive comparison `hM`

Source: main.js, character offset 86588 (first `indexOf` match of the start needle); 152 characters.
Start needle: `Lh.hM=function`
End needle (included): `toLowerCase())}`

```
Lh.hM=function(t,i){return Lh.N8(t),Lh.N8(i),"string"==typeof t&&"string"==typeof i&&(t===i||t.normalize().toLowerCase()===i.normalize().toLowerCase())}
```

Observed: two strings are the same name when they are equal, or when their NFC forms are equal after `toLowerCase()`.

---

## 2. The section name setters that apply `aRi` then `rRi`

### 2.1 Layouts

Source: projectResources.js, character offset 533839 (first `indexOf` match of the start needle); 328 characters.
Start needle: `k(t){pc.bp(t);const s=pc.aRi(t);`
End needle (included): `yc.xq(this,"projectobjectnamechange")}`

```
k(t){pc.bp(t);const s=pc.aRi(t);if(this.qxt===s)return;if(!pc.rRi(s))throw new Error(`invalid layout name '${t}'`);const e=this.Ie();if(!pc.hM(this.qxt,s)&&e.HU(s))throw new Error(`layout name '${s}' already used`);this.qxt=s,this.mP(),e.mP(),e.QU(),e.eei(),yc.KAs(this,"layoutnamechange"),yc.xq(this,"projectobjectnamechange")}
```

Observed order in the layout setter `k`: apply `aRi`; **return** when the stripped name equals the current name; throw `invalid layout name` when `rRi` fails; throw `layout name '…' already used` when the lookup `HU` finds another layout (the comparison to the current name uses `hM`); then assign. The error text prints the original argument `t`, not the stripped one.

### 2.2 Timelines

Source: projectResources.js, character offset 362597 (first `indexOf` match of the start needle); 343 characters.
Start needle: `k(t){zn.bp(t);const s=zn.aRi(t);`
End needle (included): `Xn.xq(this,"projectobjectnamechange")}`

```
k(t){zn.bp(t);const s=zn.aRi(t);if(this.qxt===s)return;if(!zn.rRi(s))throw new Error(`invalid timeline name '${t}'`);if(!zn.hM(this.qxt,s)&&this.Ie().O$(s))throw new Error(`timeline name '${s}' already used`);this.qxt=s;const e=this.Ie();e.W9s(),this.mP(),e.QU(),e.eei(),Xn.rai(this,"timelinenamechange"),Xn.xq(this,"projectobjectnamechange")}
```

### 2.3 Models 3D

Source: projectResources.js, character offset 257236 (first `indexOf` match of the start needle); 395 characters.
Start needle: `k(t){vi.bp(t);const s=vi.aRi(t);`
End needle (included): `Ii.xq(this,"projectobjectnamechange")}`

```
k(t){vi.bp(t);const s=vi.aRi(t);if(this.#lt===s)return;if(!vi.rRi(s))throw new Error(`invalid model 3d name '${t}'`);const e=this.Ie();if(!vi.hM(this.#lt,s)&&e.vG(s))throw new Error(`model 3d name '${s}' already used`);this.#lt=s,this.#yt&&this.#yt.k(this.#lt),this.#bt&&this.#bt.k(this.#lt),this.mP(),e.mP(),e.QU(),e.eei(),Ii.kRs(this,"model3dnamechange"),Ii.xq(this,"projectobjectnamechange")}
```

Observed: the timeline setter and the model 3D setter use the same `aRi` then `rRi` pattern as the layout setter, with their own error texts and their own duplicate lookups (`O$` and `vG`).

Event sheets and flowcharts: their setters are in `raw/issue-95-empty-stem-evidence-2026-10-27.md`, which holds the `invalid event sheet name` and `invalid flowchart name` excerpts. They are not re-read here.

### 2.4 The layout load path

Source: projectResources.js, character offset 546723 (first `indexOf` match of the start needle); 138 characters.
Start needle: `BO(t){this.k(t.name),t.hasOwnProperty("sid")&&this.uFs(t.sid),this.Shn=t.eventSheet`
End needle (included): `this.Shn=pc.aRi(this.Shn))`

```
BO(t){this.k(t.name),t.hasOwnProperty("sid")&&this.uFs(t.sid),this.Shn=t.eventSheet,"string"==typeof this.Shn&&(this.Shn=pc.aRi(this.Shn))
```

Observed: the layout loader calls `this.k(t.name)`, so a name read from a layout file goes through `aRi` then `rRi` as in 2.1. The needle `unexpected layout name` has 0 hits in `main.js` and 0 hits in `projectResources.js`.

### 2.5 The object-type and family load paths

Source: projectResources.js, character offset 85598 (first `indexOf` match of the start needle); 297 characters.
Start needle: `static async TBs(t,s,e){`
End needle (included): `return h.BO(r)`

```
static async TBs(t,s,e){at.Bt(t,self.uF),at.Bt(e,at.tFs);const i=t.Ie();let n;n=i.XGs()<30900?"objectTypes\\"+s.toLowerCase():t.xFs()+s;const r=await e.q1i(n+".json");if(r.name!==s)throw new Error(`unexpected object type name '${r.name}'`);const h=at.Lt.ww(r["plugin-id"],i).GR(i,s);return h.BO(r)
```

Source: projectResources.js, character offset 93669 (first `indexOf` match of the start needle); 297 characters.
Start needle: `static async qBs(s,e,i){`
End needle (included): `return a.BO(h)`

```
static async qBs(s,e,i){St.Bt(s,self.mF),St.Bt(i,St.tFs);const n=s.Ie();let r;r=n.XGs()<30900?"families\\"+e.toLowerCase():s.xFs()+e;const h=await i.q1i(r+".json");if(h.name!==e)throw new Error(`unexpected family name '${h.name}'`);const o=St.Lt.ww(h["plugin-id"],n),a=St.m(t,n,o,e);return a.BO(h)
```

Observed: the object-type loader reads `<folder><name>.json`, throws `unexpected object type name` when the file's `name` differs from the stem `s` by strict `!==`, and then calls `<plugin>.GR(project, s)`. The family loader does the same with `unexpected family name` and then calls the family constructor `St.m(t,n,o,e)` directly, with no `GR` step. The needles `unexpected object type name` and `unexpected family name` each appear once in `projectResources.js`.

---

## 3. The object-class name rules

### 3.1 The character table `rq`

Source: main.js, character offset 223380 (first `indexOf` match of the start needle); 406 characters; 8 invisible or whitespace-class characters are written as <U+XXXX> below.
Start needle: `self.t.rq=Object.freeze(`
End needle (included): `DWi:[":","："]})`

```
self.t.rq=Object.freeze({_be:"<U+00A0>",lq:"<U+200B>",Jzi:"<U+00AD>",tWi:"≠",iWi:"≤",eWi:"≥",sWi:"±",nWi:"·",rWi:"×",hWi:"÷",oWi:"√",aWi:"∞",lWi:"≈",PI:"π",uWi:"²",cWi:"³",dWi:"½",fWi:"¼",pWi:"¾",mWi:"⅓",wWi:"⅔",gWi:"°",yWi:"©",bWi:"™",vWi:"§",SWi:"€",xWi:"•",MWi:"…",Tbe:"▶",jbe:"◀",CWi:"<U+202A>",EWi:"<U+202B>",TWi:"<U+202C>",PWi:"<U+200E>",IWi:"<U+200F>",_Wi:[".","。"],GWi:[",","，"],AWi:['"',"“","”"],RWi:["(","（"],kWi:[")","）"],OWi:["?","？"],DWi:[":","："]})
```

Observed: the arrays `_Wi`, `GWi`, `AWi`, `RWi`, `kWi`, `OWi` and `DWi` hold 15 characters in all: `.` and the ideographic full stop (U+3002), `,` and the fullwidth comma (U+FF0C), `"` and the two curly double quotes (U+201C, U+201D), `(` and the fullwidth `(` (U+FF08), `)` and the fullwidth `)` (U+FF09), `?` and the fullwidth `?` (U+FF1F), `:` and the fullwidth `:` (U+FF1A). The other keys of `rq` hold single symbols (for example `≠`, `©`, `€`) and invisible marks. The set `rt` does not read them.

### 3.2 The dropped-character set `rt` and the reserved words `ht`

Source: projectResources.js, character offset 55837 (first `indexOf` match of the start needle); 170 characters; 1 invisible or whitespace-class characters are written as <U+XXXX> below.
Start needle: `nt=Q.rq,rt=new Set(`
End needle (included): `ht=new Set(["self","true","false","system"])`

```
nt=Q.rq,rt=new Set([...nt._Wi,...nt.GWi,...nt.AWi,...nt.RWi,...nt.kWi,...nt.OWi,...nt.DWi,..."\\/;*|'-`!¬£$%^&+=<>{}[]@#~<U+00AD>"]),ht=new Set(["self","true","false","system"])
```

Observed: `nt` is `Q.rq`. The string literal holds 27 characters, by code point: U+005C, U+002F, U+003B, U+002A, U+007C, U+0027, U+002D, U+0060, U+0021, U+00AC, U+00A3, U+0024, U+0025, U+005E, U+0026, U+002B, U+003D, U+003C, U+003E, U+007B, U+007D, U+005B, U+005D, U+0040, U+0023, U+007E and U+00AD (the soft hyphen; the excerpt writes it as `<U+00AD>`). The source writes the backslash (U+005C) as `\\`, so the two source characters stand for one code point. The literal and the 15 characters of 3.1 do not overlap, so `rt` has 42 members. `_` is not in `rt`. The reserved words are `self`, `true`, `false` and `system`.

### 3.3 The normalizer `nit` and its filter `fUs`

Source: projectResources.js, character offset 57585 (first `indexOf` match of the start needle); 386 characters.
Start needle: `static nit(s,e){`
End needle (included): `static fUs(t){return Q.bp(t),!rt.has(t)&&!Q.hRi(t)}`

```
static nit(s,e){Q.bp(s),e=!!e;let i=[...s.normalize()];for(let t=0,s=i.length;t<s;++t)" "===i[t]&&t<s-1&&(i[t+1]=i[t+1].toUpperCase());if(Q.ote(i,s=>!t.fUs(s)),e){for(;i.length&&"_"===i[0];)i.shift();let t=!0;for(let s of i)if(!Q.nzi(s)){t=!1;break}t&&Q.hu(i)}else for(;i.length&&(Q.nzi(i[0])||"_"===i[0]);)i.shift();return i.join("")}static fUs(t){return Q.bp(t),!rt.has(t)&&!Q.hRi(t)}
```

Observed steps of `nit(name, true)`, the variant that the object-class constructor and setter use:

1. Apply NFC.
2. Uppercase the character that follows each U+0020 space. Only a U+0020 space does this, and only when the space is not the last character.
3. Remove every character that `fUs` rejects: those in `rt` and those in `hRi`.
4. Remove leading `_` characters.
5. Empty the name when every remaining character is an ASCII digit (`nzi`). An empty name stays empty, because the loop over no characters leaves the flag true and `hu` clears an already empty array.

The `e=false` variant removes leading digits and `_` instead. It is out of scope here.

### 3.4 The reserved test `jUt`

Source: projectResources.js, character offset 57971 (first `indexOf` match of the start needle); 109 characters.
Start needle: `static jUt(t,s){`
End needle (included): `tfs(t))}`

```
static jUt(t,s){return Q.bp(t),Q.Bt(s,self.US),!!Q.oRi(t)||(!!ht.has(t.toLowerCase())||!!s.E1().Ph().tfs(t))}
```

Observed order in `jUt(name, project)`: the device test `oRi(name)` on the whole name; then `ht.has(name.toLowerCase())`; then `project.E1().Ph().tfs(name)`. It returns true at the first match.

`E1` is the project's System object class:

Source: projectResources.js, character offset 824184 (first `indexOf` match of the start needle); 43 characters.
Start needle: `E1(){return this.KCn}`
End needle (included): `dUs(){return this.XCn}`

```
E1(){return this.KCn}dUs(){return this.XCn}
```

### 3.5 `tfs` and the System expression names

Source: main.js, character offset 1046468 (first `indexOf` match of the start needle); 73 characters.
Start needle: `Nt(t){return IR.bp(t),this.Cds.Nt(t)}tfs(t){`
End needle (included): `!!this.Nt(t)}`

```
Nt(t){return IR.bp(t),this.Cds.Nt(t)}tfs(t){return IR.bp(t),!!this.Nt(t)}
```

Source: projectResources.js, character offset 664747 (first `indexOf` match of the start needle); 58 characters.
Start needle: `Nt(t){return dd.bp(t),this.Rpn.get(`
End needle (included): `||null}`

```
Nt(t){return dd.bp(t),this.Rpn.get(t.toLowerCase())||null}
```

Source: projectResources.js, character offset 663913 (first `indexOf` match of the start needle); 504 characters.
Start needle: `tds(t){if(dd._tt(t)`
End needle (included): `this.Rpn.set(s.ays().toLowerCase(),s),s}`

```
tds(t){if(dd._tt(t),this.Vpn)throw new Error("cannot make any more definitions");let s=dd.m(self.npn,t,this.Npn);if(this.Upn&&s.zdn(),this.Mpn.has(s.hU()))throw new Error(`duplicate expression ID '${s.hU()}'`);if(null!==s._dn()&&this.jpn.has(s._dn()))throw new Error(`duplicate expression C2 ID '${s._dn()}'`);if(this.Rpn.has(s.ays()))throw new Error(`duplicate expression name '${s.ays()}'`);return this.Dpn.push(s),this.Mpn.set(s.hU(),s),this.jpn.set(s._dn(),s),this.Rpn.set(s.ays().toLowerCase(),s),s}
```

Source: projectResources.js, character offset 664805 (first `indexOf` match of the start needle); 79 characters.
Start needle: `*ifs(){for(const t of this.Dpn)`
End needle (included): `(yield t)}`

```
*ifs(){for(const t of this.Dpn)t.ols()||!t.Xoe()||pd.NE()&&!t.Qoe()||(yield t)}
```

Source: main.js, character offset 1041271 (first `indexOf` match of the start needle); 416 characters.
Start needle: `Ads(t){IR._tt(t),IR.Xcs(this.Cds,this.p)`
End needle (included): `this.yKe.st(),this.kds()}`

```
Ads(t){IR._tt(t),IR.Xcs(this.Cds,this.p),IR.u.o("plugins."+this.hU().toLowerCase());const i=!!this.p.ols();i&&IR.u.zs(!1);for(let[i,e]of Object.entries(t)){if("$schema"===i)continue;this.Cds.$(i);let t=e.conditions,s=e.actions,n=e.expressions;if(t)for(let i of t)this.Cds.Qcs(i);if(s)for(let t of s)this.Cds.Jcs(t);if(n)for(let t of n)this.Cds.tds(t)}i&&IR.u.zs(!0),this.Cds.Rds(),IR.u.et(),this.yKe.st(),this.kds()}
```

Observed: `tfs(name)` is true when the plugin's expression table `Rpn` holds `name.toLowerCase()`. `tds` fills `Rpn` with each expression's `expressionName` lowercased, for every defined expression. The listing method `ifs` skips expressions by flag (`ols`, `Xoe`, `Qoe`); `Nt` reads `Rpn` directly and uses none of those flags, so an expression that `ifs` hides is still matched. `Ads` defines the expressions in two steps: first it calls `Xcs` (section 4), then it loops over `allAces.json` for this plugin and calls `tds` for each expression in the file. So, for a plugin where `Xcs` adds nothing, `tfs` is a case-insensitive match against the `expressionName` values of that plugin's entry in `allAces.json`.

The same `tfs` is used in the UI. The name check of the edit-event-variable dialog calls `tfs` on the System plugin (`Gfs()` is shown in 5.2) and shows a `.name-is-system-expression` warning:

Source: projectResources.js, character offset 1667269 (first `indexOf` match of the start needle); 275 characters.
Start needle: `cpt(){let t=this.Vyr.value,s=self.HF.nit(t,!0);`
End needle (included): `void BJ.u.et();if(!t)return`

```
cpt(){let t=this.Vyr.value,s=self.HF.nit(t,!0);if(BJ.u.o("ui.dialogs.edit-event-variable.errors"),s!==t)return this.Vyr.value=s,this.Vyr.select(),BJ.ee.w_.ztt.GA(this.Vyr,"warning",$J(".invalid-characters.title"),$J(".invalid-characters.message")),void BJ.u.et();if(!t)return
```

Source: projectResources.js, character offset 1667895 (first `indexOf` match of the start needle); 180 characters.
Start needle: `if(BJ.Lt.Gfs().tfs(t))return`
End needle (included): `void BJ.u.et();`

```
if(BJ.Lt.Gfs().tfs(t))return this.Vyr.select(),BJ.ee.w_.ztt.GA(this.Vyr,"warning",JJ(".name-is-system-expression.title",t),$J(".name-is-system-expression.message")),void BJ.u.et();
```

Observed: this dialog (an event variable name) runs `nit` and refuses a name that `nit` would rewrite. Its `tfs` is the System plugin's method shown above.

---

## 4. Execution check (a): do the `Xcs` capability flags add names to System's `tfs`?

**Question.** `Ads` calls `Xcs(this.Cds, this.p)` before it reads `allAces.json`. `Xcs` defines "common" ACEs and expressions behind capability flags of the plugin-info object `this.p`. If any flag is on for the System plugin, `Xcs` adds expression names to `Rpn`, and `tfs` would match names beyond `allAces.json`.

### 4.1 `Xcs`

Source: main.js, character offset 1018713 (first `indexOf` match of the start needle); 187 characters.
Start needle: `uR.Xcs=function(t,i){`
End needle (included): `h=e.lt("z-order")`

```
uR.Xcs=function(t,i){uR.Bt(t,self.Ycs),uR.Bt(i,self.v),uR.u.o("plugins._common"),t.Zcs(!0);const e=self.app,s=e.lt("effect"),n=e.lt("instance-variable"),r=e.lt("layers"),h=e.lt("z-order")
```

Observed: `Xcs(t, i)` takes the definition table `t` (a `Cds`, built by `IR.m(self.Ycs)`) and the plugin-info object `i` (`this.p`, which is checked with `Bt(i, self.v)`). `Ads` passes `this.p` of the `Plugin` object (`m_plugctor`, below).

Source: main.js, character offset 1040765 (first `indexOf` match of the start needle); 321 characters.
Start needle: `window.Plugin=class extends globalThis.rls{constructor(t,i){`
End needle (included): `this.p.Kcs(),this.yKe.uls(this)`

```
window.Plugin=class extends globalThis.rls{constructor(t,i){IR.Bt(t,IR.l),super(),this.yKe=t,this.p=this.yKe.GetInfo(),this.Cds=IR.m(self.Ycs),this.Dii=i.source,this.rus=new Map,this.Eds=null,this.hIe=null,this.oIe=null,this.aIe=null,this.Tds=null,this.Pds=null,this.Ids=null,this._ds=null,this.p.Kcs(),this.yKe.uls(this)
```

The part of `Xcs` that defines the instance, count and tag expressions is guarded by `i.UF()||(…)`, which is the "single global" test:

Source: main.js, character offset 1022720 (first `indexOf` match of the start needle); 35 characters.
Start needle: `i.UF()||(t.$("instance-variables"),`
End needle (included): `t.$("instance-variables"),`

```
i.UF()||(t.$("instance-variables"),
```

Source: main.js, character offset 1024185 (first `indexOf` match of the start needle); 1302 characters.
Start needle: `t.$("misc"),t.Qcs({id:"pick-by-unique-id"`
End needle (included): `expressionName:"ObjectTypeName"`

```
t.$("misc"),t.Qcs({id:"pick-by-unique-id",c2id:-14,scriptName:"PickByUID",hideInSimplifiedMode:!0,params:[{id:"unique-id",type:"number"}],isStatic:!0}),t.Qcs({id:"has-tags",scriptName:"HasTags",params:[{id:"tags",type:"objectinsttags"}],hideInSimplifiedMode:!0}),t.Qcs({id:"on-created",c2id:-18,scriptName:"OnCreated",isTrigger:!0}),t.Qcs({id:"on-destroyed",c2id:-19,scriptName:"OnDestroyed",isTrigger:!0}),t.Jcs({id:"destroy",c2id:-9,scriptName:"Destroy"}),t.Jcs({id:"change-tags",params:[{id:"action",type:"combo",items:["add","remove","replace"]},{id:"tags",type:"objectinsttags"}],scriptName:"ChangeTags",hideInSimplifiedMode:!0}),t.tds({id:"count",c2id:-6,expressionName:"Count",returnType:"number"}),t.tds({id:"pickedcount",c2id:-14,expressionName:"PickedCount",hideInSimplifiedMode:!0,returnType:"number"}),t.tds({id:"uid",c2id:-9,expressionName:"UID",hideInSimplifiedMode:!0,returnType:"number"}),t.tds({id:"iid",c2id:-13,expressionName:"IID",hideInSimplifiedMode:!0,returnType:"number"}),"object"!==i.MF()&&(t.Jcs({id:"set-from-json",c2id:-30,scriptName:"LoadFromJsonString",hideInSimplifiedMode:!0,params:[{id:"json",type:"string"}]}),t.tds({id:"asjson",c2id:-19,expressionName:"AsJSON",hideInSimplifiedMode:!0,returnType:"string"})),t.tds({id:"objecttypename",expressionName:"ObjectTypeName"
```

### 4.2 The guards

`Xcs` holds 20 guard blocks of the forms `i.NAME()&&(…)`, `i.NAME()||(…)` and `"object"!==i.MF()&&(…)`. The table is computed from the text. A row lists the expression names that sit inside that block. A name inside two blocks is listed under the inner one.

| Guard call in `Xcs` | Expression names added when true | Field read | Setter | Default in constructor | System block calls the setter |
|---|---|---|---|---|---|
| `i.fcs()&&` | Angle | `Ius` | `li()` | false | 0 |
| `i.pcs()&&` | QuaternionX, QuaternionY, QuaternionZ, QuaternionW, RotationX, RotationY, RotationZ | `#br` | `En()` | false | 0 |
| `i.mcs()&&` | Opacity | `_us` | `oi()` | false | 0 |
| `i.Eoe()&&` | ColorValue (also inside i.mcs()&&) | `vus` | `ti(t)` | false | 0 |
| `i.Eie()&&` | (none, only ACEs) | `#gr` | `ei(t)` | false | 0 |
| `i.kR()&&` | (none, only ACEs) | `bus` | `Zt(t)` | false | 0 |
| `i.UF()||` | Count, PickedCount, UID, IID, ObjectTypeName, Tags, TagsCount, TagAt | `yus` | `it(t)` | false | 1 |
| `"object"!==i.MF()&&` | AsJSON (also inside i.UF()||) | `ius` | `Jt(t)` | "object" (assigned in the constructor) | 0 |
| `i.ccs()&&` | X, Y, dt | `Tus` | `ri()` | false | 0 |
| `i.XWt()&&` | Z, TotalZ, ZElevation, TotalZElevation | `aus` | `ii(t)` | false | 0 |
| `i.dcs()&&` | Width, Height, BBoxLeft, BBoxTop, BBoxBack, BBoxRight, BBoxBottom, BBoxFront, BBoxMidX, BBoxMidY, BBoxMidZ | `Pus` | `ai()` | false | 0 |
| `i.IEt()&&` | Depth (also inside i.dcs()&&) | `Sus` | `Gn(t)` | false | 0 |
| `i.wcs()&&` | LayerNumber, LayerName, ZIndex | `Gus` | `ci()` | false | 0 |
| `i.Mcs()&&` | (none, only ACEs) | `Fus` | `ir()` | false | 0 |
| `i.Scs()&&` | ParentUID, ChildCount, AllChildCount | `Ous` | `ui()` | false | 0 |
| `i.xcs()&&` | MeshColumns, MeshRows | `Dus` | `Un()` | false | 0 |
| `i.gcs()&&` | (none, only ACEs) | `Aus` | `Qs()` | false | 0 |
| `i.ycs()&&` | (none, only ACEs) | `Rus` | `qs()` | false | 0 |
| `i.bcs()&&` | (none, only ACEs) | `kus` | `Ks()` | false | 0 |
| `i.Ccs()&&` | one name, the last in `Xcs`, matching the glob `Tem*Name` | `Lus` | `di()` | false | 0 |

In the `i.UF()||` row the block runs when the flag is **false**; in the `"object"!==i.MF()` row it runs when the plugin type is not `"object"`; in every other row it runs when the flag is true. The column "System block calls the setter" counts the `this.p.<setter>(` calls in the System block (4.4).

`Xcs` holds 47 `expressionName` entries. The expression names outside every guard block above: none.

Observed: a second call `i.fcs()&&` appears once, in front of a single action (`move-forward`). It is not a block and defines no expression.

### 4.3 The plugin-info class and its defaults

The class `window.v` (the plugin-info type):

Source: main.js, character offset 1011503 (first `indexOf` match of the start needle); 1051 characters.
Start needle: `window.v=class extends hR.MV{`
End needle (included): `this.Xus=new Map}`

```
window.v=class extends hR.MV{#gr=!1;#yr=!1;#br=!1;constructor(t){hR.bp(t),super(),this.jme=t,this.qxt="",this.IIe="",this.hAt="1.0.0.0",this.Zls=!1,this.Qls="general",this.Jls="",this.tus="http://",this.ius="object",this.eus="icon.svg",this.sus="image/svg+xml",this.nus="",this.rus=["c3runtime/plugin.js","c3runtime/type.js","c3runtime/instance.js","c3runtime/conditions.js","c3runtime/actions.js","c3runtime/expressions.js"],this.hus=[],this.I6i=!1,this.ous=!1,this.aus=!1,this.lus=!1,this.uus="",this.cus=!1,this.Fb=null,this.dus=!1,this.fus=!1,this.IXi=!1,this.pus=!1,this.mus=!1,this.wus=!1,this.gus=!1,this.yus=!1,this.bus=!1,this.vus=!1,this.Sus=!1,this.SZe=!1,this.xus=!0,this.Mus=!0,this.Cus="",this.Eus=!0,this.Tus=!1,this.Pus=!1,this.Ius=!1,this._us=!1,this.Gus=!1,this.Aus=!1,this.Rus=!1,this.kus=!1,this.Ous=!1,this.Dus=!1,this.Fus=!1,this.Lus=!1,this.Bus={},this.MAe=[],this.Uus=new Map,this.Nus=[],this.$us=[],this.jus=[],this.zus=[],this.Wus=!1,this.Vus="",this.Hus=[],this.qus={pi:"",objectType:"",cxt:""},this.Kus=[],this.Xus=new Map}
```

Source: main.js, character offset 1013083 (first `indexOf` match of the start needle); 1053 characters.
Start needle: `Qt(t){this.I6i=!!t}NBt()`
End needle (included): `Ua(){return this.SZe}`

```
Qt(t){this.I6i=!!t}NBt(){return this.I6i}qt(t){this.ous=!!t}hVt(){return this.ous}Bn(t){this.#yr=!!t}$ie(){return this.#yr}ii(t){this.aus=!!t}XWt(){return this.aus}ei(t){this.#gr=!!t}Eie(){return this.#gr}Kt(t){this.lus=!!t}Sd(){return this.lus}NM(t){hR.bp(t),this.uus=t}Jus(){return this.uus}CT(t){hR.bp(t),this.Cus=t}tcs(){return this.Cus}Zh(t){this.Eus=!!t}ics(){return this.Eus}zb(t){this.cus=!!t}Md(){return this.cus}Eb(t){if(hR.hN(t),0===t.length)throw new Error("expected non-empty array");this.Fb=t}CSt(){return Array.isArray(this.Fb)}ecs(){return this.Fb}cT(t){this.fus=!!t}scs(){return this.fus}Xu(t){this.dus=!!t}ncs(){return this.dus}VM(t){this.IXi=!!t}rH(){return this.IXi}MT(t){this.pus=!!t}Sw(){return this.pus}Fs(t){this.mus=!!t}ols(){return this.mus}rcs(t){this.wus=!!t}hcs(){return this.wus}ocs(t){this.gus=!!t}acs(){return this.gus}it(t){this.yus=!!t}UF(){return this.yus}Zt(t){this.bus=!!t}kR(){return this.bus}Gn(t){this.Sus=!!t}IEt(){return this.Sus}ti(t){this.vus=!!t}Eoe(){return this.vus}si(t){this.SZe=!!t}Ua(){return this.SZe}
```

Source: main.js, character offset 1014219 (first `indexOf` match of the start needle); 546 characters.
Start needle: `ri(){this.Tus=!0}ccs()`
End needle (included): `Ccs(){return this.Lus}`

```
ri(){this.Tus=!0}ccs(){return this.Tus}ai(){this.Pus=!0}dcs(){return this.Pus}li(){this.Ius=!0}fcs(){return this.Ius}En(){this.#br=!0}pcs(){return this.#br}oi(){this._us=!0}mcs(){return this._us}ci(){this.Gus=!0}wcs(){return this.Gus}Qs(){this.Aus=!0}gcs(){return this.Aus}qs(){this.Rus=!0}ycs(){return this.Rus}Ks(){this.kus=!0}bcs(){return this.kus}Zs(t){this.Bus=t}vcs(){return this.Bus}ui(){this.Ous=!0}Scs(){return this.Ous}Un(){this.Dus=!0}xcs(){return this.Dus}ir(){this.Fus=!0}Mcs(){return this.Fus}di(){this.Lus=!0}Ccs(){return this.Lus}
```

Source: main.js, character offset 1012944 (first `indexOf` match of the start needle); 47 characters.
Start needle: `Jt(t){hR.bp(t),this.ius=t}MF()`
End needle (included): `MF(){return this.ius}`

```
Jt(t){hR.bp(t),this.ius=t}MF(){return this.ius}
```

Observed: every flag field above is `false` in the constructor (`xus`, `Mus` and `Eus` start `true` but are not `Xcs` guards), except `ius`, which holds the plugin type and starts as `"object"`. The getter `UF` reads `yus`, which the setter `it(t)` writes. The setters `ri`, `ai`, `li`, `En`, `oi`, `ci`, `Qs`, `qs`, `Ks`, `ui`, `Un`, `ir` and `di` take no argument and set their flag to `true`. The setters `it`, `Zt`, `Gn`, `ti`, `ii` and `ei` store `!!t`. `Jt` stores the plugin type string.

The public SDK names that third-party addon code uses map to these setters:

Source: main.js, character offset 1082472 (first `indexOf` match of the start needle); 1145 characters.
Start needle: `SetPluginType(t){`
End needle (included): `AddCommonSceneGraphACEs(){Ak.get(this).ui()}`

```
SetPluginType(t){Ak.get(this).Jt(t)}SetIcon(t,i){Ak.get(this).tA(t,i)}SetIsResizable(t){Ak.get(this).Qt(t)}SetIsRotatable(t){Ak.get(this).qt(t)}SetIsRotatable3D(t){Ak.get(this).Bn(t)}SetSupportsZElevation(t){Ak.get(this).ii(t)}SetHasImage(t){Ak.get(this).Kt(t)}SetDefaultImageURL(t){Ak.get(this).NM(t)}SetHasAnimations(t){Ak.get(this).zb(t)}SetIsTiled(t){Ak.get(this).cT(t)}SetIsFont(t){Ak.get(this).VM(t)}SetHasTilemap(t){Ak.get(this).MT(t)}SetIsDeprecated(t){Ak.get(this).Fs(t)}SetIsSingleGlobal(t){Ak.get(this).it(t)}SetSupportsEffects(t){Ak.get(this).Zt(t)}SetMustPreDraw(t){Ak.get(this).si(t)}SetIs3D(t){Ak.get(this).Gn(t)}SetSupportsColor(t){Ak.get(this).ti(t)}SetSupportsChangingSampling(t){Ak.get(this).ei(t)}SetCanBeBundled(t){Ak.get(this).lcs(t)}SetUsesJquery(t){console.warn("[SDK] SetUsesJquery() is deprecated and no longer has any effect")}AddCommonPositionACEs(){Ak.get(this).ri()}AddCommonSizeACEs(){Ak.get(this).ai()}AddCommonAngleACEs(){Ak.get(this).li()}AddCommon3DRotationACEs(){Ak.get(this).En()}AddCommonAppearanceACEs(){Ak.get(this).oi()}AddCommonZOrderACEs(){Ak.get(this).ci()}AddCommonSceneGraphACEs(){Ak.get(this).ui()}
```

Observed: `SetIsSingleGlobal` calls `it`, `AddCommonPositionACEs` calls `ri`, `AddCommonSizeACEs` calls `ai`, `AddCommonAngleACEs` calls `li`, and so on. These wrappers are the SDK surface of a plugin written against the addon SDK.

### 4.4 What the System plugin calls

The System plugin is defined at the start of `allEditorPlugins.js`:

Source: allEditorPlugins.js, character offset 0 (first `indexOf` match of the start needle); 322 characters.
Start needle: `{const t=self.t,i=self.lang,e="system"`
End needle (included): `t.u.et()}st(){`

```
{const t=self.t,i=self.lang,e="system",s="1.0.0.0",n="system";let h=null;const r=t.h.i=class extends t.l{constructor(){super(),t.u.o("plugins.system"),this.p=t.m(self.v,e),this.p.k(i(".name")),this.p.j(i(".description")),this.p._(s),this.p.$(n),this.p.q("Scirra"),this.p.tt("system-reference"),this.p.it(!0),t.u.et()}st(){
```

Observed: the System plugin block runs from the first character of `allEditorPlugins.js` to the start of the next plugin block (the `advert` plugin). Its constructor creates the plugin-info object with `this.p=t.m(self.v,e)` after `super()`. The base class `t.l` of every editor plugin sets `p` to `null` and has no setter calls on it in its constructor:

Source: main.js, character offset 999729 (first `indexOf` match of the start needle); 364 characters.
Start needle: `HA.l=class extends HA.MV{constructor(){`
End needle (included): `GetInfo(){if(!this.p)throw new Error("plugin must set info");return this.p}`

```
HA.l=class extends HA.MV{constructor(){super(),this.als=new.target,this.rt=null,this.p=null,this.lls=null}Ut(){this.als=null,this.rt=null,this.p=null}uls(t){HA.Bt(t,self.Plugin),this.rt=t}Ph(){return this.rt}cls(t){HA.wm(t),this.als=t}dls(){return this.als}fls(t){HA.Bt(t,self.v),this.p=t}GetInfo(){if(!this.p)throw new Error("plugin must set info");return this.p}
```

So the base-class constructor cannot call a setter on `this.p`. The setter calls on `this.p` in the whole block, counted by script, are: k x1, j x1, _ x1, $ x1, q x1, tt x1, it x1. The call `it(!0)` is the single-global flag. No call in the block uses the receiver `t.p.`. The block's `tds` calls: none. The `st()` method of the System plugin only looks up existing expressions with `this.rt.ct(id)`, which throws `missing expression id` for a name that is not defined; it does not add any.

### 4.5 Conclusion for (a)

**Observed.** At r495-2 the System plugin turns on exactly one `Xcs` flag, `UF` (single global). Every other guard in the table is false, because the constructor default is false and the System block calls none of the matching setters. The `UF()||(…)` block, the only block that holds Count, PickedCount, UID, IID, AsJSON, ObjectTypeName, Tags, TagsCount and TagAt, is therefore skipped. `"object"!==i.MF()` is nested in that skipped block, and `MF` stays `"object"` for System in any case.

So `Xcs` adds **no** expression name to System's `tfs` lookup. The lookup is the `expressionName` values of the System entry in `allAces.json` and nothing else. Guard status per flag: `UF` observed on for System; `fcs`, `pcs`, `mcs`, `Eoe`, `Eie`, `kR`, `ccs`, `XWt`, `dcs`, `IEt`, `wcs`, `Mcs`, `Scs`, `xcs`, `gcs`, `ycs`, `bcs`, `Ccs` and `MF` observed off for System.

Limits of this check: it reads code and does not run the editor. It does not exclude a setter call made by code outside the System block that reaches the System plugin-info object by another route. The setter callers found in `main.js` are the SDK wrappers shown above, which act on the plugin-info object of the plugin that calls them. The sibling setter `fls` on `t.l` (which also assigns `p`) has two callers in `main.js`, the constructors of the SDK base classes for plugins and for behaviors. Each creates a new plugin-info object with `Ik.m(self.v,t)` and passes it to `fls`. They serve addon-SDK plugins, not the built-in System plugin. `projectResources.js` and `allEditorPlugins.js` have no `.fls(` call.

---

## 5. Execution check (b): is the System object class registered in `QCn`?

**Question.** `QCn` is the project's map from lowercased object-class name to object class. If the System object class is in it at project construction, then creating another object class named `System` fails the `lU` test.

### 5.1 The map and its writers

Source: projectResources.js, character offset 799944 (first `indexOf` match of the start needle); 50 characters.
Start needle: `this.qCn=$y.m(self.uF,this,null),this.QCn=new Map,`
End needle (included): `this.QCn=new Map,`

```
this.qCn=$y.m(self.uF,this,null),this.QCn=new Map,
```

Source: projectResources.js, character offset 807600 (first `indexOf` match of the start needle); 613 characters.
Start needle: `dE(t){if(t.Ie()!==this)return;`
End needle (included): `this.QCn.set(i,t),this.QU()}`

```
dE(t){if(t.Ie()!==this)return;this.tEn.set(t.pl(),t);const s=t.gh().toLowerCase();if(this.QCn.has(s))throw new Error("object class name already in use");this.QCn.set(s,t)}mE(t,s=!1){if(t.Ie()!==this)return;this.tEn.delete(t.pl());const e=t.gh().toLowerCase();if(!this.QCn.has(e)&&!s)throw new Error("expected object class name to exist");this.QCn.delete(e)}MLt(t,s){const e=s.toLowerCase(),i=t.gh().toLowerCase();if(!this.QCn.has(e))throw new Error("expected object class name to exist");if(e!==i&&this.QCn.has(i))throw new Error("object class name already in use");this.QCn.delete(e),this.QCn.set(i,t),this.QU()}
```

Observed: `dE(t)` registers an object class `t` in `tEn` (by SID) and in `QCn` (by `gh().toLowerCase()`), and throws `object class name already in use` when the key is present. `mE` removes an entry and `MLt` re-keys one on rename. `Ut` of the project clears `QCn`.

### 5.2 How the System object class is created

Source: projectResources.js, character offset 801007 (first `indexOf` match of the start needle); 168 characters.
Start needle: `this.JEn=new self.HEn(this),this.KCn=`
End needle (included): `this.XCn.rBs("function")`

```
this.JEn=new self.HEn(this),this.KCn=$y.Lt.Gfs().GR(this,"System"),this.XCn=$y.Lt.Gfs().GR(this,fb("model.event-sheet.builtin-functions-name")),this.XCn.rBs("function")
```

Source: main.js, character offset 1046765 (first `indexOf` match of the start needle); 363 characters.
Start needle: `GR(t,i){if(IR.Bt(t,self.US),IR.N8(i)`
End needle (included): `t.rfs("auto"),e}`

```
GR(t,i){if(IR.Bt(t,self.US),IR.N8(i),this.UF()&&t.fU().has(this))throw new Error("single-global plugin already in project");if(i){if(i=self.HF.nit(i,!0),t.lU(i))throw new Error(`object type name '${i}' already used`)}else i=t.UR(this.gh());let e=IR.m(self.dF,t,this,i);return e.se=this.yKe.GR(e),this.UF()&&e.nfs(),this.ics()||"worker"!==t.Pse()||t.rfs("auto"),e}
```

Source: projectResources.js, character offset 56008 (first `indexOf` match of the start needle); 467 characters.
Start needle: `window.HF=class t extends self.fps{constructor(s,e,i){`
End needle (included): `this.Ie().dE(this)}`

```
window.HF=class t extends self.fps{constructor(s,e,i){if(super(s),Q.bp(i),!(i=t.nit(i,!0)))throw new Error("invalid name");if("System"!==i&&!s.cl()&&t.jUt(i,s))throw new Error("name is reserved");if(this.Ie().lU(i))throw new Error(`object class name '${i}' already used`);Q.Bt(e,self.Plugin),this.rt=e,this.aAt=null,this.qxt=i,this.yFs="",this.sUs=Q.m(self.kjs,this,null),this.eUs=Q.m(self.lDs,this,null),this.iUs=new Set,this.nUs=null,this.fPe=!1,this.Ie().dE(this)}
```

Source: projectResources.js, character offset 66011 (first `indexOf` match of the start needle); 61 characters.
Start needle: `window.dF=class t extends lt{constructor(t,s,e){`
End needle (included): `super(t,s,e),`

```
window.dF=class t extends lt{constructor(t,s,e){super(t,s,e),
```

Source: projectResources.js, character offset 65831 (first `indexOf` match of the start needle); 27 characters.
Start needle: `{const at=self.t,lt=self.HF`
End needle (included): `lt=self.HF`

```
{const at=self.t,lt=self.HF
```

Observed, in order:

1. The project constructor sets `this.QCn=new Map` and, later in the same constructor, `this.KCn=$y.Lt.Gfs().GR(this,"System")`. `$y.Lt` is the plugin registry object (its `plugins` and `ww` methods list and look up plugins by id), and its method `Gfs` returns the System plugin:

Source: main.js, character offset 1052573 (first `indexOf` match of the start needle); 31 characters.
Needle: `Gfs(){return this.ww("system")}`

```
Gfs(){return this.ww("system")}
```

   So `GR(project, name)` here is the `Plugin` method of the excerpt above.
2. `GR(t, i)` with `i="System"`: `i=HF.nit(i,true)` gives `System`; `t.lU(i)` is false because `QCn` is empty; it then creates `IR.m(self.dF,t,this,i)`. `dF` is the object-type class and `dF extends lt`, where `lt=self.HF`.
3. The `HF` constructor runs `nit`, skips the reserved test (`"System"!==i` is false, and `s.cl()` is also true during construction), checks `lU`, and ends with `this.Ie().dE(this)`.
4. `dE` stores the System object class under the key `system` in `QCn`.

**Observed (code read, not run):** the System object class goes through `HF` and `dE` at project construction, so `QCn` holds the key `system` for every project. Creating or renaming a second object class to a name that matches `system` ignoring case then fails `lU`:

Source: projectResources.js, character offset 825411 (first `indexOf` match of the start needle); 201 characters.
Start needle: `lU(t){return $y.bp(t),this.QCn.has(`
End needle (included): `while(this.lU(s)&&!Yy.jUt(s,this));return s}`

```
lU(t){return $y.bp(t),this.QCn.has(t.normalize().toLowerCase())}UR(t){if($y.bp(t),t=Yy.nit(t,!0),!this.lU(t)&&!Yy.jUt(t,this))return t;let s=t;do{s=$y.cU(s)}while(this.lU(s)&&!Yy.jUt(s,this));return s}
```

Observed: `lU` lowercases the NFC form of the name. Through the plugin `GR` path the error is `object type name 'System' already used`. Through the `HF` constructor path it is `object class name 'System' already used`. Through the `HF` rename setter it is the same text as the constructor's. In the setter, a rename of the System class to its own current name returns early at `this.qxt===s`.

Two further observed facts about the second object class that the project creates in the same constructor:

- `this.XCn=$y.Lt.Gfs().GR(this,fb("model.event-sheet.builtin-functions-name"))` creates a second System-plugin object class with a localized name. The excerpt above shows both assignments.
- `HF.t3()` returns the plugin's name instead of the class name when `"system"===this.rt.hU()&&this!==this.Ie().dUs()`. This was seen in passing and not traced further.

`xms` is the project's by-name lookup into `QCn`, which `uU` uses too:

Source: projectResources.js, character offset 825056 (first `indexOf` match of the start needle); 71 characters.
Start needle: `xms(t){return $y.bp(t),this.QCn.get(`
End needle (included): `||null}`

```
xms(t){return $y.bp(t),this.QCn.get(t.normalize().toLowerCase())||null}
```

**Conclusion for (b), observed:** the System object class is registered in `QCn` at project construction. The one thing not shown by an editor run is the user-visible message in the UI when a user types `System` as a new object type name.

---

## 6. The object-class constructor, rename setter, `cl()` and the UI rename

### 6.1 The constructor

(The `HF` constructor excerpt is in 5.2.)

Observed order in the constructor `HF(project, plugin, name)`: `nit(name, true)`, throw `invalid name` when the result is empty; throw `name is reserved` when the result is not exactly `System`, `project.cl()` is false and `jUt` is true; throw `object class name '…' already used` when `lU` is true; assign; call `dE`.

### 6.2 The rename setter

Source: projectResources.js, character offset 58183 (first `indexOf` match of the start needle); 397 characters.
Start needle: `k(s){if(Q.bp(s),s=t.nit(s,!0)`
End needle (included): `st.xq(this,"projectobjectnamechange")}`

```
k(s){if(Q.bp(s),s=t.nit(s,!0),this.qxt===s)return;if(!s)throw new Error("invalid name");if(!Q.hM(this.qxt,s)&&this.Ie().lU(s))throw new Error(`object class name '${s}' already used`);if(t.jUt(s,this.Ie()))throw new Error("name is reserved");const e=this.qxt;this.qxt=s,this.Ie().QU(),this.Ie().Mjs(),this.Ie().MLt(this,e),st.iRs(this,"objectclassnamechange"),st.xq(this,"projectobjectnamechange")}
```

Observed order in the rename setter `k`: `nit(name, true)`; **return** when the result equals the current name; throw `invalid name` on an empty result; throw `object class name '…' already used` when the result is not the same name under `hM` and `lU` is true; throw `name is reserved` when `jUt` is true; then assign and update `QCn` through `MLt`. There is no `System` exemption and no `cl()` test in the setter.

### 6.3 `cl()` and `#Ie`

Source: projectResources.js, character offset 804729 (first `indexOf` match of the start needle); 42 characters.
Start needle: `cl(){return this.#Ie}`
End needle (included): `VF(){return this.#Ce}`

```
cl(){return this.#Ie}VF(){return this.#Ce}
```

Source: projectResources.js, character offset 799006 (first `indexOf` match of the start needle); 99 characters.
Start needle: `globalThis.US=class t extends $y.MV{`
End needle (included): `#Ee=!1;`

```
globalThis.US=class t extends $y.MV{#ge=!1;#ye=!1;#be=!1;#Se=!1;#ve=!1;#Ge=!1;#Ie=!0;#Ce=!1;#Ee=!1;
```

Source: projectResources.js, character offset 805318 (first `indexOf` match of the start needle); 59 characters.
Start needle: `this.#_e(),this.b_n(),this.S_n(),this.ZEn.DT(),this.#Ie=!1,`
End needle (included): `this.#Ie=!1,`

```
this.#_e(),this.b_n(),this.S_n(),this.ZEn.DT(),this.#Ie=!1,
```

Source: main.js, character offset 1346957 (first `indexOf` match of the start needle); 78 characters.
Start needle: `async NGs(t,i=!1,e=!0){`
End needle (included): `"project still loading")`

```
async NGs(t,i=!1,e=!0){if(O$.Bt(t,self.US),D$(!t.cl(),"project still loading")
```

Observed: `cl()` returns the private field `#Ie`. The field starts `true` at construction (`#Ie=!0`). It is set to `false` once, after the post-load `DT()` loops. The project-open path `NGs` asserts `!t.cl()` with the message `project still loading`.

Inferred: `cl()` means "the project is loading", so the constructor skips the reserved test only while a project loads. Not traced: the path of a new project (not loaded from disk) to the `#Ie=false` assignment.

### 6.4 Unique-name generation

The `lU` excerpt in 5.2 also holds `UR`, which builds a free name. Observed: it applies `nit(name, true)`; it returns the result when `lU` is false and `jUt` is false; otherwise it repeats `s=cU(s)` while `lU(s)&&!jUt(s)` holds, and returns `s`. `GR` calls `UR` when the requested name is empty. What `cU` does to the string was not read.

### 6.5 Object types and families share `HF`

Observed: `window.dF=class t extends lt`, with `lt=self.HF` (section 5.2), is the object-type class. The family class:

Source: projectResources.js, character offset 90038 (first `indexOf` match of the start needle); 61 characters.
Start needle: `window.yd=class t extends vt{constructor(t,s,e){`
End needle (included): `super(t,s,e),`

```
window.yd=class t extends vt{constructor(t,s,e){super(t,s,e),
```

Source: projectResources.js, character offset 89972 (first `indexOf` match of the start needle); 27 characters.
Start needle: `{const St=self.t,vt=self.HF`
End needle (included): `vt=self.HF`

```
{const St=self.t,vt=self.HF
```

Observed: `window.yd=class t extends vt`, with `vt=self.HF`, is the family class. Both pass `(project, plugin, name)` to the `HF` constructor.

### 6.6 The UI rename `dA` and its `.name-changed` warning

Source: projectResources.js, character offset 58580 (first `indexOf` match of the start needle); 624 characters.
Start needle: `dA(s,e){Q.bp(s),Q.QK(e);const i=t.nit(s,!0)`
End needle (included): `void Q.u.et())}`

```
dA(s,e){Q.bp(s),Q.QK(e);const i=t.nit(s,!0);return Q.u.o("model.object-class.errors"),i?t.jUt(i,this.Ie())?(Q.ee.w_.ztt.GA(e,"warning",et(".name-reserved.title"),it(".name-reserved.message",i),{align:"bottom"}),void Q.u.et()):!Q.hM(i,this.gh())&&this.Ie().lU(i)?(Q.ee.w_.ztt.GA(e,"warning",et(".name-used.title"),it(".name-used.message",i),{align:"bottom"}),void Q.u.et()):(this.k(i),Q.hM(i,s)||Q.ee.w_.ztt.GA(e,"warning",et(".name-changed.title"),et(".name-changed.message"),{align:"bottom"}),void Q.u.et()):(Q.ee.w_.ztt.GA(e,"warning",et(".name-invalid.title"),et(".name-invalid.message"),{align:"bottom"}),void Q.u.et())}
```

Observed order in `dA(newName, anchor)`: `i=nit(newName,true)`; if `i` is empty, show `.name-invalid` and stop; else if `jUt(i)` is true, show `.name-reserved` and stop; else if the name is not the current one under `hM` and `lU(i)` is true, show `.name-used` and stop; otherwise call `this.k(i)` and, when `hM(i, newName)` is false (the name was rewritten), show a `.name-changed` warning. The UI therefore **accepts** a name that `nit` rewrites and tells the user; it refuses only an invalid, reserved or used name. It checks reserved before used, the setter checks used before reserved.

---

## 7. Derived rule summaries

| Rule | Statement | Status |
|---|---|---|
| Layout check order (`rRi`) | empty; at least 200 code points after NFC; a forbidden character (10); first character `.` or `hRi`; last character `.` or `hRi`; whole-name device name (22, lowercased) | Observed |
| `hRi` | 23 code points, listed in 1.4; U+000B, U+000C, U+1680 and U+FEFF are not in it | Observed |
| `aRi` strips | NFC; every forbidden character; trailing `.` and `hRi` characters; leading `.` and `hRi` characters; then truncation to 200 code points | Observed |
| `aRi` never throws | the setter is where a refusal happens, after the strip | Observed |
| Layout setter still throws after the strip | on an empty result (for example `...` or `~~`); on a result with 200 or more code points (truncation gives exactly 200, which `rRi` still rejects); on a device name, including one that the strip creates (`C~ON` becomes `CON`) | Observed (derived from `aRi` and `rRi`; no input was run) |
| Layout setter early return | a stripped name equal to the current name returns before any check | Observed |
| Layout duplicate lookup | case-insensitive, NFC (`hM`) | Observed |
| `oRi` is a whole-name test | `con.txt` and `CONSOLE` pass; `CON` and `Nul` fail | Observed (derived; no input was run) |
| Timeline and model 3D | the same `aRi` then `rRi` pattern as layouts | Observed |
| Event sheet and flowchart | the same pattern, per `raw/issue-95-empty-stem-evidence-2026-10-27.md` | Observed there, not re-read here |
| `nit(name, true)` steps | NFC; uppercase after each U+0020; drop `rt` (42) and `hRi` characters; drop leading `_`; empty a digits-only name | Observed |
| `rt` | 15 characters from `rq` plus 27 from the literal, 42 members, no overlap | Observed (counted by script) |
| `jUt` order | whole-name device test; `self`/`true`/`false`/`system` ignoring case; the System expression names (`tfs`) ignoring case | Observed |
| `tfs` for System | the `expressionName` values of the System entry in `allAces.json` (section 8), with `Xcs` adding none | Observed (Xcs part: section 4) |
| Constructor order | invalid; reserved (skipped for exact `System` and while `cl()` is true); used | Observed |
| Rename setter order | early return on unchanged; invalid; used; reserved (no exemption) | Observed |
| UI rename order | invalid; reserved; used; then rename and warn when `nit` rewrote the name | Observed |
| Meaning of `cl()` | "the project is loading" | Inferred |
| `System` is in `QCn` | the System object class goes through `dE` at project construction | Observed (code read; section 5) |
| A mismatched layout name is renamed on save to `folder + name + ".json"` | a claim carried in the issue | Not traced |

---

## 8. The System expression names (`tfs` at r495-2)

Command, run from the repository root on the saved copy of `allAces.json`:

```
node scripts/system-expression-names.mjs allAces.json
```

The script is committed in this repository. It reads the System entry (the key `system`) of the file and prints each `expressionName` on a line of its own, in file order. The output had 136 lines and exit status 0. All 136 names are different when lowercased. Eight carry `isDeprecated: true` in the file; the script does not print that flag. The listing below is the script's output, one name per line, with nothing added to the lines:

```
WindowWidth
WindowHeight
OriginalWindowWidth
OriginalWindowHeight
OriginalViewportWidth
OriginalViewportHeight
LayerScale
LayerOpacity
LayerScaleRate
LayerAngle
ViewportLeft
ViewportTop
ViewportRight
ViewportBottom
ViewportWidth
ViewportHeight
ViewportMidX
ViewportMidY
LayerToCanvasX
LayerToCanvasY
CanvasToLayerX
CanvasToLayerY
LayerToLayerX
LayerToLayerY
LayerScrollX
LayerScrollY
LayerParallaxX
LayerParallaxY
LayerIndex
LayerZElevation
CallMapped
scrollx
scrolly
LayoutWidth
LayoutHeight
LayoutScale
LayoutName
LayoutAngle
CanvasSnapshot
VanishingPointX
VanishingPointY
sqrt
abs
round
roundToDp
floor
ceil
sign
sin
cos
tan
asin
acos
atan
exp
ln
log10
max
min
distance
distance3d
angle
lerp
pi
anglediff
anglelerp
anglerotate
unlerp
Infinity
setbit
togglebit
getbit
qarp
cubic
cosp
imageloadingprogress
SaveStateJSON
objectcount
loopindex
renderer
projectversion
projectid
projectuniqueid
loadingprogress
ImageMemoryUsage
projectname
rendererDetail
CurrentEventSheetName
CurrentEventNumber
ProjectFileCount
ProjectFileNameAt
len
newline
uppercase
lowercase
find
left
right
mid
tokenat
tokencount
replace
StringSub
trim
zeropad
URLEncode
URLDecode
RegexSearch
RegexReplace
RegexMatchCount
RegexMatchAt
findCase
dt
wallclockdt
timescale
time
tickcount
fps
wallclocktime
cpuutilisation
gpuutilisation
unixtime
int
float
str
random
clamp
choose
chooseindex
rgb
rgbEx
rgba
rgbEx255
rgba255
HexColor
ColorToHexString
```

## 9. The r495-2 and r506.3 empty-name conflict (stated, not resolved)

Two records disagree about an object type whose name is the empty string, and they were made on two different releases.

- **Bundle at r495-2 (this file).** The `HF` constructor and the `HF` rename setter both throw `invalid name` when `nit` returns the empty string (6.1 and 6.2). The family loader calls the family constructor directly (2.5), so an empty family name reaches that throw.
- **Live editor at r506.3.** `raw/issue-100-empty-name-live-editor-2026-10-28.md` records a run where a project whose manifest declared an objectTypes item `""` opened, and after a save the manifest read `Text3` in that place. The same run records that a families item `""` failed to open with `invalid name`.

The releases differ, and no r506.3 code was read. The two records are therefore not shown to contradict each other, and this file does not decide between them.

One more observed fact in the r495-2 code bears on the question and is recorded without a conclusion. The object-type loader calls `GR(project, stem)` (2.5). `GR` has two branches (5.2): `if(i){ i=HF.nit(i,true); … } else i=t.UR(this.gh())`. An empty string is falsy, so a stem `""` takes the `else` branch and gets the name `UR(<plugin name>)`, the next free name for that plugin (6.4), before the `HF` constructor runs. A non-empty stem that `nit` empties (for example `123`) takes the first branch and reaches the `HF` constructor with an empty name. Whether this explains the `Text3` that the r506.3 run recorded is inferred and unconfirmed: it is the r495-2 code only.
## 10. Not traced

- The object-class rules at **r379** and **r402**. Only r495-2 was read for them. (For the layout rule, `raw/issue-95-empty-stem-evidence-2026-10-27.md` holds r379 and r402.)
- What manifest the editor writes after a rename on save, and whether it rewrites the on-disk file name of an object type, a family or a layout.
- What the editor UI shows when a creation or a rename throws a duplicate-name error, for example for the name `System`. The `dA` rename shows warnings (6.6); the messages of the creation paths were not read.
- Any code that reaches the System plugin-info object by a route other than the System block and the callers listed in 4.5. The conclusion in 4.5 is a code reading of the four files above.
- The path of a new project to `#Ie=false` (6.3).
- The second System-plugin object class `XCn` and the function that `t3()` serves (5.2).
- The other callers of the object-type `GR` and of `UR`, beyond the loader and the unique-name helper shown.
- Any run of the editor. Every statement above is from reading the bundle text.
