/**
 * VanillaMarkdownEditorMount.tsx（G3-2 draft: 並走 React ラッパ / 切替スイッチ / フラグ）のテスト。
 *
 * buildEditorExtensions は lowlight（ESM）を引き込み jest が解析できないため StarterKit に mock する。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";
import { render, cleanup } from "@testing-library/react";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

import {
  VanillaMarkdownEditorMount,
  MaybeVanillaMarkdownEditor,
  isVanillaEditorEnabled,
} from "../VanillaMarkdownEditorMount";

const t = (key: string): string => key;

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as Record<string, unknown>).__AM_VANILLA_EDITOR__;
});

describe("isVanillaEditorEnabled", () => {
  it("既定は false（旧 React 経路）", () => {
    expect(isVanillaEditorEnabled()).toBe(false);
  });

  it("グローバル明示フラグ __AM_VANILLA_EDITOR__=true で true", () => {
    (globalThis as unknown as Record<string, unknown>).__AM_VANILLA_EDITOR__ = true;
    expect(isVanillaEditorEnabled()).toBe(true);
  });
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
});

describe("MaybeVanillaMarkdownEditor", () => {
  it("enabled=false では legacy 要素を描画する", () => {
    const { container } = render(
      <MaybeVanillaMarkdownEditor
        enabled={false}
        legacy={<div data-testid="legacy">legacy editor</div>}
        vanilla={{ t }}
      />,
    );
    expect(container.querySelector('[data-testid="legacy"]')).toBeTruthy();
    expect(container.querySelector("[data-am-editor-root]")).toBeNull();
  });

  it("enabled=true では vanilla orchestrator を mount する", () => {
    const { container } = render(
      <MaybeVanillaMarkdownEditor
        enabled
        legacy={<div data-testid="legacy">legacy editor</div>}
        vanilla={{ t, initialContent: "x" }}
      />,
    );
    expect(container.querySelector('[data-testid="legacy"]')).toBeNull();
    expect(container.querySelector("[data-am-editor-root]")).toBeTruthy();
  });
});
