# 0022. Domain-fact audit convention: confidence labels, evidence not verdicts

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #68

## Context

[ADR 0008](0008-c3-domain-fact-tables.md) established C3 domain facts as
exported tables but said nothing about *how a table gets validated*. Its own
addendum (2026-08-03, #60) records two consecutive seeding failures for
`C3_PSEUDO_OBJECT_CLASSES` in a single feature. This audit (#68) went further:
it found the pre-existing tables were in fact wrong in two places (see the
ADR 0008 amendment below), and — more importantly — found that the seeding
*method* had no way to distinguish "checked and clean" from "never checked".

## Decision

Three parts:

1. **Each table carries a confidence label in its JSDoc**, extending the
   `KNOWN INCOMPLETE`/`UNVALIDATED` flags `C3_PSEUDO_OBJECT_CLASSES` and
   `NON_ATTRIBUTABLE_ADDON_TYPES` already used (`src/references.ts`):
   `AUDITED` / `KNOWN INCOMPLETE` / `UNVALIDATED` / `NOT CORPUS-AUDITABLE` —
   the last must name the evidence source that *would* validate it. Each
   label is paired with the **blast radius of being wrong**, which differs
   sharply per table (e.g. a missing `EVENTVAR_REFERENCE_ACES` id is a
   detection miss; `NON_ATTRIBUTABLE_ADDON_TYPES` being wrong only suppresses
   a warning) and was documented nowhere before.

2. **The scanner reports partitions; the maintainer produces the verdict.**
   `scripts/scan-domain-facts.mjs` never concludes a table is correct. Every
   classification is either a membership test against a table imported from
   `dist/`, or deliberately dumb bucketing a human reads. Rationale:
   `scripts/*.mjs` is unlinted, untypechecked, untested and not in CI, so a
   probe bug must yield *odd-looking evidence a human notices*, never a wrong
   conclusion baked into a table. This generalizes the rule already stated in
   `scripts/scan-references.mjs` (report raw frequency, never the library's
   deduped view).

3. **Numbers live in `docs/domain-fact-audit.md`; labels live in JSDoc.**
   Split by rot rate: JSDoc is copied into `dist/*.d.ts` and shipped, and
   "audited against 14 projects" is false the day a 15th project appears,
   whereas a label (`AUDITED`, etc.) is not falsified by corpus growth. State
   this as a rule so a future author doesn't helpfully paste the counts back
   into JSDoc.

**Also record the audit's most reusable finding:**
`https://editor.construct.net/r{NNN}/` is a permanently-hosted, fetchable
primary source for every C3 release, and for several tables it is **strictly
better evidence than corpus scanning** — `plugins/allAces.json` is C3's
authoritative ACE table (it proved `EVENTVAR_REFERENCE_ACES` complete and
`is-boolean-eventvar-set` fabricated), and bisecting `projectResources.js`
across releases pins exactly when a field appeared (that is how `fileType`
was pinned to r402, where the corpus could only bracket it between releases
39700 and 40702). A corpus answers *what values occur*; the editor bundle
answers *what the mechanism is* — precisely the distinction ADR 0008's
addendum says a corpus structurally cannot make. See
`docs/domain-fact-audit.md`'s ["A better validation
channel"](../domain-fact-audit.md#a-better-validation-channel-editorconstructnet)
section for the full detail.

## Compromise

- **A verdict-producing scanner** (probes that assert a table is correct) —
  rejected: concentrates trust in the least-verified code in the repo. An
  unlinted, untested dev script is the wrong place to host a pass/fail claim
  that then gets treated as ground truth.
- **Counts embedded in JSDoc** — rejected: ships rotting claims to consumers
  in `.d.ts`. "26,184 ACEs across 14 projects" is a fact about *this audit's
  corpus*, not about C3, and does not belong in a comment shipped to every
  installer of the package.
- **Wiring the scan into CI** — rejected, and this is not merely undesirable
  but **impossible**: the corpus is machine-local working directories, not
  repo content (`docs/domain-fact-audit.md`'s corpus inventory table lists
  labels and releases, no paths). There is nothing for CI to check out.
- **Extending `scripts/scan-references.mjs` instead of a new script** —
  rejected: different lifecycles (one table's audit history vs. six), and a
  bug introduced by six new probes could break the existing single-table
  audit tool that #60 already depends on.

## Consequences

- `scripts/scan-domain-facts.mjs` is ~750 lines of dev-only scanner with
  **zero automated verification** — no lint, no typecheck, no test, not in
  CI. Mitigated by: evidence-not-verdicts (point 2), imported predicates
  (probes call the real `dist/` exports rather than re-approximating them —
  see the `Import the real predicate` lesson), and a first-run cross-check
  against independently-measured figures (the 12-image-node discrepancy
  `docs/domain-fact-audit.md` records under "Honesty note" was caught this
  way).
- The labels themselves require maintenance — an `AUDITED` label is a claim
  with a date behind it in `docs/domain-fact-audit.md`; a future author
  changing a table's shape must re-derive the label, not just leave it in
  place.
- `docs/domain-fact-audit.md` is the numbers half of this convention; see
  [ADR 0023](0023-pre-r402-image-serialization-drift-degradation.md) for the
  first table this audit found genuinely wrong, and the [ADR 0008
  amendment](0008-c3-domain-fact-tables.md) for the full defect list.
