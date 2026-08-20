# 0002. One canonical event-numbering counter in `visitEvents`

- **Status:** accepted
- **Date:** 2026-05-29
- **Issue:** #3

## Context

Event-sheet extraction must mirror **C3's own event numbering**: groups, blocks,
function-blocks, and custom-ace-blocks each increment the counter, while
variables, comments, and includes do not. Several extractors need those numbers —
`extractScriptsFromSheet`, `generateFunctionName`, and the `eventIndex` — and if
each ran its own depth-first walk with its own counter, the numbering would drift
between them and the C3-numbering rules would be duplicated.

## Decision

The canonical counter lives in **one walk**, `visitEvents`, which exposes each
event's `eventNumber` via `EventVisitContext`. Every extractor is a thin consumer
of that single walk: `extractScriptsFromSheet`, `walkScriptActions`,
`extractFunctions`, and `extractIncludes` read their event numbers from it, so
`eventNumber`, `eventIndex`, and `generateFunctionName` cannot drift apart.

## Compromise

Letting each extractor do its own DFS is simpler per-extractor and avoids coupling
them to `visitEvents`' context shape, but it re-encodes the C3-numbering rules in
several places and invites drift. We chose the single-source walk, accepting the
coupling of every extractor to one context type.

## Consequences

New extractors should consume `visitEvents` rather than re-walk the tree. The
C3-numbering rules live in exactly one place. Non-counting events
(variables/comments/includes) surface `jsonPath` rather than an `eventNumber`.
This establishes the single-source-walk principle that [ADR 0005](0005-single-canonical-traversal-walk.md)
later generalizes to the rest of the traversal API.
