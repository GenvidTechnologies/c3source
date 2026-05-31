# Design Patterns

Conventions and reusable patterns specific to `c3source`. For the high-level
architecture and the two functional areas (layout traversal, event-sheet
extraction), see `CLAUDE.md`.

## Single-source event numbering

C3 assigns each "counting" event (group / block / function-block /
custom-ace-block — **not** variable / comment / include) a 1-based,
depth-first, pre-order number. That number is what the C3 editor shows and what
`generateFunctionName` bakes into generated script names, so anything that
reports event coordinates **must** agree with it.

There is exactly one walk that owns this counter: `visitEvents`, which exposes
each event's number via `EventVisitContext.eventNumber` (`null` for
non-counting events). Consumers that also need the number — e.g.
`extractScriptsFromSheet` — do **not** keep their own counter. Instead they run
`visitEvents` once to build a `Map<EventSheetEvent, number>` keyed by object
reference, then read each event's number from the map:

```ts
const eventNumbers = new Map<EventSheetEvent, number>();
visitEvents(sheet.events, (event, ctx) => {
  if (ctx.eventNumber !== null) eventNumbers.set(event, ctx.eventNumber);
});
// ...later, during the scope-aware traversal:
const currentEventIndex = eventNumbers.get(event)!; // counting events are always present
```

Map-by-reference is safe because every parsed event is a distinct object. The
payoff: `eventNumber`, `eventIndex`, and `generateFunctionName` cannot drift,
because the numbering rule (`isCountingEvent` + pre-order descent) lives in one
place. When adding a new walk that needs C3 coordinates, build it on
`visitEvents`; never re-implement the counter.

**Regression guard.** The invariant is pinned by two test sets that any counter
refactor must keep green: the `visitEvents` ↔ `extractScriptsFromSheet`
agreement test in `test/eventCounter.test.ts` (asserts `eventNumber` equals
`eventIndex` for every counting event on a multi-group/nested fixture, plus the
absolute values `Outer=1, Inner=2, …`), and the original extraction tests in
`test/extractEventSheetScripts.test.ts`, which fix the exact event/scope
coordinates. If you touch the numbering or the traversal order, those tests are
the proof it still matches C3 — do not weaken them.

## One traversal, everything else is a thin consumer

The layer walk has a single recursive implementation: the internal
`walkLayerEntries` generator. It yields a `LayerEntry` per layer — bare `name`,
the dotted/global-resetting `fullName`, the root-first `ancestors` chain
(excludes the layer itself), the `parent` sibling array, and the `index`. Every
public walker/finder is a thin consumer of that one generator:

- `visitLayers` / `visitLayout` / `visitInstances` iterate it and **sum the
  `LayerVisitor` mutation count** (no early-exit — they walk the whole tree).
- `findLayerEntry` / `findLayer` / `findLayerByName` / `findLayerEntryInLayout`
  iterate it and **stop on the first predicate hit** (the generator halts when
  the consumer `return`s). `findLayerEntry` is the core; the others are
  conveniences (layer-only, bare-name match, layout-name-seeded). Callers build
  any name shape the generator does not hardcode — e.g. a `>`-separated,
  non-resetting display name — from the `ancestors` chain.

The file-based `visit_*_in_layouts` wrap the visitors — read → parse → call the
in-memory visitor → **write only when the summed mutation count is > 0**
(tab-indented, to match C3). The "write-if-changed" rule stays in the file
wrapper, never in the in-memory visitor. Add new traversal behavior to
`walkLayerEntries` (or a new thin consumer of it) so every path inherits it;
never re-implement the recursion.

The walk is **fully recursive** through `subLayers` (an earlier version
descended only one level). `visitLayout`/`findLayerEntryInLayout` seed the
dotted prefix with the layout name (`LayoutName.LayerName`); a layer flagged
`global` resets the prefix to `global`.

## Testing: real-export ground truth + inline legibility

Schema-fidelity facts ("which fields does C3 actually write?", "what are a
default layer's keys?") are verified against a **real C3 project export**
committed under `test/fixtures/` (saved from the C3 editor, not hand-written).
A C3-emitted `.gitignore` inside the export excludes `*.uistate.json`.
Fixture-dependent tests self-skip via `fixtureExists(...)`/`this.skip()` so the
suite stays green as the export grows and so capabilities not yet present in
the fixture (e.g. a disabled condition) activate automatically once added.

Guard schema drift with a **key-parity test**: assert a generated structure's
key set equals a real export's (see `makeDefaultLayer.test.ts`). This catches C3
adding/removing fields without pinning brittle values.

Assertions whose expected values must stay legible — above all the event-counter
agreement test — use **small inline fixtures** where the expected numbers are
obvious (`Outer=1, Inner=2, …`), not a large real sheet where "why is this
event #47?" is opaque.
