import { describe, it } from "mocha";
import { expect } from "chai";
import {
  EXTENSION_FILE_TYPES,
  C3_DEFAULT_FILE_INFO_PURPOSE,
  C3_DEFAULT_FILE_TYPE,
  C3_FILE_INFO_KEYS,
  C3_VIDEO_IMPORT_EXTENSIONS,
  SECTION_EXTENSION_FILE_TYPES,
  fileTypeForName,
  fileTypeForSection,
  type C3FileSection,
  IMAGE_FILE_TYPE_EXTENSIONS,
  SCRIPT_FILE_TYPE_EXTENSIONS,
} from "../src/c3source.js";
import { fixtureProjectAvailable, loadFixtureProject, PROJECT_MANIFEST } from "./fixtureHelpers.js";

describe("fileTypeForName / EXTENSION_FILE_TYPES", () => {
  it("FE1: the table holds exactly the audited and unvalidated pairs", () => {
    expect(EXTENSION_FILE_TYPES).to.deep.equal({
      ".css": "text/css",
      ".html": "text/html",
      ".json": "application/json",
      ".png": "image/png",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".ttf": "application/font-sfnt",
      ".webm": "audio/webm; codecs=opus",
      ".plist": "application/octet-stream",
      ".txt": "text/plain",
      ".xml": "text/xml",
      ".vtt": "application/octet-stream",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
    });
  });

  it("FE2: every key is a single-dot lowercase extension", () => {
    for (const key of Object.keys(EXTENSION_FILE_TYPES)) {
      expect(key, key).to.equal(key.toLowerCase());
      expect(key.startsWith("."), key).to.equal(true);
      expect(key.lastIndexOf("."), key).to.equal(0);
    }
  });

  it("FE3: unknown or missing extensions fall back to the default type", () => {
    for (const name of ["x.unknownext", "LICENSE", "", "archive."]) {
      expect(fileTypeForName(name), JSON.stringify(name)).to.equal(C3_DEFAULT_FILE_TYPE);
    }
  });

  it("FE4: extension matching is case-insensitive", () => {
    expect(fileTypeForName("PHOTO.JPG")).to.equal("image/jpeg");
    expect(EXTENSION_FILE_TYPES).to.have.property(".plist");
    expect(fileTypeForName("Info.PLIST")).to.equal("application/octet-stream");
    expect(fileTypeForName(".WebM")).to.equal("audio/webm; codecs=opus");
  });

  it("FE5: bare, posix-path and windows-path forms resolve on the basename", () => {
    expect(fileTypeForName(".jpg")).to.equal("image/jpeg");
    expect(fileTypeForName("files/sub/a.jpg")).to.equal("image/jpeg");
    expect(fileTypeForName("files\\a.jpg")).to.equal("image/jpeg");
    expect(fileTypeForName("a.b/noext")).to.equal(C3_DEFAULT_FILE_TYPE);
    expect(fileTypeForName("a.tar.gz")).to.equal(C3_DEFAULT_FILE_TYPE);
  });

  it("FE6: agrees with the reader-direction tables", () => {
    for (const table of [IMAGE_FILE_TYPE_EXTENSIONS, SCRIPT_FILE_TYPE_EXTENSIONS]) {
      for (const [mime, ext] of Object.entries(table)) {
        expect(EXTENSION_FILE_TYPES[ext], ext).to.equal(mime);
      }
    }
  });

  it("FE7: indexing the table with an unknown key is undefined", () => {
    expect(EXTENSION_FILE_TYPES[".nope"]).to.equal(undefined);
  });

  it("FE8: the default type is application/octet-stream", () => {
    expect(C3_DEFAULT_FILE_TYPE).to.equal("application/octet-stream");
  });

  it("FE9: every canonical-fixture rootFileFolders entry type matches the section-aware fileTypeForSection", function () {
    if (!fixtureProjectAvailable("files")) return this.skip();
    const manifest = JSON.parse(loadFixtureProject(PROJECT_MANIFEST)) as {
      rootFileFolders: Record<string, FileFolder>;
    };
    const walk = (section: string, folder: FileFolder, out: Visited[]): void => {
      for (const entry of folder.items ?? []) out.push({ section, name: entry.name, type: entry.type });
      for (const sub of folder.subfolders ?? []) walk(section, sub, out);
    };
    const visited: Visited[] = [];
    const bySection: Record<string, number> = {};
    for (const [section, folder] of Object.entries(manifest.rootFileFolders)) {
      const before = visited.length;
      walk(section, folder, visited);
      bySection[section] = visited.length - before;
    }
    const extensions = new Set<string>();
    for (const { section, name, type } of visited) {
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      extensions.add(ext);
      expect(type, `${section}/${name}`).to.equal(fileTypeForSection(section as C3FileSection, name));
      expect(Object.prototype.hasOwnProperty.call(EXTENSION_FILE_TYPES, ext), `${section}/${name}: ${ext}`).to.equal(
        true,
      );
    }
    expect(visited.length).to.equal(23);
    expect(extensions.size).to.equal(13);
    for (const section of ["general", "sound", "music", "font"]) {
      expect(bySection[section], section).to.be.greaterThan(0);
    }
  });

  it("FE10: C3_FILE_INFO_KEYS names the info key of all 7 sections; the default purpose is none", () => {
    expect(C3_FILE_INFO_KEYS).to.deep.equal({
      script: "script-info",
      sound: "file-info",
      music: "file-info",
      video: "file-info",
      font: "file-info",
      icon: "icon-info",
      general: "file-info",
    });
    expect(C3_DEFAULT_FILE_INFO_PURPOSE).to.equal("none");
  });

  it("FE11: SECTION_EXTENSION_FILE_TYPES overrides only the video .webm and .ogv extensions", () => {
    expect(SECTION_EXTENSION_FILE_TYPES).to.deep.equal({
      video: { ".webm": "video/webm", ".ogv": "video/ogg" },
    });
  });

  it("FE12: fileTypeForSection resolves video names case-insensitively and through path separators", () => {
    for (const name of ["clip.webm", "clip.WebM", "videos/sub/a.webm", "videos\\a.webm"]) {
      expect(fileTypeForSection("video", name), name).to.equal("video/webm");
    }
    expect(fileTypeForSection("video", "clip.ogv")).to.equal("video/ogg");
  });

  it("FE13: outside the (video, .webm) cell fileTypeForSection equals fileTypeForName", () => {
    const sections = Object.keys(C3_FILE_INFO_KEYS) as C3FileSection[];
    expect(sections).to.have.length(7);
    for (const section of sections) {
      for (const ext of Object.keys(EXTENSION_FILE_TYPES)) {
        if (section === "video" && ext === ".webm") continue;
        const name = `x${ext}`;
        expect(fileTypeForSection(section, name), `${section}/${name}`).to.equal(fileTypeForName(name));
      }
      for (const name of ["x.unknownext", "LICENSE"]) {
        expect(fileTypeForSection(section, name), `${section}/${name}`).to.equal(C3_DEFAULT_FILE_TYPE);
      }
    }
    expect(fileTypeForSection("sound", "a.webm")).to.equal("audio/webm; codecs=opus");
  });

  it("FE14: every canonical-fixture rootFileFolders entry carries its section's info key and no other", function () {
    if (!fixtureProjectAvailable("files")) return this.skip();
    const manifest = JSON.parse(loadFixtureProject(PROJECT_MANIFEST)) as {
      rootFileFolders: Record<string, InfoFolder>;
    };
    let visited = 0;
    const walk = (section: C3FileSection, folder: InfoFolder): void => {
      for (const entry of folder.items ?? []) {
        visited++;
        const infoKeys = Object.keys(entry).filter((k) => k.endsWith("-info"));
        expect(infoKeys, `${section}/${entry.name}`).to.deep.equal([C3_FILE_INFO_KEYS[section]]);
      }
      for (const sub of folder.subfolders ?? []) walk(section, sub);
    };
    for (const [section, folder] of Object.entries(manifest.rootFileFolders)) {
      walk(section as C3FileSection, folder);
    }
    expect(visited).to.be.greaterThan(0);
  });

  it("FE16: C3_VIDEO_IMPORT_EXTENSIONS lists the importable video extensions, each typed video/*", () => {
    expect(C3_VIDEO_IMPORT_EXTENSIONS).to.deep.equal([".webm", ".ogv", ".mp4"]);
    for (const m of C3_VIDEO_IMPORT_EXTENSIONS) {
      expect(fileTypeForSection("video", m), m).to.match(/^video\//);
    }
  });
});

interface InfoFolder {
  items?: ({ name: string } & Record<string, unknown>)[];
  subfolders?: InfoFolder[];
}

interface FileFolder {
  items?: { name: string; type: string }[];
  subfolders?: FileFolder[];
}

interface Visited {
  section: string;
  name: string;
  type: string;
}
