/**
 * createCodeBlockEditDialog の leftAuxTab（スクリプト ⇄ 補助エディタ タブ）ユニットテスト。
 * 表タブ活性化で mount が呼ばれ、ctx 経由で setCode が CodeEditState に橋渡しされ、
 * スクリプトタブへ戻ると cleanup が呼ばれることを検証する。
 */

jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: () => ({ children: [] }),
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
  createDialog: () => {
    const el = document.createElement("div");
    const paper = document.createElement("div");
    el.appendChild(paper);
    document.body.appendChild(el);
    return { el, paper, destroy: jest.fn(() => el.remove()) };
  },
}));

// 機能版 Tabs モック: タブボタンをクリックすると onChange(value) を発火する。
jest.mock("@anytime-markdown/ui-core/Tabs", () => ({
  createTabs: ({
    tabs,
    onChange,
  }: {
    tabs: ReadonlyArray<{ value: string; label: unknown }>;
    onChange?: (v: string) => void;
  }) => {
    const el = document.createElement("div");
    for (const tab of tabs) {
      const b = document.createElement("button");
      b.dataset.value = tab.value;
      b.addEventListener("click", () => onChange?.(tab.value));
      el.appendChild(b);
    }
    return { el, update: jest.fn(), destroy: jest.fn() };
  },
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
  const editor = {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({
      command: (fn: (ctx: { tr: { replaceWith: jest.Mock; delete: jest.Mock } }) => boolean) => {
        fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } });
        return { run: jest.fn() };
      },
    }),
  } as unknown as import("@anytime-markdown/markdown-core").Editor;
  return editor;
}
const t = (key: string) => key;

describe("createCodeBlockEditDialog leftAuxTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function clickTab(value: string): void {
    const btn = document.querySelector(`button[data-value="${value}"]`) as HTMLButtonElement | null;
    btn?.click();
  }

  it("表タブで mount され、ctx.setCode が state に反映し、スクリプトタブで cleanup される", () => {
    const editor = makeEditor();
    const node = makeNode('{"kind":"line","series":[]}');
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });

    const cleanup = jest.fn();
    const mount = jest.fn(
      (_c: HTMLElement, ctx: { getCode: () => string; setCode: (s: string) => void; isDark: boolean }) => {
        // ctx 経由で state を更新できる
        ctx.setCode('{"kind":"bar","series":[]}');
        return cleanup;
      },
    );

    const handle = createCodeBlockEditDialog({
      label: "Chart",
      language: "anytime-chart",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      state,
      t,
      onClose: jest.fn(),
      leftAuxTab: { labelKey: "tableTab", mount },
    });

    // 初期はスクリプトタブ。mount 未呼び出し。
    expect(mount).not.toHaveBeenCalled();

    clickTab("table");
    expect(mount).toHaveBeenCalledTimes(1);
    // ctx.setCode で state が更新された
    expect(state.getFsCode()).toBe('{"kind":"bar","series":[]}');

    clickTab("script");
    expect(cleanup).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("leftAuxTab 未指定なら従来通り（タブを出さない）", () => {
    const editor = makeEditor();
    const node = makeNode("const x = 1;");
    const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });
    const handle = createCodeBlockEditDialog({
      label: "Code",
      language: "javascript",
      isDark: false,
      editorBg: "#fff",
      fontSize: 16,
      lineHeight: 1.5,
      state,
      t,
      onClose: jest.fn(),
    });
    // タブボタン（data-value）が無い
    expect(document.querySelector('button[data-value="table"]')).toBeNull();
    handle.destroy();
  });
});
