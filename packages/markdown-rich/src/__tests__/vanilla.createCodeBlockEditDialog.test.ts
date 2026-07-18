/**
 * createCodeBlockEditDialog のユニットテスト
 * jsdom 上でダイアログ DOM が正しく生成・破棄されることを検証。
 */

jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: (_lang: string, code: string) => ({ children: [] }),
  }),
}));

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  useTextareaSearch: () => ({ reset: jest.fn() }),
  getDivider: () => "#ccc",
  getHljsCssVars: () => ({}),
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
  CODE_HELLO_SAMPLES: [],
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 120,
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  CHIP_FONT_SIZE: "0.75rem",
  FS_CHIP_HEIGHT: 26,
  FS_ZOOM_LABEL_WIDTH: 36,
  SMALL_CAPTION_FONT_SIZE: "0.75rem",
}));

jest.mock("@anytime-markdown/ui-core/Dialog", () => ({
  createDialog: ({ onClose }: { onClose: () => void }) => {
    const el = document.createElement("div");
    const paper = document.createElement("div");
    el.appendChild(paper);
    document.body.appendChild(el);
    return { el, paper, destroy: jest.fn(() => el.remove()) };
  },
}));

jest.mock("@anytime-markdown/ui-core/Tabs", () => ({
  createTabs: () => ({ el: document.createElement("div"), update: jest.fn(), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/ui-core/Button", () => ({
  createButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/ui-core/IconButton", () => ({
  createIconButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/ui-core/Menu", () => ({
  createMenu: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/ui-core/MenuItem", () => ({
  createMenuItem: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

import { createCodeEditState } from "../vanilla/codeEditState";
import { createCodeBlockEditDialog } from "../vanilla/createCodeBlockEditDialog";

function makeNode(text: string) {
  return { textContent: text, content: { size: text.length } } as unknown as import("@anytime-markdown/markdown-pm/model").Node;
}

function makeEditor() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({ command: (fn: (ctx: { tr: { replaceWith: jest.Mock; delete: jest.Mock } }) => boolean) => {
      fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } });
      return { run: jest.fn() };
    } }),
  } as unknown as import("@anytime-markdown/markdown-core").Editor;
  return editor;
}

const t = (key: string) => key;

describe("createCodeBlockEditDialog", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("生成時に dialog が document.body に append される", () => {
    const editor = makeEditor();
    const node = makeNode("const x = 1;");
    const state = createCodeEditState({ editor, pos: 5, node, onClose: jest.fn() });

    const handle = createCodeBlockEditDialog({
      label: "Edit Code",
      language: "javascript",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      state,
      t,
      onClose: jest.fn(),
    });

    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
  });

  it("renderPreviewHtml 指定時は構文ハイライトでなくその HTML をプレビューに描画する", () => {
    const editor = makeEditor();
    const node = makeNode("type: pyramid\n- 理念");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const handle = createCodeBlockEditDialog({
      label: "思考法ダイアグラム",
      language: "anytime-thinking-model",
      isDark: true,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      renderPreview: true,
      renderPreviewHtml: () => '<svg data-marker="graph"><rect/></svg>',
      customSamples: [],
      state,
      t,
      onClose: jest.fn(),
    });

    const preview = handle.el.querySelector(".am-cbed-preview");
    expect(preview?.querySelector('svg[data-marker="graph"]')).not.toBeNull();
    handle.destroy();
  });

  it("regular コードのプレビューは <pre><code class=hljs> でラップし hljs 着色ルールを注入する", () => {
    const editor = makeEditor();
    const node = makeNode("const x = 1;");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const handle = createCodeBlockEditDialog({
      label: "Edit",
      language: "javascript",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      renderPreview: true,
      state,
      t,
      onClose: jest.fn(),
    });

    const preview = handle.el.querySelector(".am-cbed-preview");
    expect(preview).not.toBeNull();
    // 裸 span 列ではなくブロック要素でラップ（flex 縦並びによるレイアウト崩れの解消）。
    const codeEl = preview!.querySelector("pre > code.hljs");
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toContain("const x = 1;");
    // コード表示なので rendered（white-space 解除）モードは付かない。
    expect(preview!.classList.contains("am-cbed-preview--rendered")).toBe(false);
    // hljs 着色ルール（getHljsTokenCss）がダイアログ stylesheet に注入される。
    const styleEl = document.getElementById("am-vanilla-codeblock-dialog");
    expect(styleEl?.textContent).toContain(".am-cbed-preview .hljs-keyword");
    expect(styleEl?.textContent).toContain("var(--hljs-keyword)");
    handle.destroy();
  });

  it("language=html + renderLanguagePreview は sanitize 済み HTML を実レンダリングする（構文ハイライトでなく）", () => {
    const editor = makeEditor();
    const node = makeNode('<p id="html-preview"><strong>Hello</strong></p>');
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const handle = createCodeBlockEditDialog({
      label: "htmlPreview",
      language: "html",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      renderPreview: true,
      renderLanguagePreview: true,
      state,
      t,
      onClose: jest.fn(),
    });

    const preview = handle.el.querySelector(".am-cbed-preview");
    expect(preview).not.toBeNull();
    // エスケープされたソース文字列でなく実 DOM としてレンダリングされる。
    expect(preview!.querySelector("p#html-preview strong")?.textContent).toBe("Hello");
    // rendered モード（monospace / white-space:pre 解除）クラスが付く。
    expect(preview!.classList.contains("am-cbed-preview--rendered")).toBe(true);
    handle.destroy();
  });

  it("state 更新時に renderPreviewHtml が再呼ばれライブ再描画される", () => {
    const editor = makeEditor();
    const node = makeNode("type: pyramid\n- a");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });
    const mockFn = jest.fn((_code: string, _isDark: boolean) => '<svg data-marker="live"/>');

    const handle = createCodeBlockEditDialog({
      label: "思考法ダイアグラム",
      language: "anytime-thinking-model",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      renderPreview: true,
      renderPreviewHtml: mockFn,
      customSamples: [],
      state,
      t,
      onClose: jest.fn(),
    });

    expect(mockFn).toHaveBeenCalledTimes(1); // 初回 render
    state.onFsTextChange("type: pyramid\n- b\n- c");
    expect(mockFn.mock.calls.length).toBeGreaterThanOrEqual(2); // subscribe 経由で再 render
    handle.destroy();
  });

  it("previewSidePanel はプレビュー本体の右側カラムに配置される（横並び・パネルが後）", () => {
    const editor = makeEditor();
    const node = makeNode("---\nid: a\n---\n<div class=\"sm-screen\"></div>");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const mount = jest.fn((container: HTMLElement) => {
      container.appendChild(document.createElement("div"));
      return () => {};
    });
    const handle = createCodeBlockEditDialog({
      label: "Edit",
      language: "screenmock",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      renderPreview: true,
      renderPreviewHtml: () => "",
      previewSidePanel: { mount },
      state,
      t,
      onClose: jest.fn(),
    });

    expect(mount).toHaveBeenCalledTimes(1);
    const right = handle.el.querySelector(".am-cbed-preview-with-panel");
    expect(right).not.toBeNull();
    const children = Array.from(right?.children ?? []).map((c) => c.className);
    // DOM 順: プレビュー本体 → サイドパネル（横並びで右側に来る前提の並び）
    expect(children.indexOf("am-cbed-preview-main")).toBeLessThan(children.indexOf("am-cbed-preview-side-panel"));
    // .am-split-right の flex-direction:column（split 側 style が後注入で同特異度なら勝つ）を
    // 打ち消さないと縦積み（パネルが下・左寄り）になる。実際のカスケード結果で検証する。
    expect(getComputedStyle(right as Element).flexDirection).toBe("row");
    handle.destroy();
  });

  it("destroy で dialog が DOM から削除される", () => {
    const editor = makeEditor();
    const node = makeNode("abc");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const handle = createCodeBlockEditDialog({
      label: "Edit",
      language: "plaintext",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      state,
      t,
      onClose: jest.fn(),
    });

    handle.destroy();
    expect(document.body.contains(handle.el)).toBe(false);
  });
});
