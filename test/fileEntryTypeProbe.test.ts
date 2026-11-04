import { describe, it } from "mocha";
import { expect } from "chai";
import { EXTENSION_FILE_TYPES, SECTION_EXTENSION_FILE_TYPES } from "../src/c3source.js";
import { classifyFileEntries } from "../scripts/file-entry-type.mjs";

const lib = { EXTENSION_FILE_TYPES, SECTION_EXTENSION_FILE_TYPES };

/** One-section manifest holding the given items at the top level of that section. */
function classifyOne(section: string, name: string | undefined, type: string | undefined) {
  const item: Record<string, unknown> = {};
  if (name !== undefined) item.name = name;
  if (type !== undefined) item.type = type;
  return classifyFileEntries(lib, { rootFileFolders: { [section]: { items: [item], subfolders: [] } } });
}

describe("file-entry-type classifier (probe 10)", () => {
  it("classifies a video .webm typed video/webm as MATCH", () => {
    expect(classifyOne("video", "clip.webm", "video/webm")).to.deep.equal([
      { section: "video", ext: ".webm", type: "video/webm", status: "MATCH" },
    ]);
  });

  it("classifies a video .webm typed with the flat audio value as MISMATCH", () => {
    const [entry] = classifyOne("video", "clip.webm", "audio/webm; codecs=opus");
    expect(entry.status).to.equal("MISMATCH");
  });

  it("classifies a sound .webm typed audio/webm; codecs=opus as MATCH", () => {
    expect(classifyOne("sound", "tone.webm", "audio/webm; codecs=opus")[0].status).to.equal("MATCH");
  });

  it("classifies a video .ogv typed video/ogg as MATCH", () => {
    expect(classifyOne("video", "clip.ogv", "video/ogg")[0].status).to.equal("MATCH");
  });

  it("classifies a sound .ogv typed video/ogg as MATCH through the flat row", () => {
    expect(classifyOne("sound", "x.ogv", "video/ogg")[0].status).to.equal("MATCH");
  });

  it("classifies an extension with no row as UNMAPPED", () => {
    expect(classifyOne("general", "x.unknownext", "application/octet-stream")[0].status).to.equal("UNMAPPED");
  });

  it("classifies .plist and .vtt typed application/octet-stream as MATCH", () => {
    const manifest = {
      rootFileFolders: {
        general: {
          items: [
            { name: "notes.plist", type: "application/octet-stream" },
            { name: "subs.vtt", type: "application/octet-stream" },
          ],
          subfolders: [],
        },
      },
    };
    expect(classifyFileEntries(lib, manifest).map((e) => [e.ext, e.status])).to.deep.equal([
      [".plist", "MATCH"],
      [".vtt", "MATCH"],
    ]);
  });

  it("coerces an item with no name without throwing and classifies it as (none), UNMAPPED", () => {
    const [entry] = classifyOne("general", undefined, "application/octet-stream");
    expect(entry.ext).to.equal("(none)");
    expect(entry.status).to.equal("UNMAPPED");
  });

  it("classifies an entry inside a subfolder", () => {
    const manifest = {
      rootFileFolders: {
        sound: {
          items: [],
          subfolders: [{ items: [], subfolders: [{ items: [{ name: "deep.ogv", type: "video/ogg" }] }] }],
        },
      },
    };
    expect(classifyFileEntries(lib, manifest)).to.deep.equal([
      { section: "sound", ext: ".ogv", type: "video/ogg", status: "MATCH" },
    ]);
  });

  it("lowercases the extension of an upper-case path name", () => {
    const [entry] = classifyOne("general", "Dir/UPPER.WEBM", "audio/webm; codecs=opus");
    expect(entry.ext).to.equal(".webm");
    expect(entry.status).to.equal("MATCH");
  });

  it("reports an absent recorded type as undefined", () => {
    const [entry] = classifyOne("general", "a.json", undefined);
    expect(entry.type).to.equal(undefined);
    expect(entry.status).to.equal("MISMATCH");
  });

  it("returns an empty array for a manifest without a usable rootFileFolders", () => {
    expect(classifyFileEntries(lib, null)).to.deep.equal([]);
    expect(classifyFileEntries(lib, {})).to.deep.equal([]);
    expect(classifyFileEntries(lib, { rootFileFolders: 5 })).to.deep.equal([]);
  });
});
