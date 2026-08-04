// Corpus scanner for the reference-integrity detectors in `src/references.ts`.
//
// Why this exists (durable asset, not scaffolding): `C3_PSEUDO_OBJECT_CLASSES`
// (`["System"]`) is a KNOWN-INCOMPLETE domain-fact table — `objectClass`
// values in an event-sheet ACE that resolve to no object type or family *by
// design*, statically known members only. `"Functions"` is deliberately NOT
// in this table: it is the *default* of `project.c3proj`'s per-project
// `functionsName` setting, not a fixed pseudo-class, so `detectEventClassIssues`
// resolves it separately (see `src/references.ts`) rather than the table
// growing a second entry. The table was validated by scanning a corpus of 14
// real C3 projects under `C:\repos` (see `docs/domain-fact-audit.md` for the
// corpus inventory); the canonical fixture (`test/fixtures/canonical/`) yields
// only `{"System"}`, so it alone can never validate this table. This script is
// the only way to re-validate (or extend) the table on a C3 version bump or
// when new projects become available. It is dev-only and deliberately not
// wired into CI or `package.json` — see `scripts/api-surface.mjs` for the
// sibling dev script this one mirrors.
//
// Usage: node scripts/scan-references.mjs <projectDir> [<projectDir> ...]

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
if (!existsSync(distEntry)) {
  console.error(`scan-references: entry module does not exist: ${distEntry}`);
  console.error(`scan-references: did the build run?`);
  process.exit(1);
}

const {
  C3_PSEUDO_OBJECT_CLASSES,
  C3_SECTION_FOLDERS,
  PROJECT_MANIFEST_FILE,
  detectAddonReferenceIssues,
  detectReferenceIntegrity,
  hasActions,
  hasConditions,
  manifestFamilyNames,
  manifestObjectTypeNames,
  readProjectManifest,
  readSourceDocs,
  visitEvents,
} = await import("../dist/index.js");

const projectDirs = process.argv.slice(2);
if (projectDirs.length === 0) {
  console.error("usage: node scripts/scan-references.mjs <projectDir> [<projectDir> ...]");
  process.exit(1);
}

/**
 * Extract a loosely-typed action's `objectClass`, or `undefined` when the
 * action carries none. Mirrors `actionObjectClass` in `src/references.ts`
 * (also unexported): an action may be a plain script/comment/function-call
 * action with no `objectClass` at all.
 */
function actionObjectClass(action) {
  if (!("objectClass" in action)) return undefined;
  return typeof action.objectClass === "string" ? action.objectClass : undefined;
}

/**
 * Count every `objectClass` reference across a set of event-sheet docs that
 * resolves to neither a manifest object type/family nor a known pseudo-class,
 * keyed by name. This is deliberately scanner-specific counting logic, NOT a
 * call into `detectEventClassIssues`: that detector reports one deduped issue
 * per *event* (matching `validateEventForEditor`'s precedent), which would
 * hide exactly the "this name appears hundreds of times" signal that first
 * surfaced `"Functions"`. So this walks `visitEvents` directly and counts every
 * condition/action/custom-ace-block occurrence, undeduped.
 */
function countUnresolvedObjectClasses(eventSheetDocs, classNames) {
  const pseudoClasses = new Set(C3_PSEUDO_OBJECT_CLASSES);
  const resolves = (name) => classNames.has(name) || pseudoClasses.has(name);
  const counts = new Map();
  const bump = (name) => counts.set(name, (counts.get(name) ?? 0) + 1);

  for (const doc of eventSheetDocs) {
    visitEvents(doc.value.events, (event) => {
      if (hasConditions(event)) {
        for (const condition of event.conditions) {
          if (!resolves(condition.objectClass)) bump(condition.objectClass);
        }
      }
      if (hasActions(event)) {
        for (const action of event.actions) {
          const objectClass = actionObjectClass(action);
          if (objectClass !== undefined && !resolves(objectClass)) bump(objectClass);
        }
      }
      if (event.eventType === "custom-ace-block" && !resolves(event.objectClass)) {
        bump(event.objectClass);
      }
    });
  }

  return counts;
}

/** Sort a Map<name, count> into [name, count] pairs, count descending, name ascending as tiebreak. */
function sortedCounts(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countByKind(issues, kind) {
  return issues.filter((issue) => issue.kind === kind).length;
}

/** Scan one project directory. Returns the aggregate objectClass count Map, or `null` on skip/failure. */
function scanProject(projectDir) {
  const manifestPath = path.join(projectDir, PROJECT_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    console.log(`SKIP ${projectDir}: no ${PROJECT_MANIFEST_FILE} found`);
    return { status: "skipped" };
  }

  console.log(`\n=== ${projectDir} ===`);

  // Full canonical pass (addon issues WITH layouts included, plus family-member,
  // instance-type, and deduped event-class issues) — the same orchestrator a
  // real caller would use.
  const manifest = readProjectManifest(manifestPath);
  const full = detectReferenceIntegrity(projectDir, manifest);

  // Own reads, needed for the addon "without layouts" comparison and the
  // objectClass occurrence counts below.
  const objectTypeDocs = readSourceDocs(projectDir, C3_SECTION_FOLDERS.objectTypes);
  const familyDocs = readSourceDocs(projectDir, C3_SECTION_FOLDERS.families);
  const eventSheetDocs = readSourceDocs(projectDir, C3_SECTION_FOLDERS.eventSheets);

  // 1. Unresolved objectClass values — the primary output.
  const objectTypeNames = manifestObjectTypeNames(manifest);
  const classNames = new Set([...objectTypeNames, ...manifestFamilyNames(manifest)]);
  const objectClassCounts = countUnresolvedObjectClasses(eventSheetDocs, classNames);

  console.log("Unresolved objectClass values (occurrence count, descending):");
  const sorted = sortedCounts(objectClassCounts);
  if (sorted.length === 0) {
    console.log("  (none)");
  } else {
    for (const [name, count] of sorted) console.log(`  ${count}\t${name}`);
  }

  // 2. Addon issues, computed both ways — with layouts in the derived side
  // (the real detector's default) and with `[]` for layouts. The delta is the
  // layer/layout-effect asymmetry `collectLayoutEffectIds` exists to close: on
  // a real project this was 2 addon-undeclared false positives -> 0.
  const withLayoutsIssues = full.issues.filter(
    (issue) => issue.kind === "addon-undeclared" || issue.kind === "addon-unused",
  );
  const withLayoutsUndeclared = countByKind(withLayoutsIssues, "addon-undeclared");
  const withLayoutsUnused = countByKind(withLayoutsIssues, "addon-unused");

  const withoutLayoutsIssues = detectAddonReferenceIssues(manifest, objectTypeDocs, familyDocs, []);
  const withoutLayoutsUndeclared = countByKind(withoutLayoutsIssues, "addon-undeclared");
  const withoutLayoutsUnused = countByKind(withoutLayoutsIssues, "addon-unused");

  console.log("Addon issues:");
  console.log(`  with layouts:    ${withLayoutsUndeclared} undeclared, ${withLayoutsUnused} unused`);
  console.log(`  without layouts: ${withoutLayoutsUndeclared} undeclared, ${withoutLayoutsUnused} unused`);
  console.log(
    `  delta (false positives closed by including layouts): ${withoutLayoutsUndeclared - withLayoutsUndeclared} undeclared, ${withoutLayoutsUnused - withLayoutsUnused} unused`,
  );

  // 3. Family-member and instance-type issue counts.
  const familyMemberCount = countByKind(full.issues, "family-member-missing");
  const instanceTypeCount = countByKind(full.issues, "instance-type-missing");
  const eventClassCount = countByKind(full.issues, "event-class-unresolved");
  console.log(`Family-member issues: ${familyMemberCount}`);
  console.log(`Instance-type issues: ${instanceTypeCount}`);
  console.log(`Event-class issues (deduped, one per event): ${eventClassCount}`);

  // 4. Per-project summary line.
  console.log(
    `SUMMARY ${projectDir}: ${sorted.length} unresolved objectClass name(s), ` +
      `addon(with)=${withLayoutsUndeclared}/${withLayoutsUnused}, ` +
      `addon(without)=${withoutLayoutsUndeclared}/${withoutLayoutsUnused}, ` +
      `family=${familyMemberCount}, instance=${instanceTypeCount}, event-class=${eventClassCount}, ` +
      `status=${full.ok ? "OK" : "ISSUES"}`,
  );

  return { status: "scanned", objectClassCounts };
}

let scannedCount = 0;
let failedCount = 0;
let skippedCount = 0;
const corpusObjectClassCounts = new Map();

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
  for (const [name, count] of result.objectClassCounts) {
    corpusObjectClassCounts.set(name, (corpusObjectClassCounts.get(name) ?? 0) + count);
  }
}

console.log("\n=== corpus roll-up ===");
console.log(`Projects scanned: ${scannedCount}`);
console.log(`Projects skipped (no ${PROJECT_MANIFEST_FILE}): ${skippedCount}`);
console.log(`Projects failed (unparseable): ${failedCount}`);
console.log("Aggregate unresolved objectClass names across corpus (occurrence count, descending):");
const corpusSorted = sortedCounts(corpusObjectClassCounts);
if (corpusSorted.length === 0) {
  console.log("  (none)");
} else {
  for (const [name, count] of corpusSorted) console.log(`  ${count}\t${name}`);
}

process.exit(failedCount > 0 ? 1 : 0);
