# Issue #100 — empty-name section item opened in the live C3 editor (capture)

**Captured:** 2026-10-28
**For:** GenvidTechnologies/c3source#100 (what the live Construct 3 editor does with a section item whose name is the empty string)
**Source:** a live Construct 3 editor run by the maintainer, on copies of the `construct3-sample` project (the c3source submodule, gitlink `fe53059`, tag v1.2.0, `savedWithRelease` 49502), opened with Menu, Project, Open, Open local project folder in Chrome 155.0.8059.85 on Windows 11. The copies were built and checked with the two scripts embedded below.
**Nature:** the maintainer's observations as reported during the session, the error text they pasted, and the disk state read back after each save. Quoted text is verbatim from the maintainer, spelling included. This is the live-editor half of the question; the bundle half is in `raw/issue-95-empty-stem-evidence-2026-10-27.md`, whose last section ("What was not traced") lists "Whether a manifest item declared as `""` aborts project open" as a live-editor question. This capture answers that question and nothing else.

**Editor release:** Construct 3 r506.3 (stable) for every result below, except where a row says r495.2.

---

## Setup

- Each variant adds ONE new root-level item named `""` to one manifest section, stored at `<section>/.json` with `"name": ""`. The manifest lists `""` among that section's items.
- Each new item is a minimal copy of an existing item with every sid regenerated:
  - layout: from `Templates Layout` (instances stripped, layers made non-global, nonworld-instances emptied);
  - event sheet: from `Event sheet 2` (events emptied);
  - timeline: from `Timeline 1` (unchanged apart from the name);
  - flowchart: from `Flowchart 1` (nodes emptied);
  - object type: from `Text` (instance variables, behaviours, effects emptied);
  - family: from `TextFamily` (variables, behaviours, effects emptied, members `["Text"]`).
- `models3d` is empty in the sample and was not tested.
- `control` adds the same six copies under valid names `Zz Control <section>` (with spaces). `control-2` (built later with `--control-only control-2`) adds them as `ZzControlLayouts`, `ZzControlEventSheets`, `ZzControlTimelines`, `ZzControlFlowcharts`, `ZzControlObjectTypes`, `ZzControlFamilies` (no spaces).
- The copies were first built under the scratchpad directory in AppData. The maintainer reported: "C3 cannot open "system files", i.e. files under AppData." They were moved to `C:\Users\FabienNinoles\Documents\c3-issue-100\` and re-verified there (62 of 62 checks passing).

## Maintainer's terminology (verbatim)

"Note: crashed means the editor shows a crash dialog and I have to restart it. failed means an error dialog appear, and I can find an error in the web console, but the editor stays in the same state as before the opening."

The outcome column below uses these two words in that sense, plus `opened`.

## Editor releases

The editor updated itself mid-session. The first eventSheets run's error report says r495.2 (17:35:54 EDT). The layouts error report says r506.3 (17:40:00 EDT). The maintainer: "They were all open under the latest stable release, r506.3" (families, flowcharts, objectTypes, timelines). eventSheets was re-run on r506.3. The first `control` save left `savedWithRelease` at 49502, so it was saved from r495.2. The flowcharts and objectTypes saves wrote `savedWithRelease` 50603.

## Results

| Section or copy | Release | Outcome | Observed | After a save |
|---|---|---|---|---|
| layouts | r506.3 | crashed | Error report: `Type: unhandled rejection`, `Reason: Error: invalid layout name ''`, stack `t.k`, `t.Hp`, `t.r2s` in `https://editor.construct.net/r506-3/projectResources.js`; `Construct version: r506.3` | not saved |
| eventSheets | r495.2 then r506.3 | crashed (both runs) | r495.2 error report: `Type: unhandled rejection`, `Reason: Error: invalid event sheet name ''`, stack `t.k`, `t.BO`, `Object.Wwi` in `r495-2/projectResources.js`, then `af`, `of` in `r495-2/main.js`; `Construct version: r495.2`. Re-run on r506.3, maintainer: "crashing on open: invalid event sheet name """ | not saved |
| timelines | r506.3 | failed | Maintainer: "failed with error: invalid timeline name ''" | not saved |
| flowcharts | r506.3 | opened | Maintainer: "Flowchart has an empty name (no name next to the icon, property 'Name' is empty)" | Saved after a small change and revert ("Nothing changes, so I had to do a small change myself and revert it before saving."). `savedWithRelease` became 50603 and the whole project was rewritten; the manifest still declares `""` under flowcharts and `flowcharts/.json` is still present, contents unchanged (`"name": ""`). Re-opened: "flowcharts open successfully, with still the flowchart with an empty name." |
| objectTypes | r506.3 | opened | Maintainer: "objecttype seems to have no new objecttype. so my guess the object type was dropped." | Saved after the same change and revert. `savedWithRelease` became 50603; the manifest's objectTypes root items lost `""` and gained `"Text3"`; `objectTypes/.json` was deleted and no `objectTypes/Text3.json` was written. Re-opened: "objectTypes failed with error about Text3" |
| families | r506.3 | failed | Maintainer: "failed to open with console error: invalid name"; asked for the exact line: "failed to open: Error: invalid name" | not saved |
| control | r495.2 | opened | Maintainer: "open fine but required saving." Later: "Upon opening, the saving icon was active, allowing to save." | Saved. Only `project.c3proj` and `project.uistate.json` were rewritten; `savedWithRelease` still 49502. The manifest now lists `ZzControlObjectTypes` and `ZzControlFamilies` (spaces removed) where the build wrote `Zz Control objectTypes` and `Zz Control families`; the other four kept their spaced names. `objectTypes/Zz Control objectTypes.json` and `families/Zz Control families.json` were deleted and no file under the new names was written. Re-opening failed: "the project is no longer valid and fail to open with 3 errors"; console: `Failed to read file 'objectTypes\ZzControlObjectTypes.json':  NotFoundError: A requested file or directory could not be found at the time an operation was processed.` (twice) and `[Project] Exception opening:  NotFoundError: A requested file or directory could not be found at the time an operation was processed.` |
| control-2 | r506.3 | opened | Maintainer: "Yes, all 6 items present." | not reported |

## Observation versus inference

- Observed: the objectTypes copy opened with no visible new object type; after a save the manifest held `"Text3"` in place of `""`, `objectTypes/.json` was gone and no `objectTypes/Text3.json` existed; re-opening failed with an error about `Text3`.
- Inference (not observed directly, drawn from the disk state): on load the editor renamed the nameless object type to the next free name for its plugin (`Text` and `Text2` exist, so `Text3`), which is why it was not noticed as new; the save then lost its file, the same failure as the `control` copy's renamed object type. No editor-side code was read to confirm the rename.

## Maintainer's judgement (verbatim)

Quoted as said, not as a finding of this capture:

> "Note: I would still consider a flowchart with an empty name a kind of bad idea."

## Not established

- `models3d`: not tested (empty in the sample).
- The save-icon state of `control-2` on open was not reported.
- The full text of the timelines error, and whether timelines was a crash or a failure: the maintainer wrote "failed with error", which is recorded above as failed.

## Scripts

Both were run from the session scratchpad. `build-variants.mjs` was invoked as `node build-variants.mjs <sourceProjectDir> <outDir>` (and with `--control-only control-2` for the second control); `verify-variants.mjs` as `node verify-variants.mjs <sourceProjectDir> <outDir>` (62 checks, all passing). The verifier only checks the first `control` naming scheme.

### build-variants.mjs

```js
// Builds the #100 experiment copies of construct3-sample/project.
// Each variant adds ONE new root-level item named "" to one manifest section,
// stored at <section>/.json. The control adds the same six new items under
// valid names. New items are minimal copies of an existing item with every
// sid regenerated, so nothing else in the project references them.
// Usage: node build-variants.mjs <sourceProjectDir> <outDir>
import fs from "node:fs";
import path from "node:path";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: build-variants.mjs <sourceProjectDir> <outDir>");
if (fs.existsSync(out)) throw new Error(`refusing to overwrite ${out}`);

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, "\t"));

// Collect every sid already in the project, so new ones never collide.
const used = new Set();
(function scan(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) scan(p);
		else if (/\.(json|c3proj)$/.test(e.name)) {
			for (const m of fs.readFileSync(p, "utf8").matchAll(/"sid":\s*(\d+)/g)) used.add(m[1]);
		}
	}
})(src);
function freshSid() {
	for (;;) {
		const s = String(100000000000000 + Math.floor(Math.random() * 899999999999999));
		if (!used.has(s)) return used.add(s), Number(s);
	}
}
function resid(v) {
	if (Array.isArray(v)) return v.forEach(resid);
	if (v && typeof v === "object") {
		for (const k of Object.keys(v)) {
			if (k === "sid" && typeof v[k] === "number") v[k] = freshSid();
			else resid(v[k]);
		}
	}
}
function stripLayer(layer) {
	layer.instances = [];
	layer.global = false;
	(layer.subLayers || []).forEach(stripLayer);
}

// section -> [source file, how to make the copy minimal]
const SECTIONS = {
	layouts: ["layouts/Templates Layout.json", (o) => { o.layers.forEach(stripLayer); o["nonworld-instances"] = []; }],
	eventSheets: ["eventSheets/UI/Event sheet 2.json", (o) => { o.events = []; }],
	timelines: ["timelines/Timeline 1.json", () => {}],
	flowcharts: ["flowcharts/Flowchart 1.json", (o) => { o.nodes = []; }],
	objectTypes: ["objectTypes/Text.json", (o) => { o.instanceVariables = []; o.behaviorTypes = []; o.effectTypes = []; }],
	families: ["families/TextFamily.json", (o) => { o.instanceVariables = []; o.behaviorTypes = []; o.effectTypes = []; o.members = ["Text"]; }],
};

function addItem(projDir, section, name) {
	const [rel, minimise] = SECTIONS[section];
	const item = read(path.join(projDir, rel));
	minimise(item);
	resid(item);
	item.name = name;
	write(path.join(projDir, section, name + ".json"), item);
	const manifestPath = path.join(projDir, "project.c3proj");
	const m = read(manifestPath);
	m[section].items.push(name);
	write(manifestPath, m);
}

fs.mkdirSync(out, { recursive: true });
const copy = (name) => {
	const d = path.join(out, name);
	fs.cpSync(src, d, { recursive: true });
	return d;
};
// "--control-only <name>": build just a control copy whose names carry no space
// (object type and family names may not contain one; the editor renames them).
if (process.argv[4] === "--control-only") {
	const control = copy(process.argv[5]);
	for (const section of Object.keys(SECTIONS)) addItem(control, section, `ZzControl${section[0].toUpperCase()}${section.slice(1)}`);
	console.log("built control-only copy", process.argv[5], "under", out);
} else {
	for (const section of Object.keys(SECTIONS)) addItem(copy(section), section, "");
	const control = copy("control");
	for (const section of Object.keys(SECTIONS)) addItem(control, section, `Zz Control ${section}`);
	console.log("built", Object.keys(SECTIONS).length + 1, "copies under", out);
}
```

### verify-variants.mjs

```js
// Verifies the #100 copies built by build-variants.mjs.
// Usage: node verify-variants.mjs <sourceProjectDir> <outDir>
import fs from "node:fs";
import path from "node:path";

const [src, out] = process.argv.slice(2);
const SECTIONS = ["layouts", "eventSheets", "timelines", "flowcharts", "objectTypes", "families"];
const readText = (p) => fs.readFileSync(p, "utf8");
let failures = 0;
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failures++; };

const srcManifestText = readText(path.join(src, "project.c3proj"));
check(JSON.stringify(JSON.parse(srcManifestText), null, "\t") === srcManifestText, "source manifest round-trips byte-identically (rewrite changes only the added item)");
const srcManifest = JSON.parse(srcManifestText);

function allSids(dir) {
	const sids = [];
	(function scan(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) scan(p);
			else if (/\.(json|c3proj)$/.test(e.name)) for (const m of readText(p).matchAll(/"sid":\s*(\d+)/g)) sids.push(m[1]);
		}
	})(dir);
	return sids;
}
const srcSidCount = allSids(src).length;
const dupes = (a) => a.length - new Set(a).size;
const srcDupes = dupes(allSids(src));

function checkCopy(name, expected) {
	const dir = path.join(out, name);
	const m = JSON.parse(readText(path.join(dir, "project.c3proj")));
	for (const section of SECTIONS) {
		const added = m[section].items.filter((i) => !srcManifest[section].items.includes(i));
		const want = expected[section];
		check(JSON.stringify(added) === JSON.stringify(want !== undefined ? [want] : []), `${name}: ${section} added items = ${JSON.stringify(added)}`);
		if (want !== undefined) {
			const file = path.join(dir, section, want + ".json");
			check(fs.existsSync(file) && JSON.parse(readText(file)).name === want, `${name}: ${path.relative(dir, file)} exists with "name": ${JSON.stringify(want)}`);
		}
	}
	const sids = allSids(dir);
	check(dupes(sids) === srcDupes, `${name}: no new duplicate sids (${sids.length - srcSidCount} added)`);
}

for (const section of SECTIONS) checkCopy(section, { [section]: "" });
checkCopy("control", Object.fromEntries(SECTIONS.map((s) => [s, `Zz Control ${s}`])));
console.log(failures ? `${failures} FAILED` : "all checks passed");
process.exitCode = failures ? 1 : 0;
```
