import type { CellAlign, SheetSnapshot, WorkbookAdapter, WorkbookSnapshot } from '@anytime-markdown/spreadsheet-viewer';
import { getVscodeApi } from './vscodeApi';

const EMPTY_WORKBOOK: WorkbookSnapshot = {
  sheets: [{ name: "Sheet1", cells: [[""]], alignments: [[null as CellAlign]], range: { rows: 1, cols: 1 } }],
  activeSheet: 0,
};

const EMPTY_SHEET_CELLS: string[][] = [[""]];
const EMPTY_SHEET_ALIGNMENTS: CellAlign[][] = [[null]];

export function createVSCodeWorkbookAdapter(): WorkbookAdapter & {
  applyWorkbook: (wb: WorkbookSnapshot) => void;
} {
  let snapshot: WorkbookSnapshot = EMPTY_WORKBOOK;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const update = (next: WorkbookSnapshot): void => {
    snapshot = next;
    notify();
    getVscodeApi().postMessage({ type: 'edit', workbook: next });
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

    replaceSheet(sheetIndex, next: SheetSnapshot) {
      const sheets = snapshot.sheets.map((sheet, si) =>
        si === sheetIndex ? { name: sheet.name, ...next } : sheet,
      );
      update({ ...snapshot, sheets });
    },

    addSheet(name) {
      const n = name ?? `Sheet${snapshot.sheets.length + 1}`;
      const newSheet = {
        name: n,
        cells: EMPTY_SHEET_CELLS,
        alignments: EMPTY_SHEET_ALIGNMENTS,
        range: { rows: 1, cols: 1 },
      };
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

    applyWorkbook(wb: WorkbookSnapshot) {
      snapshot = wb;
      notify();
    },
  };
}
