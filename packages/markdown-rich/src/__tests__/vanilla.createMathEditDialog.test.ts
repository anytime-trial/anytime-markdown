/**
 * createMathEditDialog のユニットテスト
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  getDivider: () => "#ccc",
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
  MATH_SAMPLES: [],
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

jest.mock("../hooks/useKatexRender", () => ({
  renderKatexHtml: jest.fn(async () => ({ html: "<span>x^2</span>", error: "" })),
  MATH_SANITIZE_CONFIG: {},
}));

import { createCodeEditState } from "../vanilla/codeEditState";
import { createMathEditDialog } from "../vanilla/createMathEditDialog";

function makeNode(text: string) {
  return { textContent: text, content: { size: text.length } } as unknown as import("@anytime-markdown/markdown-pm/model").Node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeEditor = () => ({ schema: { text: (s: string) => ({ text: s }) }, chain: () => ({ command: (fn: any) => { fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } }); return { run: jest.fn() }; } }) } as any);

const t = (key: string) => key;

describe("createMathEditDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  it("生成時に dialog が document.body に append される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("x^2"), onClose: jest.fn() });
    const handle = createMathEditDialog({
      label: "Math", isDark: false, editorBg: "#fff",
      fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
  });

  it("destroy で dialog が DOM から削除される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("x^2"), onClose: jest.fn() });
    const handle = createMathEditDialog({
      label: "Math", isDark: false, editorBg: "#fff",
      fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    handle.destroy();
    expect(document.body.contains(handle.el)).toBe(false);
  });

  // 指摘2 回帰テスト: KaTeX ParseError の message はユーザー入力 LaTeX の一部を含み得る。
  // innerHTML への未エスケープ挿入は HTML 注入を許容するため、textContent ベースで
  // タグが解釈されないことを固定する。
  it("KaTeX エラーメッセージを HTML として解釈せず textContent で表示する（XSS 対策）", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renderKatexHtml } = require("../hooks/useKatexRender") as { renderKatexHtml: jest.Mock };
    renderKatexHtml.mockResolvedValueOnce({ html: "", error: "<img src=x onerror=alert(1)>" });

    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("x^2"), onClose: jest.fn() });
    const handle = createMathEditDialog({
      label: "Math", isDark: false, editorBg: "#fff",
      fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    // renderMath() は dialog 生成時に非同期起動される（マイクロタスクを flush して待つ）
    await Promise.resolve();
    await Promise.resolve();

    const katexBox = handle.el.querySelector(".am-mted-katex-box")!;
    expect(katexBox.querySelector("img")).toBeNull();
    expect(katexBox.textContent).toContain("<img src=x onerror=alert(1)>");

    handle.destroy();
  });
});
