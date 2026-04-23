import type { WorkbookAdapter } from "./WorkbookAdapter";
import type { SheetSnapshot, WorkbookSnapshot } from "./types";

const EMPTY_SHEET: SheetSnapshot = {
  cells: [[""]],
  alignments: [[null]],
  range: { rows: 1, cols: 1 },
};

const DEFAULT_WORKBOOK: WorkbookSnapshot = {
  sheets: [{ name: "Sheet1", ...EMPTY_SHEET }],
  activeSheet: 0,
};

export function createInMemoryWorkbookAdapter(
  initial: WorkbookSnapshot = DEFAULT_WORKBOOK,
): WorkbookAdapter {
  let snapshot: WorkbookSnapshot = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const update = (next: WorkbookSnapshot) => {
    snapshot = next;
    notify();
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    setCell(sheetIndex, row, col, value) {
      const sheets = snapshot.sheets.map((sheet, si) => {
        if (si !== sheetIndex) return sheet;
        const cells = sheet.cells.map((r, ri) =>
          ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
        );
        return { ...sheet, cells };
      });
      update({ ...snapshot, sheets });
    },

    replaceSheet(sheetIndex, next) {
      const sheets = snapshot.sheets.map((sheet, si) =>
        si === sheetIndex ? { name: sheet.name, ...next } : sheet,
      );
      update({ ...snapshot, sheets });
    },

    addSheet(name) {
      const n = name ?? `Sheet${snapshot.sheets.length + 1}`;
      const newSheet = { name: n, ...EMPTY_SHEET };
      update({ ...snapshot, sheets: [...snapshot.sheets, newSheet] });
    },

    removeSheet(sheetIndex) {
      if (snapshot.sheets.length <= 1) return;
      const sheets = snapshot.sheets.filter((_, i) => i !== sheetIndex);
      const activeSheet = snapshot.activeSheet >= sheets.length
        ? sheets.length - 1
        : snapshot.activeSheet;
      update({ ...snapshot, sheets, activeSheet });
    },

    renameSheet(sheetIndex, name) {
      const sheets = snapshot.sheets.map((sheet, i) =>
        i === sheetIndex ? { ...sheet, name } : sheet,
      );
      update({ ...snapshot, sheets });
    },

    reorderSheet(fromIndex, toIndex) {
      const sheets = [...snapshot.sheets];
      const [moved] = sheets.splice(fromIndex, 1);
      sheets.splice(toIndex, 0, moved);
      let activeSheet = snapshot.activeSheet;
      if (snapshot.activeSheet === fromIndex) {
        activeSheet = toIndex;
      } else if (fromIndex < snapshot.activeSheet && toIndex >= snapshot.activeSheet) {
        activeSheet -= 1;
      } else if (fromIndex > snapshot.activeSheet && toIndex <= snapshot.activeSheet) {
        activeSheet += 1;
      }
      update({ ...snapshot, sheets, activeSheet });
    },

    setActiveSheet(index) {
      if (index < 0 || index >= snapshot.sheets.length) return;
      update({ ...snapshot, activeSheet: index });
    },
  };
}
