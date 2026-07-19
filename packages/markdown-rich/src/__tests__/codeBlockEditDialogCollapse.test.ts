/**
 * 全画面コードブロック編集ダイアログのコードペイン折りたたみテスト。
 */

jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: (_lang: string, code: string) => ({ children: [], code }),
  }),
}));

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  getDivider: () => "#ccc",
  getHljsCssVars: () => ({}),
  getHljsTokenCss: () => "",
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
  CODE_HELLO_SAMPLES: {},
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
    return { el, paper, destroy: jest.fn(() => el.remove()), onClose };
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
  return { textContent: text, content: { size: text.length } } as never;
}

function makeEditor() {
  return {
    schema: { text: (s: string) => ({ text: s }) },
    chain: () => ({
      command: (fn: (ctx: { tr: { replaceWith: jest.Mock; delete: jest.Mock } }) => boolean) => {
        fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } });
        return { run: jest.fn() };
      },
    }),
  } as never;
}

const t = (key: string): string => key;

function createDialog(readOnly = false) {
  const editor = makeEditor();
  const node = makeNode("const value = 1;");
  const state = createCodeEditState({ editor, pos: 0, node, onClose: jest.fn() });
  return createCodeBlockEditDialog({
    label: "Edit",
    language: "javascript",
    isDark: false,
    editorBg: "#fff",
    fontSize: 16,
    lineHeight: 1.5,
    renderPreview: true,
    readOnly,
    state,
    t,
    onClose: jest.fn(),
  });
}

describe("createCodeBlockEditDialog code pane collapse", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("トグルで左ペインが非表示になり aria-expanded=false のレールが出る", () => {
    const handle = createDialog();

    handle.el.querySelector<HTMLButtonElement>('button[aria-label="collapseCodePane"]')?.click();

    expect(handle.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("none");
    expect(handle.el.querySelector<HTMLElement>(".am-split-divider")?.style.display).toBe("none");
    const rail = handle.el.querySelector<HTMLElement>(".am-cbed-expand-rail");
    const expand = rail?.querySelector<HTMLButtonElement>('button[aria-label="expandCodePane"]');
    expect(rail?.style.display).toBe("flex");
    expect(expand?.getAttribute("aria-expanded")).toBe("false");

    handle.destroy();
  });

  it("レールクリックで再表示され textarea の値が保持されている", () => {
    const handle = createDialog();
    const textarea = handle.el.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "const value = 2;";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));

    handle.el.querySelector<HTMLButtonElement>('button[aria-label="collapseCodePane"]')?.click();
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="expandCodePane"]')?.click();

    expect(handle.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("");
    expect(handle.el.querySelector<HTMLElement>(".am-cbed-expand-rail")?.style.display).toBe("none");
    expect(handle.el.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("const value = 2;");

    handle.destroy();
  });

  it("ダイアログを閉じて開き直すと展開状態", () => {
    const first = createDialog();
    first.el.querySelector<HTMLButtonElement>('button[aria-label="collapseCodePane"]')?.click();
    expect(first.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("none");
    first.destroy();

    const second = createDialog();
    expect(second.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("");
    expect(second.el.querySelector<HTMLElement>(".am-cbed-expand-rail")?.style.display).toBe("");
    expect(second.el.querySelector<HTMLButtonElement>('button[aria-label="collapseCodePane"]')?.getAttribute("aria-expanded")).toBe("true");

    second.destroy();
  });

  it("読み取り専用モードでもトグルが機能する", () => {
    const handle = createDialog(true);

    expect(handle.el.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(true);
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="collapseCodePane"]')?.click();
    expect(handle.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("none");
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="expandCodePane"]')?.click();
    expect(handle.el.querySelector<HTMLElement>(".am-split-left")?.style.display).toBe("");

    handle.destroy();
  });
});
