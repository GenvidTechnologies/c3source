# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Only list docs that exist.
-->

> **This project's documentation lives in an LLM-wiki, not in `docs/`.**
> On 2026-08-20 the API guides, the domain-fact audit, the design-patterns
> reference and all 26 Architecture Decision Records were migrated to
> [`wiki/`](../wiki/index.md). `docs/` now holds only the files the plugin
> convention contract and the wiki's own maintenance schema require.
> Verbatim, immutable captures of every migrated file are kept under
> [`raw/`](../raw/README.md).

## Knowledge Base

- `wiki-schema.md` — the binding maintenance schema for the three-tier wiki (`raw/` → `wiki/` → this schema): OKF v0.2 page format, the create-vs-update page lifecycle, the `raw/` immutability convention, this project's `stale_after` policy, and the `ingest`/`query`/`lint` verb contract
- [`../wiki/index.md`](../wiki/index.md) — **the wiki's own table of contents**, and the place to start for anything about this library's architecture, API surface, C3 domain facts, fixtures, or workflow. Every page carries a one-line description there
- [`../wiki/decisions/index.md`](../wiki/decisions/index.md) — Architecture Decision Records 0001–0026 (MADR-lite). Authored via `/gvt-dev:create-adr`; `.gvt-agent.json`'s `paths["docs/decisions/"]` override points the ADR tooling here
- [`../raw/README.md`](../raw/README.md) — the immutable provenance tier: captured sources every wiki page is built from. Never edited in place; a changed source is re-captured as a new file

## Project context

- `../CLAUDE.md` — session context: overview, the wiki routing table, commands, design-record conventions, formatting rules, CI & publishing
- `../CHANGELOG.md` — per-version release notes (Keep a Changelog); introduced at 2.0.0, earlier entries backfilled from git history, and records the `@genvid` → `@genvidtech` scope rename at 1.6.0
- `../README.md` — public-facing usage overview; the only documentation file shipped in the npm tarball

## Process

- `issue-triage.md` — issue-triage conventions (flat GitHub label set, no priority/area scheme): categories, required fields, splitting, duplicates, dependencies, and the `gh` mutation recipes consumed by `/gvt-dev:triage-issues`
