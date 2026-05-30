import { expect } from "chai";
import {
  addSceneGraphRoot,
  remapInstanceIds,
  removeSceneGraphRoot,
  type Instance,
  type Layout,
} from "../src/c3source.js";

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

describe("remapInstanceIds", () => {
  function instance(): Instance {
    return {
      type: "Sprite",
      properties: {},
      uid: 1,
      sid: 100,
      instanceFolderItem: { sid: 100 },
      sceneGraphData: { uid: 1, "parent-uid": 2, children: [{ uid: 3 }, { uid: 4 }] },
    };
  }

  it("remaps uid, scene-graph uid/parent-uid/children, sid, and mirrors folder sid", () => {
    const inst = instance();
    const uidMap = new Map([
      [1, 11],
      [2, 22],
      [3, 33],
      [4, 44],
    ]);
    const sidMap = new Map([[100, 900]]);
    remapInstanceIds(inst, uidMap, sidMap);
    expect(inst.uid).to.equal(11);
    expect(inst.sid).to.equal(900);
    expect(inst.instanceFolderItem?.sid).to.equal(900); // mirrors instance sid
    expect(inst.sceneGraphData?.uid).to.equal(11);
    expect(inst.sceneGraphData?.["parent-uid"]).to.equal(22);
    expect(inst.sceneGraphData?.children).to.deep.equal([{ uid: 33 }, { uid: 44 }]);
  });

  it("leaves a -1 parent-uid (root) untouched", () => {
    const inst = instance();
    inst.sceneGraphData!["parent-uid"] = -1;
    remapInstanceIds(inst, new Map([[1, 11]]), new Map());
    expect(inst.sceneGraphData?.["parent-uid"]).to.equal(-1);
  });

  it("passes unmapped ids through unchanged", () => {
    const inst = instance();
    remapInstanceIds(inst, new Map(), new Map());
    expect(inst.uid).to.equal(1);
    expect(inst.sid).to.equal(100);
    expect(inst.sceneGraphData?.["parent-uid"]).to.equal(2);
  });
});
