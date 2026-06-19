/**
 * vanilla/spreadsheetState（旧 hooks/useSpreadsheetState）のユニットテスト。
 * 旧 useSpreadsheetState.test.ts の検証項目を renderHook なしで全移植。
 */

import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "@anytime-markdown/spreadsheet-core";

import { createSpreadsheetState } from "../vanilla/spreadsheetState";

describe("createSpreadsheetState", () => {
  const DEFAULT_ROWS = 5;
  const DEFAULT_COLS = 3;

  function setup(initialRows = DEFAULT_ROWS, initialCols = DEFAULT_COLS) {
    const onChange = jest.fn();
    const onContentChange = jest.fn();
    const state = createSpreadsheetState({ initialRows, initialCols, onChange, onContentChange });
    return { state, onChange, onContentChange };
  }

  describe("initial state", () => {
    it("DEFAULT_GRID_ROWS × DEFAULT_GRID_COLS の空グリッドを生成する", () => {
      const { state } = setup();
      expect(state.grid).toHaveLength(DEFAULT_GRID_ROWS);
      for (const row of state.grid) {
        expect(row).toHaveLength(DEFAULT_GRID_COLS);
        expect(row.every((cell) => cell === "")).toBe(true);
      }
    });

    it("initialRows / initialCols から dataRange を設定する", () => {
      const { state } = setup(8, 4);
      expect(state.dataRange).toEqual({ rows: 8, cols: 4 });
    });

    it("selection は null で開始する", () => {
      const { state } = setup();
      expect(state.selection).toBeNull();
    });

    it("初期化ではコールバックを呼ばない", () => {
      const { onChange, onContentChange } = setup();
      expect(onChange).not.toHaveBeenCalled();
      expect(onContentChange).not.toHaveBeenCalled();
    });
  });

  describe("setCellValue", () => {
    it("指定セルを更新し onChange / onContentChange を呼ぶ", () => {
      const { state, onChange, onContentChange } = setup();
      state.setCellValue(2, 3, "hello");
      expect(state.grid[2][3]).toBe("hello");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onContentChange).toHaveBeenCalledTimes(1);
    });

    it("他のセルへ影響しない", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "X");
      expect(state.grid[0][1]).toBe("");
      expect(state.grid[1][0]).toBe("");
    });
  });

  describe("setSelection", () => {
    it.each([
      [{ type: "cell", row: 1, col: 2 } as const],
      [{ type: "row", start: 5, end: 5 } as const],
      [{ type: "col", start: 3, end: 3 } as const],
    ])("選択状態 %j を設定する（content 変更扱いにしない）", (sel) => {
      const { state, onContentChange } = setup();
      state.setSelection(sel);
      expect(state.selection).toEqual(sel);
      expect(onContentChange).not.toHaveBeenCalled();
    });

    it("null でクリアできる", () => {
      const { state } = setup();
      state.setSelection({ type: "cell", row: 0, col: 0 });
      state.setSelection(null);
      expect(state.selection).toBeNull();
    });
  });

  describe("setDataRange", () => {
    it("データ範囲を更新する", () => {
      const { state } = setup();
      state.setDataRange({ rows: 10, cols: 6 });
      expect(state.dataRange).toEqual({ rows: 10, cols: 6 });
    });
  });

  describe("initGrid", () => {
    it("2 次元配列からグリッドを構築する", () => {
      const { state } = setup();
      state.initGrid([
        ["A", "B", "C"],
        ["D", "E", "F"],
      ]);
      expect(state.grid[0][0]).toBe("A");
      expect(state.grid[0][2]).toBe("C");
      expect(state.grid[1][0]).toBe("D");
      expect(state.grid[1][2]).toBe("F");
    });

    it("残りのセルは空のまま・寸法は維持される", () => {
      const { state } = setup();
      state.initGrid([["X"]]);
      expect(state.grid[0][0]).toBe("X");
      expect(state.grid[0][1]).toBe("");
      expect(state.grid[1][0]).toBe("");
      expect(state.grid).toHaveLength(DEFAULT_GRID_ROWS);
      for (const row of state.grid) {
        expect(row).toHaveLength(DEFAULT_GRID_COLS);
      }
    });
  });

  describe("insertRow", () => {
    it("指定位置に空行を挿入し下へシフトする", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "row0");
      state.setCellValue(1, 0, "row1");
      state.insertRow(1);
      expect(state.grid[0][0]).toBe("row0");
      expect(state.grid[1][0]).toBe("");
      expect(state.grid[2][0]).toBe("row1");
      expect(state.grid).toHaveLength(DEFAULT_GRID_ROWS);
    });

    it("末尾の行はあふれて落ちる", () => {
      const { state } = setup();
      state.setCellValue(DEFAULT_GRID_ROWS - 1, 0, "lastRow");
      state.insertRow(0);
      expect(state.grid[DEFAULT_GRID_ROWS - 1][0]).toBe("");
    });
  });

  describe("deleteRow", () => {
    it("行を削除して上へシフトし、末尾に空行を補充する", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "row0");
      state.setCellValue(1, 0, "row1");
      state.setCellValue(2, 0, "row2");
      state.deleteRow(1);
      expect(state.grid[0][0]).toBe("row0");
      expect(state.grid[1][0]).toBe("row2");
      expect(state.grid).toHaveLength(DEFAULT_GRID_ROWS);
      expect(state.grid[DEFAULT_GRID_ROWS - 1].every((c) => c === "")).toBe(true);
    });
  });

  describe("insertCol / deleteCol", () => {
    it("列の挿入で右へシフトし列数は維持される", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "c0");
      state.setCellValue(0, 1, "c1");
      state.insertCol(1);
      expect(state.grid[0][0]).toBe("c0");
      expect(state.grid[0][1]).toBe("");
      expect(state.grid[0][2]).toBe("c1");
      for (const row of state.grid) {
        expect(row).toHaveLength(DEFAULT_GRID_COLS);
      }
    });

    it("列の削除で左へシフトし末尾に空文字を補充する", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "c0");
      state.setCellValue(0, 1, "c1");
      state.setCellValue(0, 2, "c2");
      state.deleteCol(1);
      expect(state.grid[0][0]).toBe("c0");
      expect(state.grid[0][1]).toBe("c2");
      for (const row of state.grid) {
        expect(row).toHaveLength(DEFAULT_GRID_COLS);
        expect(row[DEFAULT_GRID_COLS - 1]).toBe("");
      }
    });
  });

  describe("swapRows / swapCols", () => {
    it("行を入れ替える", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "rowA");
      state.setCellValue(3, 0, "rowB");
      state.swapRows(0, 3);
      expect(state.grid[0][0]).toBe("rowB");
      expect(state.grid[3][0]).toBe("rowA");
    });

    it("全行にわたって列を入れ替える", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.setCellValue(0, 2, "C");
      state.setCellValue(1, 0, "D");
      state.setCellValue(1, 2, "F");
      state.swapCols(0, 2);
      expect(state.grid[0][0]).toBe("C");
      expect(state.grid[0][2]).toBe("A");
      expect(state.grid[1][0]).toBe("F");
      expect(state.grid[1][2]).toBe("D");
    });
  });

  describe("undo / redo", () => {
    it("setCellValue を undo すると直前の値に戻り、redo で再適用される", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      expect(state.undo()).toBe(true);
      expect(state.grid[0][0]).toBe("");
      expect(state.redo()).toBe(true);
      expect(state.grid[0][0]).toBe("A");
    });

    it("複数編集を LIFO で undo できる", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.setCellValue(0, 1, "B");
      state.undo();
      expect(state.grid[0][1]).toBe("");
      expect(state.grid[0][0]).toBe("A");
      state.undo();
      expect(state.grid[0][0]).toBe("");
    });

    it("transact は複数変更を 1 つの undo 単位にまとめる", () => {
      const { state } = setup();
      state.transact(() => {
        state.setCellValue(0, 0, "A");
        state.setCellValue(0, 1, "B");
        state.setCellValue(0, 2, "C");
      });
      expect(state.undo()).toBe(true);
      expect(state.grid[0][0]).toBe("");
      expect(state.grid[0][1]).toBe("");
      expect(state.grid[0][2]).toBe("");
    });

    it("undo 後に新たな編集をすると redo 履歴は破棄される", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.undo();
      state.setCellValue(0, 0, "Z");
      expect(state.redo()).toBe(false);
      expect(state.grid[0][0]).toBe("Z");
    });

    it("dataRange / insertRow も undo できる", () => {
      const { state } = setup();
      state.setDataRange({ rows: 9, cols: 4 });
      state.undo();
      expect(state.dataRange).toEqual({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS });

      state.setCellValue(0, 0, "A");
      state.insertRow(0);
      expect(state.grid[0][0]).toBe("");
      state.undo();
      expect(state.grid[0][0]).toBe("A");
    });

    it("同じ値の setCellValue は履歴を作らない", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.setCellValue(0, 0, "A"); // no-op
      state.undo();
      expect(state.grid[0][0]).toBe(""); // 1 回の undo で初期状態へ
    });

    it("resetHistory で undo/redo が無効化される", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.resetHistory();
      expect(state.undo()).toBe(false);
      expect(state.grid[0][0]).toBe("A");
    });

    it("履歴が空のときの undo / redo は false を返す", () => {
      const { state } = setup();
      expect(state.undo()).toBe(false);
      expect(state.redo()).toBe(false);
    });

    it("全セル同値の transact は phantom 履歴を作らない", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.transact(() => {
        state.setCellValue(0, 0, "A"); // 同値 no-op のみ
      });
      // phantom エントリが無いので 1 回の undo で初期状態へ戻る。
      expect(state.undo()).toBe(true);
      expect(state.grid[0][0]).toBe("");
    });

    it("同サイズの setDataRange は履歴を作らない", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.setDataRange({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS }); // 無変更
      expect(state.undo()).toBe(true);
      expect(state.grid[0][0]).toBe("");
    });
  });

  describe("setHistoryExtra / beginHistoryPoint / commitHistoryPoint", () => {
    it("extra（state 外レイアウト）を含めて undo/redo で復元する", () => {
      const { state } = setup();
      let layout = { w: 100 };
      state.setHistoryExtra(
        () => ({ ...layout }),
        (e) => {
          layout = e as { w: number };
        },
      );
      state.beginHistoryPoint();
      layout = { w: 200 }; // ドラッグ相当の state 外変更
      state.commitHistoryPoint(true);

      expect(state.undo()).toBe(true);
      expect(layout).toEqual({ w: 100 });
      expect(state.redo()).toBe(true);
      expect(layout).toEqual({ w: 200 });
    });

    it("commitHistoryPoint(false) は履歴を作らない", () => {
      const { state } = setup();
      state.setCellValue(0, 0, "A");
      state.beginHistoryPoint();
      state.commitHistoryPoint(false); // 変更なし扱い
      expect(state.undo()).toBe(true);
      expect(state.grid[0][0]).toBe(""); // セル編集まで一気に戻る
      expect(state.undo()).toBe(false);
    });

    it("内容編集と extra 変更は独立した undo 単位になる", () => {
      const { state } = setup();
      let layout = { w: 100 };
      state.setHistoryExtra(
        () => ({ ...layout }),
        (e) => {
          layout = e as { w: number };
        },
      );
      state.setCellValue(0, 0, "A"); // 内容エントリ
      state.beginHistoryPoint();
      layout = { w: 200 };
      state.commitHistoryPoint(true); // extra エントリ

      state.undo(); // extra のみ戻る
      expect(layout).toEqual({ w: 100 });
      expect(state.grid[0][0]).toBe("A");
      state.undo(); // 内容が戻る
      expect(state.grid[0][0]).toBe("");
    });
  });
});
