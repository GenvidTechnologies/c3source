# Documentation Index

<!--
Genvid plugin skills consult this index to find your project's docs.
Each entry should be a one-line description. Only list docs that exist.
-->

## Project context

- `../CLAUDE.md` — overview, commands, architecture, formatting & CI conventions
- `design-patterns.md` — reusable patterns (single-source event counter, thin file-walker wrappers, real-export-vs-inline test strategy)
- `api-guide.md` — usage reference for SID traversal and editor-local classification; links to manifest/drift doc
- `api-guide-manifest.md` — project manifest model, drift detection types, walk primitives, and 0.x migration (#19 #21)
- `api-guide-project.md` — C3Project handle and openProject(root) factory: path fields, presence checks, file finders, drift delegation (#36)
- `api-guide-extraction.md` — event-sheet extraction API: visitEvents, extractScriptsFromSheet, extractFunctions, extractIncludes, walkScriptActions, isFunctionDefinition, isEventVarReference/getEventVarReferenceName, validateForEditor/EDITOR_FIELD_RULES
