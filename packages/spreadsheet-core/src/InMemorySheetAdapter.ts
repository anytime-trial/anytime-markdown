import type { SheetAdapter } from "./SheetAdapter";
import type { SheetSnapshot } from "./types";

const EMPTY_SNAPSHOT: SheetSnapshot = {
    cells: [[""]],
    alignments: [[null]],
    range: { rows: 1, cols: 1 },
};

export function createInMemorySheetAdapter(
    initial: SheetSnapshot = EMPTY_SNAPSHOT,
    options: { readOnly?: boolean } = {},
): SheetAdapter {
    let snapshot: SheetSnapshot = initial;
    const listeners = new Set<() => void>();
    const readOnly = options.readOnly ?? false;
    const notify = () => listeners.forEach((l) => l());

    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setCell(row, col, value) {
            if (readOnly) return;
            const cells = snapshot.cells.map((r, ri) =>
                ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
            );
            snapshot = { ...snapshot, cells };
            notify();
        },
        replaceAll(next) {
            if (readOnly) return;
            snapshot = next;
            notify();
        },
        readOnly,
    };
}
