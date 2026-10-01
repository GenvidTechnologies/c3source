---
type: reference
title: Issue Triage
description: How c3source triages GitHub issues — the flat-label variant (default category labels plus triaged, no priority or area scheme), the double meaning of the question label and the rule it forces, the splitting/duplicate/dependency policies, and why the operational contract still lives at docs/issue-triage.md.
tags: [triage, issues, labels, process, plugin-contract]
status: stable
stale_after: 2027-04-01
generated: { by: process:maintain-wiki, at: 2026-10-01T12:00:00Z }
sources:
  - id: issue-triage
    resource: ../raw/docs-issue-triage-2026-10-01.md
    title: "docs/issue-triage.md (c3source issue-triage conventions, 2026-10-01 capture)"
    last_modified: 2026-10-01
---

# Issue Triage

## What the contract is, and who reads it

The triage conventions are a **machine-read contract** consumed by the
`/gvt-dev:triage-issues` skill and its `issue-triage-analyst` agent[^issue-triage].
The work is split in two: the **access mechanics** (fetch queries, command
templates, label names such as `triagedLabel: triaged` and `needsInfoLabel:
question`) live in the `bugTracker` block of `.gvt-agent.json`, while the
**conventions** (what the labels mean, how to split, what to do with
duplicates) live in the contract document[^issue-triage]. The tracker is GitHub
Issues, driven through the `gh` CLI.

## The flat-label variant

c3source uses GitHub's **default category labels** — `bug`, `enhancement`,
`documentation`, `duplicate`, `question`, `wontfix` — plus `triaged`, with
**no** `type:`, `priority/` or `area:` scheme[^issue-triage]. Consequences:

- **One category label per issue**, set by the triager (reporters may suggest
  one). Add a new category only if the repo already uses it — never invent a
  taxonomy the repo doesn't have[^issue-triage].
- **No priority field.** When ordering work, rank by recency and observable
  impact in discussion, not by a label. If the repo ever adopts priority
  labels, the skill's structured template is the thing to switch to[^issue-triage].
- Mutation recipes therefore have no priority or area substitutions.

## The `question` label means two things

`question` is both a **category** (the issue is itself a question, complete as
filed) and the **needs-info flag** (the repo has no dedicated `needs-info`
label, so `.gvt-agent.json`'s `needsInfoLabel` is set to `question`)[^issue-triage].

The label alone cannot distinguish "waiting on the reporter" from "waiting on
a maintainer decision", and downstream tooling reads it as the former:
`plan-next-issue` de-prioritizes any candidate carrying `needsInfoLabel`, so a
category-`question` that says nothing sinks in the ranking and a decision
nobody is blocked on goes unplanned[^issue-triage].

**The rule:** when `question` is applied as a category, the triage comment
must state **explicitly that nothing is blocked on the reporter**. Issue #76
is the worked example ("nothing is blocked on the reporter here… what it's
waiting on is a maintainer decision")[^issue-triage]. The converse needs no
special handling — a needs-info `question` already comes with a comment saying
what is missing, which is itself the disambiguator.

## Policies in brief

- **Required fields.** A `bug` needs a reproduction, expected-vs-actual
  behavior and the build/version; an `enhancement` needs a clear desired
  outcome and motivation. Missing essentials means the `question` flag plus a
  comment saying exactly what is needed[^issue-triage].
- **Splitting.** Split when one issue bundles unrelated concerns or spans
  independently shipping parts. Prefer sub-issues (a checkbox task-list) when
  the parent is a tracking umbrella, separate issues when the parts share no
  parent; the original stays canonical[^issue-triage].
- **Duplicates.** Link, don't auto-close: pick the canonical (usually the
  oldest with the best detail), label the others `duplicate` and comment
  `Duplicate of #<canonical>`. Close a duplicate only with explicit per-item
  approval[^issue-triage].
- **Dependencies.** A `Blocked by #<id>` comment on the blocked issue
  (optionally `Blocks #<id>` on the other); umbrellas list dependencies as a
  task-list under a `Depends on` heading[^issue-triage].
- **Ordering of labels.** `triaged` is set **last**, when triage is complete;
  `wontfix` only with explicit approval when closing as out of scope[^issue-triage].

## Mutation recipes

The contract ends with the exact `gh` commands the skill runs to apply
**approved** changes: set category, edit body, comment, flag/clear missing
info, mark or close a duplicate, create a split issue, link a dependency, and
stamp `triaged`. They are parameterized by placeholders the skill substitutes
(issue id, type, text, canonical, title/body, and the `triagedLabel` /
`needsInfoLabel` names)[^issue-triage]. The command list is deliberately not
reproduced here; read it in the operational contract,
[`docs/issue-triage.md`](../docs/issue-triage.md).

## Why the contract still lives at `docs/issue-triage.md`

Everything else in this repo's documentation moved into the wiki, but the
operational contract did not, for three reasons:

- The plugin's triage skill and analyst read **that exact path**.
- `.gvt-agent.json` `paths` overrides are honoured only by `audit-conventions`
  today, not by `triage-issues`.
- A missing file makes the skill scaffold a fresh, **competing** template
  there.

Its section headings must also not change, since the skill locates guidance
by heading[^issue-triage]. Support for the override is tracked upstream in
GenvidTechnologies/claude-code-plugin-gvt-dev #580 (`triage-issues` honours
the override) under umbrella #374; once it ships, the contract can move into
the bundle.

**Editing workflow:** change triage conventions in `docs/issue-triage.md`
first, then re-capture it into `raw/` as a new dated file and re-ingest this
page. This page is the explanation; the `docs/` file is the operational copy.

## Related

- [Development Workflow](/development-workflow.md) — the broader working conventions, including the issue/PR-as-durable-record rule that triage feeds.

[^issue-triage]: docs/issue-triage.md (c3source issue-triage conventions, 2026-10-01 capture)
