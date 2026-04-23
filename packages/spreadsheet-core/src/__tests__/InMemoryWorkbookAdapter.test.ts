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
});
