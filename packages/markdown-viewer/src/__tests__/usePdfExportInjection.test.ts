/**
 * usePdfExport injection contract tests (B-5)
 *
 * ダークモード図のライト化 (prerender/replace) は markdown-rich へ移設したため、
 * core 側は「注入された prepareDarkDiagrams を呼び、apply/restore を print の前後で実行する」
 * 契約のみを検証する。実際の図変換挙動は markdown-rich の prepareDarkDiagramsForPrint.test.ts。
 */
import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@anytime-markdown/markdown-react";

let themeMode: "dark" | "light" = "dark";
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useTheme: () => ({ palette: { mode: themeMode } }),
}));

import { usePdfExport } from "../hooks/usePdfExport";

function createMockEditor(collapsed: number[] = []): Editor {
  const mockTr = { setNodeAttribute: jest.fn().mockReturnThis() };
  const mockDoc = {
    descendants: jest.fn((cb: (node: { attrs: { collapsed?: boolean } }, pos: number) => void) => {
      for (const pos of collapsed) cb({ attrs: { collapsed: true } }, pos);
    }),
  };
  return {
    isDestroyed: false,
    state: { doc: mockDoc, tr: mockTr },
    view: { dispatch: jest.fn() },
  } as unknown as Editor;
}

describe("usePdfExport - dark diagram injection contract", () => {
  let printSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    themeMode = "dark";
    printSpy = jest.spyOn(globalThis, "print").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    printSpy.mockRestore();
  });

  it("calls injected prepareDarkDiagrams and applies/restores around print in dark mode", async () => {
    const applyBeforePrint = jest.fn();
    const restore = jest.fn();
    const prepareDarkDiagrams = jest.fn().mockResolvedValue({ applyBeforePrint, restore, hasChanges: true });

    const { result } = renderHook(() =>
      usePdfExport({ editor: createMockEditor(), showNotification: jest.fn(), prepareDarkDiagrams }),
    );

    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(prepareDarkDiagrams).toHaveBeenCalledTimes(1);
    expect(applyBeforePrint).toHaveBeenCalledTimes(1);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    // apply は print の前、restore は print の後
    expect(applyBeforePrint.mock.invocationCallOrder[0]).toBeLessThan(printSpy.mock.invocationCallOrder[0]);
    expect(restore.mock.invocationCallOrder[0]).toBeGreaterThan(printSpy.mock.invocationCallOrder[0]);
  });

  it("does not call prepareDarkDiagrams in light mode", async () => {
    themeMode = "light";
    const prepareDarkDiagrams = jest.fn();
    const { result } = renderHook(() =>
      usePdfExport({ editor: createMockEditor(), showNotification: jest.fn(), prepareDarkDiagrams }),
    );

    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(prepareDarkDiagrams).not.toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("prints without error in dark mode when no preparer is injected", async () => {
    const { result } = renderHook(() =>
      usePdfExport({ editor: createMockEditor(), showNotification: jest.fn() }),
    );

    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("toggles pdfExporting around export", async () => {
    const { result } = renderHook(() =>
      usePdfExport({ editor: createMockEditor(), showNotification: jest.fn() }),
    );
    expect(result.current.pdfExporting).toBe(false);
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.pdfExporting).toBe(false);
  });
});
