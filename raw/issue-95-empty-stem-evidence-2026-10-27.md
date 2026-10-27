# Issue #95 — empty-stem section item: C3 editor bundle evidence (capture)

**Captured:** 2026-10-27
**For:** GenvidTechnologies/c3source#95 (`isSectionItemName(".json")` returns `true`)
**Source:** the Construct 3 editor bundle, fetched from `https://editor.construct.net/r{NNN}/` (the permanently hosted per-release root; see `wiki/c3-domain-facts.md`, "Two evidence channels"). The question: does C3 ever write or load a section item whose name is the empty string, i.e. a file literally named `.json` under a name-section folder?
**Nature:** the verbatim minified source around each match, plus the commands that found it. The bundles are minified, so identifiers differ by release. Nothing below is a corpus scan; the corpus half is in the wiki page, not here.

---

## Files fetched

| Release | URL | Local name | sha256 |
|---|---|---|---|
| r495-2 | `https://editor.construct.net/r495-2/main.js` | `main.js` | `18c7a7cee194779da60deba01052a74ae57b8c038eadd0041932ced68794d10c` |
| r495-2 | `https://editor.construct.net/r495-2/projectResources.js` | `projectResources.js` | `e0180c2a41e4f8103e2a6b5a5ab6e8be7eb3d1e97e331b2b18de2969d60b7b43` |
| r402 | `https://editor.construct.net/r402/main.js` | `main-r402.js` | `2cd8e991618e93643e1b17cb42b3138737e347549fba1739bb11b70e57ac91be` |
| r402 | `https://editor.construct.net/r402/projectResources.js` | `pr-r402.js` | `c3baec07d3437624f68ad5f1dca46f5d6b9fe29775f9a4b060155442669e5a9e` |
| r379 | `https://editor.construct.net/r379/main.js` | `main-r379.js` | `1b0917ce9602297f05cf15d2cae875bf68effd90e77a7c9b8cf59e925a25df64` |
| r379 | `https://editor.construct.net/r379/projectResources.js` | `pr-r379.js` | `31011faa0f26370826b35b2edfd1b19ebad86f373c92383c5bae7955f313f83c` |

The r402 and r379 `projectResources.js` files were fetched with `curl -sS -m 60 -o <name> https://editor.construct.net/r402/projectResources.js` (HTTP 200, 1525296 and 1483391 bytes). The r495-2 release root is `r495-2`; the C3 versions recorded in this repo's pins are written `r495`, and the scanned manifests carry `49500`-style numbers.

## How the snippets were extracted

The bundles are one or two very long lines, so a plain `grep -o` with a leading `.{0,N}` context is pathologically slow (one such command ran past the 120 s tool timeout). A small Node helper was used instead: read the file, `indexOf(needle)`, print `before` characters of leading context and `after` characters of trailing context, for the first N hits. Equivalent to:

```
grep -oE '.{0,200}invalid layout name.{0,120}' projectResources.js
```

The needles were: `invalid layout name`, `invalid event sheet name`, `invalid timeline name`, `invalid flowchart name`, `invalid model 3d name` (r495-2); `layout name '${e}' already used`, `event sheet name '${e}' already used`, `timeline name '${e}' already used`, `flowchart name` (r379, r402); `[...t.normalize()];return!(` and `.normalize()` (the validator); `+".json"` (the loader).

## 1. The name validator rejects an empty name

The validator is the static method every section's name setter calls. The same global class is bound in each section's file: `var cp=self.m` in r379 `main.js`, `var Yo=self.m` in r402 `main.js`, `const Ah=self.t` in r495-2 `main.js`; and in the matching `projectResources.js` the setters hold `var OJ=self.m` (r379), `var aJ=self.m` (r402), `const pc=globalThis.t` (r495-2).

### r495-2 (`main.js`)

Needle `Ah.rRi=function`:

```
Ah.rRi=function(t){if(Ah.bp(t),!t)return!1;const i=[...t.normalize()];return!(i.length>=Fh)&&(!i.some(t=>kh.has(t))&&(!Oh.has(i[0])&&!Ah.hRi(i[0])&&(!Dh.has(i.at(-1))&&!Ah.hRi(i.at(-1))&&!Ah.oRi(t))))},Ah.aRi=function(t,i=!0){Ah.bp(t);const e=[...t.normalize()];if(Ah.ote(e,t=>kh.has(t)),i)for(;e.length&&(Dh.has(e.at(-1))||Ah.hRi(e.at(-1)));)e.
```

The constants (needle `Fh=200`, context before):

```
{const Ah=self.t,Rh=new Set(["con","prn","aux","nul","com1","com2","com3","com4","com5","com6","com7","com8","com9","lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"]),kh=new Set(["\\","/",":","*","?",'"',"<",">","|","~"]),Oh=new Set(["."]),Dh=new Set(["."]),Fh=200
```

Reading: `if(...,!t)return!1` rejects the empty string first; then length `>= 200`, any of `\ / : * ? " < > | ~`, a leading or trailing `.`, the `hRi` helper on the first and last character (not traced), and a device name (`oRi` over `Rh`).

### r402 (`main.js`)

Needle `[...d.normalize()];return`:

```
Yo.fad=function(){return 200};Yo.Ws=function(d){Yo.A(d);if(!d)return!1;const e=[...d.normalize()];return 200<=e.length||e.some(f=>lsa.has(f))||msa.has(e[0])||Yo.LQ(e[0])||nsa.has(e.at(-1))||Yo.LQ(e.at(-1))||Yo.m6(d)?!1:!0};
```

Constants, needle `msa=new`:

```
var Yo=self.m,ksa=new Set("con prn aux nul com1 com2 com3 com4 com5 com6 com7 com8 com9 lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9".split(" ")),lsa=new Set('\\/:*?"<>|~'.split("")),msa=new Set(["."]),nsa=new Set(["."]);Yo.fad=fu
```

### r379 (`main.js`)

Needle `[...d.normalize()];return`:

```
cp.G4c=function(){return 200};cp.ks=function(d){cp.A(d);if(!d)return!1;const e=[...d.normalize()];return 200<=e.length||e.some(f=>Vqa.has(f))||Wqa.has(e[0])||Xqa.has(e.at(-1))||cp.C4(d)?!1:!0};
```

Constants, needle `Wqa=`:

```
com9 lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9".split(" ")),Vqa=new Set('\\/:*?"<>|~'.split("")),Wqa=new Set(["."]),Xqa=new Set(["."," "]);cp
```

The empty check `if(!d)return!1` is present, with the same shape, at all three releases. (Only the leading/trailing whitespace rule differs: r379's trailing set is `[".", " "]`, r495-2 and r402 add a further helper call on the first and last character, `hRi` and `LQ` respectively, which was not traced.)

## 2. Each traced section's name setter calls the validator and throws

### r495-2 (`projectResources.js`), the message names the section

Layouts (needle `invalid layout name`):

```
k(t){pc.bp(t);const s=pc.aRi(t);if(this.qxt===s)return;if(!pc.rRi(s))throw new Error(`invalid layout name '${t}'`);const e=this.Ie();if(!pc.hM(this.qxt,s)&&e.HU(s))throw new Error(`layout name '${s}' already used`);this.qxt=s
```

Event sheets (needle `invalid event sheet name`):

```
k(t){vu.bp(t);const s=vu.aRi(t);if(this.qxt===s)return;if(!vu.rRi(s))throw new Error(`invalid event sheet name '${t}'`);const e=this.Ie();if(!vu.hM(this.qxt,s)&&e.JU(s))throw new Error(`event sheet name '${s}' already used`);this.
```

Timelines (needle `invalid timeline name`):

```
k(t){zn.bp(t);const s=zn.aRi(t);if(this.qxt===s)return;if(!zn.rRi(s))throw new Error(`invalid timeline name '${t}'`);if(!zn.hM(this.qxt,s)&&this.Ie().O$(s))throw new Error(`timeline name '${s}' already used`);this.qxt=s;const e
```

Flowcharts (needle `invalid flowchart name`):

```
k(t){ly.bp(t);const s=ly.aRi(t);if(this.qxt===s)return;if(!ly.rRi(s))throw new Error(`invalid flowchart name '${t}'`);const e=this.Ie();if(!ly.hM(this.qxt,s)&&e.Y$(s))throw new Error(`flowchart name '${s}' already used`);this.qx
```

Models3d (needle `invalid model 3d name`):

```
k(t){vi.bp(t);const s=vi.aRi(t);if(this.#lt===s)return;if(!vi.rRi(s))throw new Error(`invalid model 3d name '${t}'`);const e=this.Ie();if(!vi.hM(this.#lt,s)&&e.vG(s))throw new Error(`model 3d name '${s}' already used`);this.#lt
```

### r402 (`projectResources.js`), the message is the generic `"invalid name"`

Layouts (needle `layout name '${e}' already used`):

```
this.ua}fb(e){aJ.A(e);
e=aJ.Ho(e);if(this.ua!==e){if(!aJ.Ws(e))throw Error("invalid name");var f=this.H();if(!aJ.ke(this.ua,e)&&f.$Da(e))throw Error(`layout name '${e}' already used`);this.ua=e;this.V();f.V();f.Fz();f.gF(
```

Event sheets (needle `event sheet name '${e}' already used`):

```
this.ua)}fb(e){mJ.A(e);e=mJ.Ho(e);if(this.ua!==e){if(!mJ.Ws(e))throw Error("invalid name");var f=this.H();if(!mJ.ke(this.ua,e)&&f.cSa(e))throw Error(`event sheet name '${e}' already used`);this.ua=e;this.V();f.V();f.Fz();f.gF(
```

Timelines (needle `timeline name '${e}' already used`):

```
}G(){return this.ua}fb(e){S.A(e);e=S.Ho(e);if(this.ua!==e){if(!S.Ws(e))throw Error("invalid name");
if(!S.ke(this.ua,e)&&this.H().zra(e))throw Error(`timeline name '${e}' already used`);this.ua=e;e=this.H();e.hta();this.V()
```

Flowcharts (needle `flowchart name`):

```
 this.ua}fb(e){EK.A(e);e=EK.Ho(e);if(this.ua!==e){if(!EK.Ws(e))throw Error("invalid name");var f=this.H();if(!EK.ke(this.ua,e)&&f.dSa(e))throw Error(`flowchart name '${e}' already used`);this.ua=e;this.V(
```

Models3d: the string `model3d`, `models3d` and `model 3d` (case-insensitive, `grep -ciE "model ?3d|models3d"`) occur **0** times in the r402 and r379 `projectResources.js`.

### r379 (`projectResources.js`), the message is the generic `"invalid name"`

Layouts (needle `layout name '${e}' already used`):

```
this.ra}jb(e){OJ.A(e);
e=OJ.Pp(e);if(this.ra!==e){if(!OJ.ks(e))throw Error("invalid name");var f=this.H();if(!OJ.he(this.ra,e)&&f.nBa(e))throw Error(`layout name '${e}' already used`);this.ra=e;this.T();f.T();f.Zy();f.fE(
```

Event sheets (needle `event sheet name '${e}' already used`):

```
this.ra)}jb(e){ZJ.A(e);e=ZJ.Pp(e);if(this.ra!==e){if(!ZJ.ks(e))throw Error("invalid name");var f=this.H();if(!ZJ.he(this.ra,e)&&f.ePa(e))throw Error(`event sheet name '${e}' already used`);this.ra=e;this.T();f.T();f.Zy();f.fE(
```

Timelines (needle `timeline name '${e}' already used`):

```
){return this.ra}jb(e){GH.A(e);e=GH.Pp(e);if(this.ra!==e){if(!GH.ks(e))throw Error("invalid name");if(!GH.he(this.ra,e)&&this.H().Xoa(e))throw Error(`timeline name '${e}' already used`);this.ra=e;e=this.H();e.Fqa();this.T()
```

Flowcharts (needle `flowchart name`):

```
 this.ra}jb(e){qL.A(e);e=qL.Pp(e);if(this.ra!==e){if(!qL.ks(e))throw Error("invalid name");var f=this.H();if(!qL.he(this.ra,e)&&f.fPa(e))throw Error(`flowchart name '${e}' already used`);
this.ra=e;this.T
```

Models3d: absent from both the r379 and r402 `projectResources.js` (0 matches, above), so the section is **not traceable at those releases**: it was traced at r495-2 only.

## 3. The loader reads the manifest's items, it does not enumerate the disk

r495-2 `projectResources.js`, needle `+".json"`. The write path (`e1t`, the section item's own file path) is `folder + name + ".json"`:

```
e1t(){return this.aAt.xFs()+this.gh()+".json"}pUs(t,s){}mUs(t){this.yFs!==this.e1t()&&(this.yFs&&(t.add(this.yFs),this.pUs(t,this.yFs)),this.yFs=this.e1t())}
```

Models3d, same shape (plus `.uistate.json` beside it):

```
e1t(){return this.#ct.xFs()+this.gh()+".json"}mUs(t){if(this.#gt!==this.e1t()){if(this.#gt){t.add(this.#gt),t.add(vi.fRi(this.#gt,"uistate.json"));const s=this.sE().
```

The read path takes the name from the manifest (timelines shown):

```
static async s7s(s,e,i){zn.Bt(s,self.yF),zn.Bt(i,zn.tFs);const n=s.Ie();let r;r=n.XGs()<30900?"timelines\\"+e.toLowerCase():s.xFs()+e;const h=zn.m(t,n),o=await i.q1i(r+".json");await h.BO(o);const a=r+".uistate.json";if(await i.sFs(a)){const t=await i.q1i(a);h.RL(t)}return h.PFs(r+".json"),h}
```

Models3d (`Q1s`) has the same shape. For objectTypes and families the loader passes the manifest name and then checks it against the file's own `name`:

```
static async TBs(t,s,e){at.Bt(t,self.uF),at.Bt(e,at.tFs);const i=t.Ie();let n;n=i.XGs()<30900?"objectTypes\\"+s.toLowerCase():t.xFs()+s;const r=await e.q1i(n+".json");if(r.name!==s)throw new Error(`unexpected object type name '${r.name}'`);const h=at.Lt.ww(r["plugin-id"],i).GR(i,s);re
```

```
static async qBs(s,e,i){St.Bt(s,self.mF),St.Bt(i,St.tFs);const n=s.Ie();let r;r=n.XGs()<30900?"families\\"+e.toLowerCase():s.xFs()+e;const h=await i.q1i(r+".json");if(h.name!==e)throw new Error(`unexpected family name '${h.name}'`);const o=St.Lt.ww(h["plugin-id"],n),a=St.m(t,n,o,e)
```

Each loader shown opens `folder + <manifest item name> + ".json"`, and none of them lists the folder. So, on these loaders, a `.json` file that no manifest item names is not opened by the editor, and the only way to open `layouts/.json` would be a manifest item `""` (see the gaps below).

## 4. What was not traced (stated gap)

- **objectTypes and families name setters.** Their loaders (section 3) were read, and the `name`-equals-manifest-name check is a partial argument. The setters that decide whether `""` is a valid object type or family name were **not** traced. In the r379 and r402 `projectResources.js` several `throw Error("invalid name")` sites use a different, object-class-specific sanitiser (`self.Ed.zr(f,!1)` at r379, `self.Md.cs(f,!1)` at r402) and in some of them an empty result throws, which is suggestive but was not tied to the objectTypes or families setter, so it is **not claimed** as evidence.
- **models3d at r379 and r402**: the section does not exist in those bundles.
- **Whether a manifest item declared as `""` aborts project open.** The loader would compute `folder + "" + ".json"`, which names a real file `layouts/.json`. Nobody ran the editor on such a project. This is a live-editor question, not a bundle one.
- **The editor writes** (rather than loads) a nameless item: the setters above show it refuses to be given one; no save path that builds an item name outside those setters was searched for.
