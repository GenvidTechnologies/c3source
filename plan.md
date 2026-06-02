# Plan: function-signature + includes extractors (#23, #24)

Two additive, backward-compatible extractor enhancements to `src/c3source.ts`,
motivated by the `c3-domain-manager` integration (downstream
genvid-holdings/c3-domain-manager#5), which currently duplicates these walks.

Branch: `feat/function-signature-and-includes-extractors`

## Task 1 — #23: enrich `ExtractedFunction` with signature + type guard

The signature data is already in hand: both `FunctionBlockEvent` and
`CustomAceBlockEvent` extend `FunctionLikeEvent` (`functionParameters`,
`functionReturnType`).

- `test/extractFunctions.test.ts`: update the two existing `deep.equal`
  expectations to include `params`/`returnType`; add a case with a non-empty
  `functionParameters` and a non-`none` return type; add `isFunctionDefinition`
  cases (true for function-block/custom-ace-block, false for others).
- `ExtractedFunction` (c3source.ts:912): add `params: FunctionParameter[]` and
  `returnType: string`.
- `extractFunctions`: populate both fields from `event.functionParameters` /
  `event.functionReturnType` in both branches.
- Add exported `isFunctionDefinition(e): e is FunctionBlockEvent | CustomAceBlockEvent`.

One commit.

## Task 2 — #24: add `extractIncludes(sheet)` extractor

`IncludeEvent` is a non-counting event, so its canonical coordinate is its
`jsonPath` (eventNumber is always null for includes — omitted to avoid an
always-null footgun). Richer return mirrors `collectSidsWithPaths` `{sid, path}`.

- `test/extractIncludes.test.ts` (new): includes collected in event order;
  nested includes inside groups/blocks reached; `[]` when none.
- `IncludeReference { includeSheet: string; jsonPath: string }` interface.
- `extractIncludes(sheet: EventSheet): IncludeReference[]` driving `visitEvents`,
  sibling to `extractFunctions`/`walkScriptActions`.

One commit.

## Gates

`npm run lint && npm run typecheck && npm run test && npm run build` all green.
Then code-review; offer tech-writer for a one-line CLAUDE.md extraction-section
mention of the new extractors.

(This plan.md is removed at PR creation per project convention.)
