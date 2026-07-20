import { existsSync } from "node:fs";
import path from "node:path";
import { find_all_files_path, find_all_layouts_path, find_all_objectTypes_path, isEditorLocalPath } from "./layouts.js";
import { find_all_eventsheets_path } from "./eventSheets.js";
import {
  C3ProjectManifest,
  C3_ROOT_FILE_FOLDERS,
  C3_SECTION_FOLDERS,
  IMAGES_FOLDER,
  ManifestDrift,
  PROJECT_MANIFEST_FILE,
  SectionDrift,
  detectImageDrift,
  detectManifestDrift,
  readProjectManifest,
} from "./manifest.js";

// ─── Piece D: C3Project handle ────────────────────────────────────────────────

/**
 * A handle to an open C3 folder-project root. All path fields are computed once
 * at construction with no I/O; `has*()` queries call `existsSync` fresh on each
 * invocation so they reflect the actual state of the disk at call time.
 *
 * Obtain via {@link openProject}.
 */
export interface C3Project {
  /** Absolute path to the project root (the directory containing `project.c3proj`). */
  readonly root: string;
  /** Absolute path to `project.c3proj`. */
  readonly manifestPath: string;
  /** Absolute path to the event sheets source directory. */
  readonly eventSheetsDir: string;
  /** Absolute path to the layouts source directory. */
  readonly layoutsDir: string;
  /** Absolute path to the object types source directory. */
  readonly objectTypesDir: string;
  /** Absolute path to the families source directory. */
  readonly familiesDir: string;
  /** Absolute path to the scripts source directory. */
  readonly scriptsDir: string;
  /** Absolute path to the timelines source directory. */
  readonly timelinesDir: string;
  /** Absolute path to the flowcharts source directory. */
  readonly flowchartsDir: string;
  /** Absolute path to the 3D models source directory. */
  readonly models3dDir: string;
  /** Absolute path to the images flat directory (cf. {@link IMAGES_FOLDER}). */
  readonly imagesDir: string;
  /** Absolute path to the sounds source directory. */
  readonly soundsDir: string;
  /** Absolute path to the music source directory. */
  readonly musicDir: string;
  /** Absolute path to the videos source directory. */
  readonly videosDir: string;
  /** Absolute path to the fonts source directory. */
  readonly fontsDir: string;
  /** Absolute path to the icons source directory. */
  readonly iconsDir: string;
  /** Absolute path to the general files source directory. */
  readonly filesDir: string;

  /** Whether the event sheets directory exists on disk (evaluated fresh on each call). */
  hasEventSheets(): boolean;
  /** Whether the layouts directory exists on disk (evaluated fresh on each call). */
  hasLayouts(): boolean;
  /** Whether the object types directory exists on disk (evaluated fresh on each call). */
  hasObjectTypes(): boolean;
  /** Whether the families directory exists on disk (evaluated fresh on each call). */
  hasFamilies(): boolean;
  /** Whether the scripts directory exists on disk (evaluated fresh on each call). */
  hasScripts(): boolean;
  /** Whether the timelines directory exists on disk (evaluated fresh on each call). */
  hasTimelines(): boolean;
  /** Whether the flowcharts directory exists on disk (evaluated fresh on each call). */
  hasFlowcharts(): boolean;
  /** Whether the 3D models directory exists on disk (evaluated fresh on each call). */
  hasModels3d(): boolean;
  /** Whether the images directory exists on disk (evaluated fresh on each call). */
  hasImages(): boolean;
  /** Whether the sounds directory exists on disk (evaluated fresh on each call). */
  hasSounds(): boolean;
  /** Whether the music directory exists on disk (evaluated fresh on each call). */
  hasMusic(): boolean;
  /** Whether the videos directory exists on disk (evaluated fresh on each call). */
  hasVideos(): boolean;
  /** Whether the fonts directory exists on disk (evaluated fresh on each call). */
  hasFonts(): boolean;
  /** Whether the icons directory exists on disk (evaluated fresh on each call). */
  hasIcons(): boolean;
  /** Whether the general files directory exists on disk (evaluated fresh on each call). */
  hasFiles(): boolean;

  /**
   * The parsed project manifest. Lazy: first call reads and caches the result;
   * subsequent calls return the cached value without re-reading disk.
   */
  manifest(): C3ProjectManifest;

  /**
   * Return all event sheet paths under `eventSheetsDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_eventsheets_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `eventSheetsDir` (default `""`).
   */
  findAllEventSheets(sub?: string): string[];

  /**
   * Return all layout paths under `layoutsDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_layouts_path} — all non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `layoutsDir` (default `""`).
   */
  findAllLayouts(sub?: string): string[];

  /**
   * Return all object-type paths under `objectTypesDir` (or its `sub` subdirectory).
   * Delegates to {@link find_all_objectTypes_path} — all non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `objectTypesDir` (default `""`).
   */
  findAllObjectTypes(sub?: string): string[];

  /**
   * Return all family paths under `familiesDir` (or its `sub` subdirectory).
   * Families are pure `<Name>.json` name-section files (no sub-assets).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `familiesDir` (default `""`).
   */
  findAllFamilies(sub?: string): string[];

  /**
   * Return all source script paths under `scriptsDir` (or its `sub` subdirectory).
   * Returns only `.ts` source files — excludes generated `.d.ts` declaration files
   * (all of which live under `ts-defs/` and carry the `.d.ts` suffix).
   * Built on {@link find_all_files_path} — the recursive walk handles `ts-defs/`
   * correctly because every file inside it ends in `.d.ts`.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `scriptsDir` (default `""`).
   */
  findAllScripts(sub?: string): string[];

  /**
   * Return all timeline paths under `timelinesDir` (or its `sub` subdirectory).
   * Timelines are `.json` name-section files; the walk is recursive so it also includes
   * files under the unnamed transitions/ "Eases" subfolder. Callers can scope with `sub`.
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `timelinesDir` (default `""`).
   */
  findAllTimelines(sub?: string): string[];

  /**
   * Return all flowchart paths under `flowchartsDir` (or its `sub` subdirectory).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `flowchartsDir` (default `""`).
   */
  findAllFlowcharts(sub?: string): string[];

  /**
   * Return all 3D model paths under `models3dDir` (or its `sub` subdirectory).
   * Built on {@link find_all_files_path} — only `.json` non-editor-local files.
   * Returns `[]` if the target directory does not exist.
   *
   * @param sub - Optional subdirectory relative to `models3dDir` (default `""`).
   */
  findAllModels3d(sub?: string): string[];

  /**
   * Detect manifest drift for this project.
   * Delegates to {@link detectManifestDrift} with the project root and the handle's
   * cached manifest (reuses the already-parsed manifest instead of re-reading disk).
   */
  detectManifestDrift(): ManifestDrift;

  /**
   * Detect image-derived drift for this project.
   * Delegates to {@link detectImageDrift} with the project root.
   * Returns `null` if the `images/` directory does not exist.
   */
  detectImageDrift(): SectionDrift | null;
}

/**
 * Open a C3 folder-project at `root` and return a {@link C3Project} handle.
 *
 * **No I/O at construction** — path fields are string joins; the manifest is read
 * lazily on the first call to `manifest()`. Safe to call on a non-existent path.
 */
export function openProject(root: string): C3Project {
  const manifestPath = path.join(root, PROJECT_MANIFEST_FILE);
  const eventSheetsDir = path.join(root, C3_SECTION_FOLDERS.eventSheets);
  const layoutsDir = path.join(root, C3_SECTION_FOLDERS.layouts);
  const objectTypesDir = path.join(root, C3_SECTION_FOLDERS.objectTypes);
  const familiesDir = path.join(root, C3_SECTION_FOLDERS.families);
  const scriptsDir = path.join(root, C3_ROOT_FILE_FOLDERS.script);
  const timelinesDir = path.join(root, C3_SECTION_FOLDERS.timelines);
  const flowchartsDir = path.join(root, C3_SECTION_FOLDERS.flowcharts);
  const models3dDir = path.join(root, C3_SECTION_FOLDERS.models3d);
  const imagesDir = path.join(root, IMAGES_FOLDER);
  const soundsDir = path.join(root, C3_ROOT_FILE_FOLDERS.sound);
  const musicDir = path.join(root, C3_ROOT_FILE_FOLDERS.music);
  const videosDir = path.join(root, C3_ROOT_FILE_FOLDERS.video);
  const fontsDir = path.join(root, C3_ROOT_FILE_FOLDERS.font);
  const iconsDir = path.join(root, C3_ROOT_FILE_FOLDERS.icon);
  const filesDir = path.join(root, C3_ROOT_FILE_FOLDERS.general);

  // Capture free-function references before the returned object methods shadow them.
  // Without these aliases, a method named `detectManifestDrift` inside the returned
  // object literal would shadow the module-level function of the same name, causing
  // infinite recursion when the method tries to call `detectManifestDrift(...)`.
  const freeDetectManifestDrift = detectManifestDrift;
  const freeDetectImageDrift = detectImageDrift;

  let cachedManifest: C3ProjectManifest | undefined;

  /** Walk `sectionDir/sub` with `rawFinder`; return `[]` if the target dir is absent. */
  function findInSection(sectionDir: string, sub: string = "", rawFinder: (dir: string) => string[]): string[] {
    const targetDir = path.join(sectionDir, sub);
    if (!existsSync(targetDir)) return [];
    return rawFinder(targetDir);
  }

  return {
    root,
    manifestPath,
    eventSheetsDir,
    layoutsDir,
    objectTypesDir,
    familiesDir,
    scriptsDir,
    timelinesDir,
    flowchartsDir,
    models3dDir,
    imagesDir,
    soundsDir,
    musicDir,
    videosDir,
    fontsDir,
    iconsDir,
    filesDir,

    hasEventSheets: () => existsSync(eventSheetsDir),
    hasLayouts: () => existsSync(layoutsDir),
    hasObjectTypes: () => existsSync(objectTypesDir),
    hasFamilies: () => existsSync(familiesDir),
    hasScripts: () => existsSync(scriptsDir),
    hasTimelines: () => existsSync(timelinesDir),
    hasFlowcharts: () => existsSync(flowchartsDir),
    hasModels3d: () => existsSync(models3dDir),
    hasImages: () => existsSync(imagesDir),
    hasSounds: () => existsSync(soundsDir),
    hasMusic: () => existsSync(musicDir),
    hasVideos: () => existsSync(videosDir),
    hasFonts: () => existsSync(fontsDir),
    hasIcons: () => existsSync(iconsDir),
    hasFiles: () => existsSync(filesDir),

    manifest() {
      if (cachedManifest === undefined) {
        cachedManifest = readProjectManifest(manifestPath);
      }
      return cachedManifest;
    },

    findAllEventSheets(sub?: string): string[] {
      return findInSection(eventSheetsDir, sub, find_all_eventsheets_path);
    },

    findAllLayouts(sub?: string): string[] {
      return findInSection(layoutsDir, sub, find_all_layouts_path);
    },

    findAllObjectTypes(sub?: string): string[] {
      return findInSection(objectTypesDir, sub, find_all_objectTypes_path);
    },

    findAllFamilies(sub?: string): string[] {
      // Families are pure <Name>.json files — same predicate shape as find_all_eventsheets_path.
      return findInSection(familiesDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllScripts(sub?: string): string[] {
      // Source scripts are .ts files. Generated declaration files in ts-defs/ all end in
      // .d.ts, so filtering !file.endsWith(".d.ts") is sufficient to exclude them while
      // find_all_files_path recurses normally (ts-defs/ is not an editor-local dir so it
      // is not skipped by isEditorLocalPath — it is excluded by the predicate alone).
      return findInSection(scriptsDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !isEditorLocalPath(file)),
      );
    },

    findAllTimelines(sub?: string): string[] {
      // The walk is recursive so it includes files under the unnamed transitions/ "Eases" subfolder.
      return findInSection(timelinesDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllFlowcharts(sub?: string): string[] {
      return findInSection(flowchartsDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    findAllModels3d(sub?: string): string[] {
      return findInSection(models3dDir, sub, (dir) =>
        find_all_files_path(dir, (file) => file.endsWith(".json") && !isEditorLocalPath(file)),
      );
    },

    detectManifestDrift(): ManifestDrift {
      // Pass the handle's cached manifest as the second arg so the free function reuses
      // the already-parsed manifest instead of re-reading project.c3proj from disk.
      return freeDetectManifestDrift(root, this.manifest());
    },

    detectImageDrift(): SectionDrift | null {
      return freeDetectImageDrift(root);
    },
  };
}
