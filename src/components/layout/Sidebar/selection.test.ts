import { describe, expect, it } from "vitest";
import { applySidebarSelection } from "./selection";

describe("applySidebarSelection", () => {
  it("普通点击会切到当前类型的单选", () => {
    const next = applySidebarSelection({
      selection: { kind: "note", ids: new Set(["n1", "n2"]), anchorId: "n1" },
      clickedId: "f1",
      clickedKind: "folder",
      visibleIds: ["f1", "f2", "f3"],
      additive: false,
      range: false,
    });

    expect(next.kind).toBe("folder");
    expect([...next.ids]).toEqual(["f1"]);
    expect(next.anchorId).toBe("f1");
  });

  it("Ctrl 点击会在同类里增减选，并清空另一类", () => {
    const next = applySidebarSelection({
      selection: { kind: "folder", ids: new Set(["f1"]), anchorId: "f1" },
      clickedId: "f2",
      clickedKind: "folder",
      visibleIds: ["f1", "f2", "f3"],
      additive: true,
      range: false,
    });

    expect(next.kind).toBe("folder");
    expect([...next.ids]).toEqual(["f1", "f2"]);
    expect(next.anchorId).toBe("f2");
  });

  it("Shift 点击会按当前可见顺序做同类连续多选", () => {
    const next = applySidebarSelection({
      selection: { kind: "note", ids: new Set(["n2"]), anchorId: "n2" },
      clickedId: "n4",
      clickedKind: "note",
      visibleIds: ["n1", "n2", "n3", "n4", "n5"],
      additive: false,
      range: true,
    });

    expect(next.kind).toBe("note");
    expect([...next.ids]).toEqual(["n2", "n3", "n4"]);
    expect(next.anchorId).toBe("n2");
  });

  it("Shift 点击跨类型时退化为当前项单选", () => {
    const next = applySidebarSelection({
      selection: { kind: "folder", ids: new Set(["f2"]), anchorId: "f2" },
      clickedId: "n3",
      clickedKind: "note",
      visibleIds: ["n1", "n2", "n3"],
      additive: false,
      range: true,
    });

    expect(next.kind).toBe("note");
    expect([...next.ids]).toEqual(["n3"]);
    expect(next.anchorId).toBe("n3");
  });
});