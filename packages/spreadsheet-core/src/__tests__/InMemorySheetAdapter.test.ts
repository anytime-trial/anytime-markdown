import { createInMemorySheetAdapter } from "../InMemorySheetAdapter";
import type { SheetSnapshot } from "../types";

const EMPTY: SheetSnapshot = {
    cells: [[""]],
    alignments: [[null]],
    range: { rows: 1, cols: 1 },
};

describe("createInMemorySheetAdapter", () => {
    it("returns the initial snapshot from getSnapshot", () => {
        const adapter = createInMemorySheetAdapter(EMPTY);
        expect(adapter.getSnapshot()).toEqual(EMPTY);
    });

    it("keeps the same snapshot reference across getSnapshot calls until mutation", () => {
        const adapter = createInMemorySheetAdapter(EMPTY);
        expect(adapter.getSnapshot()).toBe(adapter.getSnapshot());
    });

    it("setCell updates cell and notifies subscribers", () => {
        const adapter = createInMemorySheetAdapter({
            cells: [["a", "b"], ["c", "d"]],
            alignments: [[null, null], [null, null]],
            range: { rows: 2, cols: 2 },
        });
        const listener = jest.fn();
        const unsubscribe = adapter.subscribe(listener);
        adapter.setCell(0, 1, "B");
        expect(adapter.getSnapshot().cells[0][1]).toBe("B");
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        adapter.setCell(1, 1, "D");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("replaceAll replaces the entire snapshot and notifies", () => {
        const adapter = createInMemorySheetAdapter(EMPTY);
        const next: SheetSnapshot = {
            cells: [["x", "y"]],
            alignments: [["left", "right"]],
            range: { rows: 1, cols: 2 },
        };
        const listener = jest.fn();
        adapter.subscribe(listener);
        adapter.replaceAll(next);
        expect(adapter.getSnapshot()).toEqual(next);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("readOnly blocks setCell and replaceAll", () => {
        const adapter = createInMemorySheetAdapter(EMPTY, { readOnly: true });
        adapter.setCell(0, 0, "ignored");
        adapter.replaceAll({
            cells: [["z"]], alignments: [[null]], range: { rows: 1, cols: 1 },
        });
        expect(adapter.getSnapshot()).toEqual(EMPTY);
        expect(adapter.readOnly).toBe(true);
    });

    it("defaults to an empty 1x1 snapshot when initial is omitted", () => {
        const adapter = createInMemorySheetAdapter();
        const snap = adapter.getSnapshot();
        expect(snap.range).toEqual({ rows: 1, cols: 1 });
        expect(snap.cells).toEqual([[""]]);
        expect(snap.alignments).toEqual([[null]]);
    });
});
