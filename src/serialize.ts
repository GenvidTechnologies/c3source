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
