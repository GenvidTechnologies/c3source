# Issue #125 — C3 duplicate-name lookups per section: editor bundle evidence at r495-2 (capture)

**Captured:** 2026-11-04
**For:** GenvidTechnologies/c3source#125 (the duplicate names that `detectManifestDrift` reports should follow the editor's per-section lookups)
**Source:** the Construct 3 editor bundle for release r495-2, fetched from `https://editor.construct.net/r495-2/` (the permanently hosted per-release root; see `wiki/c3-domain-facts.md`, "Two evidence channels"). The question: when the editor asks "is this name already used?", how does it compare names, for each project section?
**Nature:** the verbatim minified source around each needle, and the method that found it. Nothing here is a corpus scan, and no bundle code was run.

Labels used below:

- **Observed:** read in the bundle text. The code was not executed, so "observed" means "the code says so", not "an editor run showed so".
- **Inferred:** drawn from observed text by reasoning, not confirmed by an editor run.
- **Not traced:** not read, or read only in part. The "Not traced" section lists them.

This capture extends `raw/issue-123-item-name-rules-bundle-evidence-2026-11-04.md` (the #123 capture), which records the name setters and the object-class rules from the same bundle.

---

## Files fetched

| Release | URL | Local name | Bytes | sha256 |
|---|---|---|---|---|
| r495-2 | `https://editor.construct.net/r495-2/projectResources.js` | `projectResources.js` | 1884276 | `e0180c2a41e4f8103e2a6b5a5ab6e8be7eb3d1e97e331b2b18de2969d60b7b43` |

The copy read here is the same file the #123 capture hashed: the sha256 above equals the one in its "Files fetched" table. The bytes and the sha256 were measured again on the copy read here, with `fs.statSync` and `sha256sum`. They match the #123 capture.

The comparison function `hM` is not in this file. It is in `main.js`, and the #123 capture records it (section 2 below quotes that record).

## How the excerpts were extracted

The bundle is a very long single line. The file was read as text only, never run, imported or loaded as a module:

- A Node script, kept in a different directory from the downloaded file, reads the file with `fs.readFileSync(path, "utf8")`.
- It finds a start needle with `String.prototype.indexOf`, finds the end needle after it, and slices the text between them. The "character offset" given with each excerpt is that `indexOf` result: a JavaScript string index, counted in UTF-16 code units from the start of the file.
- The script writes the slice into this file without retyping it. The needle is given with each excerpt, so a reader can repeat the search with `indexOf` or `grep -F`.
- No excerpt was changed. The script checked that every excerpt holds only printable ASCII characters.
- The six lookup bodies in section 1 are each one unbroken span. Each was checked to occur exactly once in the file.

---

## 1. The six duplicate-name lookups

Each section of the project has one "is this name used?" method, and one "find the item with this name" method behind it. The method names are minified and belong to the project class.

### 1.1 Layouts

Observed: the probe is lowercased with `toLowerCase()`, then compared with each layout name through `hM`. The first match is returned.

Source: projectResources.js, character offset 819035 (first `indexOf` match of the start needle); 133 characters.
Start needle: `Jpt(t){$y.bp(t),t=t.toLowerCase()`
End needle (included): `!!this.Jpt(t)}`

```
Jpt(t){$y.bp(t),t=t.toLowerCase();for(let s of this.ZD())if($y.hM(t,s.gh()))return s;return null}HU(t){return $y.bp(t),!!this.Jpt(t)}
```

### 1.2 Event sheets

Observed: the same shape as layouts. The probe is lowercased, then compared through `hM`.

Source: projectResources.js, character offset 819421 (first `indexOf` match of the start needle); 133 characters.
Start needle: `Qpt(t){$y.bp(t),t=t.toLowerCase()`
End needle (included): `!!this.Qpt(t)}`

```
Qpt(t){$y.bp(t),t=t.toLowerCase();for(let s of this.x6())if($y.hM(t,s.gh()))return s;return null}JU(t){return $y.bp(t),!!this.Qpt(t)}
```

### 1.3 Timelines

Observed: the probe is not changed. Each timeline name is compared with `===`.

Source: projectResources.js, character offset 840558 (first `indexOf` match of the start needle); 112 characters.
Start needle: `O$(t){return $y.bp(t),!!this.q4s(t)}`
End needle (included): `return null}`

```
O$(t){return $y.bp(t),!!this.q4s(t)}q4s(t){$y.bp(t);for(const s of this.ND())if(t===s.gh())return s;return null}
```

### 1.4 Flowcharts

Observed: exact `===`, with no case folding and no normalization.

Source: projectResources.js, character offset 842907 (first `indexOf` match of the start needle); 113 characters.
Start needle: `Y$(t){return $y.bp(t),!!this.Ypt(t)}`
End needle (included): `return null}`

```
Y$(t){return $y.bp(t),!!this.Ypt(t)}Ypt(t){$y.bp(t);for(const s of this.Llt())if(t===s.gh())return s;return null}
```

### 1.5 Models 3D

Observed: exact `===`.

Source: projectResources.js, character offset 843645 (first `indexOf` match of the start needle); 112 characters.
Start needle: `vG(t){return $y.bp(t),!!this.xVt(t)}`
End needle (included): `return null}`

```
vG(t){return $y.bp(t),!!this.xVt(t)}xVt(t){$y.bp(t);for(const s of this.sr())if(t===s.gh())return s;return null}
```

### 1.6 Object classes (object types and families)

Observed: one map, `QCn`, answers for object types and families together. The probe is normalized with `normalize()` (NFC) and lowercased, then looked up as a key with `Map.prototype.has`. There is no loop and no `hM`.

Source: projectResources.js, character offset 825411 (first `indexOf` match of the start needle); 64 characters.
Start needle: `lU(t){return $y.bp(t),this.QCn.has(`
End needle (included): `toLowerCase())}`

```
lU(t){return $y.bp(t),this.QCn.has(t.normalize().toLowerCase())}
```

The map is created in the project constructor:

Source: projectResources.js, character offset 799977 (first `indexOf` match of the start needle); 33 characters.
Start needle: `this.QCn=new Map,`
End needle (included): `this.tEn=new Map`

```
this.QCn=new Map,this.tEn=new Map
```

Observed: the writers of `QCn` are recorded in the #123 capture, section 5.1 ("The map and its writers"). They are not derived again here. The same capture records, in its section 6.5, how object types and families share one base class.

---

## 2. The comparison function `hM`

`hM` is a static helper of one global class in `main.js`. The #123 capture holds this excerpt in its section 1.6 ("The case-insensitive comparison `hM`"). It is copied from that capture by the script, not retyped.

Source (as recorded there): main.js, character offset 86588 (first `indexOf` match of the start needle); 152 characters.
Start needle: `Lh.hM=function`

```
Lh.hM=function(t,i){return Lh.N8(t),Lh.N8(i),"string"==typeof t&&"string"==typeof i&&(t===i||t.normalize().toLowerCase()===i.normalize().toLowerCase())}
```

Observed: two strings are the same name when they are equal, or when their NFC forms are equal after `toLowerCase()`. The lookups in 1.1 and 1.2 reach it as `$y.hM`.

---

## 3. Which collection each lookup iterates

### 3.1 Layouts and event sheets

Observed: the two lookups iterate `ZD()` and `x6()`. Each returns the items of one folder tree of the project:

Source: projectResources.js, character offset 818960 (first `indexOf` match of the start needle); 75 characters.
Start needle: `xH(){return this.mEn}ZD(){`
End needle (included): `n_n(){return this.mEn.UFs()}`

```
xH(){return this.mEn}ZD(){return this.mEn.JD()}n_n(){return this.mEn.UFs()}
```

Source: projectResources.js, character offset 819346 (first `indexOf` match of the start needle); 75 characters.
Start needle: `TH(){return this.yEn}x6(){`
End needle (included): `Y_n(){return this.yEn.UFs()}`

```
TH(){return this.yEn}x6(){return this.yEn.JD()}Y_n(){return this.yEn.UFs()}
```

Observed: the tree behind `ZD()` is `this.mEn`, and the tree behind `x6()` is `this.yEn`. The project constructor creates them from two different classes (`aF` and `rF`):

Source: projectResources.js, character offset 800267 (first `indexOf` match of the start needle); 91 characters.
Start needle: `this.mEn=$y.m(self.aF,this,null)`
End needle (included): `this.yEn=$y.m(self.rF,this,null)`

```
this.mEn=$y.m(self.aF,this,null),this.wEn=null,this.gEn="",this.yEn=$y.m(self.rF,this,null)
```

Observed: the name generators call the lookups. The layout-name generator `lhn` calls `HU` and uses the string key `model.project.new-layout-name`. The event-sheet generator `Xan` calls `JU` and uses the key `model.project.new-event-sheet-name`. The helpers `xve` and `X_n` take the first item of `ZD()` and of `x6()`:

Source: projectResources.js, character offset 819168 (first `indexOf` match of the start needle); 112 characters.
Start needle: `lhn(){let t=1`
End needle (included): `return s}`

```
lhn(){let t=1,s="",e=fb("model.project.new-layout-name");do{s=e.replace("{0}",t),++t}while(this.HU(s));return s}
```

Source: projectResources.js, character offset 819554 (first `indexOf` match of the start needle); 117 characters.
Start needle: `Xan(){let t=1`
End needle (included): `return s}`

```
Xan(){let t=1,s="",e=fb("model.project.new-event-sheet-name");do{s=e.replace("{0}",t),++t}while(this.JU(s));return s}
```

Source: projectResources.js, character offset 819280 (first `indexOf` match of the start needle); 66 characters.
Start needle: `xve(){return $y.first(this.ZD())}`
End needle (included): `X_n(){return $y.first(this.x6())}`

```
xve(){return $y.first(this.ZD())}X_n(){return $y.first(this.x6())}
```

Observed: the constructor of the class that holds the layout items takes its name from `lhn`:

Source: projectResources.js, character offset 531205 (first `indexOf` match of the start needle); 128 characters.
Start needle: `window.h_=class t extends globalThis.fps{`
End needle (included): `this.qxt=this.rpt.lhn()`

```
window.h_=class t extends globalThis.fps{#I="auto";#re="trilinear";constructor(t){super(t),this.aAt=null,this.qxt=this.rpt.lhn()
```

Inferred: `ZD()` yields layouts and `x6()` yields event sheets. The evidence is the generator keys and the constructor above. The bundle names no class "layout" in these spans.

### 3.2 Timelines

Observed: `ND()` yields the items of the tree `this.FEn` that are instances of `nb`.

Source: projectResources.js, character offset 840117 (first `indexOf` match of the start needle); 58 characters.
Start needle: `*ND(){for(const t of this.FEn.JD())`
End needle (included): `(yield t)}`

```
*ND(){for(const t of this.FEn.JD())$y.By(t,nb)&&(yield t)}
```

Observed: the error texts of the folder-add guard in section 4.1 say "timeline", and the events it raises are `timelineadd`. That ties `O$` to timelines. The tree `this.FEn` is created by `$y.m(rb,this,null)` in the constructor excerpt in 3.1.

### 3.3 Flowcharts

Observed: `Llt()` yields the items of the tree `this.MEn` that are instances of `self.lG`.

Source: projectResources.js, character offset 842450 (first `indexOf` match of the start needle); 64 characters.
Start needle: `*Llt(){for(const t of this.MEn.JD())`
End needle (included): `(yield t)}`

```
*Llt(){for(const t of this.MEn.JD())$y.By(t,self.lG)&&(yield t)}
```

Observed: `window.lG` is defined in the block below. Its name setter throws `invalid flowchart name`, and the setter's duplicate guard calls `Y$`:

Source: projectResources.js, character offset 764028 (first `indexOf` match of the start needle); 248 characters.
Start needle: `window.lG=class t extends self.BF{constructor(t,s){`
End needle (included): `this.nIn=ly.m(self._pt,this,null)}`

```
window.lG=class t extends self.BF{constructor(t,s){ly.sP(t,self.US),ly.N8(s),super(t),this.aAt=null,this.qxt=this.rpt.eIn(s),this.fPe=!1,this.yFs="",this.Rv=2e4,this.jv=2e4,this.iIn=[],this.Zyt=ly.m(self.Sce,this),this.nIn=ly.m(self._pt,this,null)}
```

Source: projectResources.js, character offset 766486 (first `indexOf` match of the start needle); 337 characters.
Start needle: `k(t){ly.bp(t);const s=ly.aRi(t);if(this.qxt===s)return;if(!ly.rRi(s))throw new Error(`
End needle (included): `"projectobjectnamechange")}`

```
k(t){ly.bp(t);const s=ly.aRi(t);if(this.qxt===s)return;if(!ly.rRi(s))throw new Error(`invalid flowchart name '${t}'`);const e=this.Ie();if(!ly.hM(this.qxt,s)&&e.Y$(s))throw new Error(`flowchart name '${s}' already used`);this.qxt=s,this.mP(),e.mP(),e.QU(),e.eei(),cy._Rs(this,"flowchartnamechange"),cy.xq(this,"projectobjectnamechange")}
```

Observed: that setter compares the new name with the item's own current name through `hM` (`!ly.hM(this.qxt,s)`) and only then calls the exact lookup `Y$`.

### 3.4 Models 3D

Observed: `sr()` yields the items of the tree `this.jEn` that are instances of `self.SF`.

Source: projectResources.js, character offset 843094 (first `indexOf` match of the start needle); 63 characters.
Start needle: `*sr(){for(const t of this.jEn.JD())`
End needle (included): `(yield t)}`

```
*sr(){for(const t of this.jEn.JD())$y.By(t,self.SF)&&(yield t)}
```

Observed: `window.SF` is defined in the block below. The models3d folder-add method in section 4.2 checks `globalThis.SF` and throws `3D model already belongs to folder`.

Source: projectResources.js, character offset 254597 (first `indexOf` match of the start needle); 182 characters.
Start needle: `window.SF=class extends self.BF{`
End needle (included): `#Ct=null;`

```
window.SF=class extends self.BF{#lt="";#ct=null;#ut=new Map;#ft=new Map;#dt=new Map;#pt=new Map;#mt=null;#wt=!1;#gt="";#yt=null;#bt=null;#St=null;#vt=null;#Gt=null;#It=null;#Ct=null;
```

---

## 4. The folder-add guards that call the same lookups

Each of the four folder classes has an add method `eL`. Each calls the lookup of its section and throws an "already used" error. This is how an item is put into a folder.

**Not traced: whether project load reaches them.** The guards are quoted to show that the exact lookups are the ones the editor uses for these sections. Whether loading a project from disk runs through `eL` or through another path was not read.

### 4.1 Timelines

Source: projectResources.js, character offset 370704 (first `indexOf` match of the start needle); 233 characters.
Start needle: `eL(t){if(lr.Bt(t,cr),t.aAt)throw new Error("timeline already belongs to folder")`
End needle (included): `t.mP()}`

```
eL(t){if(lr.Bt(t,cr),t.aAt)throw new Error("timeline already belongs to folder");const s=t.gh();if(this.Ie().O$(s))throw new Error(`timeline name '${s}' already used`);t.aAt=this,super.eL(t),this.W9s(),ur.rai(t,"timelineadd"),t.mP()}
```

Observed: a second method `MFs` of the same class begins with the same `already belongs to folder` check and the same `this.Ie().O$(s)` call.

### 4.2 Models 3D

Source: projectResources.js, character offset 253349 (first `indexOf` match of the start needle); 243 characters.
Start needle: `eL(t,s=!0){if(bi.Bt(t,globalThis.SF)`
End needle (included): `t.mP()}`

```
eL(t,s=!0){if(bi.Bt(t,globalThis.SF),s=!!s,t.rFs())throw new Error("3D model already belongs to folder");if(this.rpt.vG(t.gh()))throw new Error(`3D model name '${t.gh()}' already used`);t.Z1s(this),super.eL(t),s&&Si.kRs(t,"model3dadd"),t.mP()}
```

### 4.3 Event sheets

Source: projectResources.js, character offset 586940 (first `indexOf` match of the start needle); 224 characters.
Start needle: `eL(t){if(Eu.Bt(t,_u),t.aAt)throw new Error("event sheet already belongs to folder")`
End needle (included): `t.mP()}`

```
eL(t){if(Eu.Bt(t,_u),t.aAt)throw new Error("event sheet already belongs to folder");if(this.rpt.JU(t.gh()))throw new Error(`event sheet name '${t.gh()}' already used`);t.aAt=this,super.eL(t),xu.JAs(t,"eventsheetadd"),t.mP()}
```

### 4.4 Flowcharts

Source: projectResources.js, character offset 794263 (first `indexOf` match of the start needle); 219 characters.
Start needle: `eL(t){if(jy.Bt(t,Ry),t.aAt)throw new Error("flowchart already belongs to folder")`
End needle (included): `t.mP()}`

```
eL(t){if(jy.Bt(t,Ry),t.aAt)throw new Error("flowchart already belongs to folder");if(this.rpt.Y$(t.gh()))throw new Error(`flowchart name '${t.gh()}' already used`);t.aAt=this,super.eL(t),Dy._Rs(t,"flowchartadd"),t.mP()}
```

---

## 5. Derived summary

| Section | Lookup | Comparison | Label |
|---|---|---|---|
| Layouts | `HU` over `Jpt` | probe lowercased, then `hM` against each name (equal, or NFC + lowercase equal): case-insensitive | Observed |
| Event sheets | `JU` over `Qpt` | the same as layouts | Observed |
| Object types and families | `lU` | one shared namespace, keyed by `normalize().toLowerCase()` | Observed |
| Timelines | `O$` over `q4s` | exact `===` | Observed |
| Flowcharts | `Y$` over `Ypt` | exact `===` | Observed |
| Models 3D | `vG` over `xVt` | exact `===` | Observed |

Observed: of the six, three fold case (layouts, event sheets, object classes) and three compare exactly (timelines, flowcharts, models 3D).

## 6. Correction note for `wiki/c3-domain-facts.md`

The wiki page states that "The timeline and models3d setters use the same comparison", meaning the same case-insensitive comparison as layouts. That reading was inferred from the setters' `hM` guard. The guard compares the new name with the item's own current name, so that a rename that only changes case is not refused. It is not the duplicate lookup.

The duplicate lookups for timelines and models 3D are `O$` and `vG` (1.3 and 1.5). They compare exactly. The reading in the wiki is wrong for the duplicate lookup. Observed in section 3.3: the flowchart setter has the same shape, with a case-insensitive `hM` guard in front of an exact lookup. The wiki line also says the flowchart case rule "was not re-read"; the exact lookup `Y$` in 1.4 answers it for the lookup.

Inferred: in a timeline, flowchart or models 3D folder, a rename from `a` to `A` passes the setter's guard, and a second item named `A` next to an item named `a` is not refused by the lookup. This was not run.

## 7. Fold order

Inferred: for layouts and event sheets, the code lowercases the probe first and then applies `hM`, which normalizes (NFC) and lowercases both sides. A library that folds once, with `normalize().toLowerCase()`, agrees with that for ASCII names and for names that are already in NFC. It is not proven to agree for all Unicode, because `toLowerCase()` before `normalize()` and after it can differ for some characters.

---

## 8. Not traced

- The releases r379 and r402. Only r495-2 was read for these lookups.
- Whether project load runs through these lookups or through `eL`. The guards in section 4 are quoted, and their callers on the load path were not read.
- Any run of the editor. Every statement above is from reading the bundle text.
- The fold order for non-ASCII names (section 7).
- Whether a hand-written NFD name in a section that compares exactly is normalized by the setter's `aRi` on load. `aRi` applies NFC (the #123 capture, section 1.5), but the load path was not traced.
