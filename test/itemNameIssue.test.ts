import { describe, it } from "mocha";
import { expect } from "chai";
import { C3_SYSTEM_EXPRESSION_NAMES, itemNameIssue, type C3NameSection } from "../src/c3source.js";

const STRIP_SECTIONS: { section: C3NameSection; label: string }[] = [
  { section: "layouts", label: "layout" },
  { section: "eventSheets", label: "event sheet" },
  { section: "timelines", label: "timeline" },
  { section: "flowcharts", label: "flowchart" },
  { section: "models3d", label: "model 3d" },
];

const FORBIDDEN = ["/", ":", "*", "?", '"', "<", ">", "|", "~", String.fromCharCode(92)];

// The 23 code points of the editor's whitespace set.
const WHITESPACE = [
  0x0020, 0x0009, 0x000a, 0x000d, 0x00a0, 0x0085, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
].map((c) => String.fromCodePoint(c));

// Not in the whitespace set: vertical tab, form feed, ogham space mark, byte-order mark.
const NOT_WHITESPACE = [0x000b, 0x000c, 0x1680, 0xfeff].map((c) => String.fromCodePoint(c));

const DEVICES = [
  "con",
  "prn",
  "aux",
  "nul",
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `com${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `lpt${n}`),
];

// The 15 characters that the shared `rq` set holds (full-width forms and quotes) plus the 27 literal ones.
const RT_CHARS = [
  ...[0x2e, 0x3002, 0x2c, 0xff0c, 0x22, 0x201c, 0x201d, 0x28, 0xff08, 0x29, 0xff09, 0x3f, 0xff1f, 0x3a, 0xff1a],
  ...[0x5c, 0x2f, 0x3b, 0x2a, 0x7c, 0x27, 0x2d, 0x60, 0x21, 0xac, 0xa3, 0x24, 0x25, 0x5e, 0x26, 0x2b, 0x3d],
  ...[0x3c, 0x3e, 0x7b, 0x7d, 0x5b, 0x5d, 0x40, 0x23, 0x7e, 0xad],
].map((c) => String.fromCodePoint(c));

describe("itemNameIssue", () => {
  it("IN1: the System expression table has 136 entries, distinct ignoring case", () => {
    expect(C3_SYSTEM_EXPRESSION_NAMES.length).to.equal(136);
    const folded = new Set(C3_SYSTEM_EXPRESSION_NAMES.map((n) => n.toLowerCase()));
    expect(folded.size, "case-insensitively distinct entries").to.equal(136);
  });

  it("IN2: the table starts at WindowWidth, ends at ColorToHexString and holds the common names", () => {
    expect(C3_SYSTEM_EXPRESSION_NAMES[0]).to.equal("WindowWidth");
    expect(C3_SYSTEM_EXPRESSION_NAMES[C3_SYSTEM_EXPRESSION_NAMES.length - 1]).to.equal("ColorToHexString");
    for (const n of ["time", "random", "len", "LayoutName", "dt", "fps"]) {
      expect(C3_SYSTEM_EXPRESSION_NAMES, `table includes '${n}'`).to.include(n);
    }
  });

  it("IN3: strip-family names that strip to nothing are empty, with the per-section message", () => {
    for (const { section, label } of STRIP_SECTIONS) {
      for (const input of ["", "...", "~~"]) {
        expect(itemNameIssue(section, input), `${section} '${input}'`).to.deep.equal({
          kind: "empty",
          name: "",
          message: `invalid ${label} name '${input}'`,
        });
      }
    }
  });

  it("IN4: the length limit is 200 code points", () => {
    for (const { section, label } of STRIP_SECTIONS) {
      expect(itemNameIssue(section, "a".repeat(199)), `${section} 199 code points`).to.equal(undefined);
      const at200 = "a".repeat(200);
      expect(itemNameIssue(section, at200), `${section} 200 code points`).to.deep.equal({
        kind: "too-long",
        name: at200,
        message: `invalid ${label} name '${at200}'`,
      });
      const at201 = "a".repeat(201);
      const issue = itemNameIssue(section, at201);
      expect(issue?.kind, `${section} 201 code points`).to.equal("too-long");
      expect([...(issue?.name ?? "")].length, `${section} 201 code points: name length`).to.equal(200);
    }
  });

  it("IN5: each forbidden character is stripped, giving rewritten", () => {
    expect(FORBIDDEN.length).to.equal(10);
    for (const { section } of STRIP_SECTIONS) {
      for (const ch of FORBIDDEN) {
        const input = `a${ch}b`;
        const label = `${section} '${input}' (U+${ch.codePointAt(0)!.toString(16)})`;
        expect(itemNameIssue(section, input), label).to.deep.equal({ kind: "rewritten", name: "ab" });
      }
    }
  });

  it("IN6: whitespace and dots are trimmed at either edge; four look-alikes are kept", () => {
    expect(WHITESPACE.length).to.equal(23);
    for (const { section } of STRIP_SECTIONS) {
      for (const ch of [...WHITESPACE, "."]) {
        const cp = `U+${ch.codePointAt(0)!.toString(16)}`;
        expect(itemNameIssue(section, `${ch}a`), `${section} leading ${cp}`).to.deep.equal({
          kind: "rewritten",
          name: "a",
        });
        expect(itemNameIssue(section, `a${ch}`), `${section} trailing ${cp}`).to.deep.equal({
          kind: "rewritten",
          name: "a",
        });
      }
      for (const ch of NOT_WHITESPACE) {
        const cp = `U+${ch.codePointAt(0)!.toString(16)}`;
        expect(itemNameIssue(section, `${ch}a`), `${section} leading ${cp}`).to.equal(undefined);
        expect(itemNameIssue(section, `a${ch}`), `${section} trailing ${cp}`).to.equal(undefined);
      }
    }
  });

  it("IN7: device names are refused whole, in any case, and only whole", () => {
    expect(DEVICES.length).to.equal(22);
    for (const { section, label } of STRIP_SECTIONS) {
      for (const d of DEVICES) {
        for (const input of [d, d.toUpperCase(), d[0].toUpperCase() + d.slice(1)]) {
          expect(itemNameIssue(section, input), `${section} '${input}'`).to.deep.equal({
            kind: "device-name",
            name: input,
            message: `invalid ${label} name '${input}'`,
          });
        }
      }
      for (const input of ["con.txt", "CONSOLE", "com0", "CONIN$"]) {
        expect(itemNameIssue(section, input), `${section} '${input}'`).to.equal(undefined);
      }
    }
    expect(itemNameIssue("layouts", "C~ON"), "layouts 'C~ON'").to.deep.equal({
      kind: "device-name",
      name: "CON",
      message: "invalid layout name 'C~ON'",
    });
  });

  it("IN8: a decomposed name is rewritten to its NFC form", () => {
    const input = String.fromCodePoint(0x65, 0x301);
    for (const { section } of STRIP_SECTIONS) {
      expect(itemNameIssue(section, input), `${section} e + U+0301`).to.deep.equal({
        kind: "rewritten",
        name: String.fromCodePoint(0xe9),
      });
    }
  });

  it("IN9: ordinary names are accepted unchanged", () => {
    for (const { section } of STRIP_SECTIONS) {
      for (const input of ["Level 1", "a.b"]) {
        expect(itemNameIssue(section, input), `${section} '${input}'`).to.equal(undefined);
      }
    }
  });

  it("IN10: the object-class transform capitalises after a space and drops the rt characters", () => {
    expect(RT_CHARS.length).to.equal(42);
    expect(new Set(RT_CHARS).size, "rt characters are distinct").to.equal(42);
    for (const section of ["objectTypes", "families"] as const) {
      expect(itemNameIssue(section, "my sprite"), `${section} 'my sprite'`).to.deep.equal({
        kind: "rewritten",
        name: "mySprite",
      });
      expect(itemNameIssue(section, "a  b"), `${section} 'a  b'`).to.deep.equal({ kind: "rewritten", name: "aB" });
      expect(itemNameIssue(section, "a\tb"), `${section} 'a<tab>b'`).to.deep.equal({ kind: "rewritten", name: "ab" });
      for (const ch of RT_CHARS) {
        const input = `a${ch}b`;
        expect(itemNameIssue(section, input), `${section} 'a<U+${ch.codePointAt(0)!.toString(16)}>b'`).to.deep.equal({
          kind: "rewritten",
          name: "ab",
        });
      }
      expect(itemNameIssue(section, "a_b"), `${section} 'a_b'`).to.equal(undefined);
      expect(itemNameIssue(section, "_ab"), `${section} '_ab'`).to.deep.equal({ kind: "rewritten", name: "ab" });
      expect(itemNameIssue(section, "1a"), `${section} '1a'`).to.equal(undefined);
    }
  });

  it("IN11: reserved object-class names are refused by kind", () => {
    const cases: [string, string][] = [
      ["CON", "device-name"],
      ["Self", "reserved-word"],
      ["TRUE", "reserved-word"],
      ["system", "reserved-word"],
      ["System", "reserved-word"],
      ["Time", "system-expression"],
      ["RANDOM", "system-expression"],
      ["layoutname", "system-expression"],
    ];
    for (const section of ["objectTypes", "families"] as const) {
      for (const [input, kind] of cases) {
        expect(itemNameIssue(section, input), `${section} '${input}'`).to.deep.equal({
          kind,
          name: input,
          message: input.toLowerCase() === "system" ? `object class name '${input}' already used` : "name is reserved",
        });
      }
      expect(itemNameIssue(section, "Times"), `${section} 'Times'`).to.equal(undefined);
    }
  });

  it("IN12: object-class names that transform to nothing are empty", () => {
    for (const section of ["objectTypes", "families"] as const) {
      for (const input of ["", "123", "_1", " "]) {
        expect(itemNameIssue(section, input), `${section} '${input}'`).to.deep.equal({
          kind: "empty",
          name: "",
          message: "invalid name",
        });
      }
    }
  });

  it("IN13: a refusal wins over a rewrite", () => {
    expect(itemNameIssue("objectTypes", "Time "), "objectTypes 'Time '").to.deep.equal({
      kind: "system-expression",
      name: "Time",
      message: "name is reserved",
    });
    expect(itemNameIssue("objectTypes", "C~ON"), "objectTypes 'C~ON'").to.deep.equal({
      kind: "device-name",
      name: "CON",
      message: "name is reserved",
    });
  });

  it("IN14: objectTypes and families give identical results", () => {
    const sample = ["", "123", " ", "CON", "Self", "System", "Time", "Time ", "my sprite", "a_b", "_ab", "1a"];
    for (const input of sample) {
      expect(itemNameIssue("families", input), `families '${input}'`).to.deep.equal(
        itemNameIssue("objectTypes", input),
      );
    }
  });

  it("IN15: the five strip sections agree apart from the message", () => {
    const nfd = String.fromCodePoint(0x65, 0x301);
    const sample = ["", "...", "CON", "C~ON", "a/b", " a", "Level 1", "a".repeat(200), nfd];
    for (const input of sample) {
      const results = STRIP_SECTIONS.map(({ section }) => ({ section, issue: itemNameIssue(section, input) }));
      const reference = results[0].issue;
      for (const { section, issue } of results) {
        expect(issue?.kind, `${section} '${input}': kind`).to.equal(reference?.kind);
        expect(issue?.name, `${section} '${input}': name`).to.equal(reference?.name);
      }
    }
  });

  it("IN16: a section that holds no named items throws", () => {
    expect(() => itemNameIssue("images" as C3NameSection, "x"), "section 'images'").to.throw(
      /unknown name section 'images'/,
    );
  });

  it("IN17: object-class names are normalised to NFC first", () => {
    for (const section of ["objectTypes", "families"] as const) {
      expect(itemNameIssue(section, String.fromCodePoint(0x65, 0x301)), `${section} e + U+0301`).to.deep.equal({
        kind: "rewritten",
        name: String.fromCodePoint(0xe9),
      });
    }
  });

  it("IN18: the length limit counts code points, not UTF-16 units", () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(itemNameIssue("layouts", "a".repeat(198) + emoji), "199 code points").to.equal(undefined);
    expect(itemNameIssue("layouts", "a".repeat(199) + emoji)?.kind, "200 code points").to.equal("too-long");
  });

  it("IN19: the length check uses the NFC form of the stripped name", () => {
    const input = "a".repeat(198) + "e~" + String.fromCodePoint(0x301);
    expect(itemNameIssue("layouts", input)).to.deep.equal({
      kind: "rewritten",
      name: "a".repeat(198) + "e" + String.fromCodePoint(0x301),
    });
  });
});
