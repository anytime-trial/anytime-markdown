import type { EditorView } from "@anytime-markdown/markdown-pm/view";

import { handleNavigationKeyDown } from "../../plugins/tableCellMode/tableCellModeKeymap";

// ----------------------------------------------------------------
// 境界セルでのキーボードトラップ回帰テスト
// （getAdjacentCellPos が null = 隣接セルなし のとき、Arrow/Tab を消費せず
//   ProseMirror/ブラウザのデフォルト動作へ委譲する＝false を返すことを保証する）
// 修正前は true を返してイベントを飲み込み、テーブル外へ出られないバグがあった。
// ----------------------------------------------------------------

// doc.resolve が throw すると getAdjacentCellPos は null を返す（= 隣接セルなし相当）
function createBoundaryView(dispatch: jest.Mock) {
  return {
    state: {
      doc: {
        resolve: () => {
          throw new Error("no-adjacent-cell");
        },
        nodeAt: jest.fn().mockReturnValue({ type: { name: "tableCell" }, nodeSize: 10 }),
      },
      tr: {
        setMeta: jest.fn().mockReturnThis(),
        setSelection: jest.fn().mockReturnThis(),
      },
      schema: { nodes: { paragraph: { create: jest.fn().mockReturnValue({}) } } },
    },
    dispatch,
  } as unknown as EditorView;
}

function createEvent(
  key: string,
  mods: Partial<{ shiftKey: boolean }> = {},
): KeyboardEvent {
  return {
    key,
    shiftKey: mods.shiftKey ?? false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: jest.fn(),
  } as unknown as KeyboardEvent;
}

describe("handleNavigationKeyDown: テーブル端のキーボードトラップ回避", () => {
  it.each(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"])(
    "%s が隣接セルなしのとき false を返し dispatch しない",
    (key) => {
      const dispatch = jest.fn();
      const view = createBoundaryView(dispatch);
      const result = handleNavigationKeyDown(view, createEvent(key), 5);
      expect(result).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it("Tab が最終セル（隣接なし）のとき false を返し dispatch しない", () => {
    const dispatch = jest.fn();
    const view = createBoundaryView(dispatch);
    const result = handleNavigationKeyDown(view, createEvent("Tab"), 5);
    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Shift+Tab が先頭セル（隣接なし）のとき false を返し dispatch しない", () => {
    const dispatch = jest.fn();
    const view = createBoundaryView(dispatch);
    const result = handleNavigationKeyDown(view, createEvent("Tab", { shiftKey: true }), 5);
    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
