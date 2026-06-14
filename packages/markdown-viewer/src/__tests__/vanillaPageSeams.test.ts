/**
 * host/vanillaPageSeams.ts + host/sourceModeController.ts + handle.update の検証。
 *
 * jsdom の罠回避: getComputedStyle / scroll 実挙動は検証せず、状態・属性・コールバック発火を見る。
 * buildEditorExtensions は lowlight（ESM）回避のため StarterKit へ mock する。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";
import { Markdown } from "@anytime-markdown/markdown-md";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit, Markdown],
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

import { Editor } from "@anytime-markdown/markdown-core";

import {
  installHeadingsNotifier,
  installVSCodeModeEvents,
} from "../host/vanillaPageSeams";
import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

// jsdom には caret 座標 API が無く、PM の scrollToSelection が throw するため最小 polyfill。
beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

function makeEditor(content = "<p>hello</p>"): Editor {
  return new Editor({ extensions: [StarterKit], content });
}

describe("installHeadingsNotifier", () => {
  it("初回即時 + update デバウンスで headings を通知する", () => {
    jest.useFakeTimers();
    const editor = makeEditor("<h1>Title</h1><p>body</p>");
    const onHeadings = jest.fn();
    const dispose = installHeadingsNotifier(editor, onHeadings);
    expect(onHeadings).toHaveBeenCalledTimes(1);
    expect(onHeadings.mock.calls[0][0][0]).toMatchObject({ level: 1, text: "Title" });

    editor.commands.insertContent("<h2>Sub</h2>");
    jest.runAllTimers();
    expect(onHeadings.mock.calls.length).toBeGreaterThanOrEqual(2);

    dispose();
    editor.destroy();
    jest.useRealTimers();
  });
});

describe("installVSCodeModeEvents", () => {
  it("vscode-set-mode の detail に応じてハンドラを呼び分ける", () => {
    const handlers = { review: jest.fn(), source: jest.fn(), wysiwyg: jest.fn() };
    const dispose = installVSCodeModeEvents(handlers);
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "source" }));
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "review" }));
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "wysiwyg" }));
    expect(handlers.source).toHaveBeenCalledTimes(1);
    expect(handlers.review).toHaveBeenCalledTimes(1);
    expect(handlers.wysiwyg).toHaveBeenCalledTimes(1);
    dispose();
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "source" }));
    expect(handlers.source).toHaveBeenCalledTimes(1);
  });
});

describe("mountVanillaMarkdownEditor: 新 seam", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
  });

  afterEach(() => {
    container.remove();
    localStorage.clear();
  });

  it("source モード切替で textarea を表示し WYSIWYG 復帰で同期する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      persistModeState: false,
    });
    const sourceBtn = handle.root.querySelector<HTMLButtonElement>(
      "[data-am-toolbar-slot] button",
    );
    expect(sourceBtn).not.toBeNull();

    // ToolbarModeHandlers 経由の切替を直接シミュレートできないため、vscode-set-mode を使う
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "source" }));
    const textarea = handle.root.querySelector<HTMLTextAreaElement>(
      "[data-am-source-textarea]",
    );
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toContain("Hello");

    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "wysiwyg" }));
    expect(handle.root.querySelector("[data-am-source-textarea]")).toBeNull();
    handle.destroy();
  });

  it("showFrontmatter: フロントマターを表示し本文から除外する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "---\ntitle: Test\n---\n\n# Body",
      showFrontmatter: true,
    });
    const slot = handle.root.querySelector<HTMLElement>("[data-am-frontmatter-slot]");
    expect(slot?.style.display).not.toBe("none");
    const fm = handle.root.querySelector<HTMLElement>("[data-am-frontmatter]");
    expect(fm).not.toBeNull();
    // 折りたたみ既定: ヘッダのみ表示。クリックで展開して textarea に生フロントマターが入る。
    expect(handle.root.querySelector("[data-frontmatter-editor]")).toBeNull();
    fm?.querySelector<HTMLElement>("div")?.click();
    const ta = handle.root.querySelector<HTMLTextAreaElement>("[data-frontmatter-editor]");
    expect(ta?.value).toContain("title: Test");
    expect(handle.editor.getText()).not.toContain("title: Test");
    handle.destroy();
  });

  it("onModeChange: モード切替で通知される", () => {
    const onModeChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      onModeChange,
      persistModeState: false,
    });
    globalThis.dispatchEvent(new CustomEvent("vscode-set-mode", { detail: "review" }));
    expect(onModeChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewMode: true, sourceMode: false }),
    );
    handle.destroy();
  });

  it("update({ readOnly }) で editable が反映される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# Hello" });
    expect(handle.editor.isEditable).toBe(true);
    handle.update({ readOnly: true });
    expect(handle.editor.isEditable).toBe(false);
    handle.update({ readOnly: false });
    expect(handle.editor.isEditable).toBe(true);
    handle.destroy();
  });

  it("update({ fileName }) が StatusBar に反映される", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      fileName: "first.md",
    });
    expect(handle.root.textContent).toContain("first.md");
    handle.update({ fileName: "second.md" });
    expect(handle.root.textContent).toContain("second.md");
    handle.destroy();
  });

  it("onContentChange はデバウンス + frontmatter prepend で通知される", () => {
    jest.useFakeTimers();
    const onContentChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "---\ntitle: T\n---\n\n# Hello",
      onContentChange,
    });
    handle.editor.commands.insertContent("world");
    expect(onContentChange).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange.mock.calls[0][0]).toContain("title: T");
    handle.destroy();
    jest.useRealTimers();
  });

  it("vscode-set-content: WYSIWYG 中は本文を差し替える", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# Old" });
    globalThis.dispatchEvent(
      new CustomEvent("vscode-set-content", { detail: "# New Body" }),
    );
    expect(handle.editor.getText()).toContain("New Body");
    handle.destroy();
  });

  it("hideToolbar / hideStatusBar でスロットが空になる", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      hideToolbar: true,
      hideStatusBar: true,
    });
    expect(
      handle.root.querySelector("[data-am-toolbar-slot]")?.childElementCount ?? 0,
    ).toBe(0);
    handle.destroy();
  });

  it("sideToolbar: 右端スロットに縦ツールバーが配置される", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      sideToolbar: true,
    });
    expect(
      handle.root.querySelector("[data-am-side-toolbar-slot]")?.childElementCount ?? 0,
    ).toBeGreaterThan(0);
    handle.destroy();
  });

  it("externalCompareContent: mount 時に merge ビューが開き onCompareModeChange が発火する", () => {
    const onCompareModeChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      externalCompareContent: "# Compare",
      onCompareModeChange,
    });
    expect(onCompareModeChange).toHaveBeenCalledWith(true);
    expect(handle.root.querySelector("[data-am-inline-merge]")).not.toBeNull();
    // 終了イベントで閉じて通常表示へ復帰する
    globalThis.dispatchEvent(new CustomEvent("vscode-exit-compare-mode"));
    expect(onCompareModeChange).toHaveBeenLastCalledWith(false);
    expect(handle.root.querySelector("[data-am-inline-merge]")).toBeNull();
    handle.destroy();
  });

  it("codeBlockOverlayInstaller が editor を受けて install され destroy で解放される", () => {
    const dispose = jest.fn();
    const installer = jest.fn(() => dispose);
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Hello",
      codeBlockOverlayInstaller: installer,
    });
    expect(installer).toHaveBeenCalledWith(handle.editor);
    handle.destroy();
    expect(dispose).toHaveBeenCalled();
  });

  it("persistDraft: 保存済み下書きを initialContent より優先する", () => {
    localStorage.setItem("markdown-editor-content", "# Draft");
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# Fallback",
      persistDraft: true,
    });
    expect(handle.editor.getText()).toContain("Draft");
    handle.destroy();
  });
});
