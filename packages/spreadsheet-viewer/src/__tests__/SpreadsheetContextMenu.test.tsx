import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { SpreadsheetContextMenu } from "../SpreadsheetContextMenu";
import { createMockAdapter } from "./support/createMockAdapter";

function t(key: string): string {
  return key;
}

function noop() {
  /* no-op */
}

describe("SpreadsheetContextMenu", () => {
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
    const calls: { name: string; args: unknown[] }[] = [];
    const track = (name: string) => (...args: unknown[]) => {
      calls.push({ name, args });
    };

    render(
      <SpreadsheetContextMenu
        adapter={adapter}
        contextMenu={{
          anchorX: 0,
          anchorY: 0,
          target: { type: "row", index: 0 },
        }}
        dataRange={{ rows: 2, cols: 2 }}
        grid={[
          ["A", "X"],
          ["B", "Y"],
        ]}
        onClose={noop}
        onInsertRow={track("onInsertRow") as (i: number) => void}
        onDeleteRow={noop}
        onInsertCol={noop}
        onDeleteCol={noop}
        onSwapRows={noop}
        onSwapCols={noop}
        setDataRange={track("setDataRange") as (r: { rows: number; cols: number }) => void}
        setCellValue={noop}
        onOpenFilter={noop}
        isDark={false}
        t={t}
      />,
    );

    fireEvent.click(screen.getByText("spreadsheetInsertRowBelow"));
    expect(adapter.getCalls.at(-1)).toMatchObject({ method: "replaceAll" });
    expect(adapter.snapshot.range.rows).toBe(3);
    expect(calls.find((c) => c.name === "onInsertRow")).toBeDefined();
  });

  it("データ範囲外の行挿入では adapter.replaceAll は呼ばれない", () => {
    const adapter = createMockAdapter({
      cells: [["A"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });

    render(
      <SpreadsheetContextMenu
        adapter={adapter}
        contextMenu={{
          anchorX: 0,
          anchorY: 0,
          target: { type: "row", index: 5 },
        }}
        dataRange={{ rows: 1, cols: 1 }}
        grid={[["A"], [""], [""], [""], [""], [""]]}
        onClose={noop}
        onInsertRow={noop}
        onDeleteRow={noop}
        onInsertCol={noop}
        onDeleteCol={noop}
        onSwapRows={noop}
        onSwapCols={noop}
        setDataRange={noop}
        setCellValue={noop}
        onOpenFilter={noop}
        isDark={false}
        t={t}
      />,
    );

    fireEvent.click(screen.getByText("spreadsheetInsertRowAbove"));
    expect(adapter.getCalls.some((c) => c.method === "replaceAll")).toBe(false);
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

    render(
      <SpreadsheetContextMenu
        adapter={adapter}
        contextMenu={{
          anchorX: 0,
          anchorY: 0,
          target: { type: "col", index: 1 },
        }}
        dataRange={{ rows: 2, cols: 3 }}
        grid={[
          ["A", "B", "C"],
          ["D", "E", "F"],
        ]}
        onClose={noop}
        onInsertRow={noop}
        onDeleteRow={noop}
        onInsertCol={noop}
        onDeleteCol={noop}
        onSwapRows={noop}
        onSwapCols={noop}
        setDataRange={noop}
        setCellValue={noop}
        onOpenFilter={noop}
        isDark={false}
        t={t}
      />,
    );

    fireEvent.click(screen.getByText("spreadsheetDeleteCol"));
    expect(adapter.snapshot.range.cols).toBe(2);
    expect(adapter.snapshot.cells[0]).toEqual(["A", "C"]);
  });

  it("データ範囲内で行入れ替えが adapter.replaceAll で反映される", () => {
    const adapter = createMockAdapter({
      cells: [
        ["R0"],
        ["R1"],
        ["R2"],
      ],
      alignments: [[null], [null], [null]],
      range: { rows: 3, cols: 1 },
    });

    render(
      <SpreadsheetContextMenu
        adapter={adapter}
        contextMenu={{
          anchorX: 0,
          anchorY: 0,
          target: { type: "row", index: 1 },
        }}
        dataRange={{ rows: 3, cols: 1 }}
        grid={[["R0"], ["R1"], ["R2"]]}
        onClose={noop}
        onInsertRow={noop}
        onDeleteRow={noop}
        onInsertCol={noop}
        onDeleteCol={noop}
        onSwapRows={noop}
        onSwapCols={noop}
        setDataRange={noop}
        setCellValue={noop}
        onOpenFilter={noop}
        isDark={false}
        t={t}
      />,
    );

    fireEvent.click(screen.getByText("spreadsheetMoveRowUp"));
    expect(adapter.snapshot.cells[0][0]).toBe("R1");
    expect(adapter.snapshot.cells[1][0]).toBe("R0");
  });
});
