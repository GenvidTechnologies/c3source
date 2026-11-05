import { describe, it } from "mocha";
import { expect } from "chai";
import { C3_FONT_FILE_TYPES, C3_GENERAL_ROOT_RESERVED_FILE_NAMES, EXTENSION_FILE_TYPES } from "../src/c3source.js";

describe("rescanAdmissionIssue", () => {
  it("tables: C3_GENERAL_ROOT_RESERVED_FILE_NAMES holds the 17 r495 names in bundle order", () => {
    expect(C3_GENERAL_ROOT_RESERVED_FILE_NAMES).to.deep.equal([
      "appmanifest.json",
      "c2runtime.js",
      "c3runtime.js",
      "c3main.js",
      "data.json",
      "debug.html",
      "index.html",
      "local.html",
      "modernjscheck.js",
      "offline.json",
      "offlineclient.js",
      "register-sw.js",
      "javascriptinevents.js",
      "typescriptinevents.js",
      "start.js",
      "style.css",
      "sw.js",
    ]);
  });

  it("tables: C3_FONT_FILE_TYPES holds the four r495 font-flag types", () => {
    expect(C3_FONT_FILE_TYPES).to.deep.equal([
      "application/font-woff",
      "font/woff2",
      "application/font-sfnt",
      "application/vnd.ms-fontobject",
    ]);
    const known = new Set(Object.values(EXTENSION_FILE_TYPES));
    for (const type of C3_FONT_FILE_TYPES) expect(known.has(type), type).to.equal(true);
  });
});
