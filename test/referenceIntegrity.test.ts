import { describe, it, before } from "mocha";
import { expect } from "chai";
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  C3_PSEUDO_OBJECT_CLASSES,
  NON_ATTRIBUTABLE_ADDON_TYPES,
  manifestObjectTypeNames,
  manifestFamilyNames,
  collectLayoutEffectIds,
  detectAddonReferenceIssues,
  detectFamilyMemberIssues,
  detectInstanceTypeIssues,
  type SourceDoc,
} from "../src/references.js";
import {
  openProject,
  readProjectManifest,
  type C3ProjectManifest,
  type C3UsedAddon,
  type Family,
  type Layout,
  type ObjectType,
} from "../src/c3source.js";
import { fixtureProjectExists, fixtureProjectPath } from "./fixtureHelpers.js";

describe("reference-integrity domain-fact tables", () => {
  it("R-R22: C3_PSEUDO_OBJECT_CLASSES deep-equals [\"System\", \"Functions\"] (tripwire — widening is a reviewed edit)", () => {
    expect(C3_PSEUDO_OBJECT_CLASSES).to.deep.equal(["System", "Functions"]);
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
