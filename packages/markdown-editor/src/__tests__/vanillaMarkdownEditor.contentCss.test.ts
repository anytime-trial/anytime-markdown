/**
 * mountVanillaMarkdownEditor がコンテンツ CSS（editorContentCss）を注入する配線のリグレッションテスト。
 *
 * G4 で旧 React GlobalStyle 注入が消え、vanilla 経路の見出し装飾が消失した回帰
 * （2026-06-11 報告）に対する mount レベルの再発防止。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

describe("mountVanillaMarkdownEditor コンテンツ CSS 注入", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.getElementById("am-editor-content-css")?.remove();
  });

  it("mount で .tiptap 見出しスタイルを含む style 要素が注入される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# Hello" });

    const style = document.getElementById("am-editor-content-css");
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain(".tiptap h1");
    expect(style?.textContent).toMatch(/\.tiptap h1[^{]*\{[^}]*font-size:\s*2em/);

    handle.destroy();
  });

  it("設定由来の CSS 変数と data 属性が root に適用される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;

    expect(root.style.getPropertyValue("--am-editor-bg")).not.toBe("");
    expect(root.style.getPropertyValue("--am-editor-text")).not.toBe("");
    expect(root.style.getPropertyValue("--am-editor-outer-bg")).not.toBe("");
    expect(root.dataset.tableWidth).toBe("auto");

    handle.destroy();
  });

  it("themeMode の live patch で CSS とテーマ依存変数が更新される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, themeMode: "light" });
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
    const lightCss = document.getElementById("am-editor-content-css")?.textContent;
    const lightBg = root.style.getPropertyValue("--am-editor-bg");

    handle.update({ themeMode: "dark" });

    expect(document.getElementById("am-editor-content-css")?.textContent).not.toBe(lightCss);
    expect(root.style.getPropertyValue("--am-editor-bg")).not.toBe(lightBg);

    handle.destroy();
  });
});
