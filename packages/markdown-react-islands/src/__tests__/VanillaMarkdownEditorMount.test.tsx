/**
 * VanillaMarkdownEditorMount.tsx（G3-2 draft: 並走 React ラッパ / 切替スイッチ / フラグ）のテスト。
 *
 * buildEditorExtensions は lowlight（ESM）を引き込み jest が解析できないため StarterKit に mock する。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";
import { render, cleanup, fireEvent } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-viewer/src/buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

// constants/templates は raw .md を import するため jest が解析できない（EditorMenuPopovers 経由）。
jest.mock("@anytime-markdown/markdown-viewer/src/constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

// @floating-ui/dom をモック（ContextMenu / MenuPopovers の配置計算は本テストの対象外）。
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

import { VanillaMarkdownEditorMount } from "../VanillaMarkdownEditorMount";

const t = (key: string): string => key;

afterEach(() => {
  cleanup();
});

describe("VanillaMarkdownEditorMount", () => {
  it("React ラッパが container へ vanilla orchestrator を mount する", () => {
    const { container, unmount } = render(<VanillaMarkdownEditorMount t={t} initialContent="# Hi" />);
    // orchestrator の root が React の div 配下に mount される。
    expect(container.querySelector("[data-am-editor-root]")).toBeTruthy();
    expect(container.querySelector("[data-am-toolbar-slot] [role='toolbar']")).toBeTruthy();
    unmount();
    // unmount で destroy → root が外れる。
    expect(container.querySelector("[data-am-editor-root]")).toBeNull();
  });

  // 2026-06-10 レビュー指摘 9: EditorErrorBoundary 相当（フォールバック UI + VS Code Output 転送）の復元。
  describe("mount エラーフォールバック（指摘 9）", () => {
    const failingMount = (): never => {
      throw new Error("boom");
    };

    afterEach(() => {
      delete (globalThis as { __vscode?: unknown }).__vscode;
    });

    it("mount 失敗時に role=alert のフォールバック UI を表示する", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { getByRole } = render(<VanillaMarkdownEditorMount t={t} mount={failingMount} />);
      expect(getByRole("alert")).toBeTruthy();
      expect(getByRole("alert").textContent).toContain("エディタでエラーが発生しました");
      consoleSpy.mockRestore();
    });

    it("mount 失敗を window.__vscode へ editorError として転送し onError を呼ぶ", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const postMessage = jest.fn();
      (globalThis as { __vscode?: unknown }).__vscode = { postMessage };
      const onError = jest.fn();
      render(<VanillaMarkdownEditorMount t={t} mount={failingMount} onError={onError} />);
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "editorError", message: "boom" }),
      );
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      consoleSpy.mockRestore();
    });

    it("再読み込みボタンで mount を再試行し、成功すればフォールバックが消える", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      let calls = 0;
      const mountOnceFailing = (containerEl: HTMLElement) => {
        calls++;
        if (calls === 1) throw new Error("boom");
        const root = document.createElement("div");
        root.setAttribute("data-am-editor-root", "");
        containerEl.appendChild(root);
        return {
          editor: {} as never,
          root,
          update: jest.fn(),
          destroy: jest.fn(),
        };
      };
      const { getByRole, queryByRole, container } = render(
        <VanillaMarkdownEditorMount t={t} mount={mountOnceFailing} />,
      );
      expect(getByRole("alert")).toBeTruthy();

      fireEvent.click(getByRole("button"));

      expect(queryByRole("alert")).toBeNull();
      expect(container.querySelector("[data-am-editor-root]")).toBeTruthy();
      expect(calls).toBe(2);
      consoleSpy.mockRestore();
    });
  });
});
