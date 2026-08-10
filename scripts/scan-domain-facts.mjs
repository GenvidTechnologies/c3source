// Corpus scanner for EIGHT exported C3 domain-fact tables (ADR 0008):
// EVENTVAR_REFERENCE_ACES, COMPARISON_OPERATORS, IMAGE_FILE_TYPE_EXTENSIONS,
// EDITOR_FIELD_RULES, EDITOR_LOCAL_EXCLUSIONS (via isEditorLocalPath),
// C3_MINIFIED_SOURCE_SUFFIXES (via isMinifiedSourcePath),
// SCRIPT_SOURCE_EXTENSIONS (via isScriptSourceName), and
// SCRIPT_FILE_TYPE_EXTENSIONS.
//
// Why this exists (durable asset, not scaffolding): ADR 0008's "Consequences"
// section (docs/decisions/0008-c3-domain-fact-tables.md:52-79) records that the
// seeding method for these tables FAILED TWICE during #60 — a small canonical
// fixture is a correctness oracle, not a coverage oracle, and even a 14-project
// corpus scan can validate an observed *value* while concealing that the value
// was actually a per-project *default* (the `"Functions"` incident). The rule
// that leaves: before pinning a value, ask what in C3 determines it, and
// re-validate on every C3 version bump against real, varied projects. This
// script is the mechanism — one scanner per version bump, not eight ad hoc ones.
//
// THE GOVERNING RULE this script is built around: the scanner reports
// PARTITIONS, the maintainer produces the VERDICT. Every classification below
// is either (a) a membership test against a table imported from `dist/` (never
// re-approximated here — see the `editorLocal`/`minified` probes, which import
// `isEditorLocalPath`/`isMinifiedSourcePath` themselves rather than re-deriving
// the exclusion rules), or (b) deliberately-dumb bucketing whose output a human
// reads. No probe concludes "this table is correct" — a probe bug must produce
// odd-looking evidence a human notices, never a silently-wrong conclusion baked
// into a table. This generalizes the rationale already written at
// `scripts/scan-references.mjs:64-72` for a single table (`C3_PSEUDO_OBJECT_CLASSES`):
// that scanner counts every raw occurrence, undeduped, specifically because a
// deduped view "would hide exactly the 'this name appears hundreds of times'
// signal that first surfaced `Functions`." Every probe here does the same:
// raw frequency, never a deduped or normalized view.
//
// Corpus confinement: all eight probes walk ONLY the canonical C3 source folders
// (derived from `C3_SECTION_FOLDERS` / `C3_ROOT_FILE_FOLDERS` / `IMAGES_FOLDER`),
// via the exported `find_all_files_path`. Most corpus repos have `project.c3proj`
// sitting at a *repo* root next to build output (e.g. `burbank-build-android/`,
// generated `.dsl.txt`, `html5/data.json`) — an unconfined tree walk drowns in
// that noise and, worse, can crash on non-JSON binary content.
//
// Every project block is headed with that project's `savedWithRelease`, and
// every roll-up finding is attributed to the release(s) it was observed in —
// that release attribution is what would have made the pre-r402 legacy
// `fileType` omission (see `C3_LEGACY_IMAGE_EXTENSION` in `src/manifest.ts`)
// legible as a version-mechanism fact rather than a plain value gap.
//
// It is dev-only and deliberately not wired into CI or `package.json` — see
// `scripts/api-surface.mjs` and `scripts/scan-references.mjs`, the two sibling
// dev scripts this one mirrors (structure, guard, per-project/roll-up shape).
//
// Usage: node scripts/scan-domain-facts.mjs <projectDir> [<projectDir> ...]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
if (!existsSync(distEntry)) {
  console.error(`scan-domain-facts: entry module does not exist: ${distEntry}`);
  console.error(`scan-domain-facts: did the build run?`);
  process.exit(1);
}

const {
  C3_MINIFIED_SOURCE_SUFFIXES,
  C3_ROOT_FILE_FOLDERS,
  C3_SECTION_FOLDERS,
  COMPARISON_OPERATORS,
  EDITOR_FIELD_RULES,
  EDITOR_LOCAL_EXCLUSIONS,
  EVENTVAR_REFERENCE_ACES,
  IMAGES_FOLDER,
  IMAGE_FILE_TYPE_EXTENSIONS,
  PROJECT_MANIFEST_FILE,
  SCRIPT_FILE_TYPE_EXTENSIONS,
  SCRIPT_SOURCE_EXTENSIONS,
  comparisonSymbol,
  find_all_files_path,
  hasActions,
  hasConditions,
  isEditorLocalPath,
  isGeneratedScriptOutput,
  isMinifiedSourcePath,
  isScriptSourceName,
  readProjectManifest,
  readSourceDocs,
  visitEvents,
} = await import("../dist/index.js");

const projectDirs = process.argv.slice(2);
if (projectDirs.length === 0) {
  console.error("usage: node scripts/scan-domain-facts.mjs <projectDir> [<projectDir> ...]");
  process.exit(1);
}

const ABSENT = "«absent»";

/** The canonical C3 on-disk source folders (bare names) — the walk confinement. */
const CANONICAL_SOURCE_FOLDERS = [
  ...Object.values(C3_SECTION_FOLDERS),
  ...Object.values(C3_ROOT_FILE_FOLDERS),
  IMAGES_FOLDER,
];

// `tilemapBrushes/` is project SOURCE (ADR 0018, src/serialize.ts) but has no
// exported name constant — it is neither a C3_SECTION_FOLDERS/C3_ROOT_FILE_FOLDERS
// entry nor IMAGES_FOLDER, so it is absent from CANONICAL_SOURCE_FOLDERS above and
// must be walked separately for probes that need to actually observe
// `*.brush.json` files (namely `minified`, the only probe with a C3_MINIFIED_SOURCE_SUFFIXES
// stake). Hardcoded here per this script's own convention of not adding a new
// src/ export purely to serve this dev-only scanner.
const TILEMAP_BRUSHES_FOLDER = "tilemapBrushes";

// ─── generic helpers ────────────────────────────────────────────────────────

function fmtReleases(releases) {
  return `{${[...releases].sort((a, b) => a - b).join(",")}}`;
}

/** Sort a Map<key, {count, ...}> into [key, entry] pairs, count descending, key ascending as tiebreak. */
function sortedByCount(map) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || String(a[0]).localeCompare(String(b[0])));
}

function intersectSets(a, b) {
  const out = new Set();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

/** Run one probe in isolation: a throw here must not abort the other five probes or other projects. */
function runProbe(projectDir, failedProbes, name, fn) {
  try {
    fn();
  } catch (err) {
    failedProbes.push(name);
    console.error(`PROBE-FAIL ${name} ${projectDir}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── probe 1+2: eventvar / comparison (shared eventSheets walk) ───────────────

function bumpEventVar(map, key, tabled, paramKeys, release) {
  let e = map.get(key);
  if (!e) {
    e = { count: 0, tabled, paramKeys: new Set(), releases: new Set() };
    map.set(key, e);
  }
  e.count++;
  for (const k of paramKeys) e.paramKeys.add(k);
  if (release !== undefined) e.releases.add(release);
}

function bumpComparison(map, value, symbol, release) {
  const key = typeof value === "number" ? value : `non-numeric:${JSON.stringify(value)}`;
  let e = map.get(key);
  if (!e) {
    e = { count: 0, symbol, releases: new Set() };
    map.set(key, e);
  }
  e.count++;
  if (release !== undefined) e.releases.add(release);
}

function bumpEditorFieldsByType(map, event, release) {
  const et = event.eventType;
  const fields = new Set(Object.keys(event));
  let e = map.get(et);
  if (!e) {
    e = { count: 0, alwaysFields: null, releases: new Set() };
    map.set(et, e);
  }
  e.count++;
  e.alwaysFields = e.alwaysFields === null ? fields : intersectSets(e.alwaysFields, fields);
  if (release !== undefined) e.releases.add(release);
}

function bumpRule(map, ruleId, passed, release) {
  let e = map.get(ruleId);
  if (!e) {
    e = { pass: 0, fail: 0, failReleases: new Set() };
    map.set(ruleId, e);
  }
  if (passed) e.pass++;
  else {
    e.fail++;
    if (release !== undefined) e.failReleases.add(release);
  }
}

/** Extract an action's `objectClass`, or `undefined` for a script action / any action
 *  carrying none. Mirrors `scan-references.mjs`'s `actionObjectClass`. */
function actionObjectClass(action) {
  if (!("objectClass" in action)) return undefined;
  return typeof action.objectClass === "string" ? action.objectClass : undefined;
}

function scanEventSheets(result, projectDir, release) {
  const eventSheetDocs = readSourceDocs(projectDir, C3_SECTION_FOLDERS.eventSheets);
  result.sheetCount = eventSheetDocs.length;

  // "ACE" here means literally every condition/action array entry (the task's own
  // wording), NOT just entries with an `id` — a script action has no `id`/`objectClass`
  // and so cannot join an `objectClass|id` group, but it is still one action instance
  // and must count toward the raw total (`result.aceCount`) or that total silently
  // undercounts every project that uses TypeScript script actions. Only the grouped
  // objectClass|id partition below is gated on `id` being present.
  const processAce = (objectClass, id, parameters) => {
    if (typeof id !== "string") return; // no id => no objectClass|id group possible (e.g. a script action)
    const paramKeys = parameters && typeof parameters === "object" ? Object.keys(parameters).sort() : [];
    const key = `${objectClass ?? ""}|${id}`;
    const tabled = objectClass === "System" && Object.prototype.hasOwnProperty.call(EVENTVAR_REFERENCE_ACES, id);
    bumpEventVar(result.eventvar, key, tabled, paramKeys, release);

    if (parameters && typeof parameters === "object" && Object.prototype.hasOwnProperty.call(parameters, "comparison")) {
      result.comparisonCount++;
      const value = parameters.comparison;
      bumpComparison(result.comparison, value, comparisonSymbol(value), release);
    }
  };

  for (const doc of eventSheetDocs) {
    visitEvents(doc.value.events, (event) => {
      bumpEditorFieldsByType(result.editorFieldsByType, event, release);
      for (const rule of EDITOR_FIELD_RULES) {
        if (rule.eventType !== event.eventType) continue;
        bumpRule(result.editorFieldsByRule, rule.rule, rule.check(event) === null, release);
      }

      if (hasConditions(event)) {
        for (const condition of event.conditions) {
          result.aceCount++;
          processAce(condition.objectClass, condition.id, condition.parameters);
        }
      }
      if (hasActions(event)) {
        for (const action of event.actions) {
          result.aceCount++; // counts script actions too — see processAce's comment above
          if (!("id" in action)) continue;
          processAce(actionObjectClass(action), action.id, action.parameters);
        }
      }
    });
  }
}

// ─── probe 3: imageExt ──────────────────────────────────────────────────────

/**
 * Structural walk over an object type's `image` / `animations` tree, mirroring
 * `deriveExpectedImages` in `src/manifest.ts` (same field names, same recursion)
 * but WITHOUT resolving or throwing on the extension — this probe needs the raw
 * `fileType` (or its absence) as evidence, including present-but-unmapped values
 * that `deriveExpectedImages` would throw on. Deliberately-dumb bucketing (rule b
 * of the governing rule): MAPPED/UNMAPPED classification is a separate, real
 * membership test against the imported `IMAGE_FILE_TYPE_EXTENSIONS` table.
 */
function collectImageFileTypeNodes(objectType) {
  const nodes = [];
  if (!objectType || typeof objectType !== "object") return nodes;
  const name = objectType.name;
  if ("image" in objectType) {
    const img = objectType.image;
    nodes.push({ fileType: img && typeof img === "object" ? img.fileType : undefined, context: String(name) });
  }
  if ("animations" in objectType) {
    const walk = (folder) => {
      const items = Array.isArray(folder?.items) ? folder.items : [];
      for (const item of items) {
        const frames = Array.isArray(item?.frames) ? item.frames : [];
        frames.forEach((frame, i) => {
          nodes.push({
            fileType: frame && typeof frame === "object" ? frame.fileType : undefined,
            context: `${name}/${item?.name}#${i}`,
          });
        });
      }
      for (const sub of Array.isArray(folder?.subfolders) ? folder.subfolders : []) walk(sub);
    };
    walk(objectType.animations);
  }
  return nodes;
}

function bumpImageExt(map, key, mapped, release) {
  let e = map.get(key);
  if (!e) {
    e = { count: 0, mapped, releases: new Set() };
    map.set(key, e);
  }
  e.count++;
  if (release !== undefined) e.releases.add(release);
}

function scanImageExt(result, projectDir, release) {
  const objectTypeDocs = readSourceDocs(projectDir, C3_SECTION_FOLDERS.objectTypes);
  for (const doc of objectTypeDocs) {
    for (const node of collectImageFileTypeNodes(doc.value)) {
      result.imageNodeCount++;
      const key = node.fileType === undefined ? ABSENT : String(node.fileType);
      const mapped =
        node.fileType !== undefined && Object.prototype.hasOwnProperty.call(IMAGE_FILE_TYPE_EXTENSIONS, String(node.fileType));
      bumpImageExt(result.imageExt, key, mapped, release);
    }
  }
}

// ─── probe 5: editorLocal ───────────────────────────────────────────────────

function bumpEditorLocal(map, ext, local) {
  let e = map.get(ext);
  if (!e) {
    e = { local: 0, source: 0 };
    map.set(ext, e);
  }
  if (local) e.local++;
  else e.source++;
}

function scanEditorLocal(result, projectDir) {
  for (const folder of CANONICAL_SOURCE_FOLDERS) {
    const dir = path.join(projectDir, folder);
    if (!existsSync(dir)) continue;
    // descend: () => true (ADR 0020) — enters uistate/ and ts-defs/ too, so the
    // 2x2 histogram shows what a caller who overrides descend actually sees,
    // including the surprising cases isEditorLocalPath's basename-only contract
    // implies (a plain-named file inside uistate/ classifies as source).
    const files = find_all_files_path(
      dir,
      () => true,
      () => true,
    );
    for (const f of files) {
      const base = path.basename(f);
      const ext = path.extname(base).toLowerCase() || "(none)";
      bumpEditorLocal(result.editorLocal, ext, isEditorLocalPath(base));
      result.editorLocalFileCount++;
    }
  }
}

// ─── probe 6: minified ──────────────────────────────────────────────────────

function scanMinified(result, projectDir) {
  // TILEMAP_BRUSHES_FOLDER is appended (not part of CANONICAL_SOURCE_FOLDERS) —
  // it is the only source outside those canonical folders this probe cares about,
  // and it nests (tilemapBrushes/objectTypes/tiles/*.brush.json), so it needs the
  // same recursive find_all_files_path walk as every other folder here.
  for (const folder of [...CANONICAL_SOURCE_FOLDERS, TILEMAP_BRUSHES_FOLDER]) {
    const dir = path.join(projectDir, folder);
    if (!existsSync(dir)) continue;
    const files = find_all_files_path(dir, (f) => f.endsWith(".json"));
    for (const f of files) {
      const base = path.basename(f);
      const content = readFileSync(f, "utf-8");
      const singleLine = !content.includes("\n");
      const minified = isMinifiedSourcePath(base);
      result.minifiedJsonCount++;
      if (singleLine && minified) result.minified.singleMin++;
      else if (singleLine && !minified) result.minified.singleNotMin++;
      else if (!singleLine && minified) {
        result.minified.multiMin++;
        result.minified.multiMinSamples.push(path.relative(projectDir, f));
      } else result.minified.multiNotMin++;
    }
  }
}

// ─── probe 7: scriptSource ──────────────────────────────────────────────────

/** Bucket a bare basename into the extension key used by the scriptSource partition.
 *  `.d.ts` is its own bucket (never merged into `.ts`) because `path.extname` alone
 *  returns `.ts` for `foo.d.ts` — collapsing that would put UNTABLED (`.d.ts`, per
 *  `isScriptSourceName`) and TABLED (`.ts`) files under one key with one verdict,
 *  which the {count, tabled} shape below cannot represent. */
function scriptExtBucket(base) {
  const lower = base.toLowerCase();
  if (lower.endsWith(".d.ts")) return ".d.ts";
  return path.extname(lower) || "(none)";
}

function bumpScriptSource(map, key, tabled, release) {
  let e = map.get(key);
  if (!e) {
    e = { count: 0, tabled, releases: new Set() };
    map.set(key, e);
  }
  e.count++;
  if (release !== undefined) e.releases.add(release);
}

/**
 * Walks the project's on-disk `scripts/` folder (`C3_ROOT_FILE_FOLDERS.script`,
 * NOT hardcoded) and partitions every file found by `extension x isScriptSourceName`
 * verdict — any extension present that is not classified as script source is the
 * shape of a missing table entry. Additionally tallies, among `.js` files, how many
 * are paired with a same-basename `.ts` sibling (generated build output, per the
 * imported `isGeneratedScriptOutput` — never re-derived here) vs unpaired.
 */
function scanScriptSource(result, projectDir, release) {
  const scriptsDir = path.join(projectDir, C3_ROOT_FILE_FOLDERS.script);
  if (!existsSync(scriptsDir)) return;
  const files = find_all_files_path(scriptsDir, () => true);

  const siblingsByDir = new Map();
  for (const f of files) {
    const dir = path.dirname(f);
    const base = path.basename(f);
    const siblings = siblingsByDir.get(dir);
    if (siblings) siblings.push(base);
    else siblingsByDir.set(dir, [base]);
  }

  for (const f of files) {
    const base = path.basename(f);
    result.scriptSourceFileCount++;
    const bucket = scriptExtBucket(base);
    const tabled = isScriptSourceName(base);
    bumpScriptSource(result.scriptSource, bucket, tabled, release);

    if (bucket === ".js") {
      const siblings = siblingsByDir.get(path.dirname(f)) ?? [];
      if (isGeneratedScriptOutput(base, siblings)) result.scriptPairing.paired++;
      else result.scriptPairing.unpaired++;
    }
  }
}

// ─── probe 8: scriptFileType ────────────────────────────────────────────────

/**
 * Structural walk over `manifest.rootFileFolders.script`'s `{items, subfolders}`
 * tree, mirroring `walkManifestFileTree`'s recursion but returning the raw `type`
 * (MIME) field that walk drops — this probe needs the raw value (or its absence)
 * as evidence, not just the name.
 */
function collectScriptFileTypeNodes(folder) {
  const nodes = [];
  if (!folder || typeof folder !== "object") return nodes;
  for (const item of Array.isArray(folder.items) ? folder.items : []) {
    nodes.push({ type: item && typeof item === "object" ? item.type : undefined, name: item?.name });
  }
  for (const sub of Array.isArray(folder.subfolders) ? folder.subfolders : []) {
    nodes.push(...collectScriptFileTypeNodes(sub));
  }
  return nodes;
}

function bumpScriptFileType(map, key, mapped, release) {
  let e = map.get(key);
  if (!e) {
    e = { count: 0, mapped, releases: new Set() };
    map.set(key, e);
  }
  e.count++;
  if (release !== undefined) e.releases.add(release);
}

/**
 * Walks the MANIFEST's `rootFileFolders.script` (note: manifest key is singular
 * `script`; the on-disk folder is plural `scripts/`), partitioning declared items
 * by `item.type` (MIME) x whether `SCRIPT_FILE_TYPE_EXTENSIONS` maps it. Items with
 * an absent `type` bucket under the shared `ABSENT` sentinel, mirroring `imageExt`'s
 * pre-r402 legacy-`fileType` bucket — the same shape could exist here pre-r433.
 */
function scanScriptFileType(result, projectDir, release, manifest) {
  const scriptFolder = manifest && typeof manifest === "object" ? manifest.rootFileFolders?.script : undefined;
  for (const node of collectScriptFileTypeNodes(scriptFolder)) {
    result.scriptFileTypeCount++;
    const key = node.type === undefined ? ABSENT : String(node.type);
    const mapped =
      node.type !== undefined && Object.prototype.hasOwnProperty.call(SCRIPT_FILE_TYPE_EXTENSIONS, String(node.type));
    bumpScriptFileType(result.scriptFileType, key, mapped, release);
  }
}

// ─── per-project orchestration ──────────────────────────────────────────────

function newResult() {
  return {
    status: "scanned",
    release: undefined,
    sheetCount: 0,
    aceCount: 0,
    comparisonCount: 0,
    imageNodeCount: 0,
    editorLocalFileCount: 0,
    minifiedJsonCount: 0,
    scriptSourceFileCount: 0,
    scriptFileTypeCount: 0,
    eventvar: new Map(),
    comparison: new Map(),
    imageExt: new Map(),
    editorFieldsByType: new Map(),
    editorFieldsByRule: new Map(),
    editorLocal: new Map(),
    minified: { singleMin: 0, singleNotMin: 0, multiMin: 0, multiNotMin: 0, multiMinSamples: [] },
    scriptSource: new Map(),
    scriptPairing: { paired: 0, unpaired: 0 },
    scriptFileType: new Map(),
    failedProbes: [],
  };
}

function printEventVarTable(map, sheetCount, aceCount, heading) {
  console.log(`${heading}: ${aceCount} ACEs / ${sheetCount} sheets`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(
      `  ${e.count}\t${key}\t{${[...e.paramKeys].sort().join(",")}}\t${e.tabled ? "TABLED" : "UNTABLED"}`,
    );
  }
  if (map.size === 0) console.log("  (no ACEs found)");
}

function printComparisonTable(map, count, heading) {
  console.log(`${heading}: ${count} "comparison" parameter occurrence(s)`);
  for (const [value, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${value}\t${e.symbol ?? "UNMAPPED"}`);
  }
  if (map.size === 0) console.log("  (no comparison parameters found)");
}

function printImageExtTable(map, count, heading) {
  console.log(`${heading}: ${count} image node(s)`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.mapped ? "MAPPED" : "UNMAPPED"}`);
  }
  if (map.size === 0) console.log("  (no image nodes found)");
}

function printEditorFieldsTable(byType, byRule, heading) {
  console.log(`${heading}:`);
  for (const [eventType, e] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${eventType}\tcount=${e.count}\talways-present={${[...(e.alwaysFields ?? [])].sort().join(",")}}`);
  }
  if (byType.size === 0) console.log("  (no events found)");
  for (const [ruleId, e] of [...byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  rule ${ruleId}\tpass=${e.pass}\tfail=${e.fail}`);
  }
}

function printEditorLocalTable(map, total, heading) {
  console.log(`${heading}: ${total} file(s) scanned`);
  for (const [ext, e] of [...map.entries()].sort((a, b) => e_count(b[1]) - e_count(a[1]) || a[0].localeCompare(b[0]))) {
    console.log(`  ${ext}\tlocal=${e.local}\tsource=${e.source}`);
  }
  if (map.size === 0) console.log("  (no files found)");
}
function e_count(e) {
  return e.local + e.source;
}

function printMinifiedTable(m, total, heading) {
  console.log(`${heading}: ${total} .json file(s) scanned`);
  console.log(`  single-line & minified-suffix:     ${m.singleMin}`);
  console.log(`  single-line & not-minified-suffix: ${m.singleNotMin}`);
  console.log(`  multi-line  & minified-suffix:     ${m.multiMin}${m.multiMin > 0 ? "  <- CONTRADICTS isMinifiedSourcePath" : ""}`);
  console.log(`  multi-line  & not-minified-suffix: ${m.multiNotMin}`);
  if (m.multiMin > 0) {
    for (const sample of m.multiMinSamples.slice(0, 5)) console.log(`    e.g. ${sample}`);
  }
}

function printScriptSourceTable(map, count, pairing, heading) {
  console.log(`${heading}: ${count} file(s) under scripts/`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.tabled ? "TABLED" : "UNTABLED"}`);
  }
  if (map.size === 0) console.log("  (no files found under scripts/)");
  console.log(`  .js pairing (isGeneratedScriptOutput): paired=${pairing.paired}\tunpaired=${pairing.unpaired}`);
}

function printScriptFileTypeTable(map, count, heading) {
  console.log(`${heading}: ${count} declared script item(s)`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.mapped ? "MAPPED" : "UNMAPPED"}`);
  }
  if (map.size === 0) console.log("  (no declared script items found)");
}

/** Scan one project directory. Returns `{status:"skipped"}` or the populated result. */
function scanProject(projectDir) {
  const manifestPath = path.join(projectDir, PROJECT_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    console.log(`SKIP ${projectDir}: no ${PROJECT_MANIFEST_FILE} found`);
    return { status: "skipped" };
  }

  let manifest;
  try {
    manifest = readProjectManifest(manifestPath);
  } catch (err) {
    console.log(`SKIP ${projectDir}: unreadable ${PROJECT_MANIFEST_FILE}: ${err instanceof Error ? err.message : String(err)}`);
    return { status: "skipped" };
  }

  const release = typeof manifest.savedWithRelease === "number" ? manifest.savedWithRelease : undefined;
  const result = newResult();
  result.release = release;

  console.log(`\n=== ${projectDir} === (savedWithRelease=${release ?? "UNKNOWN"})`);

  runProbe(projectDir, result.failedProbes, "eventvar+comparison+editorFields", () =>
    scanEventSheets(result, projectDir, release),
  );
  runProbe(projectDir, result.failedProbes, "imageExt", () => scanImageExt(result, projectDir, release));
  runProbe(projectDir, result.failedProbes, "editorLocal", () => scanEditorLocal(result, projectDir));
  runProbe(projectDir, result.failedProbes, "minified", () => scanMinified(result, projectDir));
  runProbe(projectDir, result.failedProbes, "scriptSource", () => scanScriptSource(result, projectDir, release));
  runProbe(projectDir, result.failedProbes, "scriptFileType", () =>
    scanScriptFileType(result, projectDir, release, manifest),
  );

  printEventVarTable(result.eventvar, result.sheetCount, result.aceCount, "TABLE EVENTVAR_REFERENCE_ACES");
  printComparisonTable(result.comparison, result.comparisonCount, "TABLE COMPARISON_OPERATORS");
  printImageExtTable(result.imageExt, result.imageNodeCount, "TABLE IMAGE_FILE_TYPE_EXTENSIONS");
  printEditorFieldsTable(result.editorFieldsByType, result.editorFieldsByRule, "TABLE EDITOR_FIELD_RULES");
  printEditorLocalTable(result.editorLocal, result.editorLocalFileCount, "TABLE isEditorLocalPath");
  printMinifiedTable(result.minified, result.minifiedJsonCount, "TABLE isMinifiedSourcePath");
  printScriptSourceTable(result.scriptSource, result.scriptSourceFileCount, result.scriptPairing, "TABLE SCRIPT_SOURCE_EXTENSIONS");
  printScriptFileTypeTable(result.scriptFileType, result.scriptFileTypeCount, "TABLE SCRIPT_FILE_TYPE_EXTENSIONS");

  console.log(
    `SUMMARY ${projectDir}: release=${release ?? "UNKNOWN"}, sheets=${result.sheetCount}, aces=${result.aceCount}, ` +
      `comparisons=${result.comparisonCount}, imageNodes=${result.imageNodeCount}, ` +
      `editorLocalFiles=${result.editorLocalFileCount}, minifiedJson=${result.minifiedJsonCount}, ` +
      `scriptSourceFiles=${result.scriptSourceFileCount}, scriptFileTypeItems=${result.scriptFileTypeCount}, ` +
      `failedProbes=${result.failedProbes.length > 0 ? result.failedProbes.join(",") : "none"}`,
  );

  return result;
}

// ─── corpus roll-up ─────────────────────────────────────────────────────────

function mergeEventVar(target, source) {
  for (const [key, e] of source) {
    let t = target.get(key);
    if (!t) {
      t = { count: 0, tabled: e.tabled, paramKeys: new Set(), releases: new Set() };
      target.set(key, t);
    }
    t.count += e.count;
    for (const k of e.paramKeys) t.paramKeys.add(k);
    for (const r of e.releases) t.releases.add(r);
  }
}

function mergeComparison(target, source) {
  for (const [value, e] of source) {
    let t = target.get(value);
    if (!t) {
      t = { count: 0, symbol: e.symbol, releases: new Set() };
      target.set(value, t);
    }
    t.count += e.count;
    for (const r of e.releases) t.releases.add(r);
  }
}

function mergeImageExt(target, source) {
  for (const [key, e] of source) {
    let t = target.get(key);
    if (!t) {
      t = { count: 0, mapped: e.mapped, releases: new Set() };
      target.set(key, t);
    }
    t.count += e.count;
    for (const r of e.releases) t.releases.add(r);
  }
}

/** editorFields is the ONE probe whose field-set accumulator is an INTERSECTION, not a
 *  union/sum — the other five probes' merge functions above all sum/union. Rolling up
 *  "always present" fields by union across projects would silently produce a wrong
 *  superset (a field present in every event of ONE project but absent in another would
 *  wrongly still read as "always present" corpus-wide). A project that never observed a
 *  given eventType contributes no evidence and must not narrow the intersection. */
function mergeEditorFieldsByType(target, source) {
  for (const [eventType, e] of source) {
    if (e.count === 0) continue;
    let t = target.get(eventType);
    if (!t) {
      t = { count: 0, alwaysFields: null, releases: new Set() };
      target.set(eventType, t);
    }
    t.count += e.count;
    t.alwaysFields = t.alwaysFields === null ? e.alwaysFields : intersectSets(t.alwaysFields, e.alwaysFields);
    for (const r of e.releases) t.releases.add(r);
  }
}

function mergeEditorFieldsByRule(target, source) {
  for (const [ruleId, e] of source) {
    let t = target.get(ruleId);
    if (!t) {
      t = { pass: 0, fail: 0, failReleases: new Set() };
      target.set(ruleId, t);
    }
    t.pass += e.pass;
    t.fail += e.fail;
    for (const r of e.failReleases) t.failReleases.add(r);
  }
}

function mergeEditorLocal(target, source) {
  for (const [ext, e] of source) {
    let t = target.get(ext);
    if (!t) {
      t = { local: 0, source: 0 };
      target.set(ext, t);
    }
    t.local += e.local;
    t.source += e.source;
  }
}

function mergeMinified(target, source) {
  target.singleMin += source.singleMin;
  target.singleNotMin += source.singleNotMin;
  target.multiMin += source.multiMin;
  target.multiNotMin += source.multiNotMin;
  target.multiMinSamples.push(...source.multiMinSamples);
}

function mergeScriptSource(target, source) {
  for (const [key, e] of source) {
    let t = target.get(key);
    if (!t) {
      t = { count: 0, tabled: e.tabled, releases: new Set() };
      target.set(key, t);
    }
    t.count += e.count;
    for (const r of e.releases) t.releases.add(r);
  }
}

function mergeScriptPairing(target, source) {
  target.paired += source.paired;
  target.unpaired += source.unpaired;
}

function mergeScriptFileType(target, source) {
  for (const [key, e] of source) {
    let t = target.get(key);
    if (!t) {
      t = { count: 0, mapped: e.mapped, releases: new Set() };
      target.set(key, t);
    }
    t.count += e.count;
    for (const r of e.releases) t.releases.add(r);
  }
}

function printEventVarRollup(map, aceCount, sheetCount, releaseSet) {
  console.log(`TABLE EVENTVAR_REFERENCE_ACES: ${aceCount} ACEs / ${sheetCount} sheets / ${releaseSet.size} releases`);
  const nameParamKeys = new Set(Object.values(EVENTVAR_REFERENCE_ACES));
  for (const id of Object.keys(EVENTVAR_REFERENCE_ACES)) {
    const e = map.get(`System|${id}`);
    if (!e || e.count === 0) {
      console.log(`  UNSEEN   ${id}\t0 occ (tabled, never observed)`);
    } else {
      console.log(
        `  TABLED   ${id}\t${e.count} occ\tparam keys {${[...e.paramKeys].sort().join(",")}}\treleases ${fmtReleases(e.releases)}`,
      );
    }
  }
  console.log(
    nameParamKeys.size === 1
      ? `  no tabled id uses a name-param key other than "${[...nameParamKeys][0]}"`
      : `  tabled ids use ${nameParamKeys.size} distinct name-param keys: ${[...nameParamKeys].sort().join(",")}`,
  );
  console.log("  -> see per-project blocks above for the full objectClass|id partition (raw, undeduped)");
}

function printComparisonRollup(map, count, releaseSet) {
  const values = [...map.keys()].filter((v) => typeof v === "number").sort((a, b) => a - b);
  const nonNumeric = [...map.keys()].filter((v) => typeof v !== "number");
  const unmapped = [...map.entries()].filter(([, e]) => e.symbol === undefined);
  const unmappedCount = unmapped.reduce((n, [, e]) => n + e.count, 0);
  const verdict =
    count === 0
      ? `NOT EXERCISED (0 "comparison" parameter occurrence(s) observed)`
      : unmappedCount === 0 && nonNumeric.length === 0
        ? `NO GAPS (${count} "comparison" parameter occurrence(s) observed)`
        : `${unmapped.length} GAP(S) (${count} "comparison" parameter occurrence(s) observed)`;
  console.log(
    `TABLE COMPARISON_OPERATORS: values ${values.length > 0 ? `${values[0]}-${values[values.length - 1]}` : "(none)"} observed, ${unmappedCount} unmapped / ${releaseSet.size} releases -> ${verdict}`,
  );
  for (const [value, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${value}\t${e.symbol ?? "UNMAPPED"}\treleases ${fmtReleases(e.releases)}`);
  }
  if (map.size === 0) console.log("  (no comparison parameters found across corpus)");
}

function printImageExtRollup(map, count, releaseSet) {
  console.log(`TABLE IMAGE_FILE_TYPE_EXTENSIONS: ${count} image node(s) / ${releaseSet.size} releases`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.mapped ? "MAPPED" : "UNMAPPED"}\treleases ${fmtReleases(e.releases)}`);
  }
  const absent = map.get(ABSENT);
  console.log(
    absent
      ? `  -> ${absent.count} node(s) with NO fileType (pre-r402 legacy), releases ${fmtReleases(absent.releases)}`
      : "  -> 0 nodes with no fileType observed",
  );
  const presentUnmapped = [...map.entries()].filter(([key, e]) => key !== ABSENT && !e.mapped);
  console.log(
    count === 0
      ? "  -> NOT EXERCISED (0 image node(s) observed)"
      : presentUnmapped.length === 0
        ? `  -> NO GAPS (${count} image node(s) observed, every present fileType maps to a known extension)`
        : `  -> ${presentUnmapped.length} present-but-unmapped fileType value(s) observed (of ${count} image node(s))`,
  );
  if (map.size === 0) console.log("  (no image nodes found across corpus)");
}

function printEditorFieldsRollup(byType, byRule, releaseSet) {
  const totalEvents = [...byType.values()].reduce((n, e) => n + e.count, 0);
  console.log(`TABLE EDITOR_FIELD_RULES: ${totalEvents} event(s) / ${releaseSet.size} releases`);
  for (const [eventType, e] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      `  ${eventType}\tcount=${e.count}\talways-present={${[...(e.alwaysFields ?? [])].sort().join(",")}}\treleases ${fmtReleases(e.releases)}`,
    );
  }
  if (byType.size === 0) console.log("  (no events found across corpus)");
  let anyFail = false;
  for (const [ruleId, e] of [...byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      `  rule ${ruleId}\tpass=${e.pass}\tfail=${e.fail}${e.fail > 0 ? `\tfail-releases ${fmtReleases(e.failReleases)}` : ""}`,
    );
    if (e.fail > 0) anyFail = true;
  }
  console.log(
    totalEvents === 0
      ? "  -> NOT EXERCISED (0 event(s) observed)"
      : anyFail
        ? "  -> some EDITOR_FIELD_RULES checks FAILED on real corpus events (see above)"
        : `  -> NO FAILURES (${totalEvents} event(s) observed, every EDITOR_FIELD_RULES check passed on every observed instance)`,
  );
}

function printEditorLocalRollup(map, total) {
  console.log(`TABLE isEditorLocalPath (EDITOR_LOCAL_EXCLUSIONS): ${total} file(s) scanned`);
  for (const [ext, e] of [...map.entries()].sort((a, b) => e_count(b[1]) - e_count(a[1]) || a[0].localeCompare(b[0]))) {
    console.log(`  ${ext}\tlocal=${e.local}\tsource=${e.source}`);
  }
  const everLocal = [...map.entries()].filter(([, e]) => e.local > 0).map(([ext]) => ext);
  console.log(
    total === 0
      ? "  -> NOT EXERCISED (0 file(s) scanned)"
      : everLocal.length === 0
        ? `  -> no extension ever classified editor-local across corpus (${total} file(s) scanned)`
        : `  -> extensions ever classified editor-local: {${everLocal.sort().join(",")}} (${total} file(s) scanned)`,
  );
  console.log(
    `  (known exclusions: dirs={${EDITOR_LOCAL_EXCLUSIONS.dirs.join(",")}} suffixes={${EDITOR_LOCAL_EXCLUSIONS.fileSuffixes.join(",")}} exactNames={${EDITOR_LOCAL_EXCLUSIONS.exactNames.join(",")}})`,
  );
  if (map.size === 0) console.log("  (no files found across corpus)");
}

function printMinifiedRollup(m, total) {
  console.log(`TABLE isMinifiedSourcePath (C3_MINIFIED_SOURCE_SUFFIXES: {${C3_MINIFIED_SOURCE_SUFFIXES.join(",")}}): ${total} .json file(s) scanned`);
  console.log(`  single-line & minified-suffix:     ${m.singleMin}`);
  console.log(`  single-line & not-minified-suffix: ${m.singleNotMin}`);
  console.log(`  multi-line  & minified-suffix:     ${m.multiMin}`);
  console.log(`  multi-line  & not-minified-suffix: ${m.multiNotMin}`);
  const matchedSuffixCount = m.singleMin + m.multiMin;
  console.log(
    matchedSuffixCount === 0
      ? "  -> NOT EXERCISED (0 file(s) matching C3_MINIFIED_SOURCE_SUFFIXES in this corpus)"
      : m.multiMin === 0
        ? `  -> NO CONTRADICTIONS (${matchedSuffixCount} file(s) matching C3_MINIFIED_SOURCE_SUFFIXES observed, all single-line)`
        : `  -> ${m.multiMin} CONTRADICTION(S) (of ${matchedSuffixCount} file(s) matching C3_MINIFIED_SOURCE_SUFFIXES): a minified-suffix file is NOT single-line`,
  );
  for (const sample of m.multiMinSamples.slice(0, 5)) console.log(`    e.g. ${sample}`);
}

function printScriptSourceRollup(map, count, pairing, releaseSet) {
  console.log(
    `TABLE SCRIPT_SOURCE_EXTENSIONS ({${SCRIPT_SOURCE_EXTENSIONS.join(",")}}): ${count} file(s) under scripts/ / ${releaseSet.size} releases`,
  );
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.tabled ? "TABLED" : "UNTABLED"}\treleases ${fmtReleases(e.releases)}`);
  }
  const untabled = [...map.entries()].filter(([, e]) => !e.tabled);
  const untabledCount = untabled.reduce((n, [, e]) => n + e.count, 0);
  console.log(
    count === 0
      ? "  -> NOT EXERCISED (0 file(s) under scripts/ observed)"
      : untabled.length === 0
        ? `  -> NO GAPS (${count} file(s) observed, every file under scripts/ classifies via isScriptSourceName)`
        : `  -> ${untabled.length} extension(s) present under scripts/ NOT classified as script source (${untabledCount} of ${count} file(s))`,
  );
  if (map.size === 0) console.log("  (no files found under scripts/ across corpus)");
  console.log(
    `  .js pairing (isGeneratedScriptOutput): paired=${pairing.paired}\tunpaired=${pairing.unpaired}` +
      (pairing.unpaired > 0 ? "  <- unpaired .js has no same-basename .ts sibling (possibly hand-authored)" : ""),
  );
}

function printScriptFileTypeRollup(map, count, releaseSet) {
  console.log(`TABLE SCRIPT_FILE_TYPE_EXTENSIONS: ${count} declared script item(s) / ${releaseSet.size} releases`);
  for (const [key, e] of sortedByCount(map)) {
    console.log(`  ${e.count}\t${key}\t${e.mapped ? "MAPPED" : "UNMAPPED"}\treleases ${fmtReleases(e.releases)}`);
  }
  const absent = map.get(ABSENT);
  console.log(
    absent
      ? `  -> ${absent.count} item(s) with NO type field, releases ${fmtReleases(absent.releases)}`
      : "  -> 0 items with no type field observed",
  );
  const presentUnmapped = [...map.entries()].filter(([key, e]) => key !== ABSENT && !e.mapped);
  console.log(
    count === 0
      ? "  -> NOT EXERCISED (0 declared script item(s) observed)"
      : presentUnmapped.length === 0
        ? `  -> NO GAPS (${count} declared script item(s) observed, every present type maps to a known extension)`
        : `  -> ${presentUnmapped.length} present-but-unmapped type value(s) observed (of ${count} declared script item(s))`,
  );
  if (map.size === 0) console.log("  (no declared script items found across corpus)");
}

let scannedCount = 0;
let failedCount = 0;
let skippedCount = 0;
const releaseSet = new Set();

const corpus = {
  aceCount: 0,
  sheetCount: 0,
  comparisonCount: 0,
  imageNodeCount: 0,
  editorLocalFileCount: 0,
  minifiedJsonCount: 0,
  scriptSourceFileCount: 0,
  scriptFileTypeCount: 0,
  eventvar: new Map(),
  comparison: new Map(),
  imageExt: new Map(),
  editorFieldsByType: new Map(),
  editorFieldsByRule: new Map(),
  editorLocal: new Map(),
  minified: { singleMin: 0, singleNotMin: 0, multiMin: 0, multiNotMin: 0, multiMinSamples: [] },
  scriptSource: new Map(),
  scriptPairing: { paired: 0, unpaired: 0 },
  scriptFileType: new Map(),
};

for (const projectDir of projectDirs) {
  let result;
  try {
    result = scanProject(projectDir);
  } catch (err) {
    failedCount++;
    console.error(`FAIL ${projectDir}: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  if (result.status === "skipped") {
    skippedCount++;
    continue;
  }

  scannedCount++;
  if (result.failedProbes.length > 0) failedCount++;
  if (result.release !== undefined) releaseSet.add(result.release);

  corpus.aceCount += result.aceCount;
  corpus.sheetCount += result.sheetCount;
  corpus.comparisonCount += result.comparisonCount;
  corpus.imageNodeCount += result.imageNodeCount;
  corpus.editorLocalFileCount += result.editorLocalFileCount;
  corpus.minifiedJsonCount += result.minifiedJsonCount;
  corpus.scriptSourceFileCount += result.scriptSourceFileCount;
  corpus.scriptFileTypeCount += result.scriptFileTypeCount;
  mergeEventVar(corpus.eventvar, result.eventvar);
  mergeComparison(corpus.comparison, result.comparison);
  mergeImageExt(corpus.imageExt, result.imageExt);
  mergeEditorFieldsByType(corpus.editorFieldsByType, result.editorFieldsByType);
  mergeEditorFieldsByRule(corpus.editorFieldsByRule, result.editorFieldsByRule);
  mergeEditorLocal(corpus.editorLocal, result.editorLocal);
  mergeMinified(corpus.minified, result.minified);
  mergeScriptSource(corpus.scriptSource, result.scriptSource);
  mergeScriptPairing(corpus.scriptPairing, result.scriptPairing);
  mergeScriptFileType(corpus.scriptFileType, result.scriptFileType);
}

console.log("\n=== corpus roll-up ===");
console.log(
  `projects=${scannedCount}  skipped=${skippedCount}  failed=${failedCount}  releases=${[...releaseSet].sort((a, b) => a - b).join(",")}`,
);

printEventVarRollup(corpus.eventvar, corpus.aceCount, corpus.sheetCount, releaseSet);
printComparisonRollup(corpus.comparison, corpus.comparisonCount, releaseSet);
printImageExtRollup(corpus.imageExt, corpus.imageNodeCount, releaseSet);
printEditorFieldsRollup(corpus.editorFieldsByType, corpus.editorFieldsByRule, releaseSet);
printEditorLocalRollup(corpus.editorLocal, corpus.editorLocalFileCount);
printMinifiedRollup(corpus.minified, corpus.minifiedJsonCount);
printScriptSourceRollup(corpus.scriptSource, corpus.scriptSourceFileCount, corpus.scriptPairing, releaseSet);
printScriptFileTypeRollup(corpus.scriptFileType, corpus.scriptFileTypeCount, releaseSet);

process.exit(failedCount > 0 ? 1 : 0);
