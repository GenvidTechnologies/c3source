// Probe 10's classifier, split out of scan-domain-facts.mjs so a test can import it.
// scan-domain-facts.mjs cannot be imported: it loads `dist/` at top level and exits when
// `dist/` is missing or no argument is given.

/**
 * Structural walk over one `rootFileFolders` section's `{items, subfolders}` tree,
 * returning each item's raw `name` and `type` (MIME, or undefined when absent).
 */
export function collectFileEntryNodes(folder) {
  const nodes = [];
  if (!folder || typeof folder !== "object") return nodes;
  for (const item of Array.isArray(folder.items) ? folder.items : []) {
    nodes.push({
      name: item && typeof item === "object" ? item.name : undefined,
      type: item && typeof item === "object" ? item.type : undefined,
    });
  }
  for (const sub of Array.isArray(folder.subfolders) ? folder.subfolders : []) {
    nodes.push(...collectFileEntryNodes(sub));
  }
  return nodes;
}

/** Lowercased extension of a bare or path-like entry name, `(none)` when it has no extension. */
export function fileEntryExt(name) {
  const base = String(name).slice(Math.max(String(name).lastIndexOf("/"), String(name).lastIndexOf("\\")) + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 || dot === base.length - 1 ? "(none)" : base.slice(dot);
}

const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

/**
 * Classifies every file entry of the MANIFEST's `rootFileFolders` (recursively through
 * `subfolders`) against two tables: the flat `EXTENSION_FILE_TYPES` and the per-section
 * `SECTION_EXTENSION_FILE_TYPES`. An extension is keyed when it is in the entry's section
 * row or in the flat table; the expected value is the section row's when it has the
 * extension, otherwise the flat row's. MATCH (keyed, expected value equals the recorded
 * `type`), MISMATCH (keyed, value differs), UNMAPPED (not keyed).
 *
 * `lib` carries the two tables instead of this module importing them. The scanner passes
 * its `dist/` imports. The test passes the `src/` exports, because a dev script cannot
 * import `.ts` and a test cannot import `dist/` before the build.
 *
 * @param {{ EXTENSION_FILE_TYPES: object, SECTION_EXTENSION_FILE_TYPES: object }} lib
 * @param {unknown} manifest
 * @returns {{ section: string, ext: string, type: unknown, status: "MATCH" | "MISMATCH" | "UNMAPPED" }[]}
 *   `type` is the raw recorded `type` (undefined when absent).
 */
export function classifyFileEntries(lib, manifest) {
  const { EXTENSION_FILE_TYPES, SECTION_EXTENSION_FILE_TYPES } = lib;
  const out = [];
  const folders = manifest && typeof manifest === "object" ? manifest.rootFileFolders : undefined;
  if (!folders || typeof folders !== "object") return out;
  for (const [section, folder] of Object.entries(folders)) {
    for (const node of collectFileEntryNodes(folder)) {
      const ext = fileEntryExt(node.name);
      const sectionRow = has(SECTION_EXTENSION_FILE_TYPES, section)
        ? SECTION_EXTENSION_FILE_TYPES[section]
        : undefined;
      const expected =
        sectionRow && has(sectionRow, ext)
          ? sectionRow[ext]
          : has(EXTENSION_FILE_TYPES, ext)
            ? EXTENSION_FILE_TYPES[ext]
            : undefined;
      const status = expected === undefined ? "UNMAPPED" : expected === node.type ? "MATCH" : "MISMATCH";
      out.push({ section, ext, type: node.type, status });
    }
  }
  return out;
}
