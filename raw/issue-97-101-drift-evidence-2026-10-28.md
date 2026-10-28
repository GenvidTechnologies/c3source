# Issues #97 and #101 — manifest drift evidence: transitions container and duplicate item names (capture)

**Captured:** 2026-10-28
**For:** GenvidTechnologies/c3source#97 (the `timelines` transitions container is falsely reported `folder-missing`) and #101 (`diffNameMaps` is last-writer-wins on duplicate item names)
**Source:** probe results and a corpus scan of `project.c3proj` files, run through `detectManifestDrift` from this repo's `src/`. Pre-fix results are from `main` at 5b71bd6. Post-fix results are from the working branch at commit 09edb93, after both fixes.
**Nature:** a corpus scan plus probe results, not an editor-bundle capture. Nothing here was fetched from `editor.construct.net`. The corpus is the dev machine's `C:\repos` tree, searched to depth <= 4 for `project.c3proj`. Several roots are copies of each other (the `bb-backup/previews` mirrors, and the canonical fixture, which is a copy of `construct3-sample/project`), which is why the post-fix scan dedupes by sha256 of the manifest bytes. **Do not quote any figure from a non-deduplicated count.** The only deduplicated figures are the post-fix ones below (24 unique of 31 found).

---

## Pre-fix behaviour (main 5b71bd6)

Probe: `detectManifestDrift` over tmpdir trees.

### #97: observable

| Case | Today's output |
|---|---|
| gcore fragment (`items:["Timeline"]`, one empty nameless subfolder), no `transitions/` | `inSync=false`, `folder-missing "transitions" ["transitions"]` |
| same, with an empty `transitions/` dir present | `inSync=true` |
| container lists `Ease1`, no dir | `missing Ease1 ["transitions"]` **and** `folder-missing ["transitions"]` |
| named `Other` under the container, no dir | `folder-missing ["transitions","Other"]` **and** `folder-missing ["transitions"]` |
| container dir present, named `Other` absent | only `folder-missing ["transitions","Other"]` |
| no container, empty `transitions/` on disk | `folder-untracked ["transitions"]` |
| no container, `transitions/E.json` on disk | `untracked E ["transitions"]` + `folder-untracked ["transitions"]` |
| nameless subfolder under `layouts` | `inSync=true`, unaffected |
| two nameless direct children of `timelines`, no dir | two identical `folder-missing ["transitions"]` |
| container present, no `timelines/` dir at all | `folder-missing ["transitions"]` |
| nameless folder nested inside the container | transparent, no drift |
| **named** `"transitions"` subfolder (no nameless one), no dir | `folder-missing ["transitions"]` (same shape as the bug) |
| named `"transitions"` + nameless container, no dir | two identical `folder-missing ["transitions"]` |

**Corpus claims** (`project.c3proj` under `C:\repos`, releases r379–r476; pre-fix survey):
- Every editor-saved manifest has exactly one nameless direct child of `timelines`.
- Every empty container has no `timelines/transitions/` dir, and every non-empty one has it.
- No manifest has two nameless containers or a named `"transitions"` subfolder.

**Readers of the drift result:**
- `ManifestDrift.inSync` (`sections.length === 0`).
- `C3Project.detectManifestDrift()`, which delegates.
- construct3-chef's `runSync`/`applyNameDrift`. Its `folder-missing` arm would delete the container. chef#310 is CLOSED (2026-10-28) with the local bridge `isTransitionsContainerFolderMissing` and tripwire `I310-T1`; #97 now gates the bridge's retirement. chef#333 (OPEN) covers manifests corrupted with a *named* `"transitions"` subfolder.

### #101: observable

`diffNameMaps` builds `Map<name, path>` per side, so the last writer wins. It has three callers: `detectManifestDrift` (name sections), `detectManifestDrift` (`rootFileFolders`), and `detectImageDrift` (always passes `[]` paths).

Name section (`layouts`):

| Manifest | Disk | Today | Correct reading |
|---|---|---|---|
| `X@a` | `a/X`, `b/X` | `moved X a→b` | `b/X` untracked |
| `X@b` | `a/X`, `b/X` | **`inSync=true`** | `a/X` untracked |
| `X@a`, `X@b` | `a/X` | `moved X b→a` | `b/X` missing |
| `X@a`, `X@b` | `b/X` | **`inSync=true`** | `a/X` missing |
| `X@a`, `X@b` | none | one `missing X ["b"]` | two missing |
| none | `a/X`, `b/X` | one `untracked X ["b"]` | two untracked |
| `X@a`, `X@b` | both | `inSync=true` | invariant violated, unreported |
| `X` listed twice in `a` | `a/X` | `inSync=true` | manifest duplicate in one folder, unreported |

`rootFileFolders.script` behaves the same way (spurious `moved`, missed entries, false `inSync=true`).

The output depends on walk order: manifest items are walked first then depth-first, and disk entries come from a sorted `readdirSync`.

`walkDiskFileTree` only recurses into declared subfolders.

Downstream: chef applies a spurious `moved`, then reports in sync while `a/X.json` stays undeclared.

Likelihood: the C3 setters throw "already used" (`raw/issue-95-empty-stem-evidence-2026-10-27.md`), so only hand- or tool-written trees and bad merges hit this.

### Pre-fix result on a real project (`C:/repos/burbank`)

Observed on `main` during planning by the orchestrator, using the `burbank-drift.mts` script below: `C:/repos/burbank` reported `[rootFileFolders.script] moved index.ts ["shared","economy"] → ["shared","utils"]`. This `moved` is spurious: the file exists in both folders on both sides, and `diffNameMaps` kept whichever walk visited last. This sentence is the whole pre-fix record; no output file was kept.

---

## Post-fix corpus scan (branch commit 09edb93)

The script ran against the real `src/` (`file:///C:/repos/c3source/src/c3source.ts`) after both fixes. It dedupes manifests by sha256 of the `project.c3proj` bytes, so a mirrored project is counted once.

### Script: `postfix-scan.mts`

```ts
// Post-fix corpus scan against the real src: dedupe manifests by content hash,
// then report the transitions-container shape, drift, and duplicates per unique manifest.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const lib: any = await import("file:///C:/repos/c3source/src/c3source.ts");

const roots: string[] = [];
function walk(d: string, depth: number) {
  if (depth > 4) return;
  let ents;
  try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (["node_modules", ".git", "dist"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isFile() && e.name === "project.c3proj") roots.push(d);
    else if (e.isDirectory()) walk(p, depth + 1);
  }
}
walk("C:/repos", 0);

const seen = new Map<string, string>();
const tot: Record<string, number> = {};
const bump = (k: string, n = 1) => (tot[k] = (tot[k] ?? 0) + n);
for (const r of roots.sort()) {
  const raw = readFileSync(path.join(r, "project.c3proj"), "utf8");
  const h = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  const rel = r.split(path.sep).join("/");
  bump("manifestsFound");
  if (seen.has(h)) { console.log(`dup-of ${seen.get(h)}  ${rel}`); continue; }
  seen.set(h, rel);
  bump("uniqueManifests");
  let m: any;
  try { m = JSON.parse(raw); } catch { bump("unparseable"); continue; }
  const subs = Array.isArray(m.timelines?.subfolders) ? m.timelines.subfolders : [];
  const nameless = subs.filter((s: any) => s.name === undefined);
  const named = subs.filter((s: any) => s.name === "transitions").length;
  const cont = nameless[0];
  const contEmpty = cont ? (cont.items?.length ?? 0) === 0 && (cont.subfolders?.length ?? 0) === 0 : null;
  const dirExists = existsSync(path.join(r, "timelines", "transitions"));
  if (nameless.length === 1) bump("oneContainer");
  if (nameless.length > 1) bump("multiContainer");
  if (named) bump("namedTransitions");
  if (contEmpty === true) bump(dirExists ? "emptyContainerDirPresent" : "emptyContainerDirAbsent");
  if (contEmpty === false) bump(dirExists ? "nonEmptyContainerDirPresent" : "nonEmptyContainerDirAbsent");
  let drift: any;
  try { drift = lib.detectManifestDrift(r, m); } catch (e: any) { bump("driftThrow"); console.log(`THROW ${rel}: ${e.message}`); continue; }
  const tfm = drift.sections
    .filter((s: any) => s.section === "timelines")
    .flatMap((s: any) => s.entries)
    .filter((e: any) => e.kind === "folder-missing" && (e.manifestPath ?? []).join("/") === "transitions").length;
  bump("transitionsFolderMissing", tfm);
  if (drift.inSync) bump("inSync");
  const dups = drift.duplicates ?? [];
  if (dups.length) bump("withDuplicates");
  bump("duplicateNames", dups.length);
  const kinds = drift.sections.map((s: any) => `${s.section}:${s.entries.length}`).join(",");
  console.log(
    `${m.savedWithRelease ?? "?"} ${rel} container=${nameless.length}${contEmpty === null ? "" : contEmpty ? "/empty" : "/nonempty"} dir=${dirExists} inSync=${drift.inSync} sections=[${kinds}] dups=${JSON.stringify(dups.map((d: any) => `${d.section}:${d.name}:${JSON.stringify(d.manifestPaths)}/${JSON.stringify(d.diskPaths)}`)).slice(0, 400)}`,
  );
}
console.log(JSON.stringify(tot));
```

### Output: `postfix-scan.txt` (verbatim)

```
39700 C:/repos/bb-backup/previews/archive-construct3-videoplayer-addon/sample container=1/empty dir=false inSync=false sections=[objectTypes:1] dups=[]
46602 C:/repos/bb-backup/previews/burbank container=1/nonempty dir=true inSync=false sections=[rootFileFolders.general:1,images:264] dups=[]
40702 C:/repos/bb-backup/previews/c3addon-gcore-video-plugin/sample container=1/empty dir=false inSync=true sections=[] dups=[]
38802 C:/repos/bb-backup/previews/c3addon-genvid-datadog-logs/sample container=1/empty dir=false inSync=true sections=[] dups=[]
40702 C:/repos/bb-backup/previews/c3addon-genvid-datadog-rum/sample container=1/empty dir=false inSync=false sections=[rootFileFolders.script:2] dups=[]
44902 C:/repos/bb-backup/previews/c3addon-genvid-epic-online-services/sample container=1/empty dir=false inSync=false sections=[rootFileFolders.general:1] dups=[]
44002 C:/repos/bb-backup/previews/c3addon-genvid-marketplace/sample container=1/empty dir=false inSync=true sections=[] dups=[]
44002 C:/repos/bb-backup/previews/c3addon-genvid-push-notification/sample container=1/empty dir=false inSync=true sections=[] dups=[]
40702 C:/repos/bb-backup/previews/c3addon-genvid-simpledropshadow/sample container=1/empty dir=false inSync=true sections=[] dups=[]
37900 C:/repos/bb-backup/previews/construct3-poc container=1/empty dir=false inSync=false sections=[rootFileFolders.script:6] dups=[]
47604 C:/repos/burbank container=1/nonempty dir=true inSync=true sections=[] dups=[]
49500 C:/repos/c3-domain-manager/test/fixtures/canonical container=1/nonempty dir=true inSync=true sections=[] dups=[]
49500 C:/repos/c3-regtest/no-effect container=1/nonempty dir=true inSync=true sections=[] dups=[]
37900 C:/repos/c3-tutorial container=1/empty dir=false inSync=true sections=[] dups=[]
47604 C:/repos/c3addon-gcore-video-plugin/sample container=1/empty dir=false inSync=true sections=[] dups=[]
dup-of C:/repos/bb-backup/previews/c3addon-genvid-datadog-logs/sample  C:/repos/c3addon-genvid-datadog-browser-logs/sample
dup-of C:/repos/bb-backup/previews/c3addon-genvid-datadog-rum/sample  C:/repos/c3addon-genvid-datadog-rum/sample
dup-of C:/repos/bb-backup/previews/c3addon-genvid-epic-online-services/sample  C:/repos/c3addon-genvid-epic-online-services/sample
dup-of C:/repos/bb-backup/previews/c3addon-genvid-marketplace/sample  C:/repos/c3addon-genvid-marketplace/sample
dup-of C:/repos/bb-backup/previews/c3addon-genvid-push-notification/sample  C:/repos/c3addon-genvid-push-notification/sample
dup-of C:/repos/bb-backup/previews/c3addon-genvid-simpledropshadow/sample  C:/repos/c3addon-genvid-simpledropshadow/sample
47604 C:/repos/c3addon-youtube-video-plugin/sample container=1/empty dir=false inSync=false sections=[rootFileFolders.script:1] dups=[]
49502 C:/repos/c3source/construct3-sample/project container=1/nonempty dir=true inSync=true sections=[] dups=[]
dup-of C:/repos/c3source/construct3-sample/project  C:/repos/c3source/test/fixtures/canonical
? C:/repos/construct3-chef/test/fixtures/addon-validate container=0 dir=false inSync=true sections=[] dups=[]
? C:/repos/construct3-chef/test/fixtures/addon-validate-lang container=0 dir=false inSync=true sections=[] dups=[]
49502 C:/repos/construct3-chef/test/fixtures/construct3-chef-sample container=1/nonempty dir=true inSync=true sections=[] dups=[]
39700 C:/repos/construct3-poc container=1/empty dir=false inSync=false sections=[rootFileFolders.script:3] dups=[]
49500 C:/repos/construct3-sample/project container=1/nonempty dir=true inSync=false sections=[layouts:2] dups=[]
47604 C:/repos/google/burbank container=1/nonempty dir=true inSync=false sections=[rootFileFolders.general:1] dups=[]
39700 C:/repos/ts-example container=1/empty dir=false inSync=false sections=[rootFileFolders.script:2] dups=[]
{"manifestsFound":31,"uniqueManifests":24,"oneContainer":22,"emptyContainerDirAbsent":14,"transitionsFolderMissing":0,"duplicateNames":0,"nonEmptyContainerDirPresent":8,"inSync":14}
```

### Reading the totals line

- 31 manifests found, 24 unique (7 are content-identical copies, the `dup-of` lines).
- 22 have exactly one nameless container (`oneContainer`).
- 14 have an empty container with no `timelines/transitions/` dir (`emptyContainerDirAbsent`), and 8 have a non-empty container with the dir present (`nonEmptyContainerDirPresent`).
- None has an empty container with the dir present, or a non-empty one with the dir absent (neither counter appears in the totals).
- `transitionsFolderMissing` is 0 after the fix. Before it, each of the 14 empty-container projects would have reported one `folder-missing ["transitions"]`, per the pre-fix #97 table (first row).
- `duplicateNames` is 0: no manifest in the corpus reports a duplicate name.
- Two manifests (construct3-chef `addon-validate` and `addon-validate-lang`) have no container at all (`container=0`). They carry no `savedWithRelease` (printed as `?`), so they are not editor-saved.
- The remaining `inSync=false` rows are unrelated to #97 and #101 (`rootFileFolders.*`, `images`, `objectTypes`, `layouts` entries); this scan does not characterise them.

---

## Post-fix check on one real project: burbank

### Script: `burbank-drift.mts`

```ts
const lib: any = await import("file:///C:/repos/c3source/src/c3source.ts");
for (const r of ["C:/repos/burbank", "C:/repos/bb-backup/previews/burbank"]) {
  const d = lib.detectManifestDrift(r);
  console.log("==", r, "inSync=", d.inSync, "strays=", d.strays?.length ?? 0);
  for (const s of d.sections) console.log("  [" + s.section + "]", s.entries.length, JSON.stringify(s.entries).slice(0, 600));
}
```

### Output: `burbank-drift-postfix.txt` (branch commit 09edb93)

The script itself truncates each section's entry JSON to 600 characters (`.slice(0, 600)`), so the 264-entry `images` list for `bb-backup/previews/burbank` is already cut off in the output below; it is unrelated stale preview drift, not part of #97 or #101. The output is otherwise verbatim.

```
== C:/repos/burbank inSync= true strays= 0
== C:/repos/bb-backup/previews/burbank inSync= false strays= 0
  [rootFileFolders.general] 1 [{"kind":"missing","name":"changelog.txt","manifestPath":[]}]
  [images] 264 [{"kind":"untracked","name":".gitattributes","diskPath":[]},{"kind":"untracked","name":"accepttosbuttonsprite-animation 1-000.png","diskPath":[]},{"kind":"untracked","name":"chestmodalnextbtnsprite-animation 1-000.png","diskPath":[]},{"kind":"untracked","name":"chyrontimer-animation 1-000.png","diskPath":[]},{"kind":"untracked","name":"claimgreenchest-animation 1-000.png","diskPath":[]},{"kind":"untracked","name":"claimrewardbox-animation 1-000.png","diskPath":[]},{"kind":"untracked","name":"currentstarlevel-1-000.png","diskPath":[]},{"kind":"untracked","name":"currentstarlevel-2-000.png","dis
```

`C:/repos/burbank` is `inSync=true` after the fix. Before it, the same script on `main` reported the spurious `moved index.ts ["shared","economy"] → ["shared","utils"]` recorded in the pre-fix section above.
