import { describe, it, before } from "mocha";
import { expect } from "chai";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  C3_PSEUDO_OBJECT_CLASSES,
  C3_DEFAULT_FUNCTIONS_NAME,
  NON_ATTRIBUTABLE_ADDON_TYPES,
  manifestObjectTypeNames,
  manifestFamilyNames,
  collectLayoutEffectIds,
  detectAddonReferenceIssues,
  detectFamilyMemberIssues,
  detectInstanceTypeIssues,
  detectEventClassIssues,
  detectReferenceIntegrity,
  type SourceDoc,
  type ReferenceIntegrityResult,
} from "../src/references.js";
import {
  openProject,
  readProjectManifest,
  visitEvents,
  type C3ProjectManifest,
  type C3UsedAddon,
  type CustomAceBlockEvent,
  type EventSheet,
  type Family,
  type FunctionBlockEvent,
  type Layout,
  type ObjectType,
} from "../src/c3source.js";
import { writeC3JsonFile } from "../src/serialize.js";
import { fixtureProjectExists, fixtureProjectPath, makeTempProject } from "./fixtureHelpers.js";

/** A minimal manifest satisfying every collectManifestIssues-required top-level field (mirrors openProject.test.ts). */
function minimalManifest(name: string): C3ProjectManifest {
  return {
    name,
    runtime: "c3",
    projectFormatVersion: 1,
    savedWithRelease: 187,
  } as unknown as C3ProjectManifest;
}

describe("reference-integrity domain-fact tables", () => {
  it('R-R22: C3_PSEUDO_OBJECT_CLASSES deep-equals ["System"] (tripwire — widening is a reviewed edit; "Functions" moved to C3_DEFAULT_FUNCTIONS_NAME, #60)', () => {
    expect(C3_PSEUDO_OBJECT_CLASSES).to.deep.equal(["System"]);
  });

  it("R-R23: NON_ATTRIBUTABLE_ADDON_TYPES deep-equals [\"theme\"] (tripwire — widening is a reviewed edit)", () => {
    expect(NON_ATTRIBUTABLE_ADDON_TYPES).to.deep.equal(["theme"]);
  });
});

describe("manifestObjectTypeNames / manifestFamilyNames", () => {
  const FIXTURE_DIR = fixtureProjectPath();
  const MANIFEST_PATH = path.join(FIXTURE_DIR, "project.c3proj");
  let m: C3ProjectManifest;

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    m = readProjectManifest(MANIFEST_PATH);
  });

  it("R-R24: manifestObjectTypeNames returns the fixture's declared object-type names", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const names = manifestObjectTypeNames(m);
    expect(names).to.be.instanceOf(Set);
    expect(names.size).to.be.greaterThan(0);
    // spot-check membership rather than the exact set, so this test is not coupled
    // to every future fixture object type.
    for (const name of names) expect(typeof name).to.equal("string");
  });

  it("R-R25: manifestFamilyNames returns the fixture's declared family names", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const names = manifestFamilyNames(m);
    expect(names).to.be.instanceOf(Set);
    for (const name of names) expect(typeof name).to.equal("string");
  });

  it("R-R26: both helpers are empty-safe when the section is absent (no throw)", () => {
    const bare = {} as C3ProjectManifest;
    expect(manifestObjectTypeNames(bare)).to.deep.equal(new Set());
    expect(manifestFamilyNames(bare)).to.deep.equal(new Set());
  });
});

describe("collectLayoutEffectIds", () => {
  it("R-R27: a layer-level effect is reported with jsonPath and layerFullName", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", effectTypes: [{ effectId: "Glow", name: "Glow" }] }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Glow", jsonPath: "layers[0].effectTypes[0]", layerFullName: "L.A" },
    ]);
  });

  it("R-R28: a layout-level effect is reported with no layerFullName", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A" }],
      effectTypes: [{ effectId: "Blur", name: "Blur" }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([{ effectId: "Blur", jsonPath: "effectTypes[0]" }]);
  });

  it("R-R29: a nested sublayer effect carries the dotted fullName and the nested jsonPath", () => {
    const layout: Layout = {
      name: "L",
      layers: [
        {
          name: "A",
          subLayers: [{ name: "B", effectTypes: [{ effectId: "Warp", name: "Warp" }] }],
        },
      ],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Warp", jsonPath: "layers[0].subLayers[0].effectTypes[0]", layerFullName: "L.A.B" },
    ]);
  });

  it("R-R30: a layout with no effects anywhere returns []", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", subLayers: [{ name: "B" }] }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([]);
  });

  it("R-R31: layout-level and layer-level effects both appear, layout-level first", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", effectTypes: [{ effectId: "Glow", name: "Glow" }] }],
      effectTypes: [{ effectId: "Blur", name: "Blur" }],
    };
    expect(collectLayoutEffectIds(layout)).to.deep.equal([
      { effectId: "Blur", jsonPath: "effectTypes[0]" },
      { effectId: "Glow", jsonPath: "layers[0].effectTypes[0]", layerFullName: "L.A" },
    ]);
  });
});

describe("detectAddonReferenceIssues — against the canonical fixture", () => {
  const FIXTURE_DIR = fixtureProjectPath();

  /** Fixture-root-relative, POSIX-normalized path, mirrors manifestSerialize.test.ts's `rel`. */
  const rel = (f: string): string => path.relative(FIXTURE_DIR, f).split(path.sep).join("/");

  let manifest: C3ProjectManifest;
  let objectTypeDocs: SourceDoc<ObjectType>[];
  let familyDocs: SourceDoc<Family>[];
  let layoutDocs: SourceDoc<Layout>[];

  before(function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const project = openProject(FIXTURE_DIR);
    manifest = project.manifest();
    // No `.json` guard before JSON.parse, deliberately: as of 2.0.0 every name-section
    // finder returns only `.json` section items (ADR 0025), so a stray file can no longer
    // reach a parse here. Before that these three calls were unguarded by luck — the
    // fixture happens to hold no stray — which is exactly the hazard the finders now own.
    objectTypeDocs = project
      .findAllObjectTypes()
      .map((p) => ({ file: rel(p), value: JSON.parse(readFileSync(p, "utf-8")) as ObjectType }));
    familyDocs = project
      .findAllFamilies()
      .map((p) => ({ file: rel(p), value: JSON.parse(readFileSync(p, "utf-8")) as Family }));
    layoutDocs = project
      .findAllLayouts()
      .map((p) => ({ file: rel(p), value: JSON.parse(readFileSync(p, "utf-8")) as Layout }));
  });

  function cloneManifest(): C3ProjectManifest {
    return JSON.parse(JSON.stringify(manifest));
  }

  it("R-R32: the clean fixture is addon-reference-issue-free (baseline)", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    expect(detectAddonReferenceIssues(manifest, objectTypeDocs, familyDocs, layoutDocs)).to.deep.equal([]);
  });

  it("R-R33: a family-only addon (Timer, attached only to TextFamily) missing from usedAddons is addon-undeclared", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const clone = cloneManifest();
    clone.usedAddons = (clone.usedAddons ?? []).filter((a) => !(a.type === "behavior" && a.id === "Timer"));
    const issues = detectAddonReferenceIssues(clone, objectTypeDocs, familyDocs, layoutDocs);
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "addon-undeclared",
      severity: "error",
      name: "Timer",
      addonType: "behavior",
      owner: "TextFamily",
      jsonPath: "behaviorTypes[0]",
    });
    expect(issues[0].file.endsWith("families/TextFamily.json")).to.equal(true);
  });

  it("R-R34: an object type's plugin-id with no usedAddons match is addon-undeclared", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const mutated = objectTypeDocs.map((doc) =>
      doc.value.name === "Sprite" ? { file: doc.file, value: { ...doc.value, "plugin-id": "SpriteXYZ" } } : doc,
    );
    const issues = detectAddonReferenceIssues(manifest, mutated, familyDocs, layoutDocs);
    const spriteIssues = issues.filter((i) => i.name === "SpriteXYZ");
    expect(spriteIssues.length).to.equal(1);
    expect(spriteIssues[0]).to.include({
      kind: "addon-undeclared",
      severity: "error",
      addonType: "plugin",
      owner: "Sprite",
      jsonPath: "plugin-id",
    });
  });

  it("R-R35: an unmatched usedAddons entry is addon-unused, indexed at its original manifest position", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const clone = cloneManifest();
    expect((clone.usedAddons ?? []).length).to.equal(13);
    clone.usedAddons = [
      ...(clone.usedAddons ?? []),
      { type: "effect", id: "NotUsed", name: "Not Used", author: "x", bundled: false },
    ];
    const issues = detectAddonReferenceIssues(clone, objectTypeDocs, familyDocs, layoutDocs);
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "addon-unused",
      severity: "warning",
      name: "NotUsed",
      addonType: "effect",
      file: "project.c3proj",
      owner: "",
      jsonPath: "usedAddons[13]",
    });
  });
});

describe("detectAddonReferenceIssues — synthetic layer/layout-effect and edge cases", () => {
  function usedAddon(type: string, id: string, name = id): C3UsedAddon {
    return { type, id, name, author: "x", bundled: false };
  }

  function manifestWith(addons: C3UsedAddon[]): C3ProjectManifest {
    return { usedAddons: addons } as unknown as C3ProjectManifest;
  }

  const layoutWithLayerEffect: SourceDoc<Layout> = {
    file: "layouts/L.json",
    value: { name: "L", layers: [{ name: "A", effectTypes: [{ effectId: "burn", name: "Burn" }] }] },
  };

  it("R-R36: a layer-level effect matching usedAddons counts as used — zero addon-unused when the layout is included", () => {
    const manifest = manifestWith([usedAddon("effect", "burn", "Burn")]);
    const issues = detectAddonReferenceIssues(manifest, [], [], [layoutWithLayerEffect]);
    expect(issues).to.deep.equal([]);
  });

  it("R-R37: omitting the layout re-surfaces the same addon as unused (pins the 2->0 layer-effect fix)", () => {
    const manifest = manifestWith([usedAddon("effect", "burn", "Burn")]);
    const issues = detectAddonReferenceIssues(manifest, [], [], []);
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({ kind: "addon-unused", severity: "warning", name: "burn", addonType: "effect" });
  });

  it("R-R38: a layout-level (not layer-level) effectTypes entry also counts as used", () => {
    const manifest = manifestWith([usedAddon("effect", "burn", "Burn")]);
    const layoutWithLayoutEffect: SourceDoc<Layout> = {
      file: "layouts/L.json",
      value: { name: "L", layers: [{ name: "A" }], effectTypes: [{ effectId: "burn", name: "Burn" }] },
    };
    const issues = detectAddonReferenceIssues(manifest, [], [], [layoutWithLayoutEffect]);
    expect(issues).to.deep.equal([]);
  });

  it("R-R39: an undeclared layer effect is addon-undeclared, carrying the layer's jsonPath and layerFullName", () => {
    const manifest = manifestWith([]);
    const issues = detectAddonReferenceIssues(manifest, [], [], [layoutWithLayerEffect]);
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "addon-undeclared",
      severity: "error",
      name: "burn",
      addonType: "effect",
      file: "layouts/L.json",
      owner: "L",
      jsonPath: "layers[0].effectTypes[0]",
      layerFullName: "L.A",
    });
  });

  it("R-R40: a usedAddons entry of a non-attributable type (theme) produces no issue by default", () => {
    const manifest = manifestWith([usedAddon("theme", "dark", "Dark")]);
    expect(detectAddonReferenceIssues(manifest, [], [], [])).to.deep.equal([]);
  });

  it("R-R41: options.nonAttributableAddonTypes: [] widens detection — the same theme entry now reports addon-unused", () => {
    const manifest = manifestWith([usedAddon("theme", "dark", "Dark")]);
    const issues = detectAddonReferenceIssues(manifest, [], [], [], { nonAttributableAddonTypes: [] });
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "addon-unused",
      severity: "warning",
      name: "dark",
      addonType: "theme",
      jsonPath: "usedAddons[0]",
    });
  });

  it("R-R42: the join key is (type, id), never name — a name-matching but id-mismatched entry yields both an addon-undeclared and an addon-unused", () => {
    const spriteDoc: SourceDoc<ObjectType> = {
      file: "objectTypes/Sprite.json",
      value: { name: "Sprite", "plugin-id": "Sprite" },
    };
    // manifest keeps the display name "Sprite" but the id is wrong ("SpritePlugin") — a name
    // join would (incorrectly) resolve this; the (type, id) join must not.
    const manifest = manifestWith([{ type: "plugin", id: "SpritePlugin", name: "Sprite", author: "x", bundled: false }]);
    const issues = detectAddonReferenceIssues(manifest, [spriteDoc], [], []);
    expect(issues.length).to.equal(2);
    const undeclared = issues.find((i) => i.kind === "addon-undeclared");
    const unused = issues.find((i) => i.kind === "addon-unused");
    expect(undeclared).to.include({
      severity: "error",
      name: "Sprite",
      addonType: "plugin",
      owner: "Sprite",
      jsonPath: "plugin-id",
    });
    expect(unused).to.include({
      severity: "warning",
      name: "SpritePlugin",
      addonType: "plugin",
      file: "project.c3proj",
      owner: "",
      jsonPath: "usedAddons[0]",
    });
  });

  it("R-R43: usedAddons absent entirely reports no addon-unused; every derived id surfaces as addon-undeclared", () => {
    const spriteDoc: SourceDoc<ObjectType> = {
      file: "objectTypes/Sprite.json",
      value: { name: "Sprite", "plugin-id": "Sprite" },
    };
    const bare = {} as C3ProjectManifest;
    const issues = detectAddonReferenceIssues(bare, [spriteDoc], [], []);
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({ kind: "addon-undeclared", severity: "error", name: "Sprite", addonType: "plugin" });
  });
});

describe("detectFamilyMemberIssues", () => {
  it("R-R44: a family member naming a missing object type yields one family-member-missing issue", () => {
    const doc: SourceDoc<Family> = {
      file: "families/TextFamily.json",
      value: { name: "TextFamily", "plugin-id": "", members: ["Sprite", "Ghost"] },
    };
    const issues = detectFamilyMemberIssues([doc], new Set(["Sprite"]));
    expect(issues).to.deep.equal([
      {
        kind: "family-member-missing",
        severity: "error",
        name: "Ghost",
        file: "families/TextFamily.json",
        owner: "TextFamily",
        jsonPath: "members[1]",
        message:
          'Family "TextFamily" (families/TextFamily.json, members[1]) names object type "Ghost" which has no matching entry in the manifest',
      },
    ]);
  });

  it("R-R45: every member resolving returns []", () => {
    const doc: SourceDoc<Family> = {
      file: "families/TextFamily.json",
      value: { name: "TextFamily", "plugin-id": "", members: ["Sprite", "Text"] },
    };
    const issues = detectFamilyMemberIssues([doc], new Set(["Sprite", "Text"]));
    expect(issues).to.deep.equal([]);
  });

  it("R-R46: absent or non-array members returns [] without throwing", () => {
    const noMembers = { file: "families/A.json", value: { name: "A", "plugin-id": "" } as Family };
    const badMembers = {
      file: "families/B.json",
      value: { name: "B", "plugin-id": "", members: "Sprite" as unknown } as unknown as Family,
    };
    expect(detectFamilyMemberIssues([noMembers], new Set())).to.deep.equal([]);
    expect(detectFamilyMemberIssues([badMembers], new Set())).to.deep.equal([]);
  });
});

describe("detectInstanceTypeIssues", () => {
  it("R-R47: a 3-deep nested sublayer instance with a missing type carries the exact jsonPath and layerFullName", () => {
    const layout: Layout = {
      name: "Second Layout",
      layers: [
        { name: "layer 1" },
        { name: "layer 2" },
        {
          name: "sublayer 1.1",
          subLayers: [
            {
              name: "sublayer 1.1.1",
              subLayers: [
                {
                  name: "sublayer 1.1.1.1",
                  instances: [{ type: "Ghost", uid: 1, properties: {} }],
                },
              ],
            },
          ],
        },
      ],
    };
    const issues = detectInstanceTypeIssues([{ file: "layouts/Second Layout.json", value: layout }], new Set());
    expect(issues).to.deep.equal([
      {
        kind: "instance-type-missing",
        severity: "error",
        name: "Ghost",
        file: "layouts/Second Layout.json",
        owner: "Second Layout",
        jsonPath: "layers[2].subLayers[0].subLayers[0].instances[0]",
        layerFullName: "Second Layout.sublayer 1.1.sublayer 1.1.1.sublayer 1.1.1.1",
        message:
          'Layout "Second Layout" (layouts/Second Layout.json, layers[2].subLayers[0].subLayers[0].instances[0]) has an instance of type "Ghost" which has no matching entry in the manifest',
      },
    ]);
  });

  it("R-R48: a nonworld-instances entry with a missing type has no layerFullName", () => {
    const layout: Layout = {
      name: "Second Layout",
      layers: [],
      "nonworld-instances": [{ type: "Ghost", uid: 1, properties: {} }],
    };
    const issues = detectInstanceTypeIssues([{ file: "layouts/Second Layout.json", value: layout }], new Set());
    expect(issues).to.have.lengthOf(1);
    expect(issues[0]).to.include({
      kind: "instance-type-missing",
      severity: "error",
      name: "Ghost",
      jsonPath: "nonworld-instances[0]",
      owner: "Second Layout",
    });
    expect(issues[0].layerFullName).to.equal(undefined);
  });

  it("R-R49: every instance type resolving (layer and nonworld) returns []", () => {
    const layout: Layout = {
      name: "L",
      layers: [{ name: "A", instances: [{ type: "Sprite", uid: 1, properties: {} }] }],
      "nonworld-instances": [{ type: "Text", uid: 2, properties: {} }],
    };
    const issues = detectInstanceTypeIssues(
      [{ file: "layouts/L.json", value: layout }],
      new Set(["Sprite", "Text"]),
    );
    expect(issues).to.deep.equal([]);
  });

  it("R-R50: a layout with no layers and no nonworld-instances returns [] without throwing", () => {
    const layout = { name: "Empty" } as Layout;
    const issues = detectInstanceTypeIssues([{ file: "layouts/Empty.json", value: layout }], new Set());
    expect(issues).to.deep.equal([]);
  });
});

describe("detectEventClassIssues", () => {
  /** Minimal well-formed CustomAceBlockEvent, sid overridable to avoid collisions within a sheet. */
  function customAceBlock(objectClass: string, sid = 10): CustomAceBlockEvent {
    return {
      eventType: "custom-ace-block",
      aceType: "action",
      aceName: "MyAce",
      objectClass,
      functionReturnType: "none",
      functionCopyPicked: false,
      functionIsAsync: false,
      functionParameters: [],
      conditions: [],
      actions: [],
      sid,
    };
  }

  /** Minimal well-formed FunctionBlockEvent — carries no objectClass of its own. */
  function functionBlock(sid = 11): FunctionBlockEvent {
    return {
      eventType: "function-block",
      functionName: "MyFunction",
      functionReturnType: "none",
      functionCopyPicked: false,
      functionIsAsync: false,
      functionParameters: [],
      conditions: [],
      actions: [],
      sid,
    };
  }

  it("R-R51: System and Functions ACEs are both unflagged (the two seeded pseudo-classes)", () => {
    const sheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "on-start-of-layout", objectClass: "System", sid: 3 }],
          actions: [{ id: "set-function-return-value", objectClass: "Functions", parameters: {} }],
        },
      ],
    };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set());
    expect(issues).to.deep.equal([]);
  });

  it('R-R52: an action referencing objectClass "Ghost" yields one event-class-unresolved warning', () => {
    const sheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [],
          actions: [{ id: "some-action", objectClass: "Ghost" }],
        },
      ],
    };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set());
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "event-class-unresolved",
      severity: "warning",
      name: "Ghost",
      file: "eventSheets/Sheet.json",
      owner: "Sheet",
      jsonPath: "events[0]",
    });
  });

  const nestedSheet: EventSheet = {
    name: "Nested Sheet",
    sid: 1,
    events: [
      {
        eventType: "group",
        sid: 2,
        disabled: false,
        title: "Group",
        isActiveOnStart: true,
        children: [
          {
            eventType: "block",
            sid: 3,
            conditions: [{ id: "some-condition", objectClass: "Ghost", sid: 4 }],
            actions: [],
          },
        ],
      },
    ],
  };

  it("R-R53: an unresolved class nested inside a group's children produces the nested jsonPath, not the top-level group's", () => {
    const issues = detectEventClassIssues([{ file: "eventSheets/Nested.json", value: nestedSheet }], new Set());
    expect(issues.length).to.equal(1);
    expect(issues[0].jsonPath).to.equal("events[0].children[0]");
  });

  it("R-R54: drift lock — the reported jsonPath is string-identical to an independent visitEvents walk over the same sheet", () => {
    const issues = detectEventClassIssues([{ file: "eventSheets/Nested.json", value: nestedSheet }], new Set());
    expect(issues.length).to.equal(1);

    // Independent walk, written longhand here: does NOT call detectEventClassIssues, does NOT
    // reuse any value it returned, and does NOT share a helper with the implementation. This is
    // what makes the lock non-vacuous — it proves the detector's jsonPath matches a coordinate
    // derived by a second, separately-written visitEvents pass, not merely itself.
    let expectedJsonPath: string | undefined;
    visitEvents(nestedSheet.events, (event, ctx) => {
      if (event.eventType === "block" && event.conditions.some((c) => c.objectClass === "Ghost")) {
        expectedJsonPath = ctx.jsonPath;
      }
    });

    expect(expectedJsonPath).to.equal("events[0].children[0]");
    expect(issues[0].jsonPath).to.equal(expectedJsonPath);
  });

  it('R-R55: objectClass "TextFamily" resolves when classNames includes family names, not just object-type names', () => {
    const sheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "some-condition", objectClass: "TextFamily", sid: 3 }],
          actions: [],
        },
      ],
    };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set(["TextFamily"]));
    expect(issues).to.deep.equal([]);
  });

  it('R-R56: options.pseudoObjectClasses suppresses the "Ghost" finding when it includes "Ghost"', () => {
    const sheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "some-condition", objectClass: "Ghost", sid: 3 }],
          actions: [],
        },
      ],
    };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set(), {
      pseudoObjectClasses: ["Ghost"],
    });
    expect(issues).to.deep.equal([]);
  });

  it("R-R57: a custom-ace-block event's own top-level objectClass is checked", () => {
    const sheet: EventSheet = { name: "Sheet", sid: 1, events: [customAceBlock("Ghost")] };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set());
    expect(issues.length).to.equal(1);
    expect(issues[0]).to.include({
      kind: "event-class-unresolved",
      severity: "warning",
      name: "Ghost",
      jsonPath: "events[0]",
    });
  });

  it("R-R58: a function-block (which has no objectClass of its own) produces no spurious issue and does not throw", () => {
    const sheet: EventSheet = { name: "Sheet", sid: 1, events: [functionBlock()] };
    expect(() =>
      detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set()),
    ).to.not.throw();
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set());
    expect(issues).to.deep.equal([]);
  });

  it("R-R59: granularity is one issue per event — repeated refs to the same unresolved class collapse to one, distinct classes report once each", () => {
    const sameClassSheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "c1", objectClass: "Ghost", sid: 3 }],
          actions: [
            { id: "a1", objectClass: "Ghost" },
            { id: "a2", objectClass: "Ghost" },
          ],
        },
      ],
    };
    const sameClassIssues = detectEventClassIssues(
      [{ file: "eventSheets/Sheet.json", value: sameClassSheet }],
      new Set(),
    );
    expect(sameClassIssues.length).to.equal(1);

    const twoClassesSheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "c1", objectClass: "Ghost", sid: 3 }],
          actions: [{ id: "a1", objectClass: "Phantom" }],
        },
      ],
    };
    const twoClassesIssues = detectEventClassIssues(
      [{ file: "eventSheets/Sheet.json", value: twoClassesSheet }],
      new Set(),
    );
    expect(twoClassesIssues.length).to.equal(2);
    expect(twoClassesIssues.map((i) => i.name).sort()).to.deep.equal(["Ghost", "Phantom"]);
  });

  it("R-R60: an all-resolving sheet (conditions, actions, and a custom-ace-block, all matching classNames or pseudo-classes) returns []", () => {
    const sheet: EventSheet = {
      name: "Sheet",
      sid: 1,
      events: [
        {
          eventType: "block",
          sid: 2,
          conditions: [{ id: "c1", objectClass: "Sprite", sid: 3 }],
          actions: [{ id: "a1", objectClass: "System" }],
        },
        customAceBlock("Sprite", 20),
      ],
    };
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set(["Sprite"]));
    expect(issues).to.deep.equal([]);
  });
});

describe("detectReferenceIntegrity — I/O orchestrator", () => {
  it("R-R61: the clean canonical fixture is reference-integrity-issue-free (ok === true, issues deep-equals [])", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const result = detectReferenceIntegrity(fixtureProjectPath());
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);
  });

  it("R-R62: a minimal manifest with no source directories at all is ok, without throwing", () => {
    const root = makeTempProject(minimalManifest("Empty"));
    let result: ReferenceIntegrityResult | undefined;
    expect(() => {
      result = detectReferenceIntegrity(root);
    }).to.not.throw();
    expect(result!.ok).to.equal(true);
    expect(result!.issues).to.deep.equal([]);
  });

  it("R-R63: a stray notes.txt and *.uistate.json under each source directory are ignored — no throw, no issues (pins the mandatory .json predicate)", () => {
    const root = makeTempProject(minimalManifest("Stray"));
    for (const folder of ["layouts", "objectTypes", "families", "eventSheets"]) {
      const dir = path.join(root, folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "notes.txt"), "not json");
      writeFileSync(path.join(dir, "Something.uistate.json"), "{}");
    }
    let result: ReferenceIntegrityResult | undefined;
    expect(() => {
      result = detectReferenceIntegrity(root);
    }).to.not.throw();
    expect(result!.issues).to.deep.equal([]);
    expect(result!.ok).to.equal(true);
  });

  it("R-R64: an issue's file is project-root-relative and forward-slash-normalized, never backslash (pins path normalization on Windows)", () => {
    const root = makeTempProject(minimalManifest("Norm"));
    const familiesDir = path.join(root, "families");
    mkdirSync(familiesDir, { recursive: true });
    writeC3JsonFile(path.join(familiesDir, "X.json"), { name: "X", "plugin-id": "", members: ["Ghost"] });

    const result = detectReferenceIntegrity(root);
    const missing = result.issues.filter((i) => i.kind === "family-member-missing");
    expect(missing.length).to.equal(1);
    expect(missing[0].file).to.equal("families/X.json");
    expect(missing[0].file).to.not.include("\\");
  });

  it("R-R65: detectReferenceIntegrity never mutates the passed-in manifest object or any source file's bytes on disk", () => {
    const root = makeTempProject(minimalManifest("NoMutate"));
    const familiesDir = path.join(root, "families");
    const objectTypesDir = path.join(root, "objectTypes");
    mkdirSync(familiesDir, { recursive: true });
    mkdirSync(objectTypesDir, { recursive: true });
    writeC3JsonFile(path.join(familiesDir, "X.json"), { name: "X", "plugin-id": "", members: ["Sprite"] });
    writeC3JsonFile(path.join(objectTypesDir, "Sprite.json"), { name: "Sprite", "plugin-id": "Sprite" });

    const manifest = readProjectManifest(path.join(root, "project.c3proj"));
    const manifestSnapshot = JSON.parse(JSON.stringify(manifest));
    const familyBytesBefore = readFileSync(path.join(familiesDir, "X.json"));
    const objectTypeBytesBefore = readFileSync(path.join(objectTypesDir, "Sprite.json"));

    detectReferenceIntegrity(root, manifest);

    expect(manifest).to.deep.equal(manifestSnapshot);
    expect(readFileSync(path.join(familiesDir, "X.json"))).to.deep.equal(familyBytesBefore);
    expect(readFileSync(path.join(objectTypesDir, "Sprite.json"))).to.deep.equal(objectTypeBytesBefore);
  });

  it("R-R66: an explicit manifest parameter is honoured over the on-disk manifest — a mutated clone changes the result", () => {
    const root = makeTempProject(minimalManifest("Explicit"));
    const familiesDir = path.join(root, "families");
    mkdirSync(familiesDir, { recursive: true });
    writeC3JsonFile(path.join(familiesDir, "X.json"), { name: "X", "plugin-id": "", members: ["Sprite"] });

    const resultFromDisk = detectReferenceIntegrity(root);
    expect(
      resultFromDisk.issues.some((i) => i.kind === "family-member-missing" && i.name === "Sprite"),
    ).to.equal(true);

    const onDiskManifest = readProjectManifest(path.join(root, "project.c3proj"));
    const declared: C3ProjectManifest = {
      ...onDiskManifest,
      objectTypes: { items: ["Sprite"], subfolders: [] },
    } as C3ProjectManifest;
    const resultExplicit = detectReferenceIntegrity(root, declared);
    expect(resultExplicit.issues.some((i) => i.kind === "family-member-missing")).to.equal(false);
  });
});

// ─── functionsName resolution (#60) ────────────────────────────────────────
//
// "Functions" was originally a static entry in C3_PSEUDO_OBJECT_CLASSES, but it is
// actually the *default value* of project.c3proj's per-project `functionsName`
// attribute — a project that renames its functions object (e.g. to "Fn") emits
// that name as objectClass on every function ACE, which the static table could
// never resolve. These tests cover the fix: C3_DEFAULT_FUNCTIONS_NAME as the
// domain-fact default, detectReferenceIntegrity folding manifest.functionsName
// into resolution, and detectEventClassIssues's options.functionsName escape
// hatch for direct callers with no manifest.

/** Minimal well-formed EventSheet whose only event has one action referencing `objectClass`. */
function eventSheetWithFunctionsAce(name: string, objectClass: string): unknown {
  return {
    name,
    sid: 1,
    events: [
      {
        eventType: "block",
        sid: 2,
        conditions: [],
        actions: [{ id: "set-function-return-value", objectClass, parameters: {} }],
      },
    ],
  };
}

describe("C3_DEFAULT_FUNCTIONS_NAME (#60)", () => {
  it('R-R67: C3_DEFAULT_FUNCTIONS_NAME === "Functions"', () => {
    expect(C3_DEFAULT_FUNCTIONS_NAME).to.equal("Functions");
  });
});

describe("detectReferenceIntegrity — functionsName resolution (#60)", () => {
  it("R-R68: a manifest with functionsName \"Functions\" (or absent) resolves an ACE targeting \"Functions\" — no issue", () => {
    for (const manifest of [minimalManifest("DefaultAbsent"), { ...minimalManifest("DefaultExplicit"), functionsName: "Functions" }]) {
      const root = makeTempProject(manifest);
      const eventSheetsDir = path.join(root, "eventSheets");
      mkdirSync(eventSheetsDir, { recursive: true });
      writeC3JsonFile(path.join(eventSheetsDir, "Sheet.json"), eventSheetWithFunctionsAce("Sheet", "Functions"));

      const result = detectReferenceIntegrity(root);
      expect(result.ok).to.equal(true);
      expect(result.issues).to.deep.equal([]);
    }
  });

  it('R-R69: the renamed case (the actual bug) — functionsName "Fn" + an ACE targeting "Fn" resolves — no issue', () => {
    const manifest = { ...minimalManifest("Renamed"), functionsName: "Fn" };
    const root = makeTempProject(manifest);
    const eventSheetsDir = path.join(root, "eventSheets");
    mkdirSync(eventSheetsDir, { recursive: true });
    writeC3JsonFile(path.join(eventSheetsDir, "Sheet.json"), eventSheetWithFunctionsAce("Sheet", "Fn"));

    const result = detectReferenceIntegrity(root);
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);

    // Confirms this test actually exercises the fix: before #60, detectReferenceIntegrity
    // ignored manifest.functionsName entirely and resolved only the static
    // C3_PSEUDO_OBJECT_CLASSES table, which never contained "Fn" — so the pre-fix behavior
    // for this exact input is reproduced here via the pure detector with the OLD default
    // (no functionsName folded in), and it DOES report the false positive that motivated #60.
    const preFixIssues = detectEventClassIssues(
      [{ file: "eventSheets/Sheet.json", value: eventSheetWithFunctionsAce("Sheet", "Fn") as EventSheet }],
      new Set(),
    );
    expect(preFixIssues.length).to.equal(1);
    expect(preFixIssues[0]).to.include({ kind: "event-class-unresolved", name: "Fn" });
  });

  it('R-R70: the inverse — with functionsName "Fn", an ACE targeting the old default "Functions" is now unresolved', () => {
    const manifest = { ...minimalManifest("Inverse"), functionsName: "Fn" };
    const root = makeTempProject(manifest);
    const eventSheetsDir = path.join(root, "eventSheets");
    mkdirSync(eventSheetsDir, { recursive: true });
    writeC3JsonFile(path.join(eventSheetsDir, "Sheet.json"), eventSheetWithFunctionsAce("Sheet", "Functions"));

    const result = detectReferenceIntegrity(root);
    expect(result.ok).to.equal(false);
    expect(result.issues.some((i) => i.kind === "event-class-unresolved" && i.name === "Functions")).to.equal(true);
  });

  it('R-R71: the pure detector\'s option path — detectEventClassIssues(..., { functionsName: "Fn" }) resolves "Fn"', () => {
    const sheet = eventSheetWithFunctionsAce("Sheet", "Fn") as EventSheet;
    const issues = detectEventClassIssues([{ file: "eventSheets/Sheet.json", value: sheet }], new Set(), {
      functionsName: "Fn",
    });
    expect(issues).to.deep.equal([]);
  });

  it("R-R72: the canonical fixture's 3 real Functions ACEs (functionsName \"Functions\", pin v0.5.0) resolve cleanly", function () {
    if (!fixtureProjectExists("project.c3proj")) return this.skip();
    const manifest = readProjectManifest(path.join(fixtureProjectPath(), "project.c3proj"));
    expect(manifest.functionsName).to.equal("Functions");

    const result = detectReferenceIntegrity(fixtureProjectPath());
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);
  });
});
