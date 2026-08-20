---
type: reference
title: CI & Publishing
description: c3source's CI runs the shared, secret-free node-gate reusable workflow on GitHub Actions; publishing to the public npm registry as @genvidtech/c3source is tag-triggered and uses OIDC trusted publishing with no long-lived token, and CHANGELOG.md must have Unreleased moved into a dated section before a tag is pushed.
tags: [ci, publishing, npm, oidc, changelog, node-gate]
status: stable
stale_after: 2027-02-20
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-20.md
    title: "CLAUDE.md (c3source project instructions, 2026-08-20 capture)"
    last_modified: 2026-08-20
---

# CI & Publishing

## CI: GitHub Actions, shared reusable workflow

CI runs on **GitHub Actions** (Node 22). `.github/workflows/ci.yml` runs on
pull requests and pushes to `main`; it calls the shared reusable workflow
`GenvidTechnologies/public-github-actions/.github/workflows/node-gate.yml@main`,
which runs lint → typecheck → test → build (plus a non-failing `npm publish
--dry-run`)[^claude-md]. It **requires no secrets, so it is safe on fork
PRs**[^claude-md] — a fork contributor's PR gets the full check suite
without the workflow needing repo secrets exposed to untrusted code.

## Publishing: tag-triggered, OIDC trusted publishing

Publishing is to the **public npm registry** as the scoped package
`@genvidtech/c3source`. `.github/workflows/publish.yml` triggers on **git
tags matching `v*.*.*`** (e.g. `v0.3.0`): it re-runs the gate, verifies the
tag matches `package.json` `version`, then runs `npm publish --provenance
--access public`[^claude-md].

Authentication uses **npm OIDC trusted publishing** — short-lived
credentials minted per run from the GitHub OIDC token (`id-token: write`),
so **no long-lived npm token is stored** anywhere; provenance is
automatic[^claude-md]. The package's trusted publisher is registered
against this repo (`GenvidTechnologies/c3source`) and the `publish.yml`
workflow. **The first publish of the name was bootstrapped with a one-time
token** (since npm's OIDC flow excludes first-publish), which was **revoked**
once the trusted publisher was configured[^claude-md].

## The 1.6.0 scope rename

**The package changed scope at 1.6.0** — `0.0.1`–`1.5.0` were published as
`@genvid/c3source`, `1.6.0` onward as `@genvidtech/c3source` (issue #41).
All twelve versions of the old name were **deprecated on 2026-08-12** with
the message `moved to @genvidtech/c3source`, so a fresh `npm install
@genvid/c3source` now warns and points at the right package[^claude-md].

**A deprecation warns; it does not block or unpublish** — the old name
still installs, still resolves `latest` to 1.5.0, and an existing lockfile
pin keeps resolving silently without ever re-printing the warning. So still
treat a consumer reporting behaviour that predates 1.6.0 as **possibly on
the old name** before debugging the code; the deprecation improves the
signal for *new* installs only[^claude-md].

## `CHANGELOG.md`

**`CHANGELOG.md` exists as of 2.0.0** and is the per-version release record
(Keep a Changelog); entries before 2.0.0 were backfilled from git
history[^claude-md]. Every release must move `## [Unreleased]` into a dated
`## [X.Y.Z]` section **before the tag is pushed** — `/gvt-dev:release-npm-package`
does this automatically, but it is easy to miss on a hand-cut
release[^claude-md].

The file is deliberately **not** in `package.json`'s `files` allowlist
(`dist`, `LICENSE`, `README.md`), so it ships on GitHub but **not in the npm
tarball**[^claude-md]. Two older decision records predate `CHANGELOG.md`'s
existence and are left unedited — an accepted ADR states the situation at
its date, the same convention that leaves stale `file:line` citations in
place in pre-rule ADRs (see [Development
Workflow](/development-workflow.md)) — including one that reasons
explicitly from "with no CHANGELOG.md in this repo"[^claude-md].

## Related

- [Development Workflow](/development-workflow.md) — the lint/typecheck/test/build commands the shared gate runs, and the citation-style convention this page's ADR references follow.
- [Module Architecture](/module-architecture.md) — the built `dist/*.js`/`dist/*.d.ts` artifacts `package.json`'s `main`/`types`/`exports` point at, which is what the `files` allowlist and `prepack` build ship.

[^claude-md]: CLAUDE.md (c3source project instructions, 2026-08-20 capture)
