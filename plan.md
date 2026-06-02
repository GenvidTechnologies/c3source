# Plan: sid-walk export, editor-local classifier, project manifest model + drift detection (#18 / #19)

## Branch

`feat/sid-walk-manifest-drift`

Following the project convention `feat/<topic>` (cf. `feat/export-find-all-files-path`). Addresses GitHub issues **#18** and **#19** in one PR. The durable design record is posted to the issue/PR bodies — **not** kept in `docs/superpowers/` (ephemeral scaffolding, cleaned up on merge per CLAUDE.md).

## Dependencies

None. `main` is clean at `4878d75` (v0.5.0). No prerequisite branches.

## Summary

Three additive, behavior-preserving features in `src/c3source.ts` (re-exported by `src/index.ts` — `export * from "./c3source.js"`, no edit needed):

- **(A) #18** — export the internal `walkSids` as a public segments-based primitive plus `formatSidPath`; refactor `collectSids`/`collectSidsWithPaths` to consume them (byte-identical).
- **(B) #19 minimal** — collapse four duplicated `uistate` skip sites into an exported `isEditorLocalPath` / `EDITOR_LOCAL_EXCLUSIONS` pair.
- **(C) #19 larger** — model the folder-project `project.c3proj` manifest: strict throwing parser, mapping tables, flatteners, and a `detectManifestDrift` primitive that compares manifest-declared membership against disk (editor-local filtered).

**Hard sequencing: B before A before C** (C's drift detector calls B's `isEditorLocalPath`). Each task is one independently green commit. TDD: a failing-test P-step precedes each implementation F-step.

## Data counts verified at plan time

- Skip sites in `src/c3source.ts`: 4 (lines 104, 114, 118, 521).
- `src/c3source.ts` total lines: 967.
- Internal `walkSids` callers: 3 (def line 911, `collectSids` 931, `collectSidsWithPaths` 938). Was private; no other callers.
- Fixture `rootFileFolders` keys: `script`, `sound`, `music`, `video`, `font`, `icon`, `general` (7).
- `scripts/` disk: `main.js`, `importsForEvents.js`, `ts-defs/` (subdir). `icons/`: 7 `.png` files.
- `timelines.subfolders`: one empty subfolder — sufficient to exercise `collectManifestItemNames` recursion (R-C4).
- `objectTypes` fixture: empty `{items:[],subfolders:[]}` — flat-file convention assumed, unconfirmed (carried as a documented caveat).

## Domain assignments

- Tasks 1–8: **genvid-dev:ts-implementer** (all TypeScript).
- Task 9 (docs): **genvid-dev:tech-writer**.
- Task 10: **genvid-dev:validator** then **genvid-dev:code-reviewer**.
- Gate after every F-step: `npm run lint && npm run typecheck && npm run test && npm run build` (validator).

---

## Tasks

### Task 1 — [P-B1] Failing tests for `isEditorLocalPath` / `EDITOR_LOCAL_EXCLUSIONS` — ts-implementer

Add `test/editorLocalPath.test.ts` with assertions R-B2..B5 (R-B1 is the existing-test guard). Imports the not-yet-exported names; fails until Task 2.

```ts
import { isEditorLocalPath, EDITOR_LOCAL_EXCLUSIONS } from "../src/c3source.js";
expect(isEditorLocalPath("uistate")).to.equal(true);                 // R-B2
expect(isEditorLocalPath("foo.uistate.json")).to.equal(true);        // R-B3
expect(isEditorLocalPath("Layout 1")).to.equal(false);               // R-B4
expect(isEditorLocalPath("layout.json")).to.equal(false);            // R-B4
expect(EDITOR_LOCAL_EXCLUSIONS.dirs).to.include("uistate");          // R-B5
expect(EDITOR_LOCAL_EXCLUSIONS.fileSuffixes).to.include(".uistate.json"); // R-B5
```

**Commit:** `test(editorLocalPath): add failing tests for isEditorLocalPath / EDITOR_LOCAL_EXCLUSIONS [WIP]`

---

### Task 2 — [F-B] Implement classifier; collapse 4 skip sites — ts-implementer

Insert near the top of `src/c3source.ts` (after `normalizeLineEndings`, before `find_all_files_path`):

```ts
export const EDITOR_LOCAL_EXCLUSIONS: { dirs: readonly string[]; fileSuffixes: readonly string[] } = {
  dirs: ["uistate"],
  fileSuffixes: [".uistate.json"],
};

export function isEditorLocalPath(name: string): boolean {
  return (
    EDITOR_LOCAL_EXCLUSIONS.dirs.includes(name) ||
    EDITOR_LOCAL_EXCLUSIONS.fileSuffixes.some((suffix) => name.endsWith(suffix))
  );
}
```

Rewrite the 4 sites (verify line numbers at implementation time):
- L104 `if (file === "uistate") return;` → `if (isEditorLocalPath(file)) return;` (safe: L103 already guards `stats.isDirectory()`, so `file` is a dir name)
- L114 `(file) => !file.endsWith(".uistate.json")` → `(file) => !isEditorLocalPath(file)`
- L118 same → `(file) => !isEditorLocalPath(file)`
- L521 `(file) => file.endsWith(".json") && !file.endsWith(".uistate.json")` → `(file) => file.endsWith(".json") && !isEditorLocalPath(file)` (the `.json` gate stays)

**Satisfies (green):** R-B1 (existing `findAllFilesPath.test.ts` + `findLayouts.test.ts` unchanged), R-B2..B5.
**Gate.** **Commit:** `refactor: export isEditorLocalPath / EDITOR_LOCAL_EXCLUSIONS; collapse 4 skip sites (#19)`

---

### Task 3 — [P-A1] Failing tests for `walkSids` / `formatSidPath` / `SidPathSegment` — ts-implementer

Extend `test/sidUtils.test.ts` with new `describe` blocks (R-A2..A5). **Do not modify** existing lines 1-66 — they are the R-A1 byte-identical guard.

```ts
import { walkSids, formatSidPath, type SidPathSegment } from "../src/c3source.js";

describe("walkSids (exported)", () => {
  it("R-A2: delivers correct segment arrays", () => {
    const hits: Array<{ sid: number; segments: SidPathSegment[] }> = [];
    walkSids(sheet, (sid, segments) => hits.push({ sid, segments: [...segments] }));
    const byId = Object.fromEntries(hits.map((h) => [h.sid, h.segments]));
    expect(byId[100]).to.deep.equal([]);
    expect(byId[201]).to.deep.equal(["events", 0]);
    expect(byId[200]).to.deep.equal(["events", 0, "conditions", 0]);
  });
  it("R-A3: index segments are numbers, key segments are strings", () => {
    const hit: SidPathSegment[] = [];
    walkSids(sheet, (sid, segs) => { if (sid === 201) hit.push(...segs); });
    expect(typeof hit[0]).to.equal("string");
    expect(typeof hit[1]).to.equal("number");
  });
  it("R-A4: root delivers empty segments; formatSidPath([]) === ''", () => {
    let rootSegs: SidPathSegment[] | null = null;
    walkSids({ sid: 5 }, (_, segs) => { rootSegs = [...segs]; });
    expect(rootSegs).to.deep.equal([]);
    expect(formatSidPath([])).to.equal("");
  });
  it("R-A5: formatSidPath joiner round-trip", () => {
    expect(formatSidPath(["events", 0, "conditions", 0])).to.equal("events[0].conditions[0]");
  });
});
```

(Confirm the `sheet` fixture/sid values used in the existing tests; align ids with the actual fixture.)

**Commit:** `test(sidUtils): add failing tests for walkSids / formatSidPath / SidPathSegment [WIP]`

---

### Task 4 — [F-A] Export `walkSids` / `formatSidPath` / `SidPathSegment`; refactor internals — ts-implementer

Replace lines 910-940 of `src/c3source.ts`:

```ts
/** A path segment: object key (string) or array index (number). */
export type SidPathSegment = string | number;

/** Render segments into the canonical dotted/indexed path string. Empty segments → "". */
export function formatSidPath(segments: ReadonlyArray<SidPathSegment>): string {
  let out = "";
  for (const seg of segments) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

/** Recursively visit every object carrying a numeric `sid`, with its structured path segments. */
export function walkSids(node: unknown, visit: (sid: number, segments: SidPathSegment[]) => void): void {
  const recur = (n: unknown, segs: SidPathSegment[]): void => {
    if (Array.isArray(n)) {
      n.forEach((item, i) => recur(item, [...segs, i]));
      return;
    }
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      if (typeof obj.sid === "number") visit(obj.sid, segs);
      for (const [key, value] of Object.entries(obj)) {
        if (key === "sid") continue;
        recur(value, [...segs, key]);
      }
    }
  };
  recur(node, []);
}

export function collectSids(node: unknown): Set<number> {
  const sids = new Set<number>();
  walkSids(node, (sid) => sids.add(sid));
  return sids;
}

export function collectSidsWithPaths(node: unknown): Array<{ sid: number; path: string }> {
  const out: Array<{ sid: number; path: string }> = [];
  walkSids(node, (sid, segments) => out.push({ sid, path: formatSidPath(segments) }));
  return out;
}
```

**Satisfies (green):** R-A1 (existing `sidUtils.test.ts` lines 1-66 byte-identical), R-A2..A5.
**Gate.** **Commit:** `feat: export walkSids / formatSidPath / SidPathSegment; refactor collectSids* to consume them (#18)`

---

### Task 5 — [P-C1] Failing tests for manifest model + drift detection — ts-implementer

Add `test/projectManifest.test.ts` covering R-C1..C15. Uses `fixturePath` from `test/fixtureHelpers.ts` (verify exact helper name/path). Groups: parser/type fidelity (R-C1..C7), strict throws (R-C8..C11), drift (R-C12..C15). Full test body per the design doc §Test Criteria — Piece C. Key drift cases:

- R-C12: `detectManifestDrift(FIXTURE_DIR).inSync === true` (proves `ts-defs/` + `uistate/` not flagged).
- R-C13: clone manifest, push `"Phantom Layout"` → `layouts.missingOnDisk === ["Phantom Layout"]`, `inSync === false`.
- R-C14: clone, `layouts.items = []` → `layouts.untracked === ["Layout 1"]`, no `uistate` entry.
- R-C15: clone, `rootFileFolders.script.items = []` → `script.untracked === ["importsForEvents.js","main.js"]`, no `ts-defs`.

**Commit:** `test(projectManifest): add failing tests for manifest model + drift detection [WIP]`

---

### Task 6 — [F-C1] Types + strict parser + mapping tables — ts-implementer

Add to `src/c3source.ts`: all Piece C type exports (`C3NameFolder`, `C3FileEntry`, `C3FileFolder`, `C3RootFileFolders`, `C3ProjectManifest`, `SectionDrift`, `ManifestDrift`); private guards (`assert`, `isRecord`, `assertNameFolder`, `assertFileFolder`, `NAME_SECTIONS`); exported `parseProjectManifest` / `readProjectManifest`; and the mapping tables `C3_SECTION_FOLDERS` / `C3_ROOT_FILE_FOLDERS` (parser iterates `Object.keys(C3_ROOT_FILE_FOLDERS)`, so tables land in this commit). Exact code per design §(1)(2)(3). **Absent modeled section = tolerate** (no throw). Do NOT add flatteners or detector yet.

Add a doc comment on `C3_SECTION_FOLDERS.objectTypes` (flat convention assumed, unconfirmed) and on `C3_ROOT_FILE_FOLDERS` (script/icon confirmed; other 5 inferred, shipped, c3source owns the fix).

**Satisfies (green):** R-C1, R-C2, R-C3, R-C5, R-C6, R-C7, R-C8, R-C9, R-C10, R-C11. (R-C4 still red; R-C12..15 still red.)
**Gate.** **Commit:** `feat(manifest): export C3ProjectManifest types, strict parser, mapping tables (#19)`

---

### Task 7 — [F-C2] Flatteners — ts-implementer

Add exported `collectManifestItemNames(folder: C3NameFolder)` and `collectManifestFileNames(folder: C3FileFolder)` per design §(3).

**Satisfies (green):** R-C4.
**Gate.** **Commit:** `feat(manifest): add collectManifestItemNames / collectManifestFileNames flatteners (#19)`

---

### Task 8 — [F-C3] Drift detector + private disk helpers — ts-implementer

Add `detectManifestDrift(projectDir, manifest?)` and helpers `diskNameFolderItems`, `diskFileFolderNames`, `diffNames` per design §(4). Check the top-of-file `node:fs` import and add `existsSync` if absent (current import has `readFileSync`/`readdirSync`/`statSync`/`writeFileSync`); add `import path from "node:path"` if absent.

**Crucial:**
- `diskNameFolderItems` → `find_all_files_path` (recursive), `.json` + `!isEditorLocalPath`, basename minus `.json`.
- `diskFileFolderNames` → `readdirSync` + `statSync().isFile()` (**shallow** — the `ts-defs/` mitigation; do NOT use `find_all_files_path`), filtered by `!isEditorLocalPath`.
- Both depend on Task 2's `isEditorLocalPath` (B→C dependency).
- Absent section → treated as empty (tolerate).

**Satisfies (green):** R-C12, R-C13, R-C14, R-C15. Full suite green.
**Gate.** **Commit:** `feat(manifest): add detectManifestDrift primitive with shallow file-folder walk (#19)`

---

### Task 9 — [F-docs] README + CLAUDE.md + docs/design-patterns.md — tech-writer

1. **README.md** (~lines 11-13, the `.c3p`/`.c3proj` archive caveat) — add a sentence distinguishing the unsupported single-file archive from the now-modeled folder `project.c3proj` manifest (`C3ProjectManifest`, `parseProjectManifest`/`readProjectManifest`, `detectManifestDrift`).
2. **CLAUDE.md** architecture section — name the new primitives: `walkSids`/`formatSidPath`/`SidPathSegment` near the sid description; `isEditorLocalPath`/`EDITOR_LOCAL_EXCLUSIONS` near the uistate skip-rule description; the manifest model + `detectManifestDrift` as a brief new functional area / note.
3. **docs/design-patterns.md** — record (a) `isEditorLocalPath`/`EDITOR_LOCAL_EXCLUSIONS` as the canonical editor-local filter replacing the 4 inline checks; (b) `walkSids`/`formatSidPath` as the traversal-vs-rendering split; (c) the shallow-vs-recursive disk-walk distinction in `detectManifestDrift` and why (`ts-defs/` mitigation).

**Gate.** **Commit:** `docs: document walkSids, isEditorLocalPath, manifest model, and detectManifestDrift primitives (#18 #19)`

---

### Task 10 — Validate + code review — validator, code-reviewer

`npm run lint && npm run typecheck && npm run test && npm run build`, then dispatch `genvid-dev:code-reviewer` to verify:
- No new runtime dependencies (`package.json` deps unchanged).
- `src/index.ts` still `export * from "./c3source.js"` only.
- `test/sidUtils.test.ts` lines 1-66 byte-identical (R-A1 guard).
- All 4 former skip sites go through `isEditorLocalPath`.
- `diskFileFolderNames` uses `readdirSync` + `statSync().isFile()` (shallow), NOT `find_all_files_path`.
- `diskNameFolderItems` uses `find_all_files_path` (recursive).
- All 15 R-* criteria have a passing test.
- No `docs/superpowers/` file committed on the branch.

---

## Risks

| Risk | Mitigation |
|---|---|
| **R-A byte-identical regression** — `formatSidPath` must replay the old builder's rules exactly. | R-A1 pins exact `byPath` values (`sidUtils.test.ts` 42-46); R-A5 pins round-trip. Run suite after Task 4. |
| **R-B behavior preservation at 4 sites** — a wrong rewrite re-admits `uistate/` into collectors. L104 is dir-guarded; L114/118 are file basenames; L521 keeps `.json` gate. | R-B1 (existing `findLayouts.test.ts` + `findAllFilesPath.test.ts`) is the regression guard. Verify line numbers at execution. |
| **B→C ordering** — C's detector calls B's predicate; if C lands first it references an undefined symbol. | Sequencing enforces B (Task 2) before C (6-8); typecheck gate catches order slips. |
| **`objectTypes` convention unconfirmed** — empty fixture. | Documented code comment + R-C6 test comment; carried as design open decision. Detector assumes flat `objectTypes/<name>.json`. |
| **Inferred plural folders** — only `scripts`/`icons` fixture-confirmed. | `C3_ROOT_FILE_FOLDERS` comment marks confirmed vs inferred; all 7 shipped (c3source owns the fix); policy stays downstream. |
| **`ts-defs/` counted as untracked** — if `diskFileFolderNames` uses recursive walk → construct3-chef#36 regression. | R-C15 is the explicit guard; code reviewer checks shallow `readdirSync`. |
| **`existsSync` import** — helpers need it. | Task 8 note: add to `node:fs` destructure if absent. |

## Session estimate

Single session, 10 sequential tasks, each a narrow diff. ~90-120 min including per-F-step gates.
