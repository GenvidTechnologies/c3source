import { describe, it } from "mocha";
import { expect } from "chai";
import {
  C3_FONT_FILE_TYPES,
  C3_GENERAL_ROOT_RESERVED_FILE_NAMES,
  C3_ROOT_FILE_FOLDERS,
  EXTENSION_FILE_TYPES,
  rescanAdmissionIssue,
} from "../src/c3source.js";
import type { C3FileSection, RescanEntry } from "../src/c3source.js";

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

  // The 23 whitespace code points and 10 forbidden characters of the editor's name check (capture section 5.1).
  const WHITESPACE = [
    0x0020, 0x0009, 0x000a, 0x000d, 0x00a0, 0x0085, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  ].map((c) => String.fromCodePoint(c));
  const FORBIDDEN = [0x5c, 0x2f, 0x3a, 0x2a, 0x3f, 0x22, 0x3c, 0x3e, 0x7c, 0x7e].map((c) => String.fromCodePoint(c));
  const file = (name: string, atSectionRoot = true, extra: Partial<RescanEntry> = {}): RescanEntry => ({
    kind: "file",
    name,
    atSectionRoot,
    ...extra,
  });
  const folder = (name: string, atSectionRoot = true): RescanEntry => ({ kind: "folder", name, atSectionRoot });
  const NAME = { kind: "name" };
  const RESERVED = { kind: "reserved-root-name" };
  const TS_DEFS = { kind: "ts-defs" };

  it("name check: refuses an empty name", () => {
    expect(rescanAdmissionIssue("general", file(""))).to.deep.equal(NAME);
  });

  it("name check: refuses 200 code points after NFC and admits 199", () => {
    expect(rescanAdmissionIssue("general", file("a".repeat(196) + ".txt"))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("general", file("a".repeat(195) + ".txt"))).to.equal(undefined);
  });

  it("name check: counts code points after NFC, not UTF-16 units", () => {
    // 100 astral code points are 200 UTF-16 units but only 100 code points.
    const astral = String.fromCodePoint(0x1f600).repeat(100);
    expect(rescanAdmissionIssue("general", file(astral + ".txt"))).to.equal(undefined);
    // 199 decomposed e + U+0301 pairs compose to 199 code points; counted raw they would be 398.
    const decomposed = "e" + String.fromCodePoint(0x301);
    expect(rescanAdmissionIssue("general", file(decomposed.repeat(195) + ".txt"))).to.equal(undefined);
    expect(rescanAdmissionIssue("general", file(decomposed.repeat(196) + ".txt"))).to.deep.equal(NAME);
  });

  it("name check: refuses each of the 10 forbidden characters", () => {
    expect(FORBIDDEN).to.have.length(10);
    for (const c of FORBIDDEN) {
      expect(rescanAdmissionIssue("general", file(`a${c}b.txt`)), c).to.deep.equal(NAME);
    }
    expect(rescanAdmissionIssue("general", file("ab.txt"))).to.equal(undefined);
  });

  it("name check: refuses a leading or a trailing dot without stripping it", () => {
    expect(rescanAdmissionIssue("general", file(".a.txt"))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("general", file("a.txt."))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("general", file("a.b.txt"))).to.equal(undefined);
  });

  it("name check: refuses each of the 23 whitespace code points at either edge", () => {
    expect(WHITESPACE).to.have.length(23);
    for (const c of WHITESPACE) {
      const hex = c.codePointAt(0)!.toString(16);
      expect(rescanAdmissionIssue("general", file(`${c}a.txt`)), `leading ${hex}`).to.deep.equal(NAME);
      expect(rescanAdmissionIssue("general", file(`a.txt${c}`)), `trailing ${hex}`).to.deep.equal(NAME);
    }
    expect(rescanAdmissionIssue("general", file("a b.txt"))).to.equal(undefined);
  });

  it("name check: admits an edge code point outside the whitespace set", () => {
    for (const cp of [0x000b, 0x000c, 0x1680, 0xfeff]) {
      const c = String.fromCodePoint(cp);
      expect(rescanAdmissionIssue("general", file(`${c}a.txt`)), `leading ${cp}`).to.equal(undefined);
      expect(rescanAdmissionIssue("general", file(`a.txt${c}`)), `trailing ${cp}`).to.equal(undefined);
    }
  });

  it("name check: refuses a device name ignoring case and admits con.txt", () => {
    for (const n of ["con", "CON", "Prn", "aux", "NUL", "com1", "COM9", "lpt1", "LPT9"]) {
      expect(rescanAdmissionIssue("general", file(n)), n).to.deep.equal(NAME);
    }
    expect(rescanAdmissionIssue("general", file("con.txt"))).to.equal(undefined);
    expect(rescanAdmissionIssue("general", file("com0"))).to.equal(undefined);
  });

  it("name check: applies to folders", () => {
    expect(rescanAdmissionIssue("general", folder("con"))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("sound", folder(`a${FORBIDDEN[0]}b`, false))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("general", folder(""))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("general", folder("con2"))).to.equal(undefined);
  });

  it("name check: refuses a leading-dot name before the section rule", () => {
    expect(rescanAdmissionIssue("script", file(".js", true, { hasRegisteredFile: () => false }))).to.deep.equal(NAME);
  });

  it("reserved root names: refuses each of the 17 names in the general root, ignoring case", () => {
    expect(C3_GENERAL_ROOT_RESERVED_FILE_NAMES).to.have.length(17);
    for (const n of C3_GENERAL_ROOT_RESERVED_FILE_NAMES) {
      const opts = { hasRegisteredFile: () => false };
      expect(rescanAdmissionIssue("general", file(n, true, opts)), n).to.deep.equal(RESERVED);
      expect(rescanAdmissionIssue("general", file(n.toUpperCase(), true, opts)), n.toUpperCase()).to.deep.equal(
        RESERVED,
      );
    }
  });

  it("reserved root names: admits them in a general subfolder", () => {
    for (const n of C3_GENERAL_ROOT_RESERVED_FILE_NAMES) {
      const opts = { hasRegisteredFile: () => false };
      expect(rescanAdmissionIssue("general", file(n, false, opts)), n).to.equal(undefined);
    }
  });

  it("reserved root names: do not apply at the roots of the other six sections", () => {
    const sections = Object.keys(C3_ROOT_FILE_FOLDERS).filter((s) => s !== "general") as C3FileSection[];
    expect(sections).to.have.length(6);
    for (const s of sections) {
      for (const n of C3_GENERAL_ROOT_RESERVED_FILE_NAMES) {
        const r = rescanAdmissionIssue(s, file(n, true, { hasRegisteredFile: () => false }));
        expect(r?.kind, `${s}/${n}`).to.not.equal("reserved-root-name");
      }
    }
  });

  it("reserved root names: do not apply to folders", () => {
    expect(rescanAdmissionIssue("general", folder("sw.js"))).to.equal(undefined);
    expect(rescanAdmissionIssue("general", folder("index.html"))).to.equal(undefined);
  });

  it("reserved root names: win over the ts twin in the general root", () => {
    const r = rescanAdmissionIssue("general", file("sw.js", true, { hasRegisteredFile: () => true }));
    expect(r).to.deep.equal(RESERVED);
  });

  it("ts-defs: refuses a ts-defs folder at the script root", () => {
    expect(rescanAdmissionIssue("script", folder("ts-defs", true))).to.deep.equal(TS_DEFS);
    expect(rescanAdmissionIssue("script", folder("scripts2", true))).to.equal(undefined);
  });

  it("ts-defs: admits a ts-defs folder below the script root and in other sections", () => {
    expect(rescanAdmissionIssue("script", folder("ts-defs", false))).to.equal(undefined);
    for (const s of ["sound", "music", "video", "font", "icon", "general"] as C3FileSection[]) {
      expect(rescanAdmissionIssue(s, folder("ts-defs", true)), s).to.equal(undefined);
    }
  });

  it("ts-defs: compares the folder name exactly", () => {
    expect(rescanAdmissionIssue("script", folder("TS-DEFS", true))).to.equal(undefined);
    expect(rescanAdmissionIssue("script", folder("ts-defs ", true))).to.deep.equal(NAME);
    expect(rescanAdmissionIssue("script", folder("ts-defs2", true))).to.equal(undefined);
  });
});
