/**
 * vanilla/contextMenu（openSpreadsheetContextMenu）のユニットテスト。
 * 旧 SpreadsheetContextMenu.test.tsx の検証項目を DOM 直検証へ移植する。
 */

import type { ContextMenuState, DataRange } from "@anytime-markdown/spreadsheet-core";

import { openSpreadsheetContextMenu, type SpreadsheetContextMenuCallbacks } from "../vanilla/contextMenu";
import { createMockAdapter, type MockSheetAdapter } from "./support/createMockAdapter";

function t(key: string): string {
  return key;
}

function noop(): void {
  /* no-op */
}

function open(
  adapter: MockSheetAdapter,
  target: ContextMenuState["target"],
  dataRange: DataRange,
  grid: string[][],
  overrides: Partial<SpreadsheetContextMenuCallbacks> = {},
) {
  return openSpreadsheetContextMenu(
    { anchorX: 0, anchorY: 0, target },
    {
      adapter,
      dataRange,
      grid,
      onClose: noop,
      onInsertRow: noop,
      onDeleteRow: noop,
      onInsertCol: noop,
      onDeleteCol: noop,
      onSwapRows: noop,
      onSwapCols: noop,
      setDataRange: noop,
      setCellValue: noop,
      onOpenFilter: noop,
      t,
      ...overrides,
    },
  );
}

function clickItem(label: string): void {
  const item = [...document.querySelectorAll(".sv-menu-item")].find(
    (el) => el.textContent === label,
  ) as HTMLButtonElement;
  expect(item).toBeTruthy();
  item.click();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("openSpreadsheetContextMenu", () => {
  it("行挿入で adapter.replaceAll と onInsertRow が呼ばれる", () => {
    const adapter = createMockAdapter({
      cells: [
        ["A", "X"],
        ["B", "Y"],
      ],
      alignments: [
        [null, null],
        [null, null],
      ],
      range: { rows: 2, cols: 2 },
    });
    const onInsertRow = jest.fn();
    const setDataRange = jest.fn();
    const handle = open(adapter, { type: "row", index: 0 }, { rows: 2, cols: 2 }, [
      ["A", "X"],
      ["B", "Y"],
    ], { onInsertRow, setDataRange });

    clickItem("spreadsheetInsertRowBelow");
    expect(adapter.getCalls.at(-1)).toMatchObject({ method: "replaceAll" });
    expect(adapter.snapshot.range.rows).toBe(3);
    expect(onInsertRow).toHaveBeenCalledWith(1);
    expect(setDataRange).toHaveBeenCalledWith({ rows: 3, cols: 2 });
    handle?.close();
  });

  it("データ範囲外の行挿入では adapter.replaceAll は呼ばれない", () => {
    const adapter = createMockAdapter({
      cells: [["A"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    const handle = open(adapter, { type: "row", index: 5 }, { rows: 1, cols: 1 }, [
      ["A"], [""], [""], [""], [""], [""],
    ]);

    clickItem("spreadsheetInsertRowAbove");
    expect(adapter.getCalls.some((c) => c.method === "replaceAll")).toBe(false);
    handle?.close();
  });

  it("列削除で adapter.replaceAll が呼ばれ range.cols が減る", () => {
    const adapter = createMockAdapter({
      cells: [
        ["A", "B", "C"],
        ["D", "E", "F"],
      ],
      alignments: [
        [null, null, null],
        [null, null, null],
      ],
      range: { rows: 2, cols: 3 },
    });
    const handle = open(adapter, { type: "col", index: 1 }, { rows: 2, cols: 3 }, [
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]);

    clickItem("spreadsheetDeleteCol");
    expect(adapter.snapshot.range.cols).toBe(2);
    expect(adapter.snapshot.cells[0]).toEqual(["A", "C"]);
    handle?.close();
  });

  it("データ範囲内で行入れ替えが adapter.replaceAll で反映される", () => {
    const adapter = createMockAdapter({
      cells: [["R0"], ["R1"], ["R2"]],
      alignments: [[null], [null], [null]],
      range: { rows: 3, cols: 1 },
    });
    const handle = open(adapter, { type: "row", index: 1 }, { rows: 3, cols: 1 }, [
      ["R0"], ["R1"], ["R2"],
    ]);

    clickItem("spreadsheetMoveRowUp");
    expect(adapter.snapshot.cells[0][0]).toBe("R1");
    expect(adapter.snapshot.cells[1][0]).toBe("R0");
    handle?.close();
  });

  it("cell ターゲットはクリップボード 3 項目のみ・先頭行の削除/上移動は disabled", () => {
    const adapter = createMockAdapter({
      cells: [["A"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    const cellHandle = open(adapter, { type: "cell", row: 0, col: 0 }, { rows: 1, cols: 1 }, [["A"]]);
    expect(document.querySelectorAll(".sv-menu-item")).toHaveLength(3);
    cellHandle?.close();

    const rowHandle = open(adapter, { type: "row", index: 0 }, { rows: 1, cols: 1 }, [["A"]]);
    const deleteItem = [...document.querySelectorAll(".sv-menu-item")].find(
      (el) => el.textContent === "spreadsheetDeleteRow",
    ) as HTMLButtonElement;
    const moveUpItem = [...document.querySelectorAll(".sv-menu-item")].find(
      (el) => el.textContent === "spreadsheetMoveRowUp",
    ) as HTMLButtonElement;
    expect(deleteItem.disabled).toBe(true);
    expect(moveUpItem.disabled).toBe(true);
    rowHandle?.close();
  });
});
