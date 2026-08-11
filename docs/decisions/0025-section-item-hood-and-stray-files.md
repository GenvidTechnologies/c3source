# 0025. Section item-hood as a named axis, and stray files as diagnostic, not drift

- **Status:** accepted
- **Date:** 2026-08-11
- **Issue:** #76

## Context

`find_all_files_path` is already the one canonical recursive walk (ADR 0005),
and two of the three questions a directory walk must answer already had a
name, a predicate, and a record: **provenance** — is this file C3 source or an
editor-local artifact? (`isEditorLocalPath`, ADRs 0006/0018) — and
**reachability** — may the walk enter this directory at all? (`descend`, ADR
0020). The third question — **item-hood**: is this file an *item* of the
section it sits in, or merely stored beside one? — had no name, no predicate,
and no record. It existed only as seven inline decisions at the finder level:
five of the seven name-section finders (`find_all_eventsheets_path` and
friends) filtered to `.json` inline, and two — `find_all_layouts_path` and
`find_all_objectTypes_path` — did not, returning every non-editor-local file
regardless of extension.

**This was drift, not intent.** At the initial-release commit `8078f37` the
three original collectors were three separately hand-written recursive
functions: `find_all_objectTypes_path` recursed via `find_all_layouts_path` —
a copy-paste bug — while `find_all_eventsheets_path` was written
independently, *with* a `.json` filter and its own JSDoc. No commit ever
decided that layouts and object types should behave differently from event
sheets; the difference is an artifact of how the three functions were
originally typed in, not a design choice. A record claiming original design
intent here would be contradicted by the git history and by ADR 0020's own
hazard language (see "ADR 0020 reconciliation" below, which flagged exactly
this leak in advance).

**The rationale previously offered for the permissive behaviour — that
`layouts/`/`objectTypes/` hold non-`.json` companion assets a filter would
drop — is false.** C3's own editor bundle
(`https://editor.construct.net/r{NNN}/projectResources.js`, the release root,
not `c3runtime/`) saves every name-section item as `folder + name + ".json"`
and redirects companions *out* of these folders by construction:
`.uistate.json` alongside (already excluded by `isEditorLocalPath`), images to
`images/`. The project corpus corroborates this independently. Numbers
supporting both claims live in `docs/domain-fact-audit.md` (Task 7), not here.

`README.md` has always documented `.json` as the return type for all three
published free functions (`find_all_layouts_path`, `find_all_objectTypes_path`,
`find_all_eventsheets_path`). The permissive behaviour was never what the
library's own published contract said it did.

**The permissive behaviour was a latent crash, not a capability.** Six call
sites across `construct3-chef` and `burbank` pipe finder output straight into
`JSON.parse` with no extension guard, as does this repo's own
`test/referenceIntegrity.test.ts` — four independent codebases making the
identical mistake of assuming the finder already filtered to JSON. No
consumer relied on the permissive behaviour for anything; it was pure risk.

**Nothing is lost by narrowing.** `find_all_files_path` remains exported
precisely so a caller can discover non-source artifacts on its own terms (ADR
0005, whose worked example is a generated `.dsl.txt` file). The former
permissive behaviour of the two narrowed finders is recoverable verbatim as
`find_all_files_path(dir, (f) => !isEditorLocalPath(f))`.

## Decision

Two clauses.

**1. Item-hood becomes a named axis, with one fact, one predicate, and one
collector.** `src/layouts.ts` gains `C3_SECTION_ITEM_EXTENSION = ".json"` (the
on-disk extension of every item of a C3 name section — the sections named by
`C3_SECTION_FOLDERS`) and `isSectionItemName(name)`, which tests a bare
basename against it. `find_all_section_items_path(dir)` is the single owner of
the combined item-hood + provenance policy (`isSectionItemName(file) &&
!isEditorLocalPath(file)`, built on `find_all_files_path`); all seven
name-section finders — including the two that previously omitted the
extension check — are now thin consumers of this one collector, so the policy
cannot drift between sections again (ADR 0005's shape: one canonical walk,
thin consumers).

`isSectionItemName` is deliberately **case-sensitive**, unlike
`isScriptSourceName`'s case-insensitive match. C3's lowercasing-before-testing
rule is audited for script extensions but unverified for `.json`; matching
case-insensitively here would silently *widen* every name-section finder
built on this predicate with no evidence backing the widening.

**Explicitly excluded from this axis:** `findAllScripts` (its own rule —
`isScriptSourceName` plus `filterAuthoredScriptPaths`, ADR 0024) and
`findAllAddons` (`.c3addon`). Both already had a correct, section-specific
item-hood rule before this ADR; `isSectionItemName`/`C3_SECTION_ITEM_EXTENSION`
apply only to the seven `C3_SECTION_FOLDERS` name sections and do not
generalize over them.

`EDITOR_LOCAL_EXCLUSIONS` is **untouched**. Extension policy (item-hood) is a
different axis from provenance (is this file source or editor-local?); this
ADR adds a new predicate rather than folding item-hood into the existing one.

Deleting the three parse-boundary re-filters that previously duplicated the
`.json` check ahead of `JSON.parse` (in the layout-visitor and related call
sites) is a **policy relocation**, not dead-code removal: the `.json` decision
moves from being restated at every consumer's parse boundary to living once,
in the finder that now owns it. A future maintainer must not restore one of
those guards "defensively" — doing so would just reintroduce the duplication
this ADR removes.

**2. A non-item file under a name section is a diagnostic, never drift.**
`src/manifest.ts` gains `StrayFile` (`section`, `folder`, `name`, `diskPath`)
and `detectStrayFiles(projectDir)`, which walks each of the seven
`C3_SECTION_FOLDERS` roots and reports every file that is neither a section
item (`isSectionItemName`) nor editor-local (`isEditorLocalPath`) —
`find_all_section_items_path` and `detectStrayFiles` partition the same walk
disjointly and exhaustively. `ManifestDrift` gains an optional `strays?:
StrayFile[]` field, populated by `detectManifestDrift` only when non-empty
(the same convention as `degraded`, so a clean project's result is
byte-identical to a pre-2.0.0 one); `C3Project` gains `detectStrayFiles()`.

- `ManifestDrift.inSync` keeps its literal, unchanged definition —
  `sections.length === 0` — so a project with strays but no section drift is
  still reported in sync.
- `DriftKind` is **unchanged** (`"missing" | "untracked" | "moved" |
  "folder-missing" | "folder-untracked" | "dangling-ref"`), so any consumer's
  exhaustive switch over it still compiles unmodified.
- `StrayFile` carries **no `manifestPath`**, on purpose: a stray file has no
  manifest position to offer — its whole defining property is that it is not
  declared — so there is nothing a caller could be tempted to map it to. A
  field that always reads `undefined` would invite exactly the "treat this
  like a `DriftEntry`" misuse this design exists to prevent.
- Stray detection is **manifest-independent** (it reads no `project.c3proj`
  and takes none — item-hood and provenance are both decided from a bare
  basename) and scoped to the seven name sections only. Root file folders
  (`scripts/`, `sounds/`, …) and `images/` are excluded, **and this is by
  design, not an oversight**: file-folder membership is extension-agnostic —
  there is no item-hood rule for a stray to violate there (`scripts/` has its
  own separate rule, ADR 0024, which is a generated/authored distinction, not
  an item-hood one), and `images/` is a flat asset folder, not a name section,
  at all.

## Compromise

Five options were on the table.

**Option A — document the permissive behaviour, change nothing.** Cannot be
written truthfully: there is no rationale to record, because (per Context) the
"companion asset" premise is false and no design decision ever produced the
permissive/filtering split. It also leaves `README.md` false and ratifies,
unfixed, exactly the state `c3-domain-manager`'s own ADR 0017 recorded as "a
platform fact this repo does not own and is not free to unify by itself."

**Option B — make all seven finders permissive instead of narrowing the
two.** This was the consumer's stated preference, and its genuine strengths
are real: it dissolves the five-vs-two divergence for free (in the opposite
direction), and a permissive result is filterable by a caller who wants
`.json` only, while an already-filtered result is not recoverable without a
second walk. It was rejected because:
- it is the upstream mirror image of the alternative `c3-domain-manager`'s
  **own** ADR 0017 rejected locally, for the same reasons that applied there;
- it blindly widens `models3d/`, the one name section with **zero** corpus
  observations backing any claim about what belongs there;
- it makes `README.md` false in a *wider* way than today (three functions
  documented as `.json`-only instead of two);
- it converts ADR 0020's residual risk (see reconciliation below) from a flag
  on a future change into a **permanent** contract — every future consumer of
  these finders inherits the unfiltered surface forever, instead of the risk
  being resolved outright; and
- it widens a footgun four independent codebases (`construct3-chef`,
  `burbank`, and this repo's own test) had already fallen into by piping
  finder output straight into `JSON.parse`.

**Option C — bare uniform `.json` filter inlined at all seven call sites,
no exported fact.** Right direction (uniformity), wrong mechanism: it leaves
the `.json` literal duplicated seven times with nothing for a downstream
consumer to import, reproducing exactly the "temporary local fact" pattern
ADR 0008 exists to prevent.

**Option D (chosen)** — see Decision, clause 1.

**Option E — four stray-file mechanism alternatives, all rejected:**

- **E-alt1 — a `"stray"` member on `DriftKind`.** Rejected: it would flip
  `inSync` for any project holding a generated sidecar file, would be
  source-breaking for any consumer's exhaustive switch over `DriftKind`, and
  — worst — it lands strays in the exact stream a consumer typically maps to
  a repair worklist, reopening the "inert override" hazard `StrayFile`'s
  missing `manifestPath` exists to close.
- **E-alt2 — an allow-list of known generated suffixes (e.g. `.dsl.txt`).**
  Rejected: a suffix like `.dsl.txt` is a specific downstream tool's
  convention, not a C3 fact, and is unauditable under ADR 0022 — c3source
  cannot enumerate the conventions of tools that do not yet exist. Filtering
  a stray list down to "known-generated" vs. "unknown" is the caller's
  policy, not c3source's.
- **E-alt3 — an opt-in option parameter gating stray detection.** Rejected:
  it gates something that costs nothing — `detectStrayFiles` is a plain walk
  with no throw risk (see its own JSDoc on why it needs no degradation
  guard), so there is no failure mode an opt-out would protect against.
- **E-alt4 — a synthetic `SectionDrift` with `section: "strays"`.** Rejected:
  it would flip `inSync` and assert that strays *are* section drift — the
  exact claim clause 2 exists to deny.

**The promise-break.** `docs/api-guide-project.md` states the three free
functions "remain exported and unchanged." That sentence is broken in
*behaviour*, though not in signature, for `find_all_layouts_path` and
`find_all_objectTypes_path` — names, arities, and types are unchanged, but
their result sets narrow. Recorded here explicitly rather than read
narrowly: it ships inside an already-breaking major (this release also
carries ADR 0024's breaking change), and the narrowed behaviour is what
`README.md` always documented, so this is the code catching up to its own
contract rather than the contract moving.

**Accepted cost.** A project whose own tooling writes non-`.json` sidecar
files under a name-section root now surfaces them in `ManifestDrift.strays`.
This is noise in an opt-in, optional field — never a failure, never a change
to `inSync` — and is a single `.filter()` away from being ignored downstream.

## ADR 0020 reconciliation

ADR 0020 mentions the two now-narrowed collectors twice, and the two mentions
need opposite treatment.

**ADR 0020's Compromise section, "Fork B — split the table" — stays
rejected.** Fork B (splitting `EDITOR_LOCAL_EXCLUSIONS`
into two tables) was rejected there for three reasons, one of which was that
`find_all_layouts_path`/`find_all_objectTypes_path` had no extension filter,
so a hypothetical `ts-defs/` under a name section would leak every `.d.ts` in
it as a "layout." This ADR removes exactly that leak. **Fork B stays rejected
regardless** — its other two grounds are untouched by this change: it still
hardcodes a policy the consumer cannot override, and it would still replace
one canonical table with two whose `⊂` relationship is an unenforced
invariant. Removing one of three supporting arguments for a prior rejection
does not reopen that decision, and this ADR says so explicitly rather than
leaving a future reader to wonder whether Fork B is now back on the table —
it is not.

**ADR 0020's Consequences section, "Residual risk to watch" — discharged
by this ADR.** ADR 0020 flagged that threading a `descend` override into
`find_all_layouts_path`/`find_all_objectTypes_path` would, at the time, hit
Fork B's leak, because those two collectors had no extension filter to bound
whatever a widened `descend` let the walk reach. After this change, that
threading is safe: `isSectionItemName` bounds the result regardless of which
directories the walk is allowed to enter, so a future `descend` override on
either collector can no longer leak non-`.json` content into a name-section
result. This is the future collector change ADR 0020 flagged, arriving and
resolving the exact risk it named.

**The three-axis frame.** ADRs 0006 and 0018 own **provenance**
(`isEditorLocalPath`); ADR 0020 owns **reachability** (`descend`); this ADR
owns **item-hood** (`isSectionItemName`). Each axis has exactly one
predicate, and each ADR explicitly declines to answer the other two
questions — the same discipline ADR 0020 applied to itself ("`EDITOR_LOCAL_EXCLUSIONS`
answers provenance and nothing else"). This is a **new** ADR rather than an
amendment to ADR 0020, for the same reason ADR 0020 itself gave when
declining to amend ADR 0006: ADR 0020's subject is the reachability
parameter, and folding a different axis's decision into it would misread as
a change to that decision rather than as what it is — a new, independent
axis. ADR 0005 (one canonical walk, thin consumers) is both the shape clause
1 applies (`find_all_section_items_path` as the one owner, seven thin
finders) and the escape hatch that makes the whole design non-lossy: a
caller who needs the pre-2.0.0 permissive result can still get it directly
from `find_all_files_path`.

## Consequences

- Semver: **2.0.0**, and the two clauses classify **separately**. Clause 1
  (item-hood) is **breaking** — behavioural only, with no type, arity, or
  name change on any of the three affected free functions. Clause 2 (stray
  files) is **additive/minor** on its own and contributes nothing to the
  major; it rides the same release only because clause 1 already forces one.
  A reader who assumes `strays` needs a consumer audit is wrong — only
  clause 1 does.
- `scripts/api-surface.mjs` sees the two clauses **oppositely**. Clause 1's
  predicate change is **invisible** to it — the three finders' signatures are
  byte-identical, the same blind spot ADRs 0018 and 0020 already record for a
  behavioural-only change. Clause 2's additions (`StrayFile`,
  `detectStrayFiles`, `ManifestDrift.strays`, `C3Project.detectStrayFiles`)
  are fully visible in the dump. So the empty-diff standard does not apply to
  this release as a whole: JSDoc must be stripped before diffing to see the
  real signature delta, and clause 1's actual behaviour change is settled by
  the test suite, not by the surface dump — a later reader relying on the
  dump alone would conclude nothing behavioural changed, which is exactly
  wrong for two of the three touched functions.
- Downstream: `c3-domain-manager` was blocked on this — their own ADR 0017
  called the divergence "a platform fact this repo does not own and is not
  free to unify by itself." They can now import `isSectionItemName` directly
  and adopt `strays` as the replacement signal for whatever local workaround
  they were carrying. `construct3-chef` and `burbank` are fixed with **no
  code change** on their next `^2.0.0` bump — their unguarded `JSON.parse`
  call sites simply stop being reachable by non-JSON input.
