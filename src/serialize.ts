import { writeFileSync } from "node:fs";

/**
 * The C3 domain fact for how the editor serializes project **source** JSON: a
 * single tab character per indent level. Verified against real C3 exports (r487,
 * r495): for every non-editor-local `.json`/`.c3proj` file in the canonical
 * `construct3-sample` fixture, `serializeC3Json(JSON.parse(text)) === text`
 * (25 of 26 — the one exception is `*.brush.json`, which C3 writes minified; see
 * {@link serializeC3Json}).
 */
export const C3_JSON_INDENT = "\t";

/**
 * Serialize `value` in the canonical C3 project-source form: tab-indented, and
 * — the inverse of the usual text-file convention — with **no trailing
 * newline**. Equivalent to `JSON.stringify(value, undefined, C3_JSON_INDENT)`.
 *
 * **Evidence.** Verified against real C3 exports (r487, r495): for every
 * non-editor-local JSON file in the canonical fixture (`construct3-sample`),
 * `serializeC3Json(JSON.parse(text)) === text` (25 of 26; the single named
 * exception is `*.brush.json`, which C3 writes **minified** — a documented,
 * not a general, exception).
 *
 * **Non-goal.** This is NOT the form for C3-**editor-local** files
 * (`*.uistate.json`, files under `uistate/`, `*.brush.json` — see
 * {@link isEditorLocalPath}) — C3 writes those minified. c3source never writes
 * editor-local files, so that form is deliberately un-owned here.
 *
 * **No BOM.** This serializer never writes one, and C3 does not write one in
 * project source. `src/addons.ts`'s `stripBom`/`UTF8_BOM` exist for a wholly
 * different producer: `.c3addon` packages are hand-authored by third-party
 * addon developers, so a leading BOM on one of their JSON entries reflects
 * whichever text editor that author happened to use — not any C3 behavior.
 *
 * **Caller contract.** `value` must be JSON-serializable.
 * `JSON.stringify(undefined)` returns `undefined`, **not a string** — passing
 * `undefined` is a caller error and is deliberately **not** runtime-guarded
 * here: every real call site already has a serializable value, so a guard
 * would be dead code.
 */
export function serializeC3Json(value: unknown): string {
  return JSON.stringify(value, undefined, C3_JSON_INDENT);
}

/** Write `value` to `filePath` in the canonical C3 project-source form (see {@link serializeC3Json}), utf-8. */
export function writeC3JsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, serializeC3Json(value), "utf-8");
}

/**
 * Suffixes identifying C3 project **source** files that C3 nonetheless writes in a
 * second, minified serialization form — `JSON.stringify(value)`, no indent, no
 * trailing newline — rather than the tab-indented form `serializeC3Json` owns.
 * `tilemapBrushes/**\/*.brush.json` is the one known member: it is hand-authored,
 * non-derivable project data (not editor-local), so it must round-trip like any
 * other source file, just in a different byte form.
 *
 * This is deliberately **orthogonal** to `isEditorLocalPath`'s provenance axis
 * (source vs. editor-local), not a widening of it. Both axes vary independently on
 * real C3 output: source-and-tab-indented (the common case),
 * source-and-minified (`*.brush.json`), editor-local-and-minified
 * (`*.uistate.json`), and editor-local-and-tab-indented
 * (`uistate/*.instancesBar.json`) all occur.
 *
 * **Scope — minified _source_ only.** This table covers the *intersection*: files
 * that are both project source and minified. It is deliberately **not** an
 * inventory of every minified file C3 writes, so
 * `isMinifiedSourcePath("Main Layout.uistate.json")` is `false` even though that
 * file is minified on disk — it is editor-local, so it is out of scope here (and
 * `isEditorLocalPath` already classifies it). The two predicates answer different
 * questions and neither subsumes the other.
 *
 * Owned here, following the domain-fact convention this repo already uses
 * (cf. `EVENTVAR_REFERENCE_ACES`, `IMAGE_FILE_TYPE_EXTENSIONS`,
 * `COMPARISON_OPERATORS`), so downstream need not re-hardcode which files are
 * minified.
 *
 * **Version pin.** Observed C3 r495 (`savedWithRelease: 49500`); r487 unverified
 * for this form.
 *
 * **Detection only.** c3source deliberately ships no minified writer — nothing
 * here writes under `tilemapBrushes/`; a caller who needs the form writes
 * `JSON.stringify(value)` directly. What this table exists to own is *which*
 * files are minified, not how to minify them.
 */
export const C3_MINIFIED_SOURCE_SUFFIXES: readonly string[] = [".brush.json"];

/**
 * True if a bare basename is a known C3 minified-source file (see
 * {@link C3_MINIFIED_SOURCE_SUFFIXES}). Takes a bare basename, matching
 * `isEditorLocalPath`'s argument contract.
 */
export function isMinifiedSourcePath(name: string): boolean {
  return C3_MINIFIED_SOURCE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
