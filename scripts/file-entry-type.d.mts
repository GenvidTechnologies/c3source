// Hand-written declaration for file-entry-type.mjs; keep in sync with it by hand.
export interface FileEntryNode {
	name: unknown;
	type: unknown;
}

export interface FileEntryLib {
	// Method syntax on purpose: the library narrows `section` to C3FileSection, and method
	// parameters are bivariant, so the library function is assignable here.
	fileTypeForSection(section: string, name: string): string;
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
export function classifyFileEntries(lib: FileEntryLib, manifest: unknown): ClassifiedFileEntry[];
