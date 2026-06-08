import { isSelectionWithinNode } from "../utils/nodeSelection";

type Ed = Parameters<typeof isSelectionWithinNode>[0];

function editorWithFrom(from: number): Ed {
  return { state: { selection: { from } } } as Ed;
}

describe("isSelectionWithinNode", () => {
  it("選択位置がノード範囲内なら true", () => {
    expect(isSelectionWithinNode(editorWithFrom(12), () => 10, 5)).toBe(true); // 10..15
  });

  it("選択位置がノード範囲外なら false", () => {
    expect(isSelectionWithinNode(editorWithFrom(30), () => 10, 5)).toBe(false);
  });

  it("editor が null なら false", () => {
    expect(isSelectionWithinNode(null, () => 10, 5)).toBe(false);
  });

  it("getPos が関数でなければ false", () => {
    expect(isSelectionWithinNode(editorWithFrom(10), undefined, 5)).toBe(false);
  });

  it("getPos が null/undefined を返したら false", () => {
    expect(isSelectionWithinNode(editorWithFrom(10), () => null, 5)).toBe(false);
    expect(isSelectionWithinNode(editorWithFrom(10), () => undefined, 5)).toBe(false);
  });

  it("getPos が throw しても（detached ノード）throw せず false を返す（リグレッション）", () => {
    const throwingGetPos = () => {
      // detached ノードで ProseMirror posBeforeChild が undefined.size で throw する状況を模す
      throw new TypeError("Cannot read properties of undefined (reading 'size')");
    };
    expect(() => isSelectionWithinNode(editorWithFrom(10), throwingGetPos, 5)).not.toThrow();
    expect(isSelectionWithinNode(editorWithFrom(10), throwingGetPos, 5)).toBe(false);
  });
});
