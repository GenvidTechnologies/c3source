# Decision Records

This directory contains Architecture Decision Records (ADRs) in **MADR-lite** format.

**Template:** the MADR-lite template is bundled in the `gvt-dev` plugin at `plugin/docs/decision-record.template.md` — `gvt-dev:tech-writer` fills it automatically.

**To add or insert a record:** run `/gvt-dev:create-adr` — it handles numbering, chronological insertion, and renumbering. Do not hand-number files.

**Index:** all records are listed in [`docs/TOC.md`](../TOC.md) under the **Decision Records** heading.

> Records 0001–0010 were reconstructed retroactively from the commit history
> (backfill, 2026-07-17). Their `Date:` fields are the original decision dates
> derived from git; the records themselves were written after the fact.
