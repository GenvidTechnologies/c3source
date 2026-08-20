# 0017. Tolerant `project.c3proj` read mode

- **Status:** accepted
- **Date:** 2026-07-29
- **Issue:** #58 (sibling: #57)

## Context

`parseProjectManifest`/`readProjectManifest` are strict-and-throwing with no
opt-out: any shape violation anywhere in the manifest throws `Error("invalid
project.c3proj: …")` and hands back nothing. This blocked three separate
`construct3-chef` adoptions — most concretely chef's local `readUsedAddons`
(`construct3-chef#136`, `construct3-chef#145`), which needs to read manifests
that are missing `savedWithRelease` or carry a `usedAddons` entry with no
`author`. A repair tool that refuses to open the manifests most in need of
repair has an unacceptable failure mode: the documents most likely to need
fixing are precisely the ones most likely to be field-level incomplete.

This decision depends on [ADR 0016](0016-c3-source-json-serialization-form.md)
for its write-side conclusion: the manifest can now be written back
(`serializeProjectManifest`/`writeProjectManifest`/`C3Project.writeManifest`),
which is what makes "read tolerantly, repair, write back" a real workflow rather
than a read-only diagnostic.

This is a direct application, one level up the stack, of [ADR
0009](0009-editor-strict-validation.md)'s recorded split for event sheets:
"parse stays permissive for reading, validation is opt-in for write-safety."
[ADR 0011](0011-c3-expression-tokenizer.md) is the rejected tolerance idiom this
decision explicitly avoids repeating (see Compromise).

## Decision

Add a lenient parse path that returns the document **and** the diagnosis,
rather than either throwing or silently degrading:

- `validateProjectManifest(json: unknown): ManifestValidationIssue[]` —
  detection-only, never throws, returns `[]` for a well-formed manifest.
  `ManifestValidationIssue` is `{path, rule, message}`, where `rule` is the
  exported `ManifestShapeRuleId` union (one id per distinct shape check, e.g.
  `"saved-with-release-number"`, `"used-addon-author"`) and `message` is the
  exact text `parseProjectManifest` throws after the `"invalid project.c3proj:
  "` prefix.
- `parseProjectManifestTolerant(json: unknown): ManifestReadResult` and
  `readProjectManifestTolerant(manifestPath: string): ManifestReadResult`, where
  `ManifestReadResult` is `{manifest, issues}` — the document (returned by
  identity, never cloned or projected) paired with every violation found in it.

The typed `ManifestShapeRuleId` union is what makes "tolerant *except these
rules*" expressible: a caller filters `issues` by `rule` (e.g. ignore
`"saved-with-release-number"` and `"used-addon-author"` but still act on
everything else) instead of an all-or-nothing tolerance switch.

**One shared collector.** Both the strict and tolerant paths are thin callers of
a single private recursive walk, `collectManifestIssues`, which the previous
`assert*` family (`assertNameFolder`, `assertFileFolder`, `assertContainer`,
`assertUsedAddon`, …) was inverted into:

```ts
function collectManifestIssues(json: unknown): ManifestValidationIssue[] { … }

export function validateProjectManifest(json: unknown): ManifestValidationIssue[] {
  return collectManifestIssues(json);
}

export function parseProjectManifest(json: unknown): C3ProjectManifest {
  const issues = collectManifestIssues(json);
  if (issues.length > 0) throw new Error(`invalid project.c3proj: ${issues[0].message}`);
  return json as unknown as C3ProjectManifest;
}
```

This is a direct consequence of [ADR 0005](0005-single-canonical-traversal-walk.md)
("one canonical recursive walk per traversal; collectors/finders/visitors are
thin consumers") applied to shape validation: without one shared collector, the
codebase would gain a second, parallel implementation of the manifest shape
rules — the exact drifting-parallel-walk anti-pattern this repo has already paid
to remove three times (`collectManifestItemNames`→`walkManifestNameTree`,
`extractScriptsFromSheet`→`visitEvents`, the four inline editor-local skip
sites→`isEditorLocalPath`).

**Emission-order invariant.** `issues[0]` must always be the same violation the
old sequential `assert*` family threw first, for every input — not just the
pinned test cases. Concretely: top-level `isRecord` → `name` → `runtime` →
`projectFormatVersion` → `savedWithRelease`, then the name sections in
declaration order, then `rootFileFolders` categories in table order, then
`containers`, then `usedAddons`; and within a name/file-folder node, `isRecord`
→ `items` → `subfolders` → `name` **checked last** (matching the pre-refactor
order — easy to "tidy" into checking `name` first, which would silently change
which message a doubly-malformed manifest reports). Purity of the inversion was
proven with an exactly-empty `scripts/api-surface.mjs` diff (value-and-type
pair) plus the 7 pre-existing message-regex tests
(`test/projectManifest.test.ts`, `test/usedAddons.test.ts`) passing **unedited**.

**Strict stays the default** with byte-identical message text — `readProjectManifest`
and `parseProjectManifest`'s existing callers are unaffected by construction.

**Two documented throw exceptions in "tolerant" mode:**
1. A non-object top level (`42`, `null`, `[]`, …) still throws `invalid
   project.c3proj: top-level value must be an object` — there is no document to
   hand back, and returning `{} as C3ProjectManifest` would be a lie. Tolerance
   is about field-level shape, not "is this a manifest at all."
2. `readProjectManifestTolerant` propagates `ENOENT` and `SyntaxError` unchanged,
   exactly like `readProjectManifest` today — these are I/O/syntax failures, not
   shape failures. A caller that wants to own them composes
   `parseProjectManifestTolerant(JSON.parse(text))` itself.

**Defensive walkers, not throws, at the four sites downstream of a tolerant
manifest** (`walkManifestNameTree`, `walkManifestFileTree`, `detectManifestDrift`'s
`rootFileFolders` category lookup, `detectContainerDrift`'s member iteration):
each now guards with `Array.isArray(...)`/`isRecord(...)` before recursing
instead of trusting shape and crashing with a raw `TypeError`. This is a pure
in-memory tree walk with no business owning manifest error text — the repo's
established convention for "the thing isn't there" is graceful-empty (every
`findAll*`, `getUsedAddons`'s `?? []`, the `walkDisk*` family's `existsSync`
early return), not a throw.

**The write path stays deliberately un-gated.** `serializeProjectManifest`,
`writeProjectManifest`, and `C3Project.writeManifest` (see [ADR
0016](0016-c3-source-json-serialization-form.md)) do not call
`validateProjectManifest` themselves. A validating writer would reject exactly
the repair #58 was filed about — writing back a manifest that a caller
tolerantly read, fixed one field of, and still doesn't fully conform (e.g. it
still lacks `savedWithRelease`). The gate ships anyway, for free: because
`validateProjectManifest` is exported, a caller who wants write-safety already
has the precise tool to call first.

## Compromise

- **Options bag** — `parseProjectManifest(json, opts?: {validate?: boolean})` —
  rejected. Smallest API growth, and exactly what the issue originally sketched,
  but it is a boolean flag argument (the function does two different things
  depending on a flag) and it adopts the `extractExpressionReferences` idiom
  ([ADR 0011](0011-c3-expression-tokenizer.md)): the caller gets a degraded
  result **with no channel to learn it degraded**. That is the wrong half of
  the tradeoff for a repair tool, which specifically wants to know *what* it
  tolerated, not just that it tolerated something.
- **Errors-as-values `tryReadProjectManifest`** — rejected, **disqualifying**:
  `{manifest} | {error: string}` puts the caller's manifest behind the success
  branch only, so on the error branch the caller gets **no manifest at all** —
  precisely backwards for "the manifests most in need of repair are the ones
  most likely to be incomplete." It is also path-only, leaving chef's
  in-memory `readUsedAddons` case (parsing an already-`JSON.parse`d value)
  unserved without a second `try*` twin.
- Both alternatives were weighed directly against this repo's two existing
  tolerance idioms — silent-partial-no-error-channel ([ADR
  0011](0011-c3-expression-tokenizer.md)) and collected-issue-list ([ADR
  0009](0009-editor-strict-validation.md)) — and the collected-issue-list shape
  (`{manifest, issues}`) was chosen because it is strictly more informative than
  either rejected option: it returns the document **and** the diagnosis.

## Consequences

- `ManifestValidationIssue.rule`'s `ManifestShapeRuleId` union is the
  observability channel that turns "tolerant" into "tolerant except these
  rules" — the workflow chef's `sync-addon-version` actually needs.
- The strict and tolerant paths cannot diverge: both are thin callers of the
  one `collectManifestIssues` collector, so a future new shape rule is added
  once and is automatically visible to both.
- A genuine follow-up is named rather than folded in here:
  `validateProjectManifestForEditor(m)`, the `project.c3proj` analogue of
  `EDITOR_FIELD_RULES` ([ADR 0009](0009-editor-strict-validation.md)), modelling
  what the **C3 editor loader** rejects on open — a different notion of "valid"
  from `validateProjectManifest`, which models c3source's own shape contract.
  The naming is chosen now to reserve that space cleanly (`validateProjectManifest`
  = shape, `validateProjectManifestForEditor` = loader), matching the existing
  `validateForEditor` suffix convention, so the distinction survives the squash
  even though the loader-strictness validator itself is not built yet.
