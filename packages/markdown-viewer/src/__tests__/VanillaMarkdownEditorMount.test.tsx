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

// constants/templates は raw .md を import するため jest が解析できない（EditorMenuPopovers 経由）。
jest.mock("../constants/templates", () => ({
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

import {
  VanillaMarkdownEditorMount,
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
