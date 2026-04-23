import type { SheetAdapter, SheetSnapshot } from "@anytime-markdown/spreadsheet-core";

export interface MockSheetAdapter extends SheetAdapter {
  readonly getCalls: ReadonlyArray<{ method: string; args: readonly unknown[] }>;
  readonly snapshot: SheetSnapshot;
}

export function createMockAdapter(
  initial: SheetSnapshot,
  options?: { readOnly?: boolean },
): MockSheetAdapter {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const readOnly = options?.readOnly ?? false;
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
      calls.push({ method: "setCell", args: [row, col, value] });
      if (readOnly) return;
      const cells = snapshot.cells.map((r, ri) =>
        ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
      );
      snapshot = { ...snapshot, cells };
      notify();
    },
    replaceAll(next) {
      calls.push({ method: "replaceAll", args: [next] });
      if (readOnly) return;
      snapshot = next;
      notify();
    },
    readOnly,
    get getCalls() {
      return calls;
    },
    get snapshot() {
      return snapshot;
    },
  };
}
