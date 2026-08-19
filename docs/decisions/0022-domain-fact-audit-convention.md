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

**The convention did not reach prose (added 2026-08-18, #81).** All three
parts of the decision above govern a domain-fact *table* — a claim gets a
confidence label and a named evidence source only once it is an exported
constant. `docs/api-guide-extraction.md` asserted "(C3's own rule)" about
C3's variable-scope semantics for roughly two years with no ADR, no fixture
reference, and no audit entry behind it, because it was never a table — it
was a parenthetical in a reference guide, outside this convention's reach
entirely. Nothing here would have caught it. An upstream repo
(`claude-code-plugin-gvt-construct3`) deleted the same claim from its own C3
platform reference because a reader could not tell whether it was C3's rule
or an artifact of this library's walk order, and filed #81 to relay the gap.

The claim turned out to be **true** — settled this run by a live C3-editor
experiment, recorded in `docs/domain-fact-audit.md`'s ["Variable scope:
visibility vs. re-initialization (editor
experiment)"](../domain-fact-audit.md#variable-scope-visibility-vs-re-initialization-editor-experiment)
section. Being right is not the same as being evidenced, and nothing in this
convention distinguished the two for prose.

**Amended rule:** an assertion about **C3 platform behaviour** — as opposed
to what c3source itself does — must name its evidence channel wherever it is
written, not only when it lives in a domain-fact table. This repo now
recognizes three evidence channels for such a claim:

- **Corpus scan** (currently 14 real projects) — shows *what values occur*.
  Cannot show what the mechanism is, and inherits the bounds caveat that the
  sample skews toward `burbank`.
- **Editor bundle** (`editor.construct.net/r{NNN}/`) — shows *what the
  mechanism is* and pins exactly when a field appeared; per the decision
  above, this is the channel ADR 0008's addendum says a corpus structurally
  cannot substitute for.
- **Editor experiment** — running a constructed case in the real C3 editor.
  A third channel, first exercised for `custom-ace-name-required` (#70, see
  the `functionDescription` finding above) and exercised again, more
  explicitly, by #81's variable-scope trace. For *execution semantics* it is
  the only channel that works: a corpus shows recorded values, a bundle shows
  serialization/loader code, and neither shows what happens when a project
  actually runs.

The house standard for what this looks like in practice already exists:
`src/layouts.ts`'s `isGeneratedScriptOutput` JSDoc states "This is C3's own
rule, not a heuristic" and then names the actual C3 reconcile behaviour,
backed by [ADR 0024](0024-script-source-fact-and-dotted-extensions.md) and
issue #73 — including a correction of a prior mischaracterization. A prose
platform claim should be evidenced to that standard; a bare parenthetical is
not enough.

This amendment extends parts 1–3 of the decision above to prose, reusing the
same evidence-channel vocabulary this file already established for tables. It
does not add a new confidence label and does not reserve a new ADR number.
