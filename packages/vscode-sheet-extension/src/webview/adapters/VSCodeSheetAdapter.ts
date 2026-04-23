import type { SheetAdapter, SheetSnapshot } from '@anytime-markdown/spreadsheet-viewer';
import { parseCsv, serializeCsv } from '@anytime-markdown/spreadsheet-viewer';
import { getVscodeApi } from './vscodeApi';

const EMPTY: SheetSnapshot = { cells: [['']], alignments: [[null]], range: { rows: 1, cols: 1 } };

type SheetFormat = 'sheet' | 'csv' | 'tsv';

export function createVSCodeSheetAdapter(
  format: SheetFormat = 'sheet',
): SheetAdapter & { applySnapshot: (s: SheetSnapshot) => void; applyText: (text: string) => void } {
  let snapshot: SheetSnapshot = EMPTY;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const sendEdit = (next: SheetSnapshot): void => {
    snapshot = next;
    notify();
    const api = getVscodeApi();
    if (format === 'sheet') {
      api.postMessage({ type: 'edit', snapshot: next });
    } else {
      const delimiter = format === 'csv' ? ',' : '\t';
      api.postMessage({ type: 'edit', text: serializeCsv(next, { delimiter }) });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setCell(row, col, value) {
      const cells = snapshot.cells.map((r, ri) =>
        ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
      );
      sendEdit({ ...snapshot, cells });
    },
    replaceAll(next) { sendEdit(next); },
    applySnapshot(next) { snapshot = next; notify(); },
    applyText(text: string) {
      const delimiter = format === 'csv' ? (',' as const) : ('\t' as const);
      snapshot = parseCsv(text, { delimiter });
      notify();
    },
  };
}
