import { describe, it } from "mocha";
import { expect } from "chai";
import {
  EXTENSION_FILE_TYPES,
  C3_DEFAULT_FILE_TYPE,
  fileTypeForName,
  IMAGE_FILE_TYPE_EXTENSIONS,
  SCRIPT_FILE_TYPE_EXTENSIONS,
} from "../src/c3source.js";

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
});
