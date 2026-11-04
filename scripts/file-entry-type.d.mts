// Hand-written declaration for file-entry-type.mjs; keep in sync with it by hand.
export interface FileEntryNode {
	name: unknown;
	type: unknown;
}

export interface FileEntryTables {
	EXTENSION_FILE_TYPES: Readonly<Record<string, string>>;
	SECTION_EXTENSION_FILE_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type FileEntryStatus = "MATCH" | "MISMATCH" | "UNMAPPED";

export interface ClassifiedFileEntry {
	section: string;
	ext: string;
	/** The raw recorded `type`; undefined when absent. */
	type: unknown;
	status: FileEntryStatus;
}

export function collectFileEntryNodes(folder: unknown): FileEntryNode[];
export function fileEntryExt(name: unknown): string;
export function classifyFileEntries(lib: FileEntryTables, manifest: unknown): ClassifiedFileEntry[];
