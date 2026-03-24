/**
 * useEditorShortcuts のユニットテスト
 *
 * キーボードショートカットのハンドリングを検証する。
 */

import { renderHook } from "@testing-library/react";
import { useEditorShortcuts } from "../hooks/useEditorShortcuts";

function createHandlers() {
  return {
    sourceMode: false,
    readonlyMode: false,
    reviewMode: false,
    handleSaveFile: jest.fn(),
    handleSaveAsFile: jest.fn(),
    handleOpenFile: jest.fn(),
    handleClear: jest.fn(),
    handleCopy: jest.fn(),
    handleSwitchToSource: jest.fn(),
    handleSwitchToWysiwyg: jest.fn(),
    handleSwitchToReview: jest.fn(),
    handleSwitchToReadonly: jest.fn(),
    handleMerge: jest.fn(),
  };
}

function fireKey(key: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  document.dispatchEvent(event);
}

describe("useEditorShortcuts", () => {
  describe("ファイル操作ショートカット", () => {
    it("Ctrl+S で handleSaveFile が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("s");
      expect(h.handleSaveFile).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+O で handleOpenFile が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("o");
      expect(h.handleOpenFile).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+Shift+S で handleSaveAsFile が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { shiftKey: true });
      expect(h.handleSaveAsFile).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+Shift+C で handleCopy が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("c", { shiftKey: true });
      expect(h.handleCopy).toHaveBeenCalledTimes(1);
    });

    it("Ctrl なしのキーは無視される", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { ctrlKey: false });
      expect(h.handleSaveFile).not.toHaveBeenCalled();
    });
  });

  describe("モード切替ショートカット (Ctrl+Alt)", () => {
    it("編集モードから Ctrl+Alt+S でソースモードに切り替え", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { altKey: true });
      expect(h.handleSwitchToSource).toHaveBeenCalledTimes(1);
    });

    it("ソースモードから Ctrl+Alt+S で readonlyMode に切り替え", () => {
      const h = createHandlers();
      h.sourceMode = true;
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { altKey: true });
      expect(h.handleSwitchToReadonly).toHaveBeenCalledTimes(1);
    });

    it("readonlyMode から Ctrl+Alt+S で reviewMode に切り替え", () => {
      const h = createHandlers();
      h.readonlyMode = true;
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { altKey: true });
      expect(h.handleSwitchToReview).toHaveBeenCalledTimes(1);
    });

    it("reviewMode から Ctrl+Alt+S で wysiwyg に切り替え", () => {
      const h = createHandlers();
      h.reviewMode = true;
      renderHook(() => useEditorShortcuts(h));

      fireKey("s", { altKey: true });
      expect(h.handleSwitchToWysiwyg).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+Alt+M で handleMerge が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("m", { altKey: true });
      expect(h.handleMerge).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+Alt+N で handleClear が呼ばれる", () => {
      const h = createHandlers();
      renderHook(() => useEditorShortcuts(h));

      fireKey("n", { altKey: true });
      expect(h.handleClear).toHaveBeenCalledTimes(1);
    });

    it("readonlyMode では編集系ショートカットが無効", () => {
      const h = createHandlers();
      h.readonlyMode = true;
      renderHook(() => useEditorShortcuts(h));

      fireKey("m", { altKey: true });
      fireKey("n", { altKey: true });
      expect(h.handleMerge).not.toHaveBeenCalled();
      expect(h.handleClear).not.toHaveBeenCalled();
    });
  });
});
