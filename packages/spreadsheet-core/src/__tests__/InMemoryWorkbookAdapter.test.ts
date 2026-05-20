import { createInMemoryWorkbookAdapter } from "../InMemoryWorkbookAdapter";
import type { WorkbookSnapshot } from "../types";

const EMPTY_WB: WorkbookSnapshot = {
  sheets: [{ name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } }],
  activeSheet: 0,
};

describe("createInMemoryWorkbookAdapter", () => {
  it("初期スナップショットを返す", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    expect(adapter.getSnapshot()).toEqual(EMPTY_WB);
  });

  it("setActiveSheet でアクティブシートが変わり購読者に通知する", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    const listener = jest.fn();
    adapter.subscribe(listener);
    adapter.setActiveSheet(1);
    expect(adapter.getSnapshot().activeSheet).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("addSheet でシートが末尾に追加される", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.addSheet("Sheet2");
    const snap = adapter.getSnapshot();
    expect(snap.sheets).toHaveLength(2);
    expect(snap.sheets[1].name).toBe("Sheet2");
  });

  it("addSheet で name 省略時は Sheet{N} になる", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.addSheet();
    expect(adapter.getSnapshot().sheets[1].name).toBe("Sheet2");
  });

  it("removeSheet でシートが削除される", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.removeSheet(1);
    expect(adapter.getSnapshot().sheets).toHaveLength(1);
  });

  it("removeSheet はシートが1枚のとき何もしない", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.removeSheet(0);
    expect(adapter.getSnapshot().sheets).toHaveLength(1);
  });

  it("removeSheet でアクティブシートが削除された場合、activeSheet を調整する", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 1,
    });
    adapter.removeSheet(1);
    expect(adapter.getSnapshot().activeSheet).toBe(0);
  });

  it("renameSheet でシート名が変わる", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.renameSheet(0, "Renamed");
    expect(adapter.getSnapshot().sheets[0].name).toBe("Renamed");
  });

  it("reorderSheet でシートが並び替えられる", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "A", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "B", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "C", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.reorderSheet(0, 2);
    const names = adapter.getSnapshot().sheets.map((s) => s.name);
    expect(names).toEqual(["B", "C", "A"]);
  });

  it("reorderSheet でアクティブシートより前のシートを後ろに移動するとインデックスが1減る", () => {
    // sheets: A(0), B(1=active), C(2) → move A(0) to C position(2)
    // fromIndex(0) < activeSheet(1) && toIndex(2) >= activeSheet(1) → activeSheet -= 1
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "A", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "B", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "C", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 1,
    });
    adapter.reorderSheet(0, 2);
    expect(adapter.getSnapshot().activeSheet).toBe(0);
  });

  it("reorderSheet でアクティブシートより後のシートを前に移動するとインデックスが1増える", () => {
    // sheets: A(0=active), B(1), C(2) → move C(2) to A position(0)
    // fromIndex(2) > activeSheet(0) && toIndex(0) <= activeSheet(0) → activeSheet += 1
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "A", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "B", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "C", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.reorderSheet(2, 0);
    expect(adapter.getSnapshot().activeSheet).toBe(1);
  });

  it("setCell で指定シートのセルが更新される", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.setCell(0, 0, 0, "hello");
    expect(adapter.getSnapshot().sheets[0].cells[0][0]).toBe("hello");
  });

  it("replaceSheet で指定シート全体が置き換わる", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    adapter.replaceSheet(0, {
      cells: [["x", "y"]],
      alignments: [["left", null]],
      range: { rows: 1, cols: 2 },
    });
    expect(adapter.getSnapshot().sheets[0].cells[0]).toEqual(["x", "y"]);
  });

  it("setCell で複数列のうち指定列のみ更新し他は変わらない", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [{
        name: "Sheet1",
        cells: [["a", "b", "c"]],
        alignments: [[null, null, null]],
        range: { rows: 1, cols: 3 },
      }],
      activeSheet: 0,
    });
    adapter.setCell(0, 0, 1, "B");
    const row = adapter.getSnapshot().sheets[0].cells[0];
    expect(row[0]).toBe("a");
    expect(row[1]).toBe("B");
    expect(row[2]).toBe("c");
  });

  it("setCell で対象外のシートは変更されない", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [["a"]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [["b"]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.setCell(0, 0, 0, "A");
    expect(adapter.getSnapshot().sheets[1].cells[0][0]).toBe("b");
  });

  it("replaceSheet で対象外のシートは名前・内容ともに変わらない", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [["a"]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [["b"]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.replaceSheet(0, {
      cells: [["X"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    expect(adapter.getSnapshot().sheets[1].name).toBe("Sheet2");
    expect(adapter.getSnapshot().sheets[1].cells[0][0]).toBe("b");
  });

  it("setActiveSheet で範囲外インデックス（負）は何もしない", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    const listener = jest.fn();
    adapter.subscribe(listener);
    adapter.setActiveSheet(-1);
    expect(listener).not.toHaveBeenCalled();
    expect(adapter.getSnapshot().activeSheet).toBe(0);
  });

  it("setActiveSheet で範囲外インデックス（上限超え）は何もしない", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    const listener = jest.fn();
    adapter.subscribe(listener);
    adapter.setActiveSheet(99);
    expect(listener).not.toHaveBeenCalled();
    expect(adapter.getSnapshot().activeSheet).toBe(0);
  });

  it("subscribe の解除関数を呼ぶと通知が止まる", () => {
    const adapter = createInMemoryWorkbookAdapter(EMPTY_WB);
    const listener = jest.fn();
    const unsubscribe = adapter.subscribe(listener);
    adapter.addSheet("Sheet2");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    adapter.addSheet("Sheet3");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("createInMemoryWorkbookAdapter を引数なしで呼ぶとデフォルト構造が返る", () => {
    const adapter = createInMemoryWorkbookAdapter();
    const snap = adapter.getSnapshot();
    expect(snap.sheets).toHaveLength(1);
    expect(snap.sheets[0].name).toBe("Sheet1");
    expect(snap.activeSheet).toBe(0);
  });

  it("setCell で複数行があるとき対象行以外は変化しない", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [{
        name: "Sheet1",
        cells: [["row0col0", "row0col1"], ["row1col0", "row1col1"]],
        alignments: [[null, null], [null, null]],
        range: { rows: 2, cols: 2 },
      }],
      activeSheet: 0,
    });
    adapter.setCell(0, 0, 0, "UPDATED");
    const cells = adapter.getSnapshot().sheets[0].cells;
    expect(cells[0][0]).toBe("UPDATED");
    // 対象外行は変化しない
    expect(cells[1][0]).toBe("row1col0");
    expect(cells[1][1]).toBe("row1col1");
  });

  it("reorderSheet でアクティブシートに無関係な移動では activeSheet が変わらない", () => {
    // sheets: A(0), B(1), C(2=active) → move A(0) to B position(1)
    // fromIndex(0) < activeSheet(2) && toIndex(1) < activeSheet(2) → どの条件も当てはまらない
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "A", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "B", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "C", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 2,
    });
    adapter.reorderSheet(0, 1);
    // A と B が入れ替わり、C は index=2 のまま
    const names = adapter.getSnapshot().sheets.map((s) => s.name);
    expect(names).toEqual(["B", "A", "C"]);
    expect(adapter.getSnapshot().activeSheet).toBe(2);
  });

  it("renameSheet で対象外シートの名前は変わらない", () => {
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 0,
    });
    adapter.renameSheet(0, "Renamed");
    expect(adapter.getSnapshot().sheets[0].name).toBe("Renamed");
    expect(adapter.getSnapshot().sheets[1].name).toBe("Sheet2");
  });

  it("removeSheet でアクティブシートより前のシートを削除しても activeSheet が調整される", () => {
    // activeSheet=1 のとき、index=0 を削除 → activeSheet は変わらないが sheets.length チェック
    const adapter = createInMemoryWorkbookAdapter({
      sheets: [
        { name: "Sheet1", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet2", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
        { name: "Sheet3", cells: [[""]], alignments: [[null]], range: { rows: 1, cols: 1 } },
      ],
      activeSheet: 1,
    });
    adapter.removeSheet(0);
    expect(adapter.getSnapshot().sheets).toHaveLength(2);
    // activeSheet(1) < new sheets.length(2) なので変わらない
    expect(adapter.getSnapshot().activeSheet).toBe(1);
  });
});
