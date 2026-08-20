---
type: decision-context
title: "ADR 0003 — CI/publish via GitHub Actions + npm + OIDC trusted publishing"
description: CI runs on GitHub Actions via a shared, secret-free reusable workflow, and publishing to the public npm registry as @genvidtech/c3source is tag-triggered and authenticated via npm OIDC trusted publishing with no long-lived token.
tags: [adr, ci, publishing, oidc]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-20T15:48:57Z }
sources:
  - id: adr-0003
    resource: ../../raw/adr-0003-github-actions-oidc-publishing-2026-08-20.md
    title: "ADR 0003 (docs/decisions capture, 2026-08-20)"
    last_modified: 2026-08-20
---

# ADR 0003 — CI/publish via GitHub Actions + npm + OIDC trusted publishing

**Status:** accepted
**Date:** 2026-05-30
**Issue:** #6

Migrated verbatim from the `docs/decisions/` ADR record[^adr-0003].

## Context

The original pipeline built and published through Azure + pnpm + CircleCI, with
stored credentials (Azure service principal, 1Password credential injection).
Turning `c3source` into a public npm package called for a simpler,
secret-light CI/publish setup that would also be safe to run on fork pull
requests.

## Decision

CI runs on **GitHub Actions** (Node 22), delegating to the shared reusable
workflow `GenvidTechnologies/public-github-actions/.github/workflows/node-gate.yml`
(lint → typecheck → test → build, plus a non-failing `npm publish --dry-run`).
It requires no secrets, so it is safe on fork PRs. Publishing targets the public
npm registry as `@genvidtech/c3source` via `publish.yml`, triggered on git tags
matching `v*.*.*`: it re-runs the gate, verifies the tag matches `package.json`
`version`, then runs `npm publish --provenance --access public`. Authentication
uses **npm OIDC trusted publishing** — short-lived credentials minted per run
from the GitHub OIDC token (`id-token: write`) — so **no long-lived npm token is
stored** anywhere, and provenance is automatic.

## Compromise

A stored npm automation token is simpler and universally supported, but it is a
long-lived secret to rotate and guard. OIDC trusted publishing removes the stored
secret and gives free provenance, at the cost of a bootstrap wrinkle: npm's OIDC
flow excludes the *first* publish of a name. We accepted that, bootstrapping the
first publish with a one-time token and revoking it once the trusted publisher
was registered.

## Consequences

There is no npm token to rotate or leak. Releases are tag-driven — pushing a
`v*.*.*` tag publishes. The trusted publisher is pinned to this repo and the
`publish.yml` workflow, so renaming either breaks publishing until it is
re-registered (this bit later when the scope moved `@genvid` → `@genvidtech`,
#41). Pairs with [ADR 0004](/decisions/0004-dist-entry-points-no-publishconfig.md), which
ensures the published tarball actually resolves.

## Related

- [ADR 0004 — Package entry points at dist/, not src/*.ts via publishConfig](/decisions/0004-dist-entry-points-no-publishconfig.md) — ensures the published tarball this workflow ships actually resolves.
- [CI & Publishing](/ci-and-publishing.md) — describes the current CI/publish setup, including the later @genvid → @genvidtech scope move.

[^adr-0003]: ADR 0003 (docs/decisions capture, 2026-08-20)
