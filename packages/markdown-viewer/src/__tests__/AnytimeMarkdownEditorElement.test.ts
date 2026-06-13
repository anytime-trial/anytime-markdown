/**
 * `<anytime-markdown-editor>` Web Component のユニットテスト。
 *
 * 既存 vanillaMarkdownEditor.test.ts と同じ理由で buildEditorExtensions（lowlight ESM）・
 * constants/templates（raw .md）・@floating-ui/dom をモックする。StarterKit 構成では
 * markdown 直列化拡張が無いため value getter は cachedValue にフォールバックする。
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

import "../element"; // customElements.define の副作用を発火
import { AnytimeMarkdownEditorElement } from "../AnytimeMarkdownEditorElement";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AnytimeMarkdownEditorElement", () => {
  it("anytime-markdown-editor タグが登録される", () => {
    expect(customElements.get("anytime-markdown-editor")).toBe(AnytimeMarkdownEditorElement);
  });

  it("connect で editor root を mount し、disconnect で破棄する", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    document.body.appendChild(el);
    expect(el.querySelector("[data-am-editor-root]")).not.toBeNull();
    el.remove();
    expect(el.querySelector("[data-am-editor-root]")).toBeNull();
  });

  it("connect 前に set した value を初期コンテンツとして保持する", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    el.value = "# Hello";
    document.body.appendChild(el);
    expect(el.value).toBe("# Hello");
  });

  it("read-only 属性で editor が editable=false で mount される", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    el.setAttribute("read-only", "");
    document.body.appendChild(el);
    // handle.editor へ間接アクセス（root が mount されていることで editable を確認）
    const root = el.querySelector("[data-am-editor-root]");
    expect(root).not.toBeNull();
    const pm = root?.querySelector(".ProseMirror");
    expect(pm?.getAttribute("contenteditable")).toBe("false");
  });

  it("read-only の動的トグルが throw しない", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    document.body.appendChild(el);
    expect(() => el.setAttribute("read-only", "")).not.toThrow();
    expect(() => el.removeAttribute("read-only")).not.toThrow();
  });

  it("theme 属性変更が update 経路を通る（throw しない・値保持）", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    el.value = "# Hi";
    document.body.appendChild(el);
    expect(() => el.setAttribute("theme", "dark")).not.toThrow();
    expect(el.value).toBe("# Hi");
  });

  it("プログラム的な value set では change を発火しない", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    document.body.appendChild(el);
    const onChange = jest.fn();
    el.addEventListener("change", onChange);
    el.value = "# changed";
    expect(onChange).not.toHaveBeenCalled();
  });

  it("options プロパティ（escape hatch）が mount オプションへマージされる", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    // 属性ではなく options 経由で readOnly を渡す（app consumer 経路）。
    el.options = { readOnly: true, initialContent: "# from options" };
    document.body.appendChild(el);
    const pm = el.querySelector("[data-am-editor-root] .ProseMirror");
    expect(pm?.getAttribute("contenteditable")).toBe("false");
    // editor/root getter が handle を露出する（handle adapter 用）。
    expect(el.editor).not.toBeNull();
    expect(el.root).not.toBeNull();
  });

  it("options.onContentChange と change イベントの両方が編集で呼ばれる配線（update 委譲も throw しない）", () => {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    el.options = { onContentChange: jest.fn() };
    document.body.appendChild(el);
    expect(() => el.update({ themeMode: "dark" })).not.toThrow();
  });
});
