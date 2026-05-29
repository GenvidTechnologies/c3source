import { expect } from "chai";
import { addSceneGraphRoot, removeSceneGraphRoot, type Instance, type Layout } from "../src/c3source.js";

function layout(): Layout {
  return { name: "L", layers: [] };
}

describe("addSceneGraphRoot / removeSceneGraphRoot", () => {
  it("creates the scene-graph root folder on first add", () => {
    const l = layout();
    addSceneGraphRoot(l, 42);
    expect(l["scene-graphs-folder-root"]).to.deep.equal({ items: [{ sid: 42 }] });
  });

  it("appends to an existing folder", () => {
    const l = layout();
    addSceneGraphRoot(l, 1);
    addSceneGraphRoot(l, 2);
    expect(l["scene-graphs-folder-root"]?.items).to.deep.equal([{ sid: 1 }, { sid: 2 }]);
  });

  it("removes by sid and reports whether it removed", () => {
    const l = layout();
    addSceneGraphRoot(l, 1);
    addSceneGraphRoot(l, 2);
    expect(removeSceneGraphRoot(l, 1)).to.equal(true);
    expect(l["scene-graphs-folder-root"]?.items).to.deep.equal([{ sid: 2 }]);
    expect(removeSceneGraphRoot(l, 999)).to.equal(false);
  });

  it("returns false when there is no folder", () => {
    expect(removeSceneGraphRoot(layout(), 1)).to.equal(false);
  });
});

// Compile-time confirmation that the scene-graph Instance fields are typed.
describe("Instance scene-graph typing", () => {
  it("accepts uid/sid/sceneGraphData/instanceFolderItem", () => {
    const inst: Instance = {
      type: "Sprite",
      properties: {},
      uid: 10,
      sid: 20,
      sceneGraphData: { uid: 10, "parent-uid": -1, children: [{ uid: 11 }] },
      instanceFolderItem: { sid: 20 },
    };
    expect(inst.sceneGraphData?.["parent-uid"]).to.equal(-1);
  });
});
