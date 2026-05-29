# Plan: Enrich c3source (type fields, in-memory visitors, shared event counter, primitives, scene-graph helpers)

Work request: `construct3-chef/initiatives/upstream-package-extraction/c3source-work-request.md`.
Branch: `work-request` (current with `origin/main`). All logic stays in the single module `src/c3source.ts`; `src/index.ts` (`export * from "./c3source.js"`) is untouched.

## Approved decisions (final)

- **§2**: bake `[DISABLED] ` prefix into `formatCondition` itself (sanctioned, documented output change).
- **§3b**: `EventVisitor` returning `false` = stop descent into that node's children only; continue siblings + rest of tree (NOT halt whole walk).
- **§5**: included in this plan.
- **Module layout**: keep all new code in `src/c3source.ts` (single-module convention).
- **Event counter**: extract a private shared `walkEventsCore` that owns the C3 numbering counter + pre-order descent; both `visitEvents` and a refactored `extractScriptsFromSheet` drive it so `eventNumber === eventIndex` by construction. Fallback: a shared `createEventNumberer()` counter object + `isCountingEvent` predicate leaving `extractScriptsFromSheet`'s scope recursion intact.
- **visitLayers**: `visitLayers(layers, visitor, prefix="")` + `visitLayout(layout, visitor)` seeding `layout.name`; `visitInstances(layout, visitor)` reuses `makeLayerVisitorFromInstanceVisitor`. Private `visit_layer` becomes the recursion helper.
- **jsonPath**: inline string building, format `events[i]` / `events[i].children[j]`, root `events`.

## Test bed (hybrid)

Real C3 export committed at `test/fixtures/sample-project/` (v1: one layout + complete default layer, one empty event sheet). Used as ground truth for §1 field fidelity, §5 `makeDefaultLayer` values, and one path-visitor integration test. §3b counter-agreement and per-function tests use small **inline** fixtures (legible expected values). Fixture-dependent assertions use `existsSync`/content guards so they self-activate as the export grows:

- **v1 (present)**: unlocks `makeDefaultLayer` ground truth, `Layout.width/height/eventSheet`, `Layer.overriden:0`, layout discovery.
- **v2 (add later in C3)**: disabled condition + disabled action + OR block → §1a `disabled`/`isOrBlock` fidelity + §2 real disabled condition.
- **v3 (add later)**: global layer override (`overriden:1`) + two parented instances → §5 scene-graph fields against real data.

Discovery contract (verified `src/c3source.ts:49-72,288-296`): path visitors recurse a directory tree, include every file except `*.uistate.json` (event sheets also require `.json`). Fixture's inner `.gitignore` excludes `*.uistate.json` (C3 convention) — uistate-skip is covered by tmp-file round-trip tests, not the committed fixture.

## Verified current state

- Missing optional fields to ADD: `Condition.disabled?` (`:169-176`); `BlockEvent.disabled?` + `isOrBlock?` (`:186-192`); `FunctionLikeEvent.disabled?` (`:195-206`); `Layout.eventSheet?`/`width?`/`height?` (`:36-41`); `Layer.overriden?: 0|1` (`:28-34`, keep C3's single-r misspelling). `GroupEvent.disabled` stays REQUIRED (`:222`). `Layer.subLayers?: Layer[]` already correct.
- `isScriptAction` already exists at `:303` — only needs `export`.
- `formatCondition` `:307-315`; `formatAction` `:331-340` (already prefixes — untouched).
- Counter inline in `extractScriptsFromSheet` `:409-520`, local `eventCounter` `:411`; increments on group/block/function-block/custom-ace-block; not on variable/comment/include; pre-order. `#<eventIndex>` scope-key disambiguator `:512` rides the same counter. **23** existing `it()` blocks pin behavior (incl. Outer=1/Inner=2/empty=3/script=4 and scopeKey strings).
- `generateFunctionName(sheetName,eventIndex,actionIndex)` → `${sanitized}_Event${eventIndex}_Act${actionIndex}` (`:526`).
- `makeDefaultLayer` ground truth: the layer in `test/fixtures/sample-project/layouts/Layout 1.json` (23 fields). Downstream cross-ref: `construct3-chef/src/c3/layoutMutator.ts:94` (`buildLayer`).

## Tasks (each = one commit, all `genvid:ts-implementer`, gate `pnpm run lint && typecheck && test && build` after each)

1. **chore: add test fixtures + loadFixture helper** — commit `test/fixtures/sample-project/`; add `test/fixtureHelpers.ts` with `loadFixture(relPath): string` (reads relative to `test/fixtures/`, utf-8) and a `fixtureExists(relPath): boolean`.
2. **feat: add optional type fields** (§1) — add the fields listed above; no `isOrBlock` on `FunctionLikeEvent`; `GroupEvent.disabled` unchanged. Test: `test/typeFields.test.ts` (compile-time `satisfies`).
3. **test: fixture §1 field-fidelity** (§1) — `test/fixtureFieldFidelity.test.ts`: load `Layout 1.json`, assert `width/height/eventSheet`, layer `overriden ∈ {0,1}`; assert `Condition.disabled` is boolean when present (self-skips on empty sheet via guard).
4. **refactor: extract isCountingEvent predicate** (§3b) — private predicate (temporarily exported for test; removed in Task 7). Test: `test/eventCounter.test.ts` true for group/block/function-block/custom-ace-block, false for variable/comment/include.
5. **test: failing agreement fixture (TDD red)** (§3b) — multi-group nested inline fixture; assert `visitEvents` `eventNumber` == `extractScriptsFromSheet` `eventIndex` per counting node, pinned Outer=1/Inner=2/empty=3/script=4; `eventNumber` null for variable/comment/include; jsonPath `events[0]`/`events[0].children[0]`; depth increments; `false` stops descent into that node's children only (siblings still visited). Red state preserved (visitEvents undefined).
6. **feat: EventVisitContext/EventVisitor/walkEventsCore/visitEvents** (§3b) — turns Task 5 green.
7. **refactor: drive extractScriptsFromSheet counter through walkEventsCore** (§3b) — preserve `#<eventIndex>` disambiguator and all 23 tests; remove temporary `isCountingEvent` export.
8. **feat: visitLayers/visitLayout/visitInstances** (§3a) — `test/layerVisitor.test.ts` in-memory: per-layer incl. subLayers, global-prefix reset (`global.LayerName`), summed count, instance visitor.
9. **refactor: thin-wrap file walkers via visitLayout** (§3a) — `visit_layers_in_layout` = read→parse→`visitLayout`→write-if-count>0 (tab indent, rule at `:104`). Tests: tmp-file round-trip (count 0 = no rewrite; count>0 = tab-indented rewrite); path-visitor integration on `test/fixtures/sample-project/layouts` (self-skip if absent) asserting layout discovery + uistate skip.
10. **feat: [DISABLED] prefix in formatCondition + doc** (§2) — new disabled-path tests; existing 3 enabled-path tests stay green.
11. **feat: export isScriptAction; add hasChildren/hasActions/hasConditions/walkScriptActions** (§4a) — `walkScriptActions` reuses `visitEvents`. Test: `test/scriptActionUtils.test.ts`.
12. **feat: collectSids/collectSidsWithPaths/findSid** (§4b) — slots event|condition|action|function-parameter. Test: `test/sidUtils.test.ts`.
13. **feat: extractFunctions** (§4c) — function-block + custom-ace-block discovery with jsonPath + eventNumber. Test: `test/extractFunctions.test.ts`.
14. **feat: scene-graph instance fields + addSceneGraphRoot/removeSceneGraphRoot** (§5) — type `uid`/`parent-uid`/`sceneGraphData`/`instanceFolderItem`, `Layout["scene-graphs-folder-root"]`. Test: `test/sceneGraph.test.ts`.
15. **feat: remapInstanceIds** (§5) — uid/parent-uid/children[].uid via uidMap; instanceFolderItem.sid/uid via maps; recurse folder children; identity for unmapped.
16. **feat: makeDefaultLayer** (§5) — return full default `Layer`; source field values from `test/fixtures/sample-project/layouts/Layout 1.json` (fallback `construct3-chef/src/c3/layoutMutator.ts:94`). Always set `name`, `instances: []`. Test: name + all required keys present; fixture key-parity assertion (self-skip if absent).
17. **Final full validation gate** — `pnpm run lint && typecheck && test && build`; zero warnings/errors, dist emitted.

## Ordering rationale

Fixture seam (1) before fixture tests (3,9,16). `isCountingEvent` (4) → failing agreement fixture (5) → `walkEventsCore`/`visitEvents` (6) → `extractScriptsFromSheet` refactor (7): TDD red-before-green guards the highest risk. `visitLayout` (8) before file-walker refactor (9). `visitEvents` (6/7) before §4 (11-13). §5 instance types (14) before `makeDefaultLayer` (16). §2 (10) placed after the counter refactor to keep its blast radius separate.

## Risks

1. **Counter-refactor regression (Task 7)** — re-threading could shift `eventIndex`/scopeKey. Mitigation: failing agreement fixture (Task 5) before `walkEventsCore`; 23 existing tests are the gate; fallback counter-object approach if scope re-threading fights the code.
2. **`formatCondition` output change (Task 10)** — sanctioned/documented; enabled-path tests confirm no regression.
3. **`makeDefaultLayer` data (Task 16)** — de-risked: real fixture layer present; downstream `buildLayer` as cross-check.
4. **false-stop semantics (§3b)** — pinned by Task 5's sibling-still-visited assertion.
